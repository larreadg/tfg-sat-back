@echo off
REM ============================================================================
REM  iniciar-local.bat
REM  Levanta BACKEND (tfg-sat-back) y FRONTEND (tfg-sat-front) sobre HTTPS
REM  usando la IP del Wi-Fi actual, SIN tunel de Cloudflare: todo queda dentro
REM  de la LAN. Si no existe un certificado valido para esa IP, lo genera
REM  (mkcert) ANTES de lanzar los procesos.
REM
REM  Diferencias con start-https.bat (que si abre un tunel):
REM    - No corre cloudflared: no hay URL publica.
REM    - El front apunta al backend por IP (https://<IP>:3000), no al tunel.
REM    - No registra el webhook de Telegram (necesita una URL publica).
REM
REM  Doble clic o: iniciar-local.bat
REM ============================================================================
setlocal
set "PROJ_DIR=%~dp0"
set "BAT_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$l=[IO.File]::ReadAllLines($env:BAT_SELF);$i=[Array]::IndexOf($l,':::PS:::');iex (($l[($i+1)..($l.Count-1)]) -join [Environment]::NewLine)"
goto :eof
:::PS:::
$ErrorActionPreference = 'Stop'

# --- Rutas de los proyectos -------------------------------------------------
$back  = $env:PROJ_DIR.TrimEnd('\')
$front = Join-Path (Split-Path $back -Parent) 'tfg-sat-front'

$backSsl   = Join-Path $back  'ssl'
$frontCert = Join-Path $front 'certs'
$envFile   = Join-Path $back  '.env'
$ang       = Join-Path $front 'angular.json'
$envDev    = Join-Path $front 'src\environments\environment.development.ts'

# UTF-8 SIN BOM: el BOM molesta al parsear JSON/TS con otras herramientas.
function Set-TextNoBom($ruta, $texto) {
  [IO.File]::WriteAllText($ruta, $texto, (New-Object Text.UTF8Encoding($false)))
}

# --- 1) Detectar la IPv4 del Wi-Fi ------------------------------------------
$ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.InterfaceAlias -match 'Wi-?Fi|Wireless|WLAN|Inalambrica' -and $_.IPAddress -notmatch '^169\.254' } |
  Select-Object -First 1 -ExpandProperty IPAddress
if (-not $ip) {
  # Fallback 1: adaptador activo con gateway por defecto (ruta a Internet)
  $cfg = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
  if ($cfg) { $ip = $cfg.IPv4Address.IPAddress }
}
if (-not $ip) {
  # Fallback 2: cualquier direccion de rango privado
  $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)' } |
    Select-Object -First 1 -ExpandProperty IPAddress
}
if (-not $ip) {
  Write-Host '[ERROR] No pude detectar la IP del Wi-Fi. Conectate a una red e intenta de nuevo.' -ForegroundColor Red
  exit 1
}
Write-Host "[i] IP Wi-Fi detectada: $ip" -ForegroundColor Cyan

# --- 2) Certificado: comprobar y (re)generar si hace falta -------------------
New-Item -ItemType Directory -Force -Path $backSsl, $frontCert | Out-Null
$marker      = Join-Path $backSsl   '.cert-ip'
$markerFront = Join-Path $frontCert '.cert-ip'

$certOk = (Test-Path (Join-Path $backSsl   'cert.pem')) -and (Test-Path (Join-Path $backSsl   'key.pem')) -and
          (Test-Path (Join-Path $frontCert 'cert.pem')) -and (Test-Path (Join-Path $frontCert 'key.pem')) -and
          (Test-Path $marker) -and ((Get-Content $marker -Raw).Trim() -eq $ip)

if ($certOk) {
  Write-Host "[i] Certificado existente valido para $ip. Se reutiliza." -ForegroundColor Green
} else {
  Write-Host "[i] No hay certificado para $ip. Generando uno nuevo..." -ForegroundColor Yellow
  if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
    Write-Host '[ERROR] mkcert no esta instalado o no esta en el PATH.' -ForegroundColor Red
    Write-Host '        Instalalo con:  choco install mkcert' -ForegroundColor Red
    exit 1
  }
  # mkcert escribe mensajes en stderr; con EAP='Stop' eso abortaria el script.
  # Bajamos el nivel solo durante las llamadas nativas y descartamos su salida.
  $oldEAP = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  # Asegura que la CA local de mkcert este instalada/confiada (idempotente)
  & mkcert -install 2>&1 | Out-Null
  $tmp = Join-Path $env:TEMP ("tfg-cert-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  Push-Location $tmp
  & mkcert -key-file key.pem -cert-file cert.pem $ip localhost 127.0.0.1 ::1 2>&1 | Out-Null
  Pop-Location
  $ErrorActionPreference = $oldEAP
  if (-not (Test-Path (Join-Path $tmp 'cert.pem'))) {
    Write-Host '[ERROR] mkcert no genero el certificado.' -ForegroundColor Red
    exit 1
  }
  Copy-Item (Join-Path $tmp 'cert.pem') (Join-Path $backSsl   'cert.pem') -Force
  Copy-Item (Join-Path $tmp 'key.pem')  (Join-Path $backSsl   'key.pem')  -Force
  Copy-Item (Join-Path $tmp 'cert.pem') (Join-Path $frontCert 'cert.pem') -Force
  Copy-Item (Join-Path $tmp 'key.pem')  (Join-Path $frontCert 'key.pem')  -Force
  Remove-Item $tmp -Recurse -Force
  # Los dos markers: asi `npm run dev` del front tambien reutiliza este cert.
  Set-Content $marker      $ip -NoNewline -Encoding ascii
  Set-Content $markerFront $ip -NoNewline -Encoding ascii
  Write-Host "[i] Certificado generado para $ip y copiado a back (ssl/) y front (certs/)." -ForegroundColor Green
}

# --- helpers para leer/escribir claves en .env ------------------------------
function Set-EnvVar($c, $k, $v) {
  if ($c -match "(?m)^\s*$k\s*=.*$") { $c -replace "(?m)^\s*$k\s*=.*$", "$k=$v" }
  else { $c.TrimEnd() + "`r`n$k=$v" }
}
function Get-EnvVal($c, $k) {
  $m = [regex]::Match($c, ('(?m)^\s*' + [regex]::Escape($k) + '\s*=\s*"?([^"\r\n]*)"?\s*$'))
  if ($m.Success) { $m.Groups[1].Value.Trim() } else { '' }
}

# --- 3) Backend .env: activar HTTPS y apuntar CORS al front ------------------
$envRaw = ''
if (Test-Path $envFile) {
  $c = [IO.File]::ReadAllText($envFile)
  $c = Set-EnvVar $c 'USE_HTTPS'     'true'
  $c = Set-EnvVar $c 'HOST'          '0.0.0.0'
  $c = Set-EnvVar $c 'SSL_KEY_PATH'  '"ssl/key.pem"'
  $c = Set-EnvVar $c 'SSL_CERT_PATH' '"ssl/cert.pem"'
  $c = Set-EnvVar $c 'CORS_ORIGIN'   ('"https://' + $ip + ':4200"')
  Set-TextNoBom $envFile $c
  $envRaw = $c
  Write-Host "[i] .env actualizado: USE_HTTPS=true, CORS_ORIGIN=https://${ip}:4200" -ForegroundColor Green
} else {
  Write-Host "[AVISO] No existe $envFile . Copialo desde .env.example antes de continuar." -ForegroundColor Yellow
}

# --- 4) Frontend angular.json: allowedHosts con la IP actual ----------------
if (Test-Path $ang) {
  $c = [IO.File]::ReadAllText($ang)
  $repl = '"allowedHosts": ["' + $ip + '", "localhost", "127.0.0.1"]'
  $c = [regex]::Replace($c, '"allowedHosts":\s*\[[^\]]*\]', $repl)
  $c = [regex]::Replace($c, '"ssl":\s*(true|false)', '"ssl": true')
  Set-TextNoBom $ang $c
  Write-Host "[i] Front angular.json -> allowedHosts incluye $ip, ssl=true" -ForegroundColor Green
}

# --- 5) Frontend environment.development.ts: apiUrl -> backend por IP -------
# Sin tunel, el front le habla al backend directo por la IP de la LAN.
$apiUrl = "https://${ip}:3000"
if (Test-Path $envDev) {
  $c = [IO.File]::ReadAllText($envDev)
  if ($c -match "apiUrl:\s*'[^']*'") {
    $c = [regex]::Replace($c, "apiUrl:\s*'[^']*'", "apiUrl: '$apiUrl'")
    Set-TextNoBom $envDev $c
    Write-Host "[i] Front environment.development.ts -> apiUrl $apiUrl" -ForegroundColor Green
  } else {
    Write-Host '[AVISO] No encontre apiUrl en environment.development.ts' -ForegroundColor Yellow
  }
} else {
  Write-Host "[AVISO] No existe $envDev ; se omite." -ForegroundColor Yellow
}

# --- 6) Avisos de la config que este modo afecta ----------------------------
# a) Turnstile: la allowlist del widget solo acepta FQDN. Sirviendo por IP, una
#    sitekey real responde siempre 110200 (domain not authorized); en LAN van
#    las claves de prueba (ver .env.example).
$turnstileResumen = ''
if (Test-Path $envDev) {
  $siteKey = ([regex]::Match([IO.File]::ReadAllText($envDev), "turnstileSiteKey:\s*'([^']*)'")).Groups[1].Value
  $secret  = if ($envRaw) { Get-EnvVal $envRaw 'TURNSTILE_SECRET' } else { '' }
  if (-not $siteKey) {
    Write-Host '[AVISO] turnstileSiteKey vacia en environment.development.ts: los formularios publicos quedan bloqueados.' -ForegroundColor Yellow
    $turnstileResumen = 'Turnstile        : sitekey vacia -> formularios bloqueados'
  } elseif ($siteKey -notmatch '^[123]x0{20}') {
    Write-Host '[AVISO] turnstileSiteKey parece una clave REAL y el front se sirve por IP.' -ForegroundColor Yellow
    Write-Host '        Turnstile solo autoriza dominios (FQDN), no IPs -> va a fallar con err 110200.' -ForegroundColor Yellow
    Write-Host '        Para LAN usa la sitekey de prueba 1x00000000000000000000AA (y su secret en .env).' -ForegroundColor Yellow
    $turnstileResumen = 'Turnstile        : clave real + acceso por IP -> err 110200'
  } elseif ($secret -and $secret -notmatch '^[123]x0{20}') {
    Write-Host '[AVISO] El front usa sitekey de prueba pero TURNSTILE_SECRET parece real: siteverify va a rechazar.' -ForegroundColor Yellow
    Write-Host '        Pone TURNSTILE_SECRET="1x0000000000000000000000000000000AA" en tfg-sat-back\.env' -ForegroundColor Yellow
    $turnstileResumen = 'Turnstile        : sitekey de prueba con secret real -> no coinciden'
  } else {
    $turnstileResumen = 'Turnstile        : claves de prueba (OK para LAN)'
  }
}

# b) Telegram: el webhook necesita URL publica. Sin tunel queda apuntando a
#    donde lo dejo el ultimo start-https.bat (URL muerta): el bot no recibe nada.
$tgResumen = 'Telegram         : deshabilitado'
if ($envRaw -and (Get-EnvVal $envRaw 'TELEGRAM_ENABLED') -eq 'true') {
  Write-Host '[AVISO] TELEGRAM_ENABLED=true pero este modo no abre tunel: el webhook no recibe updates.' -ForegroundColor Yellow
  Write-Host '        Los comandos del bot no van a llegar. Para probarlos, usa start-https.bat.' -ForegroundColor Yellow
  $tgResumen = 'Telegram         : sin tunel, el webhook NO recibe updates'
}

# --- 7) Lanzar backend y frontend en ventanas nuevas ------------------------
Start-Process cmd -ArgumentList '/k', ('title BACKEND-HTTPS && cd /d "'  + $back  + '" && npm run dev')
Write-Host "[i] Backend lanzado (https://${ip}:3000)." -ForegroundColor Green
Start-Process cmd -ArgumentList '/k', ('title FRONTEND-HTTPS && cd /d "' + $front + '" && npm start')
Write-Host '[i] Frontend lanzado.' -ForegroundColor Green

# --- 8) Confirmar que el backend levanto (solo informativo) -----------------
# Polling con curl.exe (NO Invoke-RestMethod): en Windows PowerShell 5.1 el
# cliente .NET falla el handshake TLS contra el cert de mkcert; curl.exe -k lo
# resuelve sin drama (esta en system32 desde Win10 1803).
Write-Host '[i] Esperando que el backend responda en /health ...' -ForegroundColor Yellow
$backendOk = $false
$deadline  = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline -and -not $backendOk) {
  $code = (& curl.exe -k -s -o NUL -w '%{http_code}' --max-time 5 https://localhost:3000/health 2>$null)
  if ($code -eq '200') { $backendOk = $true; break }
  Start-Sleep -Milliseconds 1000
}
if ($backendOk) {
  $backResumen = 'Backend          : OK'
  $backColor   = 'Green'
} else {
  Write-Host '[AVISO] El backend no respondio en 90s. Revisa la ventana BACKEND-HTTPS (DB, .env, puerto ocupado).' -ForegroundColor Red
  $backResumen = 'Backend          : NO responde, revisa la ventana BACKEND-HTTPS'
  $backColor   = 'Red'
}

# --- 9) Resumen -------------------------------------------------------------
Write-Host ''
Write-Host '==========================================================' -ForegroundColor Cyan
Write-Host ' Modo             : LOCAL / LAN (sin tunel Cloudflare)' -ForegroundColor Cyan
Write-Host " Backend          : https://${ip}:3000" -ForegroundColor Cyan
Write-Host " Frontend         : https://${ip}:4200" -ForegroundColor Cyan
Write-Host " API del front    : $apiUrl" -ForegroundColor Cyan
Write-Host " $backResumen" -ForegroundColor $backColor
if ($turnstileResumen) { Write-Host " $turnstileResumen" -ForegroundColor DarkGray }
Write-Host " $tgResumen" -ForegroundColor DarkGray
Write-Host '==========================================================' -ForegroundColor Cyan
Write-Host '[i] Desde otro dispositivo de la red: instala ahi la CA de mkcert o acepta una vez' -ForegroundColor DarkGray
Write-Host "    la advertencia del certificado entrando a https://${ip}:3000/health antes de usar el front." -ForegroundColor DarkGray

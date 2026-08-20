@echo off
REM ============================================================================
REM  start-https.bat
REM  Levanta BACKEND (tfg-sat-back) y FRONTEND (tfg-sat-front) sobre HTTPS
REM  usando la IP del Wi-Fi actual. Si no existe un certificado valido para
REM  esa IP, lo genera (mkcert) ANTES de lanzar los procesos.
REM
REM  Doble clic o: start-https.bat
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

# --- 1) Detectar la IPv4 del Wi-Fi ------------------------------------------
$ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.InterfaceAlias -match 'Wi-?Fi|Wireless|WLAN' -and $_.IPAddress -notmatch '^169\.254' } |
  Select-Object -First 1 -ExpandProperty IPAddress
if (-not $ip) {
  # Fallback: adaptador activo con gateway por defecto (ruta a Internet)
  $cfg = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
  if ($cfg) { $ip = $cfg.IPv4Address.IPAddress }
}
if (-not $ip) {
  Write-Host '[ERROR] No pude detectar la IP del Wi-Fi. Conectate a una red e intenta de nuevo.' -ForegroundColor Red
  exit 1
}
Write-Host "[i] IP Wi-Fi detectada: $ip" -ForegroundColor Cyan

# --- 2) Certificado: comprobar y (re)generar si hace falta -------------------
$backSsl   = Join-Path $back  'ssl'
$frontCert = Join-Path $front 'certs'
New-Item -ItemType Directory -Force -Path $backSsl, $frontCert | Out-Null
$marker = Join-Path $backSsl '.cert-ip'

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
  Set-Content $marker $ip -NoNewline -Encoding ascii
  Write-Host "[i] Certificado generado para $ip y copiado a back (ssl/) y front (certs/)." -ForegroundColor Green
}

# --- helper para escribir/actualizar claves en .env -------------------------
function Set-EnvVar($c, $k, $v) {
  if ($c -match "(?m)^\s*$k\s*=.*$") { $c -replace "(?m)^\s*$k\s*=.*$", "$k=$v" }
  else { $c.TrimEnd() + "`r`n$k=$v" }
}

# --- 3) Backend .env: activar HTTPS y apuntar CORS al front ------------------
$envFile = Join-Path $back '.env'
if (Test-Path $envFile) {
  $c = Get-Content $envFile -Raw
  $c = Set-EnvVar $c 'USE_HTTPS'     'true'
  $c = Set-EnvVar $c 'HOST'          '0.0.0.0'
  $c = Set-EnvVar $c 'SSL_KEY_PATH'  '"ssl/key.pem"'
  $c = Set-EnvVar $c 'SSL_CERT_PATH' '"ssl/cert.pem"'
  $c = Set-EnvVar $c 'CORS_ORIGIN'   ('"https://' + $ip + ':4200"')
  Set-Content $envFile $c -NoNewline -Encoding UTF8
  Write-Host "[i] .env actualizado: USE_HTTPS=true, CORS_ORIGIN=https://${ip}:4200" -ForegroundColor Green
} else {
  Write-Host "[AVISO] No existe $envFile . Copialo desde .env.example antes de continuar." -ForegroundColor Yellow
}

# --- 4) Frontend environment.development.ts: apuntar apiUrl al backend -------
$envDev = Join-Path $front 'src\environments\environment.development.ts'
if (Test-Path $envDev) {
  $c = Get-Content $envDev -Raw
  $c = $c -replace "apiUrl:\s*'[^']*'", ("apiUrl: 'https://" + $ip + ":3000'")
  Set-Content $envDev $c -NoNewline -Encoding UTF8
  Write-Host "[i] Front environment.development.ts -> apiUrl https://${ip}:3000" -ForegroundColor Green
}

# --- 5) Frontend angular.json: allowedHosts con la IP actual ----------------
$ang = Join-Path $front 'angular.json'
if (Test-Path $ang) {
  $c = Get-Content $ang -Raw
  $repl = '"allowedHosts": ["' + $ip + '", "localhost", "127.0.0.1"]'
  $c = $c -replace '"allowedHosts":\s*\[[^\]]*\]', $repl
  Set-Content $ang $c -NoNewline -Encoding UTF8
  Write-Host "[i] Front angular.json -> allowedHosts incluye $ip" -ForegroundColor Green
}

# --- 6) Lanzar ambos procesos en ventanas nuevas ----------------------------
Write-Host ''
Write-Host '==========================================================' -ForegroundColor Cyan
Write-Host " Backend : https://${ip}:3000" -ForegroundColor Cyan
Write-Host " Frontend: https://${ip}:4200" -ForegroundColor Cyan
Write-Host '==========================================================' -ForegroundColor Cyan
Start-Process cmd -ArgumentList '/k', ('title BACKEND-HTTPS && cd /d "'  + $back  + '" && npm run dev')
Start-Process cmd -ArgumentList '/k', ('title FRONTEND-HTTPS && cd /d "' + $front + '" && npm start')
Write-Host '[i] Backend y frontend lanzados en ventanas nuevas.' -ForegroundColor Green

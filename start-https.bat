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

# --- 4) Frontend angular.json: allowedHosts con la IP actual ----------------
$ang = Join-Path $front 'angular.json'
if (Test-Path $ang) {
  $c = Get-Content $ang -Raw
  $repl = '"allowedHosts": ["' + $ip + '", "localhost", "127.0.0.1"]'
  $c = $c -replace '"allowedHosts":\s*\[[^\]]*\]', $repl
  Set-Content $ang $c -NoNewline -Encoding UTF8
  Write-Host "[i] Front angular.json -> allowedHosts incluye $ip" -ForegroundColor Green
}

# --- 5) Lanzar el backend en una ventana nueva ------------------------------
Start-Process cmd -ArgumentList '/k', ('title BACKEND-HTTPS && cd /d "'  + $back  + '" && npm run dev')
Write-Host '[i] Backend lanzado (https://localhost:3000).' -ForegroundColor Green

# --- 6) Tunnel gratuito de Cloudflare hacia el backend ----------------------
# Quick tunnel: URL publica aleatoria *.trycloudflare.com, sin login ni cuenta.
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host '[ERROR] cloudflared no esta instalado o no esta en el PATH.' -ForegroundColor Red
  Write-Host '        Instalalo con:  winget install --id Cloudflare.cloudflared' -ForegroundColor Red
  exit 1
}
$cfOut = Join-Path $env:TEMP ('cloudflared-tfg-' + [guid]::NewGuid().ToString('N') + '.log')
$cfErr = "$cfOut.err"
# Origen HTTPS local con cert mkcert -> --no-tls-verify para que cloudflared no lo rechace.
Start-Process cloudflared -ArgumentList 'tunnel','--no-autoupdate','--no-tls-verify','--url','https://localhost:3000' -RedirectStandardOutput $cfOut -RedirectStandardError $cfErr -WindowStyle Minimized

Write-Host '[i] Esperando URL publica de Cloudflare...' -ForegroundColor Yellow
$tunnelUrl = $null
$deadline  = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline -and -not $tunnelUrl) {
  Start-Sleep -Milliseconds 800
  foreach ($f in @($cfErr, $cfOut)) {
    if (Test-Path $f) {
      $txt = Get-Content $f -Raw -ErrorAction SilentlyContinue
      if ($txt) {
        $m = [regex]::Match($txt, 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($m.Success) { $tunnelUrl = $m.Value; break }
      }
    }
  }
}
if (-not $tunnelUrl) {
  Write-Host '[ERROR] No obtuve la URL del tunnel Cloudflare (timeout 60s).' -ForegroundColor Red
  Write-Host "        Revisa el log: $cfErr" -ForegroundColor Red
  exit 1
}
Write-Host "[i] Tunnel Cloudflare: $tunnelUrl  ->  https://localhost:3000" -ForegroundColor Green

# --- 7) Frontend environment.development.ts: apiUrl -> URL del tunnel --------
$envDev = Join-Path $front 'src\environments\environment.development.ts'
if (Test-Path $envDev) {
  $c = Get-Content $envDev -Raw
  $c = $c -replace "apiUrl:\s*'[^']*'", ("apiUrl: '" + $tunnelUrl + "'")
  Set-Content $envDev $c -NoNewline -Encoding UTF8
  Write-Host "[i] Front environment.development.ts -> apiUrl $tunnelUrl" -ForegroundColor Green
}

# --- 7.5) Registrar el webhook de Telegram contra la URL del tunnel ---------
# Este bloque NUNCA debe impedir que se levanten back y front: cualquier fallo o
# config faltante se avisa y se saltea. El token se lee del .env (nunca del bat)
# y se enmascara en toda salida por consola.
$tgResumen = 'Telegram         : deshabilitado'
$tgColor   = 'DarkGray'
$tgToken   = ''
try {
  function Get-EnvVal($content, $key) {
    $m = [regex]::Match($content, ('(?m)^\s*' + [regex]::Escape($key) + '\s*=\s*"?([^"\r\n]*)"?\s*$'))
    if ($m.Success) { $m.Groups[1].Value.Trim() } else { '' }
  }
  $envRaw = if (Test-Path $envFile) { Get-Content $envFile -Raw } else { '' }
  $tgEnabled = Get-EnvVal $envRaw 'TELEGRAM_ENABLED'
  $tgToken   = Get-EnvVal $envRaw 'TELEGRAM_BOT_TOKEN'
  $tgSecret  = Get-EnvVal $envRaw 'TELEGRAM_WEBHOOK_SECRET'
  $tgPath    = Get-EnvVal $envRaw 'TELEGRAM_WEBHOOK_PATH'
  if (-not $tgPath) { $tgPath = '/api/v1/telegram/webhook' }
  $tgMask = if ($tgToken) { ($tgToken.Split(':')[0]) + ':****' } else { '' }

  if ($tgEnabled -ne 'true') {
    Write-Host '[i] Telegram deshabilitado (TELEGRAM_ENABLED != true). Se saltea el webhook.' -ForegroundColor DarkGray
  } elseif (-not $tgToken -or -not $tgSecret) {
    Write-Host '[AVISO] Falta TELEGRAM_BOT_TOKEN o TELEGRAM_WEBHOOK_SECRET en .env. Se saltea el webhook.' -ForegroundColor Yellow
    $tgResumen = 'Telegram         : sin configurar (falta token/secret)'
    $tgColor   = 'Yellow'
  } else {
    Write-Host '[i] Esperando que el backend responda en https://localhost:3000/health ...' -ForegroundColor Yellow
    # Polling con curl.exe (NO Invoke-RestMethod): en Windows PowerShell 5.1 el
    # cliente .NET falla el handshake TLS contra el backend local con cert mkcert;
    # curl.exe -k (esta en system32 desde Win10 1803) lo resuelve sin drama.
    $backendOk = $false
    $deadlineB = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadlineB -and -not $backendOk) {
      $code = (& curl.exe -k -s -o NUL -w '%{http_code}' https://localhost:3000/health 2>$null)
      if ($code -eq '200') { $backendOk = $true; break }
      Start-Sleep -Milliseconds 1000
    }

    if (-not $backendOk) {
      Write-Host '[AVISO] El backend no respondio a tiempo. Se saltea el registro del webhook.' -ForegroundColor Red
      $tgResumen = 'Telegram         : backend no respondio, webhook NO registrado'
      $tgColor   = 'Red'
    } else {
      $webhookUrl = $tunnelUrl + $tgPath

      # Esperar a que el tunnel sea alcanzable DESDE INTERNET antes de registrar.
      # Un hostname *.trycloudflare.com recien creado tarda unos segundos en
      # resolver globalmente (DNS + edge de Cloudflare); si llamamos setWebhook
      # antes, Telegram falla con "Failed to resolve host". Sondear el /health
      # publico del tunnel es la senal correcta de que ya esta listo.
      Write-Host "[i] Esperando que el tunnel resuelva y responda: $tunnelUrl/health ..." -ForegroundColor Yellow
      $tunnelOk = $false
      $deadlineT = (Get-Date).AddSeconds(120)
      while ((Get-Date) -lt $deadlineT -and -not $tunnelOk) {
        $code = (& curl.exe -s -o NUL -w '%{http_code}' --max-time 8 ($tunnelUrl + '/health') 2>$null)
        if ($code -eq '200') { $tunnelOk = $true; break }
        Start-Sleep -Seconds 2
      }

      if (-not $tunnelOk) {
        Write-Host '[AVISO] El tunnel no respondio publicamente a tiempo. Se saltea el webhook.' -ForegroundColor Red
        $tgResumen = 'Telegram         : tunnel no alcanzable, webhook NO registrado'
        $tgColor   = 'Red'
      } else {
        $setBody = @{
          url                  = $webhookUrl
          secret_token         = $tgSecret
          allowed_updates      = @('message', 'callback_query')
          drop_pending_updates = $true
        } | ConvertTo-Json -Compress

        # El tunnel ya responde publicamente; setWebhook deberia resolver. Igual
        # dejamos un par de reintentos por si la propagacion a Telegram tarda.
        $registrado = $false
        $ultimoError = ''
        for ($intento = 1; $intento -le 4 -and -not $registrado; $intento++) {
          try {
            Invoke-RestMethod -Method Post -Uri ("https://api.telegram.org/bot$tgToken/setWebhook") -Body $setBody -ContentType 'application/json' | Out-Null
            $registrado = $true
          } catch {
            $ultimoError = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
            if ($tgToken) { $ultimoError = $ultimoError.Replace($tgToken, 'bot:****') }
            Write-Host "[i] setWebhook intento $intento fallo: $ultimoError. Reintento en 4s..." -ForegroundColor DarkYellow
            Start-Sleep -Seconds 4
          }
        }

        if (-not $registrado) {
          Write-Host "[AVISO] No se pudo registrar el webhook tras varios intentos: $ultimoError" -ForegroundColor Red
          $tgResumen = "Telegram         : setWebhook fallo ($ultimoError)"
          $tgColor   = 'Red'
        } else {
          Start-Sleep -Seconds 1
          $info = Invoke-RestMethod -Uri ("https://api.telegram.org/bot$tgToken/getWebhookInfo")
          $r = $info.result
          $pend = [int]$r.pending_update_count
          $lastErr = "$($r.last_error_message)"
          if ($r.url -eq $webhookUrl -and $pend -eq 0 -and [string]::IsNullOrEmpty($lastErr)) {
            Write-Host "[i] Webhook Telegram OK ($tgMask). pending=0, sin errores." -ForegroundColor Green
            $tgResumen = "Telegram         : OK ($tgMask) -> $webhookUrl"
            $tgColor   = 'Green'
          } else {
            $motivo = if ($r.url -ne $webhookUrl) { 'la URL no coincide' } elseif ($pend -ne 0) { "pending=$pend" } elseif ($lastErr) { $lastErr } else { 'desconocido' }
            Write-Host "[AVISO] Webhook Telegram con observaciones ($tgMask): $motivo" -ForegroundColor Red
            $tgResumen = "Telegram         : revisar ($motivo)"
            $tgColor   = 'Red'
          }
        }
      }
    }
  }
} catch {
  $msg = $_.Exception.Message
  if ($tgToken) { $msg = $msg.Replace($tgToken, 'bot:****') }
  Write-Host "[AVISO] No se pudo registrar el webhook de Telegram: $msg" -ForegroundColor Red
  $tgResumen = 'Telegram         : error al registrar (ver arriba)'
  $tgColor   = 'Red'
}

# --- 8) Lanzar el frontend en una ventana nueva -----------------------------
Write-Host ''
Write-Host '==========================================================' -ForegroundColor Cyan
Write-Host " Backend (local)  : https://${ip}:3000" -ForegroundColor Cyan
Write-Host " Backend (publico): $tunnelUrl" -ForegroundColor Cyan
Write-Host " Frontend         : https://${ip}:4200" -ForegroundColor Cyan
Write-Host " $tgResumen" -ForegroundColor $tgColor
Write-Host '==========================================================' -ForegroundColor Cyan
Start-Process cmd -ArgumentList '/k', ('title FRONTEND-HTTPS && cd /d "' + $front + '" && npm start')
Write-Host '[i] Frontend lanzado. El tunnel corre en una ventana minimizada (cloudflared).' -ForegroundColor Green

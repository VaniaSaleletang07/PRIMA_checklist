$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendRoot = Join-Path $projectRoot 'backend'
$frontendRoot = Join-Path $projectRoot 'frontend'
$php = 'C:\xampp\php\php.exe'
$postgresBin = 'C:\Program Files\PostgreSQL\18\bin'
$postgresData = Join-Path $backendRoot 'storage\postgres'
$runtimeTemp = Join-Path $backendRoot 'storage\framework\cache'
$logDirectory = Join-Path $backendRoot 'storage\logs'

foreach ($required in @($php, (Join-Path $postgresBin 'pg_ctl.exe'), (Join-Path $frontendRoot 'package.json'))) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Komponen tidak ditemukan: $required"
    }
}

New-Item -ItemType Directory -Force -Path $runtimeTemp, $logDirectory | Out-Null

& (Join-Path $postgresBin 'pg_isready.exe') -h 127.0.0.1 -p 55432 | Out-Null
if ($LASTEXITCODE -ne 0) {
    & (Join-Path $postgresBin 'pg_ctl.exe') start -D $postgresData -l (Join-Path $logDirectory 'postgres.log')
}

try {
    Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8000/api/v1/verify/health-check' -TimeoutSec 2 | Out-Null
} catch {
    if (-not $_.Exception.Response) {
        Start-Process -FilePath $php -ArgumentList @('-d', 'extension=php_pdo_pgsql.dll', '-d', 'extension=php_zip.dll', '-d', "sys_temp_dir=$runtimeTemp", '-S', '127.0.0.1:8000', 'router.php') -WorkingDirectory (Join-Path $backendRoot 'public') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'server-output.log') -RedirectStandardError (Join-Path $logDirectory 'server-error.log')
    }
}

try {
    Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5173' -TimeoutSec 2 | Out-Null
} catch {
    Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev', '--', '--host', '127.0.0.1') -WorkingDirectory $frontendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'vite-output.log') -RedirectStandardError (Join-Path $logDirectory 'vite-error.log')
}

$schedulerPidFile = Join-Path $logDirectory 'scheduler.pid'
$schedulerRunning = $false
if (Test-Path -LiteralPath $schedulerPidFile) {
    $schedulerPid = Get-Content -LiteralPath $schedulerPidFile -ErrorAction SilentlyContinue
    $schedulerRunning = $schedulerPid -and (Get-Process -Id $schedulerPid -ErrorAction SilentlyContinue)
}
if (-not $schedulerRunning) {
    $scheduler = Start-Process -FilePath $php -ArgumentList @('-d', 'extension=php_pdo_pgsql.dll', '-d', "sys_temp_dir=$runtimeTemp", (Join-Path $backendRoot 'artisan'), 'schedule:work') -WorkingDirectory $backendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'scheduler-output.log') -RedirectStandardError (Join-Path $logDirectory 'scheduler-error.log') -PassThru
    $scheduler.Id | Set-Content -LiteralPath $schedulerPidFile
}

Write-Host 'PRIMA dijalankan.' -ForegroundColor Green
Write-Host 'Frontend : http://127.0.0.1:5173'
Write-Host 'API      : http://127.0.0.1:8000/api/v1'

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$composeFile = Join-Path $projectRoot 'compose.yaml'
$dockerEnvFile = Join-Path $projectRoot '.env.docker'
$dockerEnvExample = Join-Path $projectRoot '.env.docker.example'
$composeProject = 'prima-hsse'

$dockerBinCandidates = @(
    'C:\Program Files\Docker\Docker\resources\bin',
    (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Docker\Docker\resources\bin')
)
$dockerBin = $dockerBinCandidates |
    Where-Object { Test-Path -LiteralPath (Join-Path $_ 'docker.exe') } |
    Select-Object -First 1

if ($dockerBin) {
    $env:Path = "$dockerBin;$env:Path"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker Desktop belum terpasang. Jalankan scripts\setup-docker-windows.ps1 sebagai Administrator.'
}

$dockerDesktop = @(
    'C:\Program Files\Docker\Docker\Docker Desktop.exe',
    (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Docker\Docker\Docker Desktop.exe')
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (-not (docker info 2>$null)) {
    if (-not $dockerDesktop) {
        throw 'Docker Desktop tidak ditemukan.'
    }

    Write-Host 'Menjalankan Docker Desktop...'
    Start-Process -FilePath $dockerDesktop
    Write-Host 'Menunggu Docker Engine siap...'

    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Seconds 5
        if (docker info 2>$null) {
            $ready = $true
            break
        }
    }

    if (-not $ready) {
        throw 'Docker Engine belum siap setelah 5 menit. Periksa jendela Docker Desktop.'
    }
}

if (-not (Test-Path -LiteralPath $dockerEnvFile)) {
    Copy-Item -LiteralPath $dockerEnvExample -Destination $dockerEnvFile
}

Set-Location -LiteralPath $projectRoot
docker compose --project-name $composeProject --env-file $dockerEnvFile --file $composeFile up --detach
if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose gagal dengan exit code $LASTEXITCODE."
}

docker compose --project-name $composeProject --env-file $dockerEnvFile --file $composeFile ps
Write-Host ''
Write-Host 'PRIMA aktif di http://localhost:8080' -ForegroundColor Green

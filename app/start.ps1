# osien-app launcher (Windows)
$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir
Write-Host "Starting OSIEN Control Center..."
$proc = Start-Process -FilePath "node" -ArgumentList "server.js" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2
Start-Process "http://localhost:4096"
Write-Host "App running at http://localhost:4096"
Write-Host "Press Ctrl+C to stop."
try { Wait-Process -Id $proc.Id } catch {}

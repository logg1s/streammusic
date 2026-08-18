$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repo = Split-Path -Parent $PSScriptRoot
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$artifacts = Join-Path ([System.IO.Path]::GetTempPath()) "vong-e2e\$stamp"
New-Item -ItemType Directory -Path $artifacts -Force | Out-Null

$projectId = "autumn-pine-94739672"
$branchName = "e2e-local"
$audioPort = 41731
$webOrigin = "http://127.0.0.1:3000"
$processes = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()

function Start-LoggedProcess {
  param(
    [Parameter(Mandatory)] [string] $Name,
    [Parameter(Mandatory)] [string] $FilePath,
    [Parameter(Mandatory)] [string[]] $ArgumentList,
    [Parameter(Mandatory)] [string] $WorkingDirectory
  )
  $stdout = Join-Path $artifacts "$Name.stdout.log"
  $stderr = Join-Path $artifacts "$Name.stderr.log"
  $process = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList `
    -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  $processes.Add($process)
  return $process
}

function Wait-Http {
  param([Parameter(Mandatory)] [string] $Url, [int] $TimeoutSec = 120)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  } while ((Get-Date) -lt $deadline)
  throw "Hết thời gian chờ $Url"
}

function Stop-Tree {
  param([System.Diagnostics.Process] $Process)
  if ($null -eq $Process -or $Process.HasExited) { return }
  Start-Process -FilePath "taskkill.exe" -ArgumentList @("/PID", [string]$Process.Id, "/T", "/F") `
    -WindowStyle Hidden -Wait | Out-Null
}

try {
  Push-Location $repo

  $branches = (& npx.cmd neon branches list --project-id $projectId --output json | Out-String) | ConvertFrom-Json
  if (-not ($branches | Where-Object { $_.name -eq $branchName })) {
    & npx.cmd neon branches create --project-id $projectId --name $branchName --schema-only --output json *> (Join-Path $artifacts "neon-create.log")
    if ($LASTEXITCODE -ne 0) { throw "Không tạo được Neon branch $branchName" }
  }

  $databaseUrl = (& npx.cmd neon connection-string $branchName --project-id $projectId --pooled --output json | Out-String).Trim()
  if (-not $databaseUrl.StartsWith("postgresql://")) { throw "Neon không trả connection string hợp lệ" }
  $env:DATABASE_URL = $databaseUrl
  $env:AUTH_URL = $webOrigin
  $env:NEXTAUTH_URL = $webOrigin
  $env:VONG_E2E_AUDIO_PORT = [string]$audioPort
  $env:VONG_E2E_ARTIFACTS = $artifacts
  $env:VONG_E2E_WEB_ORIGIN = $webOrigin
  $stateFile = Join-Path $artifacts "fixture.json"
  $env:VONG_E2E_STATE_FILE = $stateFile

  $audio = Start-LoggedProcess -Name "audio" -FilePath "npx.cmd" `
    -ArgumentList @("tsx", "scripts/e2e-audio-server.ts") -WorkingDirectory $repo
  Wait-Http "http://127.0.0.1:$audioPort/health" 30

  $web = Start-LoggedProcess -Name "next" -FilePath "npx.cmd" `
    -ArgumentList @("dotenv", "-e", ".env.local", "--", "next", "dev", "--hostname", "127.0.0.1", "--port", "3000") `
    -WorkingDirectory $repo
  Wait-Http "$webOrigin/login" 180

  & npx.cmd dotenv -e .env.local -- tsx scripts/e2e-fixture.ts seed --output $stateFile `
    *> (Join-Path $artifacts "fixture-seed.log")
  if ($LASTEXITCODE -ne 0) { throw "Không nạp được fixture E2E" }

  Write-Host "[1/3] Web Playwright"
  $webTestLog = Join-Path $artifacts "web-e2e.log"
  $webTestErr = Join-Path $artifacts "web-e2e.stderr.log"
  $webTest = Start-Process -FilePath "npx.cmd" -ArgumentList @("playwright", "test") `
    -WorkingDirectory $repo -WindowStyle Hidden -PassThru -Wait `
    -RedirectStandardOutput $webTestLog -RedirectStandardError $webTestErr
  Get-Content $webTestLog
  if ($webTest.ExitCode -ne 0) {
    if (Test-Path $webTestErr) { Get-Content $webTestErr }
    throw "Web E2E thất bại"
  }

  Write-Host "[2/3] Android ADB"
  $oldErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & pwsh.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "scripts\e2e-android.ps1") `
    -Artifacts $artifacts -StateFile $stateFile
  $androidExit = $LASTEXITCODE
  $ErrorActionPreference = $oldErrorPreference
  if ($androidExit -ne 0) {
    throw "Android E2E thất bại"
  }

  Write-Host "[3/3] Windows WebView2 CDP"
  # Tauri's remote capability intentionally grants native audio commands only to
  # the configured dev origin, which is localhost (not the equivalent 127.0.0.1).
  $env:VONG_E2E_WEB_ORIGIN = "http://localhost:3000"
  $env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $artifacts "webview2-profile"
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9223"
  $env:VONG_E2E_CDP = "http://127.0.0.1:9223"
  $tauri = Start-LoggedProcess -Name "tauri" -FilePath "npx.cmd" `
    -ArgumentList @("tauri", "dev", "--no-watch") -WorkingDirectory $repo
  Wait-Http "http://127.0.0.1:9223/json/version" 240

  $windowsLog = Join-Path $artifacts "windows-e2e.log"
  $windowsErr = Join-Path $artifacts "windows-e2e.stderr.log"
  $windowsTest = Start-Process -FilePath "npx.cmd" -ArgumentList @("tsx", "e2e/windows/webview2.ts") `
    -WorkingDirectory $repo -WindowStyle Hidden -PassThru -Wait `
    -RedirectStandardOutput $windowsLog -RedirectStandardError $windowsErr
  if ($windowsTest.ExitCode -ne 0) {
    if (Test-Path $windowsErr) { Get-Content $windowsErr }
    throw "Windows E2E thất bại"
  }

  Write-Host "Artifacts: $artifacts"
} catch {
  Write-Error "E2E thất bại: $($_.Exception.Message). Artifacts: $artifacts"
  exit 1
} finally {
  foreach ($process in $processes) { Stop-Tree $process }
  Pop-Location
}

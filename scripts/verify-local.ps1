$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

function Invoke-CheckedStep {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Command
    )

    Write-Host ""
    Write-Host "==> $Name" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE"
    }
}

Push-Location $repoRoot
try {
    Invoke-CheckedStep "Web and shared typecheck" { npm run typecheck }
    Invoke-CheckedStep "Web and shared lint" { npx eslint . }
    Invoke-CheckedStep "Unit tests" { npm test }
    Invoke-CheckedStep "Production web build" { npm run build }

    Push-Location (Join-Path $repoRoot "mobile")
    try {
        Invoke-CheckedStep "Mobile typecheck" { npx tsc --noEmit }
        Invoke-CheckedStep "Mobile lint" { npx eslint . }
    }
    finally {
        Pop-Location
    }

    Push-Location (Join-Path $repoRoot "src-tauri")
    try {
        Invoke-CheckedStep "Windows Rust clippy" { cargo clippy }
    }
    finally {
        Pop-Location
    }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "Local verification passed." -ForegroundColor Green

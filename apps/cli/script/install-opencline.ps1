$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$installDir = Join-Path $env:LOCALAPPDATA "OpenCline"
$sourceExe = Join-Path $repoRoot "apps\cli\dist\cli-windows-x64\bin\cline.exe"
$targetExe = Join-Path $installDir "opencline.exe"

# Updating a running Windows executable is not allowed. Detect this before spending
# time rebuilding, and leave the running session untouched.
$runningPids = @()
Get-Process -Name "opencline" -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        if ($_.Path -and ($_.Path -ieq $targetExe)) {
            $runningPids += $_.Id
        }
    } catch {
        # Some Windows processes do not expose their executable path.
    }
}
if ($runningPids.Count -gt 0) {
    throw "OpenCline is still running (PID: $($runningPids -join ', ')). Close those sessions, then rerun: bun run install:opencline"
}

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    throw "Bun is required to build OpenCline. Install Bun first: https://bun.sh"
}

Push-Location $repoRoot
try {
    Write-Host "Building OpenCline for Windows x64..."
    & bun run apps/cli/script/build.ts --single
    if ($LASTEXITCODE -ne 0) {
        throw "OpenCline build failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

if (-not (Test-Path $sourceExe)) {
    throw "Build completed but the expected executable was not found: $sourceExe"
}

New-Item -ItemType Directory -Path $installDir -Force | Out-Null

# Stage the new binary first so a failed update never leaves a partial executable.
$stagedExe = Join-Path $installDir "opencline.exe.new"
Copy-Item -LiteralPath $sourceExe -Destination $stagedExe -Force

$installed = $false
for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
        Move-Item -LiteralPath $stagedExe -Destination $targetExe -Force -ErrorAction Stop
        $installed = $true
        break
    } catch {
        if ($attempt -lt 3) {
            Start-Sleep -Seconds 2
        }
    }
}

if (-not $installed) {
    Remove-Item -LiteralPath $stagedExe -Force -ErrorAction SilentlyContinue
    $runningPids = @()
    Get-Process -Name "opencline" -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            if ($_.Path -and ($_.Path -ieq $targetExe)) {
                $runningPids += $_.Id
            }
        } catch {
            # Some Windows processes do not expose their executable path.
        }
    }

    if ($runningPids.Count -gt 0) {
        throw "Could not update $targetExe because OpenCline is still running (PID: $($runningPids -join ', ')). Close those sessions and rerun: bun run install:opencline"
    }
    throw "Could not replace $targetExe because another process is using it. Close any OpenCline terminals, then rerun: bun run install:opencline"
}

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$pathEntries = @($userPath -split ";" | Where-Object { $_ })
if (-not ($pathEntries | Where-Object { $_.TrimEnd('\\') -ieq $installDir.TrimEnd('\\') })) {
    $newUserPath = (@($pathEntries) + $installDir) -join ";"
    [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
}

if (-not (($env:Path -split ";") | Where-Object { $_.TrimEnd('\\') -ieq $installDir.TrimEnd('\\') })) {
    $env:Path = "$installDir;$env:Path"
}

Write-Host "Installed: $targetExe"
Write-Host "Checking executable..."
& $targetExe --version
if ($LASTEXITCODE -ne 0) {
    throw "OpenCline executable failed its version check"
}
Write-Host "Done. In a new terminal, run: opencline"

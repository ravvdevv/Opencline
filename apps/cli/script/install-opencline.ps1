$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$installDir = Join-Path $env:LOCALAPPDATA "OpenCline"
$sourceExe = Join-Path $repoRoot "apps\cli\dist\cli-windows-x64\bin\cline.exe"
$targetExe = Join-Path $installDir "opencline.exe"

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
Copy-Item -LiteralPath $sourceExe -Destination $targetExe -Force

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

# Install the latest published OpenCline Windows x64 release.
# Usage from the repository root:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\apps\cli\script\install-opencline-release.ps1

$ErrorActionPreference = "Stop"
$repo = "ravvdevv/opencline"
$installDir = Join-Path $env:LOCALAPPDATA "OpenCline"
$targetExe = Join-Path $installDir "opencline.exe"
$assetName = "opencline-windows-x64.exe"
$checksumName = "$assetName.sha256"
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("opencline-install-" + [guid]::NewGuid().ToString("N"))

function Add-UserPath([string]$Directory) {
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $entries = @($currentPath -split ";" | Where-Object { $_ })
    if (-not ($entries | Where-Object { $_.TrimEnd("\") -ieq $Directory.TrimEnd("\") })) {
        [Environment]::SetEnvironmentVariable("Path", (($entries + $Directory) -join ";"), "User")
        Write-Host "Added $Directory to your user PATH. Open a new terminal to use it."
    }
}

function Assert-OpenClineNotRunning([string]$ExecutablePath) {
    $running = Get-Process -Name "opencline" -ErrorAction SilentlyContinue
    foreach ($process in $running) {
        try {
            if ($process.Path -and $process.Path -ieq $ExecutablePath) {
                throw "OpenCline is running (PID $($process.Id)). Close it before updating."
            }
        } catch {
            if ($_.Exception.Message -like "OpenCline is running*") { throw }
            # Access to Process.Path can be denied for unrelated elevated processes.
        }
    }
}

try {
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    $headers = @{ "User-Agent" = "OpenCline-release-installer"; "Accept" = "application/vnd.github+json" }
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers $headers
    $asset = $release.assets | Where-Object { $_.name -eq $assetName } | Select-Object -First 1
    $checksumAsset = $release.assets | Where-Object { $_.name -eq $checksumName } | Select-Object -First 1

    if (-not $asset -or -not $checksumAsset) {
        throw "The latest GitHub Release does not contain the expected executable and checksum. Check https://github.com/$repo/releases."
    }

    $downloadExe = Join-Path $tempDir $assetName
    $downloadChecksum = Join-Path $tempDir $checksumName
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $downloadExe -Headers @{ "User-Agent" = "OpenCline-release-installer" } -UseBasicParsing
    Invoke-WebRequest -Uri $checksumAsset.browser_download_url -OutFile $downloadChecksum -Headers @{ "User-Agent" = "OpenCline-release-installer" } -UseBasicParsing

    $expectedHash = ((Get-Content $downloadChecksum -Raw).Trim() -split "\s+")[0].ToLowerInvariant()
    if ($expectedHash -notmatch "^[0-9a-f]{64}$") {
        throw "The release checksum file is malformed."
    }
    $actualHash = (Get-FileHash -LiteralPath $downloadExe -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) {
        throw "SHA-256 verification failed. The downloaded executable was not installed."
    }

    $downloadVersion = (& $downloadExe --version | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $downloadVersion) {
        throw "The downloaded executable failed its version check. The existing installation was left unchanged."
    }

    Assert-OpenClineNotRunning $targetExe
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
    $stagedExe = "$targetExe.new"
    Copy-Item -LiteralPath $downloadExe -Destination $stagedExe -Force

    $installed = $false
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            Move-Item -LiteralPath $stagedExe -Destination $targetExe -Force
            $installed = $true
            break
        } catch {
            if ($attempt -lt 3) { Start-Sleep -Seconds 2 }
        }
    }

    if (-not $installed) {
        Remove-Item -LiteralPath $stagedExe -Force -ErrorAction SilentlyContinue
        Assert-OpenClineNotRunning $targetExe
        throw "Could not replace $targetExe. Close apps that may be locking the file, then rerun this installer."
    }

    Add-UserPath $installDir
    $version = (& $targetExe --version | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $version) {
        throw "The executable was installed but its version check failed. Inspect $targetExe before running it."
    }

    Write-Host "Installed OpenCline $version to $targetExe"
    Write-Host "Verified SHA-256: $actualHash"
} finally {
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}

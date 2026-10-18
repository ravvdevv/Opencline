# Install the latest published OpenCline Windows x64 release.
# Usage:
#   irm https://raw.githubusercontent.com/ravvdevv/Opencline/main/apps/cli/script/install-opencline-release.ps1 | iex

$ErrorActionPreference = "Stop"
$repo = "ravvdevv/opencline"
$installDir = Join-Path $env:LOCALAPPDATA "OpenCline"
$targetExe = Join-Path $installDir "opencline.exe"
$assetName = "opencline-windows-x64.exe"
$checksumName = "$assetName.sha256"
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("opencline-install-" + [guid]::NewGuid().ToString("N"))

# Windows PowerShell 5.1 does not always load System.Net.Http automatically.
Add-Type -AssemblyName System.Net.Http

function Write-OpenClineHeader {
    Write-Host ""
    Write-Host "  OpenCline" -ForegroundColor Cyan
    Write-Host "  Windows CLI installer" -ForegroundColor DarkGray
    Write-Host "  ----------------------------------------" -ForegroundColor DarkGray
    Write-Host ""
}

function Write-Step([int]$Number, [string]$Message) {
    Write-Host "  [$Number/4] " -NoNewline -ForegroundColor Cyan
    Write-Host $Message
}

function Write-Ok([string]$Message) {
    Write-Host "        OK  " -NoNewline -ForegroundColor Green
    Write-Host $Message
}

function Write-OpenClineDownload([string]$Uri, [string]$Destination, [string]$Label) {
    $client = [System.Net.Http.HttpClient]::new()
    $response = $null
    $inputStream = $null
    $outputStream = $null

    try {
        $client.DefaultRequestHeaders.UserAgent.ParseAdd("OpenCline-release-installer")
        $response = $client.GetAsync($Uri, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        $null = $response.EnsureSuccessStatusCode()
        $totalBytes = $response.Content.Headers.ContentLength
        $inputStream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
        $outputStream = [System.IO.File]::Open($Destination, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        $buffer = New-Object byte[] 65536
        [long]$downloadedBytes = 0
        $lastPercent = -1

        while (($read = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $outputStream.Write($buffer, 0, $read)
            $downloadedBytes += $read

            if ($totalBytes -and $totalBytes -gt 0) {
                $percent = [int][Math]::Floor(($downloadedBytes * 100.0) / $totalBytes)
                if ($percent -ne $lastPercent) {
                    $downloadedMB = [Math]::Round($downloadedBytes / 1MB, 1)
                    $totalMB = [Math]::Round($totalBytes / 1MB, 1)
                    Write-Progress -Activity $Label -Status "$percent%  ($downloadedMB MB of $totalMB MB)" -PercentComplete $percent
                    $lastPercent = $percent
                }
            } else {
                Write-Progress -Activity $Label -Status "$([Math]::Round($downloadedBytes / 1MB, 1)) MB downloaded"
            }
        }

        Write-Progress -Activity $Label -Completed
        if ($totalBytes -and $downloadedBytes -ne $totalBytes) {
            throw "Download was incomplete: received $downloadedBytes of $totalBytes bytes."
        }
    } finally {
        if ($outputStream) { $outputStream.Dispose() }
        if ($inputStream) { $inputStream.Dispose() }
        if ($response) { $response.Dispose() }
        $client.Dispose()
        Write-Progress -Activity $Label -Completed
    }
}

function Add-UserPath([string]$Directory) {
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $entries = @($currentPath -split ";" | Where-Object { $_ })
    if (-not ($entries | Where-Object { $_.TrimEnd("\") -ieq $Directory.TrimEnd("\") })) {
        [Environment]::SetEnvironmentVariable("Path", (($entries + $Directory) -join ";"), "User")
        Write-Host "        Added install folder to your user PATH." -ForegroundColor DarkGray
        Write-Host "        Open a new terminal to use it." -ForegroundColor DarkGray
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
    Write-OpenClineHeader
    Write-Step 1 "Checking the latest GitHub release..."
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    $headers = @{ "User-Agent" = "OpenCline-release-installer"; "Accept" = "application/vnd.github+json" }
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers $headers
    $asset = $release.assets | Where-Object { $_.name -eq $assetName } | Select-Object -First 1
    $checksumAsset = $release.assets | Where-Object { $_.name -eq $checksumName } | Select-Object -First 1

    if (-not $asset -or -not $checksumAsset) {
        throw "The latest release does not include the expected Windows executable and checksum. Check https://github.com/$repo/releases."
    }
    Write-Ok "Found release $($release.tag_name)."

    Write-Step 2 "Downloading OpenCline..."
    $downloadExe = Join-Path $tempDir $assetName
    $downloadChecksum = Join-Path $tempDir $checksumName
    Write-OpenClineDownload -Uri $asset.browser_download_url -Destination $downloadExe -Label "Downloading OpenCline"
    Write-OpenClineDownload -Uri $checksumAsset.browser_download_url -Destination $downloadChecksum -Label "Downloading SHA-256 checksum"
    Write-Ok "Download complete."

    Write-Step 3 "Verifying download integrity..."
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
    Write-Ok "SHA-256 verified. $downloadVersion"

    Write-Step 4 "Installing to $installDir..."
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

    Write-Host ""
    Write-Host "  ----------------------------------------" -ForegroundColor DarkGray
    Write-Host "  OpenCline installed successfully" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Version   $version"
    Write-Host "  Location  $targetExe"
    Write-Host "  SHA-256   verified" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Open a new terminal and run: " -NoNewline
    Write-Host "opencline" -ForegroundColor Cyan
    Write-Host ""
} catch {
    Write-Progress -Activity "Downloading OpenCline" -Completed
    Write-Host ""
    Write-Host "  Installation failed" -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Your existing installation was not replaced unless installation had already completed." -ForegroundColor DarkGray
    Write-Host "  Releases: https://github.com/$repo/releases" -ForegroundColor DarkGray
    Write-Host ""
    throw "OpenCline installation failed. See the error above."
} finally {
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}

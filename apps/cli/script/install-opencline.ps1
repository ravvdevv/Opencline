$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$installDir = Join-Path $env:LOCALAPPDATA "OpenCline"
$sourceExe = Join-Path $repoRoot "apps\cli\dist\cli-windows-x64\bin\opencline.exe"
$targetExe = Join-Path $installDir "opencline.exe"

function Get-ProcessTable {
    $parents = @{}
    Get-CimInstance -ClassName Win32_Process -ErrorAction SilentlyContinue | ForEach-Object {
        $parents[[int]$_.ProcessId] = [int]$_.ParentProcessId
    }
    return $parents
}

function Get-AncestorPids {
    param([int]$StartPid, [hashtable]$ParentMap)

    $seen = @{}
    $cursor = $StartPid
    while ($cursor -gt 0 -and -not $seen.ContainsKey($cursor)) {
        $seen[$cursor] = $true
        if (-not $ParentMap.ContainsKey($cursor)) { break }
        $cursor = $ParentMap[$cursor]
    }
    return $seen.Keys
}

function Get-DescendantDepths {
    param([int[]]$Seeds, [hashtable]$ParentMap)

    $children = @{}
    foreach ($entry in $ParentMap.Keys) {
        $parent = $ParentMap[$entry]
        if (-not $children.ContainsKey($parent)) { $children[$parent] = @() }
        $children[$parent] += $entry
    }

    $depths = @{}
    $queue = New-Object System.Collections.Queue
    foreach ($seed in $Seeds) {
        if (-not $depths.ContainsKey($seed)) {
            $depths[$seed] = 0
            $queue.Enqueue($seed)
        }
    }

    while ($queue.Count -gt 0) {
        $current = [int]$queue.Dequeue()
        if (-not $children.ContainsKey($current)) { continue }
        foreach ($child in $children[$current]) {
            if (-not $depths.ContainsKey($child)) {
                $depths[$child] = $depths[$current] + 1
                $queue.Enqueue($child)
            }
        }
    }
    return $depths
}

function Stop-OpenClineProcesses {
    $roots = @(Get-Process -Name "opencline" -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
    if ($roots.Count -eq 0) { return }

    $parentMap = Get-ProcessTable

    # This script is often launched from inside an OpenCline session, in which case an
    # OpenCline process is our own ancestor. Killing it would terminate the very shell
    # that is running this build, so those pids are never eligible for termination.
    $protected = @(Get-AncestorPids -StartPid $PID -ParentMap $parentMap)
    $live = @($roots | Where-Object { $protected -notcontains $_ })
    if ($live.Count -eq 0) {
        throw "OpenCline is the parent of this script (PID: $($roots -join ', ')). Running install:opencline from inside an OpenCline session cannot replace its executable. Run it from a separate terminal."
    }

    $targets = @{}
    foreach ($root in $live) { $targets[$root] = 0 }
    foreach ($entry in (Get-DescendantDepths -Seeds $live -ParentMap $parentMap).GetEnumerator()) {
        if ($protected -contains $entry.Key) { continue }
        if (-not $targets.ContainsKey($entry.Key) -or $entry.Value -gt $targets[$entry.Key]) {
            $targets[$entry.Key] = $entry.Value
        }
    }

    # Deepest first so parents are not left holding handles to already-dead children.
    $victims = @($targets.GetEnumerator() | Where-Object { $protected -notcontains $_.Key } | Sort-Object -Property Value -Descending)
    if ($victims.Count -eq 0) { return }

    Write-Host "OpenCline is running. Stopping $($victims.Count) process(es):"
    foreach ($victim in $victims) {
        $proc = Get-Process -Id $victim.Key -ErrorAction SilentlyContinue
        $name = if ($proc) { $proc.ProcessName } else { "<exited>" }
        Write-Host ("  {0} (PID {1})" -f $name, $victim.Key)
    }

    foreach ($victim in $victims) {
        Stop-Process -Id $victim.Key -Force -ErrorAction SilentlyContinue
    }
    foreach ($victim in $victims) {
        Wait-Process -Id $victim.Key -Timeout 10 -ErrorAction SilentlyContinue
    }

    $survivors = @($victims | Where-Object { $null -ne (Get-Process -Id $_.Key -ErrorAction SilentlyContinue) })
    if ($survivors.Count -gt 0) {
        $survivorPids = @($survivors | ForEach-Object { $_.Key })
        throw "Could not stop OpenCline (PID: $($survivorPids -join ', ')). Close those sessions manually, then rerun: bun run install:opencline"
    }
}

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    throw "Bun is required to build OpenCline. Install Bun first: https://bun.sh"
}

# A running Windows executable cannot be replaced, so clear any live sessions (and the
# hub daemons they own) before spending time on the rebuild.
Stop-OpenClineProcesses

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

# A session opened while the build was running can re-take the file lock, so each retry
# clears OpenCline again rather than just waiting and failing.
$installed = $false
for ($attempt = 1; $attempt -le 3 -and -not $installed; $attempt++) {
    try {
        Move-Item -LiteralPath $stagedExe -Destination $targetExe -Force -ErrorAction Stop
        $installed = $true
    } catch {
        if ($attempt -lt 3) {
            Write-Host "Update blocked (attempt $attempt of 3). Clearing OpenCline and retrying..."
            Stop-OpenClineProcesses
            Start-Sleep -Seconds 2
        }
    }
}

if (-not $installed) {
    Remove-Item -LiteralPath $stagedExe -Force -ErrorAction SilentlyContinue
    $holder = @(Get-Process -Name "opencline" -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
    if ($holder.Count -gt 0) {
        throw "Could not replace $targetExe because OpenCline is running (PID: $($holder -join ', ')). Close those sessions and rerun: bun run install:opencline"
    }
    throw "Could not replace $targetExe because another process is holding the file. Close any OpenCline terminals, then rerun: bun run install:opencline"
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

param(
    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$sourcePath = Join-Path $repoRoot "assets\icons\icon.png"
if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "OpenCline icon not found: $sourcePath"
}

$source = [System.Drawing.Image]::FromFile($sourcePath)
$bitmap = New-Object System.Drawing.Bitmap 256, 256, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$memory = New-Object System.IO.MemoryStream
try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($source, 0, 0, 256, 256)
    $bitmap.Save($memory, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytes = $memory.ToArray()

    $stream = [System.IO.File]::Create($OutputPath)
    $writer = New-Object System.IO.BinaryWriter $stream
    try {
        # ICO directory with one 256x256 PNG-compressed image.
        $writer.Write([UInt16]0)
        $writer.Write([UInt16]1)
        $writer.Write([UInt16]1)
        $writer.Write([Byte]0)
        $writer.Write([Byte]0)
        $writer.Write([Byte]0)
        $writer.Write([Byte]0)
        $writer.Write([UInt16]1)
        $writer.Write([UInt16]32)
        $writer.Write([UInt32]$pngBytes.Length)
        $writer.Write([UInt32]22)
        $writer.Write($pngBytes)
    } finally {
        $writer.Dispose()
    }
} finally {
    $memory.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
    $source.Dispose()
}

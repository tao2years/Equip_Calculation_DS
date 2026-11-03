param(
    [switch]$Probe,
    [int]$ProcessId,
    [string]$OutputPath,
    [string]$MetadataPath,
    [ValidateSet('unclassified', 'hero_list', 'hero_detail', 'gear_list', 'gear_detail', 'artifact_list', 'artifact_detail')]
    [string]$CaptureType = 'unclassified'
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class WindowCaptureNative {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();

    [DllImport("dwmapi.dll")]
    public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out RECT value, int size);
}
'@

function Get-Sha256Hex {
    param([Parameter(Mandatory = $true)][string]$Path)
    $sha = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $sha.Dispose() }
}

if ($Probe) {
    [ordered]@{
        available = $true
        adapter = 'windows.visible-window-copy-from-screen'
        requiresExplicitProcessId = $true
        capturesOnlyVisibleUnminimizedWindows = $true
        performsInputAutomation = $false
    } | ConvertTo-Json -Compress
    return
}

if ($ProcessId -le 0) { throw 'ProcessId must be a positive integer.' }
if (-not $OutputPath) { throw 'OutputPath is required.' }
if ([IO.Path]::GetExtension($OutputPath).ToLowerInvariant() -ne '.png') { throw 'OutputPath must use a .png extension.' }

$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
$resolvedMetadata = if ($MetadataPath) { [IO.Path]::GetFullPath($MetadataPath) } else { $resolvedOutput + '.metadata.json' }
if (Test-Path -LiteralPath $resolvedOutput) { throw "Refusing to overwrite existing screenshot: $resolvedOutput" }
if (Test-Path -LiteralPath $resolvedMetadata) { throw "Refusing to overwrite existing metadata: $resolvedMetadata" }

$process = Get-Process -Id $ProcessId -ErrorAction Stop
$handle = $process.MainWindowHandle
if ($handle -eq [IntPtr]::Zero) { throw "Process $ProcessId has no main window." }
if (-not [WindowCaptureNative]::IsWindowVisible($handle)) { throw "Process $ProcessId main window is not visible." }
if ([WindowCaptureNative]::IsIconic($handle)) { throw "Process $ProcessId main window is minimized; restore it before capture." }

[WindowCaptureNative]::SetProcessDPIAware() | Out-Null
$rect = New-Object WindowCaptureNative+RECT
$dwmResult = [WindowCaptureNative]::DwmGetWindowAttribute($handle, 9, [ref]$rect, [Runtime.InteropServices.Marshal]::SizeOf($rect))
if ($dwmResult -ne 0 -and -not [WindowCaptureNative]::GetWindowRect($handle, [ref]$rect)) {
    throw "Unable to read bounds for process $ProcessId main window."
}
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -le 0 -or $height -le 0) { throw "Process $ProcessId main window has invalid bounds ${width}x${height}." }

$outputDirectory = [IO.Path]::GetDirectoryName($resolvedOutput)
$metadataDirectory = [IO.Path]::GetDirectoryName($resolvedMetadata)
if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) { New-Item -ItemType Directory -Path $outputDirectory | Out-Null }
if ($metadataDirectory -and -not (Test-Path -LiteralPath $metadataDirectory)) { New-Item -ItemType Directory -Path $metadataDirectory | Out-Null }

$bitmap = [Drawing.Bitmap]::new($width, $height, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
try {
    $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, [Drawing.Size]::new($width, $height), [Drawing.CopyPixelOperation]::SourceCopy)
    $bitmap.Save($resolvedOutput, [Drawing.Imaging.ImageFormat]::Png)
}
finally {
    $graphics.Dispose()
    $bitmap.Dispose()
}

$file = Get-Item -LiteralPath $resolvedOutput
$metadata = [ordered]@{
    schemaVersion = '0.1.0'
    capturedAt = [DateTimeOffset]::Now.ToString('o')
    sourceMethod = 'official_pc_visible_window_user_initiated_screenshot'
    privacy = [ordered]@{ localOnly = $true; uploadPerformed = $false }
    target = [ordered]@{
        processId = $ProcessId
        processName = $process.ProcessName
        windowTitle = $process.MainWindowTitle
        visible = $true
        minimized = $false
    }
    captureType = $CaptureType
    bounds = [ordered]@{ left = $rect.Left; top = $rect.Top; width = $width; height = $height }
    image = [ordered]@{
        localName = $file.Name
        mediaType = 'image/png'
        byteLength = $file.Length
        sha256 = Get-Sha256Hex -Path $resolvedOutput
    }
    limitations = 'Captures only currently visible pixels from an explicitly selected, unminimized window. Occlusion, overlays, DPI and client rendering can affect the image. No clicks, login, memory access or packet interception are performed.'
}

[IO.File]::WriteAllText($resolvedMetadata, ($metadata | ConvertTo-Json -Depth 8) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
[ordered]@{ output = $resolvedOutput; metadata = $resolvedMetadata; width = $width; height = $height; sha256 = $metadata.image.sha256 } | ConvertTo-Json -Compress

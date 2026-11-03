param(
    [string]$InputPath,

    [string]$OutputPath,

    [string]$LanguageTag = 'zh-Hans-CN',

    [switch]$Probe
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null

$asTaskMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
        $_.Name -eq 'AsTask' -and
        $_.IsGenericMethod -and
        $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } |
    Select-Object -First 1

if ($null -eq $asTaskMethod) {
    throw 'Unable to locate the WinRT AsTask bridge.'
}

function Await-WinRtOperation {
    param(
        [Parameter(Mandatory = $true)]$Operation,
        [Parameter(Mandatory = $true)][Type]$ResultType
    )

    $closedMethod = $script:asTaskMethod.MakeGenericMethod($ResultType)
    $task = $closedMethod.Invoke($null, @($Operation))
    $task.Wait()
    return $task.Result
}

function Get-Sha256Hex {
    param([Parameter(Mandatory = $true)][string]$Path)
    $sha = [Security.Cryptography.SHA256]::Create()
    $fileStream = [IO.File]::OpenRead($Path)
    try {
        return ([BitConverter]::ToString($sha.ComputeHash($fileStream))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $fileStream.Dispose()
        $sha.Dispose()
    }
}

$availableLanguages = @([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | ForEach-Object { $_.LanguageTag })
if ($LanguageTag -notin $availableLanguages) {
    throw "OCR language '$LanguageTag' is unavailable. Installed recognizers: $($availableLanguages -join ', ')"
}

$language = [Windows.Globalization.Language]::new($LanguageTag)
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
if ($null -eq $engine) {
    throw "Unable to create OCR engine for '$LanguageTag'."
}

if ($Probe) {
    [ordered]@{
        available = $true
        engine = 'windows.media.ocr'
        selectedLanguage = $engine.RecognizerLanguage.LanguageTag
        availableLanguages = $availableLanguages
    } | ConvertTo-Json -Compress
    return
}

if (-not $InputPath) {
    throw 'InputPath is required unless -Probe is used.'
}

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path

$file = Await-WinRtOperation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($resolvedInput)) ([Windows.Storage.StorageFile])
$stream = Await-WinRtOperation ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await-WinRtOperation ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await-WinRtOperation ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$ocrResult = Await-WinRtOperation ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

$lines = @()
foreach ($line in $ocrResult.Lines) {
    $words = @()
    foreach ($word in $line.Words) {
        $rect = $word.BoundingRect
        $words += [ordered]@{
            text = $word.Text
            boundingRect = [ordered]@{
                x = [double]$rect.X
                y = [double]$rect.Y
                width = [double]$rect.Width
                height = [double]$rect.Height
            }
        }
    }
    $lines += [ordered]@{
        text = $line.Text
        words = $words
    }
}

$payload = [ordered]@{
    schemaVersion = '0.1.0'
    engine = 'windows.media.ocr'
    language = $engine.RecognizerLanguage.LanguageTag
    input = [ordered]@{
        localName = [IO.Path]::GetFileName($resolvedInput)
        sha256 = Get-Sha256Hex -Path $resolvedInput
        width = [int]$decoder.PixelWidth
        height = [int]$decoder.PixelHeight
    }
    textAngle = if ($null -eq $ocrResult.TextAngle) { $null } else { [double]$ocrResult.TextAngle }
    text = $ocrResult.Text
    lines = $lines
}

$json = $payload | ConvertTo-Json -Depth 10
if ($OutputPath) {
    $resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
    $outputDirectory = [IO.Path]::GetDirectoryName($resolvedOutput)
    if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
        New-Item -ItemType Directory -Path $outputDirectory | Out-Null
    }
    [IO.File]::WriteAllText($resolvedOutput, $json + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
    Write-Output $resolvedOutput
}
else {
    Write-Output $json
}

$bitmap.Dispose()
$stream.Dispose()

param(
    [Parameter(Mandatory = $true)]
    [string]$ImagePath,
    [string]$Lang = "ko"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq "AsTask" -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq "IAsyncOperation``1"
})[0]

function Await-WinRtOp {
    param($WinRtTask, [Type]$ResultType)
    $netTask = $asTaskGeneric.MakeGenericMethod($ResultType).Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    return $netTask.Result
}

[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null

$fullPath = (Resolve-Path -LiteralPath $ImagePath).Path
$file = Await-WinRtOp ([Windows.Storage.StorageFile]::GetFileFromPathAsync($fullPath)) ([Windows.Storage.StorageFile])
$stream = Await-WinRtOp ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
try {
    $decoder = Await-WinRtOp ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await-WinRtOp ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
}
finally {
    $stream.Dispose()
}

$language = [Windows.Globalization.Language]::new($Lang)
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
if ($null -eq $engine) {
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
}
if ($null -eq $engine) {
    throw "WinRT OcrEngine unavailable for language: $Lang"
}

$ocrResult = Await-WinRtOp ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

$lines = @()
foreach ($ln in $ocrResult.Lines) {
    $words = @()
    foreach ($w in $ln.Words) {
        $rect = $w.BoundingRect
        $words += [ordered]@{
            text = $w.Text
            x    = [Math]::Round([double]$rect.X, 2)
            y    = [Math]::Round([double]$rect.Y, 2)
            w    = [Math]::Round([double]$rect.Width, 2)
            h    = [Math]::Round([double]$rect.Height, 2)
        }
    }
    $lines += [ordered]@{
        text  = $ln.Text
        words = $words
    }
}

$payload = [ordered]@{
    width  = [int]$bitmap.PixelWidth
    height = [int]$bitmap.PixelHeight
    lang   = $engine.RecognizerLanguage.LanguageTag
    text   = $ocrResult.Text
    lines  = $lines
}

$payload | ConvertTo-Json -Depth 6 -Compress


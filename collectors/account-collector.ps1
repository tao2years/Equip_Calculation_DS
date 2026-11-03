[CmdletBinding()]
param(
    [ValidateSet('Menu', 'Doctor', 'Plan', 'Capture', 'Process', 'Status', 'Audit', 'Help')]
    [string]$Action = 'Menu',
    [ValidateSet('emulator', 'official_pc')]
    [string]$Channel = 'emulator',
    [ValidateSet('full', 'golden')]
    [string]$Mode = 'full',
    [string]$Output,
    [int]$GameWindowPid,
    [string]$AdbSerial,
    [string]$Manifest,
    [string]$Profile,
    [string]$OcrReview,
    [string]$ReviewedStaging,
    [string]$State,
    [string]$Account,
    [string]$Reference,
    [switch]$AllowPartial,
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
$RepositoryRoot = Split-Path -Parent $PSScriptRoot
$Collector = Join-Path $RepositoryRoot 'collectors\account-collector.mjs'
$CollectorCli = Join-Path $RepositoryRoot 'collectors\cli.mjs'

function Invoke-NodeChecked {
    param([string]$Script, [string[]]$Arguments)
    & node.exe $Script @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Collector command failed with exit code $LASTEXITCODE"
    }
}

function Require-Value {
    param([string]$Name, [string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "-$Name is required for action $Action"
    }
    return $Value
}

function Get-DoctorReport {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    $probe = $null
    $probeError = $null
    if ($node) {
        try {
            $probeText = (& node.exe $CollectorCli probe 2>&1 | Out-String).Trim()
            if ($LASTEXITCODE -ne 0) { throw $probeText }
            $probe = $probeText | ConvertFrom-Json
        }
        catch { $probeError = $_.Exception.Message }
    }

    $adapterId = if ($Channel -eq 'emulator') { 'adb-screenshot' } else { 'pc-window-screenshot' }
    $captureAdapter = @($probe.adapters | Where-Object { $_.id -eq $adapterId }) | Select-Object -First 1
    $ocrAdapter = @($probe.adapters | Where-Object { $_.id -eq 'windows-ocr' }) | Select-Object -First 1
    $requiredFiles = @(
        'data\game-data.public.json',
        'data\import-dictionary.json',
        'collectors\pipeline.mjs',
        'prototype\review.html',
        'prototype\staging-review.html'
    ) | ForEach-Object {
        $path = Join-Path $RepositoryRoot $_
        [pscustomobject]@{ path = $_; exists = Test-Path -LiteralPath $path -PathType Leaf }
    }
    $filesReady = @($requiredFiles | Where-Object { -not $_.exists }).Count -eq 0

    [pscustomobject]@{
        schemaVersion = '0.1.0'
        checkedAt = (Get-Date).ToString('o')
        repositoryRoot = $RepositoryRoot
        channel = $Channel
        mode = $Mode
        node = [pscustomobject]@{
            available = [bool]$node
            path = if ($node) { $node.Source } else { $null }
            version = if ($node) { (& node.exe --version).Trim() } else { $null }
        }
        capture = [pscustomobject]@{
            adapter = $adapterId
            ready = [bool]($captureAdapter -and $captureAdapter.executable)
            reason = if ($captureAdapter -and -not $captureAdapter.executable) { $captureAdapter.reason } elseif (-not $captureAdapter) { $probeError } else { $null }
            requiresUserNavigation = $true
            requiresGameClient = $true
            gameClientVerified = $false
        }
        processing = [pscustomobject]@{
            ready = [bool]($node -and $filesReady -and $ocrAdapter -and $ocrAdapter.executable)
            windowsOcr = [bool]($ocrAdapter -and $ocrAdapter.executable)
            selectedLanguage = if ($ocrAdapter) { $ocrAdapter.selectedLanguage } else { $null }
            realLayoutProfileRequired = $true
            requiredFiles = $requiredFiles
        }
        safety = [pscustomobject]@{
            loginAutomation = $false
            clicksOrNavigation = $false
            memoryRead = $false
            packetInterception = $false
            localOcrOnly = $true
        }
        readyForCapture = [bool]($node -and $filesReady -and $captureAdapter -and $captureAdapter.executable)
        readyForProcessing = [bool]($node -and $filesReady -and $ocrAdapter -and $ocrAdapter.executable)
        completionBoundary = 'A ready adapter does not prove full-account collection; a real profile, complete session and independent reference audit are still required.'
    }
}

function Show-DoctorReport {
    $report = Get-DoctorReport
    if ($Json) {
        $report | ConvertTo-Json -Depth 8
        return
    }
    Write-Host ''
    Write-Host 'Dragonheir Account Collector - Environment Check' -ForegroundColor Cyan
    Write-Host "Channel: $($report.channel)  Mode: $($report.mode)"
    Write-Host "Node: $(if ($report.node.available) { 'ready ' + $report.node.version } else { 'missing' })"
    Write-Host "Capture: $(if ($report.readyForCapture) { 'ready' } else { 'not ready' })"
    if ($report.capture.reason) { Write-Host "  Reason: $($report.capture.reason)" -ForegroundColor Yellow }
    Write-Host "Local processing: $(if ($report.readyForProcessing) { 'ready' } else { 'not ready' })"
    Write-Host 'Boundary: real client, full-account completeness and client formulas are not verified.' -ForegroundColor Yellow
}

function Show-Help {
    @'
Dragonheir account collector wizard

Common usage:
  powershell -ExecutionPolicy Bypass -File .\collectors\account-collector.ps1
  powershell -ExecutionPolicy Bypass -File .\collectors\account-collector.ps1 -Action Doctor -Channel official_pc
  powershell -ExecutionPolicy Bypass -File .\collectors\account-collector.ps1 -Action Capture -Channel official_pc -GameWindowPid 1234 -Output account-runs

Actions: Doctor checks readiness; Plan previews capture; Capture guides screenshots; Process runs OCR/Review; Status shows resume state; Audit compares a manual reference.
Full mode requires complete lists and all owned detail pages. Golden mode is calibration only and cannot prove completeness.
'@
}

function Show-Menu {
    while ($true) {
        Write-Host ''
        Write-Host 'Dragonheir Account Collector Wizard' -ForegroundColor Cyan
        Write-Host '1. Environment doctor'
        Write-Host '2. Preview full capture plan'
        Write-Host '3. Start guided capture'
        Write-Host '4. Process/resume OCR pipeline'
        Write-Host '5. Show pipeline status'
        Write-Host '6. Completeness audit'
        Write-Host '0. Exit'
        $choice = Read-Host 'Choose an action'
        if ($choice -eq '0') { return }
        $selectedChannel = Read-Host 'Channel emulator / official_pc (default emulator)'
        if ([string]::IsNullOrWhiteSpace($selectedChannel)) { $selectedChannel = 'emulator' }
        switch ($choice) {
            '1' { & $PSCommandPath -Action Doctor -Channel $selectedChannel }
            '2' { & $PSCommandPath -Action Plan -Channel $selectedChannel -Mode full }
            '3' {
                $destination = Read-Host 'Output directory'
                if ($selectedChannel -eq 'official_pc') {
                    $windowPid = [int](Read-Host 'Game window PID')
                    & $PSCommandPath -Action Capture -Channel $selectedChannel -Mode full -Output $destination -GameWindowPid $windowPid
                } else {
                    & $PSCommandPath -Action Capture -Channel $selectedChannel -Mode full -Output $destination
                }
            }
            '4' {
                & $PSCommandPath -Action Process -Manifest (Read-Host 'manifest.json') -Profile (Read-Host 'Real layout profile.json') -Output (Read-Host 'Pipeline output directory') -OcrReview (Read-Host 'OCR Review JSON (blank on first run)') -ReviewedStaging (Read-Host 'Field Review JSON (blank until ready)')
            }
            '5' { & $PSCommandPath -Action Status -State (Read-Host 'pipeline-state.json') }
            '6' { & $PSCommandPath -Action Audit -Account (Read-Host 'account-snapshot.json') -Reference (Read-Host 'Manual reference.json') -Output (Read-Host 'Audit report output path') }
            default { Write-Host 'Invalid choice' -ForegroundColor Yellow }
        }
    }
}

Push-Location $RepositoryRoot
try {
    switch ($Action) {
        'Menu' { Show-Menu }
        'Doctor' { Show-DoctorReport }
        'Help' { Show-Help }
        'Plan' { Invoke-NodeChecked $Collector @('plan', '--channel', $Channel, '--mode', $Mode) }
        'Capture' {
            $arguments = @('capture', '--channel', $Channel, '--mode', $Mode, '--output', (Require-Value 'Output' $Output))
            if ($Channel -eq 'official_pc') {
                if ($GameWindowPid -le 0) { throw '-GameWindowPid must be a positive PID for official_pc capture' }
                $arguments += @('--pid', [string]$GameWindowPid)
            }
            elseif ($AdbSerial) { $arguments += @('--serial', $AdbSerial) }
            Invoke-NodeChecked $Collector $arguments
        }
        'Process' {
            $arguments = @('process', '--manifest', (Require-Value 'Manifest' $Manifest), '--profile', (Require-Value 'Profile' $Profile), '--output', (Require-Value 'Output' $Output))
            if ($OcrReview) { $arguments += @('--ocr-review', $OcrReview) }
            if ($ReviewedStaging) { $arguments += @('--reviewed-staging', $ReviewedStaging) }
            if ($AllowPartial) { $arguments += '--allow-partial' }
            Invoke-NodeChecked $Collector $arguments
        }
        'Status' { Invoke-NodeChecked $Collector @('status', '--state', (Require-Value 'State' $State)) }
        'Audit' { Invoke-NodeChecked $Collector @('audit', '--account', (Require-Value 'Account' $Account), '--reference', (Require-Value 'Reference' $Reference), '--output', (Require-Value 'Output' $Output)) }
    }
}
finally {
    Pop-Location
}

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$wizard = Join-Path $root 'collectors\account-collector.ps1'

$pc = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $wizard -Action Doctor -Channel official_pc -Mode full -Json | Out-String) | ConvertFrom-Json
if ($pc.channel -ne 'official_pc') { throw 'Doctor did not retain official_pc channel' }
if ($pc.mode -ne 'full') { throw 'Doctor did not retain full mode' }
if (-not $pc.node.available) { throw 'Doctor failed to detect Node' }
if (-not $pc.readyForProcessing) { throw 'Doctor should report local OCR processing ready on this fixture machine' }
if ($pc.capture.gameClientVerified) { throw 'Doctor must not claim a verified game client' }
if ($pc.safety.loginAutomation -or $pc.safety.memoryRead -or $pc.safety.packetInterception) { throw 'Doctor safety boundary changed' }

$emulator = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $wizard -Action Doctor -Channel emulator -Mode golden -Json | Out-String) | ConvertFrom-Json
if ($emulator.capture.adapter -ne 'adb-screenshot') { throw 'Doctor selected the wrong emulator adapter' }
if ($emulator.mode -ne 'golden') { throw 'Doctor did not retain golden mode' }

$plan = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $wizard -Action Plan -Channel official_pc -Mode full | Out-String)
if ($LASTEXITCODE -ne 0 -or $plan -notmatch 'full_account') { throw 'Wizard plan action did not route to the full official-PC plan' }

Write-Output 'Account collector wizard tests passed: doctor readiness, safety boundary and full-plan routing'

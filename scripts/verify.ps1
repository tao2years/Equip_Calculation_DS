$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ge 7) {
    $PSNativeCommandUseErrorActionPreference = $true
}

# Windows PowerShell 5 does not promote native non-zero exit codes to terminating
# errors. Shadow Node inside this script so every compiler/test step is fail-fast.
$script:NodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
function Invoke-NodeChecked {
    & $script:NodeExecutable @args
    if ($LASTEXITCODE -ne 0) {
        throw "Node command failed with exit code ${LASTEXITCODE}: node $($args -join ' ')"
    }
}
Set-Alias -Name node -Value Invoke-NodeChecked -Scope Script

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    node --check prototype/app.js
    node --check prototype/inventory.js
    node --check prototype/inventory-core.mjs
    node --check collectors/cli.mjs
    node --check collectors/account-collector.mjs
    node --check scripts/crawl_public_data.mjs
    node --check scripts/refresh_public_data.mjs
    node --check scripts/compile_public_heroes.mjs
    node --check scripts/compile_public_catalogs.mjs
    node --check scripts/build_game_data.mjs
    node --check scripts/lib/parse-set-bonus.mjs
    node --check scripts/test_parse_set_bonus.mjs
    node --check scripts/build_import_dictionary.mjs
    node --check scripts/build_equipment_rules.mjs
    node --check scripts/test_import_dictionary.mjs
    node --check collectors/lib/normalize.mjs
    node --check collectors/lib/detect-labels.mjs
    node --check collectors/lib/adb.mjs
    node --check collectors/lib/capture-plan.mjs
    node --check collectors/adb-session.mjs
    node --check collectors/window-session.mjs
    node --check collectors/lib/finalize-staging.mjs
    node --check collectors/lib/layout-extractor.mjs
    node --check collectors/lib/capture-manifest.mjs
    node --check collectors/lib/apply-ocr-review.mjs
    node --check collectors/lib/audit-account.mjs
    node --check collectors/pipeline.mjs
    node --check scripts/build_ocr_staging_fixture.mjs
    node --check scripts/build_layout_extractor_fixture.mjs
    node --check scripts/test_finalize_staging.mjs
    node --check scripts/test_layout_extractor.mjs
    node --check scripts/build_collector_pipeline_state_fixture.mjs
    node --check scripts/test_collector_pipeline.mjs
    node --check scripts/test_apply_ocr_review.mjs
    node --check prototype/optimizer-core.mjs
    node --check scripts/test_optimizer.mjs
    node --check scripts/benchmark_optimizer.mjs
    node --check scripts/test_inventory_core.mjs
    node --check scripts/solve_request.mjs
    node --check scripts/inspect_ocr_labels.mjs
    node --check scripts/test_windows_ocr_output.mjs
    node --check scripts/build_ocr_recognition_fixture.mjs
    node --check scripts/build_ocr_review_fixture.mjs
    node --check scripts/test_ocr_bundle.mjs
    node --check scripts/test_adb_adapter.mjs
    node --check scripts/audit_public_domain.mjs
    node --check scripts/audit_equipment_model.mjs
    node --check scripts/compile_cn_name_candidates.mjs
    node --check scripts/test_capture_plan.mjs
    node --check prototype/review.js
    node --check prototype/staging-review.js
    node --check prototype/staging-review-core.mjs
    node --check scripts/test_staging_review_core.mjs
    node --check scripts/test_account_completeness.mjs
    node --check scripts/validate_formula_cases.mjs
    node --check scripts/test_formula_cases.mjs

    node scripts/refresh_public_data.mjs --date=2026-11-03 --dry-run | Out-Null

    node scripts/compile_public_heroes.mjs
    node scripts/compile_public_catalogs.mjs
    node scripts/build_game_data.mjs
    node scripts/test_parse_set_bonus.mjs
    node scripts/build_import_dictionary.mjs
    node scripts/build_equipment_rules.mjs
    node scripts/audit_public_domain.mjs
    node scripts/audit_equipment_model.mjs
    node scripts/compile_cn_name_candidates.mjs
    node scripts/test_import_dictionary.mjs
    node scripts/build_ocr_staging_fixture.mjs
    node scripts/build_ocr_recognition_fixture.mjs
    node scripts/build_ocr_review_fixture.mjs
    node scripts/build_layout_extractor_fixture.mjs
    node scripts/build_collector_pipeline_state_fixture.mjs
    node scripts/test_finalize_staging.mjs
    node scripts/test_layout_extractor.mjs
    node scripts/test_apply_ocr_review.mjs
    node scripts/test_collector_pipeline.mjs
    node scripts/test_optimizer.mjs
    node scripts/test_inventory_core.mjs
    node scripts/test_adb_adapter.mjs
    node scripts/test_capture_plan.mjs
    node scripts/test_staging_review_core.mjs
    node scripts/test_account_completeness.mjs
    node scripts/test_formula_cases.mjs
    node collectors/adb-session.mjs --plan examples/emulator-capture-plan.example.json --dry-run | Out-Null
    node collectors/window-session.mjs --plan examples/pc-capture-plan.example.json --dry-run | Out-Null
    node collectors/account-collector.mjs plan --channel emulator | Out-Null
    node collectors/account-collector.mjs plan --channel official_pc | Out-Null
    node collectors/account-collector.mjs status --state examples/collector-pipeline-state.example.json | Out-Null
    node scripts/solve_request.mjs --output examples/optimization-result.example.json
    if ($env:OS -eq 'Windows_NT') {
        node collectors/cli.mjs window-probe | Out-Null
        node collectors/cli.mjs ocr-image --input outputs/design/prototype-browser-verified.png --output outputs/qa/windows-ocr-prototype.json
        node scripts/inspect_ocr_labels.mjs --input outputs/qa/windows-ocr-prototype.json --output outputs/qa/windows-ocr-labels.json
        node scripts/test_windows_ocr_output.mjs
        node scripts/test_ocr_bundle.mjs
    }

    @'
import json
from pathlib import Path
import jsonschema

root = Path.cwd()
pairs = [
    ('schemas/account-snapshot.schema.json', 'examples/account-snapshot.example.json'),
    ('schemas/account-snapshot.schema.json', 'examples/account-snapshot-update.example.json'),
    ('schemas/account-completeness-reference.schema.json', 'examples/account-completeness-reference.example.json'),
    ('schemas/account-completeness-report.schema.json', 'examples/account-completeness-report.example.json'),
    ('schemas/formula-golden-cases.schema.json', 'examples/formula-golden-cases.synthetic.json'),
    ('schemas/formula-validation-report.schema.json', 'examples/formula-validation-report.example.json'),
    ('schemas/game-data.schema.json', 'data/game-data.seed.json'),
    ('schemas/game-data.schema.json', 'data/game-data.public.json'),
    ('schemas/import-dictionary.schema.json', 'data/import-dictionary.json'),
    ('schemas/equipment-rules.schema.json', 'data/equipment-rules.public.json'),
    ('schemas/cn-name-candidates.schema.json', 'corpus/compiled/cn-name-candidates.json'),
    ('schemas/ocr-staging.schema.json', 'examples/ocr-staging.example.json'),
    ('schemas/ocr-recognition.schema.json', 'examples/ocr-recognition.example.json'),
    ('schemas/ocr-review.schema.json', 'examples/ocr-review.example.json'),
    ('schemas/ocr-review.schema.json', 'examples/ocr-review-layout.example.json'),
    ('schemas/ocr-recognition.schema.json', 'examples/ocr-recognition-reviewed-layout.example.json'),
    ('schemas/ocr-review-application-report.schema.json', 'examples/ocr-review-application-report.example.json'),
    ('schemas/layout-profile.schema.json', 'examples/layout-profile.synthetic.json'),
    ('schemas/ocr-recognition.schema.json', 'examples/ocr-recognition-layout.example.json'),
    ('schemas/ocr-staging.schema.json', 'examples/ocr-staging-layout.example.json'),
    ('schemas/ocr-staging.schema.json', 'examples/ocr-staging-reviewed-layout.example.json'),
    ('schemas/layout-extraction-report.schema.json', 'examples/layout-extraction-report.example.json'),
    ('schemas/collector-pipeline-state.schema.json', 'examples/collector-pipeline-state.example.json'),
    ('schemas/capture-evidence.schema.json', 'examples/capture-evidence.example.json'),
    ('schemas/pc-window-capture.schema.json', 'examples/pc-window-capture.example.json'),
    ('schemas/pc-window-capture-session.schema.json', 'examples/pc-window-capture-session.example.json'),
    ('schemas/capture-plan.schema.json', 'examples/emulator-capture-plan.example.json'),
    ('schemas/capture-plan.schema.json', 'examples/pc-capture-plan.example.json'),
    ('schemas/capture-session.schema.json', 'examples/capture-session.example.json'),
    ('schemas/optimization-request.schema.json', 'examples/optimization-request.example.json'),
    ('schemas/optimization-result.schema.json', 'examples/optimization-result.example.json'),
    ('schemas/optimizer-benchmark.schema.json', 'corpus/compiled/optimizer-scalability-benchmark.json'),
    ('schemas/equipment-model-audit.schema.json', 'corpus/compiled/equipment-model-audit.json'),
]
for schema_path, data_path in pairs:
    with (root / schema_path).open(encoding='utf-8') as handle:
        schema = json.load(handle)
    with (root / data_path).open(encoding='utf-8') as handle:
        data = json.load(handle)
    jsonschema.Draft202012Validator(schema).validate(data)
print(f'Schema validation passed: {len(pairs)} artifacts')
'@ | python -
    if ($LASTEXITCODE -ne 0) { throw "Schema validation failed with exit code $LASTEXITCODE" }

    python scripts/lint_research.py
    if ($LASTEXITCODE -ne 0) { throw "Research lint failed with exit code $LASTEXITCODE" }
    node collectors/cli.mjs probe
    Write-Output 'Repository verification passed'
}
finally {
    Pop-Location
}

# Dragonheir Equipment Calculator Research & Engineering Contract

## Session start

1. Read `state/checkpoint.md` and `wiki/index.md` before doing research or implementation.
2. Read `research/protocol.md` before changing evidence, version, or schema rules.
3. Run `git status --short`; preserve user and unrelated changes.
4. Use `state/open-questions.md` to select work; do not silently convert an unknown into an assumption.
5. For OCR work, inspect the collection manifest, recognition bundle and Review decisions as separate stages; never overwrite raw screenshots or prior derived OCR evidence.
6. For end-to-end account collection, resume from `pipeline-state.json` only when recorded input and artifact hashes still match. Real-client machine staging must pass the Review gate before finalization.

## Product boundary

- The product recommends equipment combinations; it does not modify the game, equip items, automate combat, or send gameplay commands.
- Treat static game data, account inventory data, and calculated results as three separate trust domains.
- Default import paths are manual entry, versioned JSON/CSV, and user-initiated screenshot OCR.
- Memory reading, packet interception, TLS bypass, code injection, client patching, and credential/token collection are disabled by default. Do not implement or test them without an explicit project decision, current terms review, isolated test account, and a documented stop condition.
- Never request or store account passwords, session tokens, private keys, payment data, or anti-cheat bypass material.

## Source of truth

- `raw/` is immutable when introduced. A refresh creates a new dated snapshot; never overwrite an old one.
- `corpus/` records source and coverage state with stable IDs.
- `schemas/` defines machine-readable contracts. Generated outputs must derive from these contracts and structured data.
- `wiki/` contains compiled, cross-linked research knowledge.
- `outputs/` contains review views and may be regenerated.
- `state/` contains checkpoints, decisions, questions, coverage, and the append-only operation log.

## Evidence and version rules

- Separate `official_fact`, `community_report`, `research_inference`, `experiment_result`, and `product_proposal`.
- Every game rule must carry region/channel, game build or season when known, retrieval date, and source locator.
- Do not merge old global, Reborn/global, and China-client values without evidence that they are identical.
- A current Wiki page establishes current visible content only; it does not establish first introduction or continued equality across regions.
- Wiki names and translations are aliases, not stable IDs. Prefer numeric/config IDs when later verified.
- A screenshot, OCR result, client asset, runtime observation, and server response are different evidence classes.
- A dictionary hit is not a parsed equipment record. Preserve OCR lines and coordinates, then require layout extraction and/or human Review before finalization.
- Layout profiles must identify channel, client build, language, and evidence level. Never promote a synthetic or old-build profile to a current-client claim without golden screenshots and an accuracy check.

## Data and calculation discipline

- Preserve observed values exactly; normalize units in a separate field.
- Keep flat and percentage stats distinct (`atk_flat` vs `atk_pct`).
- Keep sheet stats, conditional combat stats, and simulated encounter outcomes distinct.
- Every result must expose the active assumptions, data version, objective, constraints, locked items, and excluded effects.
- Never label a heuristic result as globally optimal. Exact/approximate status and pruning limits must be visible.

## Writes and checkpoints

- Independent research may run in parallel; shared indexes, decisions, and checkpoints update serially.
- Append meaningful operations to `state/log.md`.
- Update `state/checkpoint.md` at every durable stopping point.
- Correct facts in structured sources or generators first; do not hand-fix divergent outputs.

## Completion gates

Do not claim a phase complete unless its source coverage, schema validation, fixture tests, calculation golden cases, links, and output consistency pass. Distinguish captured, screened, deeply reviewed, OCR-validated, and runtime-validated coverage.

# Research Checkpoint

Updated: 2026-11-03

## Current phase

Phase 1/2 boundary — the single-hero solver, immutable screenshot staging, local batch OCR, a versioned synthetic layout extractor and a browser-tested human Review workbench exist; client and real-account ingestion are not tested.

## Completed

- Inspected the clean initial repository and the user's reference LLM Wiki project.
- Added repository contract, research protocol, Wiki index, source ledger, decision log, open questions, and a resumable checkpoint.
- Defined the product boundary, MVP workflow, information architecture, data trust boundaries, import adapter model, solver stages, milestones, and acceptance gates.
- Screened key public sources for seven equipment slots, attribute categories, selected enhancement rules, current equipment variants, Unity/IL2CPP client structure, and comparable optimizer/OCR workflows.
- Recorded the material terms-of-service risk and excluded packet interception, memory reading, injection, and client modification from the default roadmap.
- Added draft schemas for account snapshots and optimization requests.
- Captured six configured public pages into immutable, dated `raw/` snapshots with URL, timestamp, HTTP status, SHA-256 and byte length.
- Added executable compilers: two detail pages provide a cross-check dataset, while the full catalog compiler now extracts 351 heroes, 682 equipment definitions and 147 artifacts from immutable Nuxt page state with dataset-level evidence.
- Added a synthetic account fixture and versioned seed game-data package for workflow testing.
- Implemented a local HTML prototype with JSON import, hero/artifact selection, six lockable equipment slots, constraints, five objectives, set bonuses, exact enumeration, Top 20 and no-result diagnostics.
- Switched the HTML prototype from the tiny seed to a generated public data package containing all 351 compiled heroes and 147 compiled artifact definitions; the account fixture still uses only two heroes and three artifacts.
- Added an executable collector CLI for capability probing, empty snapshot creation, JSON normalization, immutable screenshot staging and local Windows OCR. Visible-UI collection remains unavailable until real client access exists.
- Added batch OCR recognition bundles and a local Review workbench with image association, bounding-box overlay, dictionary correction, accept/reject state and Review JSON export. Existing raw and derived evidence is never overwritten.
- Added an emulator ADB screenshot adapter with capability probing, authorization/device selection, PNG signature checks, non-overwriting image/metadata output and no tap/navigation behavior. The local machine has no ADB, so only pure adapter tests pass; no live emulator claim is made.
- Added a guided ADB capture-session program and versioned 7-step plan. It requires user navigation and explicit Enter for each capture, enforces per-stage minimum counts, preserves per-image evidence, and emits complete/partial manifests; dry-run and plan validation pass without ADB.
- Added an explicit user-goal completion audit and a generated public-domain coverage audit so partial prototypes cannot be mistaken for the finished logged-in collector.
- Added a separately validated CN-name candidate corpus: 70 community hero-name observations and 6 official WeGame marketing-page observations remain unlinked to canonical IDs; no similarity guess was merged into the resolver.
- Added a three-deliverable implementation contract that separates the logged-in account collector, public-data compiler and HTML optimizer, with explicit workflows, schemas, missing layers and real-client acceptance gates.
- Replaced the HTML's four hard-coded minimum fields with a dynamic constraint editor for all ten modeled sheet stats and five comparison operators. The same stat can form a range; every stat can be maximized or minimized, and no-result diagnostics use computed theoretical extrema.
- Added a browser account-inventory editor that can create/import, validate, edit and export canonical snapshots, then hand the same in-memory account directly to the optimizer.
- Added stable-ID snapshot diff/merge for repeat imports. It reports additions, updates, unchanged and missing-from-incoming records; partial scans preserve missing old records and never silently interpret them as deletion.
- Added optimizer candidate policies for equipped/unequipped and locked gear, fixed-item override behavior, and a result-level swap list against the selected hero's current equipment.
- Added a generic, versioned OCR layout extractor and CLI command. Three synthetic 1000×1000 detail pages (hero, gear and artifact) flow through coordinate extraction into canonical finalization; required-field and duplicate-fingerprint failures are explicit. No real-client profile has been calibrated.
- Replaced the all-scales Cartesian-product claim with explicit exhaustive, exact branch-and-bound and heuristic large-space modes. Added 100/300/1,000-item synthetic benchmarks, exact-vs-heuristic quality evidence, solver metadata and HTML mode/status controls.
- Added a resumable one-command collector pipeline from screenshot/ADB manifests through OCR, applied line-level Review, layout extraction and field-level staging Review to finalization and validation. Step and artifact hashes prevent silent reuse after mutation.
- Added a browser staging Review workbench so the second gate no longer requires hand-editing JSON. It uses the production finalizer, blocks invalid exports and binds reviewed output to the machine-staging hash required by the pipeline.
- Separated artifact enhancement level from effect refinement. All 147 compiled artifacts expose complete 0–20 static `levelCurve` records and 0–5 `effectLevels`; account-observed stats override the public curve with explicit provenance and mismatch warnings.
- Promoted 682 equipment records into canonical `GameData.equipment`; all have complete primary-stat level curves, 677 have known slots and 624 link to a public set family. Stable-ID linkage now runs through dictionary, finalizer, account validation and the inventory UI.
- Verified the prototype in a hidden browser: 64 combinations enumerated, one default feasible result, fixed-item constraint and two no-result diagnostics; browser log contained no warnings or errors.

## Evidence depth

- 23 sources indexed.
- 21 screened, captured or compiled at page/project level; 1 discovered only; 1 official product-site fetch failed.
- 11 full source snapshots captured locally.
- 351 hero, 682 equipment and 147 artifact public records automatically compiled; 2 hero detail records independently compiled for cross-checking.
- 0 client builds inspected locally.
- 0 runtime/client experiments; OCR plumbing smoke-tested only on the project prototype screenshot.
- 0 game formulas validated against client screenshots.
- 1 browser-tested solver workflow using synthetic inventory; this is not real-game validation.
- 1 generated import/OCR dictionary covering all compiled heroes/artifacts/sets plus curated CN stat, slot, rarity and common artifact aliases; load-bearing alias tests pass.
- CN alias audit: only 2/351 heroes, 14/147 artifacts and 4/252 sets currently have non-ASCII aliases. A separate 76-observation candidate corpus is preserved without unsafe ID assignment.
- 1 executable OCR-staging finalizer tested on 17 synthetic observations, producing a schema-valid 2-hero/12-gear/3-artifact account snapshot accepted by the public game data validator.
- 1 shared optimizer core used by both HTML and CLI; canonical JSON and OCR-finalized snapshots produce the same 64-combination solution in regression tests.
- 1 working local Windows OCR adapter; the installed Simplified Chinese recognizer extracted 58 lines from the prototype screenshot and the expanded dictionary scanner located 15 relevant lines. No live-game accuracy has been measured.
- 1 batch recognition smoke test and 1 hidden-browser Review workflow: unresolved fields block acceptance, a chosen candidate clears the gate, 1536×1024 and 390×844 layouts were checked, and browser logs were clean.
- 1 ADB adapter unit suite covering device-list parsing, authorization and ambiguous-device selection; current environment probe returns `adb executable not found`.
- 1 guided capture-plan suite: 7 stages and 50 minimum golden screenshots, plus dry-run output and capture plan/session schemas. No live PNG has been captured from an emulator.
- Hidden-browser optimizer regression at 1440×900 and 390×844: default result, dynamic defense constraint, maximum/minimum defense objective, generic theoretical maximum, mobile layout and zero relevant console messages all passed.
- Inventory-editor regression: the example loaded as 2 heroes/12 gear/3 artifacts; delete/add preserved unique IDs, session handoff preserved counts, and the optimizer enumerated 64 builds with 1 feasible result. Desktop console was clean; compact 500px headless render had no clipping after the responsive fix.
- Repeat-import regression: merging a synthetic partial rescan produced 3 heroes/13 gear/3 artifacts and the expected per-entity diff; 11 absent gear and 2 absent artifacts were retained with an explicit coverage warning. Browser console remained clean.
- Candidate-policy browser regression: all gear enumerated 64 builds; inventory-only enumerated 1; inventory-only plus lock exclusion correctly stopped before search with a localized no-candidate error; fixing the locked helmet overrode the filter and restored a 1-build search. Default result showed six retained current items in the swap list.
- `verify.ps1` now fails fast on Node and Python non-zero exit codes under Windows PowerShell 5. The fix immediately exposed and corrected an invalid candidate-policy enum that the previous verifier had falsely allowed.
- 1 layout-extraction suite: three synthetic page kinds yield one hero, one gear item and one artifact; missing required fields and visually identical duplicate fingerprints are rejected. Evidence level remains `synthetic_fixture`.
- Optimizer scale benchmark: automatic heuristic runs for 100/300/1,000 synthetic items completed in about 0.5–1.0 seconds on this machine. A 60-item exact comparison had 0% best-score gap and 18/20 Top-20 overlap for one deterministic fixture; no general heuristic accuracy claim is made.
- Hidden-browser solver-mode QA: automatic small-inventory exhaustive, forced heuristic and forced exact-branch labels all matched runtime state; desktop overflow was corrected and console warnings/errors were empty. A new mobile viewport could not be forced through the hidden IAB API in this pass, so earlier mobile evidence was not treated as new QA.
- Collector-pipeline regression: synthetic recognition completes to a valid 1-hero/1-gear/1-artifact snapshot only under the synthetic acceptance flag; default execution pauses first for OCR Review and again for staging Review, applies accepted/rejected decisions, reuses intact artifacts, and rejects changed derivation hashes. Windows OCR accepts both screenshot and ADB-session manifests and safely resumes matching evidence.
- Hidden-browser staging-Review QA at 1280×720: example counts and canonical preview were correct; unknown hero/stat edits disabled export, corrections restored it, download status appeared, document scroll dimensions equaled the viewport, and console warnings/errors were empty. A fresh mobile viewport was not available through the hidden IAB API.
- Artifact model regression: public +20 curve lookup, account-observed override, mismatch warnings, OCR/canonical parity and exhaustive/branch-bound Top-N parity pass. No artifact curve has been checked against a live client.
- Hidden-browser artifact UI QA: staging Review displayed separate enhancement/refinement inputs, accepted independent edits to 20/5 while remaining exportable, and emitted no console warnings/errors; inventory cards showed enhancement, refinement and observation provenance. QA used a hidden in-app browser because the Browser plugin and a configured local Playwright runtime were absent.
- Hidden-browser equipment-link QA: inventory selected public definition `equipment-532513`, auto-filled its slot, set and enhancement limit, persisted the owned instance linkage and rendered it without browser warnings/errors. Select labels include external IDs so duplicate public display names remain distinguishable.
- Hidden-browser weighted-objective QA: loaded the synthetic account, selected the custom weighted panel objective, used attack weight 1 and crit-damage-per-1% weight 10, exhaustively evaluated 64 builds and rendered the single feasible result with score `1,556.95`; browser warning/error log was empty. Browser plugin and repository Playwright configuration were absent, so QA used the hidden in-app browser.
- Public compiler/audit timestamps now derive from immutable source retrieval times. Two consecutive full verification runs left `game-data.public.json` and `import-dictionary.json` byte-identical, improving reproducibility across machines.
- Official-PC candidate adapter now supports an explicit-PID, visible-window-only screenshot with PNG/SHA-256/bounds metadata and no input automation. A guided 7-stage PC session reuses the ADB capture plan and produces a pipeline-compatible manifest. Windows capability probe, invalid-PID/no-output guard, dry-run and ADB/PC manifest normalization passed; no game window was captured, so client/DPI/occlusion behavior remains unvalidated.
- Emulator and official-PC capture plans are now separate, both require 7 stages / at least 50 golden screenshots, and each session runner rejects the other channel's plan before capture.
- Post-finalize account completeness audit now compares a snapshot to an independent manual reference across total counts, six gear-slot counts, hero/artifact ID sets, duplicate owned/definition IDs and unknown public references. Synthetic pass, missing gear/slot and duplicate-hero regressions pass; no live manual reference exists yet.

## Next durable steps

1. Confirm target region and distribution channel; choose emulator ADB or official PC window capture as the first live collector experiment.
2. Obtain the minimum anonymized screenshot set listed in `state/open-questions.md`.
3. Capture the applicable current channel terms and expand the public snapshot manifest with release/build metadata.
4. Calibrate a channel/build-specific layout profile and golden dataset from real screenshots; the generic extractor, synthetic fixture, dictionary and Review shell already exist.
5. Validate the shared pure solver's formula ordering against client panels.
6. Move non-trivial optimization into a Web Worker and expand exact-vs-heuristic quality tests across objectives, constraints, set distributions and real inventories.
7. Map the remaining five special equipment definitions and convert load-bearing set/artifact effect text into reviewed semantic effects rather than guessing from prose.
8. Link CN display names to canonical hero IDs only from current-client or official bilingual evidence; use the six generated reconciliation leads as review pointers, not mappings.

## Known constraints

- No game client is installed in the current environment.
- The current official product site is linked by the 2026-09-15 Level Infinite press release, but direct background snapshot capture failed; the publisher press release itself was captured.
- `yyshub.top` returned no readable application content through background extraction; its behavior was not independently verified.
- Public Wiki content mixes seasons/variants and may not match the current China client.
- This is product and technical risk analysis, not legal advice.

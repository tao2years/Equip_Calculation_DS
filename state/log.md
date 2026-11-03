# Operation Log

Append-only. Newest entries go at the bottom.

## 2026-11-03 · OP-001

- Initialized the LLM Wiki research structure from a one-line repository.
- Reviewed the reference methodology in `F:/cc_changelog_analysis`.
- Performed background-only web research; no visible browser or game UI was opened.
- Indexed initial official/public, technical, community, legal, and comparator sources.
- Compiled Phase 0 product, data acquisition, domain model, optimizer, risk, and roadmap decisions.
- No game client download, reverse engineering, account access, runtime inspection, or external publication occurred.

## 2026-11-03 · OP-002

- Added versioned public-data and account-snapshot schemas, a manually compiled seed package, and a synthetic 12-item account fixture.
- Added a public-source crawler; captured six dated HTML snapshots with provenance and content hashes.
- Added a deterministic hero-detail compiler; compiled Aschetius and Errich level-1 public-page records with evidence pointers.
- Implemented the first local HTML optimizer prototype and a local-only server script.
- Tested the prototype in a hidden in-app browser. Default case enumerated 64 combinations and returned one feasible build; fixed-gear and impossible-constraint paths returned diagnostics. Browser console had no warning/error entries.
- Saved concept and verified-render screenshots plus a fidelity ledger under `outputs/design/`.
- No game login, account credentials, client download, process inspection, packet capture, memory read, injection, upload, or external publication occurred.

## 2026-11-03 · OP-003

- Evaluated the immutable heroes/equipment SSR snapshots and found complete structured Nuxt state rather than relying on rendered-text scraping.
- Added a sandboxed compiler for the public catalogs. It extracted 351 heroes, 682 equipment definitions and 147 artifacts across s1–s9, including base stats, growth fields, skills, inspirations, refinement curves and effect text.
- Reduced equipment slot inference exceptions from 173 to 5 by explicit name-family mappings; the five special definitions remain `unknown` instead of being guessed.
- Generated `data/game-data.public.json` and switched the HTML prototype to the full hero/artifact definition pack while preserving the synthetic inventory fixture.
- Added and tested an executable collector CLI: capability probe, empty snapshot creation, JSON normalization and immutable screenshot bundle staging all passed schema validation.
- OCR and logged-in visible-UI collection remain unimplemented because no target client or representative screenshots exist; the CLI reports these capabilities as unavailable.

## 2026-11-03 · OP-004

- Added the current SGRA product site and 2026-09-15 Level Infinite anniversary announcement to the evidence ledger.
- Captured the official publisher press release, which describes the current mobile/PC product and a roster of more than 300 heroes; direct background capture of the linked SGRA product site failed and is recorded as such.
- Compiled 248 season/variant-specific set families from the equipment catalog while keeping only four reviewed static sheet bonuses executable in the solver.
- Added `scripts/verify.ps1`; regeneration, four schemas, JavaScript syntax, research lint and collector capability checks passed.

## 2026-11-03 · OP-005

- Added `baseStatsOverride` to owned heroes. The solver now prefers account-observed pre-equipment stats; otherwise it derives level stats from public level-1 values and per-level growth, with an explicit warning that star/inspiration modifiers are not yet modeled.
- Re-tested the full-data HTML build in a hidden browser: public data version loaded, the 64-combination example returned the expected feasible result, the base-stat provenance appeared in result details, and the browser log remained clean.

## 2026-11-03 · OP-006

- Captured two Chinese community guides as immutable evidence for UI vocabulary; they are used only for aliases and terminology, not as authoritative numeric rules.
- Added a generated import/OCR dictionary and resolver for stats, slots, rarities, heroes, artifacts and sets.
- Preserved `%` and `+` during normalization after tests exposed that removing them incorrectly merged flat and percentage stats and normal/plus equipment.
- Reduced unresolved alias collisions to one duplicate hero name and four seed/public set-name overlaps; all return `ambiguous` rather than silently choosing an ID.
- Added CLI account validation against the generated game data and client-side HTML checks for unknown hero/artifact definitions, unknown sets and data-version mismatch.

## 2026-11-03 · OP-007

- Added a strict OCR staging schema with record/field confidence, raw labels and source-file provenance.
- Added `finalize-staging`, which converts reviewed OCR observations into a canonical account snapshot through the shared alias dictionary and public game data.
- Added a 17-record synthetic OCR fixture. The finalizer reproduced the canonical 12-item gear inventory exactly, emitted 2 heroes and 3 artifacts, and the resulting account passed semantic validation.
- No OCR accuracy claim is made: the fixture verifies the post-OCR pipeline, not image recognition against the live game UI.

## 2026-11-03 · OP-008

- Extracted the optimizer from browser-only code into `prototype/optimizer-core.mjs` and reused it from both the HTML and a new request-driven CLI.
- Added versioned optimization request/result examples and a result schema.
- Added candidate-policy, excluded-item, all sheet comparison operators, single-stat, weighted-stat and crit-proxy support to the shared core.
- Verified that canonical JSON and the OCR-finalized snapshot both enumerate 64 combinations and select the same six equipment IDs; hidden-browser regression also passed with no console warnings/errors.

## 2026-11-03 · OP-009

- Probed Windows Runtime OCR and confirmed local `zh-Hans-CN` and `en-US` recognizers are installed.
- Added a background-only `Windows.Media.Ocr` adapter that emits UTF-8 JSON, image hash, dimensions, full text, line structure and word bounding boxes without uploading the image.
- Added dictionary-bearing line detection and a reproducible smoke test against the saved optimizer screenshot: 58 OCR lines and 12 relevant lines detected, including the selected hero, artifact, crit-rate label and both rune slots.
- This is not a live-game accuracy result; screen classification and field extraction still require representative game screenshots.

## 2026-11-03 · OP-010

- Added an immutable batch OCR command. It reads a screenshot collection manifest, runs local Windows OCR per image, records every line and rectangle, applies deterministic dictionary detection, and refuses to overwrite existing recognition or derived OCR files.
- Added recognition and Review schemas plus a generated recognition fixture.
- Added a local screenshot Review workbench with task status, local image association, OCR overlays, screenshot classification, candidate correction, accept/reject gating and Review JSON export.
- Verified the full staged-screenshot → batch-OCR → schema-valid recognition path on one synthetic screenshot; 58 OCR lines and 15 dictionary-bearing lines were recorded.
- Verified the Review workbench in a hidden browser at 1536×1024 and 390×844. One unresolved multi-match blocked acceptance until a candidate was selected; the browser log contained no warnings or errors.
- Saved the generated design concept, final browser render and fidelity audit under `outputs/design/`. No game client, login, account data, upload or external publication was used.

## 2026-11-03 · OP-011

- Audited the original user objective requirement by requirement. The audit explicitly marks logged-in account collection and client-validated formulas as incomplete instead of treating the working prototype as the final product.
- Generated a public-domain audit from the compiled source of truth: 351/351 heroes have base/growth/skill records, 677/682 equipment definitions have mapped slots, and 147/147 artifacts have primary attributes plus curves; current-client applicability remains unverified.
- Added a user-initiated emulator ADB screenshot adapter with device probing, authorization checks, explicit serial selection, PNG validation, SHA-256 metadata and overwrite refusal. It performs no taps, memory reads, packet interception or uploads.
- The current environment has no `adb` executable. Pure adapter tests pass, but no real emulator, game client, login or account data was accessed.

## 2026-11-03 · OP-012

- Replaced the optimizer page's fixed crit/attack/HP/accuracy minimum fields with reusable constraint rows covering HP, attack, defense, crit rate, crit damage, accuracy, resistance, enlightenment, skill haste and attack speed.
- Added `>=`, `>`, `<=`, `<` and exact comparisons, multiple constraints on the same stat, add/remove controls, and maximize/minimize for every modeled sheet stat.
- Extended the optimizer core to report minima and maxima for all ten sheet stats and preserve a positive user-facing score for minimize objectives.
- Added generic no-result diagnostics, e.g. an impossible defense requirement reports the enumerated theoretical maximum instead of a fixed-stat special case.
- Hidden IAB QA passed at 1440×900 and 390×844. The mobile constraint row was adjusted twice until labels were fully visible and horizontal overflow was absent; console warnings/errors remained empty.

## 2026-11-03 · OP-013

- Added a guided emulator capture-session program on top of the single-shot ADB adapter.
- Added a versioned seven-stage plan covering channel/version, owned hero list, hero detail golden cases, gear list, 30 gear details, artifact list and 10 artifact details: 50 minimum screenshots total.
- The program performs no navigation or taps. The user manually opens each page and presses Enter; each PNG and metadata record is immutable, and quitting early produces a partial manifest.
- Added capture-plan and capture-session schemas, synthetic fixtures, validation tests and a no-ADB dry-run. The current machine still has no ADB or game client, so live capture remains unverified.

## 2026-11-03 · OP-014

- Captured the Ali213 Chinese hero catalog and official WeGame China product page as immutable `SRC-022` and `SRC-023` snapshots.
- Added a deterministic compiler and schema for a Chinese-name candidate corpus: 70 community hero-name observations and 6 official marketing-page observations, each with source class, immutable snapshot locator and mapping state.
- Measured the actual import-dictionary gap: only 2/351 heroes, 14/147 artifacts and 4/252 sets have non-ASCII aliases.
- Generated six text-similarity review leads, including exact overlaps, apparent truncations and a one-character disagreement. All remain `review_lead_only`; no candidate was assigned to a canonical hero ID or added to the resolver.
- Added a generated coverage report and verification step. No visible browser, client, login, account data or external publication was used.

## 2026-11-03 · OP-015

- Re-audited the repository against the user's actual three-part outcome rather than the existence of scaffolding.
- Confirmed that public-data compilation, canonical account files and HTML/CLI solving are executable, while the real-game screenshot layout parser and full-account completeness proof are still absent.
- Added `outputs/implementation-contract.md` with separate user workflows, data responsibilities, current evidence, missing work and completion gates for the logged-in collector, public-data crawler and HTML optimizer.
- Defined the next implementation order: deliverable file-import MVP, current-client golden screenshots, versioned layout extraction and completeness audit, then formula calibration.

## 2026-11-03 · OP-016

- Added a browser-based account inventory editor for creating/importing `AccountSnapshot` files without a game client.
- The editor supports owned heroes, six-slot gear, artifacts, stat parsing with explicit percent units, stable local item IDs, duplicate/reference validation, deletion, JSON export and one-click handoff to the optimizer through session storage.
- Added a reusable inventory core and regression tests for stat parsing, ID allocation, counts and semantic validation.
- This is the manual/file-import fallback and future collector oracle; it does not change the incomplete status of real logged-in account collection.

## 2026-11-03 · OP-017

- Added deterministic account-snapshot diff and merge semantics keyed by owned hero/item/artifact IDs.
- Re-import can now replace the current inventory or merge it while reporting added, updated, unchanged and missing-from-incoming records per entity type.
- Missing records are preserved by default and explicitly labeled as coverage-ambiguous; a partial screenshot scan is therefore not misinterpreted as an account deletion.
- Merging snapshots from different public-data versions is rejected rather than silently combining incompatible definitions.

## 2026-11-03 · OP-018

- Added optimizer candidate-range controls for all equipped items, the selected hero plus inventory, or inventory-only gear, with optional locked-item exclusion.
- Fixed-slot selections intentionally override candidate filters, matching the user's requirement to pin known gear before solving.
- Result details now compare the selected build with the chosen hero's currently equipped items and identify whether replacement gear comes from inventory or another hero.
- Expanded the synthetic account fixture with equipped/locked state and regression tests for inventory-only search, lock exclusion and fixed-item override.

## 2026-11-03 · OP-019

- Implemented the missing deterministic middle layer from coordinate OCR to `OcrStaging`: capture-type/anchor classification, normalized regions, dictionary fields, integers, constants, stat rows, required-field gates and extraction reports.
- Added a versioned layout-profile schema carrying channel, client build, language and evidence level. The only current profile is explicitly `synthetic_fixture`; it is not presented as a Dragonheir client layout.
- Added three generated 1000×1000 synthetic detail-page cases for hero, gear and artifact. They finalize to one canonical record of each kind; missing required fields and duplicate content fingerprints are rejected in regression tests.
- Added `extract-layout` to the collector CLI and documented the remaining real-client gate: obtain anonymized golden screenshots, create a separate channel/build profile, measure accuracy and solve stable duplicate inventory IDs.

## 2026-11-03 · OP-020

- Audited the original Cartesian-product solver against synthetic 100–1,000 item inventories. The first exact branch-bound attempt still took about 17.5 seconds for 100 items, so it was not accepted as scalable merely because it pruned leaves.
- Added three explicit solver modes: exhaustive, global-exact Top-N branch-and-bound, and heuristic candidate reduction for large spaces. Results now carry search space, reduced space, evaluated/visited counts, pruning counts, and separate Top-N/count/extrema exactness flags.
- Added a reproducible benchmark data source and report. Automatic large-inventory runs completed in roughly 0.5–1.0 seconds on this machine for 100/300/1,000 synthetic items; these runs are explicitly heuristic. A 60-item comparison found the same best score and 18/20 Top-20 overlap in this one fixture, which is evidence rather than a general quality guarantee.
- Added an HTML solver-mode selector and user-facing exact/heuristic language. Hidden-browser QA exercised example import, automatic exhaustive mode, forced heuristic mode and forced exact branch mode; console errors/warnings were empty. A desktop label-wrap/overflow regression found in the first render was fixed and rechecked.

## 2026-11-03 · OP-021

- Added a single resumable collector pipeline covering capture manifest/session input, local OCR, line-level OCR Review application, versioned layout extraction, staging Review, finalization and semantic validation.
- Pipeline state persists input hashes, step status, artifact hashes and an append-only event trail. Completed artifacts are reused only when hashes still match; tampering causes a hard failure instead of silent continuation.
- Unified ordinary screenshot `files[]` and guided ADB `captures[]` manifests. Batch OCR now supports safe resume of a complete recognition bundle and compatible per-image derived evidence after interruption.
- Default execution first stops at `awaiting_ocr_review`, then at `awaiting_staging_review`. The Review UI export is now applied to recognition with job/hash/candidate validation; rejected images are preserved as evidence and skipped by layout extraction. Synthetic auto-finalization remains restricted to `synthetic_fixture`.
- Regression tests cover one-command synthetic finalization, both Review pause/resume points, accepted/rejected/pending/unresolved decisions, rerun/resume, artifact tamper detection, capture-session normalization and Windows OCR resume.

## 2026-11-03 · OP-022

- Added the missing second-stage Review workbench for `machine-staging.json`. It edits hero, gear and artifact fields, supports stat-row add/remove, record add/delete, dictionary datalists and per-record error badges.
- The workbench runs the same canonical finalizer as the pipeline on every edit. Unknown or ambiguous definitions, duplicate stats, invalid slots/sets, malformed confidence values and bad source hashes block export.
- Reviewed staging now carries `human_reviewed`, review time, tool identity and the exact source machine-staging SHA-256. The pipeline verifies this dependency before finalization and refuses unrelated or previously reviewed files.
- Hidden-browser QA loaded the 1-hero/1-gear/1-artifact synthetic staging, blocked export for an unknown hero and unknown stat, restored export after correction, and exercised the download action. At 1280×720 the document matched the viewport with no overflow; console warnings/errors were empty.

## 2026-11-03 · OP-023

- Audited artifact ownership against the compiled public catalog and separated the two previously conflated axes: 0–20 enhancement level controls static sheet stats, while 0–5 refinement controls effect text.
- Renamed the public calculation field to `levelCurve`; all 147 artifacts have complete 0–20 curves and 0–5 effect-level records in the current compiled snapshot, still marked not client-validated.
- Upgraded newly finalized account snapshots to 0.2 with `level`, `refinement` and evidence-preserving `observedStats`. Legacy `stats` remains a compatibility-only override.
- Added deterministic artifact stat resolution: account observations override the public level curve with mismatch warnings; otherwise the curve is used. Conditional effect text and legacy `effectStats` are never silently added to sheet totals.
- Added solver provenance to HTML/CLI results and regression tests for curve lookup, observed override, OCR parity and exact branch-bound parity.
- The first hidden-browser QA exposed that the synthetic artifact layout and staging editor still omitted enhancement level. Both were corrected; the rebuilt fixture now extracts +6 separately from refinement 1. Hidden QA then edited them independently to +20/refinement 5, kept the snapshot exportable, and found no console warnings/errors. The inventory page also rendered all three example artifacts with level, refinement and `账号观测` provenance.

## 2026-11-03 · OP-024

- Promoted all 682 compiled equipment records into the canonical `GameData.equipment` package with stable/external IDs, slot, set linkage, rarity, season, enhancement limit, primary stats and level curves.
- Added equipment aliases to the import dictionary. All 682 definitions resolve by canonical or external ID; only 554 resolve uniquely by display name, while 52 normalized names remain explicit collisions instead of guessed mappings.
- Connected optional `OwnedGear.definitionId` through OCR finalization, CLI/browser validation and the inventory editor. A unique equipment name can derive the public definition and set; slot conflicts block finalization and set conflicts remain warnings.
- Added a generated equipment-model audit/schema and a public-definition selection flow to the HTML inventory editor.
- Added a dated handoff covering architecture, commands, evidence, remaining risk and the next real-client acceptance sequence.
- Hidden-browser inventory QA selected `equipment-532513` (`Northern Gale - Helm+`), auto-filled its helmet slot, set and +20 enhancement limit, saved an owned item linked to the public definition, and rendered the linkage badge with an empty browser error log. QA used a hidden in-app browser because the Browser plugin and a configured local Playwright runtime were absent.

## 2026-11-03 · OP-025

- Exposed the optimizer core's existing `weighted_stats` objective in the HTML instead of limiting users to a single stat or the crit proxy. The editor accepts independent weights for all ten sheet stats and explains that ratio weights operate per displayed 1%.
- Added validation that at least one finite non-zero weight is present and preserved maximize/minimize plus exact/heuristic solver selection.
- Hidden-browser QA loaded the synthetic account, selected the weighted objective with attack weight 1 and crit-damage weight 10 per 1%, exhaustively evaluated 64 builds, and rendered one feasible result scoring `1,556.95`; browser warnings/errors were empty.
- Made public compilation and audit timestamps derive from immutable source snapshots instead of wall-clock build time. Two consecutive full verification runs produced identical SHA-256 values for `game-data.public.json` and `import-dictionary.json`, preventing no-op cross-device Git churn.
- Reconfirmed that this improves configurable calculation only. It does not change the incomplete status of real logged-in account collection or current-client formula validation.

## 2026-11-03 · OP-026

- Added an official-PC candidate capture adapter. `window-screenshot` requires an explicit positive PID, rejects minimized/hidden/no-main-window targets and captures only visible pixels; it records process/window identity, bounds, PNG hash, privacy flags and known limitations.
- Added a dedicated metadata schema/fixture and exposed `window-probe` plus the adapter capability through the collector CLI. The adapter never enumerates all window titles and performs no clicks, login, memory access or packet interception.
- Added `window-session.mjs`, which reuses the 7-stage/minimum-50 capture plan for explicit-PID PC windows, requires a user keypress per screenshot, prevents advancing below step minimums and emits partial rather than falsely complete sessions. Its manifest feeds the existing OCR pipeline through the shared capture normalizer.
- Windows capability probe passed and an invalid PID was confirmed to fail without creating an output file. PC session dry-run and ADB/PC manifest normalization passed. Full repository verification now covers 28 schema artifacts and 21 schema definitions.
- No real game client was present and no existing desktop window was captured. Occlusion, DPI scaling, full-screen rendering and page completeness remain explicit live-client acceptance work.
- Split the PC capture plan from the emulator plan so manifests cannot silently label official-PC evidence as `channel=emulator`; both channel-specific plans now pass schema validation and dry-run checks.
- Added hard channel guards: ADB sessions reject non-emulator plans and PC sessions reject non-`official_pc` plans. Both mismatch paths were exercised and failed before capture.

## 2026-11-03 · OP-027

- Added a post-finalize account completeness gate driven by an independent manual reference. It checks hero/gear/artifact totals, all six gear-slot counts, exact hero/artifact definition sets, duplicate owned IDs, duplicate hero/artifact definitions and unknown public references.
- `audit-account` writes a durable report and exits non-zero on mismatch, separating pipeline completion from collection completeness. The report explicitly limits its claim to agreement with the supplied reference.
- Synthetic regression passes for the exact 2-hero/12-gear/3-artifact fixture and correctly fails after one negative rune is removed or a hero definition is duplicated. No live reference has been supplied, so this is acceptance tooling rather than live completeness evidence.
- Full verification now covers 30 schema artifacts and 23 schema definitions, including both completeness input and report contracts.

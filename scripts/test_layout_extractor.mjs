import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractLayout } from "../collectors/lib/layout-extractor.mjs";
import { finalizeStaging } from "../collectors/lib/finalize-staging.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => readFile(path.join(root, name), "utf8").then(JSON.parse);
const [recognition, profile, dictionary, gameData] = await Promise.all([
  load("examples/ocr-recognition-layout.example.json"),
  load("examples/layout-profile.synthetic.json"),
  load("data/import-dictionary.json"),
  load("data/game-data.public.json")
]);

const result = extractLayout(recognition, profile, { createdAt: "2026-11-03T12:10:00+08:00" });
assert.equal(result.staging.records.length, 3);
assert.equal(result.report.counts.errors, 0);
assert.deepEqual(result.staging.records.map((record) => record.kind), ["hero", "gear", "artifact"]);
assert.equal(result.staging.records[1].fields.enhanceLevel, 16);
assert.equal(result.staging.records[1].fields.stats[1].value, "12%");

const finalized = finalizeStaging(result.staging, dictionary, gameData);
assert.equal(finalized.ok, true, finalized.errors?.join("; "));
assert.equal(finalized.snapshot.ownedHeroes.length, 1);
assert.equal(finalized.snapshot.ownedGear.length, 1);
assert.equal(finalized.snapshot.ownedArtifacts.length, 1);
assert.equal(finalized.snapshot.ownedGear[0].stats.crit_rate, 0.12);
assert.equal(finalized.snapshot.ownedArtifacts[0].level, 6);
assert.equal(finalized.snapshot.ownedArtifacts[0].observedStats.find((entry) => entry.stat === "atk_pct").value, 0.08);

const missingHeroName = structuredClone(recognition);
missingHeroName.images[0].detections = missingHeroName.images[0].detections.filter((entry) => !entry.matches.some((match) => match.kind === "hero"));
const rejected = extractLayout(missingHeroName, profile, { createdAt: "2026-11-03T12:10:00+08:00" });
assert.equal(rejected.staging.records.length, 2);
assert(rejected.report.issues.some((issue) => issue.code === "missing_required_field" && issue.field === "name"));

const missingRequiredStat = structuredClone(recognition);
missingRequiredStat.images[1].lines = missingRequiredStat.images[1].lines.filter((entry) => entry.text !== "27%");
const rejectedStat = extractLayout(missingRequiredStat, profile, { createdAt: "2026-11-03T12:10:00+08:00" });
assert.equal(rejectedStat.staging.records.length, 2);
assert(rejectedStat.report.issues.some((issue) => issue.code === "incomplete_stat_row" && issue.severity === "error"));

const duplicate = structuredClone(recognition);
duplicate.images.push({ ...structuredClone(duplicate.images[1]), sequence: 4, imageSha256: "4".repeat(64) });
const duplicateResult = extractLayout(duplicate, profile, { createdAt: "2026-11-03T12:10:00+08:00" });
assert.equal(duplicateResult.staging.records.length, 3);
assert(duplicateResult.report.issues.some((issue) => issue.code === "duplicate_record_fingerprint"));

console.log("Layout extractor tests passed: 3 kinds, required field/stat rejection, duplicate-fingerprint rejection, and canonical finalization");

#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { finalizeStaging } from "../collectors/lib/finalize-staging.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [staging, dictionary, gameData, expected] = await Promise.all([
  readFile(path.join(ROOT, "examples", "ocr-staging.example.json"), "utf8").then(JSON.parse),
  readFile(path.join(ROOT, "data", "import-dictionary.json"), "utf8").then(JSON.parse),
  readFile(path.join(ROOT, "data", "game-data.public.json"), "utf8").then(JSON.parse),
  readFile(path.join(ROOT, "examples", "account-snapshot.example.json"), "utf8").then(JSON.parse)
]);
const result = finalizeStaging(staging, dictionary, gameData);
if (!result.ok) throw new Error(`Finalization failed: ${result.errors.join("; ")}`);
for (const [key, count] of [["ownedHeroes", 2], ["ownedGear", 12], ["ownedArtifacts", 3]]) {
  if (result.snapshot[key].length !== count) throw new Error(`${key} expected ${count}, got ${result.snapshot[key].length}`);
}
const actualGear = result.snapshot.ownedGear.map(({ sourceConfidence, evidenceRefs, fieldEvidence, ...item }) => item);
assert.deepStrictEqual(actualGear, expected.ownedGear, "Finalized gear does not match the canonical fixture");
for (const collection of [result.snapshot.ownedHeroes, result.snapshot.ownedGear, result.snapshot.ownedArtifacts]) {
  assert(collection.every((entry) => entry.evidenceRefs?.[0]?.sourceFileSha256 === staging.sourceFiles[0].sha256));
  assert(collection.every((entry) => entry.fieldEvidence?.length > 0));
}
const linked = finalizeStaging({
  ...staging,
  records: [{
    kind: "gear", sourceRecordId: "linked-public-gear", confidence: 1, evidenceRefs: staging.records[0].evidenceRefs,
    fields: { name: "Northern Gale - Helm+", slot: "头盔", enhanceLevel: 20, locked: false, stats: [{ label: "生命", value: "8460", confidence: 1 }] }
  }]
}, dictionary, gameData);
assert.equal(linked.ok, true, linked.errors?.join("; "));
assert.equal(linked.snapshot.ownedGear[0].definitionId, "equipment-532513");
assert.equal(linked.snapshot.ownedGear[0].setId, "set-public-f09af0adf29d");
assert.equal(linked.snapshot.ownedGear[0].slot, "helmet");
console.log("OCR staging finalization test passed: canonical parity, evidence provenance and public equipment linkage");

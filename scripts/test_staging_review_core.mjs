#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStagingRecord, prepareReviewedStaging, recordIssueCount, validateReviewedStaging } from "../prototype/staging-review-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => readFile(path.join(root, name), "utf8").then(JSON.parse);
const [staging, dictionary, gameData] = await Promise.all([
  load("examples/ocr-staging-layout.example.json"), load("data/import-dictionary.json"), load("data/game-data.public.json")
]);
const valid = validateReviewedStaging(staging, dictionary, gameData);
assert.equal(valid.valid, true, valid.errors.join("; "));
assert.deepEqual([valid.snapshot.ownedHeroes.length, valid.snapshot.ownedGear.length, valid.snapshot.ownedArtifacts.length], [1, 1, 1]);

const invalid = structuredClone(staging);
invalid.records[0].fields.name = "";
const invalidResult = validateReviewedStaging(invalid, dictionary, gameData);
assert.equal(invalidResult.valid, false);
assert(recordIssueCount(invalid.records[0], invalidResult.errors) > 0);
const invalidConfidence = structuredClone(staging);
invalidConfidence.records[1].fields.stats[0].confidence = 2;
assert.equal(validateReviewedStaging(invalidConfidence, dictionary, gameData).valid, false);

const reviewed = prepareReviewedStaging(staging, "a".repeat(64), "2026-11-03T12:12:00+08:00");
assert.equal(reviewed.review.status, "human_reviewed");
assert.equal(reviewed.review.sourceStagingSha256, "a".repeat(64));
assert.equal(reviewed.records.length, staging.records.length);
assert.throws(() => prepareReviewedStaging(staging, "bad"), /SHA-256/);
assert.equal(createStagingRecord("gear", "manual-gear-001").fields.slot, "helmet");
assert.equal(createStagingRecord("artifact", "manual-artifact-001").fields.refinement, 0);
console.log("Staging Review core tests passed: validation, issue attribution, review provenance, and new-record defaults");

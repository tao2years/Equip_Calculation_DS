#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const collector = path.join(ROOT, "collectors", "account-collector.mjs");
const collectorCli = path.join(ROOT, "collectors", "cli.mjs");

function run(args) {
  const result = spawnSync(process.execPath, [collector, ...args], { cwd: ROOT, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

const defaultPlan = run(["plan", "--channel", "emulator"]);
assert.match(defaultPlan, /"purpose": "full_account"/);
assert.match(defaultPlan, /"all_owned_details": 3/);
const goldenPlan = run(["plan", "--channel", "emulator", "--mode", "golden"]);
assert.match(goldenPlan, /"purpose": "golden_calibration"/);

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "dragonheir-collector-test-"));
try {
  const reportPath = path.join(tempRoot, "completeness-report.json");
  run([
    "audit",
    "--account", path.join(ROOT, "examples", "account-snapshot.example.json"),
    "--reference", path.join(ROOT, "examples", "account-completeness-reference.example.json"),
    "--output", reportPath
  ]);
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  assert.equal(report.status, "passed");
  assert.deepEqual(report.actualCounts, { heroes: 2, gear: 12, artifacts: 3 });

  const missingEvidencePath = path.join(tempRoot, "missing-evidence.json");
  const missingEvidence = JSON.parse(await readFile(path.join(ROOT, "examples", "account-snapshot.example.json"), "utf8"));
  missingEvidence.sourceMethod = "screenshot_ocr";
  await writeFile(missingEvidencePath, JSON.stringify(missingEvidence));
  const validation = spawnSync(process.execPath, [collectorCli, "validate-account", "--input", missingEvidencePath], { cwd: ROOT, encoding: "utf8", windowsHide: true });
  assert.equal(validation.status, 0, validation.stderr);
  const validationResult = JSON.parse(validation.stdout);
  assert.equal(validationResult.valid, false);
  assert(validationResult.structuralErrors.some((entry) => entry.includes("missing source screenshot evidenceRefs")));

  const missingFieldEvidencePath = path.join(tempRoot, "missing-field-evidence.json");
  const missingFieldEvidence = JSON.parse(await readFile(path.join(ROOT, "examples", "account-snapshot-ocr-layout.example.json"), "utf8"));
  for (const entries of [missingFieldEvidence.ownedHeroes, missingFieldEvidence.ownedGear, missingFieldEvidence.ownedArtifacts]) {
    for (const entry of entries) delete entry.fieldEvidence;
  }
  await writeFile(missingFieldEvidencePath, JSON.stringify(missingFieldEvidence));
  const fieldValidation = spawnSync(process.execPath, [collectorCli, "validate-account", "--input", missingFieldEvidencePath], { cwd: ROOT, encoding: "utf8", windowsHide: true });
  const fieldValidationResult = JSON.parse(fieldValidation.stdout);
  assert.equal(fieldValidationResult.valid, false);
  assert(fieldValidationResult.structuralErrors.some((entry) => entry.includes("missing field-level coordinate evidence")));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Unified account collector tests passed: full/golden routing, completeness audit and screenshot evidence validation");

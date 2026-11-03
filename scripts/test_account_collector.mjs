#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const collector = path.join(ROOT, "collectors", "account-collector.mjs");

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
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Unified account collector tests passed: full/golden routing and completeness audit");

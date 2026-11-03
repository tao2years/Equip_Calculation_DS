#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureStepComplete, requiresCoverageConfirmation, summarizeCapturePlan, validateCapturePlan } from "../collectors/lib/capture-plan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [plan, pcPlan, emulatorFull, pcFull] = await Promise.all([
  "emulator-capture-plan.example.json",
  "pc-capture-plan.example.json",
  "emulator-full-account-capture-plan.json",
  "pc-full-account-capture-plan.json"
].map((name) => readFile(path.join(ROOT, "examples", name), "utf8").then(JSON.parse)));
assert.deepEqual(validateCapturePlan(plan), []);
assert.deepEqual(validateCapturePlan(pcPlan), []);
assert.deepEqual(validateCapturePlan(emulatorFull), []);
assert.deepEqual(validateCapturePlan(pcFull), []);
const summary = summarizeCapturePlan(plan);
const pcSummary = summarizeCapturePlan(pcPlan);
assert.equal(summary.steps, 7);
assert.equal(summary.minimumCaptures, 50);
assert.equal(summary.byType.gear_detail, 30);
assert.equal(pcSummary.steps, 7);
assert.equal(pcSummary.minimumCaptures, 50);
assert.equal(pcSummary.byType.gear_detail, 30);
for (const fullPlan of [emulatorFull, pcFull]) {
  const fullSummary = summarizeCapturePlan(fullPlan);
  assert.equal(fullSummary.purpose, "full_account");
  assert.equal(fullSummary.steps, 7);
  assert.equal(fullSummary.coverageRequirements.complete_list, 3);
  assert.equal(fullSummary.coverageRequirements.all_owned_details, 3);
}
const completeListStep = emulatorFull.steps.find((step) => step.coverageRequirement === "complete_list");
assert.equal(requiresCoverageConfirmation(completeListStep), true);
assert.equal(captureStepComplete(completeListStep, completeListStep.minimumCaptures, false), false);
assert.equal(captureStepComplete(completeListStep, completeListStep.minimumCaptures, true), true);
const sampleStep = plan.steps.find((step) => step.coverageRequirement === "minimum_sample");
assert.equal(requiresCoverageConfirmation(sampleStep), false);
assert.equal(captureStepComplete(sampleStep, sampleStep.minimumCaptures, false), true);
assert.ok(validateCapturePlan({ schemaVersion: "0.2.0", planId: "bad", steps: [{ id: "x", captureType: "bad", minimumCaptures: -1 }] }).length >= 5);
console.log(`Capture plan tests passed: two ${summary.minimumCaptures}-screenshot golden plans and two full-account coverage plans`);

#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeCapturePlan, validateCapturePlan } from "../collectors/lib/capture-plan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plan = JSON.parse(await readFile(path.join(ROOT, "examples", "emulator-capture-plan.example.json"), "utf8"));
assert.deepEqual(validateCapturePlan(plan), []);
const summary = summarizeCapturePlan(plan);
assert.equal(summary.steps, 7);
assert.equal(summary.minimumCaptures, 50);
assert.equal(summary.byType.gear_detail, 30);
assert.ok(validateCapturePlan({ schemaVersion: "0.1.0", planId: "bad", steps: [{ id: "x", captureType: "bad", minimumCaptures: -1 }] }).length >= 3);
console.log(`Capture plan tests passed: ${summary.steps} steps, ${summary.minimumCaptures} minimum screenshots`);

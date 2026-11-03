#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [ocr, labels] = await Promise.all([
  readFile(path.join(ROOT, "outputs", "qa", "windows-ocr-prototype.json"), "utf8").then(JSON.parse),
  readFile(path.join(ROOT, "outputs", "qa", "windows-ocr-labels.json"), "utf8").then(JSON.parse)
]);
assert.equal(ocr.engine, "windows.media.ocr");
assert.equal(ocr.language, "zh-Hans-CN");
assert.equal(ocr.input.width, 1264);
assert.equal(ocr.input.height, 981);
assert.ok(ocr.lines.length >= 40, `Expected at least 40 OCR lines, got ${ocr.lines.length}`);
const matches = labels.detections.flatMap((line) => line.matches.map((match) => `${match.kind}:${match.id}`));
for (const expected of ["hero:hero-21760", "artifact:artifact-eyeball-of-the-giant", "stat:crit_rate", "slot:positive_rune", "slot:negative_rune"]) {
  assert.ok(matches.includes(expected), `Expected OCR label detection ${expected}`);
}
console.log(`Windows OCR smoke test passed: ${ocr.lines.length} lines, ${labels.detectionCount} dictionary-bearing lines`);

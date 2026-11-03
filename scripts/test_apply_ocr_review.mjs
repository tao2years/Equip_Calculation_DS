#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyOcrReview } from "../collectors/lib/apply-ocr-review.mjs";
import { extractLayout } from "../collectors/lib/layout-extractor.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => readFile(path.join(root, name), "utf8").then(JSON.parse);
const [recognition, review, profile] = await Promise.all([
  load("examples/ocr-recognition-layout.example.json"),
  load("examples/ocr-review-layout.example.json"),
  load("examples/layout-profile.synthetic.json")
]);

const applied = applyOcrReview(recognition, review, { createdAt: "2026-11-03T12:09:00+08:00" });
assert.deepEqual(applied.report.counts, { total: 3, accepted: 3, rejected: 0 });
assert(applied.recognition.images.every((image) => image.reviewStatus === "accepted"));
assert(applied.recognition.images.every((image) => image.detections.every((detection) => detection.matches.length === 1)));
assert.equal(extractLayout(applied.recognition, profile).staging.records.length, 3);

const rejectedReview = structuredClone(review);
rejectedReview.images[1].reviewStatus = "rejected";
const rejected = applyOcrReview(recognition, rejectedReview, { createdAt: "2026-11-03T12:09:00+08:00" });
const rejectedLayout = extractLayout(rejected.recognition, profile);
assert.deepEqual(rejected.report.counts, { total: 3, accepted: 2, rejected: 1 });
assert.equal(rejectedLayout.staging.records.length, 2);
assert(rejectedLayout.report.issues.some((issue) => issue.code === "review_rejected_image_skipped"));

const pending = structuredClone(review);
pending.images[0].reviewStatus = "pending";
assert.throws(() => applyOcrReview(recognition, pending), /still pending/);
const unresolved = structuredClone(review);
unresolved.images[0].decisions[0].status = "unresolved";
unresolved.images[0].decisions[0].selectedId = null;
assert.throws(() => applyOcrReview(recognition, unresolved), /unresolved line/);
console.log("OCR Review application tests passed: accepted decisions applied, rejected image skipped, pending/unresolved blocked");

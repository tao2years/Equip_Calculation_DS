#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const relative = (name) => path.join(root, name);
const hash = async (name) => createHash("sha256").update(await readFile(relative(name))).digest("hex");
const source = "examples/ocr-recognition-layout.example.json";
const profile = "examples/layout-profile.synthetic.json";
const ocrReview = "examples/ocr-review-layout.example.json";
const reviewedRecognition = "examples/ocr-recognition-reviewed-layout.example.json";
const reviewApplicationReport = "examples/ocr-review-application-report.example.json";
const staging = "examples/ocr-staging-layout.example.json";
const report = "examples/layout-extraction-report.example.json";
const createdAt = "2026-11-03T12:20:00+08:00";

const fixture = {
  schemaVersion: "0.1.0",
  runId: "pipeline-synthetic-layout-job-001-example",
  jobId: "synthetic-layout-job-001",
  createdAt,
  updatedAt: createdAt,
  status: "awaiting_staging_review",
  privacy: { localOnly: true, uploadPerformed: false },
  inputs: {
    source: { path: source, sha256: await hash(source), kind: "recognition_bundle" },
    profile: { path: profile, sha256: await hash(profile), profileId: "synthetic-cn-detail-1000-v1", evidenceLevel: "synthetic_fixture" }
  },
  steps: {
    ocr: { status: "complete", updatedAt: createdAt, detail: "External immutable recognition bundle supplied; OCR execution skipped", artifacts: [{ path: source, sha256: await hash(source) }] },
    ocr_review: { status: "complete", updatedAt: createdAt, detail: "3 accepted, 0 rejected", artifacts: [{ path: ocrReview, sha256: await hash(ocrReview) }, { path: reviewedRecognition, sha256: await hash(reviewedRecognition) }, { path: reviewApplicationReport, sha256: await hash(reviewApplicationReport) }] },
    layout: { status: "complete", updatedAt: createdAt, detail: "3 records, 0 errors, evidence=synthetic_fixture", artifacts: [{ path: staging, sha256: await hash(staging) }, { path: report, sha256: await hash(report) }] },
    staging_review: { status: "waiting", updatedAt: createdAt, detail: "Machine staging requires field-level review; resume with --reviewed-staging <file>", artifacts: [] }
  },
  events: [
    { timestamp: createdAt, step: "ocr", status: "complete", detail: "External immutable recognition bundle supplied; OCR execution skipped" },
    { timestamp: createdAt, step: "ocr_review", status: "complete", detail: "3 accepted, 0 rejected" },
    { timestamp: createdAt, step: "layout", status: "complete", detail: "3 records, 0 errors, evidence=synthetic_fixture" },
    { timestamp: createdAt, step: "staging_review", status: "waiting", detail: "Machine staging requires field-level review; resume with --reviewed-staging <file>" }
  ]
};

const output = relative("examples/collector-pipeline-state.example.json");
await writeFile(output, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
console.log("Built resumable collector pipeline-state fixture");

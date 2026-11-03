#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCaptureManifest } from "../collectors/lib/capture-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pipeline = path.join(root, "collectors", "pipeline.mjs");
const recognition = path.join(root, "examples", "ocr-recognition-layout.example.json");
const profile = path.join(root, "examples", "layout-profile.synthetic.json");
const ocrReview = path.join(root, "examples", "ocr-review-layout.example.json");
const temp = await mkdtemp(path.join(os.tmpdir(), "dragonheir-pipeline-"));

function run(args, expectFailure = false) {
  try {
    const output = execFileSync(process.execPath, [pipeline, ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (expectFailure) throw new Error("Expected pipeline failure");
    return JSON.parse(output);
  } catch (error) {
    if (!expectFailure) throw error;
    return error;
  }
}

async function makeReviewed(machinePath, outputPath) {
  const bytes = await readFile(machinePath);
  const staging = JSON.parse(bytes.toString("utf8"));
  staging.createdAt = "2026-11-03T12:12:00+08:00";
  staging.review = {
    status: "human_reviewed",
    reviewedAt: "2026-11-03T12:12:00+08:00",
    sourceStagingSha256: createHash("sha256").update(bytes).digest("hex"),
    tool: "prototype/staging-review.html"
  };
  await writeFile(outputPath, `${JSON.stringify(staging, null, 2)}\n`, "utf8");
}

try {
  const completeDir = path.join(temp, "complete");
  const common = ["--recognition", recognition, "--profile", profile, "--output", completeDir, "--accept-synthetic-staging"];
  const first = run(common);
  assert.equal(first.status, "complete");
  const account = JSON.parse(await readFile(path.join(completeDir, "account-snapshot.json"), "utf8"));
  assert.deepEqual([account.ownedHeroes.length, account.ownedGear.length, account.ownedArtifacts.length], [1, 1, 1]);
  const firstState = JSON.parse(await readFile(path.join(completeDir, "pipeline-state.json"), "utf8"));
  assert.equal(firstState.status, "complete");
  assert.equal(firstState.steps.layout.status, "complete");
  const second = run(common);
  assert.equal(second.status, "complete");
  assert.equal(second.resumedSteps, 6);

  const tamperedPath = path.join(completeDir, "account-snapshot.json");
  await writeFile(tamperedPath, `${await readFile(tamperedPath, "utf8")} `, "utf8");
  const tampered = run(common, true);
  assert.match(String(tampered.stderr || tampered.message), /artifact hash changed/);

  const reviewDir = path.join(temp, "review-gate");
  const reviewCommon = ["--recognition", recognition, "--profile", profile, "--output", reviewDir];
  const waiting = run(reviewCommon);
  assert.equal(waiting.status, "awaiting_ocr_review");
  assert.equal(await readFile(path.join(reviewDir, "pipeline-state.json"), "utf8").then(JSON.parse).then((state) => state.status), "awaiting_ocr_review");
  const waitingForStaging = run([...reviewCommon, "--ocr-review", ocrReview]);
  assert.equal(waitingForStaging.status, "awaiting_staging_review");
  const reviewedForResume = path.join(temp, "reviewed-for-resume.json");
  await makeReviewed(path.join(reviewDir, "machine-staging.json"), reviewedForResume);
  const resumed = run([...reviewCommon, "--ocr-review", ocrReview, "--reviewed-staging", reviewedForResume]);
  assert.equal(resumed.status, "complete");

  const externalReviewDir = path.join(temp, "external-review");
  const reviewedCopy = path.join(temp, "reviewed-copy.json");
  const externalBase = ["--recognition", recognition, "--profile", profile, "--output", externalReviewDir, "--ocr-review", ocrReview];
  assert.equal(run(externalBase).status, "awaiting_staging_review");
  await makeReviewed(path.join(externalReviewDir, "machine-staging.json"), reviewedCopy);
  const externalArgs = [...externalBase, "--reviewed-staging", reviewedCopy];
  assert.equal(run(externalArgs).status, "complete");
  await writeFile(reviewedCopy, `${await readFile(reviewedCopy, "utf8")} `, "utf8");
  const changedReview = run(externalArgs, true);
  assert.match(String(changedReview.stderr || changedReview.message), /Reviewed staging changed after finalization/);

  const session = JSON.parse(await readFile(path.join(root, "examples", "capture-session.example.json"), "utf8"));
  const normalized = normalizeCaptureManifest(session);
  assert.equal(normalized.jobId, session.sessionId);
  assert.equal(normalized.files[0].localPath, session.captures[0].localPath);
  assert.equal(normalized.files[0].reviewStatus, "pending");
  const pcSession = JSON.parse(await readFile(path.join(root, "examples", "pc-window-capture-session.example.json"), "utf8"));
  const normalizedPc = normalizeCaptureManifest(pcSession);
  assert.equal(normalizedPc.jobId, pcSession.sessionId);
  assert.equal(normalizedPc.files[0].localPath, pcSession.captures[0].localPath);
  assert.equal(normalizedPc.files[0].captureType, "unclassified");
  console.log("Collector pipeline tests passed: one-command finalize, safe resume, tamper detection, review gate, and ADB/PC capture-session normalization");
} finally {
  await rm(temp, { recursive: true, force: true });
}

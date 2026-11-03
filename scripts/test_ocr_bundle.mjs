#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  console.log("OCR bundle test skipped: Windows.Media.Ocr is Windows-only");
  process.exit(0);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = await mkdtemp(path.join(os.tmpdir(), "dragonheir-ocr-bundle-"));
try {
  const input = path.join(temp, "input");
  const staging = path.join(temp, "staging");
  await mkdir(input);
  await copyFile(path.join(ROOT, "outputs", "design", "prototype-browser-verified.png"), path.join(input, "prototype.png"));
  execFileSync(process.execPath, [path.join(ROOT, "collectors", "cli.mjs"), "stage-screenshots", "--input", input, "--output", staging, "--job-id", "smoke"], { stdio: "ignore" });
  const manifest = path.join(staging, "smoke", "manifest.json");
  execFileSync(process.execPath, [path.join(ROOT, "collectors", "cli.mjs"), "ocr-bundle", "--manifest", manifest], { stdio: "ignore" });
  const recognition = JSON.parse(await readFile(path.join(staging, "smoke", "recognition.json"), "utf8"));
  if (recognition.images.length !== 1) throw new Error(`Expected one image, got ${recognition.images.length}`);
  if (recognition.images[0].lineCount < 40) throw new Error(`Unexpected OCR line count ${recognition.images[0].lineCount}`);
  if (recognition.images[0].detections.length < 12) throw new Error(`Unexpected detection count ${recognition.images[0].detections.length}`);
  let overwriteRejected = false;
  try {
    execFileSync(process.execPath, [path.join(ROOT, "collectors", "cli.mjs"), "ocr-bundle", "--manifest", manifest], { stdio: "ignore" });
  } catch { overwriteRejected = true; }
  if (!overwriteRejected) throw new Error("ocr-bundle did not reject an overwrite");
  const resumedRaw = execFileSync(process.execPath, [path.join(ROOT, "collectors", "cli.mjs"), "ocr-bundle", "--manifest", manifest, "--resume"], { encoding: "utf8" });
  const resumed = JSON.parse(resumedRaw);
  if (!resumed.resumed) throw new Error("ocr-bundle did not reuse a complete recognition bundle under --resume");

  const stagedManifest = JSON.parse(await readFile(manifest, "utf8"));
  const sessionManifest = {
    schemaVersion: "0.1.0",
    sessionId: "smoke-session",
    planId: "smoke-plan",
    startedAt: stagedManifest.createdAt,
    completedAt: stagedManifest.createdAt,
    status: "complete",
    sourceMethod: "emulator_adb_user_initiated_screenshot",
    privacy: { localOnly: true, uploadPerformed: false },
    device: { serial: "synthetic", model: null, product: null },
    captures: stagedManifest.files.map((file) => ({
      sequence: file.sequence,
      stepId: "smoke",
      captureType: "unclassified",
      capturedAt: stagedManifest.createdAt,
      localPath: file.localPath,
      metadataPath: `${file.localPath}.metadata.json`,
      mediaType: file.mediaType,
      byteLength: file.byteLength,
      sha256: file.sha256
    })),
    stepResults: [{ stepId: "smoke", captured: 1, minimumCaptures: 1, complete: true }]
  };
  const sessionPath = path.join(staging, "smoke", "capture-session.json");
  await writeFile(sessionPath, `${JSON.stringify(sessionManifest, null, 2)}\n`, "utf8");
  const sessionOutput = path.join(staging, "smoke", "recognition-session.json");
  execFileSync(process.execPath, [path.join(ROOT, "collectors", "cli.mjs"), "ocr-bundle", "--manifest", sessionPath, "--output", sessionOutput, "--resume"], { stdio: "ignore" });
  const fromSession = JSON.parse(await readFile(sessionOutput, "utf8"));
  if (fromSession.jobId !== "smoke-session" || fromSession.images.length !== 1) throw new Error("capture-session manifest was not normalized into OCR input");
  console.log(`OCR bundle test passed: ${recognition.images[0].lineCount} lines, ${recognition.images[0].detections.length} detections, overwrite rejected, resume and capture-session input accepted`);
} finally {
  await rm(temp, { recursive: true, force: true });
}

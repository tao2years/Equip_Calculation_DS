#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { normalizeCaptureManifest } from "./lib/capture-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "collectors", "cli.mjs");

function option(name, fallback = null) {
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function requirePath(name) {
  const value = option(name);
  if (!value) throw new Error(`Missing --${name}`);
  return path.resolve(value);
}

async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}

async function fileHash(target) {
  return createHash("sha256").update(await readFile(target)).digest("hex");
}

async function atomicJson(target, value) {
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

function runCli(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `Collector CLI failed: ${args[0]}`).trim());
  return JSON.parse(result.stdout);
}

const manifestPath = option("manifest") ? path.resolve(option("manifest")) : null;
const recognitionInput = option("recognition") ? path.resolve(option("recognition")) : null;
if (Boolean(manifestPath) === Boolean(recognitionInput)) throw new Error("Provide exactly one of --manifest or --recognition");
const profilePath = requirePath("profile");
const outputDir = requirePath("output");
const ocrReviewPath = option("ocr-review") ? path.resolve(option("ocr-review")) : null;
const reviewedStagingPath = option("reviewed-staging") ? path.resolve(option("reviewed-staging")) : null;
const acceptSyntheticStaging = flag("accept-synthetic-staging");
await mkdir(outputDir, { recursive: true });

const profile = JSON.parse(await readFile(profilePath, "utf8"));
let sourceJobId;
if (manifestPath) {
  const rawManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const normalized = normalizeCaptureManifest(rawManifest);
  sourceJobId = normalized.jobId;
  if (Array.isArray(rawManifest.captures) && rawManifest.status !== "complete" && !flag("allow-partial")) {
    throw new Error(`Capture session status is ${rawManifest.status}; use --allow-partial only for an intentional partial extraction`);
  }
} else {
  const recognition = JSON.parse(await readFile(recognitionInput, "utf8"));
  sourceJobId = recognition.jobId;
}

if (acceptSyntheticStaging && profile.evidenceLevel !== "synthetic_fixture") {
  throw new Error("--accept-synthetic-staging is restricted to profiles with evidenceLevel=synthetic_fixture");
}

const statePath = path.join(outputDir, "pipeline-state.json");
const inputIdentity = {
  source: { path: manifestPath || recognitionInput, sha256: await fileHash(manifestPath || recognitionInput), kind: manifestPath ? "capture_manifest" : "recognition_bundle" },
  profile: { path: profilePath, sha256: await fileHash(profilePath), profileId: profile.profileId, evidenceLevel: profile.evidenceLevel }
};
let state;
if (await exists(statePath)) {
  state = JSON.parse(await readFile(statePath, "utf8"));
  if (state.inputs.source.sha256 !== inputIdentity.source.sha256 || state.inputs.profile.sha256 !== inputIdentity.profile.sha256) {
    throw new Error("Pipeline input hashes differ from the existing run; use a new output directory instead of mutating evidence");
  }
} else {
  state = {
    schemaVersion: "0.1.0",
    runId: `pipeline-${sourceJobId}-${randomUUID().slice(0, 8)}`,
    jobId: sourceJobId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "running",
    privacy: { localOnly: true, uploadPerformed: false },
    inputs: inputIdentity,
    steps: {},
    events: []
  };
  await atomicJson(statePath, state);
}

async function saveEvent(step, status, detail, artifacts = []) {
  const timestamp = new Date().toISOString();
  state.updatedAt = timestamp;
  state.steps[step] = { status, updatedAt: timestamp, detail, artifacts };
  state.events.push({ timestamp, step, status, detail });
  await atomicJson(statePath, state);
}

async function reusable(step, targets) {
  const record = state.steps[step];
  if (record?.status !== "complete" || record.artifacts?.length !== targets.length) return false;
  for (let index = 0; index < targets.length; index += 1) {
    if (!(await exists(targets[index]))) return false;
    if (record.artifacts[index].sha256 !== await fileHash(targets[index])) throw new Error(`Completed ${step} artifact hash changed: ${targets[index]}`);
  }
  return true;
}

async function artifactRecords(targets) {
  return Promise.all(targets.map(async (target) => ({ path: target, sha256: await fileHash(target) })));
}

try {
  let recognitionPath = recognitionInput;
  if (manifestPath) {
    recognitionPath = path.join(outputDir, "recognition.json");
    if (!(await reusable("ocr", [recognitionPath]))) {
      if (await exists(recognitionPath)) throw new Error(`Untracked OCR output exists: ${recognitionPath}`);
      const result = runCli(["ocr-bundle", "--manifest", manifestPath, "--language", profile.language, "--output", recognitionPath, "--resume"]);
      await saveEvent("ocr", "complete", `${result.images} images, ${result.detections} dictionary detections`, await artifactRecords([recognitionPath]));
    }
  } else if (!state.steps.ocr) {
    await saveEvent("ocr", "complete", "External immutable recognition bundle supplied; OCR execution skipped", await artifactRecords([recognitionPath]));
  } else {
    await reusable("ocr", [recognitionPath]);
  }

  let layoutRecognition = recognitionPath;
  if (!acceptSyntheticStaging) {
    if (!ocrReviewPath) {
      state.status = "awaiting_ocr_review";
      await saveEvent("ocr_review", "waiting", "Recognition requires line-level Review; resume with --ocr-review <review.json>");
      console.log(JSON.stringify({ status: state.status, state: statePath, recognition: recognitionPath, next: "Open prototype/review.html, export Review JSON, then rerun with --ocr-review <review.json>" }, null, 2));
      process.exit(0);
    }
    layoutRecognition = path.join(outputDir, "reviewed-recognition.json");
    const reviewApplicationReport = path.join(outputDir, "ocr-review-application-report.json");
    if (!(await reusable("ocr_review", [ocrReviewPath, layoutRecognition, reviewApplicationReport]))) {
      if (state.steps.layout?.status === "complete") throw new Error("OCR Review changed after layout extraction; use a new output directory to preserve derivation history");
      if (await exists(layoutRecognition) || await exists(reviewApplicationReport)) throw new Error("Untracked reviewed-recognition output exists");
      const result = runCli(["apply-review", "--recognition", recognitionPath, "--review", ocrReviewPath, "--output", layoutRecognition, "--report", reviewApplicationReport]);
      await saveEvent("ocr_review", "complete", `${result.counts.accepted} accepted, ${result.counts.rejected} rejected`, await artifactRecords([ocrReviewPath, layoutRecognition, reviewApplicationReport]));
    }
  } else if (!(await reusable("ocr_review", [recognitionPath]))) {
    await saveEvent("ocr_review", "complete", "Synthetic recognition explicitly accepted for fixture validation", await artifactRecords([recognitionPath]));
  }

  const machineStaging = path.join(outputDir, "machine-staging.json");
  const extractionReport = path.join(outputDir, "layout-extraction-report.json");
  if (!(await reusable("layout", [machineStaging, extractionReport]))) {
    if (await exists(machineStaging) || await exists(extractionReport)) throw new Error("Untracked layout output exists; use a new output directory or restore the recorded artifact hash");
    const result = runCli(["extract-layout", "--recognition", layoutRecognition, "--profile", profilePath, "--output", machineStaging, "--report", extractionReport]);
    await saveEvent("layout", "complete", `${result.counts.extractedRecords} records, ${result.counts.errors} errors, evidence=${result.evidenceLevel}`, await artifactRecords([machineStaging, extractionReport]));
  }

  let finalStaging = reviewedStagingPath;
  if (!finalStaging && acceptSyntheticStaging) finalStaging = machineStaging;
  if (!finalStaging) {
    state.status = "awaiting_staging_review";
    await saveEvent("staging_review", "waiting", "Machine staging requires field-level review; resume with --reviewed-staging <file>");
    console.log(JSON.stringify({ status: state.status, state: statePath, machineStaging, extractionReport, next: `Review staging, then rerun with --reviewed-staging <corrected.json>` }, null, 2));
    process.exit(0);
  }

  const reviewed = JSON.parse(await readFile(finalStaging, "utf8"));
  if (reviewed.jobId !== sourceJobId) throw new Error(`Reviewed staging jobId ${reviewed.jobId} does not match ${sourceJobId}`);
  if (!(acceptSyntheticStaging && !reviewedStagingPath) && reviewed.review?.status !== "human_reviewed") {
    throw new Error("Reviewed staging must contain review.status=human_reviewed; export it from prototype/staging-review.html");
  }
  if (!(acceptSyntheticStaging && !reviewedStagingPath) && reviewed.review.sourceStagingSha256 !== await fileHash(machineStaging)) {
    throw new Error("Reviewed staging sourceStagingSha256 does not match this run's machine-staging.json");
  }
  const reviewedHash = await fileHash(finalStaging);
  const priorReviewHash = state.steps.staging_review?.status === "complete" ? state.steps.staging_review.artifacts?.[0]?.sha256 : null;
  if (priorReviewHash && priorReviewHash !== reviewedHash && state.steps.finalize?.status === "complete") {
    throw new Error("Reviewed staging changed after finalization; use a new output directory to preserve the previous account derivation");
  }
  await saveEvent("staging_review", "complete", acceptSyntheticStaging && !reviewedStagingPath ? "Synthetic machine staging explicitly accepted for fixture validation" : "External reviewed staging supplied", [{ path: finalStaging, sha256: reviewedHash }]);

  const accountOutput = path.join(outputDir, "account-snapshot.json");
  if (!(await reusable("finalize", [accountOutput]))) {
    if (await exists(accountOutput)) throw new Error(`Untracked account output exists: ${accountOutput}`);
    const result = runCli(["finalize-staging", "--input", finalStaging, "--output", accountOutput]);
    await saveEvent("finalize", "complete", `${result.counts.heroes} heroes, ${result.counts.gear} gear, ${result.counts.artifacts} artifacts`, await artifactRecords([accountOutput]));
  }

  const validationOutput = path.join(outputDir, "validation-report.json");
  if (!(await reusable("validate", [validationOutput]))) {
    if (await exists(validationOutput)) throw new Error(`Untracked validation output exists: ${validationOutput}`);
    const validation = runCli(["validate-account", "--input", accountOutput]);
    if (!validation.valid) throw new Error(`Final account validation failed: ${[...validation.structuralErrors, ...validation.semanticErrors].join("; ")}`);
    await writeFile(validationOutput, `${JSON.stringify(validation, null, 2)}\n`, { flag: "wx" });
    await saveEvent("validate", "complete", `valid with ${validation.warnings.length} warnings`, await artifactRecords([validationOutput]));
  }

  state.status = "complete";
  state.updatedAt = new Date().toISOString();
  await atomicJson(statePath, state);
  console.log(JSON.stringify({ status: state.status, state: statePath, account: accountOutput, validation: validationOutput, resumedSteps: Object.values(state.steps).filter((step) => step.status === "complete").length }, null, 2));
} catch (error) {
  state.status = "failed";
  await saveEvent("pipeline", "failed", error.message);
  console.error(JSON.stringify({ error: error.message, state: statePath }, null, 2));
  process.exitCode = 1;
}

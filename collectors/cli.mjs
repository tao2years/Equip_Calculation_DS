#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access, copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createResolver } from "./lib/normalize.mjs";
import { finalizeStaging } from "./lib/finalize-staging.mjs";
import { detectDictionaryLabels, lineBounds } from "./lib/detect-labels.mjs";
import { captureAdbPng, probeAdb, selectAdbDevice } from "./lib/adb.mjs";
import { extractLayout } from "./lib/layout-extractor.mjs";
import { normalizeCaptureManifest } from "./lib/capture-manifest.mjs";
import { applyOcrReview } from "./lib/apply-ocr-review.mjs";
import { auditAccountCompleteness } from "./lib/audit-account.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_GAME_DATA = path.join(ROOT, "data", "game-data.public.json");
const DEFAULT_DICTIONARY = path.join(ROOT, "data", "import-dictionary.json");
const WINDOWS_OCR_SCRIPT = path.join(ROOT, "collectors", "windows-ocr.ps1");
const WINDOWS_WINDOW_CAPTURE_SCRIPT = path.join(ROOT, "collectors", "windows-window-capture.ps1");

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) continue;
    const [rawKey, inline] = token.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    options[key] = inline ?? (rest[index + 1]?.startsWith("--") ? true : rest[++index]) ?? true;
  }
  return { command, options };
}

function requireOption(options, name) {
  if (!options[name] || options[name] === true) throw new Error(`Missing --${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  return path.resolve(String(options[name]));
}

function requireText(options, name) {
  if (!options[name] || options[name] === true) throw new Error(`Missing --${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  return String(options[name]);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateSnapshot(snapshot) {
  const errors = [];
  for (const key of ["schemaVersion", "snapshotId", "createdAt", "gameDataVersionId", "sourceMethod"]) {
    if (!snapshot[key]) errors.push(`missing ${key}`);
  }
  for (const key of ["ownedHeroes", "ownedGear", "ownedArtifacts"]) {
    if (!Array.isArray(snapshot[key])) errors.push(`${key} must be an array`);
  }
  const ids = new Set();
  for (const [kind, entries, key] of [
    ["hero", snapshot.ownedHeroes || [], "ownedHeroId"],
    ["gear", snapshot.ownedGear || [], "ownedItemId"],
    ["artifact", snapshot.ownedArtifacts || [], "ownedArtifactId"]
  ]) {
    for (const entry of entries) {
      if (!entry[key]) errors.push(`${kind} entry missing ${key}`);
      else if (ids.has(`${kind}:${entry[key]}`)) errors.push(`duplicate ${kind} id ${entry[key]}`);
      else ids.add(`${kind}:${entry[key]}`);
    }
  }
  return errors;
}

function validateAgainstGameData(snapshot, gameData) {
  const errors = [];
  const warnings = [];
  const heroIds = new Set(gameData.heroes.map((entry) => entry.id));
  const artifactIds = new Set(gameData.artifacts.map((entry) => entry.id));
  const equipmentIds = new Set((gameData.equipment || []).map((entry) => entry.id));
  const setIds = new Set(gameData.sets.map((entry) => entry.id));
  const statIds = new Set(gameData.statDefinitions.map((entry) => entry.id));
  const slotIds = new Set(gameData.slotDefinitions.map((entry) => entry.id));
  for (const hero of snapshot.ownedHeroes || []) {
    if (!heroIds.has(hero.heroDefinitionId)) errors.push(`unknown heroDefinitionId ${hero.heroDefinitionId}`);
  }
  for (const artifact of snapshot.ownedArtifacts || []) {
    if (!artifactIds.has(artifact.artifactDefinitionId)) errors.push(`unknown artifactDefinitionId ${artifact.artifactDefinitionId}`);
    for (const key of Object.keys(artifact.stats || {})) if (!statIds.has(key)) warnings.push(`artifact ${artifact.ownedArtifactId} uses unmodeled stat ${key}`);
    for (const entry of artifact.observedStats || []) if (!statIds.has(entry.stat)) warnings.push(`artifact ${artifact.ownedArtifactId} uses unmodeled observed stat ${entry.stat}`);
  }
  for (const item of snapshot.ownedGear || []) {
    if (item.definitionId && !equipmentIds.has(item.definitionId)) errors.push(`unknown equipment definitionId ${item.definitionId}`);
    if (!slotIds.has(item.slot) || item.slot === "artifact") errors.push(`gear ${item.ownedItemId} uses invalid slot ${item.slot}`);
    if (item.setId && !setIds.has(item.setId)) warnings.push(`gear ${item.ownedItemId} references unknown setId ${item.setId}`);
    for (const key of Object.keys(item.stats || {})) if (!statIds.has(key)) warnings.push(`gear ${item.ownedItemId} uses unmodeled stat ${key}`);
  }
  if (snapshot.gameDataVersionId !== gameData.dataVersion.id) {
    warnings.push(`snapshot gameDataVersionId=${snapshot.gameDataVersionId} differs from loaded ${gameData.dataVersion.id}`);
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

async function writeJsonExclusive(output, value) {
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

async function pathExists(target) {
  try { await access(target); return true; } catch { return false; }
}

async function commandInit(options) {
  const output = requireOption(options, "output");
  const now = new Date().toISOString();
  const snapshot = {
    schemaVersion: "0.1.0",
    snapshotId: options.snapshotId || `manual-${now.replace(/[:.]/g, "-")}`,
    createdAt: now,
    gameDataVersionId: options.gameDataVersion || "public-catalog-unknown",
    sourceMethod: "manual",
    sourceFiles: [],
    ownedHeroes: [],
    ownedGear: [],
    ownedArtifacts: []
  };
  await writeJsonExclusive(output, snapshot);
  return { command: "init", output, snapshotId: snapshot.snapshotId };
}

async function commandImportJson(options) {
  const input = requireOption(options, "input");
  const output = requireOption(options, "output");
  const snapshot = JSON.parse(await readFile(input, "utf8"));
  const errors = validateSnapshot(snapshot);
  if (errors.length) throw new Error(`Snapshot validation failed: ${errors.join("; ")}`);
  const gameDataPath = options.gameData ? path.resolve(String(options.gameData)) : DEFAULT_GAME_DATA;
  const semantic = validateAgainstGameData(snapshot, JSON.parse(await readFile(gameDataPath, "utf8")));
  if (semantic.errors.length) throw new Error(`Game-data validation failed: ${semantic.errors.join("; ")}`);
  await writeJsonExclusive(output, snapshot);
  return {
    command: "import-json",
    input,
    output,
    counts: {
      heroes: snapshot.ownedHeroes.length,
      gear: snapshot.ownedGear.length,
      artifacts: snapshot.ownedArtifacts.length
    },
    warnings: semantic.warnings
  };
}

async function commandValidateAccount(options) {
  const input = requireOption(options, "input");
  const gameDataPath = options.gameData ? path.resolve(String(options.gameData)) : DEFAULT_GAME_DATA;
  const [snapshot, gameData] = await Promise.all([
    readFile(input, "utf8").then(JSON.parse),
    readFile(gameDataPath, "utf8").then(JSON.parse)
  ]);
  const structuralErrors = validateSnapshot(snapshot);
  const semantic = structuralErrors.length ? { errors: [], warnings: [] } : validateAgainstGameData(snapshot, gameData);
  return {
    command: "validate-account",
    input,
    gameData: gameDataPath,
    valid: structuralErrors.length === 0 && semantic.errors.length === 0,
    structuralErrors,
    semanticErrors: semantic.errors,
    warnings: semantic.warnings
  };
}

async function commandAuditAccount(options) {
  const input = requireOption(options, "input");
  const referencePath = requireOption(options, "reference");
  const output = requireOption(options, "output");
  if (await pathExists(output)) throw new Error(`Refusing to overwrite account audit: ${output}`);
  const gameDataPath = options.gameData ? path.resolve(String(options.gameData)) : DEFAULT_GAME_DATA;
  const [snapshot, reference, gameData] = await Promise.all([
    readFile(input, "utf8").then(JSON.parse),
    readFile(referencePath, "utf8").then(JSON.parse),
    readFile(gameDataPath, "utf8").then(JSON.parse)
  ]);
  const report = auditAccountCompleteness(snapshot, reference, gameData);
  await writeJsonExclusive(output, report);
  return { command: "audit-account", input, reference: referencePath, output, status: report.status, counts: report.actualCounts, errors: report.errors };
}

async function commandResolve(options) {
  const kind = requireText(options, "kind");
  const text = requireText(options, "text");
  const dictionaryPath = options.dictionary ? path.resolve(String(options.dictionary)) : DEFAULT_DICTIONARY;
  const dictionary = JSON.parse(await readFile(dictionaryPath, "utf8"));
  if (!dictionary.entities[kind]) throw new Error(`Unknown dictionary kind ${kind}`);
  return createResolver(dictionary).resolve(kind, text);
}

async function commandFinalizeStaging(options) {
  const input = requireOption(options, "input");
  const output = requireOption(options, "output");
  const gameDataPath = options.gameData ? path.resolve(String(options.gameData)) : DEFAULT_GAME_DATA;
  const dictionaryPath = options.dictionary ? path.resolve(String(options.dictionary)) : DEFAULT_DICTIONARY;
  const [staging, dictionary, gameData] = await Promise.all([
    readFile(input, "utf8").then(JSON.parse),
    readFile(dictionaryPath, "utf8").then(JSON.parse),
    readFile(gameDataPath, "utf8").then(JSON.parse)
  ]);
  const result = finalizeStaging(staging, dictionary, gameData);
  if (!result.ok) throw new Error(`Staging finalization failed: ${result.errors.join("; ")}`);
  await writeJsonExclusive(output, result.snapshot);
  return {
    command: "finalize-staging",
    input,
    output,
    counts: {
      heroes: result.snapshot.ownedHeroes.length,
      gear: result.snapshot.ownedGear.length,
      artifacts: result.snapshot.ownedArtifacts.length
    },
    warnings: result.warnings
  };
}

async function commandExtractLayout(options) {
  const recognitionPath = requireOption(options, "recognition");
  const profilePath = requireOption(options, "profile");
  const output = requireOption(options, "output");
  const reportOutput = requireOption(options, "report");
  if (output === reportOutput) throw new Error("--output and --report must be different files");
  if (await pathExists(output)) throw new Error(`Refusing to overwrite existing OCR staging: ${output}`);
  if (await pathExists(reportOutput)) throw new Error(`Refusing to overwrite existing extraction report: ${reportOutput}`);
  const [recognition, profile] = await Promise.all([
    readFile(recognitionPath, "utf8").then(JSON.parse),
    readFile(profilePath, "utf8").then(JSON.parse)
  ]);
  const result = extractLayout(recognition, profile, {
    gameDataVersionId: options.gameDataVersion ? String(options.gameDataVersion) : undefined
  });
  await writeJsonExclusive(output, result.staging);
  await writeJsonExclusive(reportOutput, result.report);
  return {
    command: "extract-layout",
    recognition: recognitionPath,
    profile: profilePath,
    output,
    report: reportOutput,
    counts: result.report.counts,
    evidenceLevel: result.report.evidenceLevel
  };
}

async function commandApplyReview(options) {
  const recognitionPath = requireOption(options, "recognition");
  const reviewPath = requireOption(options, "review");
  const output = requireOption(options, "output");
  const reportOutput = requireOption(options, "report");
  if (output === reportOutput) throw new Error("--output and --report must be different files");
  if (await pathExists(output)) throw new Error(`Refusing to overwrite reviewed recognition: ${output}`);
  if (await pathExists(reportOutput)) throw new Error(`Refusing to overwrite review application report: ${reportOutput}`);
  const [recognition, review] = await Promise.all([
    readFile(recognitionPath, "utf8").then(JSON.parse),
    readFile(reviewPath, "utf8").then(JSON.parse)
  ]);
  const result = applyOcrReview(recognition, review);
  await writeJsonExclusive(output, result.recognition);
  await writeJsonExclusive(reportOutput, result.report);
  return { command: "apply-review", recognition: recognitionPath, review: reviewPath, output, report: reportOutput, counts: result.report.counts };
}

function runWindowsOcr(arguments_) {
  const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", WINDOWS_OCR_SCRIPT, ...arguments_], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "Windows OCR failed").trim());
  return result.stdout.trim();
}

function runWindowsWindowCapture(arguments_) {
  const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", WINDOWS_WINDOW_CAPTURE_SCRIPT, ...arguments_], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "Windows window capture failed").trim());
  return result.stdout.trim();
}

async function commandOcrImage(options) {
  if (process.platform !== "win32") throw new Error("The bundled Windows.Media.Ocr adapter requires Windows");
  const input = requireOption(options, "input");
  const output = requireOption(options, "output");
  const language = String(options.language || "zh-Hans-CN");
  runWindowsOcr(["-InputPath", input, "-OutputPath", output, "-LanguageTag", language]);
  const payload = JSON.parse(await readFile(output, "utf8"));
  return {
    command: "ocr-image",
    input,
    output,
    engine: payload.engine,
    language: payload.language,
    dimensions: { width: payload.input.width, height: payload.input.height },
    lines: payload.lines.length
  };
}

async function commandAdbProbe(options) {
  const adbPath = options.adb ? path.resolve(String(options.adb)) : "adb";
  return { command: "adb-probe", ...probeAdb(adbPath) };
}

async function commandAdbScreenshot(options) {
  const output = requireOption(options, "output");
  if (path.extname(output).toLowerCase() !== ".png") throw new Error("--output must use a .png extension");
  if (await pathExists(output)) throw new Error(`Refusing to overwrite existing screenshot: ${output}`);
  const metadataOutput = options.metadata ? path.resolve(String(options.metadata)) : `${output}.metadata.json`;
  if (await pathExists(metadataOutput)) throw new Error(`Refusing to overwrite existing screenshot metadata: ${metadataOutput}`);
  const adbPath = options.adb ? path.resolve(String(options.adb)) : "adb";
  const capability = probeAdb(adbPath);
  if (!capability.executable) throw new Error(`ADB is unavailable: ${capability.reason}`);
  const device = selectAdbDevice(capability.devices, options.serial ? String(options.serial) : null);
  const allowedTypes = new Set(["unclassified", "hero_list", "hero_detail", "gear_list", "gear_detail", "artifact_list", "artifact_detail"]);
  const captureType = String(options.captureType || "unclassified");
  if (!allowedTypes.has(captureType)) throw new Error(`Invalid --capture-type ${captureType}`);
  const bytes = captureAdbPng(adbPath, device.serial);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, bytes, { flag: "wx" });
  const metadata = {
    schemaVersion: "0.1.0",
    capturedAt: new Date().toISOString(),
    sourceMethod: "emulator_adb_user_initiated_screenshot",
    privacy: { localOnly: true, uploadPerformed: false },
    device: { serial: device.serial, model: device.properties.model || null, product: device.properties.product || null },
    captureType,
    image: { localName: path.basename(output), mediaType: "image/png", byteLength: bytes.length, sha256: sha256(bytes) },
    limitations: "This capture proves only visible pixels. It does not identify game fields until OCR, layout extraction and human review succeed."
  };
  await writeJsonExclusive(metadataOutput, metadata);
  return { command: "adb-screenshot", output, metadata: metadataOutput, serial: device.serial, captureType, bytes: bytes.length, sha256: metadata.image.sha256 };
}

async function commandWindowProbe() {
  if (process.platform !== "win32") return { command: "window-probe", available: false, reason: "Windows only" };
  return { command: "window-probe", ...JSON.parse(runWindowsWindowCapture(["-Probe"])) };
}

async function commandWindowScreenshot(options) {
  if (process.platform !== "win32") throw new Error("Visible-window capture requires Windows");
  const output = requireOption(options, "output");
  if (path.extname(output).toLowerCase() !== ".png") throw new Error("--output must use a .png extension");
  const processId = Number(requireText(options, "pid"));
  if (!Number.isInteger(processId) || processId <= 0) throw new Error("--pid must be a positive integer");
  const metadata = options.metadata ? path.resolve(String(options.metadata)) : `${output}.metadata.json`;
  const captureType = String(options.captureType || "unclassified");
  const result = JSON.parse(runWindowsWindowCapture(["-ProcessId", String(processId), "-OutputPath", output, "-MetadataPath", metadata, "-CaptureType", captureType]));
  return { command: "window-screenshot", processId, captureType, ...result };
}

async function commandOcrBundle(options) {
  if (process.platform !== "win32") throw new Error("The bundled Windows.Media.Ocr adapter requires Windows");
  const manifestPath = requireOption(options, "manifest");
  const language = String(options.language || "zh-Hans-CN");
  const dictionaryPath = options.dictionary ? path.resolve(String(options.dictionary)) : DEFAULT_DICTIONARY;
  const [rawManifest, dictionary] = await Promise.all([
    readFile(manifestPath, "utf8").then(JSON.parse),
    readFile(dictionaryPath, "utf8").then(JSON.parse)
  ]);
  const manifest = normalizeCaptureManifest(rawManifest);
  const jobDir = path.dirname(manifestPath);
  const output = options.output ? path.resolve(String(options.output)) : path.join(jobDir, "recognition.json");
  const resume = Boolean(options.resume);
  if (await pathExists(output)) {
    if (!resume) throw new Error(`Refusing to overwrite existing recognition bundle: ${output}`);
    const existing = JSON.parse(await readFile(output, "utf8"));
    if (existing.jobId !== manifest.jobId || existing.language !== language) throw new Error(`Existing recognition bundle is incompatible with resume: ${output}`);
    if (existing.images.length !== manifest.files.length || existing.images.some((image, index) => image.imageSha256 !== manifest.files[index]?.sha256 || image.sequence !== manifest.files[index]?.sequence)) {
      throw new Error(`Existing recognition bundle does not match the current capture manifest: ${output}`);
    }
    return { command: "ocr-bundle", manifest: manifestPath, output, images: existing.images.length, detections: existing.images.reduce((sum, image) => sum + image.detections.length, 0), resumed: true };
  }
  const derivedDir = path.join(jobDir, "derived", "windows-ocr");
  await mkdir(derivedDir, { recursive: true });
  const images = [];
  let detectionCount = 0;
  for (const file of manifest.files || []) {
    const input = path.resolve(jobDir, file.localPath);
    const output = path.join(derivedDir, `${String(file.sequence).padStart(4, "0")}.json`);
    let ocr;
    if (await pathExists(output)) {
      if (!resume) throw new Error(`Refusing to overwrite derived OCR evidence: ${output}`);
      ocr = JSON.parse(await readFile(output, "utf8"));
      if (ocr.input?.sha256 !== file.sha256 || ocr.language !== language) throw new Error(`Derived OCR evidence is incompatible with resume: ${output}`);
    } else {
      runWindowsOcr(["-InputPath", input, "-OutputPath", output, "-LanguageTag", language]);
      ocr = JSON.parse(await readFile(output, "utf8"));
    }
    const labels = detectDictionaryLabels(ocr, dictionary);
    detectionCount += labels.detectionCount;
    images.push({
      sequence: file.sequence,
      originalName: file.originalName,
      imageLocalPath: file.localPath.replaceAll("\\", "/"),
      imageSha256: file.sha256,
      mediaType: file.mediaType,
      captureType: file.captureType,
      reviewStatus: file.reviewStatus,
      ocrLocalPath: path.relative(jobDir, output).replaceAll("\\", "/"),
      width: ocr.input.width,
      height: ocr.input.height,
      lineCount: ocr.lines.length,
      detections: labels.detections,
      lines: ocr.lines.map((line, lineIndex) => ({ lineIndex, text: line.text, boundingRect: lineBounds(line.words) }))
    });
  }
  const recognition = {
    schemaVersion: "0.1.0",
    jobId: manifest.jobId,
    createdAt: new Date().toISOString(),
    sourceManifest: path.basename(manifestPath),
    privacy: manifest.privacy,
    engine: "Windows.Media.Ocr",
    language,
    images
  };
  await writeJsonExclusive(output, recognition);
  return { command: "ocr-bundle", manifest: manifestPath, output, images: images.length, detections: detectionCount };
}

async function commandStageScreenshots(options) {
  const input = requireOption(options, "input");
  const output = requireOption(options, "output");
  const allowed = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp"]);
  const entries = (await readdir(input, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && allowed.has(path.extname(entry.name).toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!entries.length) throw new Error(`No supported screenshots found in ${input}`);

  const jobId = options.jobId || `capture-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const evidenceDir = path.join(output, jobId, "evidence");
  await mkdir(evidenceDir, { recursive: true });
  const files = [];
  for (const entry of entries) {
    const sourcePath = path.join(input, entry.name);
    const bytes = await readFile(sourcePath);
    const digest = sha256(bytes);
    const extension = path.extname(entry.name).toLowerCase();
    const localName = `${String(files.length + 1).padStart(4, "0")}-${digest.slice(0, 12)}${extension}`;
    await copyFile(sourcePath, path.join(evidenceDir, localName));
    files.push({
      sequence: files.length + 1,
      originalName: entry.name,
      localPath: `evidence/${localName}`,
      mediaType: extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg",
      byteLength: bytes.length,
      sha256: digest,
      captureType: "unclassified",
      reviewStatus: "pending"
    });
  }
  const manifest = {
    schemaVersion: "0.1.0",
    jobId,
    createdAt: new Date().toISOString(),
    sourceMethod: "screenshot_ocr",
    inputMode: "user_supplied_screenshot_bundle",
    privacy: { localOnly: true, containsPotentialAccountData: true },
    status: "staged_waiting_for_classification_and_ocr",
    files,
    extraction: { adapter: null, adapterVersion: null, completedAt: null, fieldCount: 0 },
    review: { completedAt: null, unresolvedFields: null }
  };
  const manifestPath = path.join(output, jobId, "manifest.json");
  await writeJsonExclusive(manifestPath, manifest);
  return { command: "stage-screenshots", manifest: manifestPath, files: files.length, jobId };
}

async function commandProbe() {
  let windowsOcr = { id: "windows-ocr", executable: false, capability: "local image-to-text OCR", reason: "non-Windows platform" };
  if (process.platform === "win32") {
    try {
      const probe = JSON.parse(runWindowsOcr(["-Probe"]));
      windowsOcr = { id: "windows-ocr", executable: probe.available, capability: "local image-to-text OCR with bounding boxes", selectedLanguage: probe.selectedLanguage, availableLanguages: probe.availableLanguages };
    } catch (error) {
      windowsOcr = { id: "windows-ocr", executable: false, capability: "local image-to-text OCR", reason: error.message };
    }
  }
  const adb = probeAdb();
  let windowCapture = { id: "pc-window-screenshot", executable: false, capability: "explicit visible-window screenshot without input automation", reason: "non-Windows platform" };
  if (process.platform === "win32") {
    try {
      const probe = JSON.parse(runWindowsWindowCapture(["-Probe"]));
      windowCapture = { id: "pc-window-screenshot", executable: probe.available, capability: "explicit visible-window screenshot without input automation", adapter: probe.adapter };
    } catch (error) {
      windowCapture = { id: "pc-window-screenshot", executable: false, capability: "explicit visible-window screenshot without input automation", reason: error.message };
    }
  }
  return {
    command: "probe",
    platform: process.platform,
    node: process.version,
    adapters: [
      { id: "manual", executable: true, capability: "create an empty editable AccountSnapshot" },
      { id: "json-file", executable: true, capability: "validate and normalize an existing AccountSnapshot" },
      { id: "alias-resolver", executable: true, capability: "resolve OCR/import labels for stats, slots, heroes, artifacts, sets, and rarities" },
      { id: "screenshot-bundle", executable: true, capability: "immutably stage and hash screenshots independently of the selected OCR engine" },
      { id: "ocr-bundle", executable: windowsOcr.executable, capability: "batch local OCR into a non-overwriting recognition bundle with line coordinates and dictionary hits" },
      { id: "layout-extractor", executable: true, capability: "convert coordinate OCR into reviewable staging records through a versioned, channel-specific layout profile" },
      { id: "ocr-review-application", executable: true, capability: "apply accepted line-level Review decisions to an immutable recognition bundle before layout extraction" },
      { id: "staging-finalizer", executable: true, capability: "convert reviewed OCR staging records into a canonical AccountSnapshot" },
      windowsOcr,
      { id: "adb-screenshot", executable: adb.executable, capability: "user-initiated emulator screenshot capture without taps, memory access or packet interception", reason: adb.executable ? undefined : adb.reason, authorizedDevices: adb.authorizedDevices || 0 },
      windowCapture,
      { id: "visible-ui", executable: false, capability: "requires target client, channel review, screen map, and golden screenshots" },
      { id: "official-api", executable: false, capability: "no verified official account export/API discovered" }
    ]
  };
}

function help() {
  return {
    usage: [
      "node collectors/cli.mjs probe",
      "node collectors/cli.mjs init --output account.json --game-data-version public-catalog-2026-11-03",
      "node collectors/cli.mjs import-json --input account.json --output normalized.json",
      "node collectors/cli.mjs validate-account --input account.json",
      "node collectors/cli.mjs audit-account --input account.json --reference manual-reference.json --output completeness-report.json",
      "node collectors/cli.mjs resolve --kind artifact --text 巨人眼球",
      "node collectors/cli.mjs extract-layout --recognition recognition.json --profile layout-profile.json --output ocr-staging.json --report extraction-report.json",
      "node collectors/cli.mjs apply-review --recognition recognition.json --review review.json --output reviewed-recognition.json --report review-application-report.json",
      "node collectors/cli.mjs finalize-staging --input ocr-staging.json --output account.json",
      "node collectors/cli.mjs ocr-image --input screenshot.png --output raw-ocr.json",
      "node collectors/cli.mjs adb-probe",
      "node collectors/cli.mjs adb-screenshot --output capture.png --capture-type gear_detail [--serial emulator-5554]",
      "node collectors/cli.mjs window-probe",
      "node collectors/cli.mjs window-screenshot --pid 1234 --output capture.png --capture-type hero_detail",
      "node collectors/cli.mjs stage-screenshots --input screenshots --output staging",
      "node collectors/cli.mjs ocr-bundle --manifest staging/<job>/manifest.json"
    ],
    note: "The current collector never logs in, reads process memory, intercepts traffic, or uploads account data."
  };
}

const { command, options } = parseArgs(process.argv.slice(2));
try {
  let result;
  if (command === "probe") result = await commandProbe();
  else if (command === "init") result = await commandInit(options);
  else if (command === "import-json") result = await commandImportJson(options);
  else if (command === "validate-account") result = await commandValidateAccount(options);
  else if (command === "audit-account") result = await commandAuditAccount(options);
  else if (command === "resolve") result = await commandResolve(options);
  else if (command === "extract-layout") result = await commandExtractLayout(options);
  else if (command === "apply-review") result = await commandApplyReview(options);
  else if (command === "finalize-staging") result = await commandFinalizeStaging(options);
  else if (command === "ocr-image") result = await commandOcrImage(options);
  else if (command === "adb-probe") result = await commandAdbProbe(options);
  else if (command === "adb-screenshot") result = await commandAdbScreenshot(options);
  else if (command === "window-probe") result = await commandWindowProbe(options);
  else if (command === "window-screenshot") result = await commandWindowScreenshot(options);
  else if (command === "ocr-bundle") result = await commandOcrBundle(options);
  else if (command === "stage-screenshots") result = await commandStageScreenshots(options);
  else result = help();
  console.log(JSON.stringify(result, null, 2));
  if (result?.command === "audit-account" && result.status !== "passed") process.exitCode = 2;
} catch (error) {
  console.error(JSON.stringify({ error: error.message, command }, null, 2));
  process.exitCode = 1;
}

#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { summarizeCapturePlan, validateCapturePlan } from "./lib/capture-plan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CAPTURE_SCRIPT = path.join(ROOT, "collectors", "windows-window-capture.ps1");

function option(name, fallback = null) {
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--") ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`) || process.argv.some((value) => value === `--${name}=true`);
}

function safeId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "capture";
}

async function writeJsonExclusive(target, value) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

function captureWindow(processId, output, metadata, captureType) {
  const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", CAPTURE_SCRIPT,
    "-ProcessId", String(processId), "-OutputPath", output, "-MetadataPath", metadata, "-CaptureType", captureType], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "Window capture failed").trim());
  return JSON.parse(result.stdout.trim());
}

const planPath = option("plan");
if (!planPath) throw new Error("Missing --plan capture-plan.json");
const plan = JSON.parse(await readFile(path.resolve(planPath), "utf8"));
const planErrors = validateCapturePlan(plan);
if (planErrors.length) throw new Error(`Capture plan validation failed: ${planErrors.join("; ")}`);
const summary = summarizeCapturePlan(plan);

if (hasFlag("dry-run")) {
  console.log(JSON.stringify({ command: "pc-window-capture-session", dryRun: true, summary, steps: plan.steps }, null, 2));
  process.exit(0);
}

if (process.platform !== "win32") throw new Error("PC window capture session requires Windows");
const processId = Number(option("pid"));
if (!Number.isInteger(processId) || processId <= 0) throw new Error("Missing or invalid --pid");
const outputRoot = option("output");
if (!outputRoot) throw new Error("Missing --output directory");

const sessionId = `${safeId(plan.planId)}-pc-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const sessionDir = path.join(path.resolve(outputRoot), sessionId);
const evidenceDir = path.join(sessionDir, "evidence");
await mkdir(evidenceDir, { recursive: true });
await writeJsonExclusive(path.join(sessionDir, "plan.json"), plan);

const session = {
  schemaVersion: "0.1.0",
  sessionId,
  planId: plan.planId,
  startedAt: new Date().toISOString(),
  completedAt: null,
  status: "running",
  sourceMethod: "official_pc_visible_window_user_initiated_screenshot",
  privacy: { localOnly: true, uploadPerformed: false },
  target: { processId },
  captures: [],
  stepResults: []
};

const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
let sequence = 0;
let quitEarly = false;
try {
  console.log(`Session ${sessionId}: ${summary.steps} steps, minimum ${summary.minimumCaptures} screenshots`);
  console.log("No clicks, login or navigation will be performed. Navigate in the game window yourself.");
  for (const step of plan.steps) {
    let captured = 0;
    console.log(`\n[${step.id}] ${step.title}`);
    console.log(step.instructions);
    while (true) {
      const answer = (await prompt.question("Enter=capture, n=next step, q=finish partial session: ")).trim().toLowerCase();
      if (answer === "q") { quitEarly = true; break; }
      if (answer === "n") {
        if (captured < step.minimumCaptures) {
          console.log(`Need at least ${step.minimumCaptures} captures for this step; currently ${captured}. Use q to finish as partial.`);
          continue;
        }
        break;
      }
      if (answer) {
        console.log("Unknown command. Press Enter to capture, n to advance, or q to finish partial.");
        continue;
      }
      sequence += 1;
      const stem = `${String(sequence).padStart(4, "0")}-${safeId(step.id)}`;
      const imageName = `${stem}.png`;
      const metadataName = `${stem}.json`;
      const imagePath = path.join(evidenceDir, imageName);
      const metadataPath = path.join(evidenceDir, metadataName);
      captureWindow(processId, imagePath, metadataPath, step.captureType);
      const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
      captured += 1;
      session.captures.push({
        sequence,
        stepId: step.id,
        captureType: step.captureType,
        capturedAt: metadata.capturedAt,
        localPath: `evidence/${imageName}`,
        metadataPath: `evidence/${metadataName}`,
        mediaType: metadata.image.mediaType,
        byteLength: metadata.image.byteLength,
        sha256: metadata.image.sha256
      });
      console.log(`Captured ${imageName}`);
    }
    session.stepResults.push({ stepId: step.id, captured, minimumCaptures: step.minimumCaptures, complete: captured >= step.minimumCaptures });
    if (quitEarly) break;
  }
} finally {
  prompt.close();
}

session.completedAt = new Date().toISOString();
session.status = !quitEarly && session.stepResults.length === plan.steps.length && session.stepResults.every((step) => step.complete) ? "complete" : "partial";
await writeJsonExclusive(path.join(sessionDir, "manifest.json"), session);
console.log(JSON.stringify({ command: "pc-window-capture-session", sessionDir, status: session.status, captures: session.captures.length, completedSteps: session.stepResults.filter((step) => step.complete).length }, null, 2));

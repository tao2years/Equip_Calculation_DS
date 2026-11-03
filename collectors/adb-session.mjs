#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { captureAdbPng, probeAdb, selectAdbDevice } from "./lib/adb.mjs";
import { summarizeCapturePlan, validateCapturePlan } from "./lib/capture-plan.mjs";

function option(name, fallback = null) {
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--") ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`) || process.argv.some((value) => value === `--${name}=true`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "capture";
}

async function writeJsonExclusive(target, value) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

const planPath = option("plan");
if (!planPath) throw new Error("Missing --plan capture-plan.json");
const plan = JSON.parse(await readFile(path.resolve(planPath), "utf8"));
const planErrors = validateCapturePlan(plan);
if (planErrors.length) throw new Error(`Capture plan validation failed: ${planErrors.join("; ")}`);
if (plan.channel !== "emulator") throw new Error(`ADB session requires a channel=emulator plan; received ${plan.channel}`);
const summary = summarizeCapturePlan(plan);

if (hasFlag("dry-run")) {
  console.log(JSON.stringify({ command: "adb-capture-session", dryRun: true, summary, steps: plan.steps }, null, 2));
  process.exit(0);
}

const outputRoot = option("output");
if (!outputRoot) throw new Error("Missing --output directory");
const adbPath = option("adb", "adb");
const capability = probeAdb(adbPath);
if (!capability.executable) throw new Error(`ADB is unavailable: ${capability.reason}`);
const device = selectAdbDevice(capability.devices, option("serial"));
const sessionId = `${safeId(plan.planId)}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
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
  sourceMethod: "emulator_adb_user_initiated_screenshot",
  privacy: { localOnly: true, uploadPerformed: false },
  device: { serial: device.serial, model: device.properties.model || null, product: device.properties.product || null },
  captures: [],
  stepResults: []
};

const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
let sequence = 0;
let quitEarly = false;
try {
  console.log(`Session ${sessionId}: ${summary.steps} steps, minimum ${summary.minimumCaptures} screenshots`);
  console.log("No taps or navigation will be performed. Navigate in the emulator yourself.");
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
      const bytes = captureAdbPng(adbPath, device.serial);
      const digest = sha256(bytes);
      sequence += 1;
      captured += 1;
      const stem = `${String(sequence).padStart(4, "0")}-${safeId(step.id)}-${digest.slice(0, 12)}`;
      const imageName = `${stem}.png`;
      const metadataName = `${stem}.json`;
      await writeFile(path.join(evidenceDir, imageName), bytes, { flag: "wx" });
      const record = {
        sequence,
        stepId: step.id,
        captureType: step.captureType,
        capturedAt: new Date().toISOString(),
        localPath: `evidence/${imageName}`,
        metadataPath: `evidence/${metadataName}`,
        mediaType: "image/png",
        byteLength: bytes.length,
        sha256: digest
      };
      await writeJsonExclusive(path.join(evidenceDir, metadataName), { ...record, sessionId, device: session.device, instructions: step.instructions });
      session.captures.push(record);
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
console.log(JSON.stringify({ command: "adb-capture-session", sessionDir, status: session.status, captures: session.captures.length, completedSteps: session.stepResults.filter((step) => step.complete).length }, null, 2));

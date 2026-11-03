#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2];

function option(name, fallback = null) {
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--") ? process.argv[index + 1] : fallback;
}

function flag(name) { return process.argv.includes(`--${name}`); }
function required(name) {
  const value = option(name);
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

function run(script, args) {
  const result = spawnSync(process.execPath, [path.join(ROOT, script), ...args], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
    stdio: "inherit"
  });
  if (result.status !== 0) throw new Error(`${script} failed with exit code ${result.status}`);
}

function channelConfig() {
  const channel = required("channel");
  if (channel === "emulator") return { channel, script: "collectors/adb-session.mjs", plan: "examples/emulator-capture-plan.example.json" };
  if (channel === "official_pc") return { channel, script: "collectors/window-session.mjs", plan: "examples/pc-capture-plan.example.json" };
  throw new Error(`Unsupported --channel=${channel}; expected emulator or official_pc`);
}

if (!command || flag("help") || command === "help") {
  console.log(`Dragonheir account collector

Commands:
  plan    --channel emulator|official_pc
  capture --channel emulator|official_pc --output <dir> [--serial <adb>] [--pid <number>]
  process --manifest <manifest.json> --profile <layout.json> --output <dir> [--ocr-review <json>] [--reviewed-staging <json>]
  status  --state <pipeline-state.json>

The collector never logs in, clicks, reads process memory or intercepts traffic. Capture is user-driven. Processing stops at two mandatory human Review gates.`);
  process.exit(0);
}

if (command === "plan") {
  const config = channelConfig();
  run(config.script, ["--plan", path.join(ROOT, config.plan), "--dry-run"]);
} else if (command === "capture") {
  const config = channelConfig();
  const args = ["--plan", path.join(ROOT, config.plan), "--output", path.resolve(required("output"))];
  if (config.channel === "emulator" && option("serial")) args.push("--serial", option("serial"));
  if (config.channel === "emulator" && option("adb")) args.push("--adb", option("adb"));
  if (config.channel === "official_pc") args.push("--pid", required("pid"));
  run(config.script, args);
} else if (command === "process") {
  const args = [
    "--manifest", path.resolve(required("manifest")),
    "--profile", path.resolve(required("profile")),
    "--output", path.resolve(required("output"))
  ];
  if (option("ocr-review")) args.push("--ocr-review", path.resolve(option("ocr-review")));
  if (option("reviewed-staging")) args.push("--reviewed-staging", path.resolve(option("reviewed-staging")));
  if (flag("allow-partial")) args.push("--allow-partial");
  run("collectors/pipeline.mjs", args);
} else if (command === "status") {
  const statePath = path.resolve(required("state"));
  const state = JSON.parse(await readFile(statePath, "utf8"));
  const waiting = Object.entries(state.steps || {}).find(([, step]) => step.status === "waiting");
  console.log(JSON.stringify({
    runId: state.runId,
    jobId: state.jobId,
    status: state.status,
    completedSteps: Object.entries(state.steps || {}).filter(([, step]) => step.status === "complete").map(([name]) => name),
    waitingStep: waiting?.[0] || null,
    waitingDetail: waiting?.[1]?.detail || null,
    updatedAt: state.updatedAt,
    state: statePath
  }, null, 2));
} else {
  throw new Error(`Unknown command: ${command}`);
}

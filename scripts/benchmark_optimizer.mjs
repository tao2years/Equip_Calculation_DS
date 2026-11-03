#!/usr/bin/env node

import { performance } from "node:perf_hooks";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { enumerateBuilds, SLOT_IDS } from "../prototype/optimizer-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function option(name, fallback = null) {
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function deterministicGear(total) {
  const setIds = ["set-barbarian", "set-predator", "set-goblin", "set-guardian", null];
  const gear = [];
  for (let index = 0; index < total; index += 1) {
    const slotIndex = index % SLOT_IDS.length;
    const ordinal = Math.floor(index / SLOT_IDS.length);
    gear.push({
      ownedItemId: `benchmark-${String(index).padStart(5, "0")}`,
      slot: SLOT_IDS[slotIndex],
      setId: setIds[(ordinal + slotIndex) % setIds.length],
      enhanceLevel: 16,
      stats: {
        atk_flat: 20 + ((ordinal * 17 + slotIndex * 11) % 90),
        atk_pct: ((ordinal * 7 + slotIndex * 3) % 22) / 100,
        hp_flat: 100 + ((ordinal * 193 + slotIndex * 71) % 1200),
        hp_pct: ((ordinal * 5 + slotIndex * 2) % 20) / 100,
        def_flat: 10 + ((ordinal * 13 + slotIndex * 5) % 75),
        def_pct: ((ordinal * 11 + slotIndex * 3) % 18) / 100,
        crit_rate: ((ordinal * 3 + slotIndex) % 14) / 100,
        crit_damage: ((ordinal * 9 + slotIndex * 4) % 30) / 100,
        accuracy: (ordinal * 7 + slotIndex * 3) % 40
      },
      locked: false,
      equippedBy: null
    });
  }
  return gear;
}

const [gameData, baseAccount] = await Promise.all([
  readFile(path.join(root, "data", "game-data.public.json"), "utf8").then(JSON.parse),
  readFile(path.join(root, "examples", "account-snapshot.example.json"), "utf8").then(JSON.parse)
]);
const sizes = String(option("sizes", "100,300,1000")).split(",").map(Number).filter((value) => Number.isInteger(value) && value >= 6);
const runs = [];
for (const size of sizes) {
  const account = { ...baseAccount, snapshotId: `benchmark-${size}`, ownedGear: deterministicGear(size) };
  const started = performance.now();
  const result = enumerateBuilds({
    gameData,
    account,
    ownedHeroId: baseAccount.ownedHeroes[0].ownedHeroId,
    artifactId: baseAccount.ownedArtifacts[0].ownedArtifactId,
    constraints: [
      { stat: "crit_rate", op: ">=", value: 0.5, layer: "sheet" },
      { stat: "accuracy", op: ">=", value: 60, layer: "sheet" }
    ],
    objective: { kind: "crit_proxy", direction: "maximize" },
    limit: 20,
    solverMode: "auto"
  });
  const durationMs = performance.now() - started;
  runs.push({
    inventoryItems: size,
    candidatesBySlot: Object.fromEntries(SLOT_IDS.map((slot) => [slot, account.ownedGear.filter((item) => item.slot === slot).length])),
    searchSpace: result.searchSpace,
    reducedSearchSpace: result.solver.reducedSearchSpace || result.searchSpace,
    evaluatedBuilds: result.solver.evaluatedBuilds,
    visitedNodes: result.solver.visitedNodes,
    prunedByFeasibility: result.solver.prunedByFeasibility,
    prunedByScore: result.solver.prunedByScore,
    solverMode: result.solver.mode,
    topNExact: result.solver.topNExact,
    validCountExact: result.solver.validCountExact,
    extremaExact: result.solver.extremaExact,
    returnedResults: result.results.length,
    durationMs: Number(durationMs.toFixed(2))
  });
  console.log(`${size} items: ${result.solver.mode}, ${result.solver.evaluatedBuilds}/${result.searchSpace} leaves, ${durationMs.toFixed(2)} ms`);
}

const qualityRuns = [];
for (const size of String(option("quality-sizes", "60")).split(",").map(Number).filter((value) => Number.isInteger(value) && value >= 6)) {
  const account = { ...baseAccount, snapshotId: `benchmark-quality-${size}`, ownedGear: deterministicGear(size) };
  const request = {
    gameData, account,
    ownedHeroId: baseAccount.ownedHeroes[0].ownedHeroId,
    artifactId: baseAccount.ownedArtifacts[0].ownedArtifactId,
    constraints: [
      { stat: "crit_rate", op: ">=", value: 0.5, layer: "sheet" },
      { stat: "accuracy", op: ">=", value: 60, layer: "sheet" }
    ],
    objective: { kind: "crit_proxy", direction: "maximize" },
    limit: 20
  };
  const exactStarted = performance.now();
  const exact = enumerateBuilds({ ...request, solverMode: "branch_and_bound" });
  const exactMs = performance.now() - exactStarted;
  const heuristicStarted = performance.now();
  const heuristic = enumerateBuilds({ ...request, solverMode: "heuristic_candidate_cap", heuristicCandidateCap: 8 });
  const heuristicMs = performance.now() - heuristicStarted;
  const exactIds = new Set(exact.results.map((entry) => entry.gear.map((item) => item.ownedItemId).join("|")));
  const overlap = heuristic.results.filter((entry) => exactIds.has(entry.gear.map((item) => item.ownedItemId).join("|"))).length;
  const exactBest = exact.results[0]?.score ?? null;
  const heuristicBest = heuristic.results[0]?.score ?? null;
  qualityRuns.push({
    inventoryItems: size,
    searchSpace: exact.searchSpace,
    heuristicReducedSearchSpace: heuristic.solver.reducedSearchSpace,
    exactDurationMs: Number(exactMs.toFixed(2)),
    heuristicDurationMs: Number(heuristicMs.toFixed(2)),
    exactBestScore: exactBest,
    heuristicBestScore: heuristicBest,
    bestScoreGapPct: exactBest == null || heuristicBest == null ? null : Number((((exactBest - heuristicBest) / Math.abs(exactBest || 1)) * 100).toFixed(6)),
    top20Overlap: overlap
  });
  console.log(`quality ${size}: best gap ${qualityRuns.at(-1).bestScoreGapPct}%, top20 overlap ${overlap}/20`);
}

const payload = {
  schemaVersion: "0.1.0",
  generatedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, cpu: os.cpus()[0]?.model || "unknown" },
  fixture: {
    synthetic: true,
    distribution: "round-robin across six slots with deterministic pseudo-varied stats and four executable public set IDs",
    objective: "maximize crit_proxy",
    constraints: ["crit_rate >= 0.5", "accuracy >= 60"],
    resultLimit: 20
  },
  runs,
  qualityRuns,
  interpretation: "Synthetic scalability evidence only. Exact branch-and-bound Top-N parity is regression-tested against exhaustive search on small fixtures; heuristic quality is separately compared with exact search. This is not real-account or formula-accuracy validation."
};

const jsonOutput = option("output-json");
if (jsonOutput) await writeFile(path.resolve(jsonOutput), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
const markdownOutput = option("output-md");
if (markdownOutput) {
  const lines = [
    "# 求解器合成规模基准", "", `生成：${payload.generatedAt}`, "",
    "> 本报告只验证软件搜索规模，不验证游戏公式或真实账号性能。Top N 的精确性在小样本上与完整穷举逐项对照。", "",
    "| 背包装备 | 理论组合 | 实际叶节点 | 模式 | 用时 ms | Top N | 满足数量精确 | 极值精确 |", "|---:|---:|---:|---|---:|---|---|---|",
    ...runs.map((run) => `| ${run.inventoryItems} | ${run.searchSpace} | ${run.evaluatedBuilds} | ${run.solverMode} | ${run.durationMs} | ${run.topNExact ? "精确" : "非精确"} | ${run.validCountExact ? "是" : "否"} | ${run.extremaExact ? "是" : "安全边界"} |`),
    "", "## 小规模质量对照", "",
    "| 背包装备 | 原始组合 | 缩减后组合 | 精确用时 ms | 启发式用时 ms | 最优分差 | Top 20 重合 |", "|---:|---:|---:|---:|---:|---:|---:|",
    ...qualityRuns.map((run) => `| ${run.inventoryItems} | ${run.searchSpace} | ${run.heuristicReducedSearchSpace} | ${run.exactDurationMs} | ${run.heuristicDurationMs} | ${run.bestScoreGapPct}% | ${run.top20Overlap}/20 |`),
    "", "## 解释", "",
    "- 小于阈值的组合继续完整枚举，因此满足数量和全局极值都是精确值。",
    "- 中等规模可强制使用分支定界：Top N 全局精确，但发生分数剪枝后，满足数量只报告已确认下界。",
    "- 大规模默认先缩减候选再搜索，结果属于启发式，不能称为全局最高；用户仍可显式选择较慢的精确模式。",
    "- 分支定界或候选缩减模式中的 maxima/minima 是安全边界，不能在 UI 中称为已穷举得到的精确可达极值。",
    "- 本基准使用合成词条分布，真实背包仍需导入后复测。"
  ];
  await writeFile(path.resolve(markdownOutput), `${lines.join("\n")}\n`, "utf8");
}

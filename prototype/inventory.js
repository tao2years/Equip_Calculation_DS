import {
  INVENTORY_SESSION_KEY,
  createEmptySnapshot,
  formatStats,
  diffAccountSnapshots,
  mergeAccountSnapshots,
  nextOwnedId,
  parseStats,
  snapshotCounts,
  validateEditableSnapshot
} from "./inventory-core.mjs";
import { resolveArtifactStats } from "./optimizer-core.mjs";

const SLOT_LABELS = {
  helmet: "头盔", weapon: "武器", chest: "胸甲", gloves: "手套",
  positive_rune: "正位符文", negative_rune: "负位符文"
};
const state = { gameData: null, account: null, evidenceImages: new Map(), activeEvidence: null };
const byId = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
}[character]));

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function heroName(definition) { return definition?.names?.zh || definition?.names?.en || definition?.id || "未知角色"; }
function artifactName(definition) { return definition?.names?.zh || definition?.names?.en || definition?.id || "未知神器"; }
function equipmentName(definition) { return definition?.names?.zh || definition?.names?.en || definition?.id || "未知装备"; }
function setName(setId) {
  const definition = state.gameData.sets.find((entry) => entry.id === setId);
  return definition?.names?.zh || definition?.names?.en || setId || "散件";
}
function evidenceLabel(entry) { return `截图 ${entry.evidenceRefs?.length || 0} · 字段框 ${entry.fieldEvidence?.length || 0}`; }

function showMessage(message, kind = "success") {
  const element = byId("editor-message");
  element.textContent = message;
  element.style.color = kind === "error" ? "var(--danger)" : kind === "warning" ? "var(--accent-light)" : "var(--success)";
}

function fillOptions() {
  const heroes = [...state.gameData.heroes].sort((a, b) => heroName(a).localeCompare(heroName(b), "zh-CN"));
  byId("hero-definition").innerHTML = heroes.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(heroName(entry))} · ${escapeHtml(entry.element || "?")} · ${escapeHtml(entry.season || "?")}</option>`).join("");
  const slots = state.gameData.slotDefinitions.filter((entry) => entry.id !== "artifact");
  byId("gear-slot").innerHTML = slots.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(SLOT_LABELS[entry.id] || entry.labelZh || entry.id)}</option>`).join("");
  const equipment = [...(state.gameData.equipment || [])].filter((entry) => entry.slot !== "unknown").sort((a, b) => equipmentName(a).localeCompare(equipmentName(b), "zh-CN"));
  byId("gear-definition").innerHTML = `<option value="">手工选择槽位与套装</option>` + equipment.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(equipmentName(entry))} · #${escapeHtml(entry.externalId || "?")} · ${escapeHtml(entry.rarity || "?")} · ${escapeHtml(entry.season || "?")}</option>`).join("");
  const sets = [...state.gameData.sets].sort((a, b) => setName(a.id).localeCompare(setName(b.id), "zh-CN"));
  byId("gear-set").innerHTML = `<option value="">散件 / 未知</option>` + sets.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.names.zh || entry.names.en || entry.id)} · ${escapeHtml(entry.season || "?")}</option>`).join("");
  const artifacts = [...state.gameData.artifacts].sort((a, b) => artifactName(a).localeCompare(artifactName(b), "zh-CN"));
  byId("artifact-definition").innerHTML = artifacts.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(artifactName(entry))} · ${escapeHtml(entry.rarity || "?")} · ${escapeHtml(entry.season || "?")}</option>`).join("");
}

function card({ title, id, detail, kind, itemId, auditable = false }) {
  return `<article class="inventory-card"><div><strong>${escapeHtml(title)}</strong><p class="item-id">${escapeHtml(id)}</p></div><div><p>${escapeHtml(detail)}</p></div><div class="card-actions">${auditable ? `<button class="audit-evidence" type="button" data-kind="${kind}" data-item-id="${escapeHtml(itemId)}">审计</button>` : ""}<button class="delete-item" type="button" data-kind="${kind}" data-item-id="${escapeHtml(itemId)}">删除</button></div></article>`;
}

function render() {
  const counts = snapshotCounts(state.account);
  byId("inventory-counts").innerHTML = [
    [counts.heroes, "角色"], [counts.gear, "装备"], [counts.artifacts, "神器"]
  ].map(([value, label]) => `<div class="count-tile"><strong>${value}</strong><span>${label}</span></div>`).join("");
  byId("hero-count").textContent = counts.heroes;
  byId("gear-count").textContent = counts.gear;
  byId("artifact-count").textContent = counts.artifacts;
  byId("snapshot-meta").innerHTML = `<strong>${escapeHtml(state.account.snapshotId)}</strong><br>${escapeHtml(state.account.gameDataVersionId)}<br>来源：${escapeHtml(state.account.sourceMethod)} · 原始文件 ${state.account.sourceFiles?.length || 0}`;

  byId("hero-list").innerHTML = state.account.ownedHeroes.length ? state.account.ownedHeroes.map((owned) => {
    const definition = state.gameData.heroes.find((entry) => entry.id === owned.heroDefinitionId);
    return card({ title: heroName(definition), id: owned.ownedHeroId, detail: `等级 ${owned.level} · 星级 ${owned.stars ?? "?"} · 灵感 ${owned.inspiration ?? "?"} · ${owned.baseStatsOverride ? "账号基础面板" : "无账号基础面板"} · ${evidenceLabel(owned)}`, kind: "hero", itemId: owned.ownedHeroId, auditable: Boolean(owned.fieldEvidence?.length) });
  }).join("") : `<div class="empty-inventory">尚未添加角色</div>`;

  byId("gear-list").innerHTML = state.account.ownedGear.length ? state.account.ownedGear.map((item) => {
    const definition = item.definitionId ? state.gameData.equipment?.find((entry) => entry.id === item.definitionId) : null;
    return card({
      title: definition ? equipmentName(definition) : `${SLOT_LABELS[item.slot] || item.slot} · ${setName(item.setId)}`,
      id: item.ownedItemId,
      detail: `${SLOT_LABELS[item.slot] || item.slot} · ${setName(item.setId)} · 强化 +${item.enhanceLevel} · ${formatStats(item.stats, state.gameData.statDefinitions) || "无属性"}${definition ? " · 已关联公共定义" : ""}${item.locked ? " · 已锁定" : ""} · ${evidenceLabel(item)}`,
      kind: "gear", itemId: item.ownedItemId, auditable: Boolean(item.fieldEvidence?.length)
    });
  }).join("") : `<div class="empty-inventory">尚未添加装备</div>`;

  byId("artifact-list").innerHTML = state.account.ownedArtifacts.length ? state.account.ownedArtifacts.map((owned) => {
    const definition = state.gameData.artifacts.find((entry) => entry.id === owned.artifactDefinitionId);
    const resolved = resolveArtifactStats(state.gameData, owned);
    const source = resolved.source === "public_level_curve" ? "公共曲线" : resolved.source === "account_observed" ? "账号观测" : resolved.source === "legacy_account_stats" ? "旧版观测" : "不可用";
    return card({ title: artifactName(definition), id: owned.ownedArtifactId, detail: `强化 +${owned.level ?? "?"} · 精炼 ${owned.refinement} · ${formatStats(resolved.stats, state.gameData.statDefinitions) || "无属性"} · ${source}${owned.locked ? " · 已锁定" : ""} · ${evidenceLabel(owned)}`, kind: "artifact", itemId: owned.ownedArtifactId, auditable: Boolean(owned.fieldEvidence?.length) });
  }).join("") : `<div class="empty-inventory">尚未添加神器</div>`;
}

function loadAccount(account, message = "账号文件已载入") {
  const validation = validateEditableSnapshot(account, state.gameData);
  if (validation.errors.length) throw new Error(validation.errors.join("；"));
  for (const image of state.evidenceImages.values()) URL.revokeObjectURL(image.url);
  state.evidenceImages.clear();
  state.account = structuredClone(account);
  if (!state.account.schemaVersion) state.account.schemaVersion = "0.2.0";
  render();
  showMessage([message, ...validation.warnings].join("；"), validation.warnings.length ? "warning" : "success");
}

function findOwnedEntry(kind, itemId) {
  const collections = { hero: ["ownedHeroes", "ownedHeroId"], gear: ["ownedGear", "ownedItemId"], artifact: ["ownedArtifacts", "ownedArtifactId"] };
  const [collection, key] = collections[kind] || [];
  return state.account?.[collection]?.find((entry) => entry[key] === itemId) || null;
}

async function sha256(file) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function loadEvidenceFiles(files) {
  const expected = new Set((state.account.sourceFiles || []).map((entry) => entry.sha256.toLowerCase()));
  let matched = 0;
  for (const file of files) {
    const digest = await sha256(file);
    if (!expected.has(digest)) continue;
    const previous = state.evidenceImages.get(digest);
    if (previous) URL.revokeObjectURL(previous.url);
    state.evidenceImages.set(digest, { url: URL.createObjectURL(file), name: file.name, type: file.type });
    matched += 1;
  }
  showMessage(`已匹配 ${matched}/${files.length} 个原图；账号共引用 ${expected.size} 个文件`, matched ? "success" : "warning");
}

async function drawFieldEvidence(index) {
  const evidence = state.activeEvidence?.entry?.fieldEvidence?.[index];
  if (!evidence) return;
  for (const button of byId("evidence-field-list").querySelectorAll("button")) button.setAttribute("aria-current", String(Number(button.dataset.index) === index));
  const imageFile = state.evidenceImages.get(evidence.sourceFileSha256.toLowerCase());
  const source = state.account.sourceFiles?.find((entry) => entry.sha256.toLowerCase() === evidence.sourceFileSha256.toLowerCase());
  byId("evidence-meta").innerHTML = `<strong>${escapeHtml(evidence.fieldPath)}</strong><br>原文：${escapeHtml(evidence.rawText || "（空）")} · 置信度 ${(Number(evidence.confidence) * 100).toFixed(1)}%<br>文件：${escapeHtml(imageFile?.name || source?.localName || "未知")} · 坐标框 ${evidence.boundingRects?.length || 0}`;
  const canvas = byId("evidence-canvas");
  const placeholder = byId("evidence-placeholder");
  if (!imageFile) {
    canvas.hidden = true;
    placeholder.hidden = false;
    placeholder.textContent = "该字段的原图尚未匹配。点击页面顶部“匹配原图”，选择采集器保存的原始截图；浏览器会按 SHA-256 自动关联。";
    return;
  }
  const image = new Image();
  image.src = imageFile.url;
  await image.decode();
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  context.lineWidth = Math.max(3, image.naturalWidth / 300);
  context.strokeStyle = "#ffb45d";
  context.fillStyle = "rgba(255, 180, 93, .16)";
  for (const rect of evidence.boundingRects || []) {
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
    context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  }
  canvas.hidden = false;
  placeholder.hidden = true;
}

function openEvidenceAudit(kind, itemId) {
  const entry = findOwnedEntry(kind, itemId);
  if (!entry?.fieldEvidence?.length) return;
  state.activeEvidence = { kind, itemId, entry };
  byId("evidence-dialog-title").textContent = `字段证据 · ${itemId}`;
  byId("evidence-field-list").innerHTML = entry.fieldEvidence.map((evidence, index) => `<button class="evidence-field-button" type="button" data-index="${index}" aria-current="${index === 0}"><strong>${escapeHtml(evidence.fieldPath)}</strong><span>${escapeHtml(evidence.rawText || "（空）")} · ${(Number(evidence.confidence) * 100).toFixed(1)}%</span></button>`).join("");
  byId("evidence-dialog").showModal();
  drawFieldEvidence(0).catch((error) => showMessage(`证据预览失败：${error.message}`, "error"));
}

function renderDiff(diff, mode) {
  const element = byId("diff-summary");
  const labels = { heroes: "角色", gear: "装备", artifacts: "神器" };
  element.hidden = false;
  element.innerHTML = `<h2>${mode === "merge" ? "合并结果" : "替换差异"}</h2>` + Object.entries(diff.totals).map(([kind, totals]) =>
    `<p><strong>${labels[kind]}</strong>：新增 ${totals.added} · 更新 ${totals.updated} · 未变 ${totals.unchanged} · 本次未出现 ${totals.missingFromIncoming}</p>`
  ).join("") + `<p>${mode === "merge" ? "本次未出现的旧记录已保留，不等于确认仍在账号中。" : "当前账号已被新文件替换。"}</p>`;
}

function downloadAccount() {
  const validation = validateEditableSnapshot(state.account, state.gameData);
  if (validation.errors.length) throw new Error(validation.errors.join("；"));
  state.account.createdAt = new Date().toISOString();
  const blob = new Blob([`${JSON.stringify(state.account, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${state.account.snapshotId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showMessage(`已导出 ${anchor.download}${validation.warnings.length ? `；${validation.warnings.join("；")}` : ""}`, validation.warnings.length ? "warning" : "success");
}

byId("hero-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const definitionId = byId("hero-definition").value;
    if (state.account.ownedHeroes.some((entry) => entry.heroDefinitionId === definitionId)) throw new Error("该角色已经在账号中");
    const level = Number(byId("hero-level").value);
    const baseStatsOverride = parseStats(byId("hero-base-stats").value, state.gameData.statDefinitions.map((entry) => entry.id));
    const quality = state.gameData.heroDataQuality?.records?.find((entry) => entry.heroDefinitionId === definitionId);
    if (quality?.requiresObservedBaseStats && !Object.keys(baseStatsOverride).length) throw new Error(`该角色的公共基础属性触发异常复核（${quality.anomalyFlags.join("、")}），必须填写账号观测基础属性`);
    if (level > 1 && !Object.keys(baseStatsOverride).length) throw new Error("等级大于 1 的角色必须填写账号观测的无装备基础属性");
    state.account.ownedHeroes.push({
      ownedHeroId: nextOwnedId("hero-manual", state.account.ownedHeroes, "ownedHeroId"),
      heroDefinitionId: definitionId,
      level,
      stars: Number(byId("hero-stars").value) || null,
      inspiration: Number(byId("hero-inspiration").value) || 0,
      ...(Object.keys(baseStatsOverride).length ? { baseStatsOverride } : {})
    });
    render(); showMessage("角色已添加");
  } catch (error) { showMessage(error.message, "error"); }
});

byId("hero-definition").addEventListener("change", () => {
  const quality = state.gameData.heroDataQuality?.records?.find((entry) => entry.heroDefinitionId === byId("hero-definition").value);
  if (quality?.requiresObservedBaseStats) showMessage(`该公共角色记录触发异常复核：${quality.anomalyFlags.join("、")}；添加前必须填写账号观测基础属性`, "warning");
});

byId("gear-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const definitionId = byId("gear-definition").value || null;
    const definition = definitionId ? state.gameData.equipment.find((entry) => entry.id === definitionId) : null;
    state.account.ownedGear.push({
      ownedItemId: nextOwnedId("gear-manual", state.account.ownedGear, "ownedItemId"),
      definitionId,
      displayName: definition ? equipmentName(definition) : null,
      slot: definition?.slot || byId("gear-slot").value,
      rarity: definition?.rarity || "unknown",
      setId: definition?.setId || byId("gear-set").value || null,
      enhanceLevel: Number(byId("gear-level").value),
      stats: parseStats(byId("gear-stats").value, state.gameData.statDefinitions.map((entry) => entry.id)),
      equippedBy: null,
      locked: byId("gear-locked").checked,
      sourceConfidence: 1
    });
    byId("gear-stats").value = "";
    render(); showMessage("装备已添加");
  } catch (error) { showMessage(error.message, "error"); }
});

byId("gear-definition").addEventListener("change", () => {
  const definition = state.gameData.equipment?.find((entry) => entry.id === byId("gear-definition").value);
  if (!definition) {
    byId("gear-level").removeAttribute("max");
    showMessage("已切换为手工槽位/套装录入");
    return;
  }
  byId("gear-slot").value = definition.slot;
  byId("gear-set").value = definition.setId || "";
  byId("gear-level").max = String(definition.enhancementLimit);
  if (Number(byId("gear-level").value) > definition.enhancementLimit) byId("gear-level").value = definition.enhancementLimit;
  showMessage(`已关联 ${equipmentName(definition)}；槽位与套装已从公共定义带入`);
});

byId("artifact-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const definitionId = byId("artifact-definition").value;
    if (state.account.ownedArtifacts.some((entry) => entry.artifactDefinitionId === definitionId)) throw new Error("该神器已经在账号中");
    const observed = parseStats(byId("artifact-stats").value, state.gameData.statDefinitions.map((entry) => entry.id));
    state.account.ownedArtifacts.push({
      ownedArtifactId: nextOwnedId("artifact-manual", state.account.ownedArtifacts, "ownedArtifactId"),
      artifactDefinitionId: definitionId,
      level: Number(byId("artifact-level").value),
      refinement: Number(byId("artifact-refinement").value),
      observedStats: Object.entries(observed).map(([stat, value]) => ({ stat, value, raw_text: null, confidence: 1 })),
      equippedBy: null,
      locked: byId("artifact-locked").checked
    });
    byId("artifact-stats").value = "";
    render(); showMessage("神器已添加");
  } catch (error) { showMessage(error.message, "error"); }
});

document.addEventListener("click", (event) => {
  const auditButton = event.target.closest(".audit-evidence");
  if (auditButton) { openEvidenceAudit(auditButton.dataset.kind, auditButton.dataset.itemId); return; }
  const button = event.target.closest(".delete-item");
  if (!button) return;
  const collections = { hero: ["ownedHeroes", "ownedHeroId"], gear: ["ownedGear", "ownedItemId"], artifact: ["ownedArtifacts", "ownedArtifactId"] };
  const [collection, key] = collections[button.dataset.kind];
  state.account[collection] = state.account[collection].filter((entry) => entry[key] !== button.dataset.itemId);
  render(); showMessage("记录已删除");
});

byId("evidence-field-list").addEventListener("click", (event) => {
  const button = event.target.closest(".evidence-field-button");
  if (button) drawFieldEvidence(Number(button.dataset.index)).catch((error) => showMessage(`证据预览失败：${error.message}`, "error"));
});
byId("evidence-close").addEventListener("click", () => byId("evidence-dialog").close());
byId("evidence-files").addEventListener("change", async (event) => {
  try { await loadEvidenceFiles([...event.target.files]); }
  catch (error) { showMessage(`原图匹配失败：${error.message}`, "error"); }
  event.target.value = "";
});

byId("new-account").addEventListener("click", () => loadAccount(createEmptySnapshot(state.gameData.dataVersion.id), "已新建空账号"));
byId("load-example").addEventListener("click", async () => {
  try { loadAccount(await fetchJson("../examples/account-snapshot.example.json"), "示例账号已载入"); }
  catch (error) { showMessage(error.message, "error"); }
});
byId("load-evidence-example").addEventListener("click", async () => {
  try {
    const account = await fetchJson("../examples/account-snapshot-ocr-layout.example.json");
    loadAccount(account, "截图证据示例已载入");
    const files = await Promise.all(account.sourceFiles.map(async (source) => {
      const response = await fetch(`../${source.localName}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`${source.localName}: HTTP ${response.status}`);
      return new File([await response.blob()], source.localName.split(/[\\/]/).pop(), { type: source.mediaType });
    }));
    await loadEvidenceFiles(files);
  }
  catch (error) { showMessage(error.message, "error"); }
});
byId("account-file").addEventListener("change", async (event) => {
  try {
    const [file] = event.target.files;
    if (!file) return;
    const incoming = JSON.parse(await file.text());
    const validation = validateEditableSnapshot(incoming, state.gameData);
    if (validation.errors.length) throw new Error(validation.errors.join("；"));
    const mode = byId("import-mode").value;
    if (mode === "merge") {
      const merged = mergeAccountSnapshots(state.account, incoming);
      loadAccount(merged.snapshot, "账号文件已按稳定 ID 合并");
      renderDiff(merged.diff, mode);
    } else {
      const diff = diffAccountSnapshots(state.account, incoming);
      loadAccount(incoming, "账号文件已替换当前库存");
      renderDiff(diff, mode);
    }
  }
  catch (error) { showMessage(`导入失败：${error.message}`, "error"); }
  event.target.value = "";
});
byId("export-account").addEventListener("click", () => { try { downloadAccount(); } catch (error) { showMessage(error.message, "error"); } });
byId("use-in-optimizer").addEventListener("click", () => {
  const validation = validateEditableSnapshot(state.account, state.gameData);
  if (validation.errors.length) { showMessage(validation.errors.join("；"), "error"); return; }
  sessionStorage.setItem(INVENTORY_SESSION_KEY, JSON.stringify(state.account));
  location.href = "index.html?account=session";
});

async function initialize() {
  try {
    state.gameData = await fetchJson("../data/game-data.public.json");
    byId("data-status").textContent = `离线 · 数据版本 ${state.gameData.dataVersion.id}`;
    fillOptions();
    const saved = sessionStorage.getItem(INVENTORY_SESSION_KEY);
    loadAccount(saved ? JSON.parse(saved) : createEmptySnapshot(state.gameData.dataVersion.id), saved ? "已恢复本次会话账号" : "已创建空账号");
  } catch (error) {
    byId("data-status").textContent = "公共数据载入失败，请通过本地 HTTP 服务打开";
    showMessage(error.message, "error");
  }
}

initialize();

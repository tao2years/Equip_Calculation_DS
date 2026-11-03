import { createStagingRecord, prepareReviewedStaging, recordIssueCount, validateReviewedStaging } from "./staging-review-core.mjs";

const state = { staging: null, sourceHash: null, selected: 0, dictionary: null, gameData: null, validation: null };
const el = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const kindLabel = (kind) => kind === "hero" ? "角色" : kind === "gear" ? "装备" : "神器";

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function setStatus(message, error = false) {
  el("status-message").textContent = message;
  el("status-message").classList.toggle("error", error);
}

function fillDatalist(id, kind) {
  const values = new Set();
  for (const entry of state.dictionary.entities[kind] || []) for (const alias of entry.aliases || []) values.add(alias);
  el(id).replaceChildren(...[...values].sort((a, b) => a.localeCompare(b, "zh-CN")).map((value) => {
    const option = document.createElement("option"); option.value = value; return option;
  }));
}

async function initialize() {
  try {
    const [dictionaryResponse, gameDataResponse] = await Promise.all([fetch("../data/import-dictionary.json"), fetch("../data/game-data.public.json")]);
    if (!dictionaryResponse.ok || !gameDataResponse.ok) throw new Error("公共数据或字典载入失败");
    state.dictionary = await dictionaryResponse.json();
    state.gameData = await gameDataResponse.json();
    fillDatalist("hero-aliases", "hero"); fillDatalist("artifact-aliases", "artifact"); fillDatalist("set-aliases", "set"); fillDatalist("stat-aliases", "stat");
    el("data-status").textContent = `离线字典已载入 · ${state.dictionary.gameDataVersionId}`;
  } catch (error) { setStatus(error.message, true); }
}

async function loadStagingText(text, label) {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed.records) || !parsed.jobId) throw new Error("文件不是有效的 OcrStaging");
  if (parsed.review) throw new Error("请载入原始 machine-staging.json，不要再次载入已复核文件");
  const clone = structuredClone(parsed); delete clone.review;
  state.staging = clone;
  state.sourceHash = await sha256(text);
  state.selected = 0;
  render();
  setStatus(`已载入 ${label} · ${clone.records.length} 条记录`);
}

function inputField(label, key, value, options = {}) {
  const wrapper = document.createElement("label"); wrapper.className = "field";
  const span = document.createElement("span"); span.textContent = label;
  const input = document.createElement("input");
  input.type = options.type || "text"; input.value = value ?? ""; input.dataset.field = key;
  if (options.list) input.setAttribute("list", options.list);
  if (options.step) input.step = options.step;
  wrapper.append(span, input); return wrapper;
}

function checkboxField(label, key, checked) {
  const wrapper = document.createElement("label"); wrapper.className = "checkbox-field";
  const input = document.createElement("input"); input.type = "checkbox"; input.checked = Boolean(checked); input.dataset.field = key;
  wrapper.append(input, document.createTextNode(label)); return wrapper;
}

function selectField(label, key, value, options) {
  const wrapper = document.createElement("label"); wrapper.className = "field";
  const span = document.createElement("span"); span.textContent = label;
  const select = document.createElement("select"); select.dataset.field = key;
  for (const [optionValue, text] of options) {
    const option = document.createElement("option"); option.value = optionValue; option.textContent = text; option.selected = optionValue === value; select.append(option);
  }
  wrapper.append(span, select); return wrapper;
}

function renderStats(record, target) {
  const section = document.createElement("section"); section.className = "stats-section";
  const heading = document.createElement("div"); heading.className = "stats-heading"; heading.innerHTML = `<div><h3>${target === "baseStats" ? "角色基础属性" : "属性词条"}</h3><p>名称必须能由导入字典唯一解析；百分数保留 %。</p></div>`;
  const add = document.createElement("button"); add.type = "button"; add.textContent = "添加属性"; add.className = "ghost";
  heading.append(add); section.append(heading);
  const rows = document.createElement("div"); rows.className = "stat-rows";
  const observations = record.fields[target] ||= [];
  observations.forEach((observation, index) => {
    const row = document.createElement("div"); row.className = "stat-row"; row.dataset.index = index;
    row.innerHTML = `<input aria-label="属性名称" list="stat-aliases" value="${escapeHtml(observation.label)}"><input aria-label="属性数值" value="${escapeHtml(observation.value)}"><input aria-label="属性置信度" type="number" min="0" max="1" step="0.01" value="${Number(observation.confidence ?? 1)}"><button type="button" aria-label="删除属性">×</button>`;
    const [labelInput, valueInput, confidenceInput, remove] = row.children;
    labelInput.addEventListener("input", () => { observation.label = labelInput.value; validateAndRenderSidebars(); });
    valueInput.addEventListener("input", () => { observation.value = valueInput.value; validateAndRenderSidebars(); });
    confidenceInput.addEventListener("input", () => { observation.confidence = Number(confidenceInput.value); validateAndRenderSidebars(); });
    remove.addEventListener("click", () => { observations.splice(index, 1); renderEditor(); validateAndRenderSidebars(); });
    rows.append(row);
  });
  add.addEventListener("click", () => { observations.push({ label: "", value: "", confidence: 1 }); renderEditor(); validateAndRenderSidebars(); });
  section.append(rows); return section;
}

function renderEditor() {
  const container = el("record-editor"); container.replaceChildren();
  const record = state.staging?.records?.[state.selected];
  el("delete-record").disabled = !record;
  if (!record) { container.innerHTML = '<p class="empty large">选择左侧记录，逐项确认字段。</p>'; return; }
  el("editor-title").textContent = `${kindLabel(record.kind)}字段`;
  el("record-subtitle").textContent = record.sourceRecordId;
  const common = document.createElement("div"); common.className = "field-grid";
  common.append(selectField("记录类型", "__kind", record.kind, [["hero", "角色"], ["gear", "装备"], ["artifact", "神器"]]));
  common.append(inputField("记录置信度", "__confidence", record.confidence, { type: "number", step: "0.01" }));
  if (record.kind === "hero") {
    common.append(inputField("角色名称", "name", record.fields.name, { list: "hero-aliases" }), inputField("等级", "level", record.fields.level, { type: "number" }), inputField("星级", "stars", record.fields.stars, { type: "number" }), inputField("灵感", "inspiration", record.fields.inspiration, { type: "number" }));
  } else if (record.kind === "gear") {
    common.append(selectField("槽位", "slot", record.fields.slot, [["helmet", "头盔"], ["weapon", "武器"], ["chest", "胸甲"], ["gloves", "手套"], ["positive_rune", "正位符文"], ["negative_rune", "负位符文"]]), inputField("套装名称", "setName", record.fields.setName, { list: "set-aliases" }), inputField("套装 ID（可选）", "setId", record.fields.setId), inputField("强化等级", "enhanceLevel", record.fields.enhanceLevel, { type: "number" }), inputField("穿戴角色 ID", "equippedBy", record.fields.equippedBy), checkboxField("锁定装备", "locked", record.fields.locked));
  } else {
    common.append(inputField("神器名称", "name", record.fields.name, { list: "artifact-aliases" }), inputField("强化等级", "level", record.fields.level, { type: "number", min: "0", max: "20" }), inputField("精炼阶数", "refinement", record.fields.refinement, { type: "number", min: "0", max: "5" }), inputField("穿戴角色 ID", "equippedBy", record.fields.equippedBy), checkboxField("锁定神器", "locked", record.fields.locked));
  }
  common.addEventListener("input", (event) => {
    const key = event.target.dataset.field; if (!key) return;
    if (key === "__confidence") record.confidence = Number(event.target.value);
    else if (key === "__kind") {
      const replacement = createStagingRecord(event.target.value, record.sourceRecordId); replacement.confidence = record.confidence; replacement.evidenceRefs = structuredClone(record.evidenceRefs || []); replacement.fieldEvidence = structuredClone(record.fieldEvidence || []); state.staging.records[state.selected] = replacement; renderEditor();
    } else if (event.target.type === "checkbox") record.fields[key] = event.target.checked;
    else if (event.target.type === "number") record.fields[key] = event.target.value === "" ? null : Number(event.target.value);
    else record.fields[key] = event.target.value || null;
    validateAndRenderSidebars();
  });
  container.append(common, renderStats(record, record.kind === "hero" ? "baseStats" : "stats"));
}

function renderRecordList() {
  const records = state.staging?.records || [];
  el("record-list").replaceChildren(...records.map((record, index) => {
    const button = document.createElement("button"); button.type = "button"; button.className = `record-row${index === state.selected ? " selected" : ""}`;
    const issues = recordIssueCount(record, state.validation?.errors || []);
    button.innerHTML = `<span class="kind">${kindLabel(record.kind)}</span><strong>${escapeHtml(record.fields.name || record.fields.slot || record.sourceRecordId)}</strong><span class="record-status ${issues ? "bad" : "good"}">${issues ? `${issues} 错误` : "可解析"}</span><small>${escapeHtml(record.sourceRecordId)}</small>`;
    button.addEventListener("click", () => { state.selected = index; renderRecordList(); renderEditor(); });
    return button;
  }));
}

function validateAndRenderSidebars() {
  if (!state.staging || !state.dictionary || !state.gameData) return;
  state.validation = validateReviewedStaging(state.staging, state.dictionary, state.gameData);
  const records = state.staging.records;
  el("job-id").textContent = state.staging.jobId;
  el("hero-count").textContent = records.filter((record) => record.kind === "hero").length;
  el("gear-count").textContent = records.filter((record) => record.kind === "gear").length;
  el("artifact-count").textContent = records.filter((record) => record.kind === "artifact").length;
  el("source-hash").textContent = state.sourceHash || "—";
  el("validation-state").textContent = state.validation.valid ? "全部字段可解析，可以导出" : `${state.validation.errors.length} 个错误阻止导出`;
  el("validation-state").className = `validation-state ${state.validation.valid ? "valid" : "invalid"}`;
  el("error-list").innerHTML = state.validation.errors.length ? state.validation.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("") : "<li>无</li>";
  el("warning-list").innerHTML = state.validation.warnings.length ? state.validation.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("") : "<li>无</li>";
  el("export-reviewed").disabled = !state.validation.valid;
  el("snapshot-preview").textContent = state.validation.snapshot ? `${state.validation.snapshot.ownedHeroes.length} 个角色 · ${state.validation.snapshot.ownedGear.length} 件装备 · ${state.validation.snapshot.ownedArtifacts.length} 件神器` : "只有全部字段可解析时才允许导出。";
  renderRecordList();
}

function render() { validateAndRenderSidebars(); renderEditor(); }

el("staging-file").addEventListener("change", async (event) => {
  try { const file = event.target.files[0]; if (file) await loadStagingText(await file.text(), file.name); }
  catch (error) { setStatus(error.message, true); }
});
el("load-example").addEventListener("click", async () => {
  try { const response = await fetch("../examples/ocr-staging-layout.example.json"); const text = await response.text(); if (!response.ok) throw new Error(`示例载入失败：HTTP ${response.status}`); await loadStagingText(text, "合成示例"); }
  catch (error) { setStatus(error.message, true); }
});
document.querySelectorAll("[data-add-kind]").forEach((button) => button.addEventListener("click", () => {
  if (!state.staging) return setStatus("请先载入 staging", true);
  const kind = button.dataset.addKind; const id = `manual-${kind}-${String(state.staging.records.length + 1).padStart(3, "0")}`;
  state.staging.records.push(createStagingRecord(kind, id)); state.selected = state.staging.records.length - 1; render();
}));
el("delete-record").addEventListener("click", () => {
  if (!state.staging?.records?.length) return;
  state.staging.records.splice(state.selected, 1); state.selected = Math.max(0, Math.min(state.selected, state.staging.records.length - 1)); render();
});
el("export-reviewed").addEventListener("click", () => {
  if (!state.validation?.valid) return setStatus("仍有错误，不能导出", true);
  const output = prepareReviewedStaging(state.staging, state.sourceHash);
  const blob = new Blob([`${JSON.stringify(output, null, 2)}\n`], { type: "application/json" });
  const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = `${state.staging.jobId}.reviewed-staging.json`; anchor.click(); URL.revokeObjectURL(anchor.href);
  setStatus("已导出 reviewed staging；可传给 pipeline.mjs --reviewed-staging");
});

await initialize();

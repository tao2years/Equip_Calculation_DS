const CAPTURE_TYPES = new Set(["unclassified", "hero_list", "hero_detail", "gear_list", "gear_detail", "artifact_list", "artifact_detail"]);
const PLAN_PURPOSES = new Set(["golden_calibration", "full_account"]);
const COVERAGE_REQUIREMENTS = new Set(["minimum_sample", "channel_identity", "complete_list", "all_owned_details"]);

export function requiresCoverageConfirmation(step) {
  return ["complete_list", "all_owned_details"].includes(step?.coverageRequirement);
}

export function captureStepComplete(step, captured, coverageConfirmed) {
  return Number.isInteger(captured)
    && captured >= step.minimumCaptures
    && (!requiresCoverageConfirmation(step) || coverageConfirmed === true);
}

export function validateCapturePlan(plan) {
  const errors = [];
  if (plan?.schemaVersion !== "0.2.0") errors.push("schemaVersion must be 0.2.0");
  if (!plan?.planId) errors.push("planId is required");
  if (!PLAN_PURPOSES.has(plan?.purpose)) errors.push(`invalid purpose ${plan?.purpose}`);
  if (!Array.isArray(plan?.steps) || !plan.steps.length) errors.push("steps must be a non-empty array");
  const ids = new Set();
  for (const [index, step] of (plan?.steps || []).entries()) {
    if (!step.id) errors.push(`step ${index + 1} is missing id`);
    else if (ids.has(step.id)) errors.push(`duplicate step id ${step.id}`);
    else ids.add(step.id);
    if (!step.title) errors.push(`step ${step.id || index + 1} is missing title`);
    if (!CAPTURE_TYPES.has(step.captureType)) errors.push(`step ${step.id || index + 1} has invalid captureType ${step.captureType}`);
    if (!COVERAGE_REQUIREMENTS.has(step.coverageRequirement)) errors.push(`step ${step.id || index + 1} has invalid coverageRequirement ${step.coverageRequirement}`);
    if (!Number.isInteger(step.minimumCaptures) || step.minimumCaptures < 0) errors.push(`step ${step.id || index + 1} has invalid minimumCaptures`);
    if (!step.instructions) errors.push(`step ${step.id || index + 1} is missing instructions`);
  }
  return errors;
}

export function summarizeCapturePlan(plan) {
  const errors = validateCapturePlan(plan);
  if (errors.length) throw new Error(`Capture plan validation failed: ${errors.join("; ")}`);
  return {
    planId: plan.planId,
    channel: plan.channel,
    purpose: plan.purpose,
    steps: plan.steps.length,
    minimumCaptures: plan.steps.reduce((total, step) => total + step.minimumCaptures, 0),
    byType: Object.fromEntries([...CAPTURE_TYPES].map((type) => [type, plan.steps.filter((step) => step.captureType === type).reduce((total, step) => total + step.minimumCaptures, 0)]).filter(([, count]) => count > 0)),
    coverageRequirements: Object.fromEntries([...COVERAGE_REQUIREMENTS].map((requirement) => [requirement, plan.steps.filter((step) => step.coverageRequirement === requirement).length]).filter(([, count]) => count > 0))
  };
}

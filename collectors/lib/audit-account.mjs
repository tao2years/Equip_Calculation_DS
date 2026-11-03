const unique = (values) => [...new Set(values)];
const duplicates = (values) => unique(values.filter((value, index) => values.indexOf(value) !== index));
const sorted = (values) => [...values].sort((a, b) => String(a).localeCompare(String(b)));

function difference(left, right) {
  const rightSet = new Set(right);
  return sorted(unique(left).filter((value) => !rightSet.has(value)));
}

function countBySlot(items) {
  const counts = {};
  for (const item of items) counts[item.slot] = (counts[item.slot] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

export function auditAccountCompleteness(snapshot, reference, gameData) {
  const heroes = snapshot.ownedHeroes || [];
  const gear = snapshot.ownedGear || [];
  const artifacts = snapshot.ownedArtifacts || [];
  const actualCounts = { heroes: heroes.length, gear: gear.length, artifacts: artifacts.length };
  const countChecks = Object.fromEntries(Object.keys(actualCounts).map((kind) => [kind, {
    expected: reference.expectedCounts[kind],
    actual: actualCounts[kind],
    match: reference.expectedCounts[kind] === actualCounts[kind]
  }]));

  const actualHeroDefinitions = heroes.map((entry) => entry.heroDefinitionId);
  const actualArtifactDefinitions = artifacts.map((entry) => entry.artifactDefinitionId);
  const expectedHeroDefinitions = reference.expectedHeroDefinitionIds || [];
  const expectedArtifactDefinitions = reference.expectedArtifactDefinitionIds || [];
  const expectedGearBySlot = reference.expectedGearBySlot || {};
  const actualGearBySlot = countBySlot(gear);
  const allSlots = sorted(unique([...Object.keys(expectedGearBySlot), ...Object.keys(actualGearBySlot)]));
  const gearSlotChecks = Object.fromEntries(allSlots.map((slot) => [slot, {
    expected: expectedGearBySlot[slot] || 0,
    actual: actualGearBySlot[slot] || 0,
    match: (expectedGearBySlot[slot] || 0) === (actualGearBySlot[slot] || 0)
  }]));

  const ownedIds = {
    heroes: heroes.map((entry) => entry.ownedHeroId),
    gear: gear.map((entry) => entry.ownedItemId),
    artifacts: artifacts.map((entry) => entry.ownedArtifactId)
  };
  const duplicateOwnedIds = Object.fromEntries(Object.entries(ownedIds).map(([kind, values]) => [kind, duplicates(values)]));
  const duplicateDefinitions = {
    heroes: duplicates(actualHeroDefinitions),
    artifacts: duplicates(actualArtifactDefinitions)
  };

  const knownHeroes = new Set((gameData.heroes || []).map((entry) => entry.id));
  const knownArtifacts = new Set((gameData.artifacts || []).map((entry) => entry.id));
  const knownEquipment = new Set((gameData.equipment || []).map((entry) => entry.id));
  const unknownDefinitions = {
    heroes: sorted(unique(actualHeroDefinitions.filter((id) => !knownHeroes.has(id)))),
    artifacts: sorted(unique(actualArtifactDefinitions.filter((id) => !knownArtifacts.has(id)))),
    equipment: sorted(unique(gear.map((entry) => entry.definitionId).filter((id) => id && !knownEquipment.has(id))))
  };

  const identityChecks = {
    heroes: {
      missing: difference(expectedHeroDefinitions, actualHeroDefinitions),
      unexpected: difference(actualHeroDefinitions, expectedHeroDefinitions)
    },
    artifacts: {
      missing: difference(expectedArtifactDefinitions, actualArtifactDefinitions),
      unexpected: difference(actualArtifactDefinitions, expectedArtifactDefinitions)
    }
  };
  const errors = [];
  for (const [kind, check] of Object.entries(countChecks)) if (!check.match) errors.push(`${kind} count expected ${check.expected}, got ${check.actual}`);
  for (const [slot, check] of Object.entries(gearSlotChecks)) if (!check.match) errors.push(`gear slot ${slot} expected ${check.expected}, got ${check.actual}`);
  for (const [kind, ids] of Object.entries(duplicateOwnedIds)) if (ids.length) errors.push(`duplicate ${kind} owned IDs: ${ids.join(", ")}`);
  for (const [kind, ids] of Object.entries(duplicateDefinitions)) if (ids.length) errors.push(`duplicate ${kind} definitions: ${ids.join(", ")}`);
  for (const [kind, ids] of Object.entries(unknownDefinitions)) if (ids.length) errors.push(`unknown ${kind} definitions: ${ids.join(", ")}`);
  for (const [kind, check] of Object.entries(identityChecks)) {
    if (check.missing.length) errors.push(`missing ${kind}: ${check.missing.join(", ")}`);
    if (check.unexpected.length) errors.push(`unexpected ${kind}: ${check.unexpected.join(", ")}`);
  }

  return {
    schemaVersion: "0.1.0",
    auditedAt: snapshot.createdAt,
    snapshotId: snapshot.snapshotId,
    referenceId: reference.referenceId,
    gameDataVersionId: gameData.dataVersion.id,
    evidenceLevel: reference.evidenceLevel,
    status: errors.length ? "failed" : "passed",
    actualCounts,
    countChecks,
    gearSlotChecks,
    identityChecks,
    duplicateOwnedIds,
    duplicateDefinitions,
    unknownDefinitions,
    errors,
    limitations: "A passing report proves agreement with the supplied manual reference, not that the manual reference itself is complete or that game formulas are correct."
  };
}

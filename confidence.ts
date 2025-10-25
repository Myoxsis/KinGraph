import { type IndividualRecord } from "./schema";

function hasProvenance(record: IndividualRecord, field: string): boolean {
  return record.provenance.some((entry) => entry.field === field);
}

function clampConfidence(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function computeDateConfidence(fragment: IndividualRecord["birth"]): number {
  let base = 0;

  if (fragment.day !== undefined) {
    base = 0.95;
  } else if (fragment.month !== undefined) {
    base = 0.85;
  } else if (fragment.year !== undefined) {
    base = 0.7;
  }

  if (fragment.approx) {
    base -= 0.1;
  }

  return clampConfidence(base);
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function scoreConfidence(record: IndividualRecord): Record<string, number> {
  const scores: Record<string, number> = {};

  if (record.givenNames.length) {
    let confidence = 0.6;

    if (hasProvenance(record, "name.heading")) {
      confidence = 0.9;
    } else if (hasProvenance(record, "givenNames")) {
      confidence = 0.8;
    }

    scores.givenNames = clampConfidence(confidence);
  }

  if (record.surname) {
    let confidence = 0.6;

    if (hasProvenance(record, "name.heading")) {
      confidence = 0.9;
    } else if (hasProvenance(record, "surname")) {
      confidence = 0.8;
    }

    scores.surname = clampConfidence(confidence);
  }

  if (record.maidenName) {
    const trimmed = record.maidenName.trim();
    let confidence = 0.7;

    if (/^\[[^\]]+\]$/.test(trimmed)) {
      confidence = 0.5;
    } else if (new RegExp(`\\bn[eé]e\\s+${escapeRegExp(trimmed)}`, "i").test(record.sourceHtml)) {
      confidence = 0.95;
    }

    scores.maidenName = clampConfidence(confidence);
  }

  const birthConfidence = computeDateConfidence(record.birth);
  if (birthConfidence > 0) {
    scores["birth.date"] = birthConfidence;
  }

  const deathConfidence = computeDateConfidence(record.death);
  if (deathConfidence > 0) {
    scores["death.date"] = deathConfidence;
  }

  if (record.parents.father) {
    const confidence = hasProvenance(record, "parents.father") ? 0.9 : 0.6;
    scores["parents.father"] = clampConfidence(confidence);
  }

  if (record.parents.mother) {
    const confidence = hasProvenance(record, "parents.mother") ? 0.9 : 0.6;
    scores["parents.mother"] = clampConfidence(confidence);
  }

  return scores;
}

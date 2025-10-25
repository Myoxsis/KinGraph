const APPROX_KEYWORDS = /\b(?:abt|about|approx(?:\.?|imately)?|around|circa|ca\.?|c\.)\b|~/i;

export function normalizeYear(text: string): number | undefined {
  if (!text) {
    return undefined;
  }

  const match = text.match(/\b(\d{3,4})\b/);
  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  if (!Number.isFinite(year)) {
    return undefined;
  }

  if (year < 0) {
    return undefined;
  }

  return year;
}

export function parseApprox(text: string): boolean {
  if (!text?.trim()) {
    return false;
  }

  if (APPROX_KEYWORDS.test(text)) {
    return true;
  }

  return /\b(before|after)\b/i.test(text);
}

export function parseRange(
  text: string,
): { start?: number; end?: number } | undefined {
  if (!text?.trim()) {
    return undefined;
  }

  const rangeMatch = text.match(/(\d{3,4})\s*[\u2013\-]\s*(\d{3,4})/);
  if (rangeMatch) {
    const start = normalizeYear(rangeMatch[1]);
    const end = normalizeYear(rangeMatch[2]);
    if (start !== undefined || end !== undefined) {
      const result: { start?: number; end?: number } = {};
      if (start !== undefined) {
        result.start = start;
      }
      if (end !== undefined) {
        result.end = end;
      }
      return result;
    }
  }

  const beforeMatch = text.match(/\bbefore\s+(\d{3,4})\b/i);
  if (beforeMatch) {
    const end = normalizeYear(beforeMatch[1]);
    if (end !== undefined) {
      return { end };
    }
  }

  const afterMatch = text.match(/\bafter\s+(\d{3,4})\b/i);
  if (afterMatch) {
    const start = normalizeYear(afterMatch[1]);
    if (start !== undefined) {
      return { start };
    }
  }

  return undefined;
}

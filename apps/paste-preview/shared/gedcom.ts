import type { PersistedState, StoredIndividual } from "@/storage";

const GEDCOM_MONTHS = [
  "",
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

interface GedcomBuildOptions {
  individualIds?: readonly string[];
}

interface EventDetails {
  raw?: string;
  year?: number;
  month?: number;
  day?: number;
  approx?: boolean;
  place?: string;
}

interface GedcomFamily {
  key: string;
  husbandId?: string;
  wifeId?: string;
  spouseIds: Set<string>;
  childrenIds: Set<string>;
}

export function generateGedcomDocument(
  state: PersistedState,
  options: GedcomBuildOptions = {},
): string {
  const individuals = getIndividualsForDocument(state, options.individualIds);
  const lines: string[] = [];
  const now = new Date();

  lines.push("0 HEAD");
  lines.push("1 SOUR KinGraph Workbench");
  lines.push("2 NAME KinGraph Workbench");
  lines.push("2 VERS 1.0");
  lines.push("1 GEDC");
  lines.push("2 VERS 5.5.1");
  lines.push("2 FORM LINEAGE-LINKED");
  lines.push("1 CHAR UTF-8");

  const formattedDate = formatGedcomDate({
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
  });

  if (formattedDate) {
    lines.push(`1 DATE ${formattedDate}`);
    const time = `${padNumber(now.getUTCHours())}:${padNumber(now.getUTCMinutes())}:${padNumber(
      now.getUTCSeconds(),
    )}`;
    lines.push(`1 TIME ${time}`);
  }

  const roleLabels = new Map(state.roles.map((role) => [role.id, role.label] as const));
  const individualPointers = new Map<string, string>();

  individuals.forEach((individual, index) => {
    const pointer = createPointer("I", individual.id, index + 1);
    individualPointers.set(individual.id, pointer);
  });

  const individualsById = new Map(individuals.map((individual) => [individual.id, individual] as const));
  const families = buildFamilies(individuals, individualsById, individualPointers);
  const familyPointers = new Map<string, string>();
  const familiesBySpouse = new Map<string, GedcomFamily[]>();
  const familiesByChild = new Map<string, GedcomFamily[]>();

  families.forEach((family, index) => {
    const pointer = createPointer("F", family.key, index + 1);
    familyPointers.set(family.key, pointer);

    for (const spouseId of family.spouseIds) {
      const list = familiesBySpouse.get(spouseId) ?? [];
      list.push(family);
      familiesBySpouse.set(spouseId, list);
    }

    for (const childId of family.childrenIds) {
      const list = familiesByChild.get(childId) ?? [];
      list.push(family);
      familiesByChild.set(childId, list);
    }
  });

  for (const individual of individuals) {
    const pointer = individualPointers.get(individual.id);
    if (!pointer) {
      continue;
    }

    lines.push(`0 @${pointer}@ INDI`);

    const profile = individual.profile;
    const nameValue = buildNameValue(individual);
    if (nameValue) {
      lines.push(`1 NAME ${nameValue}`);
    }

    const givenNames = sanitizeText(profile.givenNames.join(" "));
    if (givenNames) {
      lines.push(`2 GIVN ${givenNames}`);
    }

    const surname = sanitizeText(profile.surname);
    if (surname) {
      lines.push(`2 SURN ${surname}`);
    }

    const maidenName = sanitizeText(profile.maidenName);
    if (maidenName) {
      lines.push(`1 NAME ${maidenName} /${surname ?? ""}/`);
      lines.push("2 TYPE birth");
    }

    if (profile.sex) {
      lines.push(`1 SEX ${profile.sex}`);
    }

    appendEvent(lines, "BIRT", profile.birth);
    appendEvent(lines, "DEAT", profile.death);

    for (const residence of profile.residences) {
      appendResidence(lines, residence);
    }

    for (const alias of profile.aliases) {
      const normalized = sanitizeText(alias);
      if (normalized) {
        lines.push(`1 ALIA ${normalized}`);
      }
    }

    const occupation = sanitizeText(profile.occupation);
    if (occupation) {
      lines.push(`1 OCCU ${occupation}`);
    }

    const religion = sanitizeText(profile.religion);
    if (religion) {
      lines.push(`1 RELI ${religion}`);
    }

    if (individual.roleId) {
      const roleLabel = sanitizeText(roleLabels.get(individual.roleId));
      if (roleLabel) {
        lines.push(`1 NOTE Role: ${roleLabel}`);
      }
    }

    if (individual.notes) {
      addNoteLines(lines, individual.notes);
    }

    if (profile.notes) {
      addNoteLines(lines, profile.notes);
    }

    const parentNotes = buildRelationshipNotes("Parent", profile.parents, profile.linkedParents, individualPointers);
    for (const note of parentNotes) {
      lines.push(`1 NOTE ${note}`);
    }

    const spouseNotes = buildLinkedNotes("Spouse", profile.spouses, profile.linkedSpouses, individualPointers, state);
    for (const note of spouseNotes) {
      lines.push(`1 NOTE ${note}`);
    }

    const childNotes = buildLinkedNotes("Child", profile.children, profile.linkedChildren, individualPointers, state);
    for (const note of childNotes) {
      lines.push(`1 NOTE ${note}`);
    }

    const siblingNotes = buildSimpleNotes("Sibling", profile.siblings);
    for (const note of siblingNotes) {
      lines.push(`1 NOTE ${note}`);
    }

    const spouseFamilies = familiesBySpouse.get(individual.id) ?? [];
    for (const family of spouseFamilies) {
      const familyPointer = familyPointers.get(family.key);
      if (familyPointer) {
        lines.push(`1 FAMS @${familyPointer}@`);
      }
    }

    const childFamilies = familiesByChild.get(individual.id) ?? [];
    for (const family of childFamilies) {
      const familyPointer = familyPointers.get(family.key);
      if (familyPointer) {
        lines.push(`1 FAMC @${familyPointer}@`);
      }
    }
  }

  for (const family of families) {
    const familyPointer = familyPointers.get(family.key);
    if (!familyPointer) {
      continue;
    }

    lines.push(`0 @${familyPointer}@ FAM`);

    if (family.husbandId) {
      const husbandPointer = individualPointers.get(family.husbandId);
      if (husbandPointer) {
        lines.push(`1 HUSB @${husbandPointer}@`);
      }
    }

    if (family.wifeId) {
      const wifePointer = individualPointers.get(family.wifeId);
      if (wifePointer) {
        lines.push(`1 WIFE @${wifePointer}@`);
      }
    }

    const children = Array.from(family.childrenIds).sort();
    for (const childId of children) {
      const childPointer = individualPointers.get(childId);
      if (childPointer) {
        lines.push(`1 CHIL @${childPointer}@`);
      }
    }
  }

  lines.push("0 TRLR");

  return lines.join("\n");
}

export function generateIndividualGedcom(
  state: PersistedState,
  individualId: string,
): string | null {
  const individual = state.individuals.find((entry) => entry.id === individualId);
  if (!individual) {
    return null;
  }
  return generateGedcomDocument(state, { individualIds: [individualId] });
}

function getIndividualsForDocument(
  state: PersistedState,
  selectedIds: readonly string[] | undefined,
): StoredIndividual[] {
  if (!selectedIds || !selectedIds.length) {
    return state.individuals;
  }

  const selectedSet = new Set(selectedIds);
  return state.individuals.filter((individual) => selectedSet.has(individual.id));
}

function createPointer(prefix: string, id: string, index: number): string {
  const sanitized = id.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (sanitized.length) {
    return `${prefix}${sanitized}`;
  }
  return `${prefix}${index}`;
}

function buildNameValue(individual: StoredIndividual): string | null {
  const profile = individual.profile;
  const given = sanitizeText(profile.givenNames.join(" ")) || sanitizeText(individual.name);
  const surname = sanitizeText(profile.surname ?? "");

  if (!given && !surname) {
    const fallback = sanitizeText(individual.name);
    return fallback ? `${fallback}` : null;
  }

  return `${given ?? ""} /${surname ?? ""}/`.trim();
}

function buildFamilies(
  individuals: readonly StoredIndividual[],
  individualsById: Map<string, StoredIndividual>,
  pointers: Map<string, string>,
): GedcomFamily[] {
  const familyMap = new Map<string, GedcomFamily>();

  const ensureFamily = (husbandId?: string, wifeId?: string): GedcomFamily => {
    const normalizedHusband = husbandId && pointers.has(husbandId) ? husbandId : undefined;
    const normalizedWife = wifeId && pointers.has(wifeId) ? wifeId : undefined;
    const key = `${normalizedHusband ?? ""}|${normalizedWife ?? ""}`;
    const existing = familyMap.get(key);
    if (existing) {
      return existing;
    }
    const created: GedcomFamily = {
      key,
      husbandId: normalizedHusband,
      wifeId: normalizedWife,
      spouseIds: new Set(),
      childrenIds: new Set(),
    };
    if (normalizedHusband) {
      created.spouseIds.add(normalizedHusband);
    }
    if (normalizedWife) {
      created.spouseIds.add(normalizedWife);
    }
    familyMap.set(key, created);
    return created;
  };

  for (const individual of individuals) {
    const { father, mother } = individual.profile.linkedParents;
    if (father || mother) {
      const family = ensureFamily(father, mother);
      family.childrenIds.add(individual.id);
    }
  }

  for (const individual of individuals) {
    for (const spouseId of individual.profile.linkedSpouses) {
      const roles = assignSpouseRoles(individual.id, spouseId, individualsById);
      const family = ensureFamily(roles.husbandId, roles.wifeId);
      family.spouseIds.add(individual.id);
      if (pointers.has(spouseId)) {
        family.spouseIds.add(spouseId);
      }
      for (const childId of individual.profile.linkedChildren) {
        if (pointers.has(childId)) {
          family.childrenIds.add(childId);
        }
      }
    }
  }

  return Array.from(familyMap.values());
}

function assignSpouseRoles(
  primaryId: string,
  spouseId: string,
  individualsById: Map<string, StoredIndividual>,
): { husbandId?: string; wifeId?: string } {
  const primary = individualsById.get(primaryId);
  const spouse = individualsById.get(spouseId);
  const primarySex = primary?.profile.sex;
  const spouseSex = spouse?.profile.sex;

  if (primarySex === "M" && spouseSex === "F") {
    return { husbandId: primaryId, wifeId: spouseId };
  }
  if (primarySex === "F" && spouseSex === "M") {
    return { husbandId: spouseId, wifeId: primaryId };
  }
  if (primarySex === "M" && spouseSex !== "M") {
    return { husbandId: primaryId, wifeId: spouseId };
  }
  if (spouseSex === "M" && primarySex !== "M") {
    return { husbandId: spouseId, wifeId: primaryId };
  }
  if (primarySex === "F" && spouseSex !== "F") {
    return { husbandId: spouseId, wifeId: primaryId };
  }
  if (spouseSex === "F" && primarySex !== "F") {
    return { husbandId: primaryId, wifeId: spouseId };
  }

  const [first, second] = [primaryId, spouseId].sort();
  return { husbandId: first, wifeId: second };
}

function appendEvent(lines: string[], tag: string, details: EventDetails): void {
  const hasContent =
    Boolean(details.raw && details.raw.trim().length) ||
    typeof details.year === "number" ||
    typeof details.month === "number" ||
    typeof details.day === "number" ||
    Boolean(details.place && details.place.trim().length);

  if (!hasContent) {
    return;
  }

  lines.push(`1 ${tag}`);
  const dateValue = formatGedcomDate(details);
  if (dateValue) {
    lines.push(`2 DATE ${dateValue}`);
  }

  const placeValue = sanitizeText(details.place);
  if (placeValue) {
    lines.push(`2 PLAC ${placeValue}`);
  }

  const rawValue = sanitizeText(details.raw);
  if (rawValue && rawValue !== placeValue) {
    lines.push(`2 NOTE ${rawValue}`);
  }
}

function appendResidence(
  lines: string[],
  residence: { raw?: string; year?: number; place?: string },
): void {
  const hasContent =
    Boolean(residence.raw && residence.raw.trim().length) ||
    typeof residence.year === "number" ||
    Boolean(residence.place && residence.place.trim().length);

  if (!hasContent) {
    return;
  }

  lines.push("1 RESI");

  if (typeof residence.year === "number" && Number.isFinite(residence.year)) {
    lines.push(`2 DATE ${residence.year}`);
  }

  const placeValue = sanitizeText(residence.place);
  if (placeValue) {
    lines.push(`2 PLAC ${placeValue}`);
  }

  const rawValue = sanitizeText(residence.raw);
  if (rawValue && rawValue !== placeValue) {
    lines.push(`2 NOTE ${rawValue}`);
  }
}

function formatGedcomDate(details: EventDetails): string | null {
  const { year, month, day, approx } = details;
  if (typeof year !== "number" && typeof month !== "number" && typeof day !== "number") {
    return null;
  }

  const prefix = approx ? "ABT " : "";

  if (typeof year === "number" && typeof month === "number" && typeof day === "number") {
    const monthLabel = GEDCOM_MONTHS[clampMonth(month)];
    return `${prefix}${day} ${monthLabel} ${year}`;
  }

  if (typeof year === "number" && typeof month === "number") {
    const monthLabel = GEDCOM_MONTHS[clampMonth(month)];
    return `${prefix}${monthLabel} ${year}`;
  }

  if (typeof year === "number") {
    return `${prefix}${year}`;
  }

  return null;
}

function clampMonth(month: number): number {
  if (!Number.isFinite(month)) {
    return 0;
  }
  if (month < 1) {
    return 1;
  }
  if (month > 12) {
    return 12;
  }
  return Math.round(month);
}

function padNumber(value: number): string {
  return value.toString().padStart(2, "0");
}

function sanitizeText(value: string | undefined | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length ? normalized : undefined;
}

function addNoteLines(lines: string[], note: string): void {
  const normalized = sanitizeText(note);
  if (!normalized) {
    return;
  }

  const chunks = normalized.split(/(?<=.{1,80})(?:\s+|$)/g).filter((chunk) => chunk.trim().length);
  for (const chunk of chunks) {
    lines.push(`1 NOTE ${chunk.trim()}`);
  }
}

function buildRelationshipNotes(
  label: string,
  names: { father?: string; mother?: string },
  links: { father?: string; mother?: string },
  pointers: Map<string, string>,
): string[] {
  const notes: string[] = [];

  if (names.father || links.father) {
    notes.push(composeRelationshipNote(`${label} (father)`, names.father, links.father, pointers));
  }

  if (names.mother || links.mother) {
    notes.push(composeRelationshipNote(`${label} (mother)`, names.mother, links.mother, pointers));
  }

  return notes.filter((note) => note.length > 0);
}

function buildLinkedNotes(
  label: string,
  names: readonly string[],
  links: readonly string[],
  pointers: Map<string, string>,
  state: PersistedState,
): string[] {
  const results: string[] = [];
  const linkedSet = new Set(links);

  for (const link of linkedSet) {
    const pointer = pointers.get(link);
    if (pointer) {
      const individual = state.individuals.find((item) => item.id === link);
      const name = individual ? individual.name : undefined;
      results.push(composeRelationshipNote(label, name, link, pointers));
    }
  }

  for (const name of names) {
    const normalized = sanitizeText(name);
    if (normalized && !results.some((entry) => entry.includes(normalized))) {
      results.push(`${label}: ${normalized}`);
    }
  }

  return results;
}

function buildSimpleNotes(label: string, names: readonly string[]): string[] {
  return names
    .map((name) => sanitizeText(name))
    .filter((value): value is string => Boolean(value))
    .map((value) => `${label}: ${value}`);
}

function composeRelationshipNote(
  label: string,
  name: string | undefined,
  linkedId: string | undefined,
  pointers: Map<string, string>,
): string {
  const pointer = linkedId ? pointers.get(linkedId) : undefined;
  const namePart = sanitizeText(name);
  if (pointer && namePart) {
    return `${label}: ${namePart} (see @${pointer}@)`;
  }
  if (pointer) {
    return `${label}: Linked individual @${pointer}@`;
  }
  if (namePart) {
    return `${label}: ${namePart}`;
  }
  return "";
}

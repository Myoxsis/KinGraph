import type { IndividualRecord } from "../schema";
import { TEMPLATE_PROFESSIONS } from "../professions";
import { TEMPLATE_PLACES, type PlaceCategory } from "../places";

export interface StoredProfessionDefinition {
  id: string;
  label: string;
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StoredPlaceDefinition {
  id: string;
  label: string;
  aliases: string[];
  category?: PlaceCategory;
  createdAt: string;
  updatedAt: string;
}

export interface StoredIndividual {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredRecord {
  id: string;
  individualId: string;
  createdAt: string;
  summary: string;
  record: IndividualRecord;
}

interface PersistedState {
  individuals: StoredIndividual[];
  records: StoredRecord[];
  professions: StoredProfessionDefinition[];
  places: StoredPlaceDefinition[];
}

type StateListener = (state: PersistedState) => void;

const STORAGE_KEY = "kingraph.app.data.v1";

const defaultState: PersistedState = createDefaultState();

let state: PersistedState = loadState();
const listeners = new Set<StateListener>();

function loadState(): PersistedState {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return cloneState(defaultState);
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return cloneState(defaultState);
    }

    const parsed = JSON.parse(raw) as Partial<PersistedState>;

    if (!parsed || typeof parsed !== "object") {
      return cloneState(defaultState);
    }

    return normalizeState(parsed);
  } catch (error) {
    console.warn("Failed to read KinGraph storage:", error);
    return cloneState(defaultState);
  }
}

function normalizeState(value: Partial<PersistedState>): PersistedState {
  const individuals = Array.isArray(value.individuals) ? value.individuals : [];
  const records = Array.isArray(value.records) ? value.records : [];
  const hasProfessionData = Array.isArray(value.professions);
  const professions = hasProfessionData ? (value.professions as StoredProfessionDefinition[]) : [];
  const hasPlaceData = Array.isArray(value.places);
  const places = hasPlaceData ? (value.places as StoredPlaceDefinition[]) : [];

  const normalized: PersistedState = {
    individuals: individuals
      .filter((item): item is StoredIndividual =>
        Boolean(item && typeof item.id === "string" && typeof item.name === "string")
      )
      .map((item) => ({
        id: item.id,
        name: item.name,
        createdAt: item.createdAt ?? new Date().toISOString(),
        updatedAt: item.updatedAt ?? item.createdAt ?? new Date().toISOString(),
      })),
    records: records
      .filter((item): item is StoredRecord =>
        Boolean(item && typeof item.id === "string" && typeof item.individualId === "string" && item.record)
      )
      .map((item) => ({
        id: item.id,
        individualId: item.individualId,
        createdAt: item.createdAt ?? new Date().toISOString(),
        summary: item.summary ?? "",
        record: item.record,
      })),
    professions: professions
      .filter((item): item is StoredProfessionDefinition =>
        Boolean(item && typeof item.id === "string" && typeof item.label === "string")
      )
      .map((item) => ({
        id: item.id,
        label: item.label,
        aliases: normalizeAliases(Array.isArray(item.aliases) ? item.aliases : undefined),
        createdAt: item.createdAt ?? new Date().toISOString(),
        updatedAt: item.updatedAt ?? item.createdAt ?? new Date().toISOString(),
      })),
    places: places
      .filter((item): item is StoredPlaceDefinition =>
        Boolean(item && typeof item.id === "string" && typeof item.label === "string")
      )
      .map((item) => ({
        id: item.id,
        label: item.label,
        aliases: normalizeAliases(Array.isArray(item.aliases) ? item.aliases : undefined),
        category: item.category,
        createdAt: item.createdAt ?? new Date().toISOString(),
        updatedAt: item.updatedAt ?? item.createdAt ?? new Date().toISOString(),
      })),
  };

  if (!normalized.professions.length && !hasProfessionData) {
    normalized.professions = seedProfessions();
  }

  if (!normalized.places.length && !hasPlaceData) {
    normalized.places = seedPlaces();
  }

  return normalized;
}

function cloneState(value: PersistedState): PersistedState {
  return {
    individuals: value.individuals.map((individual) => ({ ...individual })),
    records: value.records.map((record) => ({
      ...record,
      record: cloneRecord(record.record),
    })),
    professions: value.professions.map((profession) => ({
      ...profession,
      aliases: [...profession.aliases],
    })),
    places: value.places.map((place) => ({
      ...place,
      aliases: [...place.aliases],
    })),
  };
}

function cloneRecord(record: IndividualRecord): IndividualRecord {
  if (typeof structuredClone === "function") {
    return structuredClone(record);
  }

  return JSON.parse(JSON.stringify(record)) as IndividualRecord;
}

function persist(next: PersistedState): void {
  state = next;

  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Failed to write KinGraph storage:", error);
  }
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function seedProfessions(): StoredProfessionDefinition[] {
  return TEMPLATE_PROFESSIONS.map((definition) => {
    const timestamp = new Date().toISOString();
    return {
      id: generateId(),
      label: definition.label,
      aliases: normalizeAliases(definition.aliases),
      createdAt: timestamp,
      updatedAt: timestamp,
    } satisfies StoredProfessionDefinition;
  });
}

function seedPlaces(): StoredPlaceDefinition[] {
  return TEMPLATE_PLACES.map((definition) => {
    const timestamp = new Date().toISOString();
    return {
      id: generateId(),
      label: definition.label,
      aliases: normalizeAliases(definition.aliases),
      category: definition.category,
      createdAt: timestamp,
      updatedAt: timestamp,
    } satisfies StoredPlaceDefinition;
  });
}

function createDefaultState(): PersistedState {
  return {
    individuals: [],
    records: [],
    professions: seedProfessions(),
    places: seedPlaces(),
  };
}

function normalizeAliases(aliases: readonly string[] | undefined): string[] {
  return Array.from(
    new Set((aliases ?? []).map((alias) => alias.trim()).filter((alias) => alias.length > 0)),
  );
}

function emit(): void {
  const snapshot = getState();
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function getState(): PersistedState {
  return cloneState(state);
}

export function subscribe(listener: StateListener): () => void {
  listeners.add(listener);
  listener(getState());

  return () => {
    listeners.delete(listener);
  };
}

export function createIndividual(name: string): StoredIndividual {
  const now = new Date().toISOString();
  const individual: StoredIndividual = {
    id: generateId(),
    name,
    createdAt: now,
    updatedAt: now,
  };

  const next = cloneState(state);
  next.individuals.push(individual);
  persist(next);
  emit();
  return individual;
}

export function renameIndividual(id: string, name: string): StoredIndividual | null {
  const next = cloneState(state);
  const target = next.individuals.find((individual) => individual.id === id);

  if (!target) {
    return null;
  }

  target.name = name;
  target.updatedAt = new Date().toISOString();
  persist(next);
  emit();
  return target;
}

export function saveProfessionDefinition(options: {
  id?: string;
  label: string;
  aliases?: string[];
}): StoredProfessionDefinition {
  const label = options.label.trim();
  if (!label) {
    throw new Error("Profession label cannot be empty.");
  }

  const normalizedAliases = normalizeAliases(options.aliases);
  const next = cloneState(state);
  const timestamp = new Date().toISOString();
  let stored: StoredProfessionDefinition | undefined;

  if (options.id) {
    stored = next.professions.find((item) => item.id === options.id);

    if (stored) {
      stored.label = label;
      stored.aliases = normalizedAliases;
      stored.updatedAt = timestamp;
    }
  }

  if (!stored) {
    stored = {
      id: options.id ?? generateId(),
      label,
      aliases: normalizedAliases,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    next.professions.push(stored);
  }

  persist(next);
  emit();
  return stored;
}

export function deleteProfessionDefinition(id: string): void {
  const next = cloneState(state);
  const index = next.professions.findIndex((item) => item.id === id);

  if (index === -1) {
    return;
  }

  next.professions.splice(index, 1);
  persist(next);
  emit();
}

export function savePlaceDefinition(options: {
  id?: string;
  label: string;
  aliases?: string[];
  category?: PlaceCategory;
}): StoredPlaceDefinition {
  const label = options.label.trim();
  if (!label) {
    throw new Error("Place label cannot be empty.");
  }

  const normalizedAliases = normalizeAliases(options.aliases);
  const next = cloneState(state);
  const timestamp = new Date().toISOString();
  let stored: StoredPlaceDefinition | undefined;

  if (options.id) {
    stored = next.places.find((item) => item.id === options.id);

    if (stored) {
      stored.label = label;
      stored.aliases = normalizedAliases;
      stored.category = options.category;
      stored.updatedAt = timestamp;
    }
  }

  if (!stored) {
    stored = {
      id: options.id ?? generateId(),
      label,
      aliases: normalizedAliases,
      category: options.category,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    next.places.push(stored);
  }

  persist(next);
  emit();
  return stored;
}

export function deletePlaceDefinition(id: string): void {
  const next = cloneState(state);
  const index = next.places.findIndex((item) => item.id === id);

  if (index === -1) {
    return;
  }

  next.places.splice(index, 1);
  persist(next);
  emit();
}

export function createRecord(options: {
  individualId: string;
  summary: string;
  record: IndividualRecord;
}): StoredRecord {
  const { individualId, summary, record } = options;
  const now = new Date().toISOString();

  const next = cloneState(state);
  const storedRecord: StoredRecord = {
    id: generateId(),
    individualId,
    createdAt: now,
    summary,
    record: cloneRecord(record),
  };

  next.records.push(storedRecord);

  const individual = next.individuals.find((item) => item.id === individualId);
  if (individual) {
    individual.updatedAt = now;
  }

  persist(next);
  emit();
  return storedRecord;
}

export function deleteRecord(id: string): void {
  const next = cloneState(state);
  const index = next.records.findIndex((record) => record.id === id);

  if (index === -1) {
    return;
  }

  const [removed] = next.records.splice(index, 1);
  const individual = next.individuals.find((item) => item.id === removed.individualId);

  if (individual) {
    individual.updatedAt = new Date().toISOString();
  }

  persist(next);
  emit();
}

export function clearRecords(): void {
  const next = cloneState(state);

  if (!next.records.length) {
    return;
  }

  next.records = [];
  persist(next);
  emit();
}

export function clearAll(): void {
  persist(cloneState(defaultState));
  emit();
}

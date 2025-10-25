import type { IndividualRecord } from "../schema";

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
}

type StateListener = (state: PersistedState) => void;

const STORAGE_KEY = "kingraph.app.data.v1";

const defaultState: PersistedState = {
  individuals: [],
  records: [],
};

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

  return {
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
  };
}

function cloneState(value: PersistedState): PersistedState {
  return {
    individuals: value.individuals.map((individual) => ({ ...individual })),
    records: value.records.map((record) => ({
      ...record,
      record: cloneRecord(record.record),
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

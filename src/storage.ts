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

export interface PersistedState {
  individuals: StoredIndividual[];
  records: StoredRecord[];
  professions: StoredProfessionDefinition[];
  places: StoredPlaceDefinition[];
}

type StateListener = (state: PersistedState) => void;

const DB_NAME = "kingraph.app.data";
const DB_VERSION = 1;
const STORE_NAMES = ["individuals", "records", "professions", "places"] as const;
type StoreName = (typeof STORE_NAMES)[number];

const defaultState: PersistedState = createDefaultState();
let state: PersistedState = cloneState(defaultState);
const listeners = new Set<StateListener>();

let databasePromise: Promise<IDBDatabase | null> | null = null;

const initialization = initialize();
export const ready: Promise<void> = initialization.then(() => undefined);

function supportsIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORE_NAMES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: "id" });
        }
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        databasePromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open KinGraph database."));
    };
  });
}

async function getDatabase(): Promise<IDBDatabase | null> {
  if (!supportsIndexedDb()) {
    return null;
  }

  if (!databasePromise) {
    databasePromise = openDatabase().catch((error) => {
      console.warn("Failed to open KinGraph database:", error);
      databasePromise = null;
      return null;
    });
  }

  return databasePromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
  });
}

async function writeToDatabase(next: PersistedState): Promise<void> {
  const db = await getDatabase();
  if (!db) {
    return;
  }

  const tx = db.transaction(STORE_NAMES as readonly StoreName[], "readwrite");
  const individualsStore = tx.objectStore("individuals");
  const recordsStore = tx.objectStore("records");
  const professionsStore = tx.objectStore("professions");
  const placesStore = tx.objectStore("places");

  try {
    await requestToPromise(individualsStore.clear());
    for (const individual of next.individuals) {
      await requestToPromise(individualsStore.put(individual));
    }

    await requestToPromise(recordsStore.clear());
    for (const record of next.records) {
      await requestToPromise(recordsStore.put(record));
    }

    await requestToPromise(professionsStore.clear());
    for (const profession of next.professions) {
      await requestToPromise(professionsStore.put(profession));
    }

    await requestToPromise(placesStore.clear());
    for (const place of next.places) {
      await requestToPromise(placesStore.put(place));
    }

    await transactionDone(tx);
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // ignore abort errors
    }
    throw error;
  }
}

async function loadPersistedState(): Promise<Partial<PersistedState>> {
  const db = await getDatabase();
  if (!db) {
    return {};
  }

  const tx = db.transaction(STORE_NAMES as readonly StoreName[], "readonly");
  const individualsStore = tx.objectStore("individuals");
  const recordsStore = tx.objectStore("records");
  const professionsStore = tx.objectStore("professions");
  const placesStore = tx.objectStore("places");

  const completion = transactionDone(tx);
  const [individuals, records, professions, places] = await Promise.all([
    requestToPromise(individualsStore.getAll()),
    requestToPromise(recordsStore.getAll()),
    requestToPromise(professionsStore.getAll()),
    requestToPromise(placesStore.getAll()),
  ]);
  await completion;

  const persisted: Partial<PersistedState> = {};
  if (individuals.length) {
    persisted.individuals = individuals as StoredIndividual[];
  }
  if (records.length) {
    persisted.records = records as StoredRecord[];
  }
  if (professions.length) {
    persisted.professions = professions as StoredProfessionDefinition[];
  }
  if (places.length) {
    persisted.places = places as StoredPlaceDefinition[];
  }

  return persisted;
}

async function initialize(): Promise<void> {
  try {
    const persisted = await loadPersistedState();
    const normalized = normalizeState(persisted);
    const seededProfessions = !("professions" in persisted);
    const seededPlaces = !("places" in persisted);
    state = normalized;

    if (seededProfessions || seededPlaces) {
      try {
        await writeToDatabase(state);
      } catch (error) {
        console.warn("Failed to seed KinGraph database:", error);
      }
    }
  } catch (error) {
    console.warn("Failed to initialize KinGraph storage:", error);
    state = cloneState(defaultState);
    try {
      await writeToDatabase(state);
    } catch (persistError) {
      console.warn("Failed to persist default KinGraph state:", persistError);
    }
  }
}

function cloneRecord(record: IndividualRecord): IndividualRecord {
  if (typeof structuredClone === "function") {
    return structuredClone(record);
  }

  return JSON.parse(JSON.stringify(record)) as IndividualRecord;
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
        Boolean(item && typeof item.id === "string" && typeof item.name === "string"),
      )
      .map((item) => ({
        id: item.id,
        name: item.name,
        createdAt: item.createdAt ?? new Date().toISOString(),
        updatedAt: item.updatedAt ?? item.createdAt ?? new Date().toISOString(),
      })),
    records: records
      .filter((item): item is StoredRecord =>
        Boolean(item && typeof item.id === "string" && typeof item.individualId === "string" && item.record),
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
        Boolean(item && typeof item.id === "string" && typeof item.label === "string"),
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
        Boolean(item && typeof item.id === "string" && typeof item.label === "string"),
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

function createDefaultState(): PersistedState {
  return {
    individuals: [],
    records: [],
    professions: seedProfessions(),
    places: seedPlaces(),
  };
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

function normalizeAliases(aliases: readonly string[] | undefined): string[] {
  return Array.from(
    new Set((aliases ?? []).map((alias) => alias.trim()).filter((alias) => alias.length > 0)),
  );
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

async function commit(next: PersistedState): Promise<void> {
  const previous = state;
  state = next;
  try {
    await writeToDatabase(next);
  } catch (error) {
    state = previous;
    throw error;
  }
  emit();
}

export function getState(): PersistedState {
  return cloneState(state);
}

export function subscribe(listener: StateListener): () => void {
  listeners.add(listener);
  void initialization.then(() => {
    listener(getState());
  });

  return () => {
    listeners.delete(listener);
  };
}

export async function createIndividual(name: string): Promise<StoredIndividual> {
  await initialization;
  const now = new Date().toISOString();
  const individual: StoredIndividual = {
    id: generateId(),
    name,
    createdAt: now,
    updatedAt: now,
  };

  const next = cloneState(state);
  next.individuals.push(individual);
  await commit(next);
  return individual;
}

export async function renameIndividual(id: string, name: string): Promise<StoredIndividual | null> {
  await initialization;
  const next = cloneState(state);
  const target = next.individuals.find((individual) => individual.id === id);

  if (!target) {
    return null;
  }

  target.name = name;
  target.updatedAt = new Date().toISOString();
  await commit(next);
  return target;
}

export async function saveProfessionDefinition(options: {
  id?: string;
  label: string;
  aliases?: string[];
}): Promise<StoredProfessionDefinition> {
  await initialization;
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

  await commit(next);
  return stored;
}

export async function deleteProfessionDefinition(id: string): Promise<void> {
  await initialization;
  const next = cloneState(state);
  const index = next.professions.findIndex((item) => item.id === id);

  if (index === -1) {
    return;
  }

  next.professions.splice(index, 1);
  await commit(next);
}

export async function savePlaceDefinition(options: {
  id?: string;
  label: string;
  aliases?: string[];
  category?: PlaceCategory;
}): Promise<StoredPlaceDefinition> {
  await initialization;
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

  await commit(next);
  return stored;
}

export async function deletePlaceDefinition(id: string): Promise<void> {
  await initialization;
  const next = cloneState(state);
  const index = next.places.findIndex((item) => item.id === id);

  if (index === -1) {
    return;
  }

  next.places.splice(index, 1);
  await commit(next);
}

export async function createRecord(options: {
  individualId: string;
  summary: string;
  record: IndividualRecord;
}): Promise<StoredRecord> {
  await initialization;
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

  await commit(next);
  return storedRecord;
}

export async function deleteRecord(id: string): Promise<void> {
  await initialization;
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

  await commit(next);
}

export async function clearRecords(): Promise<void> {
  await initialization;
  if (!state.records.length) {
    return;
  }

  const next = cloneState(state);
  next.records = [];
  await commit(next);
}

export async function clearAll(): Promise<void> {
  await initialization;
  const next = cloneState(defaultState);
  await commit(next);
}

export async function exportAllData(): Promise<PersistedState> {
  await initialization;
  return getState();
}

export async function importAllData(raw: unknown): Promise<PersistedState> {
  await initialization;
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Invalid data format.");
  }

  const normalized = normalizeState(raw as Partial<PersistedState>);
  await commit(cloneState(normalized));
  return getState();
}

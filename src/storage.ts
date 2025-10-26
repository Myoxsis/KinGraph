import type { IndividualRecord } from "../schema";
import { TEMPLATE_PROFESSIONS } from "../professions";
import { TEMPLATE_PLACES, type PlaceCategory } from "../places";
import { TEMPLATE_INDIVIDUAL_ROLES } from "../roles";

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

export interface StoredRoleDefinition {
  id: string;
  label: string;
  createdAt: string;
  updatedAt: string;
}

export interface IndividualProfile {
  givenNames: string[];
  surname?: string;
  maidenName?: string;
  aliases: string[];
  sex?: IndividualRecord["sex"];
  birth: IndividualRecord["birth"];
  death: IndividualRecord["death"];
  residences: IndividualRecord["residences"];
  parents: IndividualRecord["parents"];
  linkedParents: { father?: string; mother?: string };
  spouses: string[];
  linkedSpouses: string[];
  children: string[];
  linkedChildren: string[];
  siblings: string[];
  occupation?: string;
  religion?: string;
  notes?: string;
}

export interface StoredIndividual {
  id: string;
  name: string;
  notes: string;
  roleId: string | null;
  profile: IndividualProfile;
  profileUpdatedAt: string;
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
  roles: StoredRoleDefinition[];
}

type StateListener = (state: PersistedState) => void;

const DB_NAME = "kingraph.app.data";
const DB_VERSION = 2;
const STORE_NAMES = ["individuals", "records", "professions", "places", "roles"] as const;
type StoreName = (typeof STORE_NAMES)[number];

const defaultState: PersistedState = createDefaultState();
let state: PersistedState = cloneState(defaultState);
const listeners = new Set<StateListener>();

function sanitizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function sanitizeNumber(value: unknown): number | undefined {
  if (typeof value !== "number") {
    if (typeof value === "string" && value.trim().length) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  return Number.isFinite(value) ? value : undefined;
}

function sanitizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  return undefined;
}

export function createEmptyProfile(): IndividualProfile {
  return {
    givenNames: [],
    surname: undefined,
    maidenName: undefined,
    aliases: [],
    sex: undefined,
    birth: {},
    death: {},
    residences: [],
    parents: {},
    linkedParents: {},
    spouses: [],
    linkedSpouses: [],
    children: [],
    linkedChildren: [],
    siblings: [],
    occupation: undefined,
    religion: undefined,
    notes: undefined,
  };
}

function cloneProfile(profile: IndividualProfile): IndividualProfile {
  if (typeof structuredClone === "function") {
    return structuredClone(profile);
  }

  return JSON.parse(JSON.stringify(profile)) as IndividualProfile;
}

export function normalizeProfile(
  input: Partial<IndividualProfile> | IndividualProfile | undefined,
): IndividualProfile {
  const profile = createEmptyProfile();

  if (!input) {
    return profile;
  }

  profile.givenNames = Array.isArray(input.givenNames)
    ? input.givenNames.map((name) => sanitizeString(name) ?? "").filter((name) => name.length)
    : [];

  profile.surname = sanitizeString(input.surname);
  profile.maidenName = sanitizeString(input.maidenName);
  profile.aliases = Array.isArray(input.aliases)
    ? input.aliases.map((alias) => sanitizeString(alias) ?? "").filter((alias) => alias.length)
    : [];
  profile.sex = typeof input.sex === "string" && ["M", "F", "U"].includes(input.sex)
    ? (input.sex as IndividualRecord["sex"])
    : undefined;

  const birthSource = input.birth ?? {};
  profile.birth = {
    raw: sanitizeString(birthSource.raw),
    year: sanitizeNumber(birthSource.year),
    month: sanitizeNumber(birthSource.month),
    day: sanitizeNumber(birthSource.day),
    approx: sanitizeBoolean(birthSource.approx),
    place: sanitizeString(birthSource.place),
  };

  const deathSource = input.death ?? {};
  profile.death = {
    raw: sanitizeString(deathSource.raw),
    year: sanitizeNumber(deathSource.year),
    month: sanitizeNumber(deathSource.month),
    day: sanitizeNumber(deathSource.day),
    approx: sanitizeBoolean(deathSource.approx),
    place: sanitizeString(deathSource.place),
  };

  const normalizedResidences: IndividualRecord["residences"] = [];
  if (Array.isArray(input.residences)) {
    for (const residence of input.residences) {
      if (!residence || typeof residence !== "object") {
        continue;
      }

      const normalized = {
        raw: sanitizeString((residence as { raw?: unknown }).raw),
        year: sanitizeNumber((residence as { year?: unknown }).year),
        place: sanitizeString((residence as { place?: unknown }).place),
      };

      if (normalized.raw || normalized.year !== undefined || normalized.place) {
        normalizedResidences.push(normalized);
      }
    }
  }

  profile.residences = normalizedResidences;

  profile.parents = {
    father: sanitizeString(input.parents?.father),
    mother: sanitizeString(input.parents?.mother),
  };

  const linkedParentsSource = (input as { linkedParents?: { father?: unknown; mother?: unknown } }).linkedParents ?? {};
  profile.linkedParents = {
    father: sanitizeString(linkedParentsSource.father),
    mother: sanitizeString(linkedParentsSource.mother),
  };

  const normalizeLinkArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
      return [];
    }

    const seen = new Set<string>();
    const links: string[] = [];

    for (const entry of value) {
      const sanitized = sanitizeString(entry);
      if (sanitized && !seen.has(sanitized)) {
        seen.add(sanitized);
        links.push(sanitized);
      }
    }

    return links;
  };

  profile.spouses = Array.isArray(input.spouses)
    ? input.spouses.map((spouse) => sanitizeString(spouse) ?? "").filter((spouse) => spouse.length)
    : [];
  profile.linkedSpouses = normalizeLinkArray((input as { linkedSpouses?: unknown }).linkedSpouses);
  profile.children = Array.isArray(input.children)
    ? input.children.map((child) => sanitizeString(child) ?? "").filter((child) => child.length)
    : [];
  profile.linkedChildren = normalizeLinkArray((input as { linkedChildren?: unknown }).linkedChildren);
  profile.siblings = Array.isArray(input.siblings)
    ? input.siblings.map((sibling) => sanitizeString(sibling) ?? "").filter((sibling) => sibling.length)
    : [];

  profile.occupation = sanitizeString(input.occupation);
  profile.religion = sanitizeString(input.religion);

  if (typeof input.notes === "string") {
    const trimmed = input.notes.trim();
    profile.notes = trimmed.length ? trimmed : undefined;
  }

  return profile;
}

export function cloneIndividualProfile(profile: IndividualProfile): IndividualProfile {
  return cloneProfile(profile);
}

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
  const rolesStore = tx.objectStore("roles");

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

    await requestToPromise(rolesStore.clear());
    for (const role of next.roles) {
      await requestToPromise(rolesStore.put(role));
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
  const rolesStore = tx.objectStore("roles");

  const completion = transactionDone(tx);
  const [individuals, records, professions, places, roles] = await Promise.all([
    requestToPromise(individualsStore.getAll()),
    requestToPromise(recordsStore.getAll()),
    requestToPromise(professionsStore.getAll()),
    requestToPromise(placesStore.getAll()),
    requestToPromise(rolesStore.getAll()),
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
  if (roles.length) {
    persisted.roles = roles as StoredRoleDefinition[];
  }

  return persisted;
}

async function initialize(): Promise<void> {
  try {
    const persisted = await loadPersistedState();
    const normalized = normalizeState(persisted);
    const seededProfessions = !("professions" in persisted);
    const seededPlaces = !("places" in persisted);
    const seededRoles = !("roles" in persisted);
    state = normalized;

    if (seededProfessions || seededPlaces || seededRoles) {
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
    individuals: value.individuals.map((individual) => ({
      ...individual,
      profile: cloneProfile(individual.profile),
    })),
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
    roles: value.roles.map((role) => ({
      ...role,
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
  const hasRoleData = Array.isArray(value.roles);
  const roles = hasRoleData ? (value.roles as StoredRoleDefinition[]) : [];

  const normalizedRoles = roles
    .filter((item): item is StoredRoleDefinition =>
      Boolean(item && typeof item.id === "string" && typeof item.label === "string"),
    )
    .map((item) => ({
      id: item.id,
      label: item.label,
      createdAt: item.createdAt ?? new Date().toISOString(),
      updatedAt: item.updatedAt ?? item.createdAt ?? new Date().toISOString(),
    }));

  const roleIds = new Set(normalizedRoles.map((role) => role.id));

  const normalizedIndividuals = individuals
    .filter((item): item is StoredIndividual =>
      Boolean(item && typeof item.id === "string" && typeof item.name === "string"),
    )
    .map((item) => {
      const createdAt = item.createdAt ?? new Date().toISOString();
      const updatedAt = item.updatedAt ?? createdAt;
      const profileSource = (item as { profile?: Partial<IndividualProfile> }).profile;
      const profile = normalizeProfile(profileSource);
      const profileUpdatedAt = (item as { profileUpdatedAt?: string }).profileUpdatedAt ?? updatedAt ?? createdAt;
      const rawRoleId = typeof (item as { roleId?: unknown }).roleId === "string"
        ? ((item as { roleId?: string }).roleId ?? null)
        : null;
      const roleId = rawRoleId && roleIds.has(rawRoleId) ? rawRoleId : null;

      return {
        id: item.id,
        name: item.name,
        notes: typeof item.notes === "string" ? item.notes : "",
        roleId,
        profile,
        profileUpdatedAt,
        createdAt,
        updatedAt,
      } satisfies StoredIndividual;
    });

  const normalizedRecords = records
    .filter((item): item is StoredRecord =>
      Boolean(item && typeof item.id === "string" && typeof item.individualId === "string" && item.record),
    )
    .map((item) => ({
      id: item.id,
      individualId: item.individualId,
      createdAt: item.createdAt ?? new Date().toISOString(),
      summary: item.summary ?? "",
      record: item.record,
    }));

  const normalizedProfessions = professions
    .filter((item): item is StoredProfessionDefinition =>
      Boolean(item && typeof item.id === "string" && typeof item.label === "string"),
    )
    .map((item) => ({
      id: item.id,
      label: item.label,
      aliases: normalizeAliases(Array.isArray(item.aliases) ? item.aliases : undefined),
      createdAt: item.createdAt ?? new Date().toISOString(),
      updatedAt: item.updatedAt ?? item.createdAt ?? new Date().toISOString(),
    }));

  const normalizedPlaces = places
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
    }));

  const normalized: PersistedState = {
    individuals: normalizedIndividuals,
    records: normalizedRecords,
    professions: normalizedProfessions,
    places: normalizedPlaces,
    roles: normalizedRoles,
  };

  if (!normalized.professions.length && !hasProfessionData) {
    normalized.professions = seedProfessions();
  }

  if (!normalized.places.length && !hasPlaceData) {
    normalized.places = seedPlaces();
  }

  if (!normalized.roles.length && !hasRoleData) {
    normalized.roles = seedIndividualRoles();
  }

  const refreshedRoleIds = new Set(normalized.roles.map((role) => role.id));
  normalized.individuals = normalized.individuals.map((individual) => ({
    ...individual,
    roleId: individual.roleId && refreshedRoleIds.has(individual.roleId) ? individual.roleId : null,
  }));

  return normalized;
}

function createDefaultState(): PersistedState {
  return {
    individuals: [],
    records: [],
    professions: seedProfessions(),
    places: seedPlaces(),
    roles: seedIndividualRoles(),
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

function seedIndividualRoles(): StoredRoleDefinition[] {
  return TEMPLATE_INDIVIDUAL_ROLES.map((definition) => {
    const timestamp = new Date().toISOString();
    return {
      id: generateId(),
      label: definition.label,
      createdAt: timestamp,
      updatedAt: timestamp,
    } satisfies StoredRoleDefinition;
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

function resolveRoleId(roleId: string | null | undefined): string | null {
  if (typeof roleId !== "string") {
    return null;
  }

  const trimmed = roleId.trim();
  if (!trimmed) {
    return null;
  }

  return state.roles.some((role) => role.id === trimmed) ? trimmed : null;
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

export async function createIndividual(
  name: string,
  options: { roleId?: string | null } = {},
): Promise<StoredIndividual> {
  await initialization;
  const roleId = resolveRoleId(options.roleId ?? null);
  const now = new Date().toISOString();
  const individual: StoredIndividual = {
    id: generateId(),
    name,
    notes: "",
    roleId,
    profile: createEmptyProfile(),
    profileUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  const next = cloneState(state);
  next.individuals.push(individual);
  await commit(next);
  return individual;
}

export async function updateIndividual(
  options: { id: string; name?: string; notes?: string; roleId?: string | null },
): Promise<StoredIndividual | null> {
  await initialization;
  const next = cloneState(state);
  const target = next.individuals.find((individual) => individual.id === options.id);

  if (!target) {
    return null;
  }

  let changed = false;

  if (typeof options.name !== "undefined") {
    const trimmedName = options.name.trim();
    if (!trimmedName) {
      throw new Error("Individual name cannot be empty.");
    }
    if (target.name !== trimmedName) {
      target.name = trimmedName;
      changed = true;
    }
  }

  if (typeof options.notes !== "undefined") {
    const trimmedNotes = options.notes.trim();
    if (target.notes !== trimmedNotes) {
      target.notes = trimmedNotes;
      changed = true;
    }
  }

  if (typeof options.roleId !== "undefined") {
    const normalizedRoleId = resolveRoleId(options.roleId ?? null);
    if (target.roleId !== normalizedRoleId) {
      target.roleId = normalizedRoleId;
      changed = true;
    }
  }

  if (!changed) {
    return target;
  }

  target.updatedAt = new Date().toISOString();
  await commit(next);
  return target;
}

export async function updateIndividualProfile(
  id: string,
  profile: IndividualProfile,
): Promise<StoredIndividual | null> {
  await initialization;
  const next = cloneState(state);
  const target = next.individuals.find((individual) => individual.id === id);

  if (!target) {
    return null;
  }

  const normalized = normalizeProfile(profile);
  target.profile = normalized;
  const timestamp = new Date().toISOString();
  target.profileUpdatedAt = timestamp;
  target.updatedAt = timestamp;

  await commit(next);
  return target;
}

export async function renameIndividual(id: string, name: string): Promise<StoredIndividual | null> {
  return updateIndividual({ id, name });
}

export async function deleteIndividual(id: string): Promise<void> {
  await initialization;
  const next = cloneState(state);
  const index = next.individuals.findIndex((individual) => individual.id === id);

  if (index === -1) {
    return;
  }

  next.individuals.splice(index, 1);

  const now = new Date().toISOString();

  next.records = next.records.filter((record) => record.individualId !== id);

  for (const individual of next.individuals) {
    let profileChanged = false;
    const { linkedParents, linkedSpouses, linkedChildren } = individual.profile;

    if (linkedParents.father === id) {
      linkedParents.father = undefined;
      profileChanged = true;
    }

    if (linkedParents.mother === id) {
      linkedParents.mother = undefined;
      profileChanged = true;
    }

    const filteredSpouses = linkedSpouses.filter((spouseId) => spouseId !== id);
    if (filteredSpouses.length !== linkedSpouses.length) {
      individual.profile.linkedSpouses = filteredSpouses;
      profileChanged = true;
    }

    const filteredChildren = linkedChildren.filter((childId) => childId !== id);
    if (filteredChildren.length !== linkedChildren.length) {
      individual.profile.linkedChildren = filteredChildren;
      profileChanged = true;
    }

    if (profileChanged) {
      individual.profileUpdatedAt = now;
      individual.updatedAt = now;
    }
  }

  await commit(next);
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

export async function saveIndividualRoleDefinition(options: {
  id?: string;
  label: string;
}): Promise<StoredRoleDefinition> {
  await initialization;
  const label = options.label.trim();
  if (!label) {
    throw new Error("Role label cannot be empty.");
  }

  const next = cloneState(state);
  const timestamp = new Date().toISOString();
  let stored: StoredRoleDefinition | undefined;

  if (options.id) {
    stored = next.roles.find((item) => item.id === options.id);

    if (stored) {
      stored.label = label;
      stored.updatedAt = timestamp;
    }
  }

  if (!stored) {
    stored = {
      id: options.id ?? generateId(),
      label,
      createdAt: timestamp,
      updatedAt: timestamp,
    } satisfies StoredRoleDefinition;
    next.roles.push(stored);
  }

  await commit(next);
  return stored;
}

export async function deleteIndividualRoleDefinition(id: string): Promise<void> {
  await initialization;
  const next = cloneState(state);
  const index = next.roles.findIndex((item) => item.id === id);

  if (index === -1) {
    return;
  }

  next.roles.splice(index, 1);

  const now = new Date().toISOString();
  for (const individual of next.individuals) {
    if (individual.roleId === id) {
      individual.roleId = null;
      individual.updatedAt = now;
    }
  }

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

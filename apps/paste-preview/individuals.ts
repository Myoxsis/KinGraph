import {
  cloneIndividualProfile,
  createEmptyProfile,
  createIndividual,
  getState,
  normalizeProfile,
  subscribe,
  updateIndividual,
  updateIndividualProfile,
  type IndividualProfile,
  type StoredRecord,
} from "@/storage";
import { formatTimestamp, getRecordSummary } from "./shared/utils";
import { initializeWorkspaceSearch } from "./shared/search";
import type { IndividualRecord } from "../../schema";

const PROFILE_FIELD_KEYS = [
  "givenNames",
  "surname",
  "maidenName",
  "aliases",
  "sex",
  "birth.raw",
  "birth.year",
  "birth.month",
  "birth.day",
  "birth.approx",
  "birth.place",
  "death.raw",
  "death.year",
  "death.month",
  "death.day",
  "death.approx",
  "death.place",
  "parents.father",
  "parents.mother",
  "spouses",
  "children",
  "siblings",
  "residences",
  "occupation",
  "religion",
  "notes",
] as const;

type ProfileFieldKey = (typeof PROFILE_FIELD_KEYS)[number];

type FieldInputElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

type FieldType =
  | "text"
  | "textarea"
  | "string-list"
  | "number"
  | "select"
  | "json";

interface FieldOption {
  label: string;
  value: string;
}

interface FieldConfig {
  key: ProfileFieldKey;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: FieldOption[];
}

interface FieldSuggestion {
  key: string;
  label: string;
  value: unknown;
  records: string[];
}

interface FieldRenderer {
  config: FieldConfig;
  container: HTMLDivElement;
  input: FieldInputElement;
  suggestionsContainer: HTMLDivElement;
  helper: HTMLParagraphElement;
  suggestionButtons: { key: string; button: HTMLButtonElement }[];
  setValue: (value: unknown) => void;
  setSuggestions: (suggestions: FieldSuggestion[], activeKey: string | null) => void;
  setActiveKey: (activeKey: string | null) => void;
  setError: (message: string | null) => void;
}

interface RecordCandidate {
  profile: IndividualProfile;
  summary: string;
}

interface IndividualsElements {
  list: HTMLDivElement;
  createForm: HTMLFormElement;
  createNameInput: HTMLInputElement;
  createRoleSelect: HTMLSelectElement;
  createFeedback: HTMLSpanElement | null;
  editForm: HTMLFormElement;
  editNameInput: HTMLInputElement;
  editNotesInput: HTMLTextAreaElement;
  editRoleSelect: HTMLSelectElement;
  editSaveButton: HTMLButtonElement;
  editFeedback: HTMLSpanElement | null;
  editModal: HTMLDivElement;
  editModalBackdrop: HTMLDivElement | null;
  editModalClose: HTMLButtonElement;
  profileEditor: HTMLDivElement;
  profileFieldsContainer: HTMLDivElement;
  profileSaveButton: HTMLButtonElement;
  profileFeedback: HTMLSpanElement | null;
  profileUpdatedAt: HTMLSpanElement | null;
  workspaceSearchForm: HTMLFormElement | null;
  workspaceSearchInput: HTMLInputElement;
  workspaceSearchClear: HTMLButtonElement | null;
}

const PROFILE_FIELD_CONFIGS: FieldConfig[] = [
  {
    key: "givenNames",
    label: "Given names",
    type: "string-list",
    placeholder: "One name per line",
  },
  {
    key: "surname",
    label: "Surname",
    type: "text",
    placeholder: "Surname or family name",
  },
  {
    key: "maidenName",
    label: "Maiden name",
    type: "text",
  },
  {
    key: "aliases",
    label: "Aliases",
    type: "string-list",
    placeholder: "Other known names",
  },
  {
    key: "sex",
    label: "Sex",
    type: "select",
    options: [
      { label: "Unspecified", value: "" },
      { label: "Female", value: "F" },
      { label: "Male", value: "M" },
      { label: "Unknown", value: "U" },
    ],
  },
  {
    key: "birth.raw",
    label: "Birth description",
    type: "textarea",
    placeholder: "Free-form birth details",
  },
  { key: "birth.year", label: "Birth year", type: "number" },
  { key: "birth.month", label: "Birth month", type: "number" },
  { key: "birth.day", label: "Birth day", type: "number" },
  {
    key: "birth.approx",
    label: "Birth certainty",
    type: "select",
    options: [
      { label: "Unspecified", value: "" },
      { label: "Exact", value: "false" },
      { label: "Approximate", value: "true" },
    ],
  },
  {
    key: "birth.place",
    label: "Birth place",
    type: "text",
  },
  {
    key: "death.raw",
    label: "Death description",
    type: "textarea",
    placeholder: "Free-form death details",
  },
  { key: "death.year", label: "Death year", type: "number" },
  { key: "death.month", label: "Death month", type: "number" },
  { key: "death.day", label: "Death day", type: "number" },
  {
    key: "death.approx",
    label: "Death certainty",
    type: "select",
    options: [
      { label: "Unspecified", value: "" },
      { label: "Exact", value: "false" },
      { label: "Approximate", value: "true" },
    ],
  },
  {
    key: "death.place",
    label: "Death place",
    type: "text",
  },
  {
    key: "parents.father",
    label: "Father",
    type: "text",
  },
  {
    key: "parents.mother",
    label: "Mother",
    type: "text",
  },
  {
    key: "spouses",
    label: "Spouses",
    type: "string-list",
    placeholder: "One spouse per line",
  },
  {
    key: "children",
    label: "Children",
    type: "string-list",
    placeholder: "One child per line",
  },
  {
    key: "siblings",
    label: "Siblings",
    type: "string-list",
    placeholder: "One sibling per line",
  },
  {
    key: "residences",
    label: "Residences",
    type: "json",
    placeholder: '[\n  { "place": "City", "year": 1900 }\n]'
  },
  {
    key: "occupation",
    label: "Occupation",
    type: "text",
  },
  {
    key: "religion",
    label: "Religion",
    type: "text",
  },
  {
    key: "notes",
    label: "Notes",
    type: "textarea",
    placeholder: "Additional remarks about the individual",
  },
];

function createFieldRenderer(
  config: FieldConfig,
  onValueChange: (renderer: FieldRenderer) => void,
  onSuggestionApply: (renderer: FieldRenderer, suggestion: FieldSuggestion) => void,
): FieldRenderer {
  const container = document.createElement("div");
  container.className = "field-block";

  const label = document.createElement("label");
  const inputId = `profile-${config.key.replace(/\./g, "-")}`;
  label.setAttribute("for", inputId);
  label.textContent = config.label;
  container.appendChild(label);

  const input = createFieldInput(config);
  input.id = inputId;
  container.appendChild(input);

  const suggestionsContainer = document.createElement("div");
  suggestionsContainer.className = "field-suggestions";
  container.appendChild(suggestionsContainer);

  const helper = document.createElement("p");
  helper.className = "field-helper";
  helper.hidden = true;
  container.appendChild(helper);

  if (input instanceof HTMLSelectElement) {
    input.addEventListener("change", () => onValueChange(renderer));
  } else {
    input.addEventListener("input", () => onValueChange(renderer));
    input.addEventListener("change", () => onValueChange(renderer));
  }

  const renderer: FieldRenderer = {
    config,
    container,
    input,
    suggestionsContainer,
    helper,
    suggestionButtons: [],
    setValue(value) {
      applyValueToInput(config, input, value);
    },
    setSuggestions(suggestions, activeKey) {
      renderer.suggestionButtons = [];
      suggestionsContainer.replaceChildren();

      if (!suggestions.length) {
        const message = document.createElement("span");
        message.className = "empty-message";
        message.textContent = "No values from linked records yet.";
        suggestionsContainer.appendChild(message);
        return;
      }

      for (const suggestion of suggestions) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "suggestion";

        const valueLabel = document.createElement("span");
        valueLabel.className = "suggestion-value";
        valueLabel.textContent = suggestion.label || "(blank)";
        button.appendChild(valueLabel);

        const meta = document.createElement("span");
        meta.className = "suggestion-meta";
        const [first, ...rest] = suggestion.records;
        if (!first) {
          meta.textContent = "Linked record";
        } else if (!rest.length) {
          meta.textContent = first;
        } else {
          meta.textContent = `${first} (+${rest.length})`;
          button.title = suggestion.records.join("\n");
        }
        button.appendChild(meta);

        button.addEventListener("click", () => onSuggestionApply(renderer, suggestion));

        renderer.suggestionButtons.push({ key: suggestion.key, button });
        suggestionsContainer.appendChild(button);
      }

      renderer.setActiveKey(activeKey);
    },
    setActiveKey(activeKey) {
      for (const { key, button } of renderer.suggestionButtons) {
        if (activeKey && key === activeKey) {
          button.classList.add("is-active");
        } else {
          button.classList.remove("is-active");
        }
      }
    },
    setError(message) {
      if (message) {
        helper.textContent = message;
        helper.hidden = false;
        input.setAttribute("aria-invalid", "true");
      } else {
        helper.textContent = "";
        helper.hidden = true;
        input.removeAttribute("aria-invalid");
      }
    },
  };

  return renderer;
}

function createFieldInput(config: FieldConfig): FieldInputElement {
  if (config.type === "select") {
    const select = document.createElement("select");
    const options = config.options ?? [];
    for (const option of options) {
      const opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = option.label;
      select.appendChild(opt);
    }
    return select;
  }

  if (config.type === "textarea" || config.type === "string-list" || config.type === "json") {
    const textarea = document.createElement("textarea");
    textarea.rows = config.type === "textarea" ? 4 : config.type === "json" ? 6 : 3;
    if (config.type === "string-list") {
      textarea.dataset.size = "small";
    } else if (config.type === "json") {
      textarea.dataset.size = "large";
    }
    if (config.placeholder) {
      textarea.placeholder = config.placeholder;
    }
    return textarea;
  }

  const input = document.createElement("input");
  input.type = config.type === "number" ? "number" : "text";
  if (config.placeholder) {
    input.placeholder = config.placeholder;
  }
  return input;
}

function applyValueToInput(config: FieldConfig, input: FieldInputElement, value: unknown): void {
  if (input instanceof HTMLSelectElement) {
    if (config.key === "birth.approx" || config.key === "death.approx") {
      if (typeof value === "boolean") {
        input.value = value ? "true" : "false";
      } else {
        input.value = "";
      }
    } else if (typeof value === "string" && value.length) {
      input.value = value;
    } else {
      input.value = "";
    }
    return;
  }

  if (input instanceof HTMLTextAreaElement) {
    if (config.type === "string-list") {
      input.value = Array.isArray(value) ? (value as string[]).join("\n") : "";
      return;
    }
    if (config.type === "json") {
      input.value = Array.isArray(value) ? JSON.stringify(value, null, 2) : "";
      return;
    }
    input.value = typeof value === "string" ? value : "";
    return;
  }

  if (config.type === "number") {
    input.value = typeof value === "number" && Number.isFinite(value) ? String(value) : "";
    return;
  }

  input.value = typeof value === "string" ? value : "";
}

function parseFieldInput(
  config: FieldConfig,
  input: FieldInputElement,
): { value: unknown; error?: string } {
  if (input instanceof HTMLSelectElement) {
    const value = input.value;
    if (config.key === "birth.approx" || config.key === "death.approx") {
      if (value === "true") {
        return { value: true };
      }
      if (value === "false") {
        return { value: false };
      }
      return { value: undefined };
    }
    return { value: value || undefined };
  }

  if (config.type === "number") {
    const raw = input.value.trim();
    if (!raw) {
      return { value: undefined };
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return { value: undefined, error: "Enter a valid number." };
    }
    return { value: parsed };
  }

  if (config.type === "string-list") {
    const raw = input.value;
    const entries = raw
      .split(/[\n,]/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return { value: entries };
  }

  if (config.type === "json") {
    const raw = input.value.trim();
    if (!raw) {
      return { value: [] };
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return { value: undefined, error: "Enter a JSON array." };
      }
      return { value: parsed };
    } catch (error) {
      return { value: undefined, error: "Invalid JSON value." };
    }
  }

  const raw = input.value.trim();
  if (!raw) {
    return { value: undefined };
  }
  return { value: raw };
}

function cloneFieldValue<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeFieldValue(key: ProfileFieldKey, value: unknown): unknown {
  const temp = createEmptyProfile();
  setProfileField(temp, key, cloneFieldValue(value));
  const normalized = normalizeProfile(temp);
  return getProfileFieldValue(normalized, key);
}

function getProfileFieldValue(profile: IndividualProfile, key: ProfileFieldKey): unknown {
  switch (key) {
    case "givenNames":
      return profile.givenNames;
    case "surname":
      return profile.surname;
    case "maidenName":
      return profile.maidenName;
    case "aliases":
      return profile.aliases;
    case "sex":
      return profile.sex;
    case "birth.raw":
      return profile.birth.raw;
    case "birth.year":
      return profile.birth.year;
    case "birth.month":
      return profile.birth.month;
    case "birth.day":
      return profile.birth.day;
    case "birth.approx":
      return profile.birth.approx;
    case "birth.place":
      return profile.birth.place;
    case "death.raw":
      return profile.death.raw;
    case "death.year":
      return profile.death.year;
    case "death.month":
      return profile.death.month;
    case "death.day":
      return profile.death.day;
    case "death.approx":
      return profile.death.approx;
    case "death.place":
      return profile.death.place;
    case "parents.father":
      return profile.parents.father;
    case "parents.mother":
      return profile.parents.mother;
    case "spouses":
      return profile.spouses;
    case "children":
      return profile.children;
    case "siblings":
      return profile.siblings;
    case "residences":
      return profile.residences;
    case "occupation":
      return profile.occupation;
    case "religion":
      return profile.religion;
    case "notes":
      return profile.notes;
    default:
      return undefined;
  }
}

function setProfileField(profile: IndividualProfile, key: ProfileFieldKey, value: unknown): void {
  switch (key) {
    case "givenNames":
      profile.givenNames = Array.isArray(value) ? [...(value as string[])] : [];
      return;
    case "surname":
      profile.surname = typeof value === "string" ? value : undefined;
      return;
    case "maidenName":
      profile.maidenName = typeof value === "string" ? value : undefined;
      return;
    case "aliases":
      profile.aliases = Array.isArray(value) ? [...(value as string[])] : [];
      return;
    case "sex":
      profile.sex = typeof value === "string" && ["M", "F", "U"].includes(value) ? (value as "M" | "F" | "U") : undefined;
      return;
    case "birth.raw":
      profile.birth.raw = typeof value === "string" ? value : undefined;
      return;
    case "birth.year":
      if (typeof value === "number" && Number.isFinite(value)) {
        profile.birth.year = value;
      } else {
        delete profile.birth.year;
      }
      return;
    case "birth.month":
      if (typeof value === "number" && Number.isFinite(value)) {
        profile.birth.month = value;
      } else {
        delete profile.birth.month;
      }
      return;
    case "birth.day":
      if (typeof value === "number" && Number.isFinite(value)) {
        profile.birth.day = value;
      } else {
        delete profile.birth.day;
      }
      return;
    case "birth.approx":
      if (typeof value === "boolean") {
        profile.birth.approx = value;
      } else {
        delete profile.birth.approx;
      }
      return;
    case "birth.place":
      profile.birth.place = typeof value === "string" ? value : undefined;
      return;
    case "death.raw":
      profile.death.raw = typeof value === "string" ? value : undefined;
      return;
    case "death.year":
      if (typeof value === "number" && Number.isFinite(value)) {
        profile.death.year = value;
      } else {
        delete profile.death.year;
      }
      return;
    case "death.month":
      if (typeof value === "number" && Number.isFinite(value)) {
        profile.death.month = value;
      } else {
        delete profile.death.month;
      }
      return;
    case "death.day":
      if (typeof value === "number" && Number.isFinite(value)) {
        profile.death.day = value;
      } else {
        delete profile.death.day;
      }
      return;
    case "death.approx":
      if (typeof value === "boolean") {
        profile.death.approx = value;
      } else {
        delete profile.death.approx;
      }
      return;
    case "death.place":
      profile.death.place = typeof value === "string" ? value : undefined;
      return;
    case "parents.father":
      profile.parents.father = typeof value === "string" ? value : undefined;
      return;
    case "parents.mother":
      profile.parents.mother = typeof value === "string" ? value : undefined;
      return;
    case "spouses":
      profile.spouses = Array.isArray(value) ? [...(value as string[])] : [];
      return;
    case "children":
      profile.children = Array.isArray(value) ? [...(value as string[])] : [];
      return;
    case "siblings":
      profile.siblings = Array.isArray(value) ? [...(value as string[])] : [];
      return;
    case "residences":
      profile.residences = Array.isArray(value)
        ? (value as IndividualProfile["residences"]).map((residence) => ({ ...residence }))
        : [];
      return;
    case "occupation":
      profile.occupation = typeof value === "string" ? value : undefined;
      return;
    case "religion":
      profile.religion = typeof value === "string" ? value : undefined;
      return;
    case "notes":
      profile.notes = typeof value === "string" ? value : undefined;
      return;
  }
}

function serializeFieldValue(config: FieldConfig, value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  switch (config.key) {
    case "givenNames":
    case "aliases":
    case "spouses":
    case "children":
    case "siblings":
    case "residences":
      return Array.isArray(value) ? JSON.stringify(value) : null;
    case "birth.year":
    case "birth.month":
    case "birth.day":
    case "death.year":
    case "death.month":
    case "death.day":
      return typeof value === "number" && Number.isFinite(value) ? String(value) : null;
    case "birth.approx":
    case "death.approx":
      return typeof value === "boolean" ? (value ? "true" : "false") : null;
    case "sex":
      return typeof value === "string" && value.length ? value : null;
    default:
      return typeof value === "string" && value.length ? value : null;
  }
}

function areFieldValuesEqual(config: FieldConfig, a: unknown, b: unknown): boolean {
  const first = serializeFieldValue(config, a) ?? "";
  const second = serializeFieldValue(config, b) ?? "";
  return first === second;
}

function formatFieldValue(config: FieldConfig, value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  switch (config.key) {
    case "givenNames":
    case "aliases":
    case "spouses":
    case "children":
    case "siblings":
      return Array.isArray(value) ? (value as string[]).join(", ") : "";
    case "residences":
      return Array.isArray(value) ? summarizeResidences(value as IndividualProfile["residences"]) : "";
    case "birth.approx":
    case "death.approx":
      return value === true ? "Approximate" : value === false ? "Exact" : "Unspecified";
    case "sex":
      if (typeof value !== "string") {
        return "";
      }
      switch (value) {
        case "F":
          return "Female";
        case "M":
          return "Male";
        case "U":
          return "Unknown";
        default:
          return value;
      }
    case "notes":
      return typeof value === "string" ? (value.length > 120 ? `${value.slice(0, 117)}…` : value) : "";
    default:
      return typeof value === "string"
        ? value
        : typeof value === "number"
          ? String(value)
          : "";
  }
}

function summarizeResidences(residences: IndividualProfile["residences"]): string {
  if (!residences.length) {
    return "";
  }

  const summaries = residences.slice(0, 3).map((residence) => {
    const parts: string[] = [];
    if (residence.place) {
      parts.push(residence.place);
    }
    if (residence.year !== undefined) {
      parts.push(residence.year.toString());
    }
    if (residence.raw) {
      parts.push(residence.raw);
    }
    return parts.join(" • ") || "Residence";
  });

  if (residences.length > 3) {
    summaries.push(`+${residences.length - 3} more`);
  }

  return summaries.join(" | ");
}

function buildFieldSuggestions(
  config: FieldConfig,
  candidates: RecordCandidate[],
): FieldSuggestion[] {
  const groups = new Map<string, FieldSuggestion>();

  for (const candidate of candidates) {
    const value = getProfileFieldValue(candidate.profile, config.key);
    const key = serializeFieldValue(config, value);
    if (!key) {
      continue;
    }

    const label = formatFieldValue(config, value);
    const existing = groups.get(key);
    if (existing) {
      existing.records.push(candidate.summary);
    } else {
      groups.set(key, {
        key,
        label,
        value: cloneFieldValue(value),
        records: [candidate.summary],
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) => b.records.length - a.records.length);
}

function recordToProfile(record: IndividualRecord): IndividualProfile {
  return normalizeProfile({
    givenNames: record.givenNames,
    surname: record.surname,
    maidenName: record.maidenName,
    aliases: record.aliases,
    sex: record.sex,
    birth: record.birth,
    death: record.death,
    residences: record.residences,
    parents: record.parents,
    spouses: record.spouses,
    children: record.children,
    siblings: record.siblings,
    occupation: record.occupation,
    religion: record.religion,
    notes: record.notes,
  });
}

export function initializeIndividualsPage(): void {
  const elements = getIndividualsElements();

  if (!elements) {
    return;
  }

  const {
    list,
    createForm,
    createNameInput,
    createRoleSelect,
    createFeedback,
    editForm,
    editNameInput,
    editNotesInput,
    editRoleSelect,
    editSaveButton,
    editFeedback,
    editModal,
    editModalBackdrop,
    editModalClose,
    profileEditor,
    profileFieldsContainer,
    profileSaveButton,
    profileFeedback,
    profileUpdatedAt,
    workspaceSearchForm,
    workspaceSearchInput,
    workspaceSearchClear,
  } = elements;

  let latestState = getState();
  let selectedIndividualId: string | null = null;
  let draftProfile: IndividualProfile = createEmptyProfile();
  let profileDirty = false;
  let profileSaving = false;
  let individualSearchQuery = "";
  let editModalOpen = false;

  const maybeSearchHandle = initializeWorkspaceSearch({
    elements: {
      form: workspaceSearchForm ?? undefined,
      input: workspaceSearchInput,
      clearButton: workspaceSearchClear ?? undefined,
    },
    onInput: (value) => {
      individualSearchQuery = value.toLowerCase();
      renderIndividuals();
    },
    onSubmit: (value) => {
      individualSearchQuery = value.toLowerCase();
      renderIndividuals();
    },
  });

  if (!maybeSearchHandle) {
    return;
  }

  const workspaceSearch = maybeSearchHandle;

  individualSearchQuery = workspaceSearch.getValue().toLowerCase();

  const fieldRenderers: FieldRenderer[] = PROFILE_FIELD_CONFIGS.map((config) =>
    createFieldRenderer(config, handleFieldInput, handleSuggestionApply),
  );

  type ParentKey = "father" | "mother";

  interface RelationshipLinker {
    refresh(): void;
  }

  const relationshipLinkers: RelationshipLinker[] = [];

  function refreshRelationshipLinkers(): void {
    for (const linker of relationshipLinkers) {
      linker.refresh();
    }
  }

  function getLinkedIndividualName(individualId: string | undefined | null): string | null {
    if (!individualId) {
      return null;
    }

    const match = latestState.individuals.find((individual) => individual.id === individualId);
    return match ? match.name : null;
  }

  function getAvailableIndividuals(exclude: Set<string>): { id: string; label: string }[] {
    return latestState.individuals
      .filter((individual) => !exclude.has(individual.id))
      .map((individual) => ({ id: individual.id, label: individual.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  function createParentRelationshipLinker(
    renderer: FieldRenderer,
    parentKey: ParentKey,
  ): RelationshipLinker {
    const selectId = `${renderer.config.key.replace(/\./g, "-")}-link-select`;
    const container = document.createElement("div");
    container.className = "relationship-linker";

    const label = document.createElement("label");
    label.className = "relationship-linker-label";
    label.htmlFor = selectId;
    label.textContent =
      parentKey === "father" ? "Link to existing father" : "Link to existing mother";
    container.appendChild(label);

    const select = document.createElement("select");
    select.className = "relationship-linker-select";
    select.id = selectId;
    container.appendChild(select);

    const status = document.createElement("p");
    status.className = "relationship-linker-status";
    container.appendChild(status);

    select.addEventListener("change", () => {
      const value = select.value || undefined;
      const current = draftProfile.linkedParents[parentKey];

      if (current !== value) {
        draftProfile.linkedParents[parentKey] = value;
        markProfileDirty();
        updateProfileSaveButtonState();
        refreshRelationshipLinkers();
      }
    });

    renderer.container.appendChild(container);

    return {
      refresh() {
        const current = draftProfile.linkedParents[parentKey];
        const selected = getSelectedIndividual();
        const exclude = new Set<string>();
        if (selected) {
          exclude.add(selected.id);
        }

        const available = getAvailableIndividuals(exclude);

        select.replaceChildren();

        const emptyOption = document.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = "— No link —";
        select.appendChild(emptyOption);

        let hasCurrent = false;

        for (const optionData of available) {
          const option = document.createElement("option");
          option.value = optionData.id;
          option.textContent = optionData.label;
          if (optionData.id === current) {
            hasCurrent = true;
          }
          select.appendChild(option);
        }

        if (current && !hasCurrent) {
          const missingOption = document.createElement("option");
          missingOption.value = current;
          missingOption.textContent = "Linked individual not found";
          select.appendChild(missingOption);
          hasCurrent = true;
        }

        if (current && hasCurrent) {
          select.value = current;
        } else {
          select.value = "";
        }

        const name = getLinkedIndividualName(current);
        if (name) {
          status.textContent = `Linked to ${name}.`;
        } else if (current) {
          status.textContent = "Linked individual not found.";
        } else {
          status.textContent = "No individual linked.";
        }
      },
    } satisfies RelationshipLinker;
  }

  function createMultiRelationshipLinker(
    renderer: FieldRenderer,
    options: {
      label: string;
      emptyMessage: string;
      getLinks: () => string[];
      setLinks: (links: string[]) => void;
    },
  ): RelationshipLinker {
    const container = document.createElement("div");
    container.className = "relationship-linker";

    const selectId = `${renderer.config.key.replace(/\./g, "-")}-linked-select`;

    const label = document.createElement("label");
    label.className = "relationship-linker-label";
    label.htmlFor = selectId;
    label.textContent = options.label;
    container.appendChild(label);

    const list = document.createElement("ul");
    list.className = "relationship-linker-list";
    container.appendChild(list);

    const controls = document.createElement("div");
    controls.className = "relationship-linker-controls";
    const select = document.createElement("select");
    select.className = "relationship-linker-select";
    select.id = selectId;
    controls.appendChild(select);

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "relationship-linker-add";
    addButton.textContent = "Add link";
    addButton.disabled = true;
    controls.appendChild(addButton);

    container.appendChild(controls);

    select.addEventListener("change", () => {
      addButton.disabled = !select.value;
    });

    addButton.addEventListener("click", () => {
      const value = select.value;
      if (!value) {
        return;
      }

      const existing = options.getLinks();
      if (existing.includes(value)) {
        select.value = "";
        addButton.disabled = true;
        return;
      }

      options.setLinks([...existing, value]);
      markProfileDirty();
      updateProfileSaveButtonState();
      select.value = "";
      addButton.disabled = true;
      refreshRelationshipLinkers();
    });

    renderer.container.appendChild(container);

    return {
      refresh() {
        const links = options.getLinks();

        list.replaceChildren();

        if (!links.length) {
          const emptyItem = document.createElement("li");
          emptyItem.className = "relationship-linker-empty";
          emptyItem.textContent = options.emptyMessage;
          list.appendChild(emptyItem);
        } else {
          for (const id of links) {
            const item = document.createElement("li");
            item.className = "relationship-linker-chip";

            const name = getLinkedIndividualName(id);
            const labelEl = document.createElement("span");
            labelEl.className = "relationship-linker-chip-label";
            labelEl.textContent = name ?? "Linked individual not found";
            item.appendChild(labelEl);

            if (!name) {
              item.classList.add("is-missing");
            }

            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.className = "relationship-linker-remove";
            removeButton.textContent = "Remove";
            removeButton.addEventListener("click", () => {
              const current = options.getLinks();
              if (!current.includes(id)) {
                return;
              }
              options.setLinks(current.filter((entry) => entry !== id));
              markProfileDirty();
              updateProfileSaveButtonState();
              refreshRelationshipLinkers();
            });

            item.appendChild(removeButton);
            list.appendChild(item);
          }
        }

        const linksSet = new Set(options.getLinks());
        const selected = getSelectedIndividual();
        if (selected) {
          linksSet.add(selected.id);
        }

        const available = getAvailableIndividuals(linksSet);

        select.replaceChildren();
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = available.length ? "Select individual" : "No individuals available";
        select.appendChild(placeholder);

        for (const optionData of available) {
          const option = document.createElement("option");
          option.value = optionData.id;
          option.textContent = optionData.label;
          select.appendChild(option);
        }

        select.value = "";
        select.disabled = available.length === 0;
        addButton.disabled = true;
      },
    } satisfies RelationshipLinker;
  }

  for (const renderer of fieldRenderers) {
    if (renderer.config.key === "parents.father") {
      relationshipLinkers.push(createParentRelationshipLinker(renderer, "father"));
    } else if (renderer.config.key === "parents.mother") {
      relationshipLinkers.push(createParentRelationshipLinker(renderer, "mother"));
    } else if (renderer.config.key === "spouses") {
      relationshipLinkers.push(
        createMultiRelationshipLinker(renderer, {
          label: "Linked spouses",
          emptyMessage: "No linked spouses yet.",
          getLinks: () => draftProfile.linkedSpouses,
          setLinks: (links) => {
            draftProfile.linkedSpouses = [...links];
          },
        }),
      );
    } else if (renderer.config.key === "children") {
      relationshipLinkers.push(
        createMultiRelationshipLinker(renderer, {
          label: "Linked children",
          emptyMessage: "No linked children yet.",
          getLinks: () => draftProfile.linkedChildren,
          setLinks: (links) => {
            draftProfile.linkedChildren = [...links];
          },
        }),
      );
    }
  }

  profileFieldsContainer.replaceChildren(...fieldRenderers.map((renderer) => renderer.container));
  refreshRelationshipLinkers();

  updateProfileSaveButtonState();

  function getSelectedIndividual(): typeof latestState.individuals[number] | null {
    if (!selectedIndividualId) {
      return null;
    }

    return latestState.individuals.find((individual) => individual.id === selectedIndividualId) ?? null;
  }

  function getRoleLabel(roleId: string | null): string | null {
    if (!roleId) {
      return null;
    }

    const match = latestState.roles.find((role) => role.id === roleId);
    return match ? match.label : null;
  }

  function populateRoleSelectOptions(selected: typeof latestState.individuals[number] | null): void {
    const sortedRoles = [...latestState.roles].sort((a, b) => a.label.localeCompare(b.label));
    const placeholderText = sortedRoles.length ? "No role assigned" : "No roles available";

    const fillSelect = (select: HTMLSelectElement, desired: string | null): void => {
      const fragment = document.createDocumentFragment();
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = placeholderText;
      fragment.appendChild(placeholder);

      for (const role of sortedRoles) {
        const option = document.createElement("option");
        option.value = role.id;
        option.textContent = role.label;
        fragment.appendChild(option);
      }

      select.replaceChildren(fragment);

      if (desired && sortedRoles.some((role) => role.id === desired)) {
        select.value = desired;
      } else {
        select.value = "";
      }
    };

    const createDesired = createRoleSelect.value || null;
    fillSelect(createRoleSelect, createDesired);

    const editDesired = selected?.roleId ?? null;
    fillSelect(editRoleSelect, editDesired);
    editRoleSelect.disabled = !selected;
  }

  function renderIndividuals(): void {
    const recordCount = latestState.records.length;
    const individualCount = latestState.individuals.length;
    const navRecordCount = document.getElementById("nav-record-count");
    const navIndividualCount = document.getElementById("nav-individual-count");
    const individualMetric = document.getElementById("metric-individual-count");

    workspaceSearchInput.disabled = individualCount === 0;

    if (navRecordCount) {
      navRecordCount.textContent = recordCount.toString();
    }

    if (navIndividualCount) {
      navIndividualCount.textContent = individualCount.toString();
    }

    if (individualMetric) {
      individualMetric.textContent = individualCount.toString();
    }

    if (!latestState.individuals.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No individuals yet. Save a record or create a person to get started.";
      list.replaceChildren(empty);
      return;
    }

    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const label of ["Name", "Role", "Linked records", "Updated", "Actions"]) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = label;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const sortedIndividuals = [...latestState.individuals].sort((a, b) => a.name.localeCompare(b.name));
    const linkedRecordsByIndividual = new Map<string, StoredRecord[]>();

    for (const record of latestState.records) {
      if (!record.individualId) {
        continue;
      }

      const existing = linkedRecordsByIndividual.get(record.individualId) ?? [];
      existing.push(record);
      linkedRecordsByIndividual.set(record.individualId, existing);
    }

    const filteredIndividuals = individualSearchQuery
      ? sortedIndividuals.filter((individual) => {
          const normalizedName = individual.name.toLowerCase();
          if (normalizedName.includes(individualSearchQuery)) {
            return true;
          }

          if (individual.notes.toLowerCase().includes(individualSearchQuery)) {
            return true;
          }

          const roleLabel = getRoleLabel(individual.roleId);
          if (roleLabel && roleLabel.toLowerCase().includes(individualSearchQuery)) {
            return true;
          }

          const linked = linkedRecordsByIndividual.get(individual.id) ?? [];
          return linked.some((stored) => (stored.summary || "").toLowerCase().includes(individualSearchQuery));
        })
      : sortedIndividuals;

    if (!filteredIndividuals.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No individuals match your search.";
      list.replaceChildren(empty);
      return;
    }

    for (const individual of filteredIndividuals) {
      const row = document.createElement("tr");
      row.dataset.individualId = individual.id;
      if (individual.id === selectedIndividualId) {
        row.classList.add("is-selected");
      }

      const nameCell = document.createElement("td");
      const title = document.createElement("div");
      title.className = "data-table-title";
      title.textContent = individual.name;
      nameCell.appendChild(title);

      if (individual.notes.trim()) {
        const notes = document.createElement("div");
        notes.className = "data-table-subtext";
        notes.textContent = individual.notes;
        nameCell.appendChild(notes);
      }

      const roleCell = document.createElement("td");
      const roleLabel = getRoleLabel(individual.roleId);
      roleCell.textContent = roleLabel ?? "—";

      const linkedCell = document.createElement("td");
      const linkedRecords = linkedRecordsByIndividual.get(individual.id) ?? [];
      const linkedSummary = document.createElement("div");
      linkedSummary.className = "data-table-title";
      linkedSummary.textContent = linkedRecords.length
        ? `${linkedRecords.length} linked record${linkedRecords.length === 1 ? "" : "s"}`
        : "No linked records yet.";
      linkedCell.appendChild(linkedSummary);

      if (linkedRecords.length) {
        const listElement = document.createElement("ul");
        listElement.className = "data-table-record-list";
        const sortedRecords = [...linkedRecords].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const visibleRecords = sortedRecords.slice(0, 3);

        for (const stored of visibleRecords) {
          const item = document.createElement("li");
          const summary = stored.summary || "Saved record";
          item.textContent = `${summary} — saved ${formatTimestamp(stored.createdAt)}`;
          listElement.appendChild(item);
        }

        if (sortedRecords.length > visibleRecords.length) {
          const remaining = sortedRecords.length - visibleRecords.length;
          const moreItem = document.createElement("li");
          moreItem.className = "data-table-meta";
          moreItem.textContent = `+${remaining} more linked record${remaining === 1 ? "" : "s"}`;
          listElement.appendChild(moreItem);
        }

        linkedCell.appendChild(listElement);
      }

      const updatedCell = document.createElement("td");
      const updatedMeta = document.createElement("div");
      updatedMeta.className = "data-table-meta";
      updatedMeta.textContent = formatTimestamp(individual.updatedAt);
      updatedCell.appendChild(updatedMeta);

      const actionsCell = document.createElement("td");
      actionsCell.className = "data-table-actions";
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "table-action-button";
      editButton.textContent = "Edit";
      editButton.dataset.action = "edit-individual";
      editButton.dataset.individualId = individual.id;
      actionsCell.appendChild(editButton);

      row.append(nameCell, roleCell, linkedCell, updatedCell, actionsCell);
      tbody.appendChild(row);
    }

    table.appendChild(tbody);
    list.replaceChildren(table);
  }

  function updateProfileSaveButtonState(): void {
    const selected = getSelectedIndividual();
    const disabled = !selected || (!profileDirty && !profileSaving);
    profileSaveButton.disabled = disabled;
    profileSaveButton.setAttribute("aria-busy", profileSaving ? "true" : "false");
  }

  function markProfileDirty(): void {
    profileDirty = true;
    if (profileFeedback) {
      profileFeedback.textContent = "Changes not saved yet.";
    }
  }

  function refreshProfileInputs(): void {
    for (const renderer of fieldRenderers) {
      const value = getProfileFieldValue(draftProfile, renderer.config.key);
      renderer.setValue(cloneFieldValue(value));
      renderer.setActiveKey(serializeFieldValue(renderer.config, value));
      renderer.setError(null);
    }
    refreshRelationshipLinkers();
  }

  function refreshProfileSuggestions(): void {
    const selected = getSelectedIndividual();
    const candidates = selected ? getLinkedRecordCandidates(selected.id) : [];

    for (const renderer of fieldRenderers) {
      const currentValue = getProfileFieldValue(draftProfile, renderer.config.key);
      renderer.setSuggestions(
        buildFieldSuggestions(renderer.config, candidates),
        serializeFieldValue(renderer.config, currentValue),
      );
    }
  }

  function clearProfileEditor(): void {
    profileEditor.hidden = true;
    if (profileUpdatedAt) {
      profileUpdatedAt.textContent = "";
      profileUpdatedAt.hidden = true;
    }
    draftProfile = createEmptyProfile();
    profileDirty = false;
    profileSaving = false;
    for (const renderer of fieldRenderers) {
      renderer.setValue(undefined);
      renderer.setSuggestions([], null);
      renderer.setError(null);
    }
    if (profileFeedback) {
      profileFeedback.textContent = "";
    }
    refreshRelationshipLinkers();
    updateProfileSaveButtonState();
  }

  function loadProfileEditor(selected: typeof latestState.individuals[number]): void {
    profileEditor.hidden = false;
    draftProfile = cloneIndividualProfile(selected.profile);
    profileDirty = false;
    profileSaving = false;
    if (profileFeedback) {
      profileFeedback.textContent = "";
    }
    if (profileUpdatedAt) {
      if (selected.profileUpdatedAt) {
        profileUpdatedAt.textContent = `Validated ${formatTimestamp(selected.profileUpdatedAt)}`;
        profileUpdatedAt.hidden = false;
      } else {
        profileUpdatedAt.textContent = "";
        profileUpdatedAt.hidden = true;
      }
    }

    refreshProfileInputs();
    refreshProfileSuggestions();
    updateProfileSaveButtonState();
  }

  function handleFieldInput(renderer: FieldRenderer): void {
    const result = parseFieldInput(renderer.config, renderer.input);
    if (result.error) {
      renderer.setError(result.error);
      return;
    }

    renderer.setError(null);
    const sanitized = sanitizeFieldValue(renderer.config.key, result.value);
    const currentValue = getProfileFieldValue(draftProfile, renderer.config.key);

    if (!areFieldValuesEqual(renderer.config, sanitized, currentValue)) {
      setProfileField(draftProfile, renderer.config.key, cloneFieldValue(sanitized));
      markProfileDirty();
    }

    const activeKey = serializeFieldValue(renderer.config, getProfileFieldValue(draftProfile, renderer.config.key));
    renderer.setActiveKey(activeKey);
    updateProfileSaveButtonState();
  }

  function handleSuggestionApply(renderer: FieldRenderer, suggestion: FieldSuggestion): void {
    const sanitized = sanitizeFieldValue(renderer.config.key, suggestion.value);
    const currentValue = getProfileFieldValue(draftProfile, renderer.config.key);
    if (!areFieldValuesEqual(renderer.config, sanitized, currentValue)) {
      setProfileField(draftProfile, renderer.config.key, cloneFieldValue(sanitized));
      markProfileDirty();
    }
    renderer.setValue(cloneFieldValue(sanitized));
    renderer.setActiveKey(serializeFieldValue(renderer.config, sanitized));
    renderer.setError(null);
    updateProfileSaveButtonState();
  }

  function getLinkedRecordCandidates(individualId: string): RecordCandidate[] {
    return latestState.records
      .filter((record) => record.individualId === individualId)
      .map((stored) => ({
        profile: recordToProfile(stored.record),
        summary: getRecordSummary(stored.record),
      }));
  }

  function focusEditForm(): void {
    window.requestAnimationFrame(() => {
      if (editModalOpen && !editNameInput.disabled) {
        editNameInput.focus();
        editNameInput.select();
      }
    });
  }

  function openEditModal(individualId: string): void {
    selectIndividual(individualId);
    if (!getSelectedIndividual()) {
      return;
    }
    if (!editModalOpen) {
      editModal.hidden = false;
      editModal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      editModalOpen = true;
    }
    focusEditForm();
  }

  function closeEditModal(options?: { preserveSelection?: boolean }): void {
    if (!editModalOpen) {
      if (!options?.preserveSelection) {
        selectIndividual(null, { suppressModalClose: true });
      }
      return;
    }

    editModal.hidden = true;
    editModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    editModalOpen = false;

    if (!options?.preserveSelection) {
      selectIndividual(null, { suppressModalClose: true });
    }
  }

  function selectIndividual(
    individualId: string | null,
    options: { suppressModalClose?: boolean } = {},
  ): void {
    let nextSelection: string | null = null;

    if (individualId) {
      const exists = latestState.individuals.some((item) => item.id === individualId);
      nextSelection = exists ? individualId : null;
    }

    const previousSelection = selectedIndividualId;
    const changed = nextSelection !== previousSelection;
    selectedIndividualId = nextSelection;

    if (changed && editFeedback) {
      editFeedback.textContent = "";
    }

    renderIndividuals();
    renderSelectedIndividual();

    if (!nextSelection && editModalOpen && !options.suppressModalClose) {
      closeEditModal({ preserveSelection: true });
    }
  }

  function renderSelectedIndividual(): void {
    const selected = getSelectedIndividual();
    populateRoleSelectOptions(selected);
    const hasSelection = selected !== null;

    editNameInput.disabled = !hasSelection;
    editNotesInput.disabled = !hasSelection;
    editRoleSelect.disabled = !hasSelection;
    editSaveButton.disabled = !hasSelection;

    if (!selected) {
      editForm.reset();
      editRoleSelect.value = "";
      clearProfileEditor();
      return;
    }

    editNameInput.value = selected.name;
    editNotesInput.value = selected.notes;
    editRoleSelect.value = selected.roleId ?? "";
    loadProfileEditor(selected);
  }

  function handleIndividualAction(button: HTMLButtonElement): void {
    const individualId = button.dataset.individualId;

    if (!individualId) {
      return;
    }

    if (button.dataset.action === "edit-individual") {
      openEditModal(individualId);
    }
  }

  list.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>("button[data-action]");

    if (button) {
      handleIndividualAction(button);
    }
  });

  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = createNameInput.value.trim();
    const roleValue = createRoleSelect.value;
    const roleId = roleValue ? roleValue : null;

    if (!name) {
      createNameInput.focus();
      return;
    }

    try {
      const individual = await createIndividual(name, { roleId });
      createNameInput.value = "";
      createRoleSelect.value = "";
      if (createFeedback) {
        createFeedback.textContent = `Created individual ${individual.name}.`;
      }
      openEditModal(individual.id);
    } catch (error) {
      console.error("Failed to create individual", error);
      if (createFeedback) {
        createFeedback.textContent = "Unable to create individual.";
      }
    }
  });

  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selected = getSelectedIndividual();

    if (!selected) {
      return;
    }

    const name = editNameInput.value.trim();
    const notes = editNotesInput.value.trim();
    const roleValue = editRoleSelect.value;
    const roleId = roleValue ? roleValue : null;

    if (!name) {
      editNameInput.focus();
      if (editFeedback) {
        editFeedback.textContent = "Provide a display name before saving.";
      }
      return;
    }

    if (name === selected.name && notes === selected.notes && roleId === (selected.roleId ?? null)) {
      if (editFeedback) {
        editFeedback.textContent = "No changes to save.";
      }
      return;
    }

    try {
      const updated = await updateIndividual({ id: selected.id, name, notes, roleId });

      if (!updated) {
        if (editFeedback) {
          editFeedback.textContent = "Selected individual no longer exists.";
        }
        selectIndividual(null);
        return;
      }

      if (editFeedback) {
        editFeedback.textContent = "Saved individual details.";
      }
    } catch (error) {
      console.error("Failed to update individual", error);
      if (editFeedback) {
        editFeedback.textContent = "Unable to update individual.";
      }
    }
  });

  profileSaveButton.addEventListener("click", async () => {
    const selected = getSelectedIndividual();

    if (!selected || profileSaving || (!profileDirty && !profileSaving)) {
      return;
    }

    profileSaving = true;
    updateProfileSaveButtonState();
    if (profileFeedback) {
      profileFeedback.textContent = "Saving validated data…";
    }

    try {
      const updated = await updateIndividualProfile(selected.id, draftProfile);

      if (!updated) {
        if (profileFeedback) {
          profileFeedback.textContent = "Selected individual no longer exists.";
        }
        selectIndividual(null);
        return;
      }

      draftProfile = cloneIndividualProfile(updated.profile);
      profileDirty = false;
      if (profileFeedback) {
        profileFeedback.textContent = "Validated data saved.";
      }
      if (profileUpdatedAt) {
        profileUpdatedAt.textContent = `Validated ${formatTimestamp(updated.profileUpdatedAt)}`;
        profileUpdatedAt.hidden = false;
      }
      refreshProfileInputs();
      refreshProfileSuggestions();
    } catch (error) {
      console.error("Failed to save validated profile", error);
      if (profileFeedback) {
        profileFeedback.textContent = "Unable to save validated data.";
      }
    } finally {
      profileSaving = false;
      updateProfileSaveButtonState();
    }
  });

  editModalClose.addEventListener("click", () => {
    closeEditModal();
  });

  if (editModalBackdrop) {
    editModalBackdrop.addEventListener("click", () => {
      closeEditModal();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && editModalOpen) {
      event.preventDefault();
      closeEditModal();
    }
  });

  subscribe((state) => {
    latestState = state;
    if (selectedIndividualId && !state.individuals.some((item) => item.id === selectedIndividualId)) {
      selectIndividual(null);
      return;
    }
    renderIndividuals();
    renderSelectedIndividual();
  });

  renderIndividuals();
  renderSelectedIndividual();
}

function getIndividualsElements(): IndividualsElements | null {
  const list = document.getElementById("individuals-list");
  const createForm = document.getElementById("create-individual-form");
  const createNameInput = document.getElementById("create-individual-name");
  const createRoleSelect = document.getElementById("create-individual-role");
  const createFeedback = document.getElementById("individuals-feedback");
  const editForm = document.getElementById("edit-individual-form");
  const editNameInput = document.getElementById("edit-individual-name");
  const editNotesInput = document.getElementById("edit-individual-notes");
  const editRoleSelect = document.getElementById("edit-individual-role");
  const editFeedback = document.getElementById("edit-individual-feedback");
  const editSaveButton = document.getElementById("save-individual-button");
  const editModal = document.getElementById("individual-edit-modal");
  const editModalBackdrop = document.getElementById("individual-edit-backdrop");
  const editModalClose = document.getElementById("close-individual-modal");
  const profileEditor = document.getElementById("individual-profile-editor");
  const profileFieldsContainer = document.getElementById("individual-profile-fields");
  const profileSaveButton = document.getElementById("save-profile-button");
  const profileFeedback = document.getElementById("profile-feedback");
  const profileUpdatedAt = document.getElementById("profile-updated-at");
  const workspaceSearchForm = document.getElementById("workspace-search-form");
  const workspaceSearchInput = document.getElementById("workspace-search");
  const workspaceSearchClear = document.getElementById("workspace-search-clear");

  if (
    !(
      list instanceof HTMLDivElement &&
      createForm instanceof HTMLFormElement &&
      createNameInput instanceof HTMLInputElement &&
      createRoleSelect instanceof HTMLSelectElement &&
      editForm instanceof HTMLFormElement &&
      editNameInput instanceof HTMLInputElement &&
      editNotesInput instanceof HTMLTextAreaElement &&
      editRoleSelect instanceof HTMLSelectElement &&
      editSaveButton instanceof HTMLButtonElement &&
      editModal instanceof HTMLDivElement &&
      editModalClose instanceof HTMLButtonElement &&
      profileEditor instanceof HTMLDivElement &&
      profileFieldsContainer instanceof HTMLDivElement &&
      profileSaveButton instanceof HTMLButtonElement &&
      workspaceSearchInput instanceof HTMLInputElement
    )
  ) {
    return null;
  }

  return {
    list,
    createForm,
    createNameInput,
    createRoleSelect,
    createFeedback: createFeedback instanceof HTMLSpanElement ? createFeedback : null,
    editForm,
    editNameInput,
    editNotesInput,
    editRoleSelect,
    editSaveButton,
    editFeedback: editFeedback instanceof HTMLSpanElement ? editFeedback : null,
    editModal,
    editModalBackdrop: editModalBackdrop instanceof HTMLDivElement ? editModalBackdrop : null,
    editModalClose,
    profileEditor,
    profileFieldsContainer,
    profileSaveButton,
    profileFeedback: profileFeedback instanceof HTMLSpanElement ? profileFeedback : null,
    profileUpdatedAt: profileUpdatedAt instanceof HTMLSpanElement ? profileUpdatedAt : null,
    workspaceSearchForm: workspaceSearchForm instanceof HTMLFormElement ? workspaceSearchForm : null,
    workspaceSearchInput,
    workspaceSearchClear:
      workspaceSearchClear instanceof HTMLButtonElement ? workspaceSearchClear : null,
  };
}

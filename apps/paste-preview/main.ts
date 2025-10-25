import { extractIndividual, type ExtractOptions } from "../../extract";
import { scoreConfidence } from "../../confidence";
import { highlight } from "../../highlight";
import type { PlaceCategory } from "../../places";
import type { IndividualRecord } from "../../schema";
import {
  clearRecords,
  createIndividual,
  createRecord,
  deleteRecord,
  getState,
  deletePlaceDefinition,
  deleteProfessionDefinition,
  renameIndividual,
  savePlaceDefinition,
  saveProfessionDefinition,
  subscribe,
  type StoredIndividual,
  type StoredPlaceDefinition,
  type StoredProfessionDefinition,
  type StoredRecord,
} from "@/storage";

type ConfidenceScores = ReturnType<typeof scoreConfidence>;

type DateFragment = IndividualRecord["birth"];

interface FieldRow {
  label: string;
  value: string;
  confidence?: number;
}

type ViewMode = "records" | "individuals" | "tree" | "settings";

type PersistedState = ReturnType<typeof getState>;

const DEFAULT_HTML = "<h1>Jane Doe</h1><p>Born about 1892 to Mary &amp; John.</p>";

function requireElement<T extends Element>(
  id: string,
  guard: (el: Element) => el is T
): T {
  const element = document.getElementById(id);

  if (!element || !guard(element)) {
    throw new Error(`Paste preview markup is missing required element: ${id}`);
  }

  return element;
}

const htmlInput = requireElement<HTMLTextAreaElement>(
  "html-input",
  (el): el is HTMLTextAreaElement => el instanceof HTMLTextAreaElement
);
const jsonOutput = requireElement<HTMLDivElement>(
  "json-output",
  (el): el is HTMLDivElement => el instanceof HTMLDivElement
);
const errorBox = requireElement<HTMLDivElement>(
  "error",
  (el): el is HTMLDivElement => el instanceof HTMLDivElement
);
const confidenceList = requireElement<HTMLDivElement>(
  "confidence",
  (el): el is HTMLDivElement => el instanceof HTMLDivElement
);
const toggleSourcesButton = requireElement<HTMLButtonElement>(
  "toggle-sources",
  (el): el is HTMLButtonElement => el instanceof HTMLButtonElement
);
const reextractButton = requireElement<HTMLButtonElement>(
  "reextract",
  (el): el is HTMLButtonElement => el instanceof HTMLButtonElement
);
const previewFrame = requireElement<HTMLIFrameElement>(
  "source-preview",
  (el): el is HTMLIFrameElement => el instanceof HTMLIFrameElement
);
const recordsView = requireElement<HTMLElement>(
  "records-view",
  (el): el is HTMLElement => el instanceof HTMLElement
);
const individualsView = requireElement<HTMLElement>(
  "individuals-view",
  (el): el is HTMLElement => el instanceof HTMLElement
);
const treeView = requireElement<HTMLElement>(
  "tree-view",
  (el): el is HTMLElement => el instanceof HTMLElement
);
const settingsView = requireElement<HTMLElement>(
  "settings-view",
  (el): el is HTMLElement => el instanceof HTMLElement
);
const recordsTab = requireElement<HTMLButtonElement>(
  "tab-records",
  (el): el is HTMLButtonElement => el instanceof HTMLButtonElement
);
const individualsTab = requireElement<HTMLButtonElement>(
  "tab-individuals",
  (el): el is HTMLButtonElement => el instanceof HTMLButtonElement
);
const treeTab = requireElement<HTMLButtonElement>(
  "tab-tree",
  (el): el is HTMLButtonElement => el instanceof HTMLButtonElement
);
const settingsTab = requireElement<HTMLButtonElement>(
  "tab-settings",
  (el): el is HTMLButtonElement => el instanceof HTMLButtonElement
);
const provenanceCount = requireElement<HTMLSpanElement>(
  "provenance-count",
  (el): el is HTMLSpanElement => el instanceof HTMLSpanElement
);
const saveForm = requireElement<HTMLFormElement>(
  "save-form",
  (el): el is HTMLFormElement => el instanceof HTMLFormElement
);
const saveModeNew = requireElement<HTMLInputElement>(
  "save-mode-new",
  (el): el is HTMLInputElement => el instanceof HTMLInputElement
);
const saveModeExisting = requireElement<HTMLInputElement>(
  "save-mode-existing",
  (el): el is HTMLInputElement => el instanceof HTMLInputElement
);
const newIndividualInput = requireElement<HTMLInputElement>(
  "new-individual-name",
  (el): el is HTMLInputElement => el instanceof HTMLInputElement
);
const existingIndividualSelect = requireElement<HTMLSelectElement>(
  "existing-individual-select",
  (el): el is HTMLSelectElement => el instanceof HTMLSelectElement
);
const saveButton = requireElement<HTMLButtonElement>(
  "save-button",
  (el): el is HTMLButtonElement => el instanceof HTMLButtonElement
);
const saveFeedback = requireElement<HTMLSpanElement>(
  "save-feedback",
  (el): el is HTMLSpanElement => el instanceof HTMLSpanElement
);
const clearRecordsButton = requireElement<HTMLButtonElement>(
  "clear-records",
  (el): el is HTMLButtonElement => el instanceof HTMLButtonElement
);
const savedRecordsContainer = requireElement<HTMLDivElement>(
  "saved-records",
  (el): el is HTMLDivElement => el instanceof HTMLDivElement
);
const individualsList = requireElement<HTMLDivElement>(
  "individuals-list",
  (el): el is HTMLDivElement => el instanceof HTMLDivElement
);
const createIndividualForm = requireElement<HTMLFormElement>(
  "create-individual-form",
  (el): el is HTMLFormElement => el instanceof HTMLFormElement
);
const createIndividualNameInput = requireElement<HTMLInputElement>(
  "create-individual-name",
  (el): el is HTMLInputElement => el instanceof HTMLInputElement
);
const treeContainer = requireElement<HTMLDivElement>(
  "tree-container",
  (el): el is HTMLDivElement => el instanceof HTMLDivElement
);
const treeSelect = requireElement<HTMLSelectElement>(
  "tree-individual-select",
  (el): el is HTMLSelectElement => el instanceof HTMLSelectElement
);
const treeSearchInput = requireElement<HTMLInputElement>(
  "tree-search",
  (el): el is HTMLInputElement => el instanceof HTMLInputElement
);
const treeClearButton = requireElement<HTMLButtonElement>(
  "tree-clear",
  (el): el is HTMLButtonElement => el instanceof HTMLButtonElement
);
const professionForm = requireElement<HTMLFormElement>(
  "profession-form",
  (el): el is HTMLFormElement => el instanceof HTMLFormElement
);
const professionLabelInput = requireElement<HTMLInputElement>(
  "profession-label",
  (el): el is HTMLInputElement => el instanceof HTMLInputElement
);
const professionAliasesInput = requireElement<HTMLInputElement>(
  "profession-aliases",
  (el): el is HTMLInputElement => el instanceof HTMLInputElement
);
const professionSubmitButton = requireElement<HTMLButtonElement>(
  "profession-submit",
  (el): el is HTMLButtonElement => el instanceof HTMLButtonElement
);
const professionCancelButton = requireElement<HTMLButtonElement>(
  "profession-cancel",
  (el): el is HTMLButtonElement => el instanceof HTMLButtonElement
);
const professionFeedback = requireElement<HTMLSpanElement>(
  "profession-feedback",
  (el): el is HTMLSpanElement => el instanceof HTMLSpanElement
);
const professionList = requireElement<HTMLDivElement>(
  "profession-list",
  (el): el is HTMLDivElement => el instanceof HTMLDivElement
);
const placeForm = requireElement<HTMLFormElement>(
  "place-form",
  (el): el is HTMLFormElement => el instanceof HTMLFormElement
);
const placeLabelInput = requireElement<HTMLInputElement>(
  "place-label",
  (el): el is HTMLInputElement => el instanceof HTMLInputElement
);
const placeAliasesInput = requireElement<HTMLInputElement>(
  "place-aliases",
  (el): el is HTMLInputElement => el instanceof HTMLInputElement
);
const placeCategorySelect = requireElement<HTMLSelectElement>(
  "place-category",
  (el): el is HTMLSelectElement => el instanceof HTMLSelectElement
);
const placeSubmitButton = requireElement<HTMLButtonElement>(
  "place-submit",
  (el): el is HTMLButtonElement => el instanceof HTMLButtonElement
);
const placeCancelButton = requireElement<HTMLButtonElement>(
  "place-cancel",
  (el): el is HTMLButtonElement => el instanceof HTMLButtonElement
);
const placeFeedback = requireElement<HTMLSpanElement>(
  "place-feedback",
  (el): el is HTMLSpanElement => el instanceof HTMLSpanElement
);
const placeList = requireElement<HTMLDivElement>(
  "place-list",
  (el): el is HTMLDivElement => el instanceof HTMLDivElement
);

let currentView: ViewMode = "records";
let currentRecord: IndividualRecord | null = null;
let lastHighlightDocument = "";
let showingSources = false;
let latestState: PersistedState = getState();
let suggestedName = "";
let selectedTreeIndividualId: string | null = null;
let treeSearchQuery = "";
let editingProfessionId: string | null = null;
let editingPlaceId: string | null = null;
let professionFeedbackTimeout: number | null = null;
let placeFeedbackTimeout: number | null = null;

function buildExtractOptions(): ExtractOptions {
  return {
    professions: latestState.professions.map((definition) => ({
      label: definition.label,
      aliases: [...definition.aliases],
    })),
    places: latestState.places.map((definition) => ({
      label: definition.label,
      aliases: [...definition.aliases],
      category: definition.category,
    })),
  };
}

function parseAliasInput(value: string): string[] {
  return value
    .split(/[,\n;]/)
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0);
}

function buildHighlightDocument(record: IndividualRecord): string {
  const markedHtml = highlight(record.sourceHtml, record.provenance);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      :root {
        color-scheme: light dark;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        padding: 1.5rem;
        background: #ffffff;
        color: #111827;
      }
      mark[data-field] {
        background: rgba(250, 204, 21, 0.4);
        border-radius: 0.25rem;
        padding: 0 0.2em;
        box-shadow: inset 0 0 0 1px rgba(217, 119, 6, 0.35);
      }
      mark[data-field]::after {
        content: attr(data-field);
        display: inline-block;
        margin-left: 0.35rem;
        font-size: 0.65rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: rgba(120, 53, 15, 0.85);
      }
    </style>
  </head>
  <body>
    ${markedHtml}
  </body>
</html>`;
}

function createSourceHtmlNode(key: string, value: string): HTMLElement {
  const details = document.createElement("details");
  details.className = "json-node";
  details.open = false;

  const summary = document.createElement("summary");
  const keySpan = document.createElement("span");
  keySpan.className = "json-key";
  keySpan.textContent = key;

  const meta = document.createElement("span");
  meta.className = "json-meta";
  meta.textContent = `HTML (${value.length} chars)`;

  summary.append(keySpan, meta);
  const pre = document.createElement("pre");
  pre.className = "json-source";
  pre.textContent = value;

  details.append(summary, pre);
  return details;
}

function createLeafNode(key: string | null, value: unknown): HTMLElement {
  const leaf = document.createElement("div");
  leaf.className = "json-leaf";

  const keySpan = document.createElement("span");
  keySpan.className = "json-key";
  keySpan.textContent = key !== null ? `${key}:` : "";
  leaf.appendChild(keySpan);

  const valueSpan = document.createElement("span");
  valueSpan.className = "json-value";

  if (value === null) {
    valueSpan.classList.add("json-value-null");
    valueSpan.textContent = "null";
  } else if (typeof value === "string") {
    valueSpan.classList.add("json-value-string");
    valueSpan.textContent = `"${value}"`;
  } else if (typeof value === "number") {
    valueSpan.classList.add("json-value-number");
    valueSpan.textContent = value.toString();
  } else if (typeof value === "boolean") {
    valueSpan.classList.add("json-value-boolean");
    valueSpan.textContent = value ? "true" : "false";
  } else {
    valueSpan.textContent = String(value);
  }

  leaf.appendChild(valueSpan);
  return leaf;
}

function createArrayNode(key: string | null, value: unknown[], depth: number): HTMLElement {
  const details = document.createElement("details");
  details.className = "json-node";
  details.open = depth < 2;

  const summary = document.createElement("summary");
  const keySpan = document.createElement("span");
  keySpan.className = "json-key";
  keySpan.textContent = key ?? "Array";
  const meta = document.createElement("span");
  meta.className = "json-meta";
  meta.textContent = `Array (${value.length})`;
  summary.append(keySpan, meta);

  const children = document.createElement("div");
  children.className = "json-children";

  if (value.length === 0) {
    const empty = document.createElement("span");
    empty.className = "json-meta";
    empty.textContent = "Empty";
    children.appendChild(empty);
  } else {
    value.forEach((item, index) => {
      children.appendChild(createJsonNode(`[${index}]`, item, depth + 1));
    });
  }

  details.append(summary, children);
  return details;
}

function createObjectNode(
  key: string | null,
  value: Record<string, unknown>,
  depth: number,
): HTMLElement {
  const details = document.createElement("details");
  details.className = "json-node";
  details.open = key === null || depth < 2;

  const summary = document.createElement("summary");
  const keySpan = document.createElement("span");
  keySpan.className = "json-key";
  keySpan.textContent = key ?? "Record";
  const meta = document.createElement("span");
  meta.className = "json-meta";
  meta.textContent = `Object (${Object.keys(value).length})`;
  summary.append(keySpan, meta);

  const children = document.createElement("div");
  children.className = "json-children";

  const entries = Object.entries(value);
  if (!entries.length) {
    const empty = document.createElement("span");
    empty.className = "json-meta";
    empty.textContent = "Empty";
    children.appendChild(empty);
  } else {
    for (const [childKey, childValue] of entries) {
      children.appendChild(createJsonNode(childKey, childValue, depth + 1));
    }
  }

  details.append(summary, children);
  return details;
}

function createJsonNode(key: string | null, value: unknown, depth: number): HTMLElement {
  if (key === "sourceHtml" && typeof value === "string") {
    return createSourceHtmlNode(key, value);
  }

  if (Array.isArray(value)) {
    return createArrayNode(key, value, depth);
  }

  if (value && typeof value === "object") {
    return createObjectNode(key, value as Record<string, unknown>, depth);
  }

  return createLeafNode(key, value);
}

function renderJsonRecord(record: IndividualRecord): void {
  const tree = document.createElement("div");
  tree.className = "json-tree";
  tree.appendChild(createJsonNode(null, record, 0));
  jsonOutput.dataset.empty = "false";
  jsonOutput.replaceChildren(tree);
}

function formatDate(fragment: DateFragment): string {
  const { raw, year, month, day, approx } = fragment;

  if (raw) {
    return raw;
  }

  const parts: string[] = [];

  if (year !== undefined || month !== undefined || day !== undefined) {
    if (year !== undefined) {
      parts.push(year.toString());
    }

    if (month !== undefined) {
      parts.push(month.toString().padStart(2, "0"));
    }

    if (day !== undefined) {
      parts.push(day.toString().padStart(2, "0"));
    }
  }

  if (!parts.length) {
    return "";
  }

  const formatted = parts.join("-");
  return approx ? `~${formatted}` : formatted;
}

function buildFieldRows(record: IndividualRecord, scores: ConfidenceScores): FieldRow[] {
  const rows: FieldRow[] = [];

  if (record.givenNames.length) {
    rows.push({
      label: "Given names",
      value: record.givenNames.join(", "),
      confidence: scores.givenNames,
    });
  }

  if (record.surname) {
    rows.push({
      label: "Surname",
      value: record.surname,
      confidence: scores.surname,
    });
  }

  if (record.maidenName) {
    rows.push({
      label: "Maiden name",
      value: record.maidenName,
      confidence: scores.maidenName,
    });
  }

  const birth = formatDate(record.birth);
  if (birth) {
    rows.push({
      label: "Birth date",
      value: birth,
      confidence: scores["birth.date"],
    });
  }

  const death = formatDate(record.death);
  if (death) {
    rows.push({
      label: "Death date",
      value: death,
      confidence: scores["death.date"],
    });
  }

  if (record.parents.father) {
    rows.push({
      label: "Father",
      value: record.parents.father,
      confidence: scores["parents.father"],
    });
  }

  if (record.parents.mother) {
    rows.push({
      label: "Mother",
      value: record.parents.mother,
      confidence: scores["parents.mother"],
    });
  }

  if (record.residences.length) {
    rows.push({
      label: "Residences",
      value: record.residences
        .map((res) => [res.raw, res.place, res.year?.toString()].filter(Boolean).join(" · "))
        .join("\n"),
    });
  }

  if (record.spouses.length) {
    rows.push({
      label: "Spouses",
      value: record.spouses.join(", "),
    });
  }

  if (record.children.length) {
    rows.push({
      label: "Children",
      value: record.children.join(", "),
    });
  }

  if (record.occupation) {
    rows.push({
      label: "Occupation",
      value: record.occupation,
    });
  }

  if (record.religion) {
    rows.push({
      label: "Religion",
      value: record.religion,
    });
  }

  if (record.notes) {
    rows.push({
      label: "Notes",
      value: record.notes,
    });
  }

  return rows;
}

function renderConfidence(record: IndividualRecord, scores: ConfidenceScores): void {
  const rows = buildFieldRows(record, scores);

  if (!rows.length) {
    const emptyMessage = document.createElement("p");
    emptyMessage.textContent = "No extracted fields yet.";
    emptyMessage.className = "supporting-text";
    confidenceList.replaceChildren(emptyMessage);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "confidence-item";

    const meta = document.createElement("div");
    meta.className = "confidence-meta";
    meta.innerHTML = `<span>${row.label}</span><span>${
      row.confidence !== undefined ? `${Math.round(row.confidence * 100)}%` : "—"
    }</span>`;

    const bar = document.createElement("div");
    bar.className = "confidence-bar";

    if (row.confidence !== undefined) {
      const barFill = document.createElement("span");
      barFill.style.width = `${Math.round(row.confidence * 100)}%`;
      bar.appendChild(barFill);
    }

    const value = document.createElement("pre");
    value.textContent = row.value;
    value.style.margin = "0";

    item.append(meta, bar, value);
    fragment.appendChild(item);
  }

  confidenceList.replaceChildren(fragment);
}

function updateHighlight(record: IndividualRecord): void {
  lastHighlightDocument = buildHighlightDocument(record);

  if (showingSources) {
    previewFrame.srcdoc = lastHighlightDocument;
  }
}

function formatTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getRecordSummary(record: IndividualRecord): string {
  const nameParts = [...record.givenNames];

  if (record.surname) {
    nameParts.push(record.surname);
  }

  const name = nameParts.join(" ").trim();
  const birthYear = record.birth.year ? record.birth.year.toString() : "";
  const deathYear = record.death.year ? record.death.year.toString() : "";
  let years = "";

  if (birthYear || deathYear) {
    const span = `${birthYear || "?"}–${deathYear || "?"}`;
    years = ` (${span})`;
  }

  if (name) {
    return `${name}${years}`;
  }

  if (record.sourceUrl) {
    return record.sourceUrl;
  }

  return `Record extracted ${new Date(record.extractedAt).toLocaleDateString()}`;
}

function getSuggestedIndividualName(record: IndividualRecord): string {
  const nameParts = [...record.givenNames];

  if (record.surname) {
    nameParts.push(record.surname);
  }

  const name = nameParts.join(" ").trim();

  if (name) {
    return name;
  }

  if (record.sourceUrl) {
    return record.sourceUrl;
  }

  return "Unnamed individual";
}

function formatLifespan(record: IndividualRecord): string {
  const birthYear = record.birth.year ? record.birth.year.toString() : "";
  const deathYear = record.death.year ? record.death.year.toString() : "";

  if (!birthYear && !deathYear) {
    return "";
  }

  return `${birthYear || "?"}–${deathYear || "?"}`;
}

function populateExistingIndividuals(individuals: StoredIndividual[]): void {
  const previousValue = existingIndividualSelect.value;
  existingIndividualSelect.replaceChildren();

  if (!individuals.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No individuals available";
    existingIndividualSelect.appendChild(option);
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select an individual";
  existingIndividualSelect.appendChild(placeholder);

  const sorted = [...individuals].sort((a, b) => a.name.localeCompare(b.name));
  for (const individual of sorted) {
    const option = document.createElement("option");
    option.value = individual.id;
    option.textContent = individual.name;
    if (individual.id === previousValue) {
      option.selected = true;
    }
    existingIndividualSelect.appendChild(option);
  }

  if (previousValue && existingIndividualSelect.value !== previousValue) {
    existingIndividualSelect.value = previousValue;
  }
}

function updateSavePanel(): void {
  const hasRecord = Boolean(currentRecord);
  const hasIndividuals = latestState.individuals.length > 0;

  saveButton.disabled = !hasRecord;
  saveModeNew.disabled = !hasRecord;

  const shouldDisableExisting = !hasRecord || !hasIndividuals;
  saveModeExisting.disabled = shouldDisableExisting;

  if (saveModeExisting.disabled && saveModeExisting.checked) {
    saveModeExisting.checked = false;
    saveModeNew.checked = true;
  }

  const newModeActive = saveModeNew.checked && !saveModeNew.disabled;
  const existingModeActive = saveModeExisting.checked && !saveModeExisting.disabled;

  newIndividualInput.disabled = !newModeActive;
  existingIndividualSelect.disabled = !existingModeActive;

  if (!hasRecord) {
    newIndividualInput.value = "";
    saveFeedback.textContent = "";
  } else if (newModeActive && currentRecord) {
    suggestedName = getSuggestedIndividualName(currentRecord);
    if (!newIndividualInput.value.trim() || newIndividualInput.value === suggestedName) {
      newIndividualInput.value = suggestedName;
    }
  }

  populateExistingIndividuals(latestState.individuals);
}

function renderSavedRecords(state: PersistedState): void {
  if (!state.records.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No records saved yet. Extract a record and press \"Save record\" to store it.";
    savedRecordsContainer.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  const records = [...state.records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  for (const stored of records) {
    const individual = state.individuals.find((item) => item.id === stored.individualId);
    const card = document.createElement("article");
    card.className = "card";

    const header = document.createElement("header");
    const title = document.createElement("h3");
    title.className = "card-title";
    title.textContent = stored.summary || "Saved record";

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = `Saved ${formatTimestamp(stored.createdAt)}`;

    header.append(title, meta);
    card.appendChild(header);

    const linkInfo = document.createElement("p");
    linkInfo.className = "supporting-text";
    linkInfo.textContent = individual
      ? `Linked to ${individual.name}`
      : "Linked individual not found";
    card.appendChild(linkInfo);

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.textContent = "Load in extractor";
    loadButton.dataset.action = "load-record";
    loadButton.dataset.recordId = stored.id;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Remove";
    deleteButton.className = "button-secondary";
    deleteButton.dataset.action = "delete-record";
    deleteButton.dataset.recordId = stored.id;

    actions.append(loadButton, deleteButton);
    card.appendChild(actions);

    fragment.appendChild(card);
  }

  savedRecordsContainer.replaceChildren(fragment);
}

function renderIndividuals(state: PersistedState): void {
  if (!state.individuals.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No individuals yet. Save a record or create a person to get started.";
    individualsList.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  const individuals = [...state.individuals].sort((a, b) => a.name.localeCompare(b.name));

  for (const individual of individuals) {
    const card = document.createElement("article");
    card.className = "card";

    const header = document.createElement("header");
    const title = document.createElement("h3");
    title.className = "card-title";
    title.textContent = individual.name;

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = `Updated ${formatTimestamp(individual.updatedAt)}`;

    header.append(title, meta);
    card.appendChild(header);

    const linkedRecords = state.records.filter((record) => record.individualId === individual.id);
    const countLabel = document.createElement("p");
    countLabel.className = "supporting-text";
    countLabel.textContent = linkedRecords.length
      ? `${linkedRecords.length} linked record${linkedRecords.length === 1 ? "" : "s"}`
      : "No linked records yet.";
    card.appendChild(countLabel);

    if (linkedRecords.length) {
      const list = document.createElement("ul");
      list.className = "inline-list";

      for (const stored of linkedRecords.sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
        const item = document.createElement("li");
        const summary = stored.summary || "Saved record";
        item.textContent = `${summary} — saved ${formatTimestamp(stored.createdAt)}`;
        list.appendChild(item);
      }

      card.appendChild(list);
    }

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const renameButton = document.createElement("button");
    renameButton.type = "button";
    renameButton.textContent = "Rename";
    renameButton.dataset.action = "rename-individual";
    renameButton.dataset.individualId = individual.id;

    actions.appendChild(renameButton);
    card.appendChild(actions);

    fragment.appendChild(card);
  }

  individualsList.replaceChildren(fragment);
}

function normalizeNameKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function buildRecordIndex(records: StoredRecord[]): Map<string, StoredRecord> {
  const index = new Map<string, StoredRecord>();

  for (const stored of records) {
    const name = getSuggestedIndividualName(stored.record);
    const key = normalizeNameKey(name);

    if (!key) {
      continue;
    }

    const existing = index.get(key);
    if (!existing || existing.createdAt < stored.createdAt) {
      index.set(key, stored);
    }
  }

  return index;
}

function getLatestRecordForIndividual(id: string, records: StoredRecord[]): StoredRecord | null {
  const relevant = records.filter((record) => record.individualId === id);
  if (!relevant.length) {
    return null;
  }

  relevant.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return relevant[0];
}

function createTreePersonElement(
  name: string,
  record: IndividualRecord | null,
  options: { showRelationships?: boolean; note?: string } = {},
): HTMLElement {
  const container = document.createElement("div");
  container.className = "tree-person";

  const title = document.createElement("strong");
  title.textContent = name || "Unnamed individual";
  container.appendChild(title);

  if (record) {
    const lifespan = formatLifespan(record);
    if (lifespan) {
      const span = document.createElement("span");
      span.className = "tree-lifespan";
      span.textContent = lifespan;
      container.appendChild(span);
    }

    const birthplace = record.birth.place;
    if (birthplace) {
      const info = document.createElement("span");
      info.className = "tree-notes";
      info.textContent = `Birth: ${birthplace}`;
      container.appendChild(info);
    }

    const deathplace = record.death.place;
    if (deathplace) {
      const info = document.createElement("span");
      info.className = "tree-notes";
      info.textContent = `Death: ${deathplace}`;
      container.appendChild(info);
    }

    if (options.showRelationships && record.spouses.length) {
      const spouses = document.createElement("span");
      spouses.className = "tree-notes";
      spouses.textContent = `Spouses: ${record.spouses.join(", ")}`;
      container.appendChild(spouses);
    }

    if (record.residences.length) {
      const summary = record.residences
        .slice(0, 2)
        .map((residence) => residence.place || residence.raw || "Residence")
        .join(" · ");
      if (summary) {
        const residences = document.createElement("span");
        residences.className = "tree-notes";
        residences.textContent = `Residences: ${summary}`;
        container.appendChild(residences);
      }
    }

    if (record.occupation) {
      const occupation = document.createElement("span");
      occupation.className = "tree-notes";
      occupation.textContent = `Occupation: ${record.occupation}`;
      container.appendChild(occupation);
    }
  } else {
    const message = document.createElement("span");
    message.className = "tree-notes";
    message.textContent = "No detailed record yet.";
    container.appendChild(message);
  }

  if (options.note) {
    const note = document.createElement("span");
    note.className = "tree-notes";
    note.textContent = options.note;
    container.appendChild(note);
  }

  return container;
}

function renderTree(state: PersistedState): void {
  treeContainer.replaceChildren();

  if (!state.individuals.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Add individuals to explore their family tree.";
    treeContainer.appendChild(empty);
    return;
  }

  if (!selectedTreeIndividualId) {
    const message = document.createElement("div");
    message.className = "empty-state";
    message.textContent = "Select an individual to view their three-generation tree.";
    treeContainer.appendChild(message);
    return;
  }

  const individual = state.individuals.find((item) => item.id === selectedTreeIndividualId);

  if (!individual) {
    const missing = document.createElement("div");
    missing.className = "empty-state";
    missing.textContent = "Selected individual not found.";
    treeContainer.appendChild(missing);
    return;
  }

  const storedRecord = getLatestRecordForIndividual(individual.id, state.records);

  if (!storedRecord) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No records linked to this individual yet.";
    treeContainer.appendChild(empty);
    return;
  }

  const recordIndex = buildRecordIndex(state.records);
  const grid = document.createElement("div");
  grid.className = "tree-grid";

  const parentsColumn = document.createElement("div");
  parentsColumn.className = "tree-generation";
  const parentsHeading = document.createElement("h3");
  parentsHeading.textContent = "Parents";
  parentsColumn.appendChild(parentsHeading);

  const fatherName = storedRecord.record.parents.father;
  const motherName = storedRecord.record.parents.mother;

  if (!fatherName && !motherName) {
    const empty = document.createElement("span");
    empty.className = "tree-empty";
    empty.textContent = "No parents recorded.";
    parentsColumn.appendChild(empty);
  } else {
    if (fatherName) {
      const fatherRecord = recordIndex.get(normalizeNameKey(fatherName));
      parentsColumn.appendChild(
        createTreePersonElement(fatherName, fatherRecord ? fatherRecord.record : null),
      );
    }

    if (motherName) {
      const motherRecord = recordIndex.get(normalizeNameKey(motherName));
      parentsColumn.appendChild(
        createTreePersonElement(motherName, motherRecord ? motherRecord.record : null),
      );
    }
  }

  const rootColumn = document.createElement("div");
  rootColumn.className = "tree-generation";
  const rootHeading = document.createElement("h3");
  rootHeading.textContent = "Individual";
  rootColumn.appendChild(rootHeading);
  rootColumn.appendChild(createTreePersonElement(individual.name, storedRecord.record, { showRelationships: true }));

  const childrenColumn = document.createElement("div");
  childrenColumn.className = "tree-generation";
  const childrenHeading = document.createElement("h3");
  childrenHeading.textContent = "Children";
  childrenColumn.appendChild(childrenHeading);

  if (!storedRecord.record.children.length) {
    const empty = document.createElement("span");
    empty.className = "tree-empty";
    empty.textContent = "No children recorded.";
    childrenColumn.appendChild(empty);
  } else {
    for (const childName of storedRecord.record.children) {
      const childRecord = recordIndex.get(normalizeNameKey(childName));
      childrenColumn.appendChild(
        createTreePersonElement(childName, childRecord ? childRecord.record : null),
      );
    }
  }

  grid.append(parentsColumn, rootColumn, childrenColumn);
  treeContainer.appendChild(grid);
}

function populateTreeOptions(individuals: StoredIndividual[]): void {
  const previousValue = treeSelect.value;
  const filtered = individuals
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((individual) => individual.name.toLowerCase().includes(treeSearchQuery));

  treeSelect.replaceChildren();

  if (!individuals.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No individuals available";
    treeSelect.appendChild(option);
    treeSelect.disabled = true;
    return;
  }

  treeSelect.disabled = false;

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select an individual";
  treeSelect.appendChild(placeholder);

  if (!filtered.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No matches";
    option.disabled = true;
    treeSelect.appendChild(option);
  }

  for (const individual of filtered) {
    const option = document.createElement("option");
    option.value = individual.id;
    option.textContent = individual.name;
    if (individual.id === selectedTreeIndividualId) {
      option.selected = true;
    }
    treeSelect.appendChild(option);
  }

  if (selectedTreeIndividualId) {
    const stillVisible = filtered.some((item) => item.id === selectedTreeIndividualId);
    if (!stillVisible) {
      const selected = individuals.find((item) => item.id === selectedTreeIndividualId);
      if (selected) {
        const option = document.createElement("option");
        option.value = selected.id;
        option.textContent = `${selected.name} (current selection)`;
        option.selected = true;
        treeSelect.appendChild(option);
      }
    } else {
      treeSelect.value = selectedTreeIndividualId;
    }
  } else {
    treeSelect.value = "";
  }
}

function renderProfessionSettings(state: PersistedState): void {
  if (!state.professions.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No profession definitions yet. Add one using the form.";
    professionList.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  const entries = [...state.professions].sort((a, b) => a.label.localeCompare(b.label));

  for (const definition of entries) {
    const card = document.createElement("div");
    card.className = "settings-card";

    const header = document.createElement("header");
    const title = document.createElement("h3");
    title.className = "settings-card-title";
    title.textContent = definition.label;
    const meta = document.createElement("span");
    meta.className = "settings-meta";
    meta.textContent = `Updated ${formatTimestamp(definition.updatedAt)}`;
    header.append(title, meta);
    card.appendChild(header);

    if (definition.aliases.length) {
      const aliasList = document.createElement("div");
      aliasList.className = "alias-list";
      for (const alias of definition.aliases) {
        const badge = document.createElement("span");
        badge.className = "alias-badge";
        badge.textContent = alias;
        aliasList.appendChild(badge);
      }
      card.appendChild(aliasList);
    } else {
      const note = document.createElement("span");
      note.className = "tree-empty";
      note.textContent = "No aliases";
      card.appendChild(note);
    }

    const actions = document.createElement("div");
    actions.className = "card-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit";
    edit.dataset.action = "edit";
    edit.dataset.id = definition.id;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.className = "button-secondary";
    remove.dataset.action = "delete";
    remove.dataset.id = definition.id;
    actions.append(edit, remove);
    card.appendChild(actions);

    fragment.appendChild(card);
  }

  professionList.replaceChildren(fragment);
}

function renderPlaceSettings(state: PersistedState): void {
  if (!state.places.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No place definitions yet. Add one using the form.";
    placeList.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  const entries = [...state.places].sort((a, b) => a.label.localeCompare(b.label));

  for (const definition of entries) {
    const card = document.createElement("div");
    card.className = "settings-card";

    const header = document.createElement("header");
    const title = document.createElement("h3");
    title.className = "settings-card-title";
    title.textContent = definition.label;
    const meta = document.createElement("span");
    meta.className = "settings-meta";
    meta.textContent = `Updated ${formatTimestamp(definition.updatedAt)}`;
    header.append(title, meta);
    card.appendChild(header);

    if (definition.category) {
      const category = document.createElement("span");
      category.className = "settings-meta";
      category.textContent = `Category: ${definition.category}`;
      card.appendChild(category);
    }

    if (definition.aliases.length) {
      const aliasList = document.createElement("div");
      aliasList.className = "alias-list";
      for (const alias of definition.aliases) {
        const badge = document.createElement("span");
        badge.className = "alias-badge";
        badge.textContent = alias;
        aliasList.appendChild(badge);
      }
      card.appendChild(aliasList);
    } else {
      const note = document.createElement("span");
      note.className = "tree-empty";
      note.textContent = "No aliases";
      card.appendChild(note);
    }

    const actions = document.createElement("div");
    actions.className = "card-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit";
    edit.dataset.action = "edit";
    edit.dataset.id = definition.id;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.className = "button-secondary";
    remove.dataset.action = "delete";
    remove.dataset.id = definition.id;
    actions.append(edit, remove);
    card.appendChild(actions);

    fragment.appendChild(card);
  }

  placeList.replaceChildren(fragment);
}

function resetProfessionForm(): void {
  professionForm.reset();
  editingProfessionId = null;
  professionCancelButton.hidden = true;
  professionSubmitButton.textContent = "Save profession";
}

function resetPlaceForm(): void {
  placeForm.reset();
  editingPlaceId = null;
  placeCancelButton.hidden = true;
  placeSubmitButton.textContent = "Save place";
  placeCategorySelect.value = "";
}

function showProfessionFeedback(message: string): void {
  professionFeedback.textContent = message;
  if (professionFeedbackTimeout !== null) {
    window.clearTimeout(professionFeedbackTimeout);
  }
  professionFeedbackTimeout = window.setTimeout(() => {
    professionFeedback.textContent = "";
    professionFeedbackTimeout = null;
  }, 4000);
}

function showPlaceFeedback(message: string): void {
  placeFeedback.textContent = message;
  if (placeFeedbackTimeout !== null) {
    window.clearTimeout(placeFeedbackTimeout);
  }
  placeFeedbackTimeout = window.setTimeout(() => {
    placeFeedback.textContent = "";
    placeFeedbackTimeout = null;
  }, 4000);
}

function setProfessionEditing(definition: StoredProfessionDefinition): void {
  editingProfessionId = definition.id;
  professionLabelInput.value = definition.label;
  professionAliasesInput.value = definition.aliases.join(", ");
  professionCancelButton.hidden = false;
  professionSubmitButton.textContent = "Update profession";
  professionLabelInput.focus();
}

function setPlaceEditing(definition: StoredPlaceDefinition): void {
  editingPlaceId = definition.id;
  placeLabelInput.value = definition.label;
  placeAliasesInput.value = definition.aliases.join(", ");
  placeCategorySelect.value = definition.category ?? "";
  placeCancelButton.hidden = false;
  placeSubmitButton.textContent = "Update place";
  placeLabelInput.focus();
}

function handleProfessionAction(event: MouseEvent): void {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  if (!button) {
    return;
  }

  const id = button.dataset.id;

  if (!id) {
    return;
  }

  if (button.dataset.action === "edit") {
    const definition = latestState.professions.find((item) => item.id === id);
    if (definition) {
      setProfessionEditing(definition);
    }
  } else if (button.dataset.action === "delete") {
    const confirmed = window.confirm("Remove this profession definition?");
    if (confirmed) {
      deleteProfessionDefinition(id);
      showProfessionFeedback("Profession removed.");
      if (editingProfessionId === id) {
        resetProfessionForm();
      }
    }
  }
}

function handlePlaceAction(event: MouseEvent): void {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  if (!button) {
    return;
  }

  const id = button.dataset.id;

  if (!id) {
    return;
  }

  if (button.dataset.action === "edit") {
    const definition = latestState.places.find((item) => item.id === id);
    if (definition) {
      setPlaceEditing(definition);
    }
  } else if (button.dataset.action === "delete") {
    const confirmed = window.confirm("Remove this place definition?");
    if (confirmed) {
      deletePlaceDefinition(id);
      showPlaceFeedback("Place removed.");
      if (editingPlaceId === id) {
        resetPlaceForm();
      }
    }
  }
}

function switchView(next: ViewMode): void {
  currentView = next;

  const mapping: Record<ViewMode, { view: HTMLElement; tab: HTMLButtonElement }> = {
    records: { view: recordsView, tab: recordsTab },
    individuals: { view: individualsView, tab: individualsTab },
    tree: { view: treeView, tab: treeTab },
    settings: { view: settingsView, tab: settingsTab },
  };

  (Object.keys(mapping) as ViewMode[]).forEach((mode) => {
    const { view, tab } = mapping[mode];
    const isActive = mode === next;
    view.hidden = !isActive;
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  if (next === "tree") {
    renderTree(latestState);
  }
}

function handleInput(): void {
  const value = htmlInput.value.trim();

  if (!value) {
    resetOutputs();
    currentRecord = null;
    updateSavePanel();
    reextractButton.disabled = true;
    return;
  }

  try {
    const record = extractIndividual(value, buildExtractOptions());
    currentRecord = record;
    const scores = scoreConfidence(record);

    renderJsonRecord(record);
    errorBox.hidden = true;
    errorBox.textContent = "";

    renderConfidence(record, scores);
    toggleSourcesButton.disabled = false;
    toggleSourcesButton.textContent = "Highlight sources";
    showingSources = false;
    previewFrame.hidden = true;
    previewFrame.srcdoc = "";
    updateHighlight(record);

    provenanceCount.hidden = false;
    provenanceCount.textContent = `${record.provenance.length} provenance span${
      record.provenance.length === 1 ? "" : "s"
    }`;

    suggestedName = getSuggestedIndividualName(record);
    newIndividualInput.value = suggestedName;

    reextractButton.disabled = false;
    saveFeedback.textContent = "";
    updateSavePanel();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    currentRecord = null;
    lastHighlightDocument = "";
    jsonOutput.dataset.empty = "true";
    jsonOutput.textContent = "Extraction failed.";
    errorBox.hidden = false;
    errorBox.textContent = message;
    confidenceList.replaceChildren();
    toggleSourcesButton.disabled = true;
    previewFrame.hidden = true;
    showingSources = false;
    toggleSourcesButton.textContent = "Highlight sources";
    provenanceCount.hidden = true;
    provenanceCount.textContent = "";
    reextractButton.disabled = value.length === 0;
    updateSavePanel();
  }
}

function resetOutputs(): void {
  jsonOutput.dataset.empty = "true";
  jsonOutput.textContent = "Paste HTML to see extracted fields.";
  errorBox.hidden = true;
  errorBox.textContent = "";
  confidenceList.replaceChildren();
  toggleSourcesButton.disabled = true;
  toggleSourcesButton.textContent = "Highlight sources";
  showingSources = false;
  previewFrame.hidden = true;
  previewFrame.srcdoc = "";
  lastHighlightDocument = "";
  provenanceCount.hidden = true;
  provenanceCount.textContent = "";
  reextractButton.disabled = true;
}

function toggleSources(): void {
  if (!lastHighlightDocument) {
    return;
  }

  showingSources = !showingSources;
  toggleSourcesButton.textContent = showingSources ? "Hide highlighted sources" : "Highlight sources";
  previewFrame.hidden = !showingSources;

  if (showingSources) {
    previewFrame.srcdoc = lastHighlightDocument;
  }
}

function handleRecordAction(event: MouseEvent): void {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");

  if (!button) {
    return;
  }

  const recordId = button.dataset.recordId;

  if (!recordId) {
    return;
  }

  if (button.dataset.action === "load-record") {
    const stored = latestState.records.find((record) => record.id === recordId);

    if (!stored) {
      return;
    }

    htmlInput.value = stored.record.sourceHtml;
    switchView("records");
    showingSources = false;
    toggleSourcesButton.textContent = "Highlight sources";
    handleInput();
    saveFeedback.textContent = `Loaded record saved ${formatTimestamp(stored.createdAt)}.`;
  } else if (button.dataset.action === "delete-record") {
    const confirmDelete = window.confirm("Remove this saved record? This cannot be undone.");

    if (confirmDelete) {
      deleteRecord(recordId);
    }
  }
}

function handleIndividualAction(event: MouseEvent): void {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");

  if (!button) {
    return;
  }

  const individualId = button.dataset.individualId;

  if (!individualId) {
    return;
  }

  if (button.dataset.action === "rename-individual") {
    const individual = latestState.individuals.find((item) => item.id === individualId);

    if (!individual) {
      return;
    }

    const nextName = window.prompt("Rename individual", individual.name);

    if (nextName && nextName.trim() && nextName.trim() !== individual.name) {
      renameIndividual(individualId, nextName.trim());
    }
  }
}

recordsTab.addEventListener("click", () => switchView("records"));
individualsTab.addEventListener("click", () => switchView("individuals"));
treeTab.addEventListener("click", () => switchView("tree"));
settingsTab.addEventListener("click", () => switchView("settings"));
htmlInput.addEventListener("input", handleInput);
saveModeNew.addEventListener("change", updateSavePanel);
saveModeExisting.addEventListener("change", updateSavePanel);
toggleSourcesButton.addEventListener("click", toggleSources);
savedRecordsContainer.addEventListener("click", handleRecordAction);
individualsList.addEventListener("click", handleIndividualAction);
reextractButton.addEventListener("click", () => {
  handleInput();
  if (!errorBox.hidden && errorBox.textContent) {
    saveFeedback.textContent = "";
  } else if (htmlInput.value.trim()) {
    saveFeedback.textContent = "Re-extracted with current master data.";
  }
});
treeSearchInput.addEventListener("input", () => {
  treeSearchQuery = treeSearchInput.value.trim().toLowerCase();
  populateTreeOptions(latestState.individuals);
});
treeSelect.addEventListener("change", () => {
  selectedTreeIndividualId = treeSelect.value || null;
  renderTree(latestState);
});
treeClearButton.addEventListener("click", () => {
  selectedTreeIndividualId = null;
  treeSelect.value = "";
  renderTree(latestState);
});
professionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const label = professionLabelInput.value.trim();

  if (!label) {
    professionLabelInput.focus();
    return;
  }

  const aliases = parseAliasInput(professionAliasesInput.value);

  try {
    saveProfessionDefinition({
      id: editingProfessionId ?? undefined,
      label,
      aliases,
    });
    showProfessionFeedback(
      editingProfessionId ? "Profession updated." : "Profession added.",
    );
    resetProfessionForm();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showProfessionFeedback(message);
  }
});
professionCancelButton.addEventListener("click", () => {
  resetProfessionForm();
  showProfessionFeedback("Edit cancelled.");
});
professionList.addEventListener("click", handleProfessionAction);
placeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const label = placeLabelInput.value.trim();

  if (!label) {
    placeLabelInput.focus();
    return;
  }

  const aliases = parseAliasInput(placeAliasesInput.value);
  const categoryValue = placeCategorySelect.value.trim() as PlaceCategory | "";
  const category: PlaceCategory | undefined = categoryValue
    ? (categoryValue as PlaceCategory)
    : undefined;

  try {
    savePlaceDefinition({
      id: editingPlaceId ?? undefined,
      label,
      aliases,
      category,
    });
    showPlaceFeedback(editingPlaceId ? "Place updated." : "Place added.");
    resetPlaceForm();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showPlaceFeedback(message);
  }
});
placeCancelButton.addEventListener("click", () => {
  resetPlaceForm();
  showPlaceFeedback("Edit cancelled.");
});
placeList.addEventListener("click", handlePlaceAction);

clearRecordsButton.addEventListener("click", () => {
  if (!latestState.records.length) {
    return;
  }

  const shouldClear = window.confirm("Remove all saved records? Individuals will be kept.");

  if (shouldClear) {
    clearRecords();
    saveFeedback.textContent = "Cleared all saved records.";
  }
});

saveForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!currentRecord) {
    saveFeedback.textContent = "Extract a record before saving.";
    return;
  }

  let individualId: string | null = null;
  let individualName = "";

  if (saveModeNew.checked && !saveModeNew.disabled) {
    const providedName = newIndividualInput.value.trim() || suggestedName;

    if (!providedName) {
      saveFeedback.textContent = "Provide a name for the new individual.";
      newIndividualInput.focus();
      return;
    }

    const individual = createIndividual(providedName);
    individualId = individual.id;
    individualName = individual.name;
  } else if (saveModeExisting.checked && !saveModeExisting.disabled) {
    const selected = existingIndividualSelect.value;

    if (!selected) {
      saveFeedback.textContent = "Choose an individual to link.";
      existingIndividualSelect.focus();
      return;
    }

    individualId = selected;
    const individual = latestState.individuals.find((item) => item.id === selected);
    individualName = individual ? individual.name : "selected individual";
  } else {
    saveFeedback.textContent = "Select how you want to link this record.";
    return;
  }

  if (!individualId) {
    return;
  }

  const summary = getRecordSummary(currentRecord);
  createRecord({ individualId, summary, record: currentRecord });
  saveFeedback.textContent = `Saved record for ${individualName}.`;

  if (saveModeNew.checked) {
    saveModeExisting.checked = true;
    saveModeNew.checked = false;
  }

  updateSavePanel();
});

createIndividualForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = createIndividualNameInput.value.trim();

  if (!name) {
    createIndividualNameInput.focus();
    return;
  }

  createIndividual(name);
  createIndividualNameInput.value = "";
  saveFeedback.textContent = `Created individual ${name}.`;
  updateSavePanel();
});

subscribe((state) => {
  latestState = state;
  renderSavedRecords(state);
  renderIndividuals(state);
  populateTreeOptions(state.individuals);
  if (currentView === "tree") {
    renderTree(state);
  }
  renderProfessionSettings(state);
  renderPlaceSettings(state);
  updateSavePanel();
});

function resetApplication(): void {
  htmlInput.value = DEFAULT_HTML;
  switchView("records");
  handleInput();
}

resetApplication();

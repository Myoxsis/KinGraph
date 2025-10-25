import { extractIndividual } from "../../extract";
import { scoreConfidence } from "../../confidence";
import { highlight } from "../../highlight";
import type { IndividualRecord } from "../../schema";
import {
  clearRecords,
  createIndividual,
  createRecord,
  deleteRecord,
  getState,
  renameIndividual,
  subscribe,
  type StoredIndividual,
} from "@/storage";

type ConfidenceScores = ReturnType<typeof scoreConfidence>;

type DateFragment = IndividualRecord["birth"];

interface FieldRow {
  label: string;
  value: string;
  confidence?: number;
}

type ViewMode = "records" | "individuals";

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
const jsonOutput = requireElement<HTMLPreElement>(
  "json-output",
  (el): el is HTMLPreElement => el instanceof HTMLPreElement
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
const recordsTab = requireElement<HTMLButtonElement>(
  "tab-records",
  (el): el is HTMLButtonElement => el instanceof HTMLButtonElement
);
const individualsTab = requireElement<HTMLButtonElement>(
  "tab-individuals",
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

let currentView: ViewMode = "records";
let currentRecord: IndividualRecord | null = null;
let lastHighlightDocument = "";
let showingSources = false;
let latestState: PersistedState = getState();
let suggestedName = "";

function escapeHtmlContent(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightJson(json: string): string {
  const escaped = escapeHtmlContent(json);
  const jsonPattern =
    /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

  return escaped.replace(jsonPattern, (match) => {
    let cls = "text-slate-300";

    if (/^".*":$/.test(match)) {
      cls = "text-sky-400";
    } else if (/^".*"$/.test(match)) {
      cls = "text-emerald-300";
    } else if (/true|false/.test(match)) {
      cls = "text-orange-300";
    } else if (/null/.test(match)) {
      cls = "text-pink-300";
    } else if (/^-?\d/.test(match)) {
      cls = "text-amber-300";
    }

    return `<span class="${cls}">${match}</span>`;
  });
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

function switchView(next: ViewMode): void {
  currentView = next;

  if (next === "records") {
    recordsView.hidden = false;
    individualsView.hidden = true;
    recordsTab.setAttribute("aria-selected", "true");
    individualsTab.setAttribute("aria-selected", "false");
  } else {
    recordsView.hidden = true;
    individualsView.hidden = false;
    recordsTab.setAttribute("aria-selected", "false");
    individualsTab.setAttribute("aria-selected", "true");
  }
}

function handleInput(): void {
  const value = htmlInput.value.trim();

  if (!value) {
    resetOutputs();
    currentRecord = null;
    updateSavePanel();
    return;
  }

  try {
    const record = extractIndividual(value);
    currentRecord = record;
    const scores = scoreConfidence(record);

    jsonOutput.innerHTML = highlightJson(JSON.stringify(record, null, 2));
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

    updateSavePanel();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    currentRecord = null;
    lastHighlightDocument = "";
    jsonOutput.textContent = "";
    errorBox.hidden = false;
    errorBox.textContent = message;
    confidenceList.replaceChildren();
    toggleSourcesButton.disabled = true;
    previewFrame.hidden = true;
    showingSources = false;
    toggleSourcesButton.textContent = "Highlight sources";
    provenanceCount.hidden = true;
    provenanceCount.textContent = "";
    updateSavePanel();
  }
}

function resetOutputs(): void {
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
htmlInput.addEventListener("input", handleInput);
saveModeNew.addEventListener("change", updateSavePanel);
saveModeExisting.addEventListener("change", updateSavePanel);
toggleSourcesButton.addEventListener("click", toggleSources);
savedRecordsContainer.addEventListener("click", handleRecordAction);
individualsList.addEventListener("click", handleIndividualAction);

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
  updateSavePanel();
});

function resetApplication(): void {
  htmlInput.value = DEFAULT_HTML;
  switchView("records");
  handleInput();
}

resetApplication();

import { extractIndividual, type ExtractOptions } from "../../extract";
import { scoreConfidence } from "../../confidence";
import { IndividualRecordSchema, type IndividualRecord } from "../../schema";
import {
  clearRecords,
  createIndividual,
  createRecord,
  deleteRecord,
  updateRecord,
  getState,
  subscribe,
  type StoredIndividual,
  type StoredRecord,
  type StoredRoleDefinition,
} from "@/storage";
import {
  buildHighlightDocument,
  formatDate,
  formatLifespan,
  formatTimestamp,
  getLatestRecordForIndividual,
  getRecordSummary,
  getSuggestedIndividualName,
  highlightJson,
} from "./shared/utils";
import { initializeWorkspaceSearch } from "./shared/search";

type ConfidenceScores = ReturnType<typeof scoreConfidence>;

interface FieldRow {
  label: string;
  value: string;
  confidence?: number;
}

interface SampleSnippet {
  label: string;
  html: string;
}

type LinkStatusFilter = "all" | "linked" | "unlinked";

interface RecordFilterCriteria {
  search: string;
  individualId: string;
  linkStatus: LinkStatusFilter;
  roleId: string;
  startDate: string;
  endDate: string;
  minConfidence: number;
}

const UNLINKED_FILTER_VALUE = "__unlinked__";
export const NO_ROLE_FILTER_VALUE = "__no_role__";

interface RecordFilterOptions {
  roleLabels?: Map<string, string>;
}

interface CsvImportRow {
  index: number;
  cells: string[];
}

interface CsvImportData {
  headers: string[];
  rows: CsvImportRow[];
}

interface ImportQueueItem {
  html: string;
  rowIndex: number;
}

const DEFAULT_FILTERS: RecordFilterCriteria = {
  search: "",
  individualId: "",
  linkStatus: "all",
  roleId: "",
  startDate: "",
  endDate: "",
  minConfidence: 0,
};

const CONFIDENCE_LABELS: Record<string, string> = {
  givenNames: "Given names",
  surname: "Surname",
  maidenName: "Maiden name",
  "birth.date": "Birth date",
  "death.date": "Death date",
  "parents.father": "Father",
  "parents.mother": "Mother",
};

type ExtractionTrigger = "auto" | "manual" | "sample" | "load" | "reset" | "import";

interface RecordsElements {
  htmlInput: HTMLTextAreaElement;
  jsonOutput: HTMLDivElement;
  jsonEditor: HTMLTextAreaElement;
  jsonEditButton: HTMLButtonElement;
  jsonApplyButton: HTMLButtonElement;
  jsonCancelButton: HTMLButtonElement;
  errorBox: HTMLDivElement;
  confidenceList: HTMLDivElement;
  toggleSourcesButton: HTMLButtonElement;
  reextractButton: HTMLButtonElement;
  clearInputButton: HTMLButtonElement;
  previewFrame: HTMLIFrameElement;
  provenanceCount: HTMLSpanElement;
  sampleChipContainer: HTMLDivElement;
  autoExtractToggle: HTMLInputElement;
  charCount: HTMLSpanElement;
  lastRunStatus: HTMLSpanElement;
  lastRunFooter: HTMLTimeElement;
  saveForm: HTMLFormElement;
  saveModeNew: HTMLInputElement;
  saveModeExisting: HTMLInputElement;
  newIndividualInput: HTMLInputElement;
  existingIndividualSelect: HTMLSelectElement;
  saveButton: HTMLButtonElement;
  saveFeedback: HTMLSpanElement;
  matchSuggestions: HTMLDivElement;
  matchSuggestionsList: HTMLUListElement;
  clearRecordsButton: HTMLButtonElement;
  savedRecordsContainer: HTMLDivElement;
  recordsFiltersForm: HTMLFormElement;
  filterIndividualSelect: HTMLSelectElement;
  filterLinkStatusSelect: HTMLSelectElement;
  filterRoleSelect: HTMLSelectElement;
  filterStartDateInput: HTMLInputElement;
  filterEndDateInput: HTMLInputElement;
  filterConfidenceInput: HTMLInputElement;
  filterConfidenceOutput: HTMLOutputElement;
  recordsTimeline: HTMLDivElement;
  workspaceSearchForm: HTMLFormElement | null;
  workspaceSearchInput: HTMLInputElement;
  workspaceSearchClear: HTMLButtonElement | null;
  openImportModalButton: HTMLButtonElement;
  loadNextImportButton: HTMLButtonElement;
  processImportQueueButton: HTMLButtonElement;
  importQueueStatus: HTMLSpanElement;
  importQueueProgress: HTMLSpanElement;
  importModal: HTMLDivElement;
  importModalBackdrop: HTMLDivElement;
  importModalClose: HTMLButtonElement;
  importModalForm: HTMLFormElement;
  importModalFileInput: HTMLInputElement;
  importModalColumnSelect: HTMLSelectElement;
  importModalPreview: HTMLDivElement;
  importModalFeedback: HTMLParagraphElement;
  importModalSubmit: HTMLButtonElement;
  importModalCancel: HTMLButtonElement;
}

const DEFAULT_HTML = "<h1>Jane Doe</h1><p>Born about 1892 to Mary &amp; John.</p>";
const SAMPLE_SNIPPETS: SampleSnippet[] = [
  {
    label: "Default sample",
    html: DEFAULT_HTML,
  },
  {
    label: "Birth register",
    html:
      '<article><h2>Birth Register</h2><p>Infant: <strong>William Carter</strong></p><p>Born 3 Mar 1902 in Boston, Suffolk, Massachusetts.</p><p>Parents listed as Thomas Carter &amp; Eleanor Lewis.</p></article>',
  },
  {
    label: "Marriage notice",
    html:
      '<section><header><h3>Marriage</h3></header><p>On 17 May 1888 at Trinity Chapel, <em>George H. Clark</em> wed <em>Louisa Bennett</em> of Albany, daughter of Mr. &amp; Mrs. Samuel Bennett.</p></section>',
  },
  {
    label: "Obituary excerpt",
    html:
      '<div class="obituary"><h3>Obituary</h3><p><strong>Mrs. Sarah Ann Morris</strong>, aged 67, died 12 Oct 1914 in Denver. Survived by sons James and Robert, daughters Helen (Peters) and Clara (Wells).</p></div>',
  },
];

function getTopConfidence(record: IndividualRecord): { field: string; value: number } | null {
  const scores = scoreConfidence(record);
  let best: { field: string; value: number } | null = null;

  for (const [field, value] of Object.entries(scores)) {
    if (typeof value !== "number") {
      continue;
    }

    if (!best || value > best.value) {
      best = { field, value };
    }
  }

  return best;
}

function getConfidenceLevel(value: number | null): "high" | "medium" | "low" | "unknown" {
  if (value === null) {
    return "unknown";
  }

  if (value >= 0.8) {
    return "high";
  }

  if (value >= 0.55) {
    return "medium";
  }

  return "low";
}

function getConfidenceText(entry: { field: string; value: number } | null): string {
  if (!entry) {
    return "No confidence data";
  }

  const percent = Math.round(entry.value * 100);
  const label = CONFIDENCE_LABELS[entry.field] ?? entry.field;
  return `${percent}% • ${label}`;
}

function formatConfidenceOutput(value: number): string {
  return `≥ ${Math.round(value * 100)}%`;
}

const MATCH_SUGGESTION_THRESHOLD = 0.45;
const AUTO_MATCH_THRESHOLD = 0.8;
const MAX_MATCH_SUGGESTIONS = 5;

interface MatchCandidate {
  individual: StoredIndividual;
  latestRecord: StoredRecord | null;
  score: number;
}

function normalizeForTokens(value: string): string {
  const normalized = typeof value.normalize === "function" ? value.normalize("NFKD") : value;
  return normalized.replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function tokenizeName(value: string): string[] {
  return normalizeForTokens(value)
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function collectRecordNameTokens(record: IndividualRecord): Set<string> {
  const tokens = new Set<string>();

  const add = (value: string | undefined) => {
    if (!value) {
      return;
    }

    for (const token of tokenizeName(value)) {
      tokens.add(token);
    }
  };

  for (const name of record.givenNames) {
    add(name);
  }

  add(record.surname);
  add(record.maidenName);

  for (const alias of record.aliases) {
    add(alias);
  }

  return tokens;
}

function collectIndividualNameTokens(
  individual: StoredIndividual,
  latestRecord: StoredRecord | null,
): Set<string> {
  const tokens = new Set<string>();

  const add = (value: string | undefined) => {
    if (!value) {
      return;
    }

    for (const token of tokenizeName(value)) {
      tokens.add(token);
    }
  };

  add(individual.name);

  for (const name of individual.profile.givenNames) {
    add(name);
  }

  add(individual.profile.surname);
  add(individual.profile.maidenName);

  for (const alias of individual.profile.aliases) {
    add(alias);
  }

  if (latestRecord) {
    for (const token of collectRecordNameTokens(latestRecord.record)) {
      tokens.add(token);
    }
  }

  return tokens;
}

function computeTokenOverlap(a: Set<string>, b: Set<string>): number | null {
  if (a.size === 0 || b.size === 0) {
    return null;
  }

  let intersection = 0;

  for (const token of a) {
    if (b.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...a, ...b]);
  return intersection / union.size;
}

function computeYearSimilarity(a?: number, b?: number): number | null {
  if (typeof a !== "number" || typeof b !== "number") {
    return null;
  }

  const diff = Math.abs(a - b);

  if (diff === 0) {
    return 1;
  }

  if (diff === 1) {
    return 0.75;
  }

  if (diff === 2) {
    return 0.5;
  }

  if (diff <= 5) {
    return 0.25;
  }

  return 0;
}

function computeNameSimilarity(a?: string, b?: string): number | null {
  if (!a || !b) {
    return null;
  }

  const tokensA = new Set(tokenizeName(a));
  const tokensB = new Set(tokenizeName(b));
  return computeTokenOverlap(tokensA, tokensB);
}

function resolveCandidateParents(
  individual: StoredIndividual,
  latestRecord: StoredRecord | null,
): { father?: string; mother?: string } {
  const recordParents = latestRecord?.record.parents ?? {};

  return {
    father: individual.profile.parents.father ?? recordParents.father,
    mother: individual.profile.parents.mother ?? recordParents.mother,
  };
}

function computeMatchScore(
  record: IndividualRecord,
  individual: StoredIndividual,
  latestRecord: StoredRecord | null,
): number {
  const components: { score: number; weight: number }[] = [];

  const recordTokens = collectRecordNameTokens(record);
  const individualTokens = collectIndividualNameTokens(individual, latestRecord);
  const nameScore = computeTokenOverlap(recordTokens, individualTokens);

  if (nameScore !== null) {
    components.push({ score: nameScore, weight: 0.6 });
  }

  const birthYear = record.birth.year;
  const candidateBirthYear = individual.profile.birth.year ?? latestRecord?.record.birth.year;
  const birthScore = computeYearSimilarity(birthYear, candidateBirthYear);

  if (birthScore !== null) {
    components.push({ score: birthScore, weight: 0.2 });
  }

  const deathYear = record.death.year;
  const candidateDeathYear = individual.profile.death.year ?? latestRecord?.record.death.year;
  const deathScore = computeYearSimilarity(deathYear, candidateDeathYear);

  if (deathScore !== null) {
    components.push({ score: deathScore, weight: 0.1 });
  }

  const candidateParents = resolveCandidateParents(individual, latestRecord);
  const parentMatches: number[] = [];
  const fatherMatch = computeNameSimilarity(record.parents.father, candidateParents.father);
  if (fatherMatch !== null) {
    parentMatches.push(fatherMatch);
  }
  const motherMatch = computeNameSimilarity(record.parents.mother, candidateParents.mother);
  if (motherMatch !== null) {
    parentMatches.push(motherMatch);
  }

  if (parentMatches.length) {
    const parentAverage = parentMatches.reduce((total, value) => total + value, 0) / parentMatches.length;
    components.push({ score: parentAverage, weight: 0.1 });
  }

  if (!components.length) {
    return 0;
  }

  const totalWeight = components.reduce((total, component) => total + component.weight, 0);
  const weightedScore = components.reduce(
    (total, component) => total + component.score * component.weight,
    0,
  );

  const normalized = weightedScore / totalWeight;
  return Math.max(0, Math.min(1, normalized));
}

function buildMatchCandidates(
  record: IndividualRecord,
  individuals: StoredIndividual[],
  records: StoredRecord[],
): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];

  for (const individual of individuals) {
    const latest = getLatestRecordForIndividual(individual.id, records);
    const score = computeMatchScore(record, individual, latest);

    if (score <= 0) {
      continue;
    }

    candidates.push({
      individual,
      latestRecord: latest,
      score,
    });
  }

  return candidates.sort((a, b) => b.score - a.score);
}

function determineDateBucket(records: StoredRecord[]): "day" | "week" {
  if (records.length < 2) {
    return "day";
  }

  const timestamps = records
    .map((record) => new Date(record.createdAt).getTime())
    .filter((time) => Number.isFinite(time));

  if (timestamps.length < 2) {
    return "day";
  }

  const earliest = Math.min(...timestamps);
  const latest = Math.max(...timestamps);
  const diffDays = Math.abs(latest - earliest) / (1000 * 60 * 60 * 24);

  return diffDays > 14 ? "week" : "day";
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (char === "\"") {
      if (inQuotes && content[index + 1] === "\"") {
        field += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && content[index + 1] === "\n") {
        index += 1;
      }

      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0 || inQuotes) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((record) => record.some((cell) => cell.trim().length > 0));
}

export function initializeRecordsPage(): void {
  const elements = getRecordsElements();

  if (!elements) {
    return;
  }

  const {
    htmlInput,
    jsonOutput,
    jsonEditor,
    jsonEditButton,
    jsonApplyButton,
    jsonCancelButton,
    errorBox,
    confidenceList,
    toggleSourcesButton,
    reextractButton,
    clearInputButton,
    previewFrame,
    provenanceCount,
    sampleChipContainer,
    autoExtractToggle,
    charCount,
    lastRunStatus,
    lastRunFooter,
    saveForm,
    saveModeNew,
    saveModeExisting,
    newIndividualInput,
    existingIndividualSelect,
    saveButton,
    saveFeedback,
    matchSuggestions,
    matchSuggestionsList,
    clearRecordsButton,
    savedRecordsContainer,
    recordsFiltersForm,
    filterIndividualSelect,
    filterLinkStatusSelect,
    filterRoleSelect,
    filterStartDateInput,
    filterEndDateInput,
    filterConfidenceInput,
    filterConfidenceOutput,
    recordsTimeline,
    workspaceSearchForm,
    workspaceSearchInput,
    workspaceSearchClear,
    openImportModalButton,
    loadNextImportButton,
    processImportQueueButton,
    importQueueStatus,
    importQueueProgress,
    importModal,
    importModalBackdrop,
    importModalClose,
    importModalForm,
    importModalFileInput,
    importModalColumnSelect,
    importModalPreview,
    importModalFeedback,
    importModalSubmit,
    importModalCancel,
  } = elements;

  let latestState = getState();
  let currentRecord: IndividualRecord | null = null;
  let lastHighlightDocument = "";
  let showingSources = false;
  let suggestedName = "";
  let isJsonEditing = false;
  let autoExtractEnabled = true;
  let pendingExtraction: number | null = null;
  let lastExtractionTimestamp: string | null = null;
  let currentFilters: RecordFilterCriteria = { ...DEFAULT_FILTERS };
  let importQueue: ImportQueueItem[] = [];
  let importColumnLabel = "";
  let importData: CsvImportData | null = null;
  let activeImportItem: ImportQueueItem | null = null;
  let isProcessingImportQueue = false;
  let importQueueTotal = 0;
  let importQueueProcessed = 0;
  let isApplyingAutoMatch = false;

  const maybeSearchHandle = initializeWorkspaceSearch({
    elements: {
      form: workspaceSearchForm ?? undefined,
      input: workspaceSearchInput,
      clearButton: workspaceSearchClear ?? undefined,
    },
    onInput: () => {
      applyFilters(readFiltersFromControls());
    },
    onSubmit: () => {
      applyFilters(readFiltersFromControls());
    },
  });

  if (!maybeSearchHandle) {
    return;
  }

  const searchHandle = maybeSearchHandle;

  matchSuggestionsList.addEventListener("change", handleMatchSuggestionChange);
  existingIndividualSelect.addEventListener("change", () => {
    renderMatchSuggestions(currentRecord);
  });

  openImportModalButton.addEventListener("click", () => {
    openImportModal();
  });

  importModalClose.addEventListener("click", () => {
    closeImportModal();
  });

  importModalCancel.addEventListener("click", () => {
    closeImportModal();
  });

  importModalBackdrop.addEventListener("click", () => {
    closeImportModal();
  });

  importModalFileInput.addEventListener("change", () => {
    void handleImportFileChange();
  });

  importModalColumnSelect.addEventListener("change", () => {
    handleImportColumnChange();
  });

  importModalForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleImportSubmit();
  });

  loadNextImportButton.addEventListener("click", () => {
    if (isProcessingImportQueue) {
      setFeedback("Import queue is currently processing. Please wait.");
      return;
    }

    if (!importQueue.length) {
      setFeedback("No pending CSV imports.");
      updateImportQueueStatus();
      return;
    }

    const next = importQueue.shift();

    if (!next) {
      updateImportQueueStatus();
      return;
    }

    applyImportItem(next, importQueue.length);
  });

  processImportQueueButton.addEventListener("click", () => {
    void processImportQueue();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !importModal.hidden) {
      closeImportModal();
    }
  });

  jsonEditButton.addEventListener("click", () => {
    startJsonEditing();
  });

  jsonCancelButton.addEventListener("click", () => {
    cancelJsonEditing();

    if (currentRecord) {
      renderJsonRecord(currentRecord);
    } else {
      resetOutputs();
    }
  });

  jsonApplyButton.addEventListener("click", () => {
    applyJsonEdits();
  });

  jsonEditor.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      applyJsonEdits();
    }
  });

  updateImportQueueStatus();

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

  function setFeedback(message: string): void {
    saveFeedback.textContent = message;
  }

  function updateImportQueueStatus(): void {
    const queued = importQueue.length + (activeImportItem ? 1 : 0);
    const hasQueuedItems = queued > 0;

    if (isProcessingImportQueue) {
      importQueueStatus.hidden = false;
      if (importQueueTotal > 0) {
        const currentStep = Math.min(importQueueProcessed + 1, importQueueTotal);
        importQueueStatus.textContent = `Processing CSV import (${currentStep} of ${importQueueTotal})`;
        importQueueProgress.hidden = false;
        const processedCount = Math.min(importQueueProcessed, importQueueTotal);
        importQueueProgress.textContent = `Saved ${processedCount.toLocaleString()} / ${importQueueTotal.toLocaleString()}`;
      } else {
        importQueueStatus.textContent = "Processing CSV import…";
        importQueueProgress.hidden = true;
        importQueueProgress.textContent = "";
      }
    } else if (hasQueuedItems) {
      importQueueStatus.hidden = false;
      importQueueStatus.textContent = `${queued.toLocaleString()} CSV row${queued === 1 ? "" : "s"} queued`;
      importQueueProgress.hidden = true;
      importQueueProgress.textContent = "";
    } else {
      importQueueStatus.hidden = true;
      importQueueStatus.textContent = "";
      importQueueProgress.hidden = true;
      importQueueProgress.textContent = "";
    }

    loadNextImportButton.hidden = !hasQueuedItems;
    loadNextImportButton.disabled = !hasQueuedItems || isProcessingImportQueue;
    processImportQueueButton.hidden = !hasQueuedItems;
    processImportQueueButton.disabled = !hasQueuedItems || isProcessingImportQueue;
    openImportModalButton.disabled = isProcessingImportQueue;
  }

  function createColumnPlaceholderOption(): HTMLOptionElement {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Select a column…";
    return option;
  }

  function setImportModalFeedback(message: string, isError = false): void {
    importModalFeedback.textContent = message;
    importModalFeedback.hidden = message.trim().length === 0;
    importModalFeedback.classList.toggle("error", isError);
  }

  function renderImportPreview(data: CsvImportData | null): void {
    importModalPreview.replaceChildren();

    if (!data) {
      const hint = document.createElement("p");
      hint.className = "supporting-text import-preview-empty";
      hint.textContent = "Select a CSV file to preview the first five rows.";
      importModalPreview.appendChild(hint);
      return;
    }

    if (!data.headers.length || !data.rows.length) {
      const empty = document.createElement("p");
      empty.className = "supporting-text import-preview-empty";
      empty.textContent = "No data rows found in the selected CSV.";
      importModalPreview.appendChild(empty);
      return;
    }

    const table = document.createElement("table");
    table.className = "data-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");

    for (const header of data.headers) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = header;
      headRow.appendChild(th);
    }

    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    for (const row of data.rows.slice(0, 5)) {
      const tr = document.createElement("tr");

      for (const cell of row.cells) {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    importModalPreview.appendChild(table);
  }

  function resetImportModalState(): void {
    importData = null;
    importModalForm.reset();
    importModalFileInput.value = "";
    importModalColumnSelect.replaceChildren(createColumnPlaceholderOption());
    importModalColumnSelect.disabled = true;
    importModalSubmit.disabled = true;
    setImportModalFeedback("");
    renderImportPreview(null);
  }

  function openImportModal(): void {
    resetImportModalState();
    importModal.hidden = false;
    importModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    window.setTimeout(() => {
      importModalFileInput.focus();
    }, 0);
  }

  function closeImportModal(): void {
    importModal.hidden = true;
    importModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    resetImportModalState();
  }

  async function handleImportFileChange(): Promise<void> {
    importModalColumnSelect.replaceChildren(createColumnPlaceholderOption());
    importModalColumnSelect.disabled = true;
    importModalSubmit.disabled = true;
    setImportModalFeedback("");

    const file = importModalFileInput.files && importModalFileInput.files[0];

    if (!file) {
      renderImportPreview(null);
      return;
    }

    try {
      const text = (await file.text()).replace(/^\ufeff/, "");
      const parsed = parseCsv(text);

      if (!parsed.length) {
        importData = { headers: [], rows: [] };
        renderImportPreview(importData);
        setImportModalFeedback("The selected CSV file is empty.", true);
        return;
      }

      const columnCount = parsed.reduce((max, row) => Math.max(max, row.length), 0);

      if (!columnCount) {
        importData = { headers: [], rows: [] };
        renderImportPreview(importData);
        setImportModalFeedback("No columns were detected in the selected CSV.", true);
        return;
      }

      const headerSource = parsed[0] ?? [];
      const headers = Array.from({ length: columnCount }, (_, index) => {
        const raw = headerSource[index] ?? "";
        const trimmed = raw.trim();
        return trimmed || `Column ${index + 1}`;
      });

      const rows: CsvImportRow[] = parsed
        .slice(1)
        .map((cells, rowIndex) => ({
          index: rowIndex + 1,
          cells: Array.from({ length: columnCount }, (_, columnIndex) => cells[columnIndex] ?? ""),
        }))
        .filter((row) => row.cells.some((cell) => cell.trim().length > 0));

      importData = { headers, rows };
      renderImportPreview(importData);

      if (!rows.length) {
        setImportModalFeedback("No data rows found in the selected CSV.", true);
        return;
      }

      const options = headers.map((header, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = header;
        return option;
      });

      importModalColumnSelect.replaceChildren(createColumnPlaceholderOption(), ...options);
      importModalColumnSelect.disabled = false;
      setImportModalFeedback(
        "Previewing the first five rows. Select the column that contains HTML to continue."
      );
    } catch (error) {
      console.error("Failed to read CSV file", error);
      importData = { headers: [], rows: [] };
      renderImportPreview(importData);
      setImportModalFeedback("Unable to read the selected CSV file.", true);
    }
  }

  function handleImportColumnChange(): void {
    if (!importData) {
      importModalSubmit.disabled = true;
      setImportModalFeedback("Select a CSV file to preview before choosing a column.", true);
      return;
    }

    const value = importModalColumnSelect.value;

    if (!value) {
      importModalSubmit.disabled = true;
      setImportModalFeedback("Choose which column includes the HTML snippets to import.");
      return;
    }

    const columnIndex = Number.parseInt(value, 10);

    if (Number.isNaN(columnIndex)) {
      importModalSubmit.disabled = true;
      setImportModalFeedback("Select a valid column to continue.", true);
      return;
    }

    const columnName = importData.headers[columnIndex] ?? `Column ${columnIndex + 1}`;
    const matchingRows = importData.rows.filter((row) => (row.cells[columnIndex] ?? "").trim().length > 0);

    if (!matchingRows.length) {
      importModalSubmit.disabled = true;
      setImportModalFeedback(`No HTML content detected in ${columnName}.`, true);
      return;
    }

    importModalSubmit.disabled = false;
    setImportModalFeedback(
      `Found ${matchingRows.length.toLocaleString()} row${matchingRows.length === 1 ? "" : "s"} with HTML in ${columnName}.`
    );
  }

  function handleImportSubmit(): void {
    if (!importData) {
      setImportModalFeedback("Select a CSV file to import before queuing records.", true);
      return;
    }

    const value = importModalColumnSelect.value;

    if (!value) {
      setImportModalFeedback("Choose a column that contains the HTML to import.", true);
      return;
    }

    const columnIndex = Number.parseInt(value, 10);

    if (Number.isNaN(columnIndex)) {
      setImportModalFeedback("Select a valid column to continue.", true);
      return;
    }

    const columnName = importData.headers[columnIndex] ?? `Column ${columnIndex + 1}`;
    const htmlRows = importData.rows
      .map<ImportQueueItem>((row) => ({
        html: row.cells[columnIndex] ?? "",
        rowIndex: row.index,
      }))
      .filter((item) => item.html.trim().length > 0);

    if (!htmlRows.length) {
      setImportModalFeedback(`No HTML content detected in ${columnName}.`, true);
      return;
    }

    const [first, ...remaining] = htmlRows;
    importQueue = remaining;
    importColumnLabel = columnName;
    importQueueTotal = htmlRows.length;
    importQueueProcessed = 0;
    isProcessingImportQueue = false;
    closeImportModal();
    applyImportItem(first, importQueue.length);
  }

  function applyImportItem(item: ImportQueueItem, remaining: number): void {
    activeImportItem = item;
    htmlInput.value = item.html;
    htmlInput.focus();
    showingSources = false;
    toggleSourcesButton.textContent = "Highlight sources";
    toggleSourcesButton.disabled = true;
    previewFrame.hidden = true;
    previewFrame.srcdoc = "";
    lastHighlightDocument = "";
    provenanceCount.hidden = true;
    provenanceCount.textContent = "";

    if (pendingExtraction !== null) {
      window.clearTimeout(pendingExtraction);
      pendingExtraction = null;
    }

    updateCharCount();

    const columnLabel = importColumnLabel || "the selected column";
    const remainingMessage =
      remaining > 0
        ? `${remaining.toLocaleString()} row${remaining === 1 ? "" : "s"} remaining.`
        : "No more rows remaining.";

    if (autoExtractEnabled) {
      runExtraction({ trigger: "import", label: `CSV row ${item.rowIndex}` });
      setFeedback(`CSV row ${item.rowIndex} imported from ${columnLabel}. ${remainingMessage}`);
    } else {
      updateRunButtonState();
      setFeedback(`CSV row ${item.rowIndex} loaded from ${columnLabel}. ${remainingMessage} Run extract to process.`);
    }

    updateImportQueueStatus();

    if (remaining === 0) {
      importColumnLabel = "";
    }
  }

  async function processImportQueue(): Promise<void> {
    if (isProcessingImportQueue) {
      return;
    }

    const totalRemaining = importQueue.length + (activeImportItem ? 1 : 0);

    if (totalRemaining === 0) {
      setFeedback("No pending CSV imports.");
      updateImportQueueStatus();
      return;
    }

    const columnLabel = importColumnLabel || "the selected column";
    isProcessingImportQueue = true;
    importQueueTotal = totalRemaining;
    importQueueProcessed = 0;
    updateImportQueueStatus();

    const previousHtmlDisabled = htmlInput.disabled;
    const previousAutoExtractDisabled = autoExtractToggle.disabled;

    htmlInput.disabled = true;
    clearInputButton.disabled = true;
    reextractButton.disabled = true;
    toggleSourcesButton.disabled = true;
    autoExtractToggle.disabled = true;

    let completed = false;

    try {
      if (activeImportItem) {
        const success = await processQueueItem(activeImportItem, importQueue.length);
        if (!success) {
          return;
        }
        importQueueProcessed += 1;
        updateImportQueueStatus();
      }

      while (importQueue.length > 0) {
        const next = importQueue.shift();

        if (!next) {
          continue;
        }

        const success = await processQueueItem(next, importQueue.length);

        if (!success) {
          importQueue.unshift(next);
          return;
        }

        importQueueProcessed += 1;
        updateImportQueueStatus();
      }

      completed = true;
      activeImportItem = null;
      setFeedback(
        `Processed ${totalRemaining.toLocaleString()} CSV row${totalRemaining === 1 ? "" : "s"} from ${columnLabel}.`,
      );
    } catch (error) {
      console.error("Failed to process import queue", error);
      setFeedback("Unable to process the import queue. Review the last row and try again.");
    } finally {
      htmlInput.disabled = previousHtmlDisabled;
      autoExtractToggle.disabled = previousAutoExtractDisabled;
      updateCharCount();
      updateRunButtonState();
      toggleSourcesButton.disabled = !currentRecord;
      toggleSourcesButton.textContent = showingSources ? "Hide sources" : "Highlight sources";
      isProcessingImportQueue = false;
      updateImportQueueStatus();
      updateSavePanel();

      if (completed) {
        importQueueTotal = 0;
        importQueueProcessed = 0;
        importQueue = [];
        importColumnLabel = "";
      }
    }
  }

  async function processQueueItem(item: ImportQueueItem, remaining: number): Promise<boolean> {
    try {
      applyImportItem(item, remaining);
      clearInputButton.disabled = true;
      reextractButton.disabled = true;
      toggleSourcesButton.disabled = true;

      if (!autoExtractEnabled) {
        runExtraction({ trigger: "import", label: `CSV row ${item.rowIndex}` });
      }

      clearInputButton.disabled = true;
      reextractButton.disabled = true;
      toggleSourcesButton.disabled = true;

      if (!currentRecord) {
        setFeedback(`Extraction failed for CSV row ${item.rowIndex}. Processing paused.`);
        return false;
      }

      await persistCurrentRecordForImport(item.rowIndex);
      return true;
    } catch (error) {
      console.error(`Failed to process CSV row ${item.rowIndex}`, error);
      setFeedback(`Unable to process CSV row ${item.rowIndex}. Processing paused.`);
      return false;
    }
  }

  async function persistCurrentRecordForImport(rowIndex: number): Promise<void> {
    if (!currentRecord) {
      throw new Error("No record available to save.");
    }

    let individualId: string | null = null;
    let individualName = "";
    let createdNewIndividual = false;

    if (isProcessingImportQueue) {
      const [topCandidate] = buildMatchCandidates(
        currentRecord,
        latestState.individuals,
        latestState.records,
      );

      if (topCandidate && topCandidate.score >= AUTO_MATCH_THRESHOLD) {
        individualId = topCandidate.individual.id;
        individualName = topCandidate.individual.name;
      }
    } else if (saveModeExisting.checked && !saveModeExisting.disabled) {
      const selected = existingIndividualSelect.value;

      if (selected) {
        individualId = selected;
        const existing = latestState.individuals.find((item) => item.id === selected);
        individualName = existing ? existing.name : "selected individual";
      }
    }

    if (!individualId) {
      const providedName = newIndividualInput.value.trim();
      const preferredName = providedName || suggestedName || getSuggestedIndividualName(currentRecord);
      const fallbackName = preferredName || `Imported individual ${rowIndex}`;
      const individual = await createIndividual(fallbackName);
      individualId = individual.id;
      individualName = individual.name;
      newIndividualInput.value = "";
      latestState = getState();
      createdNewIndividual = true;
    }

    const resolvedIndividualId = individualId ?? "";

    if (!resolvedIndividualId) {
      throw new Error("Unable to determine individual for import.");
    }

    const summary = getRecordSummary(currentRecord);
    await createRecord({ individualId: resolvedIndividualId, summary, record: currentRecord });
    latestState = getState();

    if (saveModeNew.checked) {
      saveModeExisting.checked = true;
      saveModeNew.checked = false;
    }

    existingIndividualSelect.value = resolvedIndividualId;
    if (createdNewIndividual) {
      setFeedback(`Created individual ${individualName} and saved CSV row ${rowIndex}.`);
    } else {
      setFeedback(`Saved CSV row ${rowIndex} for ${individualName}.`);
    }

    updateSavePanel();
  }
  function updateCharCount(): void {
    const length = htmlInput.value.length;
    const label = length === 1 ? "character" : "characters";
    charCount.textContent = `${length.toLocaleString()} ${label}`;
    clearInputButton.disabled = length === 0;
  }

  function updateRunButtonState(): void {
    if (autoExtractEnabled) {
      reextractButton.disabled = true;
    } else {
      reextractButton.disabled = htmlInput.value.trim().length === 0;
    }
  }

  function updateLastRunStatus(timestamp: string | null): void {
    if (!timestamp) {
      lastRunStatus.textContent = "Last extracted — never";
      lastRunFooter.textContent = "Never";
      lastRunFooter.dateTime = "";
      return;
    }

    const formatted = formatTimestamp(timestamp);
    lastRunStatus.textContent = `Last extracted — ${formatted}`;
    lastRunFooter.textContent = formatted;
    lastRunFooter.dateTime = timestamp;
  }

  function renderSampleChips(): void {
    sampleChipContainer.replaceChildren();

    for (const snippet of SAMPLE_SNIPPETS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "toolbar-chip";
      button.textContent = snippet.label;
      button.addEventListener("click", () => {
        applySample(snippet);
      });
      sampleChipContainer.appendChild(button);
    }
  }

  function setJsonEditing(active: boolean): void {
    if (isJsonEditing === active) {
      return;
    }

    isJsonEditing = active;
    jsonEditor.hidden = !active;
    jsonApplyButton.hidden = !active;
    jsonCancelButton.hidden = !active;
    jsonOutput.hidden = active;
    jsonEditButton.hidden = active;

    if (active) {
      jsonEditor.focus();
    }
  }

  function startJsonEditing(): void {
    if (!currentRecord) {
      setFeedback("Extract a record before editing JSON.");
      return;
    }

    jsonEditor.value = JSON.stringify(currentRecord, null, 2);
    setJsonEditing(true);
  }

  function cancelJsonEditing(): void {
    if (!isJsonEditing) {
      return;
    }

    setJsonEditing(false);
  }

  function applyJsonEdits(): void {
    if (!isJsonEditing) {
      return;
    }

    const trimmed = jsonEditor.value.trim();

    if (!trimmed) {
      setFeedback("Provide JSON before applying changes.");
      jsonEditor.focus();
      return;
    }

    try {
      const parsed = JSON.parse(trimmed);
      const record = IndividualRecordSchema.parse(parsed);
      currentRecord = record;

      setJsonEditing(false);
      renderJsonRecord(record);

      const scores = scoreConfidence(record);
      renderConfidence(record, scores);
      updateHighlight(record);

      suggestedName = getSuggestedIndividualName(record);
      if (saveModeNew.checked && !saveModeNew.disabled) {
        newIndividualInput.value = suggestedName;
      }

      renderMatchSuggestions(record);
      if (Array.isArray(record.provenance)) {
        provenanceCount.hidden = false;
        provenanceCount.textContent = `${record.provenance.length} provenance span${
          record.provenance.length === 1 ? "" : "s"
        }`;
      } else {
        provenanceCount.hidden = true;
        provenanceCount.textContent = "";
      }
      updateSavePanel();
      setFeedback("Updated record from edited JSON.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback(`Invalid JSON: ${message}`);
    }
  }

  function renderJsonRecord(record: IndividualRecord): void {
    const json = JSON.stringify(record, null, 2);
    jsonOutput.innerHTML = `<pre class="json-content">${highlightJson(json)}</pre>`;
    jsonOutput.dataset.empty = "false";
    jsonEditButton.disabled = false;
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

    if (record.birth.year !== undefined || record.birth.raw) {
      const birthDate = record.birth.raw || formatDateLabel(record.birth);
      rows.push({
        label: "Birth",
        value: birthDate,
        confidence: scores.birth,
      });
    }

    if (record.birth.place) {
      rows.push({
        label: "Birthplace",
        value: record.birth.place,
        confidence: scores.birthPlace,
      });
    }

    if (record.death.year !== undefined || record.death.raw) {
      const deathDate = record.death.raw || formatDateLabel(record.death);
      rows.push({
        label: "Death",
        value: deathDate,
        confidence: scores.death,
      });
    }

    if (record.death.place) {
      rows.push({
        label: "Death place",
        value: record.death.place,
        confidence: scores.deathPlace,
      });
    }

    if (record.parents.father || record.parents.mother) {
      rows.push({
        label: "Parents",
        value: [record.parents.father, record.parents.mother].filter(Boolean).join(" & "),
        confidence: scores.parents,
      });
    }

    if (record.spouses.length) {
      rows.push({
        label: "Spouses",
        value: record.spouses.join(", "),
        confidence: scores.spouses,
      });
    }

    if (record.children.length) {
      rows.push({
        label: "Children",
        value: record.children.join(", "),
        confidence: scores.children,
      });
    }

    if (record.occupation) {
      rows.push({
        label: "Occupation",
        value: record.occupation,
        confidence: scores.occupation,
      });
    }

    if (record.religion) {
      rows.push({
        label: "Religion",
        value: record.religion,
        confidence: scores.religion,
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

  function formatDateLabel(fragment: IndividualRecord["birth"]): string {
    const parts: string[] = [];

    if (fragment.year !== undefined) {
      parts.push(fragment.year.toString());
    }

    if (fragment.month !== undefined) {
      parts.push(fragment.month.toString().padStart(2, "0"));
    }

    if (fragment.day !== undefined) {
      parts.push(fragment.day.toString().padStart(2, "0"));
    }

    if (!parts.length) {
      return fragment.raw ?? "";
    }

    const label = parts.join("-");
    return fragment.approx ? `~${label}` : label;
  }

  function renderConfidence(record: IndividualRecord, scores: ConfidenceScores): void {
    const rows = buildFieldRows(record, scores);
    const averageElement = document.getElementById("metric-confidence-score");
    const confidenceValues = rows
      .map((row) => row.confidence)
      .filter((value): value is number => value !== undefined);

    if (averageElement) {
      if (confidenceValues.length) {
        const average = confidenceValues.reduce((total, value) => total + value, 0) / confidenceValues.length;
        averageElement.textContent = `${Math.round(average * 100)}%`;
      } else {
        averageElement.textContent = "—";
      }
    }

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

  function getIndividualLabel(individual: StoredIndividual): string {
    let label = individual.name;
    const latestRecord = getLatestRecordForIndividual(individual.id, latestState.records);

    if (latestRecord) {
      const birthDate = formatDate(latestRecord.record.birth);
      const deathDate = formatDate(latestRecord.record.death);
      const details: string[] = [];

      if (birthDate) {
        details.push(`b. ${birthDate}`);
      }

      if (deathDate) {
        details.push(`d. ${deathDate}`);
      }

      if (details.length) {
        label = `${individual.name} (${details.join(" – ")})`;
      }
    }

    const roleLabel = latestState.roles.find((role) => role.id === individual.roleId)?.label;
    if (roleLabel) {
      label = `${label} • ${roleLabel}`;
    }

    return label;
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
      option.textContent = getIndividualLabel(individual);

      if (individual.id === previousValue) {
        option.selected = true;
      }

      existingIndividualSelect.appendChild(option);
    }

    if (previousValue && existingIndividualSelect.value !== previousValue) {
      existingIndividualSelect.value = previousValue;
    }
  }

  function populateFilterOptions(
    individuals: StoredIndividual[],
    filters: RecordFilterCriteria,
  ): string {
    const desiredValue = filters.individualId;
    const sorted = [...individuals].sort((a, b) => a.name.localeCompare(b.name));
    const availableValues = new Set<string>();

    filterIndividualSelect.replaceChildren();

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All individuals";
    filterIndividualSelect.appendChild(allOption);
    availableValues.add(allOption.value);

    const unlinkedOption = document.createElement("option");
    unlinkedOption.value = UNLINKED_FILTER_VALUE;
    unlinkedOption.textContent = "Unlinked records";
    filterIndividualSelect.appendChild(unlinkedOption);
    availableValues.add(unlinkedOption.value);

    for (const individual of sorted) {
      const option = document.createElement("option");
      option.value = individual.id;
      option.textContent = getIndividualLabel(individual);
      filterIndividualSelect.appendChild(option);
      availableValues.add(option.value);
    }

    let nextValue = desiredValue;
    if (!availableValues.has(nextValue)) {
      nextValue = "";
    }

    filterIndividualSelect.value = nextValue;
    return nextValue;
  }

  function populateRoleFilterOptions(
    roles: StoredRoleDefinition[],
    desiredValue: string,
  ): string {
    const availableValues = new Set<string>();
    const sorted = [...roles].sort((a, b) => a.label.localeCompare(b.label));

    filterRoleSelect.replaceChildren();

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All roles";
    filterRoleSelect.appendChild(allOption);
    availableValues.add(allOption.value);

    const noRoleOption = document.createElement("option");
    noRoleOption.value = NO_ROLE_FILTER_VALUE;
    noRoleOption.textContent = "No role assigned";
    filterRoleSelect.appendChild(noRoleOption);
    availableValues.add(noRoleOption.value);

    for (const role of sorted) {
      const option = document.createElement("option");
      option.value = role.id;
      option.textContent = role.label;
      filterRoleSelect.appendChild(option);
      availableValues.add(option.value);
    }

    let nextValue = desiredValue;
    if (!availableValues.has(nextValue)) {
      nextValue = "";
    }

    filterRoleSelect.value = nextValue;
    return nextValue;
  }

  function createEmptyStateElement(state: "empty" | "no-matches"): HTMLElement {
    const container = document.createElement("div");
    container.className = "empty-state empty-state--records";
    container.dataset.state = state;

    const illustration = document.createElement("div");
    illustration.className = "empty-state-illustration";
    illustration.setAttribute("aria-hidden", "true");

    const title = document.createElement("p");
    title.className = "empty-state-title";

    const description = document.createElement("p");
    description.className = "empty-state-description";

    container.append(illustration, title, description);

    if (state === "empty") {
      title.textContent = "No records saved yet";
      description.textContent = "Extract a record and press \"Save record\" to build your timeline.";

      const cta = document.createElement("a");
      cta.className = "button-secondary";
      cta.href = "#html-input";
      cta.textContent = "Import HTML";
      container.append(cta);
    } else {
      title.textContent = "No matches found";
      description.textContent = "Adjust your filters to see more saved records.";

      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "button-secondary";
      reset.dataset.action = "reset-filters";
      reset.textContent = "Clear filters";
      container.append(reset);
    }

    return container;
  }

  function normalizeLinkStatus(value: string): LinkStatusFilter {
    if (value === "linked" || value === "unlinked") {
      return value;
    }
    return "all";
  }

  function readFiltersFromControls(): RecordFilterCriteria {
    const rawConfidence = Number(filterConfidenceInput.value);
    const normalizedConfidence = Number.isFinite(rawConfidence) ? rawConfidence / 100 : 0;

    return {
      search: workspaceSearchInput.value.trim(),
      individualId: filterIndividualSelect.value,
      linkStatus: normalizeLinkStatus(filterLinkStatusSelect.value),
      roleId: filterRoleSelect.value,
      startDate: filterStartDateInput.value,
      endDate: filterEndDateInput.value,
      minConfidence: Math.min(1, Math.max(0, normalizedConfidence)),
    };
  }

  function applyFilters(next: RecordFilterCriteria): void {
    currentFilters = next;
    renderSavedRecords(latestState, currentFilters);
  }

  function renderMatchSuggestions(record: IndividualRecord | null): void {
    if (
      !record ||
      latestState.individuals.length === 0 ||
      saveModeExisting.disabled
    ) {
      matchSuggestions.hidden = true;
      matchSuggestionsList.replaceChildren();
      return;
    }

    const candidates = buildMatchCandidates(record, latestState.individuals, latestState.records);
    const suggestions = candidates
      .filter((candidate) => candidate.score >= MATCH_SUGGESTION_THRESHOLD)
      .slice(0, MAX_MATCH_SUGGESTIONS);

    if (!suggestions.length) {
      matchSuggestions.hidden = true;
      matchSuggestionsList.replaceChildren();
      return;
    }

    const fragment = document.createDocumentFragment();
    const selectedId = existingIndividualSelect.value;

    for (const suggestion of suggestions) {
      const item = document.createElement("li");
      const label = document.createElement("label");
      label.className = "match-suggestion";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "match-suggestion";
      input.value = suggestion.individual.id;
      input.checked = suggestion.individual.id === selectedId;

      const details = document.createElement("div");
      details.className = "match-suggestion-details";

      const name = document.createElement("span");
      name.textContent = suggestion.individual.name;

      const score = document.createElement("span");
      score.className = "match-suggestion-score";
      score.textContent = `${Math.round(suggestion.score * 100)}% match`;

      details.append(name, score);

      const profileSource =
        suggestion.individual.profile.birth.year !== undefined ||
        suggestion.individual.profile.death.year !== undefined
          ? suggestion.individual.profile
          : suggestion.latestRecord?.record ?? suggestion.individual.profile;

      const metaParts: string[] = [];
      const lifespan = formatLifespan(profileSource);
      if (lifespan) {
        metaParts.push(lifespan);
      }

      if (suggestion.latestRecord) {
        metaParts.push(`Last saved ${formatTimestamp(suggestion.latestRecord.createdAt)}`);
      }

      if (metaParts.length) {
        const meta = document.createElement("span");
        meta.className = "match-suggestion-meta";
        meta.textContent = metaParts.join(" • ");
        details.appendChild(meta);
      }

      label.append(input, details);
      item.appendChild(label);
      fragment.appendChild(item);
    }

    matchSuggestionsList.replaceChildren(fragment);
    matchSuggestions.hidden = false;

    if (
      isProcessingImportQueue &&
      !isApplyingAutoMatch &&
      !saveModeExisting.disabled
    ) {
      const [topSuggestion] = suggestions;

      if (
        topSuggestion &&
        topSuggestion.score >= AUTO_MATCH_THRESHOLD &&
        existingIndividualSelect.value !== topSuggestion.individual.id
      ) {
        try {
          isApplyingAutoMatch = true;
          saveModeExisting.checked = true;
          saveModeNew.checked = false;
          existingIndividualSelect.value = topSuggestion.individual.id;
          updateSavePanel();
        } finally {
          isApplyingAutoMatch = false;
        }
      }
    }
  }

  function handleMatchSuggestionChange(event: Event): void {
    const target = event.target;

    if (!(target instanceof HTMLInputElement) || target.name !== "match-suggestion") {
      return;
    }

    if (!target.value || saveModeExisting.disabled) {
      return;
    }

    saveModeExisting.checked = true;
    saveModeNew.checked = false;
    existingIndividualSelect.value = target.value;
    updateSavePanel();
    existingIndividualSelect.focus();
  }

  function updateSavePanel(): void {
    const hasRecord = Boolean(currentRecord);
    const hasIndividuals = latestState.individuals.length > 0;

    saveButton.disabled = !hasRecord || isProcessingImportQueue;
    saveModeNew.disabled = !hasRecord || isProcessingImportQueue;
    jsonEditButton.disabled = !hasRecord || isProcessingImportQueue;

    if ((isProcessingImportQueue || !hasRecord) && isJsonEditing) {
      cancelJsonEditing();
    }

    const shouldDisableExisting = !hasRecord || !hasIndividuals || isProcessingImportQueue;
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
    } else if (newModeActive && currentRecord) {
      suggestedName = getSuggestedIndividualName(currentRecord);
      if (!newIndividualInput.value.trim() || newIndividualInput.value === suggestedName) {
        newIndividualInput.value = suggestedName;
      }
    }

    populateExistingIndividuals(latestState.individuals);
    renderMatchSuggestions(currentRecord);
  }

  function renderSavedRecords(
    state: ReturnType<typeof getState>,
    filters: RecordFilterCriteria,
  ): void {
    const recordCount = state.records.length;
    const individualCount = state.individuals.length;
    workspaceSearchInput.disabled = recordCount === 0;
    const navRecordCount = document.getElementById("nav-record-count");
    const navIndividualCount = document.getElementById("nav-individual-count");
    const recordMetric = document.getElementById("metric-record-count");

    if (navRecordCount) {
      navRecordCount.textContent = recordCount.toString();
    }

    if (navIndividualCount) {
      navIndividualCount.textContent = individualCount.toString();
    }

    if (recordMetric) {
      recordMetric.textContent = recordCount.toString();
    }

    const commandBar = document.querySelector<HTMLElement>(".command-bar");
    const individualMap = new Map(state.individuals.map((individual) => [individual.id, individual]));
    const roleLabelMap = new Map(state.roles.map((role) => [role.id, role.label]));
    const unlinkedCount = countUnlinkedRecords(state.records, individualMap);

    if (!recordCount) {
      recordsTimeline.replaceChildren(createEmptyStateElement("empty"));
      updateCommandBarSummary(commandBar, {
        total: 0,
        filtered: 0,
        unlinked: 0,
      });
      return;
    }

    const normalizedIndividualId = populateFilterOptions(state.individuals, filters);
    const normalizedRoleId = populateRoleFilterOptions(state.roles, filters.roleId);
    const normalizedLinkStatus = normalizeLinkStatus(filters.linkStatus);
    filterLinkStatusSelect.value = normalizedLinkStatus;

    const normalizedFilters: RecordFilterCriteria = {
      ...filters,
      individualId: normalizedIndividualId,
      roleId: normalizedRoleId,
      linkStatus: normalizedLinkStatus,
    };

    if (
      filters === currentFilters &&
      (normalizedIndividualId !== filters.individualId ||
        normalizedRoleId !== filters.roleId ||
        normalizedLinkStatus !== filters.linkStatus)
    ) {
      currentFilters = normalizedFilters;
    }

    searchHandle.setValue(normalizedFilters.search);
    filterRoleSelect.value = normalizedRoleId;
    filterStartDateInput.value = normalizedFilters.startDate;
    filterEndDateInput.value = normalizedFilters.endDate;

    const sliderValue = Math.round(normalizedFilters.minConfidence * 100);
    filterConfidenceInput.value = sliderValue.toString();
    filterConfidenceOutput.textContent = formatConfidenceOutput(normalizedFilters.minConfidence);

    const { records: filteredRecords, topConfidence } = filterRecordsByCriteria(
      state.records,
      individualMap,
      normalizedFilters,
      { roleLabels: roleLabelMap },
    );

    updateCommandBarSummary(commandBar, {
      total: recordCount,
      filtered: filteredRecords.length,
      unlinked: unlinkedCount,
    });

    if (!filteredRecords.length) {
      recordsTimeline.replaceChildren(createEmptyStateElement("no-matches"));
      return;
    }

    const bucket = determineDateBucket(filteredRecords);
    const groups = groupRecordsByDate(filteredRecords, bucket);
    const fragment = buildTimelineFragment(groups, individualMap, topConfidence);

    recordsTimeline.replaceChildren(fragment);
  }

  function resetOutputs(): void {
    cancelJsonEditing();
    jsonOutput.dataset.empty = "true";
    jsonOutput.textContent = "Paste HTML to see extracted fields.";
    jsonOutput.hidden = false;
    jsonEditor.value = "";
    jsonEditButton.disabled = true;
    jsonEditButton.hidden = false;
    jsonApplyButton.hidden = true;
    jsonCancelButton.hidden = true;
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
    const averageElement = document.getElementById("metric-confidence-score");
    if (averageElement) {
      averageElement.textContent = "—";
    }
    updateRunButtonState();
    updateCharCount();
  }

  function runExtraction(options: { trigger?: ExtractionTrigger; label?: string } = {}): void {
    const { trigger = autoExtractEnabled ? "auto" : "manual", label } = options;
    const value = htmlInput.value.trim();

    updateCharCount();

    if (!value) {
      resetOutputs();
      currentRecord = null;
      updateSavePanel();
      setFeedback("Paste HTML to extract a record.");
      return;
    }

    if (isJsonEditing) {
      cancelJsonEditing();
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

      updateRunButtonState();
      lastExtractionTimestamp = new Date().toISOString();
      updateLastRunStatus(lastExtractionTimestamp);
      updateSavePanel();

      const feedback = (() => {
        switch (trigger) {
          case "manual":
            return "Extraction refreshed manually.";
          case "sample":
            return label ? `Extracted sample snippet: ${label}.` : "Extracted sample snippet.";
          case "load":
            return label ? `Loaded record saved ${label}.` : "Loaded extraction from saved record.";
          case "reset":
            return "Starter sample extracted.";
          case "import":
            return label ? `Extracted CSV row: ${label}.` : "Extracted record from CSV import.";
          default:
            return "Extraction updated from pasted HTML.";
        }
      })();

      setFeedback(feedback);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      currentRecord = null;
      lastHighlightDocument = "";
      cancelJsonEditing();
      jsonOutput.dataset.empty = "true";
      jsonOutput.textContent = "Extraction failed.";
      jsonOutput.hidden = false;
      jsonEditor.value = "";
      jsonEditButton.disabled = true;
      jsonEditButton.hidden = false;
      jsonApplyButton.hidden = true;
      jsonCancelButton.hidden = true;
      errorBox.hidden = false;
      errorBox.textContent = message;
      confidenceList.replaceChildren();
      toggleSourcesButton.disabled = true;
      previewFrame.hidden = true;
      showingSources = false;
      toggleSourcesButton.textContent = "Highlight sources";
      provenanceCount.hidden = true;
      provenanceCount.textContent = "";
      updateRunButtonState();
      setFeedback("Extraction failed. Please review the source HTML.");
      updateSavePanel();
    }
  }

  function handleInput(): void {
    const value = htmlInput.value.trim();
    updateCharCount();

    if (pendingExtraction !== null) {
      window.clearTimeout(pendingExtraction);
      pendingExtraction = null;
    }

    if (!value) {
      resetOutputs();
      currentRecord = null;
      updateSavePanel();
      setFeedback("Paste HTML to extract a record.");
      return;
    }

    if (!autoExtractEnabled) {
      updateRunButtonState();
      setFeedback("Auto extraction paused. Use Run extract to update results.");
      return;
    }

    updateRunButtonState();

    pendingExtraction = window.setTimeout(() => {
      pendingExtraction = null;
      runExtraction({ trigger: "auto" });
    }, 350);
  }

  function applySample(snippet: SampleSnippet): void {
    htmlInput.value = snippet.html;
    htmlInput.focus();

    if (pendingExtraction !== null) {
      window.clearTimeout(pendingExtraction);
      pendingExtraction = null;
    }

    updateCharCount();

    if (autoExtractEnabled) {
      runExtraction({ trigger: "sample", label: snippet.label });
    } else {
      updateRunButtonState();
      setFeedback(`Sample snippet loaded: ${snippet.label}. Run extract to process.`);
    }
  }

  function toggleSources(): void {
    if (!lastHighlightDocument) {
      setFeedback("Run an extraction to enable source highlighting.");
      return;
    }

    showingSources = !showingSources;
    toggleSourcesButton.textContent = showingSources ? "Hide highlighted sources" : "Highlight sources";
    previewFrame.hidden = !showingSources;

    if (showingSources) {
      previewFrame.srcdoc = lastHighlightDocument;
    }

    setFeedback(showingSources ? "Showing highlighted sources." : "Source highlights hidden.");
  }

  async function handleRecordAction(event: MouseEvent): Promise<void> {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");

    if (!button) {
      return;
    }

    if (button.dataset.action === "reset-filters") {
      recordsFiltersForm.reset();
      searchHandle.setValue("");
      currentFilters = readFiltersFromControls();
      renderSavedRecords(latestState, currentFilters);
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
      showingSources = false;
      toggleSourcesButton.textContent = "Highlight sources";
      lastHighlightDocument = "";
      previewFrame.hidden = true;

      if (pendingExtraction !== null) {
        window.clearTimeout(pendingExtraction);
        pendingExtraction = null;
      }

      runExtraction({ trigger: "load", label: formatTimestamp(stored.createdAt) });
    } else if (button.dataset.action === "edit-record-summary") {
      const stored = latestState.records.find((record) => record.id === recordId);

      if (!stored) {
        return;
      }

      const defaultSummary = stored.summary || getRecordSummary(stored.record);
      const input = window.prompt("Update saved record title", defaultSummary);

      if (input === null) {
        return;
      }

      const trimmed = input.trim();

      if (trimmed === stored.summary) {
        return;
      }

      try {
        await updateRecord({ id: recordId, summary: trimmed });
        setFeedback("Updated record title.");
      } catch (error) {
        console.error("Failed to update record summary", error);
        setFeedback("Unable to update record.");
      }
    } else if (button.dataset.action === "delete-record") {
      const confirmDelete = window.confirm("Remove this saved record? This cannot be undone.");

      if (confirmDelete) {
        try {
          await deleteRecord(recordId);
          setFeedback("Removed saved record.");
        } catch (error) {
          console.error("Failed to delete record", error);
          setFeedback("Unable to remove record.");
        }
      }
    }
  }

  renderSampleChips();
  updateLastRunStatus(lastExtractionTimestamp);
  updateRunButtonState();
  updateCharCount();

  htmlInput.addEventListener("input", handleInput);
  toggleSourcesButton.addEventListener("click", toggleSources);
  reextractButton.addEventListener("click", () => {
    runExtraction({ trigger: "manual" });
  });

  autoExtractToggle.addEventListener("change", () => {
    autoExtractEnabled = autoExtractToggle.checked;

    if (pendingExtraction !== null) {
      window.clearTimeout(pendingExtraction);
      pendingExtraction = null;
    }

    updateRunButtonState();

    if (autoExtractEnabled) {
      setFeedback("Auto extraction enabled.");
      if (htmlInput.value.trim()) {
        runExtraction({ trigger: "auto" });
      }
    } else {
      setFeedback("Auto extraction paused. Use Run extract to update results.");
    }
  });

  clearInputButton.addEventListener("click", () => {
    if (pendingExtraction !== null) {
      window.clearTimeout(pendingExtraction);
      pendingExtraction = null;
    }

    htmlInput.value = "";
    handleInput();
    setFeedback("Cleared source input.");
  });

  savedRecordsContainer.addEventListener("click", (event) => {
    void handleRecordAction(event as MouseEvent);
  });

  clearRecordsButton.addEventListener("click", async () => {
    if (!latestState.records.length) {
      return;
    }

    const shouldClear = window.confirm("Remove all saved records? Individuals will be kept.");

    if (shouldClear) {
      try {
        await clearRecords();
        setFeedback("Cleared all saved records.");
      } catch (error) {
        console.error("Failed to clear saved records", error);
        setFeedback("Unable to clear saved records.");
      }
    }
  });

  saveModeNew.addEventListener("change", updateSavePanel);
  saveModeExisting.addEventListener("change", updateSavePanel);

  recordsFiltersForm.addEventListener("reset", () => {
    window.setTimeout(() => {
      searchHandle.setValue("");
      applyFilters(readFiltersFromControls());
    }, 0);
  });

  recordsFiltersForm.addEventListener("input", () => {
    applyFilters(readFiltersFromControls());
  });

  recordsFiltersForm.addEventListener("submit", (event) => {
    event.preventDefault();
    applyFilters(readFiltersFromControls());
  });

  saveForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentRecord) {
      setFeedback("Extract a record before saving.");
      return;
    }

    let individualId: string | null = null;
    let individualName = "";

    try {
      if (saveModeNew.checked && !saveModeNew.disabled) {
        const providedName = newIndividualInput.value.trim() || suggestedName;

        if (!providedName) {
          setFeedback("Provide a name for the new individual.");
          newIndividualInput.focus();
          return;
        }

        const individual = await createIndividual(providedName);
        individualId = individual.id;
        individualName = individual.name;
        newIndividualInput.value = "";
      } else if (saveModeExisting.checked && !saveModeExisting.disabled) {
        const selected = existingIndividualSelect.value;

        if (!selected) {
          setFeedback("Choose an individual to link.");
          existingIndividualSelect.focus();
          return;
        }

        individualId = selected;
        const individual = latestState.individuals.find((item) => item.id === selected);
        individualName = individual ? individual.name : "selected individual";
      } else {
        setFeedback("Select how you want to link this record.");
        return;
      }

      if (!individualId) {
        return;
      }

      const summary = getRecordSummary(currentRecord);
      await createRecord({ individualId, summary, record: currentRecord });
      setFeedback(`Saved record for ${individualName}.`);

      if (saveModeNew.checked) {
        saveModeExisting.checked = true;
        saveModeNew.checked = false;
      }

      updateSavePanel();
    } catch (error) {
      console.error("Failed to save record", error);
      setFeedback("Unable to save record. Please try again.");
    }
  });

  currentFilters = readFiltersFromControls();

  subscribe((state) => {
    latestState = state;
    renderSavedRecords(state, currentFilters);
    updateSavePanel();
  });

  function resetApplication(): void {
    autoExtractEnabled = true;
    autoExtractToggle.checked = true;

    if (pendingExtraction !== null) {
      window.clearTimeout(pendingExtraction);
      pendingExtraction = null;
    }

    htmlInput.value = DEFAULT_HTML;
    runExtraction({ trigger: "reset" });
  }

  resetApplication();
}

function getRecordsElements(): RecordsElements | null {
  const htmlInput = document.getElementById("html-input");
  const jsonOutput = document.getElementById("json-output");
  const jsonEditor = document.getElementById("json-editor");
  const jsonEditButton = document.getElementById("edit-json-button");
  const jsonApplyButton = document.getElementById("apply-json-button");
  const jsonCancelButton = document.getElementById("cancel-json-button");
  const errorBox = document.getElementById("error");
  const confidenceList = document.getElementById("confidence");
  const toggleSourcesButton = document.getElementById("toggle-sources");
  const reextractButton = document.getElementById("reextract");
  const clearInputButton = document.getElementById("clear-input");
  const previewFrame = document.getElementById("source-preview");
  const provenanceCount = document.getElementById("provenance-count");
  const sampleChipContainer = document.getElementById("sample-chip-row");
  const autoExtractToggle = document.getElementById("auto-extract");
  const charCount = document.getElementById("char-count");
  const lastRunStatus = document.getElementById("last-run");
  const lastRunFooter = document.getElementById("last-run-footer");
  const saveForm = document.getElementById("save-form");
  const saveModeNew = document.getElementById("save-mode-new");
  const saveModeExisting = document.getElementById("save-mode-existing");
  const newIndividualInput = document.getElementById("new-individual-name");
  const existingIndividualSelect = document.getElementById("existing-individual-select");
  const saveButton = document.getElementById("save-button");
  const saveFeedback = document.getElementById("save-feedback");
  const matchSuggestions = document.getElementById("match-suggestions");
  const matchSuggestionsList = document.getElementById("match-suggestions-list");
  const clearRecordsButton = document.getElementById("clear-records");
  const savedRecordsContainer = document.getElementById("saved-records");
  const recordsFiltersForm = document.getElementById("records-filters");
  const filterIndividualSelect = document.getElementById("filter-individual");
  const filterLinkStatusSelect = document.getElementById("filter-link-status");
  const filterRoleSelect = document.getElementById("filter-role");
  const filterStartDateInput = document.getElementById("filter-start-date");
  const filterEndDateInput = document.getElementById("filter-end-date");
  const filterConfidenceInput = document.getElementById("filter-confidence");
  const filterConfidenceOutput = document.getElementById("filter-confidence-value");
  const recordsTimeline = document.getElementById("records-timeline");
  const workspaceSearchForm = document.getElementById("workspace-search-form");
  const workspaceSearchInput = document.getElementById("workspace-search");
  const workspaceSearchClear = document.getElementById("workspace-search-clear");
  const openImportModalButton = document.getElementById("open-import-modal");
  const loadNextImportButton = document.getElementById("load-next-import");
  const processImportQueueButton = document.getElementById("process-import-queue");
  const importQueueStatus = document.getElementById("import-queue-status");
  const importQueueProgress = document.getElementById("import-queue-progress");
  const importModal = document.getElementById("csv-import-modal");
  const importModalBackdrop = document.getElementById("csv-import-backdrop");
  const importModalClose = document.getElementById("close-import-modal");
  const importModalForm = document.getElementById("csv-import-form");
  const importModalFileInput = document.getElementById("csv-import-file");
  const importModalColumnSelect = document.getElementById("csv-import-column");
  const importModalPreview = document.getElementById("csv-import-preview");
  const importModalFeedback = document.getElementById("csv-import-feedback");
  const importModalSubmit = document.getElementById("csv-import-submit");
  const importModalCancel = document.getElementById("csv-import-cancel");

  if (
    !(
      htmlInput instanceof HTMLTextAreaElement &&
      jsonOutput instanceof HTMLDivElement &&
      jsonEditor instanceof HTMLTextAreaElement &&
      jsonEditButton instanceof HTMLButtonElement &&
      jsonApplyButton instanceof HTMLButtonElement &&
      jsonCancelButton instanceof HTMLButtonElement &&
      errorBox instanceof HTMLDivElement &&
      confidenceList instanceof HTMLDivElement &&
      toggleSourcesButton instanceof HTMLButtonElement &&
      reextractButton instanceof HTMLButtonElement &&
      clearInputButton instanceof HTMLButtonElement &&
      previewFrame instanceof HTMLIFrameElement &&
      provenanceCount instanceof HTMLSpanElement &&
      sampleChipContainer instanceof HTMLDivElement &&
      autoExtractToggle instanceof HTMLInputElement &&
      charCount instanceof HTMLSpanElement &&
      lastRunStatus instanceof HTMLSpanElement &&
      lastRunFooter instanceof HTMLTimeElement &&
      saveForm instanceof HTMLFormElement &&
      saveModeNew instanceof HTMLInputElement &&
      saveModeExisting instanceof HTMLInputElement &&
      newIndividualInput instanceof HTMLInputElement &&
      existingIndividualSelect instanceof HTMLSelectElement &&
      saveButton instanceof HTMLButtonElement &&
      saveFeedback instanceof HTMLSpanElement &&
      matchSuggestions instanceof HTMLDivElement &&
      matchSuggestionsList instanceof HTMLUListElement &&
      clearRecordsButton instanceof HTMLButtonElement &&
      savedRecordsContainer instanceof HTMLDivElement &&
      recordsFiltersForm instanceof HTMLFormElement &&
      filterIndividualSelect instanceof HTMLSelectElement &&
      filterLinkStatusSelect instanceof HTMLSelectElement &&
      filterRoleSelect instanceof HTMLSelectElement &&
      filterStartDateInput instanceof HTMLInputElement &&
      filterEndDateInput instanceof HTMLInputElement &&
      filterConfidenceInput instanceof HTMLInputElement &&
      filterConfidenceOutput instanceof HTMLOutputElement &&
      recordsTimeline instanceof HTMLDivElement &&
      workspaceSearchInput instanceof HTMLInputElement &&
      openImportModalButton instanceof HTMLButtonElement &&
      loadNextImportButton instanceof HTMLButtonElement &&
      processImportQueueButton instanceof HTMLButtonElement &&
      importQueueStatus instanceof HTMLSpanElement &&
      importQueueProgress instanceof HTMLSpanElement &&
      importModal instanceof HTMLDivElement &&
      importModalBackdrop instanceof HTMLDivElement &&
      importModalClose instanceof HTMLButtonElement &&
      importModalForm instanceof HTMLFormElement &&
      importModalFileInput instanceof HTMLInputElement &&
      importModalColumnSelect instanceof HTMLSelectElement &&
      importModalPreview instanceof HTMLDivElement &&
      importModalFeedback instanceof HTMLParagraphElement &&
      importModalSubmit instanceof HTMLButtonElement &&
      importModalCancel instanceof HTMLButtonElement
    )
  ) {
    return null;
  }

  return {
    htmlInput,
    jsonOutput,
    jsonEditor,
    jsonEditButton,
    jsonApplyButton,
    jsonCancelButton,
    errorBox,
    confidenceList,
    toggleSourcesButton,
    reextractButton,
    clearInputButton,
    previewFrame,
    provenanceCount,
    sampleChipContainer,
    autoExtractToggle,
    charCount,
    lastRunStatus,
    lastRunFooter,
    saveForm,
    saveModeNew,
    saveModeExisting,
    newIndividualInput,
    existingIndividualSelect,
    saveButton,
    saveFeedback,
    matchSuggestions,
    matchSuggestionsList,
    clearRecordsButton,
    savedRecordsContainer,
    recordsFiltersForm,
    filterIndividualSelect,
    filterLinkStatusSelect,
    filterRoleSelect,
    filterStartDateInput,
    filterEndDateInput,
    filterConfidenceInput,
    filterConfidenceOutput,
    recordsTimeline,
    workspaceSearchForm: workspaceSearchForm instanceof HTMLFormElement ? workspaceSearchForm : null,
    workspaceSearchInput,
    workspaceSearchClear:
      workspaceSearchClear instanceof HTMLButtonElement ? workspaceSearchClear : null,
    openImportModalButton,
    loadNextImportButton,
    processImportQueueButton,
    importQueueStatus,
    importQueueProgress,
    importModal,
    importModalBackdrop,
    importModalClose,
    importModalForm,
    importModalFileInput,
    importModalColumnSelect,
    importModalPreview,
    importModalFeedback,
    importModalSubmit,
    importModalCancel,
  };
}

interface TimelineGroup {
  id: string;
  bucket: "day" | "week";
  start: Date | null;
  records: StoredRecord[];
}

interface CommandBarSummary {
  total: number;
  filtered: number;
  unlinked: number;
}

interface FilteredRecordsResult {
  records: StoredRecord[];
  topConfidence: Map<string, { field: string; value: number } | null>;
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function startOfWeek(date: Date): Date {
  const result = startOfDay(date);
  const day = result.getDay();
  const diff = (day + 6) % 7;
  result.setDate(result.getDate() - diff);
  return result;
}

function groupRecordsByDate(
  records: StoredRecord[],
  bucket: "day" | "week" = "day",
): TimelineGroup[] {
  if (!records.length) {
    return [];
  }

  const groups = new Map<string, TimelineGroup>();
  const sorted = [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  for (const record of sorted) {
    const createdAt = new Date(record.createdAt);
    const isValidDate = !Number.isNaN(createdAt.getTime());
    const start = isValidDate ? (bucket === "week" ? startOfWeek(createdAt) : startOfDay(createdAt)) : null;
    const key = isValidDate ? `${bucket}:${start?.toISOString() ?? record.createdAt}` : "unknown";

    let group = groups.get(key);

    if (!group) {
      group = {
        id: key,
        bucket,
        start,
        records: [],
      };
      groups.set(key, group);
    }

    group.records.push(record);
  }

  return Array.from(groups.values()).sort((a, b) => {
    const aTime = a.start ? a.start.getTime() : Number.NEGATIVE_INFINITY;
    const bTime = b.start ? b.start.getTime() : Number.NEGATIVE_INFINITY;
    return bTime - aTime;
  });
}

function updateCommandBarSummary(commandBar: HTMLElement | null, summary: CommandBarSummary): void {
  if (!commandBar) {
    return;
  }

  commandBar.dataset.recordsTotal = summary.total.toString();
  commandBar.dataset.recordsFiltered = summary.filtered.toString();
  commandBar.dataset.recordsUnlinked = summary.unlinked.toString();
}

function countUnlinkedRecords(
  records: StoredRecord[],
  individualMap: Map<string, StoredIndividual>,
): number {
  return records.reduce((total, record) => total + (individualMap.has(record.individualId) ? 0 : 1), 0);
}

export function filterRecordsByCriteria(
  records: StoredRecord[],
  individualMap: Map<string, StoredIndividual>,
  filters: RecordFilterCriteria,
  options: RecordFilterOptions = {},
): FilteredRecordsResult {
  const filtered: StoredRecord[] = [];
  const topConfidence = new Map<string, { field: string; value: number } | null>();
  const searchTerm = filters.search.trim().toLowerCase();
  const minConfidence = Math.min(1, Math.max(0, filters.minConfidence));
  const startTime = filters.startDate ? Date.parse(`${filters.startDate}T00:00:00Z`) : Number.NaN;
  const endTime = filters.endDate ? Date.parse(`${filters.endDate}T23:59:59Z`) : Number.NaN;
  const roleLabels = options.roleLabels ?? new Map<string, string>();

  for (const record of records) {
    const linkedIndividual = individualMap.get(record.individualId) ?? null;
    const isLinked = Boolean(linkedIndividual);

    if (filters.individualId === UNLINKED_FILTER_VALUE) {
      if (isLinked) {
        continue;
      }
    } else if (filters.individualId && record.individualId !== filters.individualId) {
      continue;
    }

    if (filters.linkStatus === "linked" && !isLinked) {
      continue;
    }

    if (filters.linkStatus === "unlinked" && isLinked) {
      continue;
    }

    if (filters.roleId) {
      if (filters.roleId === NO_ROLE_FILTER_VALUE) {
        if (linkedIndividual && linkedIndividual.roleId) {
          continue;
        }
      } else if (!linkedIndividual || linkedIndividual.roleId !== filters.roleId) {
        continue;
      }
    }

    const confidenceEntry = getTopConfidence(record.record);
    const confidenceValue = confidenceEntry ? confidenceEntry.value : 0;

    if (confidenceValue < minConfidence) {
      continue;
    }

    const createdAtTime = Date.parse(record.createdAt);

    if (!Number.isNaN(startTime) && !Number.isNaN(createdAtTime) && createdAtTime < startTime) {
      continue;
    }

    if (!Number.isNaN(endTime) && !Number.isNaN(createdAtTime) && createdAtTime > endTime) {
      continue;
    }

    if (searchTerm) {
      const haystackParts: string[] = [];
      const addToHaystack = (value: unknown): void => {
        if (!value) {
          return;
        }

        if (Array.isArray(value)) {
          for (const entry of value) {
            addToHaystack(entry);
          }
          return;
        }

        if (typeof value === "string") {
          const normalized = value.trim();
          if (normalized.length) {
            haystackParts.push(normalized);
          }
        }
      };

      const addSexTokens = (sex?: IndividualRecord["sex"]): void => {
        if (!sex) {
          return;
        }

        const tokens: string[] = [];

        switch (sex) {
          case "M":
            tokens.push("m", "male", "man");
            break;
          case "F":
            tokens.push("f", "female", "woman");
            break;
          case "U":
            tokens.push("u", "unknown", "unspecified", "undetermined");
            break;
        }

        for (const token of tokens) {
          addToHaystack(token);
        }
      };

      addToHaystack(record.summary);
      addToHaystack(record.record.givenNames);
      addToHaystack(record.record.surname);
      addToHaystack(record.record.maidenName);
      addToHaystack(record.record.aliases);
      addSexTokens(record.record.sex);
      addToHaystack(record.record.sourceUrl);
      addToHaystack(record.record.occupation);
      addToHaystack(record.record.religion);
      addToHaystack(record.record.notes);
      addToHaystack(Object.values(record.record.parents ?? {}));
      addToHaystack(record.record.spouses);
      addToHaystack(record.record.children);
      addToHaystack(record.record.siblings);

      if (linkedIndividual) {
        addToHaystack(linkedIndividual.name);
        addToHaystack(linkedIndividual.notes);

        const profile = linkedIndividual.profile;
        addToHaystack(profile.givenNames);
        addToHaystack(profile.surname);
        addToHaystack(profile.maidenName);
        addToHaystack(profile.aliases);
        addSexTokens(profile.sex);
        addToHaystack(profile.occupation);
        addToHaystack(profile.religion);
        addToHaystack(profile.notes);
        addToHaystack(Object.values(profile.parents ?? {}));
        addToHaystack(profile.spouses);
        addToHaystack(profile.children);
        addToHaystack(profile.siblings);
      }

      const roleLabel = linkedIndividual?.roleId ? roleLabels.get(linkedIndividual.roleId) ?? "" : "";
      addToHaystack(roleLabel);

      const haystack = haystackParts.join(" ").toLowerCase();

      if (!haystack.includes(searchTerm)) {
        continue;
      }
    }

    filtered.push(record);
    topConfidence.set(record.id, confidenceEntry);
  }

  filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return { records: filtered, topConfidence };
}

function buildTimelineFragment(
  groups: TimelineGroup[],
  individualMap: Map<string, StoredIndividual>,
  topConfidence: Map<string, { field: string; value: number } | null>,
): DocumentFragment {
  const fragment = document.createDocumentFragment();

  for (const group of groups) {
    const groupElement = document.createElement("section");
    groupElement.className = "timeline-group";
    groupElement.dataset.bucket = group.bucket;

    const header = document.createElement("header");
    header.className = "timeline-group-header";

    const heading = document.createElement("h3");
    heading.className = "timeline-group-title";
    if (group.start) {
      const label =
        group.bucket === "week"
          ? `Week of ${formatTimestamp(group.start.toISOString())}`
          : formatTimestamp(group.start.toISOString());
      heading.textContent = label;
    } else {
      heading.textContent = "Unknown date";
    }

    const count = document.createElement("span");
    count.className = "timeline-group-count";
    count.textContent = `${group.records.length} record${group.records.length === 1 ? "" : "s"}`;

    header.append(heading, count);

    const body = document.createElement("div");
    body.className = "timeline-group-body";

    for (const stored of group.records) {
      const individual = individualMap.get(stored.individualId) ?? null;
      const row = document.createElement("article");
      row.className = "record-row";

      const content = document.createElement("div");
      content.className = "record-content";

      const title = document.createElement("p");
      title.className = "record-title";
      title.textContent = stored.summary || "Saved record";

      const meta = document.createElement("div");
      meta.className = "record-meta";

      const timestamp = document.createElement("span");
      timestamp.textContent = `Saved ${formatTimestamp(stored.createdAt)}`;

      const linkInfo = document.createElement("span");
      linkInfo.textContent = individual ? `Linked to ${individual.name}` : "Unlinked record";

      const confidence = document.createElement("span");
      confidence.className = "confidence-badge";
      const confidenceEntry = topConfidence.get(stored.id) ?? null;
      confidence.textContent = getConfidenceText(confidenceEntry);
      confidence.dataset.level = getConfidenceLevel(confidenceEntry ? confidenceEntry.value : null);

      meta.append(timestamp, linkInfo, confidence);
      content.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "record-actions";

      const loadButton = document.createElement("button");
      loadButton.type = "button";
      loadButton.textContent = "Load in extractor";
      loadButton.dataset.action = "load-record";
      loadButton.dataset.recordId = stored.id;

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.textContent = "Rename";
      editButton.className = "button-secondary";
      editButton.dataset.action = "edit-record-summary";
      editButton.dataset.recordId = stored.id;

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.textContent = "Remove";
      deleteButton.className = "button-secondary";
      deleteButton.dataset.action = "delete-record";
      deleteButton.dataset.recordId = stored.id;

      actions.append(loadButton, editButton, deleteButton);
      row.append(content, actions);
      body.appendChild(row);
    }

    groupElement.append(header, body);
    fragment.appendChild(groupElement);
  }

  return fragment;
}

import { extractIndividual, type ExtractOptions } from "../../extract";
import { scoreConfidence } from "../../confidence";
import type { IndividualRecord } from "../../schema";
import {
  clearRecords,
  createIndividual,
  createRecord,
  deleteRecord,
  getState,
  subscribe,
  type StoredIndividual,
  type StoredRecord,
} from "@/storage";
import {
  buildHighlightDocument,
  formatDate,
  formatTimestamp,
  getLatestRecordForIndividual,
  getRecordSummary,
  getSuggestedIndividualName,
  highlightJson,
} from "./shared/utils";

type ConfidenceScores = ReturnType<typeof scoreConfidence>;

interface FieldRow {
  label: string;
  value: string;
  confidence?: number;
}

interface RecordFilterCriteria {
  search: string;
  individualId: string;
  startDate: string;
  endDate: string;
  minConfidence: number;
}

const DEFAULT_FILTERS: RecordFilterCriteria = {
  search: "",
  individualId: "",
  startDate: "",
  endDate: "",
  minConfidence: 0,
};

const UNLINKED_FILTER_VALUE = "__unlinked__";

const CONFIDENCE_LABELS: Record<string, string> = {
  givenNames: "Given names",
  surname: "Surname",
  maidenName: "Maiden name",
  "birth.date": "Birth date",
  "death.date": "Death date",
  "parents.father": "Father",
  "parents.mother": "Mother",
};

interface RecordsElements {
  htmlInput: HTMLTextAreaElement;
  jsonOutput: HTMLDivElement;
  errorBox: HTMLDivElement;
  confidenceList: HTMLDivElement;
  toggleSourcesButton: HTMLButtonElement;
  reextractButton: HTMLButtonElement;
  previewFrame: HTMLIFrameElement;
  provenanceCount: HTMLSpanElement;
  saveForm: HTMLFormElement;
  saveModeNew: HTMLInputElement;
  saveModeExisting: HTMLInputElement;
  newIndividualInput: HTMLInputElement;
  existingIndividualSelect: HTMLSelectElement;
  saveButton: HTMLButtonElement;
  saveFeedback: HTMLSpanElement;
  clearRecordsButton: HTMLButtonElement;
  savedRecordsContainer: HTMLDivElement;
  recordsFiltersForm: HTMLFormElement;
  filterSearchInput: HTMLInputElement;
  filterIndividualSelect: HTMLSelectElement;
  filterStartDateInput: HTMLInputElement;
  filterEndDateInput: HTMLInputElement;
  filterConfidenceInput: HTMLInputElement;
  filterConfidenceOutput: HTMLOutputElement;
  recordsTimeline: HTMLDivElement;
}

const DEFAULT_HTML = "<h1>Jane Doe</h1><p>Born about 1892 to Mary &amp; John.</p>";

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

export function initializeRecordsPage(): void {
  const elements = getRecordsElements();

  if (!elements) {
    return;
  }

  const {
    htmlInput,
    jsonOutput,
    errorBox,
    confidenceList,
    toggleSourcesButton,
    reextractButton,
    previewFrame,
    provenanceCount,
    saveForm,
    saveModeNew,
    saveModeExisting,
    newIndividualInput,
    existingIndividualSelect,
    saveButton,
    saveFeedback,
    clearRecordsButton,
    savedRecordsContainer,
    recordsFiltersForm,
    filterSearchInput,
    filterIndividualSelect,
    filterStartDateInput,
    filterEndDateInput,
    filterConfidenceInput,
    filterConfidenceOutput,
    recordsTimeline,
  } = elements;

  let latestState = getState();
  let currentRecord: IndividualRecord | null = null;
  let lastHighlightDocument = "";
  let showingSources = false;
  let suggestedName = "";
  let currentFilters: RecordFilterCriteria = { ...DEFAULT_FILTERS };
  filterConfidenceOutput.textContent = formatConfidenceOutput(currentFilters.minConfidence);

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

  function renderJsonRecord(record: IndividualRecord): void {
    const json = JSON.stringify(record, null, 2);
    jsonOutput.innerHTML = `<pre class="json-content">${highlightJson(json)}</pre>`;
    jsonOutput.dataset.empty = "false";
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

  function readFiltersFromControls(): RecordFilterCriteria {
    const rawConfidence = Number(filterConfidenceInput.value);
    const normalizedConfidence = Number.isFinite(rawConfidence) ? rawConfidence / 100 : 0;

    return {
      search: filterSearchInput.value.trim(),
      individualId: filterIndividualSelect.value,
      startDate: filterStartDateInput.value,
      endDate: filterEndDateInput.value,
      minConfidence: Math.min(1, Math.max(0, normalizedConfidence)),
    };
  }

  function applyFilters(next: RecordFilterCriteria): void {
    currentFilters = next;
    renderSavedRecords(latestState, currentFilters);
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

  function renderSavedRecords(
    state: ReturnType<typeof getState>,
    filters: RecordFilterCriteria,
  ): void {
    const recordCount = state.records.length;
    const individualCount = state.individuals.length;
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
    const normalizedFilters: RecordFilterCriteria = { ...filters, individualId: normalizedIndividualId };

    if (filters === currentFilters && normalizedIndividualId !== filters.individualId) {
      currentFilters = normalizedFilters;
    }

    filterSearchInput.value = normalizedFilters.search;
    filterStartDateInput.value = normalizedFilters.startDate;
    filterEndDateInput.value = normalizedFilters.endDate;

    const sliderValue = Math.round(normalizedFilters.minConfidence * 100);
    filterConfidenceInput.value = sliderValue.toString();
    filterConfidenceOutput.textContent = formatConfidenceOutput(normalizedFilters.minConfidence);

    const { records: filteredRecords, topConfidence } = filterRecordsByCriteria(
      state.records,
      individualMap,
      normalizedFilters,
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
    const averageElement = document.getElementById("metric-confidence-score");
    if (averageElement) {
      averageElement.textContent = "—";
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

  async function handleRecordAction(event: MouseEvent): Promise<void> {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");

    if (!button) {
      return;
    }

    if (button.dataset.action === "reset-filters") {
      recordsFiltersForm.reset();
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
      handleInput();
      saveFeedback.textContent = `Loaded record saved ${formatTimestamp(stored.createdAt)}.`;
    } else if (button.dataset.action === "delete-record") {
      const confirmDelete = window.confirm("Remove this saved record? This cannot be undone.");

      if (confirmDelete) {
        try {
          await deleteRecord(recordId);
          saveFeedback.textContent = "Removed saved record.";
        } catch (error) {
          console.error("Failed to delete record", error);
          saveFeedback.textContent = "Unable to remove record.";
        }
      }
    }
  }

  htmlInput.addEventListener("input", handleInput);
  toggleSourcesButton.addEventListener("click", toggleSources);
  reextractButton.addEventListener("click", () => {
    handleInput();
    if (!errorBox.hidden && errorBox.textContent) {
      saveFeedback.textContent = "";
    } else if (htmlInput.value.trim()) {
      saveFeedback.textContent = "Re-extracted with current master data.";
    }
  });

  const handleFiltersChange = (): void => {
    const nextFilters = readFiltersFromControls();
    filterConfidenceOutput.textContent = formatConfidenceOutput(nextFilters.minConfidence);
    applyFilters(nextFilters);
  };

  filterSearchInput.addEventListener("input", handleFiltersChange);
  filterIndividualSelect.addEventListener("change", handleFiltersChange);
  filterStartDateInput.addEventListener("change", handleFiltersChange);
  filterEndDateInput.addEventListener("change", handleFiltersChange);
  filterConfidenceInput.addEventListener("input", handleFiltersChange);

  recordsFiltersForm.addEventListener("reset", () => {
    window.setTimeout(() => {
      filterConfidenceOutput.textContent = formatConfidenceOutput(DEFAULT_FILTERS.minConfidence);
      applyFilters({ ...DEFAULT_FILTERS });
    }, 0);
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
        saveFeedback.textContent = "Cleared all saved records.";
      } catch (error) {
        console.error("Failed to clear saved records", error);
        saveFeedback.textContent = "Unable to clear saved records.";
      }
    }
  });

  saveModeNew.addEventListener("change", updateSavePanel);
  saveModeExisting.addEventListener("change", updateSavePanel);

  saveForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentRecord) {
      saveFeedback.textContent = "Extract a record before saving.";
      return;
    }

    let individualId: string | null = null;
    let individualName = "";

    try {
      if (saveModeNew.checked && !saveModeNew.disabled) {
        const providedName = newIndividualInput.value.trim() || suggestedName;

        if (!providedName) {
          saveFeedback.textContent = "Provide a name for the new individual.";
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
      await createRecord({ individualId, summary, record: currentRecord });
      saveFeedback.textContent = `Saved record for ${individualName}.`;

      if (saveModeNew.checked) {
        saveModeExisting.checked = true;
        saveModeNew.checked = false;
      }

      updateSavePanel();
    } catch (error) {
      console.error("Failed to save record", error);
      saveFeedback.textContent = "Unable to save record. Please try again.";
    }
  });

  subscribe((state) => {
    latestState = state;
    renderSavedRecords(state, currentFilters);
    updateSavePanel();
  });

  function resetApplication(): void {
    htmlInput.value = DEFAULT_HTML;
    handleInput();
  }

  resetApplication();
}

function getRecordsElements(): RecordsElements | null {
  const htmlInput = document.getElementById("html-input");
  const jsonOutput = document.getElementById("json-output");
  const errorBox = document.getElementById("error");
  const confidenceList = document.getElementById("confidence");
  const toggleSourcesButton = document.getElementById("toggle-sources");
  const reextractButton = document.getElementById("reextract");
  const previewFrame = document.getElementById("source-preview");
  const provenanceCount = document.getElementById("provenance-count");
  const saveForm = document.getElementById("save-form");
  const saveModeNew = document.getElementById("save-mode-new");
  const saveModeExisting = document.getElementById("save-mode-existing");
  const newIndividualInput = document.getElementById("new-individual-name");
  const existingIndividualSelect = document.getElementById("existing-individual-select");
  const saveButton = document.getElementById("save-button");
  const saveFeedback = document.getElementById("save-feedback");
  const clearRecordsButton = document.getElementById("clear-records");
  const savedRecordsContainer = document.getElementById("saved-records");
  const recordsFiltersForm = document.getElementById("records-filters");
  const filterSearchInput = document.getElementById("filter-search");
  const filterIndividualSelect = document.getElementById("filter-individual");
  const filterStartDateInput = document.getElementById("filter-start-date");
  const filterEndDateInput = document.getElementById("filter-end-date");
  const filterConfidenceInput = document.getElementById("filter-confidence");
  const filterConfidenceOutput = document.getElementById("filter-confidence-value");
  const recordsTimeline = document.getElementById("records-timeline");

  if (
    !(
      htmlInput instanceof HTMLTextAreaElement &&
      jsonOutput instanceof HTMLDivElement &&
      errorBox instanceof HTMLDivElement &&
      confidenceList instanceof HTMLDivElement &&
      toggleSourcesButton instanceof HTMLButtonElement &&
      reextractButton instanceof HTMLButtonElement &&
      previewFrame instanceof HTMLIFrameElement &&
      provenanceCount instanceof HTMLSpanElement &&
      saveForm instanceof HTMLFormElement &&
      saveModeNew instanceof HTMLInputElement &&
      saveModeExisting instanceof HTMLInputElement &&
      newIndividualInput instanceof HTMLInputElement &&
      existingIndividualSelect instanceof HTMLSelectElement &&
      saveButton instanceof HTMLButtonElement &&
      saveFeedback instanceof HTMLSpanElement &&
      clearRecordsButton instanceof HTMLButtonElement &&
      savedRecordsContainer instanceof HTMLDivElement &&
      recordsFiltersForm instanceof HTMLFormElement &&
      filterSearchInput instanceof HTMLInputElement &&
      filterIndividualSelect instanceof HTMLSelectElement &&
      filterStartDateInput instanceof HTMLInputElement &&
      filterEndDateInput instanceof HTMLInputElement &&
      filterConfidenceInput instanceof HTMLInputElement &&
      filterConfidenceOutput instanceof HTMLOutputElement &&
      recordsTimeline instanceof HTMLDivElement
    )
  ) {
    return null;
  }

  return {
    htmlInput,
    jsonOutput,
    errorBox,
    confidenceList,
    toggleSourcesButton,
    reextractButton,
    previewFrame,
    provenanceCount,
    saveForm,
    saveModeNew,
    saveModeExisting,
    newIndividualInput,
    existingIndividualSelect,
    saveButton,
    saveFeedback,
    clearRecordsButton,
    savedRecordsContainer,
    recordsFiltersForm,
    filterSearchInput,
    filterIndividualSelect,
    filterStartDateInput,
    filterEndDateInput,
    filterConfidenceInput,
    filterConfidenceOutput,
    recordsTimeline,
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

function filterRecordsByCriteria(
  records: StoredRecord[],
  individualMap: Map<string, StoredIndividual>,
  filters: RecordFilterCriteria,
): FilteredRecordsResult {
  const filtered: StoredRecord[] = [];
  const topConfidence = new Map<string, { field: string; value: number } | null>();
  const searchTerm = filters.search.trim().toLowerCase();
  const minConfidence = Math.min(1, Math.max(0, filters.minConfidence));
  const startTime = filters.startDate ? Date.parse(`${filters.startDate}T00:00:00Z`) : Number.NaN;
  const endTime = filters.endDate ? Date.parse(`${filters.endDate}T23:59:59Z`) : Number.NaN;

  for (const record of records) {
    const linkedIndividual = individualMap.get(record.individualId) ?? null;

    if (filters.individualId === UNLINKED_FILTER_VALUE) {
      if (linkedIndividual) {
        continue;
      }
    } else if (filters.individualId && record.individualId !== filters.individualId) {
      continue;
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
      const haystack = [
        record.summary,
        record.record.givenNames.join(" "),
        record.record.surname ?? "",
        record.record.sourceUrl ?? "",
        linkedIndividual?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();

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

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.textContent = "Remove";
      deleteButton.className = "button-secondary";
      deleteButton.dataset.action = "delete-record";
      deleteButton.dataset.recordId = stored.id;

      actions.append(loadButton, deleteButton);
      row.append(content, actions);
      body.appendChild(row);
    }

    groupElement.append(header, body);
    fragment.appendChild(groupElement);
  }

  return fragment;
}

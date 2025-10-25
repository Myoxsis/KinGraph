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

interface SampleSnippet {
  label: string;
  html: string;
}

type ExtractionTrigger = "auto" | "manual" | "sample" | "load" | "reset";

interface RecordsElements {
  htmlInput: HTMLTextAreaElement;
  jsonOutput: HTMLDivElement;
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
  clearRecordsButton: HTMLButtonElement;
  savedRecordsContainer: HTMLDivElement;
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
    clearRecordsButton,
    savedRecordsContainer,
  } = elements;

  let latestState = getState();
  let currentRecord: IndividualRecord | null = null;
  let lastHighlightDocument = "";
  let showingSources = false;
  let suggestedName = "";
  let autoExtractEnabled = true;
  let pendingExtraction: number | null = null;
  let lastExtractionTimestamp: string | null = null;

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

      option.textContent = label;
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
    } else if (newModeActive && currentRecord) {
      suggestedName = getSuggestedIndividualName(currentRecord);
      if (!newIndividualInput.value.trim() || newIndividualInput.value === suggestedName) {
        newIndividualInput.value = suggestedName;
      }
    }

    populateExistingIndividuals(latestState.individuals);
  }

  function renderSavedRecords(state: ReturnType<typeof getState>): void {
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
          default:
            return "Extraction updated from pasted HTML.";
        }
      })();

      setFeedback(feedback);
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

  subscribe((state) => {
    latestState = state;
    renderSavedRecords(state);
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
  const clearRecordsButton = document.getElementById("clear-records");
  const savedRecordsContainer = document.getElementById("saved-records");

  if (
    !(
      htmlInput instanceof HTMLTextAreaElement &&
      jsonOutput instanceof HTMLDivElement &&
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
      clearRecordsButton instanceof HTMLButtonElement &&
      savedRecordsContainer instanceof HTMLDivElement
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
    clearRecordsButton,
    savedRecordsContainer,
  };
}

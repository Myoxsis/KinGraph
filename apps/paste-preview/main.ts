import { extractIndividual } from "../../extract";
import { scoreConfidence } from "../../confidence";
import { highlight } from "../../highlight";
import type { IndividualRecord } from "../../schema";

type ConfidenceScores = ReturnType<typeof scoreConfidence>;

interface FieldRow {
  label: string;
  value: string;
  confidence?: number;
}

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

let lastHighlightDocument = "";
let showingSources = false;

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
}

function formatDate(fragment: IndividualRecord["birth"]): string {
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
    emptyMessage.style.color = "#94a3b8";
    emptyMessage.style.fontSize = "0.9rem";
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
  lastHighlightDocument = `<!doctype html><html><head><meta charset="utf-8" />${
    ""
  }<style>body{font-family:system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;padding:16px;margin:0;}mark[data-field]{background:rgba(250,204,21,.4);border-radius:4px;padding:0 0.2em;box-shadow:inset 0 0 0 1px rgba(217,119,6,0.35);}mark[data-field]::after{content:attr(data-field);display:inline-block;margin-left:0.35rem;font-size:0.65rem;letter-spacing:0.05em;text-transform:uppercase;color:rgba(120,53,15,0.85);}</style></head><body>${
    highlight(record.sourceHtml, record.provenance)
  }</body></html>`;

  if (showingSources) {
    previewFrame.srcdoc = lastHighlightDocument;
  }
}

function handleInput(): void {
  const value = htmlInput.value.trim();

  if (!value) {
    resetOutputs();
    return;
  }

  try {
    const record = extractIndividual(value);
    const scores = scoreConfidence(record);

    jsonOutput.textContent = JSON.stringify(record, null, 2);
    errorBox.hidden = true;
    errorBox.textContent = "";

    renderConfidence(record, scores);
    toggleSourcesButton.disabled = false;
    updateHighlight(record);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    jsonOutput.textContent = "";
    errorBox.hidden = false;
    errorBox.textContent = message;
    confidenceList.replaceChildren();
    toggleSourcesButton.disabled = true;
    previewFrame.hidden = true;
    showingSources = false;
    toggleSourcesButton.textContent = "Highlight sources";
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

htmlInput.value = DEFAULT_HTML;
htmlInput.addEventListener("input", handleInput);

toggleSourcesButton.addEventListener("click", toggleSources);

handleInput();

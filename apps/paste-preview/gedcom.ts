import { getState, subscribe } from "@/storage";
import { generateGedcomDocument } from "./shared/gedcom";

interface GedcomElements {
  output: HTMLTextAreaElement;
  copyButton: HTMLButtonElement;
  downloadButton: HTMLButtonElement;
  status: HTMLSpanElement | null;
  count: HTMLSpanElement | null;
}

export function initializeGedcomPage(): void {
  const elements = getGedcomElements();

  if (!elements) {
    return;
  }

  const { output, copyButton, downloadButton, status, count } = elements;
  let latestDocument = "";
  let statusTimeout: number | null = null;

  function setStatus(message: string): void {
    if (!status) {
      return;
    }

    status.textContent = message;
    if (statusTimeout !== null) {
      window.clearTimeout(statusTimeout);
      statusTimeout = null;
    }

    if (message) {
      statusTimeout = window.setTimeout(() => {
        status.textContent = "";
        statusTimeout = null;
      }, 4000);
    }
  }

  function update(state = getState()): void {
    latestDocument = generateGedcomDocument(state);
    output.value = latestDocument;
    output.scrollTop = 0;

    if (count) {
      count.textContent = state.individuals.length.toString();
    }

    const navRecordCount = document.getElementById("nav-record-count");
    const navIndividualCount = document.getElementById("nav-individual-count");
    if (navRecordCount) {
      navRecordCount.textContent = state.records.length.toString();
    }
    if (navIndividualCount) {
      navIndividualCount.textContent = state.individuals.length.toString();
    }

    const hasContent = latestDocument.trim().length > 0;
    copyButton.disabled = !hasContent;
    downloadButton.disabled = !hasContent;
    if (!hasContent) {
      setStatus("No GEDCOM data available.");
    }
  }

  copyButton.addEventListener("click", async () => {
    if (!latestDocument.trim().length) {
      return;
    }

    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(latestDocument);
      } else {
        output.focus();
        output.select();
        const successful = document.execCommand("copy");
        output.setSelectionRange(output.value.length, output.value.length);
        if (!successful) {
          throw new Error("Clipboard copy not supported.");
        }
      }
      setStatus("GEDCOM copied to clipboard.");
    } catch (error) {
      console.error("Failed to copy GEDCOM", error);
      setStatus("Unable to copy GEDCOM to clipboard.");
    }
  });

  downloadButton.addEventListener("click", () => {
    if (!latestDocument.trim().length) {
      return;
    }

    try {
      const blob = new Blob([latestDocument], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${buildWorkspaceGedcomFileName()}.ged`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setStatus("GEDCOM download started.");
    } catch (error) {
      console.error("Failed to download GEDCOM", error);
      setStatus("Unable to download GEDCOM file.");
    }
  });

  subscribe((state) => {
    update(state);
  });

  update();
}

function getGedcomElements(): GedcomElements | null {
  const output = document.getElementById("gedcom-output");
  const copyButton = document.getElementById("copy-gedcom-button");
  const downloadButton = document.getElementById("gedcom-download-button");
  const status = document.getElementById("gedcom-status");
  const count = document.getElementById("gedcom-individual-count");

  if (
    !(
      output instanceof HTMLTextAreaElement &&
      copyButton instanceof HTMLButtonElement &&
      downloadButton instanceof HTMLButtonElement
    )
  ) {
    return null;
  }

  return {
    output,
    copyButton,
    downloadButton,
    status: status instanceof HTMLSpanElement ? status : null,
    count: count instanceof HTMLSpanElement ? count : null,
  };
}

function buildWorkspaceGedcomFileName(): string {
  const now = new Date();
  const date = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, "0")}${now
    .getDate()
    .toString()
    .padStart(2, "0")}`;
  const time = `${now.getHours().toString().padStart(2, "0")}${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}${now.getSeconds().toString().padStart(2, "0")}`;
  return `kingraph-export-${date}-${time}`;
}

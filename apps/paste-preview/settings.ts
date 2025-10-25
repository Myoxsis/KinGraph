import type { PlaceCategory } from "../../places";
import {
  clearAll,
  deletePlaceDefinition,
  deleteProfessionDefinition,
  exportAllData,
  getState,
  importAllData,
  savePlaceDefinition,
  saveProfessionDefinition,
  subscribe,
  type StoredPlaceDefinition,
  type StoredProfessionDefinition,
} from "@/storage";
import { formatTimestamp, parseAliasInput } from "./shared/utils";

interface SettingsElements {
  professionForm: HTMLFormElement;
  professionLabelInput: HTMLInputElement;
  professionAliasesInput: HTMLInputElement;
  professionSubmitButton: HTMLButtonElement;
  professionCancelButton: HTMLButtonElement;
  professionFeedback: HTMLSpanElement;
  professionList: HTMLDivElement;
  placeForm: HTMLFormElement;
  placeLabelInput: HTMLInputElement;
  placeAliasesInput: HTMLInputElement;
  placeCategorySelect: HTMLSelectElement;
  placeSubmitButton: HTMLButtonElement;
  placeCancelButton: HTMLButtonElement;
  placeFeedback: HTMLSpanElement;
  placeList: HTMLDivElement;
  exportButton: HTMLButtonElement;
  importButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  importInput: HTMLInputElement;
  dataFeedback: HTMLSpanElement;
}

export function initializeSettingsPage(): void {
  const elements = getSettingsElements();

  if (!elements) {
    return;
  }

  const {
    professionForm,
    professionLabelInput,
    professionAliasesInput,
    professionSubmitButton,
    professionCancelButton,
    professionFeedback,
    professionList,
    placeForm,
    placeLabelInput,
    placeAliasesInput,
    placeCategorySelect,
    placeSubmitButton,
    placeCancelButton,
    placeFeedback,
    placeList,
    exportButton,
    importButton,
    resetButton,
    importInput,
    dataFeedback,
  } = elements;

  let latestState = getState();
  let editingProfessionId: string | null = null;
  let editingPlaceId: string | null = null;
  let professionFeedbackTimeout: number | null = null;
  let placeFeedbackTimeout: number | null = null;
  let dataFeedbackTimeout: number | null = null;

  function renderProfessionSettings(): void {
    const recordCount = latestState.records.length;
    const individualCount = latestState.individuals.length;
    const definitionCount = latestState.professions.length + latestState.places.length;
    const navRecordCount = document.getElementById("nav-record-count");
    const navIndividualCount = document.getElementById("nav-individual-count");
    const definitionMetric = document.getElementById("metric-definition-count");

    if (navRecordCount) {
      navRecordCount.textContent = recordCount.toString();
    }

    if (navIndividualCount) {
      navIndividualCount.textContent = individualCount.toString();
    }

    if (definitionMetric) {
      definitionMetric.textContent = definitionCount.toString();
    }

    if (!latestState.professions.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No profession definitions yet. Add one using the form.";
      professionList.replaceChildren(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    const entries = [...latestState.professions].sort((a, b) => a.label.localeCompare(b.label));

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

  function renderPlaceSettings(): void {
    if (!latestState.places.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No place definitions yet. Add one using the form.";
      placeList.replaceChildren(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    const entries = [...latestState.places].sort((a, b) => a.label.localeCompare(b.label));

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

  function showDataFeedback(message: string): void {
    dataFeedback.textContent = message;
    if (dataFeedbackTimeout !== null) {
      window.clearTimeout(dataFeedbackTimeout);
    }
    dataFeedbackTimeout = window.setTimeout(() => {
      dataFeedback.textContent = "";
      dataFeedbackTimeout = null;
    }, 4000);
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

  async function handleProfessionAction(event: MouseEvent): Promise<void> {
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
        try {
          await deleteProfessionDefinition(id);
          showProfessionFeedback("Profession removed.");
          if (editingProfessionId === id) {
            resetProfessionForm();
          }
        } catch (error) {
          console.error("Failed to delete profession", error);
          showProfessionFeedback("Unable to remove profession.");
        }
      }
    }
  }

  async function handlePlaceAction(event: MouseEvent): Promise<void> {
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
        try {
          await deletePlaceDefinition(id);
          showPlaceFeedback("Place removed.");
          if (editingPlaceId === id) {
            resetPlaceForm();
          }
        } catch (error) {
          console.error("Failed to delete place", error);
          showPlaceFeedback("Unable to remove place.");
        }
      }
    }
  }

  professionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const label = professionLabelInput.value.trim();

    if (!label) {
      professionLabelInput.focus();
      return;
    }

    const aliases = parseAliasInput(professionAliasesInput.value);

    try {
      await saveProfessionDefinition({
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

  professionList.addEventListener("click", (event) => {
    void handleProfessionAction(event as MouseEvent);
  });

  placeForm.addEventListener("submit", async (event) => {
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
      await savePlaceDefinition({
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

  placeList.addEventListener("click", (event) => {
    void handlePlaceAction(event as MouseEvent);
  });

  exportButton.addEventListener("click", async () => {
    try {
      const snapshot = await exportAllData();
      const payload = JSON.stringify(snapshot, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      link.href = url;
      link.download = `kingraph-export-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
      showDataFeedback("Exported data as JSON file.");
    } catch (error) {
      console.error("Failed to export data", error);
      showDataFeedback("Failed to export data.");
    }
  });

  importButton.addEventListener("click", () => {
    importInput.value = "";
    importInput.click();
  });

  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      await importAllData(parsed);
      showDataFeedback("Imported data successfully.");
    } catch (error) {
      console.error("Failed to import data", error);
      showDataFeedback("Failed to import data. Please verify the file.");
    } finally {
      importInput.value = "";
    }
  });

  resetButton.addEventListener("click", async () => {
    const confirmed = window.confirm(
      "Reset all KinGraph data to defaults? This removes saved records, individuals, and custom definitions.",
    );

    if (!confirmed) {
      return;
    }

    try {
      await clearAll();
      showDataFeedback("Reset all data to defaults.");
    } catch (error) {
      console.error("Failed to reset data", error);
      showDataFeedback("Failed to reset data.");
    }
  });

  subscribe((state) => {
    latestState = state;
    renderProfessionSettings();
    renderPlaceSettings();
  });

  renderProfessionSettings();
  renderPlaceSettings();
}

function getSettingsElements(): SettingsElements | null {
  const professionForm = document.getElementById("profession-form");
  const professionLabelInput = document.getElementById("profession-label");
  const professionAliasesInput = document.getElementById("profession-aliases");
  const professionSubmitButton = document.getElementById("profession-submit");
  const professionCancelButton = document.getElementById("profession-cancel");
  const professionFeedback = document.getElementById("profession-feedback");
  const professionList = document.getElementById("profession-list");
  const placeForm = document.getElementById("place-form");
  const placeLabelInput = document.getElementById("place-label");
  const placeAliasesInput = document.getElementById("place-aliases");
  const placeCategorySelect = document.getElementById("place-category");
  const placeSubmitButton = document.getElementById("place-submit");
  const placeCancelButton = document.getElementById("place-cancel");
  const placeFeedback = document.getElementById("place-feedback");
  const placeList = document.getElementById("place-list");
  const exportButton = document.getElementById("export-data");
  const importButton = document.getElementById("import-data");
  const resetButton = document.getElementById("reset-data");
  const importInput = document.getElementById("import-data-input");
  const dataFeedback = document.getElementById("data-feedback");

  if (
    !(
      professionForm instanceof HTMLFormElement &&
      professionLabelInput instanceof HTMLInputElement &&
      professionAliasesInput instanceof HTMLInputElement &&
      professionSubmitButton instanceof HTMLButtonElement &&
      professionCancelButton instanceof HTMLButtonElement &&
      professionFeedback instanceof HTMLSpanElement &&
      professionList instanceof HTMLDivElement &&
      placeForm instanceof HTMLFormElement &&
      placeLabelInput instanceof HTMLInputElement &&
      placeAliasesInput instanceof HTMLInputElement &&
      placeCategorySelect instanceof HTMLSelectElement &&
      placeSubmitButton instanceof HTMLButtonElement &&
      placeCancelButton instanceof HTMLButtonElement &&
      placeFeedback instanceof HTMLSpanElement &&
      placeList instanceof HTMLDivElement &&
      exportButton instanceof HTMLButtonElement &&
      importButton instanceof HTMLButtonElement &&
      resetButton instanceof HTMLButtonElement &&
      importInput instanceof HTMLInputElement &&
      dataFeedback instanceof HTMLSpanElement
    )
  ) {
    return null;
  }

  return {
    professionForm,
    professionLabelInput,
    professionAliasesInput,
    professionSubmitButton,
    professionCancelButton,
    professionFeedback,
    professionList,
    placeForm,
    placeLabelInput,
    placeAliasesInput,
    placeCategorySelect,
    placeSubmitButton,
    placeCancelButton,
    placeFeedback,
    placeList,
    exportButton,
    importButton,
    resetButton,
    importInput,
    dataFeedback,
  };
}

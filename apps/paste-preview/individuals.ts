import {
  createIndividual,
  getState,
  subscribe,
  updateIndividual,
} from "@/storage";
import { formatTimestamp } from "./shared/utils";

interface IndividualsElements {
  list: HTMLDivElement;
  createForm: HTMLFormElement;
  createNameInput: HTMLInputElement;
  createFeedback: HTMLSpanElement | null;
  editForm: HTMLFormElement;
  editNameInput: HTMLInputElement;
  editNotesInput: HTMLTextAreaElement;
  editSaveButton: HTMLButtonElement;
  editFeedback: HTMLSpanElement | null;
  editEmptyState: HTMLParagraphElement | null;
  clearSelectionButton: HTMLButtonElement | null;
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
    createFeedback,
    editForm,
    editNameInput,
    editNotesInput,
    editSaveButton,
    editFeedback,
    editEmptyState,
    clearSelectionButton,
  } = elements;

  let latestState = getState();
  let selectedIndividualId: string | null = null;

  function getSelectedIndividual(): typeof latestState.individuals[number] | null {
    if (!selectedIndividualId) {
      return null;
    }

    return latestState.individuals.find((individual) => individual.id === selectedIndividualId) ?? null;
  }

  function renderIndividuals(): void {
    if (!latestState.individuals.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No individuals yet. Save a record or create a person to get started.";
      list.replaceChildren(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    const individuals = [...latestState.individuals].sort((a, b) => a.name.localeCompare(b.name));
    for (const individual of individuals) {
      const card = document.createElement("article");
      card.className = "card";
      card.dataset.individualId = individual.id;
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `Edit details for ${individual.name}`);
      const isSelected = individual.id === selectedIndividualId;
      card.setAttribute("aria-pressed", isSelected ? "true" : "false");
      if (isSelected) {
        card.classList.add("is-selected");
      }

      const header = document.createElement("header");
      const title = document.createElement("h3");
      title.className = "card-title";
      title.textContent = individual.name;

      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = `Updated ${formatTimestamp(individual.updatedAt)}`;

      header.append(title, meta);
      card.appendChild(header);

      const linkedRecords = latestState.records.filter((record) => record.individualId === individual.id);
      const countLabel = document.createElement("p");
      countLabel.className = "supporting-text";
      countLabel.textContent = linkedRecords.length
        ? `${linkedRecords.length} linked record${linkedRecords.length === 1 ? "" : "s"}`
        : "No linked records yet.";
      card.appendChild(countLabel);

      if (linkedRecords.length) {
        const listElement = document.createElement("ul");
        listElement.className = "inline-list";

        for (const stored of linkedRecords.sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
          const item = document.createElement("li");
          const summary = stored.summary || "Saved record";
          item.textContent = `${summary} — saved ${formatTimestamp(stored.createdAt)}`;
          listElement.appendChild(item);
        }

        card.appendChild(listElement);
      }

      if (individual.notes.trim()) {
        const notes = document.createElement("p");
        notes.className = "supporting-text";
        notes.textContent = `Notes: ${individual.notes}`;
        card.appendChild(notes);
      }

      const actions = document.createElement("div");
      actions.className = "card-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.textContent = "Edit details";
      editButton.dataset.action = "edit-individual";
      editButton.dataset.individualId = individual.id;

      actions.appendChild(editButton);
      card.appendChild(actions);

      fragment.appendChild(card);
    }

    list.replaceChildren(fragment);
  }

  function focusEditForm(): void {
    window.requestAnimationFrame(() => {
      if (!editNameInput.disabled) {
        editNameInput.focus();
        editNameInput.select();
      }
    });
  }

  function selectIndividual(individualId: string | null): void {
    let nextSelection: string | null = null;

    if (individualId) {
      const exists = latestState.individuals.some((item) => item.id === individualId);
      nextSelection = exists ? individualId : null;
    }

    const changed = nextSelection !== selectedIndividualId;
    selectedIndividualId = nextSelection;

    if (changed && editFeedback) {
      editFeedback.textContent = "";
    }

    renderIndividuals();
    renderSelectedIndividual();
  }

  function renderSelectedIndividual(): void {
    const selected = getSelectedIndividual();
    const hasSelection = selected !== null;

    editNameInput.disabled = !hasSelection;
    editNotesInput.disabled = !hasSelection;
    editSaveButton.disabled = !hasSelection;
    if (clearSelectionButton) {
      clearSelectionButton.disabled = !hasSelection;
    }

    if (!selected) {
      if (editEmptyState) {
        editEmptyState.hidden = false;
      }
      editForm.reset();
      return;
    }

    if (editEmptyState) {
      editEmptyState.hidden = true;
    }

    editNameInput.value = selected.name;
    editNotesInput.value = selected.notes;
  }

  function handleIndividualAction(button: HTMLButtonElement): void {
    const individualId = button.dataset.individualId;

    if (!individualId) {
      return;
    }

    if (button.dataset.action === "edit-individual") {
      selectIndividual(individualId);
      focusEditForm();
    }
  }

  list.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>("button[data-action]");

    if (button) {
      handleIndividualAction(button);
      return;
    }

    const card = target.closest<HTMLElement>("[data-individual-id]");

    if (card?.dataset.individualId) {
      selectIndividual(card.dataset.individualId);
      focusEditForm();
    }
  });

  list.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const target = event.target as HTMLElement;
    const card = target.closest<HTMLElement>("[data-individual-id]");

    if (card?.dataset.individualId) {
      event.preventDefault();
      selectIndividual(card.dataset.individualId);
      focusEditForm();
    }
  });

  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = createNameInput.value.trim();

    if (!name) {
      createNameInput.focus();
      return;
    }

    try {
      const individual = await createIndividual(name);
      createNameInput.value = "";
      if (createFeedback) {
        createFeedback.textContent = `Created individual ${individual.name}.`;
      }
      selectIndividual(individual.id);
      focusEditForm();
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

    if (!name) {
      editNameInput.focus();
      if (editFeedback) {
        editFeedback.textContent = "Provide a display name before saving.";
      }
      return;
    }

    if (name === selected.name && notes === selected.notes) {
      if (editFeedback) {
        editFeedback.textContent = "No changes to save.";
      }
      return;
    }

    try {
      const updated = await updateIndividual({ id: selected.id, name, notes });

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

  if (clearSelectionButton) {
    clearSelectionButton.addEventListener("click", () => {
      selectIndividual(null);
      if (editFeedback) {
        editFeedback.textContent = "";
      }
    });
  }

  subscribe((state) => {
    latestState = state;
    if (selectedIndividualId && !state.individuals.some((item) => item.id === selectedIndividualId)) {
      selectedIndividualId = null;
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
  const createFeedback = document.getElementById("individuals-feedback");
  const editForm = document.getElementById("edit-individual-form");
  const editNameInput = document.getElementById("edit-individual-name");
  const editNotesInput = document.getElementById("edit-individual-notes");
  const editFeedback = document.getElementById("edit-individual-feedback");
  const editEmptyState = document.getElementById("edit-individual-empty");
  const editSaveButton = document.getElementById("save-individual-button");
  const clearSelectionButton = document.getElementById("clear-edit-selection");

  if (
    !(
      list instanceof HTMLDivElement &&
      createForm instanceof HTMLFormElement &&
      createNameInput instanceof HTMLInputElement &&
      editForm instanceof HTMLFormElement &&
      editNameInput instanceof HTMLInputElement &&
      editNotesInput instanceof HTMLTextAreaElement &&
      editSaveButton instanceof HTMLButtonElement
    )
  ) {
    return null;
  }

  return {
    list,
    createForm,
    createNameInput,
    createFeedback: createFeedback instanceof HTMLSpanElement ? createFeedback : null,
    editForm,
    editNameInput,
    editNotesInput,
    editSaveButton,
    editFeedback: editFeedback instanceof HTMLSpanElement ? editFeedback : null,
    editEmptyState: editEmptyState instanceof HTMLParagraphElement ? editEmptyState : null,
    clearSelectionButton: clearSelectionButton instanceof HTMLButtonElement ? clearSelectionButton : null,
  };
}

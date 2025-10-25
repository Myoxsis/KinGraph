import { createIndividual, getState, renameIndividual, subscribe } from "@/storage";
import { formatTimestamp } from "./shared/utils";

interface IndividualsElements {
  list: HTMLDivElement;
  form: HTMLFormElement;
  nameInput: HTMLInputElement;
  feedback: HTMLSpanElement | null;
}

export function initializeIndividualsPage(): void {
  const elements = getIndividualsElements();

  if (!elements) {
    return;
  }

  const { list, form, nameInput, feedback } = elements;

  let latestState = getState();

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

    list.replaceChildren(fragment);
  }

  async function handleIndividualAction(event: MouseEvent): Promise<void> {
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

      if (nextName) {
        const trimmedName = nextName.trim();

        if (!trimmedName || trimmedName === individual.name) {
          return;
        }

        try {
          await renameIndividual(individualId, trimmedName);
          if (feedback) {
            feedback.textContent = `Renamed individual to ${trimmedName}.`;
          }
        } catch (error) {
          console.error("Failed to rename individual", error);
          if (feedback) {
            feedback.textContent = "Unable to rename individual.";
          }
        }
      }
    }
  }

  list.addEventListener("click", (event) => {
    void handleIndividualAction(event as MouseEvent);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();

    if (!name) {
      nameInput.focus();
      return;
    }

    try {
      const individual = await createIndividual(name);
      nameInput.value = "";
      if (feedback) {
        feedback.textContent = `Created individual ${individual.name}.`;
      }
    } catch (error) {
      console.error("Failed to create individual", error);
      if (feedback) {
        feedback.textContent = "Unable to create individual.";
      }
    }
  });

  subscribe((state) => {
    latestState = state;
    renderIndividuals();
  });

  renderIndividuals();
}

function getIndividualsElements(): IndividualsElements | null {
  const list = document.getElementById("individuals-list");
  const form = document.getElementById("create-individual-form");
  const nameInput = document.getElementById("create-individual-name");
  const feedback = document.getElementById("individuals-feedback");

  if (
    !(list instanceof HTMLDivElement && form instanceof HTMLFormElement && nameInput instanceof HTMLInputElement)
  ) {
    return null;
  }

  return {
    list,
    form,
    nameInput,
    feedback: feedback instanceof HTMLSpanElement ? feedback : null,
  };
}

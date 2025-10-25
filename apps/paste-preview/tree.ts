import { getState, subscribe, type StoredIndividual } from "@/storage";
import {
  buildRecordIndex,
  formatLifespan,
  getLatestRecordForIndividual,
  normalizeNameKey,
} from "./shared/utils";
import type { IndividualRecord } from "../../schema";

interface TreeElements {
  container: HTMLDivElement;
  select: HTMLSelectElement;
  searchInput: HTMLInputElement;
  clearButton: HTMLButtonElement;
}

export function initializeTreePage(): void {
  const elements = getTreeElements();

  if (!elements) {
    return;
  }

  const { container, select, searchInput, clearButton } = elements;

  let latestState = getState();
  let selectedTreeIndividualId: string | null = null;
  let treeSearchQuery = "";

  function createTreePersonElement(
    name: string,
    lifespan: string,
    details: string[],
    note?: string,
  ): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "tree-person";

    const title = document.createElement("strong");
    title.textContent = name || "Unnamed individual";
    wrapper.appendChild(title);

    if (lifespan) {
      const span = document.createElement("span");
      span.className = "tree-lifespan";
      span.textContent = lifespan;
      wrapper.appendChild(span);
    }

    for (const detail of details) {
      const info = document.createElement("span");
      info.className = "tree-notes";
      info.textContent = detail;
      wrapper.appendChild(info);
    }

    if (note) {
      const info = document.createElement("span");
      info.className = "tree-notes";
      info.textContent = note;
      wrapper.appendChild(info);
    }

    return wrapper;
  }

  function renderTree(): void {
    container.replaceChildren();

    if (!latestState.individuals.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Add individuals to explore their family tree.";
      container.appendChild(empty);
      return;
    }

    if (!selectedTreeIndividualId) {
      const message = document.createElement("div");
      message.className = "empty-state";
      message.textContent = "Select an individual to view their three-generation tree.";
      container.appendChild(message);
      return;
    }

    const individual = latestState.individuals.find((item) => item.id === selectedTreeIndividualId);

    if (!individual) {
      const missing = document.createElement("div");
      missing.className = "empty-state";
      missing.textContent = "Selected individual not found.";
      container.appendChild(missing);
      return;
    }

    const storedRecord = getLatestRecordForIndividual(individual.id, latestState.records);

    if (!storedRecord) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No records linked to this individual yet.";
      container.appendChild(empty);
      return;
    }

    const recordIndex = buildRecordIndex(latestState.records);
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
      const emptyParents = document.createElement("span");
      emptyParents.className = "tree-empty";
      emptyParents.textContent = "No parents recorded.";
      parentsColumn.appendChild(emptyParents);
    } else {
      if (fatherName) {
        const fatherRecord = recordIndex.get(normalizeNameKey(fatherName));
        parentsColumn.appendChild(
          createTreePersonElement(
            fatherName,
            fatherRecord ? formatLifespan(fatherRecord.record) : "",
            buildDetails(fatherRecord?.record ?? null),
          ),
        );
      }

      if (motherName) {
        const motherRecord = recordIndex.get(normalizeNameKey(motherName));
        parentsColumn.appendChild(
          createTreePersonElement(
            motherName,
            motherRecord ? formatLifespan(motherRecord.record) : "",
            buildDetails(motherRecord?.record ?? null),
          ),
        );
      }
    }

    const rootColumn = document.createElement("div");
    rootColumn.className = "tree-generation";
    const rootHeading = document.createElement("h3");
    rootHeading.textContent = "Individual";
    rootColumn.appendChild(rootHeading);
    rootColumn.appendChild(
      createTreePersonElement(
        individual.name,
        formatLifespan(storedRecord.record),
        buildDetails(storedRecord.record, true),
      ),
    );

    const childrenColumn = document.createElement("div");
    childrenColumn.className = "tree-generation";
    const childrenHeading = document.createElement("h3");
    childrenHeading.textContent = "Children";
    childrenColumn.appendChild(childrenHeading);

    if (!storedRecord.record.children.length) {
      const emptyChildren = document.createElement("span");
      emptyChildren.className = "tree-empty";
      emptyChildren.textContent = "No children recorded.";
      childrenColumn.appendChild(emptyChildren);
    } else {
      for (const childName of storedRecord.record.children) {
        const childRecord = recordIndex.get(normalizeNameKey(childName));
        childrenColumn.appendChild(
          createTreePersonElement(
            childName,
            childRecord ? formatLifespan(childRecord.record) : "",
            buildDetails(childRecord?.record ?? null),
          ),
        );
      }
    }

    grid.append(parentsColumn, rootColumn, childrenColumn);
    container.appendChild(grid);
  }

  function buildDetails(record: IndividualRecord | null, showRelationships = false): string[] {
    if (!record) {
      return ["No detailed record yet."];
    }

    const details: string[] = [];

    if (record.birth.place) {
      details.push(`Birth: ${record.birth.place}`);
    }

    if (record.death.place) {
      details.push(`Death: ${record.death.place}`);
    }

    if (showRelationships && record.spouses.length) {
      details.push(`Spouses: ${record.spouses.join(", ")}`);
    }

    if (record.residences.length) {
      const summary = record.residences
        .slice(0, 2)
        .map((residence) => residence.place || residence.raw || "Residence")
        .join(" · ");
      if (summary) {
        details.push(`Residences: ${summary}`);
      }
    }

    if (record.occupation) {
      details.push(`Occupation: ${record.occupation}`);
    }

    return details;
  }

  function populateTreeOptions(individuals: StoredIndividual[]): void {
    const previousValue = select.value;
    const filtered = individuals
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((individual) => individual.name.toLowerCase().includes(treeSearchQuery));

    select.replaceChildren();

    if (!individuals.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No individuals available";
      select.appendChild(option);
      select.disabled = true;
      return;
    }

    select.disabled = false;

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select an individual";
    select.appendChild(placeholder);

    if (!filtered.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No individuals match search";
      option.disabled = true;
      select.appendChild(option);
    } else {
      for (const individual of filtered) {
        const option = document.createElement("option");
        option.value = individual.id;
        option.textContent = individual.name;
        select.appendChild(option);
      }
    }

    if (previousValue) {
      select.value = previousValue;
      if (select.value !== previousValue) {
        select.value = "";
      }
    }
  }

  searchInput.addEventListener("input", () => {
    treeSearchQuery = searchInput.value.trim().toLowerCase();
    populateTreeOptions(latestState.individuals);
  });

  select.addEventListener("change", () => {
    selectedTreeIndividualId = select.value || null;
    renderTree();
  });

  clearButton.addEventListener("click", () => {
    selectedTreeIndividualId = null;
    select.value = "";
    renderTree();
  });

  subscribe((state) => {
    latestState = state;
    populateTreeOptions(state.individuals);
    renderTree();
  });

  populateTreeOptions(latestState.individuals);
  renderTree();
}

function getTreeElements(): TreeElements | null {
  const container = document.getElementById("tree-container");
  const select = document.getElementById("tree-individual-select");
  const searchInput = document.getElementById("tree-search");
  const clearButton = document.getElementById("tree-clear");

  if (
    !(
      container instanceof HTMLDivElement &&
      select instanceof HTMLSelectElement &&
      searchInput instanceof HTMLInputElement &&
      clearButton instanceof HTMLButtonElement
    )
  ) {
    return null;
  }

  return { container, select, searchInput, clearButton };
}

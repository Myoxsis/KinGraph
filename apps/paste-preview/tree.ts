import {
  cloneIndividualProfile,
  getState,
  normalizeProfile,
  subscribe,
  type IndividualProfile,
  type StoredIndividual,
} from "@/storage";
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
    const fallbackProfile = storedRecord ? recordToProfile(storedRecord.record) : null;
    const mergedProfile = mergeProfiles(individual.profile, fallbackProfile);

    if (!profileHasContent(mergedProfile) && !fallbackProfile) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No validated data or linked records for this individual yet.";
      container.appendChild(empty);
      return;
    }

    const recordIndex = buildRecordIndex(latestState.records);
    const individualIndex = new Map<string, StoredIndividual>();
    for (const entry of latestState.individuals) {
      individualIndex.set(normalizeNameKey(entry.name), entry);
    }
    const resolvedProfiles = new Map<string, IndividualProfile | null>();

    function resolveProfileByName(name: string): IndividualProfile | null {
      const key = normalizeNameKey(name);
      if (resolvedProfiles.has(key)) {
        return resolvedProfiles.get(key) ?? null;
      }

      let profile: IndividualProfile | null = null;
      const storedIndividual = individualIndex.get(key);
      if (storedIndividual) {
        const fallback = getLatestRecordForIndividual(storedIndividual.id, latestState.records);
        const fallbackData = fallback ? recordToProfile(fallback.record) : null;
        profile = mergeProfiles(storedIndividual.profile, fallbackData);
      } else {
        const stored = recordIndex.get(key);
        if (stored) {
          profile = recordToProfile(stored.record);
        }
      }

      resolvedProfiles.set(key, profile);
      return profile;
    }

    const grid = document.createElement("div");
    grid.className = "tree-grid";

    const parentsColumn = document.createElement("div");
    parentsColumn.className = "tree-generation";
    const parentsHeading = document.createElement("h3");
    parentsHeading.textContent = "Parents";
    parentsColumn.appendChild(parentsHeading);

    const fatherName = mergedProfile.parents.father;
    const motherName = mergedProfile.parents.mother;

    if (!fatherName && !motherName) {
      const emptyParents = document.createElement("span");
      emptyParents.className = "tree-empty";
      emptyParents.textContent = "No parents recorded.";
      parentsColumn.appendChild(emptyParents);
    } else {
      if (fatherName) {
        const fatherProfile = resolveProfileByName(fatherName);
        parentsColumn.appendChild(
          createTreePersonElement(
            fatherName,
            fatherProfile ? formatLifespan(fatherProfile) : "",
            buildDetails(fatherProfile),
          ),
        );
      }

      if (motherName) {
        const motherProfile = resolveProfileByName(motherName);
        parentsColumn.appendChild(
          createTreePersonElement(
            motherName,
            motherProfile ? formatLifespan(motherProfile) : "",
            buildDetails(motherProfile),
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
        formatLifespan(mergedProfile),
        buildDetails(mergedProfile, true),
      ),
    );

    const childrenColumn = document.createElement("div");
    childrenColumn.className = "tree-generation";
    const childrenHeading = document.createElement("h3");
    childrenHeading.textContent = "Children";
    childrenColumn.appendChild(childrenHeading);

    if (!mergedProfile.children.length) {
      const emptyChildren = document.createElement("span");
      emptyChildren.className = "tree-empty";
      emptyChildren.textContent = "No children recorded.";
      childrenColumn.appendChild(emptyChildren);
    } else {
      for (const childName of mergedProfile.children) {
        const childProfile = resolveProfileByName(childName);
        childrenColumn.appendChild(
          createTreePersonElement(
            childName,
            childProfile ? formatLifespan(childProfile) : "",
            buildDetails(childProfile),
          ),
        );
      }
    }

    grid.append(parentsColumn, rootColumn, childrenColumn);
    container.appendChild(grid);
  }

  function buildDetails(profile: IndividualProfile | null, showRelationships = false): string[] {
    if (!profile) {
      return ["No detailed record yet."];
    }

    const details: string[] = [];

    if (profile.birth.place) {
      details.push(`Birth: ${profile.birth.place}`);
    }

    if (profile.death.place) {
      details.push(`Death: ${profile.death.place}`);
    }

    if (showRelationships && profile.spouses.length) {
      details.push(`Spouses: ${profile.spouses.join(", ")}`);
    }

    if (profile.residences.length) {
      const summary = profile.residences
        .slice(0, 2)
        .map((residence) => residence.place || residence.raw || "Residence")
        .join(" · ");
      if (summary) {
        details.push(`Residences: ${summary}`);
      }
    }

    if (profile.occupation) {
      details.push(`Occupation: ${profile.occupation}`);
    }

    if (!details.length) {
      details.push("No detailed record yet.");
    }

    return details;
  }

  function recordToProfile(record: IndividualRecord): IndividualProfile {
    return normalizeProfile({
      givenNames: record.givenNames,
      surname: record.surname,
      maidenName: record.maidenName,
      aliases: record.aliases,
      sex: record.sex,
      birth: record.birth,
      death: record.death,
      residences: record.residences,
      parents: record.parents,
      spouses: record.spouses,
      children: record.children,
      siblings: record.siblings,
      occupation: record.occupation,
      religion: record.religion,
      notes: record.notes,
    });
  }

  function mergeProfiles(primary: IndividualProfile, fallback: IndividualProfile | null): IndividualProfile {
    const merged = cloneIndividualProfile(primary);

    if (!fallback) {
      return merged;
    }

    if (!merged.givenNames.length && fallback.givenNames.length) {
      merged.givenNames = [...fallback.givenNames];
    }
    if (!merged.aliases.length && fallback.aliases.length) {
      merged.aliases = [...fallback.aliases];
    }
    if (!merged.spouses.length && fallback.spouses.length) {
      merged.spouses = [...fallback.spouses];
    }
    if (!merged.children.length && fallback.children.length) {
      merged.children = [...fallback.children];
    }
    if (!merged.siblings.length && fallback.siblings.length) {
      merged.siblings = [...fallback.siblings];
    }
    if (!merged.residences.length && fallback.residences.length) {
      merged.residences = fallback.residences.map((residence) => ({ ...residence }));
    }

    if (!merged.surname && fallback.surname) {
      merged.surname = fallback.surname;
    }
    if (!merged.maidenName && fallback.maidenName) {
      merged.maidenName = fallback.maidenName;
    }
    if (!merged.sex && fallback.sex) {
      merged.sex = fallback.sex;
    }

    const birth = merged.birth;
    const fallbackBirth = fallback.birth;
    if (!birth.raw && fallbackBirth.raw) {
      birth.raw = fallbackBirth.raw;
    }
    if (birth.year === undefined && fallbackBirth.year !== undefined) {
      birth.year = fallbackBirth.year;
    }
    if (birth.month === undefined && fallbackBirth.month !== undefined) {
      birth.month = fallbackBirth.month;
    }
    if (birth.day === undefined && fallbackBirth.day !== undefined) {
      birth.day = fallbackBirth.day;
    }
    if (birth.approx === undefined && fallbackBirth.approx !== undefined) {
      birth.approx = fallbackBirth.approx;
    }
    if (!birth.place && fallbackBirth.place) {
      birth.place = fallbackBirth.place;
    }

    const death = merged.death;
    const fallbackDeath = fallback.death;
    if (!death.raw && fallbackDeath.raw) {
      death.raw = fallbackDeath.raw;
    }
    if (death.year === undefined && fallbackDeath.year !== undefined) {
      death.year = fallbackDeath.year;
    }
    if (death.month === undefined && fallbackDeath.month !== undefined) {
      death.month = fallbackDeath.month;
    }
    if (death.day === undefined && fallbackDeath.day !== undefined) {
      death.day = fallbackDeath.day;
    }
    if (death.approx === undefined && fallbackDeath.approx !== undefined) {
      death.approx = fallbackDeath.approx;
    }
    if (!death.place && fallbackDeath.place) {
      death.place = fallbackDeath.place;
    }

    if (!merged.parents.father && fallback.parents.father) {
      merged.parents.father = fallback.parents.father;
    }
    if (!merged.parents.mother && fallback.parents.mother) {
      merged.parents.mother = fallback.parents.mother;
    }

    if (!merged.occupation && fallback.occupation) {
      merged.occupation = fallback.occupation;
    }
    if (!merged.religion && fallback.religion) {
      merged.religion = fallback.religion;
    }
    if (!merged.notes && fallback.notes) {
      merged.notes = fallback.notes;
    }

    return merged;
  }

  function profileHasContent(profile: IndividualProfile): boolean {
    if (
      profile.givenNames.length ||
      profile.aliases.length ||
      profile.spouses.length ||
      profile.children.length ||
      profile.siblings.length ||
      profile.residences.length
    ) {
      return true;
    }

    if (
      profile.surname ||
      profile.maidenName ||
      profile.parents.father ||
      profile.parents.mother ||
      profile.occupation ||
      profile.religion ||
      profile.notes ||
      profile.sex
    ) {
      return true;
    }

    if (
      profile.birth.raw ||
      profile.birth.place ||
      profile.birth.year !== undefined ||
      profile.birth.month !== undefined ||
      profile.birth.day !== undefined
    ) {
      return true;
    }

    if (
      profile.death.raw ||
      profile.death.place ||
      profile.death.year !== undefined ||
      profile.death.month !== undefined ||
      profile.death.day !== undefined
    ) {
      return true;
    }

    return false;
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

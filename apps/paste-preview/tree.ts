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
import { initializeWorkspaceSearch } from "./shared/search";
import type { IndividualRecord } from "../../schema";

interface TreeElements {
  container: HTMLDivElement;
  select: HTMLSelectElement;
  clearButton: HTMLButtonElement;
  workspaceSearchForm: HTMLFormElement | null;
  workspaceSearchInput: HTMLInputElement;
  workspaceSearchClear: HTMLButtonElement | null;
}

export function initializeTreePage(): void {
  const elements = getTreeElements();

  if (!elements) {
    return;
  }

  const {
    container,
    select,
    clearButton,
    workspaceSearchForm,
    workspaceSearchInput,
    workspaceSearchClear,
  } = elements;

  let latestState = getState();
  let selectedTreeIndividualId: string | null = null;
  let treeSearchQuery = "";

  const maybeSearchHandle = initializeWorkspaceSearch({
    elements: {
      form: workspaceSearchForm ?? undefined,
      input: workspaceSearchInput,
      clearButton: workspaceSearchClear ?? undefined,
    },
    onInput: (value) => {
      treeSearchQuery = value.toLowerCase();
      populateTreeOptions(latestState.individuals);
    },
    onSubmit: (value) => {
      treeSearchQuery = value.toLowerCase();
      populateTreeOptions(latestState.individuals);
      if (select.value) {
        renderTree();
      }
    },
  });

  if (!maybeSearchHandle) {
    return;
  }

  const searchHandle = maybeSearchHandle;

  treeSearchQuery = searchHandle.getValue().toLowerCase();

  type TreePersonRelationship = "focus" | "parent" | "child";

  interface TreePersonOptions {
    relationship?: TreePersonRelationship;
    sex?: IndividualProfile["sex"] | null;
    id?: string | null;
  }

  function createTreePersonElement(
    name: string,
    lifespan: string,
    details: string[],
    note?: string,
    options: TreePersonOptions = {},
  ): HTMLElement {
    const classes = ["tree-person"];

    if (options.relationship) {
      classes.push(`tree-person--${options.relationship}`);
    }

    const sexClass = getSexClass(options.sex ?? null);
    if (sexClass) {
      classes.push(`tree-person--${sexClass}`);
    }

    if (options.id) {
      classes.push("tree-person--interactive");
    }

    const wrapper = document.createElement("article");
    wrapper.className = classes.join(" ");

    const header = document.createElement("header");
    header.className = "tree-person-header";

    const primary = document.createElement("div");
    primary.className = "tree-person-primary";

    const avatar = document.createElement("span");
    avatar.className = "tree-person-avatar";
    avatar.textContent = getAvatarInitial(name);
    avatar.setAttribute("aria-hidden", "true");
    primary.appendChild(avatar);

    const identity = document.createElement("div");
    identity.className = "tree-person-identity";

    const title = document.createElement("strong");
    title.textContent = name || "Unnamed individual";
    identity.appendChild(title);

    if (lifespan) {
      const span = document.createElement("span");
      span.className = "tree-lifespan";
      span.textContent = lifespan;
      identity.appendChild(span);
    }

    primary.appendChild(identity);
    header.appendChild(primary);

    const relationshipLabel = options.relationship
      ? getRelationshipLabel(options.relationship)
      : null;

    if (relationshipLabel) {
      const role = document.createElement("span");
      role.className = "tree-person-role";
      role.textContent = relationshipLabel;
      header.appendChild(role);
    }

    wrapper.appendChild(header);

    if (details.length || note) {
      const detailsWrapper = document.createElement("div");
      detailsWrapper.className = "tree-person-details";

      for (const detail of details) {
        const info = document.createElement("span");
        info.className = "tree-notes";
        info.textContent = detail;
        detailsWrapper.appendChild(info);
      }

      if (note) {
        const info = document.createElement("span");
        info.className = "tree-notes";
        info.textContent = note;
        detailsWrapper.appendChild(info);
      }

      wrapper.appendChild(detailsWrapper);
    }

    if (options.id) {
      const personId = options.id;
      wrapper.dataset.individualId = personId;
      wrapper.addEventListener("dblclick", () => {
        selectedTreeIndividualId = personId;
        select.value = personId;
        if (select.value !== personId) {
          select.value = "";
        }
        renderTree();
      });
    }

    return wrapper;
  }

  function getSexClass(sex: IndividualProfile["sex"] | null): string | null {
    if (sex === "M") {
      return "male";
    }
    if (sex === "F") {
      return "female";
    }
    if (sex === "U") {
      return "unknown";
    }
    return null;
  }

  function getAvatarInitial(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) {
      return "?";
    }

    const match = trimmed.match(/^[\p{L}\p{N}]/u);
    return match ? match[0].toUpperCase() : trimmed[0].toUpperCase();
  }

  function getRelationshipLabel(relationship: TreePersonRelationship): string {
    switch (relationship) {
      case "focus":
        return "Focus";
      case "parent":
        return "Parent";
      case "child":
        return "Child";
      default:
        return "";
    }
  }

  function renderTree(): void {
    container.replaceChildren();

    const recordCount = latestState.records.length;
    const individualCount = latestState.individuals.length;
    const navRecordCount = document.getElementById("nav-record-count");
    const navIndividualCount = document.getElementById("nav-individual-count");
    const treeMetric = document.getElementById("metric-tree-individuals");

    if (navRecordCount) {
      navRecordCount.textContent = recordCount.toString();
    }

    if (navIndividualCount) {
      navIndividualCount.textContent = individualCount.toString();
    }

    if (treeMetric) {
      treeMetric.textContent = individualCount.toString();
    }

    if (!selectedTreeIndividualId) {
      select.value = "";
    } else {
      select.value = selectedTreeIndividualId;
      if (select.value !== selectedTreeIndividualId) {
        select.value = "";
      }
    }

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

    const tree = document.createElement("div");
    tree.className = "genealogy-tree";

    const fatherName = mergedProfile.parents.father;
    const motherName = mergedProfile.parents.mother;
    const hasParents = Boolean(fatherName || motherName);
    const hasChildren = mergedProfile.children.length > 0;

    const parentsLevel = document.createElement("section");
    parentsLevel.className = "genealogy-level genealogy-parents";
    parentsLevel.appendChild(createTreeHeading("Parents"));

    if (hasParents) {
      const branches = document.createElement("div");
      branches.className = "genealogy-branches";
      parentsLevel.classList.add("genealogy-level--bottom-line");

      if (fatherName) {
        const fatherProfile = resolveProfileByName(fatherName);
        const fatherStored = individualIndex.get(normalizeNameKey(fatherName));
        branches.appendChild(
          createGenealogyBranch(
            createTreePersonElement(
              fatherName,
              fatherProfile ? formatLifespan(fatherProfile) : "",
              buildDetails(fatherProfile),
              undefined,
              {
                relationship: "parent",
                sex: fatherProfile?.sex ?? "M",
                id: fatherStored?.id ?? null,
              },
            ),
            ["down"],
          ),
        );
      }

      if (motherName) {
        const motherProfile = resolveProfileByName(motherName);
        const motherStored = individualIndex.get(normalizeNameKey(motherName));
        branches.appendChild(
          createGenealogyBranch(
            createTreePersonElement(
              motherName,
              motherProfile ? formatLifespan(motherProfile) : "",
              buildDetails(motherProfile),
              undefined,
              {
                relationship: "parent",
                sex: motherProfile?.sex ?? "F",
                id: motherStored?.id ?? null,
              },
            ),
            ["down"],
          ),
        );
      }

      parentsLevel.appendChild(branches);
    } else {
      parentsLevel.appendChild(createTreeEmptyMessage("No parents recorded."));
    }

    const rootLevel = document.createElement("section");
    rootLevel.className = "genealogy-level genealogy-root";
    rootLevel.appendChild(createTreeHeading("Individual"));
    const rootBranches = document.createElement("div");
    rootBranches.className = "genealogy-branches genealogy-branches--single";
    const rootConnectors: Array<"up" | "down"> = [];
    if (hasParents) {
      rootConnectors.push("up");
    }
    if (hasChildren) {
      rootConnectors.push("down");
    }

    rootBranches.appendChild(
      createGenealogyBranch(
        createTreePersonElement(
          individual.name,
          formatLifespan(mergedProfile),
          buildDetails(mergedProfile, true),
          undefined,
          {
            relationship: "focus",
            sex: mergedProfile.sex ?? null,
            id: individual.id,
          },
        ),
        rootConnectors,
      ),
    );
    rootLevel.appendChild(rootBranches);

    const childrenLevel = document.createElement("section");
    childrenLevel.className = "genealogy-level genealogy-children";
    childrenLevel.appendChild(createTreeHeading("Children"));

    if (hasChildren) {
      const branches = document.createElement("div");
      branches.className = "genealogy-branches";
      childrenLevel.classList.add("genealogy-level--top-line");

      for (const childName of mergedProfile.children) {
        const childProfile = resolveProfileByName(childName);
        const childStored = individualIndex.get(normalizeNameKey(childName));
        branches.appendChild(
          createGenealogyBranch(
            createTreePersonElement(
              childName,
              childProfile ? formatLifespan(childProfile) : "",
              buildDetails(childProfile),
              undefined,
              {
                relationship: "child",
                sex: childProfile?.sex ?? null,
                id: childStored?.id ?? null,
              },
            ),
            ["up"],
          ),
        );
      }

      childrenLevel.appendChild(branches);
    } else {
      childrenLevel.appendChild(createTreeEmptyMessage("No children recorded."));
    }

    tree.append(parentsLevel, rootLevel, childrenLevel);
    container.appendChild(tree);
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
    workspaceSearchInput.disabled = individuals.length === 0;
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
  const clearButton = document.getElementById("tree-clear");
  const workspaceSearchForm = document.getElementById("workspace-search-form");
  const workspaceSearchInput = document.getElementById("workspace-search");
  const workspaceSearchClear = document.getElementById("workspace-search-clear");

  if (
    !(
      container instanceof HTMLDivElement &&
      select instanceof HTMLSelectElement &&
      clearButton instanceof HTMLButtonElement &&
      workspaceSearchInput instanceof HTMLInputElement
    )
  ) {
    return null;
  }

  return {
    container,
    select,
    clearButton,
    workspaceSearchForm: workspaceSearchForm instanceof HTMLFormElement ? workspaceSearchForm : null,
    workspaceSearchInput,
    workspaceSearchClear:
      workspaceSearchClear instanceof HTMLButtonElement ? workspaceSearchClear : null,
  };
}

function createGenealogyBranch(
  content: HTMLElement,
  connectors: Array<"up" | "down">,
): HTMLDivElement {
  const branch = document.createElement("div");
  branch.className = "genealogy-branch";

  if (connectors.includes("up")) {
    branch.appendChild(createConnector("up"));
  }

  branch.appendChild(content);

  if (connectors.includes("down")) {
    branch.appendChild(createConnector("down"));
  }

  return branch;
}

function createConnector(direction: "up" | "down"): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = `genealogy-connector genealogy-connector-${direction}`;
  span.setAttribute("aria-hidden", "true");
  return span;
}

function createTreeHeading(label: string): HTMLHeadingElement {
  const heading = document.createElement("h3");
  heading.className = "genealogy-heading";
  heading.textContent = label;
  return heading;
}

function createTreeEmptyMessage(message: string): HTMLSpanElement {
  const empty = document.createElement("span");
  empty.className = "tree-empty";
  empty.textContent = message;
  return empty;
}

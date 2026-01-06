import { getState, subscribe, type StoredIndividual, type StoredRecord } from "@/storage";
import { formatLifespan } from "./shared/utils";

interface NetworkElements {
  container: HTMLDivElement;
  nodeMetric: HTMLSpanElement | null;
  linkMetric: HTMLSpanElement | null;
  recordMetric: HTMLSpanElement | null;
  navRecordCount: HTMLSpanElement | null;
  navIndividualCount: HTMLSpanElement | null;
}

type NetworkNodeType = "individual" | "record" | "unlinked";

type NetworkLinkType = "relationship" | "record";

interface NetworkNode {
  id: string;
  label: string;
  subtitle?: string;
  type: NetworkNodeType;
  anchorId?: string;
}

interface NetworkLink {
  sourceId: string;
  targetId: string;
  type: NetworkLinkType;
}

interface LayoutPosition {
  x: number;
  y: number;
  angle?: number;
}

export function initializeNetworkPage(): void {
  const elements = getNetworkElements();

  if (!elements) {
    return;
  }

  const { container } = elements;

  let latestState = getState();
  let currentNodes: NetworkNode[] = [];
  let currentLinks: NetworkLink[] = [];
  let currentStage: HTMLDivElement | null = null;
  let currentSvg: SVGSVGElement | null = null;
  let currentNodesLayer: HTMLDivElement | null = null;

  const resizeObserver = new ResizeObserver(() => {
    if (currentStage) {
      layoutNetwork(currentStage, currentSvg, currentNodesLayer, currentNodes, currentLinks);
    }
  });

  resizeObserver.observe(container);

  function updateNavCounts(): void {
    if (elements.navRecordCount) {
      elements.navRecordCount.textContent = latestState.records.length.toString();
    }

    if (elements.navIndividualCount) {
      elements.navIndividualCount.textContent = latestState.individuals.length.toString();
    }
  }

  function renderNetwork(): void {
    const { nodes, links } = buildNetworkGraph(latestState);
    currentNodes = nodes;
    currentLinks = links;

    updateNavCounts();

    if (elements.nodeMetric) {
      elements.nodeMetric.textContent = nodes.length.toString();
    }

    if (elements.linkMetric) {
      elements.linkMetric.textContent = links.length.toString();
    }

    if (elements.recordMetric) {
      elements.recordMetric.textContent = latestState.records.length.toString();
    }

    container.replaceChildren();

    if (!nodes.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No individuals yet. Add records to visualize the collaboration network.";
      container.appendChild(empty);
      currentStage = null;
      currentSvg = null;
      currentNodesLayer = null;
      return;
    }

    const stage = document.createElement("div");
    stage.className = "network-diagram";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("network-links");
    svg.setAttribute("aria-hidden", "true");

    const nodesLayer = document.createElement("div");
    nodesLayer.className = "network-nodes";

    stage.appendChild(svg);
    stage.appendChild(nodesLayer);

    container.appendChild(stage);

    currentStage = stage;
    currentSvg = svg;
    currentNodesLayer = nodesLayer;

    requestAnimationFrame(() => {
      layoutNetwork(stage, svg, nodesLayer, nodes, links);
    });
  }

  subscribe((state) => {
    latestState = state;
    renderNetwork();
  });

  renderNetwork();
}

function buildNetworkGraph(state: ReturnType<typeof getState>): {
  nodes: NetworkNode[];
  links: NetworkLink[];
} {
  const nodes: NetworkNode[] = [];
  const links: NetworkLink[] = [];
  const individualNodes = new Map<string, NetworkNode>();

  for (const individual of state.individuals) {
    const label = individual.name || "Unnamed individual";
    const lifespan = formatLifespan(individual.profile);
    const node: NetworkNode = {
      id: `individual:${individual.id}`,
      label,
      subtitle: lifespan || "No lifespan data",
      type: "individual",
    };
    nodes.push(node);
    individualNodes.set(individual.id, node);
  }

  const latestRecordByIndividual = new Map<string, StoredRecord>();
  let unlinkedCount = 0;

  for (const record of state.records) {
    if (!record.individualId) {
      unlinkedCount += 1;
      continue;
    }

    const existing = latestRecordByIndividual.get(record.individualId);
    if (!existing || existing.createdAt < record.createdAt) {
      latestRecordByIndividual.set(record.individualId, record);
    }
  }

  for (const [individualId, record] of latestRecordByIndividual) {
    const individualNode = individualNodes.get(individualId);
    if (!individualNode) {
      continue;
    }

    const recordNode: NetworkNode = {
      id: `record:${record.id}`,
      label: "Latest record",
      subtitle: record.summary || "Record summary unavailable",
      type: "record",
      anchorId: individualNode.id,
    };

    nodes.push(recordNode);
    links.push({
      sourceId: individualNode.id,
      targetId: recordNode.id,
      type: "record",
    });
  }

  if (unlinkedCount > 0) {
    nodes.push({
      id: "record:unlinked",
      label: "Unlinked records",
      subtitle: `${unlinkedCount} waiting for a match`,
      type: "unlinked",
    });
  }

  const relationshipLinks = new Set<string>();

  for (const individual of state.individuals) {
    addRelationshipLink(links, relationshipLinks, individualNodes, individual, individual.profile.linkedParents.father);
    addRelationshipLink(links, relationshipLinks, individualNodes, individual, individual.profile.linkedParents.mother);

    for (const spouseId of individual.profile.linkedSpouses) {
      addRelationshipLink(links, relationshipLinks, individualNodes, individual, spouseId);
    }

    for (const childId of individual.profile.linkedChildren) {
      addRelationshipLink(links, relationshipLinks, individualNodes, individual, childId);
    }
  }

  return { nodes, links };
}

function addRelationshipLink(
  links: NetworkLink[],
  linkSet: Set<string>,
  individualNodes: Map<string, NetworkNode>,
  individual: StoredIndividual,
  targetId?: string,
): void {
  if (!targetId) {
    return;
  }

  const sourceNode = individualNodes.get(individual.id);
  const targetNode = individualNodes.get(targetId);

  if (!sourceNode || !targetNode) {
    return;
  }

  const key = [sourceNode.id, targetNode.id].sort().join("|");

  if (linkSet.has(key)) {
    return;
  }

  linkSet.add(key);
  links.push({ sourceId: sourceNode.id, targetId: targetNode.id, type: "relationship" });
}

function layoutNetwork(
  stage: HTMLDivElement,
  svg: SVGSVGElement | null,
  nodesLayer: HTMLDivElement | null,
  nodes: NetworkNode[],
  links: NetworkLink[],
): void {
  if (!svg || !nodesLayer) {
    return;
  }

  const { clientWidth: width, clientHeight: height } = stage;

  if (!width || !height) {
    return;
  }

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.38;
  const recordRadius = radius * 0.62;
  const individualNodes = nodes.filter((node) => node.type === "individual");
  const recordNodes = nodes.filter((node) => node.type === "record");
  const unlinkedNode = nodes.find((node) => node.type === "unlinked");

  const positionById = new Map<string, LayoutPosition>();

  const angleStep = individualNodes.length > 0 ? (Math.PI * 2) / individualNodes.length : 0;

  individualNodes.forEach((node, index) => {
    const angle = angleStep * index - Math.PI / 2;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    positionById.set(node.id, { x, y, angle });
  });

  for (const recordNode of recordNodes) {
    if (!recordNode.anchorId) {
      continue;
    }

    const anchor = positionById.get(recordNode.anchorId);
    if (!anchor) {
      continue;
    }

    const angle = anchor.angle ?? 0;
    const x = centerX + Math.cos(angle) * recordRadius;
    const y = centerY + Math.sin(angle) * recordRadius;
    positionById.set(recordNode.id, { x, y });
  }

  if (unlinkedNode) {
    positionById.set(unlinkedNode.id, { x: centerX, y: centerY });
  }

  nodesLayer.replaceChildren();
  svg.innerHTML = "";

  for (const link of links) {
    const source = positionById.get(link.sourceId);
    const target = positionById.get(link.targetId);

    if (!source || !target) {
      continue;
    }

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", source.x.toString());
    line.setAttribute("y1", source.y.toString());
    line.setAttribute("x2", target.x.toString());
    line.setAttribute("y2", target.y.toString());
    line.classList.add("network-link", `network-link--${link.type}`);
    svg.appendChild(line);
  }

  for (const node of nodes) {
    const position = positionById.get(node.id);
    if (!position) {
      continue;
    }

    const nodeElement = document.createElement("div");
    nodeElement.className = `network-node network-node--${node.type}`;
    nodeElement.style.left = `${position.x}px`;
    nodeElement.style.top = `${position.y}px`;

    const label = document.createElement("strong");
    label.textContent = node.label;
    nodeElement.appendChild(label);

    if (node.subtitle) {
      const subtitle = document.createElement("span");
      subtitle.textContent = node.subtitle;
      nodeElement.appendChild(subtitle);
    }

    nodesLayer.appendChild(nodeElement);
  }
}

function getNetworkElements(): NetworkElements | null {
  const container = document.querySelector<HTMLDivElement>("#network-container");

  if (!container) {
    return null;
  }

  return {
    container,
    nodeMetric: document.querySelector<HTMLSpanElement>("#metric-network-nodes"),
    linkMetric: document.querySelector<HTMLSpanElement>("#metric-network-links"),
    recordMetric: document.querySelector<HTMLSpanElement>("#metric-network-records"),
    navRecordCount: document.querySelector<HTMLSpanElement>("#nav-record-count"),
    navIndividualCount: document.querySelector<HTMLSpanElement>("#nav-individual-count"),
  };
}

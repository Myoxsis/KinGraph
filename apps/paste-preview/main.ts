import { initializeIndividualsPage } from "./individuals";
import { initializeRecordsPage } from "./records";
import { initializeSettingsPage } from "./settings";
import { initializeTreePage } from "./tree";
import { initializeGedcomPage } from "./gedcom";
import { initializeNetworkPage } from "./network";

type PageName = "records" | "individuals" | "tree" | "network" | "settings" | "gedcom";

function getPageName(): PageName {
  const value = document.body.dataset.page as PageName | undefined;
  switch (value) {
    case "individuals":
    case "tree":
    case "network":
    case "settings":
    case "gedcom":
      return value;
    case "records":
    default:
      return "records";
  }
}

const page = getPageName();

switch (page) {
  case "records":
    initializeRecordsPage();
    break;
  case "individuals":
    initializeIndividualsPage();
    break;
  case "tree":
    initializeTreePage();
    break;
  case "network":
    initializeNetworkPage();
    break;
  case "settings":
    initializeSettingsPage();
    break;
  case "gedcom":
    initializeGedcomPage();
    break;
  default:
    initializeRecordsPage();
    break;
}

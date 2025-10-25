import { initializeIndividualsPage } from "./individuals";
import { initializeRecordsPage } from "./records";
import { initializeSettingsPage } from "./settings";
import { initializeTreePage } from "./tree";

type PageName = "records" | "individuals" | "tree" | "settings";

function getPageName(): PageName {
  const value = document.body.dataset.page as PageName | undefined;
  switch (value) {
    case "individuals":
    case "tree":
    case "settings":
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
  case "settings":
    initializeSettingsPage();
    break;
  default:
    initializeRecordsPage();
    break;
}

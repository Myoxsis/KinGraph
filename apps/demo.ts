import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractIndividual } from "../extract";
import { scoreConfidence } from "../confidence";
import { IndividualRecordSchema } from "../schema";

function getDefaultFixturePath(): string {
  const fixtureUrl = new URL("../tests/fixtures/narrative.html", import.meta.url);
  return fileURLToPath(fixtureUrl);
}

async function loadHtml(inputPath?: string): Promise<{ html: string; description: string }> {
  if (inputPath) {
    const fullPath = resolve(process.cwd(), inputPath);
    const html = await readFile(fullPath, "utf8");
    return { html, description: fullPath };
  }

  const defaultPath = getDefaultFixturePath();
  const html = await readFile(defaultPath, "utf8");
  return { html, description: `${defaultPath} (built-in sample)` };
}

async function main() {
  const [, , inputPath] = process.argv;
  const { html, description } = await loadHtml(inputPath);

  const record = extractIndividual(html);
  const validated = IndividualRecordSchema.parse(record);
  const confidence = scoreConfidence(validated);

  console.log(`KinGraph demo run using: ${description}`);
  console.log("==============================\n");
  console.log(JSON.stringify({ record: validated, confidence }, null, 2));
}

main().catch((error) => {
  console.error("KinGraph demo failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

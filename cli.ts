import { stdin, stdout, stderr, exit } from "node:process";
import { ZodError } from "zod";
import { extractIndividual } from "./extract";
import { IndividualRecordSchema } from "./schema";

async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(chunk);
    }
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const html = await readAllStdin();

  if (!html.trim()) {
    stderr.write("No HTML input provided on stdin.\n");
    exit(1);
  }

  const record = extractIndividual(html);

  try {
    const validated = IndividualRecordSchema.parse(record);
    stdout.write(`${JSON.stringify(validated, null, 2)}\n`);
  } catch (error) {
    if (error instanceof ZodError) {
      stderr.write("Extraction result failed validation:\n");
      for (const issue of error.issues) {
        const path = issue.path.length ? issue.path.join(".") : "<root>";
        stderr.write(` - ${path}: ${issue.message}\n`);
      }
      exit(1);
    }

    throw error;
  }
}

main().catch((error) => {
  stderr.write(`Unexpected error: ${error instanceof Error ? error.message : String(error)}\n`);
  exit(1);
});

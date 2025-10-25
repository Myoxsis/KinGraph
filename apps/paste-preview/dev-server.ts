import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const indexHtmlPath = join(__dirname, "index.html");
const entryPoint = join(__dirname, "main.ts");
const port = Number(process.env.PORT ?? 5173);

async function buildClientBundle(): Promise<string> {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: "esm",
    platform: "browser",
    sourcemap: "inline",
    write: false,
    loader: {
      ".ts": "ts",
    },
  });

  const output = result.outputFiles?.[0];
  if (!output) {
    throw new Error("Failed to build client bundle");
  }

  return output.text;
}

async function start(): Promise<void> {
  const server = createServer(async (req, res) => {
    try {
      const url = req.url ?? "/";

      if (url.startsWith("/main.js")) {
        const bundle = await buildClientBundle();
        res.statusCode = 200;
        res.setHeader("content-type", "application/javascript");
        res.end(bundle);
        return;
      }

      if (url === "/" || url.startsWith("/index.html")) {
        const html = await readFile(indexHtmlPath, "utf8");
        res.statusCode = 200;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(html);
        return;
      }

      res.statusCode = 404;
      res.end("Not Found");
    } catch (error) {
      console.error("Failed to handle request", error);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  server.listen(port, () => {
    console.log(`KinGraph Paste Preview running at http://localhost:${port}`);
    console.log("Press Ctrl+C to stop.");
  });
}

start().catch((error) => {
  console.error("Failed to start development server", error);
  process.exitCode = 1;
});

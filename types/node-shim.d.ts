type AsyncStringIterator = AsyncIterableIterator<string>;

type NodeReadableStream = {
  setEncoding(encoding: string): void;
  on(event: "data", listener: (chunk: string) => void): NodeReadableStream;
  on(event: "end", listener: () => void): NodeReadableStream;
  [Symbol.asyncIterator](): AsyncStringIterator;
};

type NodeWritableStream = {
  write(data: string): void;
};

type NodeProcess = {
  env: Record<string, string | undefined>;
  argv: string[];
  cwd(): string;
  exit(code?: number): never;
  stdin: NodeReadableStream;
  stdout: NodeWritableStream;
  stderr: NodeWritableStream;
};

declare module "node:fs/promises" {
  export function readFile(
    path: string | URL,
    options?: { encoding?: string } | string
  ): Promise<string>;
}

declare module "fs" {
  export function readFileSync(path: string | URL, options?: { encoding?: string } | string): string;
}

declare module "node:path" {
  export function resolve(...paths: string[]): string;
  export function dirname(path: string): string;
}

declare module "node:url" {
  export function fileURLToPath(path: string | URL): string;
}

declare module "node:process" {
  const process: NodeProcess;
  export default process;
  export { process };
  export const stdin: NodeReadableStream;
  export const stdout: NodeWritableStream;
  export const stderr: NodeWritableStream;
  export function exit(code?: number): never;
}

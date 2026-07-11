import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const publicApiBaseUrl = process.env.PUBLIC_API_BASE_URL || "";

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(resolve(root, "index.html"), resolve(dist, "index.html"));
await cp(resolve(root, "src"), resolve(dist, "src"), { recursive: true });
await cp(resolve(root, "public"), dist, { recursive: true });
await writeFile(
  resolve(dist, "config.js"),
  `window.LAWYER_SEARCH_API_BASE_URL = ${JSON.stringify(publicApiBaseUrl)};\n`,
);
await writeFile(resolve(dist, ".nojekyll"), "\n");

console.log("Built frontend-only static site to dist/");

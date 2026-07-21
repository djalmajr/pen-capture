#!/usr/bin/env bun
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const candidates = [
  process.env.PEN_CAPTURE_ROOT && resolve(process.env.PEN_CAPTURE_ROOT, "bin/pen-capture.mjs"),
  fileURLToPath(new URL("../../../bin/pen-capture.mjs", import.meta.url)),
  resolve(process.cwd(), "bin/pen-capture.mjs"),
].filter(Boolean);
let bin;
for (const candidate of candidates) {
  try { await access(candidate); bin = candidate; break; } catch {}
}
if (!bin) {
  console.error("Pen Capture checkout not found. Set PEN_CAPTURE_ROOT to the cloned repository path.");
  process.exit(2);
}
const result = spawnSync("bun", [bin, ...process.argv.slice(2)], { stdio:"inherit" });
process.exit(result.status ?? 1);

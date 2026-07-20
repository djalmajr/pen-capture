#!/usr/bin/env bun
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const candidates = [
  process.env.PENCIL_CAPTURE_ROOT && resolve(process.env.PENCIL_CAPTURE_ROOT, "bin/pencil-capture.mjs"),
  fileURLToPath(new URL("../../../bin/pencil-capture.mjs", import.meta.url)),
  resolve(process.cwd(), "bin/pencil-capture.mjs"),
].filter(Boolean);
let bin;
for (const candidate of candidates) {
  try { await access(candidate); bin = candidate; break; } catch {}
}
if (!bin) {
  console.error("Pencil Capture checkout not found. Set PENCIL_CAPTURE_ROOT to the cloned repository path.");
  process.exit(2);
}
const result = spawnSync("bun", [bin, ...process.argv.slice(2)], { stdio:"inherit" });
process.exit(result.status ?? 1);

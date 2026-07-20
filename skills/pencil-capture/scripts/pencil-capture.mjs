#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL("../../../bin/pencil-capture.mjs", import.meta.url));
const result = spawnSync("bun", [bin, ...process.argv.slice(2)], { stdio:"inherit" });
process.exit(result.status ?? 1);

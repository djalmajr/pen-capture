#!/usr/bin/env bun
import { readFile, writeFile } from "node:fs/promises";
import { convertCaptureToPencil } from "../src/convert-capture.mjs";
import { buildBatchScript } from "../src/build-batch.mjs";

const [command, inputPath, outputPath] = process.argv.slice(2);
const usage = () => { console.error("Usage: pencil-capture <verify|convert|batch> <input> [output]"); process.exit(2); };
if (!command || !inputPath) usage();
const input = JSON.parse(await readFile(inputPath, "utf8"));
if (command === "verify") {
  if (input.format !== "pencil-capture-ir" || input.version !== 1 || !Array.isArray(input.nodes)) throw new Error("Invalid Pencil capture IR");
  console.log(JSON.stringify({ label:input.label, nodes:input.nodes.length, rootPath:input.rootPath }, null, 2));
} else if (command === "convert") {
  if (!outputPath) usage();
  const result = convertCaptureToPencil(input);
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result.stats));
} else if (command === "batch") {
  const result = buildBatchScript(input);
  if (outputPath) await writeFile(outputPath, `${result}\n`); else console.log(result);
} else usage();

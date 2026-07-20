import { readFile } from "node:fs/promises";
import { buildColumnBatchScript } from "../src/build-column-batch.mjs";

const [parentId, ...treePaths] = process.argv.slice(2);
if (!parentId || treePaths.length === 0) {
  console.error("Usage: bun scripts/build-column-batch.mjs <parent-id> <tree.json> [...tree.json]");
  process.exit(2);
}

const trees = await Promise.all(treePaths.map(async (path) => JSON.parse(await readFile(path, "utf8"))));
console.log(buildColumnBatchScript(parentId, trees));

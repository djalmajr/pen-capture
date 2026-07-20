import { expect, test } from "bun:test";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializePencilAssets } from "../src/materialize-pencil-assets.mjs";

test("materializes image fills and deduplicates identical assets", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "pencil-assets-"));
  const nodes = [{type:"frame",children:[
    {type:"rectangle",fill:{type:"image",url:"data:image/png;base64,AQID",mode:"fill"}},
    {type:"rectangle",fill:{type:"image",url:"data:image/png;base64,AQID",mode:"fit"}},
  ]}];
  const result = await materializePencilAssets(nodes, {outputDir,relativePrefix:"./assets/test"});
  expect(result).toEqual({fills:2,assets:1,failures:0});
  expect(nodes[0].children[0].fill.url).toMatch(/^\.\/assets\/test\/[a-f0-9]{20}\.png$/);
  expect(nodes[0].children[1].fill.url).toBe(nodes[0].children[0].fill.url);
  expect(await readdir(outputDir)).toHaveLength(1);
});

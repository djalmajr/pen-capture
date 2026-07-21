import { expect, test } from "bun:test";
import { buildBatchScript } from "../src/build-batch.mjs";

test("builds a safe Pen MCP insertion batch", () => {
  const script = buildBatchScript({ format:"pen-node-tree", version:1, root:{ type:"frame", name:"Captured · Card", width:200, height:100, children:[{type:"text",name:"Title",content:"Hello"}] } });
  expect(script).toContain("FindEmptySpace");
  expect(script).toContain("placeholder:true");
  expect(script).toContain('"reusable":true');
  expect(script).toContain("function insertTree");
  expect(script).toContain("for(const child of children)insertTree(id,child)");
  expect(script).toContain("+' ('+id+')'");
  expect(script).toContain("Update(captureRoot,{placeholder:false})");
});

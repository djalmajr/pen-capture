import { expect, test } from "bun:test";
import { buildColumnBatchScript } from "../src/build-column-batch.mjs";

test("materializes catalog captures after insertion", () => {
  const script = buildColumnBatchScript("column-id", [{ root:{ type:"frame", name:"Captured · Card", children:[] } }]);
  expect(script).toContain('Insert("column-id"');
  expect(script).toContain("placeholder:true");
  expect(script).toContain("Copy(capture");
  expect(script).toContain("Delete(capture)");
});

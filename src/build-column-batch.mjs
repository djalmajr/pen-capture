export function buildColumnBatchScript(parentId, trees) {
  if (!parentId || !Array.isArray(trees) || trees.length === 0) throw new Error("A parent and at least one tree are required");
  return `const trees=${JSON.stringify(trees)}
for (const tree of trees) {
  const root={...tree.root};
  const children=root.children||[];
  delete root.children;
  const capture=Insert(${JSON.stringify(parentId)},{...root,placeholder:true});
  Update(capture,{name:root.name+' (#'+capture+')'});
  for (const child of children) {
    Insert(capture,child);
  }
  Update(capture,{placeholder:false});
  const rendered=Copy(capture,${JSON.stringify(parentId)},{name:root.name});
  Update(rendered,{name:root.name+' (#'+rendered+')'});
  Delete(capture);
}`;
}

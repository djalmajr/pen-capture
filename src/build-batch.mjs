export function buildBatchScript(tree, options = {}) {
  if (tree?.format !== "pen-node-tree" || ![1, 2].includes(tree?.version) || !tree.root) {
    throw new Error("Unsupported Pen node tree");
  }
  const root = structuredClone(tree.root);
  if (options.reusable !== false) root.reusable = true;
  const direction = options.direction || "top";
  const padding = Number(options.padding ?? 120);
  return [
    `const rootData=${JSON.stringify(root)}`,
    `const pos=FindEmptySpace({width:rootData.width,height:rootData.height,direction:${JSON.stringify(direction)},padding:${padding}})`,
    "function insertTree(parent,node,rootPosition){const data={...node};const children=data.children||[];delete data.children;if(rootPosition)Object.assign(data,rootPosition,{placeholder:true});const id=Insert(parent,data);Update(id,{name:data.name.replace(/ \\(#?[-A-Za-z0-9]+\\)$/,'')+' ('+id+')'});for(const child of children)insertTree(id,child);return id}",
    "captureRoot=insertTree(document,rootData,{x:pos.x,y:pos.y})",
    "Update(captureRoot,{placeholder:false})",
  ].join("\n");
}

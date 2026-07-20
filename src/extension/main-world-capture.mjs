import { captureElementForPencil } from "../pencil-clipboard.mjs";
import { elementVisualSignature, waitForVisualStability } from "./visual-stability.mjs";

export async function captureSelectionInMainWorld(targetSelector, sourceSelector = targetSelector) {
  const target = document.querySelector(targetSelector);
  if (!(target instanceof Element)) throw new Error("The selected element is no longer available");
  await waitForVisualStability(() => elementVisualSignature(target));

  const { capture, html, converted } = await captureElementForPencil(target, {
    selector: sourceSelector,
    url: globalThis.location.href,
    // Pencil treats data: image URLs as filesystem paths and exposes the
    // entire base64 value in an asset error. Direct extension paste must use
    // fetchable source URLs; the CLI/MCP workflow materializes embedded assets.
    allowEmbeddedAssets:false,
  });
  const item = new ClipboardItem({
    "text/html": new Blob([html], { type:"text/html" }),
    "text/plain": new Blob([`Captured for Pencil: ${converted.root.name}`], { type:"text/plain" }),
  });
  await navigator.clipboard.write([item]);
  const countNodes = (node) => 1 + (node.children || []).reduce((total, child) => total + countNodes(child), 0);
  const capturedTags = Object.fromEntries(Object.entries(capture.nodes.reduce((counts, node) => {
    counts[node.tag] = (counts[node.tag] || 0) + 1;
    return counts;
  }, {})).sort(([left], [right]) => left.localeCompare(right)));
  const convertedTags = {};
  const countConvertedTags = (node) => {
    convertedTags[node.type] = (convertedTags[node.type] || 0) + 1;
    for (const child of node.children || []) countConvertedTags(child);
  };
  countConvertedTags(converted.root);
  return {
    types:item.types,
    nodeCount:countNodes(converted.root),
    name:converted.root.name,
    stats:converted.stats,
    capturedTags,
    convertedTags,
  };
}

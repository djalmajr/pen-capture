import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

function dataUrlBytes(url) {
  const match = url.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/s);
  if (!match) return null;
  const mime = match[1] || "application/octet-stream";
  const bytes = url.slice(0, url.indexOf(",")).includes(";base64") ? Buffer.from(match[2], "base64") : Buffer.from(decodeURIComponent(match[2]));
  return {mime,bytes};
}

function extensionFor(mime, url) {
  const known = {"image/png":".png","image/jpeg":".jpg","image/webp":".webp","image/gif":".gif","image/svg+xml":".svg"};
  return known[mime] || extname(new URL(url, "https://local.invalid").pathname) || ".bin";
}

async function loadAsset(url, fetchFn) {
  const inline = dataUrlBytes(url);
  if (inline) return inline;
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} loading ${url}`);
  return {mime:response.headers.get("content-type")?.split(";")[0] || "application/octet-stream",bytes:Buffer.from(await response.arrayBuffer())};
}

function visitFill(fill, callback) {
  if (Array.isArray(fill)) for (const item of fill) visitFill(item, callback);
  else if (fill?.type === "image" && fill.url) callback(fill);
}

function visitNode(node, callback) {
  visitFill(node.fill, callback);
  visitFill(node.stroke, callback);
  for (const child of node.children || []) visitNode(child, callback);
}

export async function materializePencilAssets(nodes, options) {
  const outputDir = options.outputDir;
  const relativePrefix = options.relativePrefix || "./assets/captured";
  const fetchFn = options.fetchFn || globalThis.fetch;
  await mkdir(outputDir, {recursive:true});
  const fills = [];
  for (const node of nodes) visitNode(node, (fill) => fills.push(fill));
  const cache = new Map();
  let failures = 0;
  for (const fill of fills) {
    const source = fill.url;
    try {
      if (!cache.has(source)) {
        cache.set(source, (async () => {
          const {mime,bytes} = await loadAsset(source, fetchFn);
          const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 20);
          const filename = `${digest}${extensionFor(mime, source)}`;
          await writeFile(join(outputDir, filename), bytes);
          return `${relativePrefix}/${filename}`;
        })());
      }
      fill.url = await cache.get(source);
    } catch {
      failures += 1;
    }
  }
  return {fills:fills.length,assets:cache.size,failures};
}

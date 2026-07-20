import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { spawn } from "node:child_process";

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

function visitFill(fill, callback, node) {
  if (Array.isArray(fill)) for (const item of fill) visitFill(item, callback, node);
  else if (fill?.type === "image" && fill.url) callback(fill, node);
}

function visitNode(node, callback) {
  visitFill(node.fill, callback, node);
  visitFill(node.stroke, callback, node);
  for (const child of node.children || []) visitNode(child, callback);
}

export function imageMagickArgsForCssFilter(filter) {
  const args = [];
  for (const match of String(filter || "").matchAll(/([a-z-]+)\(([^)]+)\)/gi)) {
    const name = match[1].toLowerCase();
    const value = Number.parseFloat(match[2]);
    if (!Number.isFinite(value)) continue;
    if (name === "brightness") args.push("-evaluate", "Multiply", String(value));
    else if (name === "grayscale" && value > 0) args.push("-colorspace", "gray", "-colorspace", "sRGB");
  }
  return args;
}

async function applyCssFilter(bytes, filter) {
  const args = imageMagickArgsForCssFilter(filter);
  if (!args.length) return {mime:null,bytes};
  const output = await new Promise((resolve, reject) => {
    const child = spawn("magick", ["-", ...args, "png:-"]);
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(Buffer.concat(stdout)) : reject(new Error(Buffer.concat(stderr).toString() || `magick exited ${code}`)));
    child.stdin.end(bytes);
  });
  return {mime:"image/png",bytes:output};
}

export async function materializePencilAssets(nodes, options) {
  const outputDir = options.outputDir;
  const relativePrefix = options.relativePrefix || "./assets/captured";
  const fetchFn = options.fetchFn || globalThis.fetch;
  await mkdir(outputDir, {recursive:true});
  const fills = [];
  for (const node of nodes) visitNode(node, (fill, owner) => fills.push({fill,owner}));
  const cache = new Map();
  let failures = 0;
  for (const {fill,owner} of fills) {
    const source = fill.url;
    const filter = owner.metadata?.type === "pencil-capture-image" ? owner.metadata.filter : null;
    const cacheKey = `${source}\n${filter || "none"}`;
    try {
      if (!cache.has(cacheKey)) {
        cache.set(cacheKey, (async () => {
          let {mime,bytes} = await loadAsset(source, fetchFn);
          if (filter) {
            const transformed = await applyCssFilter(bytes, filter);
            mime = transformed.mime || mime;
            bytes = transformed.bytes;
          }
          const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 20);
          const filename = `${digest}${extensionFor(mime, source)}`;
          await writeFile(join(outputDir, filename), bytes);
          return `${relativePrefix}/${filename}`;
        })());
      }
      fill.url = await cache.get(cacheKey);
    } catch {
      failures += 1;
    }
  }
  return {fills:fills.length,assets:cache.size,failures};
}

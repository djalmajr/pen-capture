export const CAPTURE_FORMAT = "pencil-capture-ir";
export const CAPTURE_VERSION = 1;

export const CAPTURED_STYLE_KEYS = [
  "display", "position", "flexDirection", "alignItems", "justifyContent", "gap",
  "backgroundColor", "backgroundImage", "color",
  "backgroundPosition", "backgroundRepeat", "backgroundSize",
  "borderTopColor", "borderTopWidth", "borderTopStyle",
  "borderRightColor", "borderRightWidth", "borderRightStyle",
  "borderBottomColor", "borderBottomWidth", "borderBottomStyle",
  "borderLeftColor", "borderLeftWidth", "borderLeftStyle",
  "borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius",
  "fontFamily", "fontSize", "fontStyle", "fontWeight", "letterSpacing", "lineHeight",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "textAlign", "textTransform", "textDecorationLine", "textDecorationColor", "whiteSpace", "textOverflow", "opacity", "overflow", "visibility", "boxShadow",
  "objectFit", "objectPosition", "filter",
  "fill", "fillOpacity", "stroke", "strokeWidth", "strokeOpacity", "strokeDasharray", "strokeDashoffset",
];

const CAPTURED_ATTRIBUTES = new Set([
  "aria-label", "aria-valuenow", "data-slot", "type", "src", "alt", "href",
  "placeholder", "min", "max", "step",
  "d", "fill", "stroke", "x", "y", "x1", "y1", "x2", "y2", "width", "height",
  "cx", "cy", "r", "rx", "ry", "points", "viewBox", "text-anchor",
]);

const EXTENSION_ASSET_REQUEST = "pencil-capture:asset-request";
const EXTENSION_ASSET_RESPONSE = "pencil-capture:asset-response";

function requestExtensionAsset(url) {
  if (!document.documentElement.hasAttribute("data-pencil-capture-extension")) return Promise.resolve(null);
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => finish(null), 10_000);
    const onResponse = (event) => {
      let response;
      try { response = JSON.parse(event.detail); } catch { return; }
      if (response?.id === id) finish(response.dataUrl || null);
    };
    const finish = (value) => {
      clearTimeout(timeout);
      globalThis.removeEventListener(EXTENSION_ASSET_RESPONSE, onResponse);
      resolve(value);
    };
    globalThis.addEventListener(EXTENSION_ASSET_RESPONSE, onResponse);
    globalThis.dispatchEvent(new CustomEvent(EXTENSION_ASSET_REQUEST, {detail:JSON.stringify({id,url})}));
  });
}

function nearestOpaqueBackground(node) {
  for (let current = node; current instanceof Element; current = current.parentElement) {
    const color = getComputedStyle(current).backgroundColor;
    const alpha = color?.match(/rgba?\([^)]*[,/]\s*([\d.]+)\s*\)$/i)?.[1];
    if (color && color !== "transparent" && Number(alpha ?? 1) > 0) return color;
  }
  return "rgb(255, 255, 255)";
}

function canvasSnapshot(node) {
  const output = document.createElement("canvas");
  output.width = node.width;
  output.height = node.height;
  const context = output.getContext("2d");
  context.fillStyle = nearestOpaqueBackground(node);
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(node, 0, 0);
  return output.toDataURL("image/png");
}

function effectiveFilter(node, root) {
  const filters = [];
  for (let current = node.parentElement; current instanceof Element; current = current.parentElement) {
    const filter = getComputedStyle(current).filter;
    if (filter && filter !== "none") filters.push(filter);
    if (current === root) break;
  }
  return filters.reverse().join(" ") || "none";
}

function filteredImageSnapshot(node, computed, rect, filter = computed.filter) {
  if (!filter || filter === "none" || !node.naturalWidth || !node.naturalHeight) return null;
  const scaleFactor = Math.min(2, globalThis.devicePixelRatio || 1);
  const width = Math.max(1, Math.ceil(rect.width * scaleFactor));
  const height = Math.max(1, Math.ceil(rect.height * scaleFactor));
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const context = output.getContext("2d");
  context.fillStyle = nearestOpaqueBackground(node);
  context.fillRect(0, 0, width, height);
  context.filter = filter;
  const fit = computed.objectFit;
  const scale = fit === "contain"
    ? Math.min(width / node.naturalWidth, height / node.naturalHeight)
    : fit === "cover"
      ? Math.max(width / node.naturalWidth, height / node.naturalHeight)
      : null;
  if (scale == null) context.drawImage(node, 0, 0, width, height);
  else {
    const drawWidth = node.naturalWidth * scale;
    const drawHeight = node.naturalHeight * scale;
    context.drawImage(node, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  }
  return output.toDataURL("image/png");
}

async function fetchedFilteredImageSnapshot(node, captured) {
  const url = node.currentSrc || node.src;
  let blob;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to fetch filtered image: ${response.status}`);
    blob = await response.blob();
  } catch (error) {
    const bridged = await requestExtensionAsset(url);
    if (!bridged) throw error;
    blob = await (await fetch(bridged)).blob();
  }
  const bitmap = await createImageBitmap(blob);
  try {
    const scaleFactor = Math.min(2, globalThis.devicePixelRatio || 1);
    const width = Math.max(1, Math.ceil(captured.rect.width * scaleFactor));
    const height = Math.max(1, Math.ceil(captured.rect.height * scaleFactor));
    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    const context = output.getContext("2d");
    context.fillStyle = nearestOpaqueBackground(node);
    context.fillRect(0, 0, width, height);
    context.filter = captured.attributes.effectiveFilter || captured.styles.filter;
    const fit = captured.styles.objectFit;
    const scale = fit === "contain"
      ? Math.min(width / bitmap.width, height / bitmap.height)
      : fit === "cover"
        ? Math.max(width / bitmap.width, height / bitmap.height)
        : null;
    if (scale == null) context.drawImage(bitmap, 0, 0, width, height);
    else {
      const drawWidth = bitmap.width * scale;
      const drawHeight = bitmap.height * scale;
      context.drawImage(bitmap, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    }
    return output.toDataURL("image/png");
  } finally {
    bitmap.close?.();
  }
}

export async function hydrateFilteredImageAssets(capture, root) {
  const byPath = new Map(capture.nodes.map((node) => [node.path, node]));
  const visit = async (node, path) => {
    const captured = byPath.get(path);
    const filter = captured?.attributes.effectiveFilter ?? captured?.styles.filter;
    if (node.tagName === "IMG" && filter && filter !== "none" && !captured.attributes.dataUrl) {
      captured.styles.filter = filter;
      try { captured.attributes.dataUrl = await fetchedFilteredImageSnapshot(node, captured); } catch { captured.attributes.dataUrl = null; }
    }
    await Promise.all(Array.from(node.children).map((child, index) => visit(child, `${path}.${index}`)));
  };
  await visit(root, "0");
  return capture;
}

function directTextSnapshot(node, rootRect) {
  const textNodes = Array.from(node.childNodes).filter((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim());
  const runs = [];
  for (const textNode of textNodes) {
    const lines = [];
    for (let index = 0; index < textNode.length; index += 1) {
      const range = document.createRange();
      range.setStart(textNode, index);
      range.setEnd(textNode, index + 1);
      const rect = range.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      let line = lines.find((candidate) => Math.abs(candidate.top - rect.top) <= 1);
      if (!line) {
        line = {top:rect.top,entries:[]};
        lines.push(line);
      }
      line.entries.push({character:textNode.data[index],rect});
    }
    for (const line of lines) {
      while (line.entries.length && /\s/.test(line.entries[0].character)) line.entries.shift();
      while (line.entries.length && /\s/.test(line.entries.at(-1).character)) line.entries.pop();
      if (!line.entries.length) continue;
      const text = line.entries.map((entry) => entry.character).join("").replace(/\s+/g," ");
      const left = Math.min(...line.entries.map((entry) => entry.rect.left));
      const top = Math.min(...line.entries.map((entry) => entry.rect.top));
      const right = Math.max(...line.entries.map((entry) => entry.rect.right));
      const bottom = Math.max(...line.entries.map((entry) => entry.rect.bottom));
      runs.push({text,rect:{x:left-rootRect.x,y:top-rootRect.y,width:right-left,height:bottom-top}});
    }
  }
  if (!runs.length) return {text:null,textRect:null,textRuns:[]};
  const left = Math.min(...runs.map((run) => run.rect.x));
  const top = Math.min(...runs.map((run) => run.rect.y));
  const right = Math.max(...runs.map((run) => run.rect.x + run.rect.width));
  const bottom = Math.max(...runs.map((run) => run.rect.y + run.rect.height));
  return {
    text:runs.map((run) => run.text).join(" "),
    textRect:{x:left,y:top,width:right-left,height:bottom-top},
    textRuns:runs,
  };
}

export function captureElement(root, options = {}) {
  if (typeof Element === "undefined" || !(root instanceof Element)) {
    throw new TypeError("captureElement expects a DOM Element");
  }
  const rootRect = root.getBoundingClientRect();
  const nodes = [];
  const visit = (node, path, parentPath) => {
    const rect = node.getBoundingClientRect();
    const computed = getComputedStyle(node);
    const { text, textRect, textRuns } = directTextSnapshot(node, rootRect);
    const attributes = Object.fromEntries(Array.from(node.attributes)
      .filter((attribute) => CAPTURED_ATTRIBUTES.has(attribute.name))
      .map((attribute) => [attribute.name, attribute.value]));
    if (["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName)) {
      attributes.value = node.value;
      attributes.disabled = node.disabled;
      if ("checked" in node) attributes.checked = node.checked;
      if (node.tagName === "SELECT") attributes.selectedLabel = node.selectedOptions[0]?.textContent?.trim() || "";
    }
    if (node.tagName === "CANVAS") {
      try { attributes.dataUrl = canvasSnapshot(node); } catch { attributes.dataUrl = null; }
    }
    if (node.tagName === "IMG") {
      attributes.effectiveFilter = effectiveFilter(node, root);
      attributes.currentSrc = node.currentSrc || node.src || attributes.src || null;
      attributes.naturalWidth = node.naturalWidth;
      attributes.naturalHeight = node.naturalHeight;
      try { attributes.dataUrl = filteredImageSnapshot(node, computed, rect, attributes.effectiveFilter); } catch { attributes.dataUrl = null; }
    }
    if (["INPUT", "TEXTAREA"].includes(node.tagName) && attributes.placeholder) {
      const placeholder = getComputedStyle(node, "::placeholder");
      attributes.placeholderColor = placeholder.color;
      attributes.placeholderOpacity = placeholder.opacity;
    }
    nodes.push({
      path, parentPath, tag: node.tagName.toLowerCase(), namespace: node.namespaceURI,
      role: node.getAttribute("role"),
      name: node.getAttribute("data-slot") || node.getAttribute("aria-label") || text || node.tagName.toLowerCase(),
      text, textRect, textRuns,
      rect: { x: rect.x - rootRect.x, y: rect.y - rootRect.y, width: rect.width, height: rect.height },
      styles: Object.fromEntries(CAPTURED_STYLE_KEYS.map((key) => [key, computed[key]])),
      attributes,
    });
    Array.from(node.children).forEach((child, index) => visit(child, `${path}.${index}`, path));
  };
  visit(root, "0", null);
  return {
    format: CAPTURE_FORMAT, version: CAPTURE_VERSION,
    label: options.label
      || root.innerText?.split("\n").map((line) => line.trim()).find(Boolean)?.slice(0, 96)
      || root.getAttribute("aria-label")
      || root.getAttribute("data-slot")
      || root.tagName.toLowerCase(),
    source: { url: options.url || globalThis.location?.href || null, selector: options.selector || null },
    capturedAt: new Date().toISOString(), rootPath: "0", nodes,
  };
}

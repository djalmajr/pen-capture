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
  "textAlign", "textTransform", "opacity", "overflow", "visibility", "boxShadow",
  "objectFit", "objectPosition", "filter",
  "fill", "stroke", "strokeWidth",
];

const CAPTURED_ATTRIBUTES = new Set([
  "aria-label", "aria-valuenow", "data-slot", "type", "src", "alt",
  "placeholder", "min", "max", "step",
  "d", "fill", "stroke", "x", "y", "x1", "y1", "x2", "y2", "width", "height",
  "cx", "cy", "r", "rx", "ry", "points", "viewBox", "text-anchor",
]);

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

function filteredImageSnapshot(node, computed, rect) {
  if (!computed.filter || computed.filter === "none" || !node.naturalWidth || !node.naturalHeight) return null;
  const scaleFactor = Math.min(2, globalThis.devicePixelRatio || 1);
  const width = Math.max(1, Math.ceil(rect.width * scaleFactor));
  const height = Math.max(1, Math.ceil(rect.height * scaleFactor));
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const context = output.getContext("2d");
  context.fillStyle = nearestOpaqueBackground(node);
  context.fillRect(0, 0, width, height);
  context.filter = computed.filter;
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

function directTextSnapshot(node, rootRect) {
  const textNodes = Array.from(node.childNodes).filter((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim());
  const text = textNodes.map((child) => child.textContent).join("").replace(/\s+/g, " ").trim();
  if (!text || !textNodes.length) return { text:null, textRect:null };
  const range = document.createRange();
  range.setStartBefore(textNodes[0]);
  range.setEndAfter(textNodes[textNodes.length - 1]);
  const rect = range.getBoundingClientRect();
  return {
    text,
    textRect:{ x:rect.x - rootRect.x, y:rect.y - rootRect.y, width:rect.width, height:rect.height },
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
    const { text, textRect } = directTextSnapshot(node, rootRect);
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
      attributes.currentSrc = node.currentSrc || node.src || attributes.src || null;
      attributes.naturalWidth = node.naturalWidth;
      attributes.naturalHeight = node.naturalHeight;
      try { attributes.dataUrl = filteredImageSnapshot(node, computed, rect); } catch { attributes.dataUrl = null; }
    }
    nodes.push({
      path, parentPath, tag: node.tagName.toLowerCase(), namespace: node.namespaceURI,
      role: node.getAttribute("role"),
      name: node.getAttribute("data-slot") || node.getAttribute("aria-label") || text || node.tagName.toLowerCase(),
      text,
      textRect,
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

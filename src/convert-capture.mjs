const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const round = (value, precision = 3) => Number(Number(value).toFixed(precision));

function channelToHex(value) {
  return Math.round(clamp(value) * 255).toString(16).padStart(2, "0").toUpperCase();
}

function linearToSrgb(value) {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

function oklabToHex(lightness, a, b, alpha = 1) {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const red = linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const green = linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const blue = linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  const hex = `#${channelToHex(red)}${channelToHex(green)}${channelToHex(blue)}`;
  return alpha < 1 ? `${hex}${channelToHex(alpha)}` : hex;
}

function parseAlpha(value) {
  if (value == null) return 1;
  const number = Number.parseFloat(value);
  return value.includes("%") ? number / 100 : number;
}

export function cssColorToHex(value) {
  if (!value || value === "transparent" || value === "none") return null;
  if (value.startsWith("#")) return value.toUpperCase();
  const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.%]+))?\s*\)$/i);
  if (rgb) {
    const alpha = parseAlpha(rgb[4]);
    if (alpha === 0) return null;
    const hex = `#${channelToHex(Number(rgb[1]) / 255)}${channelToHex(Number(rgb[2]) / 255)}${channelToHex(Number(rgb[3]) / 255)}`;
    return alpha < 1 ? `${hex}${channelToHex(alpha)}` : hex;
  }
  const oklch = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.%]+))?\s*\)$/i);
  if (oklch) {
    const hue = Number(oklch[3]) * Math.PI / 180;
    const chroma = Number(oklch[2]);
    return oklabToHex(Number(oklch[1]), chroma * Math.cos(hue), chroma * Math.sin(hue), parseAlpha(oklch[4]));
  }
  const oklab = value.match(/^oklab\(\s*([\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)(?:\s*\/\s*([\d.%]+))?\s*\)$/i);
  if (oklab) return oklabToHex(Number(oklab[1]), Number(oklab[2]), Number(oklab[3]), parseAlpha(oklab[4]));
  throw new Error(`Unsupported CSS color: ${value}`);
}

function safeColor(value) {
  try { return cssColorToHex(value); } catch { return null; }
}

function gradientColor(value) {
  if (value === "transparent" || /^rgba?\([^)]*[,/]\s*0(?:\.0+)?\s*\)$/i.test(value)) return "#00000000";
  return safeColor(value);
}

function px(value, fallback = 0) {
  if (typeof value === "number") return value;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cornerRadius(styles) {
  const values = [styles.borderTopLeftRadius, styles.borderTopRightRadius, styles.borderBottomRightRadius, styles.borderBottomLeftRadius].map((value) => round(px(value)));
  return values.every((value) => value === values[0]) ? values[0] : values;
}

function splitCssArguments(value) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "(") depth += 1;
    else if (value[index] === ")") depth -= 1;
    else if (value[index] === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

function parseGradientStop(value) {
  const match = value.match(/^(.*?)(?:\s+(-?[\d.]+)(px|%))?$/);
  const color = gradientColor(match?.[1]?.trim());
  if (!color) return null;
  return { color, position:match?.[2] == null ? null : Number(match[2]), unit:match?.[3] || null };
}

export function cssBackgroundToFill(node) {
  const value = node.styles.backgroundImage;
  if (!value || value === "none") return null;
  const imageUrl = node.attributes.backgroundAssetUrls?.[0];
  if (imageUrl) {
    const size = node.styles.backgroundSize;
    return { type:"image", url:imageUrl, mode:size === "contain" ? "fit" : size === "cover" ? "fill" : "stretch" };
  }
  const match = value.match(/^(repeating-)?linear-gradient\((.*)\)$/i);
  if (!match) return null;
  const args = splitCssArguments(match[2]);
  let cssAngle = 180;
  if (/^-?[\d.]+deg$/i.test(args[0])) cssAngle = Number.parseFloat(args.shift());
  const stops = args.map(parseGradientStop).filter(Boolean);
  if (stops.length < 2) return null;
  const length = Math.max(1, Math.hypot(node.rect.width, node.rect.height));
  const period = match[1] ? Math.max(...stops.map((stop) => stop.unit === "px" ? stop.position : 0)) : null;
  let colors;
  if (period > 0) {
    colors = [];
    const cycles = Math.ceil(length / period);
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      for (const stop of stops) {
        const offset = stop.unit === "%" ? stop.position / 100 * period : stop.position ?? 0;
        colors.push({ color:stop.color, position:clamp((cycle * period + offset) / length) });
      }
    }
    colors.push({ color:stops[stops.length - 1].color, position:1 });
  } else {
    colors = stops.map((stop, index) => ({
      color:stop.color,
      position:stop.position == null ? index / (stops.length - 1) : stop.unit === "%" ? stop.position / 100 : stop.position / length,
    }));
  }
  return { type:"gradient", gradientType:"linear", rotation:((360 - cssAngle) % 360 + 360) % 360, colors };
}

function transformedText(node) {
  if (node.styles.textTransform === "uppercase") return node.text.toUpperCase();
  if (node.styles.textTransform === "lowercase") return node.text.toLowerCase();
  if (node.styles.textTransform === "capitalize") return node.text.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
  return node.text;
}

function fontFamily(value) {
  return value?.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "") || "Noto Sans";
}

function isCssShown(node) {
  return px(node.styles.opacity, 1) > 0 && node.styles.display !== "none" && node.styles.visibility !== "hidden";
}

function isVisible(node) {
  return node.rect.width > 0 && node.rect.height > 0 && isCssShown(node);
}

function isVisibleSvgContainer(node) {
  return node.namespace === "http://www.w3.org/2000/svg"
    && ["svg", "g"].includes(node.tag)
    && isCssShown(node);
}

function isVisuallyHiddenControl(node) {
  return ["input", "select", "textarea"].includes(node.tag)
    && node.rect.width <= 1
    && node.rect.height <= 1;
}

function inferTitle(capture, rootSource) {
  const declared = capture.label?.replace(/\s+/g, " ").trim();
  if (declared && declared.length <= 80) return declared;
  const candidate = capture.nodes.find((node) => node.path !== capture.rootPath && node.text && isVisible(node) && node.text.length <= 80 && node.rect.y <= Math.min(120, rootSource.rect.height / 2));
  return (candidate?.text || declared || rootSource.name || "Element").replace(/\s+/g, " ").trim().slice(0, 80);
}

function cssShadowToEffect(value) {
  if (!value || value === "none") return null;
  const colorMatch = value.match(/(rgba?\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|#[0-9a-f]{3,8})/i);
  const color = safeColor(colorMatch?.[1]);
  if (!color) return null;
  const rest = value.replace(colorMatch[0], "");
  const numbers = Array.from(rest.matchAll(/(-?[\d.]+)px/g), (item) => Number(item[1]));
  return { type:"shadow", shadowType:value.includes("inset") ? "inner" : "outer", offset:{ x:numbers[0] || 0, y:numbers[1] || 0 }, blur:Math.max(0, numbers[2] || 0), spread:numbers[3] || 0, color };
}

function graphicPaint(node) {
  const fill = safeColor(node.styles.fill);
  const stroke = safeColor(node.styles.stroke);
  return {
    ...(fill ? { fill } : {}),
    ...(stroke ? { stroke, strokeWidth:round(px(node.styles.strokeWidth, 1)), strokeLinecap:"round", strokeLinejoin:"round" } : {}),
  };
}

function cleanLabel(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 56);
}

function titleCase(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : "Element";
}

export function semanticLayerName(node) {
  const tag = node.tag || "element";
  if (tag === "img") return `Image · ${cleanLabel(node.attributes.alt || node.name || "Asset")}`;
  if (tag === "canvas") return "Canvas · Snapshot";
  const meaningful = cleanLabel(node.name);
  if (meaningful && meaningful.toLowerCase() !== tag && meaningful.length <= 48) return `${titleCase(tag)} · ${meaningful}`;
  if (node.role) return `${titleCase(node.role)} · ${titleCase(tag)}`;
  return titleCase(tag);
}

function relativeRect(node, parent) {
  return {
    x:round(node.rect.x - (parent?.rect.x || 0)),
    y:round(node.rect.y - (parent?.rect.y || 0)),
    width:round(node.rect.width),
    height:round(node.rect.height),
  };
}

function borderProperties(styles) {
  const sides = ["Top", "Right", "Bottom", "Left"];
  const widths = Object.fromEntries(sides.map((side) => [side.toLowerCase(), round(px(styles[`border${side}Width`]))]));
  const visible = sides.find((side) => widths[side.toLowerCase()] > 0 && styles[`border${side}Style`] !== "none" && safeColor(styles[`border${side}Color`]));
  if (!visible) return {};
  return {
    stroke:safeColor(styles[`border${visible}Color`]),
    strokeWidth:widths.top === widths.right && widths.top === widths.bottom && widths.top === widths.left ? widths.top : widths,
    strokeAlignment:"inner",
  };
}

function makeText(node, parent, name = `${semanticLayerName(node)} · Text`) {
  const fontSize = px(node.styles.fontSize, 14);
  const sourceRect = node.textRect || node.rect;
  const align = node.styles.textAlign === "center" || node.tag === "button" ? "center" : node.styles.textAlign === "right" ? "right" : "left";
  return {
    type:"text", name, layoutPosition:"absolute",
    x:round(sourceRect.x - parent.rect.x), y:round(sourceRect.y - parent.rect.y), width:round(sourceRect.width), height:round(sourceRect.height),
    textGrowth:"fixed-width-height", content:transformedText(node),
    fill:safeColor(node.namespace === "http://www.w3.org/2000/svg" ? node.styles.fill : node.styles.color) || "#000000",
    fontFamily:fontFamily(node.styles.fontFamily), fontSize:round(fontSize), fontWeight:String(node.styles.fontWeight || "400"),
    fontStyle:node.styles.fontStyle || "normal", lineHeight:round(px(node.styles.lineHeight, fontSize * 1.2) / fontSize),
    textAlign:align, textAlignVertical:node.tag === "button" ? "middle" : "top",
  };
}

function controlText(node, parent) {
  if (!["input", "textarea", "select"].includes(node.tag) || !isVisible(node)) return null;
  if (["checkbox", "radio", "range", "file", "hidden"].includes(node.attributes.type)) return null;
  const content = node.attributes.selectedLabel || node.attributes.value || node.attributes.placeholder;
  if (!content) return null;
  const fontSize = px(node.styles.fontSize, 14);
  const horizontalPadding = Math.min(12, Math.max(6, node.rect.height / 3));
  return {
    type:"text", name:`${semanticLayerName(node)} · Value`, layoutPosition:"absolute",
    x:round(node.rect.x - parent.rect.x + horizontalPadding), y:round(node.rect.y - parent.rect.y),
    width:round(Math.max(1, node.rect.width - horizontalPadding * 2)), height:round(node.rect.height),
    textGrowth:"fixed-width-height", content,
    fill:safeColor(node.styles.color) || "#000000", fontFamily:fontFamily(node.styles.fontFamily), fontSize:round(fontSize), fontWeight:String(node.styles.fontWeight || "400"),
    fontStyle:node.styles.fontStyle || "normal", lineHeight:round(px(node.styles.lineHeight, fontSize * 1.2) / fontSize), textAlign:"left", textAlignVertical:node.tag === "textarea" ? "top" : "middle",
  };
}

function imageMode(node) {
  return node.styles.objectFit === "contain" ? "fit" : node.styles.objectFit === "cover" ? "fill" : "stretch";
}

function svgGraphic(node, parent, byPath) {
  let svg = node;
  while (svg && svg.tag !== "svg") svg = byPath.get(svg.parentPath);
  const svgRelativeRect = svg ? {
    x:0, y:0, width:round(svg.rect.width), height:round(svg.rect.height),
  } : relativeRect(node, parent);
  const primitiveRect = svg ? {
    x:round(node.rect.x - svg.rect.x), y:round(node.rect.y - svg.rect.y), width:round(node.rect.width), height:round(node.rect.height),
  } : relativeRect(node, parent);
  const base = { name:semanticLayerName(node), layoutPosition:"absolute", ...(node.tag === "path" ? svgRelativeRect : primitiveRect), ...graphicPaint(node) };
  if (node.tag === "rect") return { type:"rectangle", ...base, cornerRadius:round(px(node.attributes.rx || node.attributes.ry)) };
  if (node.tag === "circle" || node.tag === "ellipse") return { type:"ellipse", ...base };
  if (node.tag === "line") return { type:"path", ...base, width:Math.max(1, base.width), height:Math.max(1, base.height), geometry:`M 0 0 L ${Math.max(1, base.width)} ${Math.max(1, base.height)}`, viewBox:[0, 0, Math.max(1, base.width), Math.max(1, base.height)] };
  if (node.tag === "polyline" || node.tag === "polygon") {
    const numbers = node.attributes.points?.trim().split(/[\s,]+/).map(Number);
    if (!numbers?.length || numbers.some((value) => !Number.isFinite(value))) return null;
    const points = [];
    for (let index = 0; index < numbers.length; index += 2) points.push([numbers[index], numbers[index + 1]]);
    const xs = points.map(([x]) => x); const ys = points.map(([, y]) => y);
    const commands = points.map(([x, y], index) => `${index ? "L" : "M"} ${x} ${y}`).join(" ");
    return { type:"path", ...base, geometry:`${commands}${node.tag === "polygon" ? " Z" : ""}`, viewBox:[Math.min(...xs), Math.min(...ys), Math.max(1, Math.max(...xs) - Math.min(...xs)), Math.max(1, Math.max(...ys) - Math.min(...ys))] };
  }
  if (node.tag === "path" && node.attributes.d) {
    const viewBox = (svg?.attributes.viewBox || `0 0 ${svg?.rect.width || node.rect.width} ${svg?.rect.height || node.rect.height}`).split(/[\s,]+/).map(Number);
    return { type:"path", ...base, geometry:node.attributes.d, viewBox };
  }
  return null;
}

export function convertCaptureToPencil(capture) {
  if (capture?.format !== "pencil-capture-ir" || capture?.version !== 1) throw new Error("Unsupported capture format");
  const byPath = new Map(capture.nodes.map((node) => [node.path, node]));
  const rootSource = byPath.get(capture.rootPath);
  if (!rootSource) throw new Error("Capture root is missing");
  const childPaths = new Map();
  for (const node of capture.nodes) {
    if (!childPaths.has(node.parentPath)) childPaths.set(node.parentPath, []);
    childPaths.get(node.parentPath).push(node.path);
  }
  const stats = { frames:0, groups:0, texts:0, images:0, gradients:0, svgGraphics:0, controls:0, skipped:0, skippedSvgInvisible:0, skippedSvgUnsupported:0, skippedRoots:{} };
  const convertNode = (node, parent) => {
    if (node.namespace === "http://www.w3.org/2000/svg" && ["defs", "clippath", "title", "desc"].includes(node.tag)) {
      stats.skipped += 1;
      stats.skippedSvgInvisible += 1;
      stats.skippedRoots[node.tag] = (stats.skippedRoots[node.tag] || 0) + 1;
      return null;
    }
    if ((!isCssShown(node) && !isVisibleSvgContainer(node)) || isVisuallyHiddenControl(node)) {
      stats.skipped += 1;
      if (node.namespace === "http://www.w3.org/2000/svg") stats.skippedSvgInvisible += 1;
      stats.skippedRoots[node.tag] = (stats.skippedRoots[node.tag] || 0) + 1;
      return null;
    }
    if (!isVisible(node) && !isVisibleSvgContainer(node)) {
      const descendants = childPaths.get(node.path) || [];
      if (descendants.length) {
        const bridge = {type:"group",name:semanticLayerName(node),layoutPosition:"absolute",x:0,y:0,children:[]};
        stats.groups += 1;
        for (const path of descendants) {
          const child = convertNode(byPath.get(path), parent);
          if (child) bridge.children.push(child);
        }
        if (bridge.children.length) return bridge;
      }
      stats.skipped += 1;
      stats.skippedRoots[node.tag] = (stats.skippedRoots[node.tag] || 0) + 1;
      return null;
    }
    if (["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"].includes(node.tag) && node.namespace === "http://www.w3.org/2000/svg") {
      const graphic = svgGraphic(node, parent, byPath);
      if (graphic) stats.svgGraphics += 1;
      else stats.skippedSvgUnsupported += 1;
      return graphic;
    }
    if (node.tag === "img" || node.tag === "canvas") {
      const url = node.attributes.assetUrl || node.attributes.dataUrl || node.attributes.currentSrc || node.attributes.src;
      if (!url) { stats.skipped += 1; return null; }
      stats.images += 1;
      return { type:"rectangle", name:semanticLayerName(node), layoutPosition:"absolute", ...relativeRect(node, parent), fill:{ type:"image", url, mode:node.tag === "img" ? imageMode(node) : "stretch" }, cornerRadius:cornerRadius(node.styles) };
    }
    const backgroundFill = cssBackgroundToFill(node);
    const backgroundColor = safeColor(node.styles.backgroundColor);
    const effect = cssShadowToEffect(node.styles.boxShadow);
    const border = borderProperties(node.styles);
    let frameRect = relativeRect(node, parent);
    if (node.namespace === "http://www.w3.org/2000/svg" && node.tag !== "svg") {
      let svg = node;
      while (svg && svg.tag !== "svg") svg = byPath.get(svg.parentPath);
      if (svg) frameRect = {x:0,y:0,width:round(svg.rect.width),height:round(svg.rect.height)};
    }
    const painted = node.path === capture.rootPath || Boolean(backgroundFill || backgroundColor || border.stroke || effect);
    const frame = painted ? {
      type:"frame", name:semanticLayerName(node), layout:"none", layoutPosition:"absolute",
      ...frameRect, cornerRadius:cornerRadius(node.styles),
      ...(backgroundFill ? { fill:backgroundFill } : backgroundColor ? { fill:backgroundColor } : {}),
      ...border, ...(effect ? { effect } : {}),
      ...(px(node.styles.opacity, 1) < 1 ? { opacity:round(px(node.styles.opacity, 1)) } : {}), children:[],
    } : {
      type:"group", name:semanticLayerName(node), layoutPosition:"absolute", x:frameRect.x, y:frameRect.y,
      ...(px(node.styles.opacity, 1) < 1 ? { opacity:round(px(node.styles.opacity, 1)) } : {}), children:[],
    };
    if (painted) stats.frames += 1; else stats.groups += 1;
    if (backgroundFill?.type === "image") stats.images += 1;
    if (backgroundFill?.type === "gradient") stats.gradients += 1;
    if (node.text && (!node.textRect || (node.textRect.width > 0 && node.textRect.height > 0))) { frame.children.push(makeText(node, node)); stats.texts += 1; }
    const control = controlText(node, node);
    if (control) { frame.children.push(control); stats.controls += 1; }
    for (const path of childPaths.get(node.path) || []) {
      const child = convertNode(byPath.get(path), node);
      if (child) frame.children.push(child);
    }
    return frame;
  };
  const root = convertNode(rootSource, { rect:{ x:0, y:0 } });
  root.name = `Captured · ${inferTitle(capture, rootSource)}`;
  root.x = 0;
  root.y = 0;
  root.layoutPosition = undefined;
  root.clip = false;
  return { format:"pencil-node-tree", version:2, source:capture.source, stats, root };
}

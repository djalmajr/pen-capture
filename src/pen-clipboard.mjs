import { captureElement, hydrateFilteredImageAssets } from "./capture-element.mjs";
import { convertCaptureToPen } from "./convert-capture.mjs";
import { inlineCaptureAssets } from "./inline-assets.mjs";

export const PEN_CLIPBOARD_ATTRIBUTE = "data-pen-node-clipboard";

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function createPenClipboardData(nodes, source = "pen-capture/browser-extension") {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new TypeError("Pen clipboard data requires at least one node");
  }
  return {
    source,
    localData: [],
    remoteData: {
      themes: {},
      variables: {},
      nodes,
    },
  };
}

export function createPenClipboardHtml(nodes, source) {
  const data = createPenClipboardData(nodes, source);
  return `<span ${PEN_CLIPBOARD_ATTRIBUTE}="${encodeBase64Utf8(JSON.stringify(data))}"></span>`;
}

export async function captureElementForPen(element, options = {}) {
  const capture = captureElement(element, options);
  await hydrateFilteredImageAssets(capture, element);
  if (options.inlineAssets === true) await inlineCaptureAssets(capture, options);
  const converted = convertCaptureToPen(capture, {
    allowEmbeddedAssets:options.allowEmbeddedAssets !== false,
  });
  return {
    capture,
    converted,
    html: createPenClipboardHtml([converted.root]),
  };
}

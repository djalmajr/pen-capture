import { captureElement } from "./capture-element.mjs";
import { convertCaptureToPencil } from "./convert-capture.mjs";
import { inlineCaptureAssets } from "./inline-assets.mjs";

export const PENCIL_CLIPBOARD_ATTRIBUTE = "data-pen-node-clipboard";

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function createPencilClipboardData(nodes, source = "pencil-capture/browser-extension") {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new TypeError("Pencil clipboard data requires at least one node");
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

export function createPencilClipboardHtml(nodes, source) {
  const data = createPencilClipboardData(nodes, source);
  return `<span ${PENCIL_CLIPBOARD_ATTRIBUTE}="${encodeBase64Utf8(JSON.stringify(data))}"></span>`;
}

export async function captureElementForPencil(element, options = {}) {
  const capture = captureElement(element, options);
  if (options.inlineAssets === true) await inlineCaptureAssets(capture, options);
  const converted = convertCaptureToPencil(capture);
  return {
    capture,
    converted,
    html: createPencilClipboardHtml([converted.root]),
  };
}

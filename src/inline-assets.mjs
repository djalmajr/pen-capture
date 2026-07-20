function urlsFromBackgroundImage(value) {
  if (!value || value === "none") return [];
  return Array.from(value.matchAll(/url\((?:"([^"]+)"|'([^']+)'|([^)'"\s]+))\)/g), (match) => match[1] || match[2] || match[3]).filter(Boolean);
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function fetchDataUrl(url, fetchFn) {
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:${blob.type || "application/octet-stream"};base64,${bytesToBase64(bytes)}`;
}

export async function inlineCaptureAssets(capture, options = {}) {
  const fetchFn = options.fetchFn || globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return capture;
  const baseUrl = capture.source?.url || globalThis.location?.href;
  const cache = new Map();
  const resolve = async (rawUrl) => {
    if (!rawUrl || rawUrl.startsWith("data:") || rawUrl.startsWith("blob:")) return rawUrl;
    const absoluteUrl = baseUrl ? new URL(rawUrl, baseUrl).href : rawUrl;
    if (!cache.has(absoluteUrl)) {
      cache.set(absoluteUrl, fetchDataUrl(absoluteUrl, fetchFn).catch(() => absoluteUrl));
    }
    return cache.get(absoluteUrl);
  };
  for (const node of capture.nodes) {
    if (node.tag === "img") {
      const source = node.attributes.currentSrc || node.attributes.src;
      if (source) node.attributes.assetUrl = await resolve(source);
    }
    const backgroundUrls = urlsFromBackgroundImage(node.styles.backgroundImage);
    if (backgroundUrls.length) {
      node.attributes.backgroundAssetUrls = await Promise.all(backgroundUrls.map(resolve));
    }
  }
  return capture;
}

export { urlsFromBackgroundImage };

import { chromium } from "playwright";
import { createPenClipboardHtml } from "../src/pen-clipboard.mjs";
import { materializePenAssets } from "../src/materialize-pen-assets.mjs";

const url = process.argv[2] || "https://ui.shadcn.com/preview/base/preview-02?preset=b1FS9AzhY&theme=amber&chartColor=amber&font=noto-sans&baseColor=olive&radius=small&template=vite&pointer=true";
const selector = process.argv[3] || "div.relative.bg-background > div.overflow-x-auto.overflow-y-hidden > div.flex.w-full > div.grid.grid-cols-7";
const browser = await chromium.launch({ headless:process.env.PEN_CAPTURE_HEADED !== "1" });
try {
  const context = await browser.newContext();
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin:new URL(url).origin });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto(url, { waitUntil:"networkidle", timeout:60_000 });
  await page.locator(selector).waitFor({ state:"visible", timeout:30_000 });
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.evaluate(() => document.fonts?.ready);
  if (process.env.PEN_CAPTURE_FIT_TARGET !== "0") {
    const box = await page.locator(selector).boundingBox();
    if (box) {
      await page.setViewportSize({
        width:Math.max(1280,Math.ceil(box.x + box.width)),
        height:Math.max(960,Math.ceil(box.y + box.height)),
      });
    }
  }
  await page.waitForTimeout(Number(process.env.PEN_CAPTURE_SETTLE_MS || 1500));
  await page.addScriptTag({ path:new URL("../dist/extension/bridge.js", import.meta.url).pathname });
  await page.bringToFront();
  const capture = await page.evaluate(async (targetSelector) => {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Capture bridge timed out")), 60_000);
      const onResponse = (event) => {
        const response = JSON.parse(event.detail);
        if (response.id !== id) return;
        clearTimeout(timeout);
        globalThis.removeEventListener("pen-capture:copy-response", onResponse);
        response.ok ? resolve(response) : reject(new Error(response.error));
      };
      globalThis.addEventListener("pen-capture:copy-response", onResponse);
      globalThis.dispatchEvent(new CustomEvent("pen-capture:copy-request", {
        detail:JSON.stringify({ id, selector:targetSelector }),
      }));
    });
  }, selector);
  await page.evaluate(async ({html, plain}) => {
    await navigator.clipboard.write([new ClipboardItem({
      "text/html":new Blob([html], {type:"text/html"}),
      "text/plain":new Blob([plain], {type:"text/plain"}),
    })]);
  },capture);
  const result = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const summary = [];
    for (const item of items) {
      const entry = { types:item.types };
      if (item.types.includes("text/html")) {
        const html = await (await item.getType("text/html")).text();
        entry.bytes = new Blob([html]).size;
        entry.html = html;
        entry.marker = html.includes("data-pen-node-clipboard");
        const encoded = html.match(/data-pen-node-clipboard="([^"]+)"/)?.[1];
        if (encoded) {
          const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))));
          entry.nodes = payload.remoteData?.nodes?.length || 0;
          entry.firstNodeType = payload.remoteData?.nodes?.[0]?.type;
        }
      }
      summary.push(entry);
    }
    return summary.find((entry) => entry.marker) || { marker:false, items:summary };
  });
  if (!result || result.marker !== true) {
    throw new Error(`Clipboard smoke test failed: ${JSON.stringify({ result, browserErrors })}`);
  }
  result.containsDataUrl = Boolean(result.html?.includes("data:image/"));
  let materialized = null;
  if (process.env.PEN_CAPTURE_MATERIALIZE_DIR && result.html) {
    const encoded = result.html.match(/data-pen-node-clipboard="([^"]+)"/)?.[1];
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))));
    materialized = await materializePenAssets(payload.remoteData.nodes, {
      outputDir:process.env.PEN_CAPTURE_MATERIALIZE_DIR,
      relativePrefix:process.env.PEN_CAPTURE_ASSET_PREFIX || "./assets/captured",
    });
    const html = createPenClipboardHtml(payload.remoteData.nodes, payload.source);
    await page.evaluate(async (nextHtml) => {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html":new Blob([nextHtml], {type:"text/html"}),
        "text/plain":new Blob(["Captured for Pen"], {type:"text/plain"}),
      })]);
    }, html);
    const rewritten = await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      const item = items.find((candidate) => candidate.types.includes("text/html"));
      const html = item ? await (await item.getType("text/html")).text() : "";
      return {marker:html.includes("data-pen-node-clipboard"),bytes:new Blob([html]).size,containsDataUrl:html.includes("data:image/")};
    });
    result.bytes = rewritten.bytes;
    result.rewritten = rewritten;
  }
  delete result.html;
  const captureSummary = {...capture, htmlBytes:new Blob([capture.html]).size};
  delete captureSummary.html;
  delete captureSummary.plain;
  console.log(JSON.stringify({ url, selector, capture:captureSummary, materialized, ...result }));
  const holdMs = Number(process.env.PEN_CAPTURE_HOLD_MS || 0);
  if (holdMs > 0) await new Promise((resolve) => setTimeout(resolve, holdMs));
} finally {
  await browser.close();
}

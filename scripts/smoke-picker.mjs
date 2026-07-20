import { chromium } from "playwright";

const url = process.argv[2] || "https://ui.shadcn.com/preview/base/preview-02?preset=b1FS9AzhY&theme=amber&chartColor=amber&font=noto-sans&baseColor=olive&radius=small&template=vite&pointer=true";
const targetSelector = process.argv[3] || "div.relative.bg-background > div.overflow-x-auto.overflow-y-hidden > div.flex.w-full > div.grid.grid-cols-7";
const root = new URL("../", import.meta.url);
const browser = await chromium.launch({ headless:true });
try {
  const context = await browser.newContext();
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin:new URL(url).origin });
  const page = await context.newPage();
  await page.goto(url, { waitUntil:"networkidle", timeout:60_000 });
  await page.locator(targetSelector).waitFor({ state:"visible", timeout:30_000 });
  await page.addScriptTag({ path:new URL("dist/extension/bridge.js", root).pathname });
  await page.evaluate(() => {
    Object.defineProperty(globalThis, "chrome", {
      configurable:true,
      value:{ runtime:{ getURL:(path) => `https://extension.invalid/${path}` } },
    });
  });
  await page.addScriptTag({ path:new URL("dist/extension/content.js", root).pathname });

  const target = page.locator(targetSelector);
  const box = await target.boundingBox();
  if (!box) throw new Error("Target has no visible bounding box");
  await page.mouse.move(box.x + Math.min(40, box.width / 2), box.y + Math.min(40, box.height / 2));
  await page.mouse.click(box.x + Math.min(40, box.width / 2), box.y + Math.min(40, box.height / 2));

  const state = async () => page.locator("#__pencil_capture_host__").evaluate((host) => ({
    selectionHidden:host.shadowRoot.querySelector(".selection-view").hidden,
    capturingHidden:host.shadowRoot.querySelector(".capturing-view").hidden,
    successHidden:host.shadowRoot.querySelector(".success-view").hidden,
    capturingText:host.shadowRoot.querySelector(".capturing-message").textContent,
  }));
  const capturing = await state();
  if (!capturing.selectionHidden || capturing.capturingHidden || !capturing.successHidden) {
    throw new Error(`Picker did not enter its exclusive capturing view: ${JSON.stringify(capturing)}`);
  }
  await page.waitForFunction(() => {
    const host = document.getElementById("__pencil_capture_host__");
    return host && !host.shadowRoot.querySelector(".success-view").hidden;
  }, null, { timeout:60_000 });
  const success = await state();
  const clipboard = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const item = items.find((candidate) => candidate.types.includes("text/html"));
    const html = item ? await (await item.getType("text/html")).text() : "";
    const encoded = html.match(/data-pen-node-clipboard="([^"]+)"/)?.[1];
    const payload = encoded
      ? JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))))
      : null;
    return {
      types:item?.types || [],
      marker:Boolean(encoded),
      bytes:new Blob([html]).size,
      nodes:payload?.remoteData?.nodes?.length || 0,
      firstNodeType:payload?.remoteData?.nodes?.[0]?.type,
    };
  });
  if (!success.selectionHidden || !success.capturingHidden || success.successHidden || !clipboard.marker) {
    throw new Error(`Picker did not finish in its exclusive success view: ${JSON.stringify({ success, clipboard })}`);
  }
  console.log(JSON.stringify({ url, clicked:true, capturing, success, clipboard }));
} finally {
  await browser.close();
}

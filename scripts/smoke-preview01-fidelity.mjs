import { chromium } from "playwright";

const url = "https://ui.shadcn.com/preview/base/preview?preset=b1FS9AzhY&item=preview&theme=amber&chartColor=amber&font=noto-sans&baseColor=olive&radius=small&template=vite&pointer=true";
const selector = "div.flex.w-full > div.grid.grid-cols-7 > div.flex.flex-col:nth-of-type(1) > div.cn-card.flex:nth-of-type(1)";

function flatten(node) {
  return [node, ...(node.children || []).flatMap(flatten)];
}

const browser = await chromium.launch({headless:true});
try {
  const context = await browser.newContext({reducedMotion:"reduce"});
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {origin:new URL(url).origin});
  const page = await context.newPage();
  await page.goto(url, {waitUntil:"networkidle",timeout:60_000});
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
  await page.locator(selector).waitFor({state:"visible",timeout:30_000});
  await page.addScriptTag({path:new URL("../dist/extension/bridge.js",import.meta.url).pathname});
  const capture = await page.evaluate(async (targetSelector) => {
    const id = crypto.randomUUID();
    return new Promise((resolve,reject) => {
      const timeout = setTimeout(() => reject(new Error("Capture bridge timed out")),60_000);
      const listener = (event) => {
        const response = JSON.parse(event.detail);
        if (response.id !== id) return;
        clearTimeout(timeout);
        globalThis.removeEventListener("pen-capture:copy-response",listener);
        response.ok ? resolve(response) : reject(new Error(response.error));
      };
      globalThis.addEventListener("pen-capture:copy-response",listener);
      globalThis.dispatchEvent(new CustomEvent("pen-capture:copy-request",{detail:JSON.stringify({id,selector:targetSelector})}));
    });
  },selector);
  const root = await page.evaluate((html) => {
    const encoded = html.match(/data-pen-node-clipboard="([^"]+)"/)?.[1];
    if (!encoded) throw new Error("Pen clipboard marker is missing");
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded),(character) => character.charCodeAt(0)))).remoteData.nodes[0];
  },capture.html);
  const text = flatten(root).filter((node) => node.type === "text").map((node) => node.content);
  for (const titlePart of ["Nova", "-", "Noto Sans"]) {
    if (!text.includes(titlePart)) throw new Error(`Editable title run was merged or lost: ${JSON.stringify(text)}`);
  }
  const description = text.find((content) => content?.startsWith("phrases. This is a preview"));
  if (description !== "phrases. This is a preview of the typography...") {
    throw new Error(`Line-clamped description lost its visible ellipsis: ${JSON.stringify(description)}`);
  }
  if (text.includes("styles.")) throw new Error("A hidden line escaped the line-clamped frame");
  const tokenLabels = text.filter((content) => content?.startsWith("--"));
  if (!tokenLabels.some((label) => label.startsWith("--back") && label.endsWith("..."))) {
    throw new Error(`Single-line token label lost its visible ellipsis: ${JSON.stringify(tokenLabels)}`);
  }
  if (!tokenLabels.includes("--muted") || !tokenLabels.includes("--accent") || !tokenLabels.includes("--border")) {
    throw new Error(`Non-overflowing token labels were truncated: ${JSON.stringify(tokenLabels)}`);
  }
  console.log(JSON.stringify({description,tokenLabels,hiddenLineRemoved:true,textLayers:text.length}));
} finally {
  await browser.close();
}

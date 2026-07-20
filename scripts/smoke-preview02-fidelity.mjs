import { chromium } from "playwright";

const url = "https://ui.shadcn.com/preview/base/preview-02?preset=b1FS9AzhY&theme=amber&chartColor=amber&font=noto-sans&baseColor=olive&radius=small&template=vite&pointer=true";
const selectors = {
  stock:"div.flex.w-full > div.grid.grid-cols-7 > div.flex.flex-col:nth-of-type(6) > div.cn-card.flex:nth-of-type(1)",
  frontDoor:"div.col-span-2.flex:nth-of-type(3) > div.grid.grid-cols-2:nth-of-type(3) > div.flex.flex-col:nth-of-type(2) > div.cn-card.flex:nth-of-type(2)",
};

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
  await page.addScriptTag({path:new URL("../dist/extension/bridge.js",import.meta.url).pathname});

  const capture = async (selector) => {
    await page.locator(selector).waitFor({state:"visible",timeout:30_000});
    await page.evaluate(async (targetSelector) => {
      const id = crypto.randomUUID();
      await new Promise((resolve,reject) => {
        const timeout = setTimeout(() => reject(new Error("Capture bridge timed out")),60_000);
        const listener = (event) => {
          const response = JSON.parse(event.detail);
          if (response.id !== id) return;
          clearTimeout(timeout);
          globalThis.removeEventListener("pencil-capture:copy-response",listener);
          response.ok ? resolve(response) : reject(new Error(response.error));
        };
        globalThis.addEventListener("pencil-capture:copy-response",listener);
        globalThis.dispatchEvent(new CustomEvent("pencil-capture:copy-request",{detail:JSON.stringify({id,selector:targetSelector})}));
      });
    },selector);
    return page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      const item = items.find((candidate) => candidate.types.includes("text/html"));
      const html = item ? await (await item.getType("text/html")).text() : "";
      const encoded = html.match(/data-pen-node-clipboard="([^"]+)"/)?.[1];
      if (!encoded) throw new Error("Pencil clipboard marker is missing");
      return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded),(character) => character.charCodeAt(0)))).remoteData.nodes[0];
    });
  };

  const stock = await capture(selectors.stock);
  const stockNodes = flatten(stock);
  const area = stockNodes.find((node) => node.type === "path" && node.fill?.type === "gradient");
  const colors = area?.fill?.colors?.map((stop) => stop.color);
  if (!area || JSON.stringify(colors) !== JSON.stringify(["#FFD2302E","#FFD23008"])) {
    throw new Error(`Stock area gradient is incomplete: ${JSON.stringify(colors)}`);
  }

  const frontDoor = await capture(selectors.frontDoor);
  const frontDoorNodes = flatten(frontDoor);
  const pattern = frontDoorNodes.find((node) => node.type === "frame" && node.name?.endsWith("Background image"));
  const stripes = pattern?.children || [];
  if (stripes.length < 20 || !stripes.every((node) => node.type === "path" && node.stroke === "#E8E8E3" && node.strokeWidth === 1)) {
    throw new Error(`Front Door pattern is incomplete: ${stripes.length} stripes`);
  }

  console.log(JSON.stringify({stock:{gradientColors:colors},frontDoor:{stripes:stripes.length},containsDataUrl:JSON.stringify([stock,frontDoor]).includes("data:image/")}));
} finally {
  await browser.close();
}

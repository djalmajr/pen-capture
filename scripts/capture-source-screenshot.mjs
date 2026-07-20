import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";

const [url, selector, outputPath] = process.argv.slice(2);
if (!url || !selector || !outputPath) {
  console.error("Usage: bun scripts/capture-source-screenshot.mjs <url> <selector> <output.png>");
  process.exit(2);
}

const output = resolve(outputPath);
await mkdir(dirname(output), {recursive:true});
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({deviceScaleFactor:1,viewport:{width:1280,height:960}});
  await page.goto(url, {waitUntil:"networkidle",timeout:60_000});
  const target = page.locator(selector);
  await target.waitFor({state:"visible",timeout:30_000});
  const initialBox = await target.boundingBox();
  if (!initialBox) throw new Error(`Target has no bounding box: ${selector}`);
  await page.setViewportSize({
    width:Math.max(1280,Math.ceil(initialBox.x + initialBox.width)),
    height:Math.max(960,Math.ceil(initialBox.y + initialBox.height)),
  });
  await page.waitForTimeout(250);
  await target.screenshot({path:output,animations:"disabled"});
  const box = await target.boundingBox();
  console.log(JSON.stringify({url,selector,output,width:box?.width,height:box?.height}));
} finally {
  await browser.close();
}

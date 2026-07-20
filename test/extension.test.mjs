import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { isPageCaptureShortcut, pageCaptureModifier } from "../src/extension/shortcuts.mjs";
import { createPencilClipboardHtml } from "../src/pencil-clipboard.mjs";
import { fetchExtensionAsset } from "../src/extension/asset-fetch.mjs";
import { effectiveFilter } from "../src/capture-element.mjs";
import { captureProgressForElapsed } from "../src/extension/capture-progress.mjs";
import { waitForVisualStability } from "../src/extension/visual-stability.mjs";

describe("extension clipboard contract", () => {
  test("encodes Pencil's native node clipboard envelope", () => {
    const node = { type:"frame", name:"Captured card", width:320, height:200, children:[] };
    const html = createPencilClipboardHtml([node], "test-source");
    const encoded = html.match(/data-pen-node-clipboard="([^"]+)"/)?.[1];
    expect(encoded).toBeTruthy();
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))));
    expect(payload).toEqual({
      source:"test-source",
      localData:[],
      remoteData:{ themes:{}, variables:{}, nodes:[node] },
    });
  });

  test("declares Pencil icons for the extension and action", async () => {
    const manifest = JSON.parse(await readFile(new URL("../extension/manifest.json", import.meta.url), "utf8"));
    expect(manifest.action.default_icon["16"]).toBe("icons/icon-16.png");
    expect(manifest.icons["128"]).toBe("icons/icon-128.png");
    expect(manifest.host_permissions).toEqual(["<all_urls>"]);
  });

  test("disables embedded assets in the direct extension paste path", async () => {
    const source = await readFile(new URL("../src/extension/main-world-capture.mjs", import.meta.url), "utf8");
    expect(source).toContain("allowEmbeddedAssets:false");
  });

  test("keeps Escape teardown in the compiled picker contract", async () => {
    const content = await readFile(new URL("../src/extension/content.mjs", import.meta.url), "utf8");
    expect(content).toContain('event.key === "Escape"');
    expect(content).toContain('globalThis.addEventListener("keydown", cancelFromKeyboard, true)');
    expect(content).toContain('globalThis.removeEventListener("keydown", cancelFromKeyboard, true)');
  });

  test("marks the live target across isolated and main extension worlds", async () => {
    const content = await readFile(new URL("../src/extension/content.mjs", import.meta.url), "utf8");
    const bridge = await readFile(new URL("../src/extension/main-world-bridge.mjs", import.meta.url), "utf8");
    expect(content).toContain('const TARGET_ATTRIBUTE = "data-pencil-capture-target"');
    expect(content).toContain("sourceSelector");
    expect(content).toContain("target.isConnected");
    expect(bridge).toContain("request.sourceSelector");
  });

  test("reports bounded capture progress until real completion", () => {
    expect(captureProgressForElapsed(0)).toBe(4);
    expect(captureProgressForElapsed(450)).toBeGreaterThanOrEqual(20);
    expect(captureProgressForElapsed(450)).toBeLessThan(35);
    expect(captureProgressForElapsed(60_000)).toBe(95);
  });

  test("resolves redirected image URLs before Pencil receives them", async () => {
    const content = await readFile(new URL("../src/extension/content.mjs", import.meta.url), "utf8");
    const calls = [];
    const result = await fetchExtensionAsset("https://github.com/example.png",{fetchImpl:async (url,options) => {
      calls.push({url,options});
      return {ok:true,status:200,url:"https://avatars.githubusercontent.com/u/1?v=4"};
    }});
    expect(calls).toEqual([{url:"https://github.com/example.png",options:{method:"HEAD"}}]);
    expect(result).toEqual({finalUrl:"https://avatars.githubusercontent.com/u/1?v=4",dataUrl:null});
    expect(content).toContain("finalUrl:response?.ok ? response.finalUrl : null");
  });

  test("captures CSS blend modes for editable visual overlays", async () => {
    const capture = await readFile(new URL("../src/capture-element.mjs", import.meta.url), "utf8");
    expect(capture).toContain('"mixBlendMode"');
  });

  test("combines an image's own filter with inherited filters", () => {
    const root = {filter:"grayscale(1)",parentElement:null};
    const image = {filter:"brightness(0.6)",parentElement:root};
    expect(effectiveFilter(image,root,(node) => ({filter:node.filter}))).toBe("brightness(0.6) grayscale(1)");
  });

  test("waits until animated SVG geometry stops changing", async () => {
    const signatures = ["arc-10","arc-30","arc-80","arc-80","arc-80"];
    const result = await waitForVisualStability(() => signatures.shift() || "arc-80",{
      intervalMs:0,stableSamples:2,timeoutMs:100,sleep:async () => {},
    });
    expect(result).toEqual({stable:true,signature:"arc-80"});
  });
});

describe("capture shortcuts", () => {
  test("labels the platform modifier", () => {
    expect(pageCaptureModifier("MacIntel")).toBe("⌘");
    expect(pageCaptureModifier("Win32")).toBe("Ctrl");
  });

  test("distinguishes element and whole-page capture", () => {
    expect(isPageCaptureShortcut({ key:"Enter", metaKey:true, ctrlKey:false })).toBe(true);
    expect(isPageCaptureShortcut({ key:"Enter", metaKey:false, ctrlKey:false })).toBe(false);
  });
});

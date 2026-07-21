import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { isPageCaptureShortcut, pageCaptureModifier } from "../src/extension/shortcuts.mjs";
import { createPenClipboardHtml } from "../src/pen-clipboard.mjs";
import { fetchExtensionAsset } from "../src/extension/asset-fetch.mjs";
import { effectiveFilter } from "../src/capture-element.mjs";
import { captureProgressForElapsed } from "../src/extension/capture-progress.mjs";
import { waitForVisualStability } from "../src/extension/visual-stability.mjs";
import { writeClipboardPayload } from "../src/extension/write-clipboard.mjs";

describe("extension clipboard contract", () => {
  test("encodes Pen's native node clipboard envelope", () => {
    const node = { type:"frame", name:"Captured card", width:320, height:200, children:[] };
    const html = createPenClipboardHtml([node], "test-source");
    const encoded = html.match(/data-pen-node-clipboard="([^"]+)"/)?.[1];
    expect(encoded).toBeTruthy();
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))));
    expect(payload).toEqual({
      source:"test-source",
      localData:[],
      remoteData:{ themes:{}, variables:{}, nodes:[node] },
    });
  });

  test("declares Pen icons for the extension and action", async () => {
    const manifest = JSON.parse(await readFile(new URL("../extension/manifest.json", import.meta.url), "utf8"));
    expect(manifest.name).toBe("Pen Capture");
    expect(manifest.description).toContain("for Pen");
    expect(manifest.action.default_icon["16"]).toBe("icons/icon-16.png");
    expect(manifest.icons["128"]).toBe("icons/icon-128.png");
    expect(manifest.web_accessible_resources[0].resources).toEqual(["icons/pen-mark.png"]);
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
    expect(content).toContain('const TARGET_ATTRIBUTE = "data-pen-capture-target"');
    expect(content).toContain("sourceSelector");
    expect(content).toContain("target.isConnected");
    expect(bridge).toContain("request.sourceSelector");
  });

  test("injects the picker and capture bridge into accessible iframe documents", async () => {
    const background = await readFile(new URL("../src/extension/background.mjs", import.meta.url), "utf8");
    const content = await readFile(new URL("../src/extension/content.mjs", import.meta.url), "utf8");
    expect(background).toContain("allFrames:true");
    expect(content).toContain("globalThis.top !== globalThis");
    expect(content).toContain('target?.matches?.("iframe,frame")');
    expect(content).toContain('globalThis.top.postMessage({type:FRAME_ACTIVITY_MESSAGE}, "*")');
    expect(content).toContain('globalThis.top.postMessage({type:FRAME_CANCEL_MESSAGE}, "*")');
  });

  test("writes iframe captures through the extension offscreen document", async () => {
    const manifest = JSON.parse(await readFile(new URL("../extension/manifest.json", import.meta.url), "utf8"));
    const background = await readFile(new URL("../src/extension/background.mjs", import.meta.url), "utf8");
    expect(manifest.permissions).toContain("offscreen");
    expect(manifest.permissions).toContain("clipboardWrite");
    expect(background).toContain('reasons:["CLIPBOARD"]');

    const OriginalClipboardItem = globalThis.ClipboardItem;
    globalThis.ClipboardItem = class ClipboardItem {
      constructor(data) { this.data = data; this.types = Object.keys(data); }
    };
    const writes = [];
    try {
      const result = await writeClipboardPayload({html:"<b>Card</b>", plain:"Card"}, {clipboard:{write:async (items) => writes.push(items)}, documentRef:null});
      expect(result).toEqual({ok:true, types:["text/html", "text/plain"]});
      expect(writes).toHaveLength(1);
    } finally {
      globalThis.ClipboardItem = OriginalClipboardItem;
    }
  });

  test("falls back to a copy event when the offscreen document is not focused", async () => {
    const OriginalClipboardItem = globalThis.ClipboardItem;
    globalThis.ClipboardItem = class ClipboardItem {
      constructor(data) { this.types = Object.keys(data); }
    };
    const copied = {};
    let listener;
    const documentRef = {
      addEventListener:(_type, nextListener) => { listener = nextListener; },
      removeEventListener:() => {},
      execCommand:() => {
        listener({clipboardData:{setData:(type, value) => { copied[type] = value; }}, preventDefault:() => {}});
        return true;
      },
    };
    try {
      const result = await writeClipboardPayload({html:"<b>Card</b>", plain:"Card"}, {
        clipboard:{write:async () => { throw new DOMException("Document is not focused", "NotAllowedError"); }},
        documentRef,
      });
      expect(result.ok).toBe(true);
      expect(copied).toEqual({"text/html":"<b>Card</b>", "text/plain":"Card"});
    } finally {
      globalThis.ClipboardItem = OriginalClipboardItem;
    }
  });

  test("reports bounded capture progress until real completion", () => {
    expect(captureProgressForElapsed(0)).toBe(4);
    expect(captureProgressForElapsed(450)).toBeGreaterThanOrEqual(20);
    expect(captureProgressForElapsed(450)).toBeLessThan(35);
    expect(captureProgressForElapsed(60_000)).toBe(95);
  });

  test("resolves redirected image URLs before Pen receives them", async () => {
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

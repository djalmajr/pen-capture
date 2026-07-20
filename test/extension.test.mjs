import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { isPageCaptureShortcut, pageCaptureModifier } from "../src/extension/shortcuts.mjs";
import { createPencilClipboardHtml } from "../src/pencil-clipboard.mjs";

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

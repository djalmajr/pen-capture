import { describe, expect, test } from "bun:test";
import { inlineCaptureAssets, urlsFromBackgroundImage } from "../src/inline-assets.mjs";

describe("inlineCaptureAssets", () => {
  test("finds quoted and unquoted CSS image URLs", () => {
    expect(urlsFromBackgroundImage('url("/one.png"), url(two.jpg)')).toEqual(["/one.png", "two.jpg"]);
  });

  test("embeds img and background assets as data URLs", async () => {
    const capture = { source:{url:"https://example.com/page"}, nodes:[
      { tag:"img", attributes:{src:"/portrait.png"}, styles:{backgroundImage:"none"} },
      { tag:"div", attributes:{}, styles:{backgroundImage:'url("/hero.png")'} },
    ] };
    const fetchFn = async () => new Response(new Uint8Array([1, 2, 3]), {status:200,headers:{"content-type":"image/png"}});
    await inlineCaptureAssets(capture, {fetchFn});
    expect(capture.nodes[0].attributes.assetUrl).toBe("data:image/png;base64,AQID");
    expect(capture.nodes[1].attributes.backgroundAssetUrls).toEqual(["data:image/png;base64,AQID"]);
  });
});

import { fetchExtensionAsset } from "./asset-fetch.mjs";

const OFFSCREEN_URL = "offscreen.html";
let creatingOffscreenDocument;

async function ensureOffscreenDocument() {
  const documentUrl = chrome.runtime.getURL(OFFSCREEN_URL);
  const contexts = await chrome.runtime.getContexts({
    contextTypes:["OFFSCREEN_DOCUMENT"],
    documentUrls:[documentUrl],
  });
  if (contexts.length > 0) return;
  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = chrome.offscreen.createDocument({
      url:OFFSCREEN_URL,
      reasons:["CLIPBOARD"],
      justification:"Write the captured Pen design from iframe and page documents",
    }).finally(() => { creatingOffscreenDocument = undefined; });
  }
  await creatingOffscreenDocument;
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  const target = { tabId:tab.id, allFrames:true };
  await chrome.scripting.executeScript({ target, world:"MAIN", files:["bridge.js"] });
  await chrome.scripting.executeScript({ target, files:["content.js"] });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "pen-capture:write-clipboard") {
    (async () => {
      try {
        await ensureOffscreenDocument();
        sendResponse(await chrome.runtime.sendMessage({
          type:"pen-capture:offscreen-write",
          html:message.html,
          plain:message.plain,
        }));
      } catch (error) {
        sendResponse({ok:false, error:error instanceof Error ? error.message : String(error)});
      }
    })();
    return true;
  }
  if (message?.type !== "pen-capture:fetch-asset" || typeof message.url !== "string") return false;
  (async () => {
    try {
      sendResponse({ok:true,...await fetchExtensionAsset(message.url,{includeData:message.includeData === true})});
    } catch (error) {
      sendResponse({ok:false,error:error instanceof Error ? error.message : String(error)});
    }
  })();
  return true;
});

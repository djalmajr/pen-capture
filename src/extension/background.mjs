import { fetchExtensionAsset } from "./asset-fetch.mjs";

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, world:"MAIN", files:["bridge.js"] });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "pencil-capture:fetch-asset" || typeof message.url !== "string") return false;
  (async () => {
    try {
      sendResponse({ok:true,...await fetchExtensionAsset(message.url,{includeData:message.includeData === true})});
    } catch (error) {
      sendResponse({ok:false,error:error instanceof Error ? error.message : String(error)});
    }
  })();
  return true;
});

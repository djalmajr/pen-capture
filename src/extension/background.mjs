chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, world:"MAIN", files:["bridge.js"] });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "pencil-capture:fetch-asset" || typeof message.url !== "string") return false;
  (async () => {
    try {
      const response = await fetch(message.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      sendResponse({ok:true,dataUrl:`data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`});
    } catch (error) {
      sendResponse({ok:false,error:error instanceof Error ? error.message : String(error)});
    }
  })();
  return true;
});

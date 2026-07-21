import { writeClipboardPayload } from "./write-clipboard.mjs";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "pen-capture:offscreen-write") return false;
  writeClipboardPayload(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ok:false, error:error instanceof Error ? error.message : String(error)}));
  return true;
});

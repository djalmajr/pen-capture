import { captureSelectionInMainWorld } from "./main-world-capture.mjs";

const BRIDGE_KEY = "__pencilCaptureMainWorldBridge";
const REQUEST_EVENT = "pencil-capture:copy-request";
const RESPONSE_EVENT = "pencil-capture:copy-response";

if (!globalThis[BRIDGE_KEY]) {
  const onRequest = (event) => {
    let request;
    try {
      request = JSON.parse(event.detail);
    } catch {
      return;
    }
    if (!request?.id || !request?.selector) return;
    captureSelectionInMainWorld(request.selector, request.sourceSelector)
      .then((result) => respond({ id:request.id, ok:true, ...result }))
      .catch((error) => respond({ id:request.id, ok:false, error:error.message }));
  };
  const respond = (detail) => {
    globalThis.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail:JSON.stringify(detail) }));
  };
  globalThis.addEventListener(REQUEST_EVENT, onRequest);
  globalThis[BRIDGE_KEY] = { onRequest };
}

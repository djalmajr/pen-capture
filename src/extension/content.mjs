import { createSelectionState, selectChild, selectParent, setHoveredTarget } from "../selection/navigation.mjs";
import { isPageCaptureShortcut, pageCaptureModifier } from "./shortcuts.mjs";

const CONTROLLER_KEY = "__pencilCaptureController";
const REQUEST_EVENT = "pencil-capture:copy-request";
const RESPONSE_EVENT = "pencil-capture:copy-response";
const ASSET_REQUEST_EVENT = "pencil-capture:asset-request";
const ASSET_RESPONSE_EVENT = "pencil-capture:asset-response";

document.documentElement.setAttribute("data-pencil-capture-extension", "ready");
globalThis.addEventListener(ASSET_REQUEST_EVENT, async (event) => {
  let request;
  try { request = JSON.parse(event.detail); } catch { return; }
  const response = await chrome.runtime.sendMessage({type:"pencil-capture:fetch-asset",url:request.url});
  globalThis.dispatchEvent(new CustomEvent(ASSET_RESPONSE_EVENT, {
    detail:JSON.stringify({id:request.id,dataUrl:response?.ok ? response.dataUrl : null}),
  }));
});

function copyDesign(selector) {
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => finish({ ok:false, error:"Capture timed out" }), 65_000);
    const onResponse = (event) => {
      let response;
      try {
        response = JSON.parse(event.detail);
      } catch {
        return;
      }
      if (response?.id === id) finish(response);
    };
    const finish = (response) => {
      clearTimeout(timeout);
      globalThis.removeEventListener(RESPONSE_EVENT, onResponse);
      resolve(response);
    };
    globalThis.addEventListener(RESPONSE_EVENT, onResponse);
    globalThis.dispatchEvent(new CustomEvent(REQUEST_EVENT, {
      detail:JSON.stringify({ id, selector }),
    }));
  });
}

function selectorFor(element) {
  if (element === document.body) return "body";
  if (element === document.documentElement) return "html";
  if (element.id) return `#${CSS.escape(element.id)}`;
  const parts = [];
  let node = element;
  while (node && node !== document.body) {
    let part = node.tagName.toLowerCase();
    const siblings = node.parentElement
      ? Array.from(node.parentElement.children).filter((candidate) => candidate.tagName === node.tagName)
      : [];
    if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
    parts.unshift(part);
    if (node.id) {
      parts[0] = `#${CSS.escape(node.id)}`;
      break;
    }
    node = node.parentElement;
  }
  return `body > ${parts.join(" > ")}`;
}

function install() {
  if (globalThis[CONTROLLER_KEY]) return globalThis[CONTROLLER_KEY].toggle();
  const pageModifier = pageCaptureModifier(navigator.platform);
  const host = document.createElement("div");
  host.id = "__pencil_capture_host__";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .toolbar { position: fixed; z-index: 2147483647; top: 16px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; min-height: 44px; padding: 7px 14px 7px 12px; border: 1px solid rgba(15,23,42,.18); border-radius: 12px; background: rgba(255,255,255,.96); box-shadow: 0 10px 28px rgba(15,23,42,.18),0 1px 2px rgba(15,23,42,.10); color: #262626; font: 14px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; white-space: nowrap; transition: opacity 90ms ease,width 140ms ease; }
      .toolbar.pass-through { opacity: 0; pointer-events: none; }
      .view { display:flex; align-items:center; gap:12px; }
      .view[hidden] { display:none !important; }
      .state-icon { display:grid; place-items:center; width:24px; height:24px; flex:0 0 24px; }
      .mark { display:block; width:24px; height:24px; transition:filter 120ms ease,opacity 120ms ease; }
      .capturing-view .mark { filter:grayscale(1); opacity:.55; }
      .check { display:grid; place-items:center; width:20px; height:20px; border-radius:50%; background:#6691F2; color:white; font:700 14px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
      .instructions { display:flex; align-items:center; gap:12px; }
      .hint { display:inline-flex; align-items:center; gap:5px; }
      .keys { display:inline-flex; align-items:center; gap:3px; }
      kbd { display:inline-flex; align-items:center; justify-content:center; min-width:24px; height:24px; box-sizing:border-box; padding:0 6px; border:1px solid #D7D7D7; border-bottom-color:#BEBEBE; border-radius:5px; background:#FAFAFA; box-shadow:0 1px 1px rgba(0,0,0,.08); color:#333; font:12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; text-align:center; }
      .sep { width:3px; height:3px; border-radius:50%; background:#B7B7B7; flex:0 0 3px; }.message { color:#333; font-weight:400; }
      .outline { position:fixed; z-index:2147483646; pointer-events:none; box-sizing:border-box; border:2px solid #5794FF; background:rgba(87,148,255,.055); transition:left 35ms linear,top 35ms linear,width 35ms linear,height 35ms linear; }
    </style>
    <div class="toolbar">
      <div class="view selection-view">
        <span class="state-icon"><img class="mark" src="${chrome.runtime.getURL("icons/pencil.svg")}" alt="" /></span>
        <span class="instructions">
          <span class="hint">Click or <span class="keys"><kbd>↵</kbd></span> to capture</span>
          <span class="sep"></span>
          <span class="hint"><span class="keys"><kbd>${pageModifier}</kbd><kbd>↵</kbd></span> to capture page</span>
          <span class="sep"></span>
          <span class="hint"><span class="keys"><kbd>↑</kbd><kbd>↓</kbd></span> to fine-tune selection</span>
          <span class="sep"></span>
          <span class="hint"><span class="keys"><kbd>esc</kbd></span> to cancel</span>
        </span>
      </div>
      <div class="view capturing-view" hidden>
        <span class="state-icon"><img class="mark" src="${chrome.runtime.getURL("icons/pencil.svg")}" alt="" /></span>
        <span class="message capturing-message">Capturing selection…</span>
      </div>
      <div class="view success-view" hidden>
        <span class="state-icon"><span class="check">✓</span></span>
        <span class="message">Copied to clipboard. Ready to paste into Pencil.</span>
      </div>
    </div>
    <div class="outline"></div>`;
  document.documentElement.append(host);
  const toolbar = shadow.querySelector(".toolbar");
  const outline = shadow.querySelector(".outline");
  const selectionView = shadow.querySelector(".selection-view");
  const capturingView = shadow.querySelector(".capturing-view");
  const successView = shadow.querySelector(".success-view");
  const capturingMessage = shadow.querySelector(".capturing-message");
  const selection = createSelectionState(document.body);
  let active = true;
  let phase = "selection";

  function showView(nextPhase) {
    phase = nextPhase;
    selectionView.hidden = nextPhase !== "selection";
    capturingView.hidden = nextPhase !== "capturing";
    successView.hidden = nextPhase !== "success";
  }

  function updateOutline() {
    const target = selection.current;
    if (!target || target === host) return outline.style.display = "none";
    const rect = target.getBoundingClientRect();
    Object.assign(outline.style, { display:"block", left:`${rect.left}px`, top:`${rect.top}px`, width:`${rect.width}px`, height:`${rect.height}px` });
  }

  function onPointerMove(event) {
    if (!active || phase !== "selection") return;
    const rect = toolbar.getBoundingClientRect();
    const overToolbar = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    toolbar.classList.toggle("pass-through", overToolbar);
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (target && target !== host && !host.contains(target)) {
      setHoveredTarget(selection, target);
      updateOutline();
    }
  }

  async function capture(target) {
    if (!target || phase !== "selection") return;
    capturingMessage.textContent = target === document.body ? "Capturing page…" : "Capturing selection…";
    showView("capturing");
    const capturingStartedAt = performance.now();
    const response = await copyDesign(selectorFor(target));
    const minimumCapturingTime = 450;
    const remainingCapturingTime = minimumCapturingTime - (performance.now() - capturingStartedAt);
    if (remainingCapturingTime > 0) await new Promise((resolve) => setTimeout(resolve, remainingCapturingTime));
    if (!response?.ok) {
      capturingMessage.textContent = response?.error || "Could not copy design";
      return;
    }
    showView("success");
    setTimeout(teardown, 2400);
  }

  function onClick(event) {
    if (!active || phase !== "selection" || event.target === host || host.contains(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    capture(selection.current);
  }

  function onKeyDown(event) {
    if (!active) return;
    if (event.key === "Escape") return teardown();
    if (phase !== "selection") return;
    if (event.key === "ArrowUp") { event.preventDefault(); selectParent(selection, document.documentElement); return updateOutline(); }
    if (event.key === "ArrowDown") { event.preventDefault(); selectChild(selection); return updateOutline(); }
    if (event.key === "Enter") { event.preventDefault(); return capture(isPageCaptureShortcut(event) ? document.body : selection.current); }
  }

  function teardown() {
    if (!active) return;
    active = false;
    document.removeEventListener("mousemove", onPointerMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    host.remove();
    delete globalThis[CONTROLLER_KEY];
  }

  document.addEventListener("mousemove", onPointerMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  updateOutline();
  globalThis[CONTROLLER_KEY] = { toggle: teardown, teardown };
}

install();

// FILE: ui/pipWindow.js
//
// Document Picture-in-Picture helper. Pops a LIVE DOM element into a floating,
// always-on-top window (Chrome/Edge 116+ documentPictureInPicture), so a panel
// — telemetry, a worker/task monitor, a minimap — can hover over other windows
// while the engine runs elsewhere. Falls back to a normal popup window where the
// PiP API is unavailable.
//
// The element is MOVED (not cloned) so it keeps updating from the same JS that
// owns it — callers that look elements up should scope queries to a container
// they keep a reference to (e.g. `panel.querySelector("#id")`), since a plain
// document.getElementById in the original page won't find a moved node.
//
// Usage:
//   import { popOut, pipSupported } from "../ui/pipWindow.js";
//   const h = await popOut(panelEl, { title:"Monitor", width:320, height:440,
//                                     onClose:()=>{ ... } });
//   ...later: h?.close();

export function pipSupported() {
  return typeof window !== "undefined" && "documentPictureInPicture" in window;
}

// Copy the page's styles into the pop-out document so the panel looks the same.
function copyStylesInto(doc) {
  for (const sheet of document.styleSheets) {
    try {
      const css = Array.from(sheet.cssRules).map(r => r.cssText).join("\n");
      const s = doc.createElement("style");
      s.textContent = css;
      doc.head.appendChild(s);
    } catch {
      // cross-origin sheet: re-link it instead of reading rules
      if (sheet.href) {
        const l = doc.createElement("link");
        l.rel = "stylesheet"; l.href = sheet.href;
        doc.head.appendChild(l);
      }
    }
  }
}

// popOut(el, opts) -> { window, close() } or null if it couldn't open.
export async function popOut(el, opts = {}) {
  if (!el) return null;
  const { title = "Pop-out", width = 360, height = 440, onOpen, onClose } = opts;

  // remember where the element was, so we can put it back on close
  const anchor = document.createComment("pip-anchor");
  el.parentNode.insertBefore(anchor, el);
  let restored = false;
  const restore = () => {
    if (restored) return; restored = true;
    if (anchor.parentNode) anchor.parentNode.insertBefore(el, anchor);
    anchor.remove();
    try { onClose?.(); } catch {}
  };

  try {
    if (pipSupported()) {
      const pip = await window.documentPictureInPicture.requestWindow({ width, height });
      copyStylesInto(pip.document);
      pip.document.title = title;
      pip.document.body.style.margin = "0";
      pip.document.body.appendChild(el);
      pip.addEventListener("pagehide", restore, { once: true });
      try { onOpen?.(pip); } catch {}
      return { window: pip, close: () => pip.close() };
    }

    // fallback: a regular popup window
    const w = window.open("", "_blank", `popup=yes,width=${width},height=${height}`);
    if (!w) { restore(); return null; }   // popup blocked
    w.document.title = title;
    copyStylesInto(w.document);
    w.document.body.style.margin = "0";
    w.document.body.appendChild(el);
    w.addEventListener("beforeunload", restore, { once: true });
    try { onOpen?.(w); } catch {}
    return { window: w, close: () => w.close() };
  } catch (e) {
    console.warn("[pipWindow] pop-out failed", e);
    restore();
    return null;
  }
}

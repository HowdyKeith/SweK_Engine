// FILE: ui/openUrlListener.js
// v933 — lets the phone push a URL to THIS engine page (e.g. on the Shield TV).
// Polls GET /open-url; when a new command appears it acts by mode:
//   "iframe"   → show a fullscreen in-engine overlay iframe (default; no popup
//                blocker, fully controllable, works for engine pages + framable
//                sites). A ✕ in the corner closes it; the phone can also close it.
//   "tab"      → window.open(url) in a new browser tab (may hit popup blockers
//                since it isn't a user gesture; iframe is preferred).
//   "download" → trigger a file download (e.g. an .apk served from the engine
//                root). On Android (Shield) the downloaded apk can be tapped to
//                install (needs "install unknown apps" allowed for the browser).
//   "close"    → tear down the overlay / close the last opened tab.
// Polls every 2.5s. Acts only when the command's seq increases, so the same
// command isn't re-run.

let lastSeq = 0;
let overlay = null;
let openedTab = null;

function teardownOverlay() {
    if (overlay) { try { overlay.remove(); } catch {} overlay = null; }
}
function closeAll() {
    teardownOverlay();
    if (openedTab) { try { openedTab.close(); } catch {} openedTab = null; }
}

function showOverlay(url) {
    teardownOverlay();
    overlay = document.createElement("div");
    overlay.id = "pushedUrlOverlay";
    overlay.style.cssText =
        "position:fixed; inset:0; z-index:2147483000; background:#06040d;" +
        "display:flex; flex-direction:column;";
    const bar = document.createElement("div");
    bar.style.cssText =
        "flex:0 0 auto; display:flex; align-items:center; gap:10px; padding:6px 10px;" +
        "background:#0a0d12; border-bottom:1px solid #1d2738; font:12px ui-monospace,monospace; color:#9fd0a8;";
    const label = document.createElement("span");
    label.textContent = "📲 " + url;
    label.style.cssText = "flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
    const x = document.createElement("button");
    x.textContent = "✕ close";
    x.style.cssText =
        "flex:0 0 auto; cursor:pointer; background:#173656; color:#dff;" +
        "border:1px solid #2f628f; border-radius:6px; padding:4px 12px; font:12px ui-monospace,monospace;";
    x.addEventListener("click", teardownOverlay);
    bar.appendChild(label); bar.appendChild(x);
    const frame = document.createElement("iframe");
    frame.src = url;
    frame.style.cssText = "flex:1 1 auto; width:100%; border:0; background:#06040d;";
    frame.setAttribute("allow", "autoplay; fullscreen");
    overlay.appendChild(bar); overlay.appendChild(frame);
    document.body.appendChild(overlay);
}

function triggerDownload(url) {
    try {
        const a = document.createElement("a");
        a.href = url;
        a.download = "";                       // hint the browser to download
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { try { a.remove(); } catch {} }, 1000);
    } catch (e) { console.warn("[open-url] download failed:", e); }
}

function act(cmd) {
    if (!cmd) return;
    const { url, mode } = cmd;
    if (mode === "close") { closeAll(); return; }
    if (mode === "tab") { try { openedTab = window.open(url, "_blank"); } catch {} return; }
    if (mode === "download") { triggerDownload(url); return; }
    showOverlay(url);                          // "iframe" (default)
}

async function poll() {
    if (typeof window !== "undefined" && window.__swekPollsPaused) return;   // v1870 — hold while Settings is open
    try {
        const r = await fetch("/open-url", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        const cmd = j && j.cmd;
        if (cmd && cmd.seq > lastSeq) { lastSeq = cmd.seq; act(cmd); }
    } catch { /* bridge busy — retry next tick */ }
}

// Skip whatever command already exists at load so we don't replay a stale one.
(async function init() {
    try {
        const r = await fetch("/open-url", { cache: "no-store" });
        if (r.ok) { const j = await r.json(); if (j && j.cmd) lastSeq = j.cmd.seq || 0; }
    } catch {}
    setInterval(poll, 2500);
})();

export {};

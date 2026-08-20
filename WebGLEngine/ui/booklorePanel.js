// ui/booklorePanel.js — v1135
// Floating "LIBRARY" panel + left-edge minitab that embeds a self-hosted BookLore
// instance (ebooks + comics, incl. a big .cbr collection). Talks to /booklore/*.
// Self-contained: builds its own panel and registers a minitab via createMiniTab.

import { createMiniTab } from "./LCARSMiniTab.js";

export function mountBooklorePanel() {
    if (document.getElementById("booklorePanelRoot")) return;
    const api = (op, body) => fetch("/booklore/" + op, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));

    const panel = document.createElement("div");
    panel.id = "booklorePanelRoot";
    panel.style.cssText = "position:fixed; right:60px; top:200px; width:560px; max-width:94vw; height:620px; max-height:80vh; background:#0a0d12; border:1px solid #233; border-radius:10px; box-shadow:0 10px 40px rgba(0,0,0,.6); display:none; flex-direction:column; z-index:9000; font:12px system-ui,sans-serif; color:#cde; overflow:hidden;";

    const head = document.createElement("div");
    head.style.cssText = "display:flex; align-items:center; gap:8px; padding:9px 12px; border-bottom:1px solid #1d2736; flex:0 0 auto;";
    head.innerHTML = '<span style="font-weight:700;color:#9fd;letter-spacing:.5px;">\uD83D\uDCDA LIBRARY</span><span style="color:#5a6675;font-size:11px;">BookLore</span>';
    const spacer = document.createElement("div"); spacer.style.flex = "1"; head.appendChild(spacer);
    const openBtn = document.createElement("a"); openBtn.textContent = "Open full \u2197"; openBtn.target = "_blank"; openBtn.style.cssText = "font-size:11px;color:#9be;text-decoration:none;border:1px solid #2a3a52;border-radius:6px;padding:3px 8px;"; head.appendChild(openBtn);
    panel.appendChild(head);

    const cfgRow = document.createElement("div");
    cfgRow.style.cssText = "display:flex; gap:6px; align-items:center; padding:8px 12px; border-bottom:1px solid #141c28; flex:0 0 auto;";
    const url = document.createElement("input"); url.type = "text"; url.placeholder = "http://localhost:6060"; url.style.cssText = "flex:1; padding:6px 8px; background:#0c0f14; color:#e8eef8; border:1px solid #2a3340; border-radius:6px; font:11px ui-monospace,monospace;";
    const saveB = document.createElement("button"); saveB.textContent = "Connect"; saveB.style.cssText = "padding:6px 12px; background:#2a4d3a; color:#cfe; border:1px solid #4a7d5a; border-radius:6px; cursor:pointer; font-size:11px;";
    cfgRow.append(url, saveB); panel.appendChild(cfgRow);

    const status = document.createElement("div"); status.style.cssText = "padding:5px 12px; font-size:11px; color:#8b97a8; flex:0 0 auto;"; panel.appendChild(status);

    const frameWrap = document.createElement("div"); frameWrap.style.cssText = "flex:1 1 auto; position:relative; background:#06080c;";
    const frame = document.createElement("iframe"); frame.style.cssText = "position:absolute; inset:0; width:100%; height:100%; border:0; display:none; background:#fff;";
    frame.setAttribute("referrerpolicy", "no-referrer");
    const fallback = document.createElement("div"); fallback.style.cssText = "position:absolute; inset:0; display:none; flex-direction:column; align-items:center; justify-content:center; gap:10px; color:#8b97a8; font-size:12px; text-align:center; padding:20px;";
    frameWrap.append(frame, fallback); panel.appendChild(frameWrap);

    document.body.appendChild(panel);

    function showFallback(msg, link) {
        frame.style.display = "none"; fallback.style.display = "flex"; fallback.innerHTML = "";
        const p = document.createElement("div"); p.textContent = msg; fallback.appendChild(p);
        if (link) { const a = document.createElement("a"); a.href = link; a.target = "_blank"; a.textContent = "Open BookLore in a new tab \u2197"; a.style.cssText = "color:#9be; text-decoration:none; border:1px solid #2a3a52; border-radius:8px; padding:8px 14px;"; fallback.appendChild(a); }
    }

    async function refresh() {
        status.textContent = "checking\u2026"; status.style.color = "#8b97a8";
        const s = await api("status");
        const u = s.url || url.value.trim();
        openBtn.href = u || "#";
        if (!s.reachable) { status.textContent = "\u2717 can't reach " + (u || "(no URL set)") + (s.error ? " \u2014 " + s.error : "") + ". Is BookLore running?"; status.style.color = "#f88"; showFallback("BookLore isn't reachable at " + (u || "the configured URL") + ".", u); return; }
        if (s.embeddable === false) { status.textContent = "\u2713 reachable, but BookLore blocks embedding (X-Frame-Options). Use the button \u2192"; status.style.color = "#ffcf6b"; showFallback("BookLore is running but its headers block embedding inside the engine.", u); return; }
        status.textContent = "\u2713 connected \u2014 " + u; status.style.color = "#9fe88f";
        fallback.style.display = "none"; frame.style.display = "block"; frame.src = u;
    }

    saveB.addEventListener("click", async () => { const j = await api("config", { url: url.value.trim() }); if (j.ok) { url.value = j.url || url.value; refresh(); } });
    url.addEventListener("keydown", (e) => { if (e.key === "Enter") saveB.click(); });

    (async () => { const c = await api("config"); url.value = c.url || ""; url.placeholder = c.defaultUrl || "http://localhost:6060"; if (c.url) refresh(); else { status.textContent = "Set your BookLore URL (e.g. http://localhost:6060) and Connect."; showFallback("Point this at your running BookLore instance to read your library here.", ""); } })();

    // v1574 — the standalone LIBRARY minitab is removed; BookLore now opens from the Applications panel.
    try { window._booklore = { toggle: () => { panel.style.display = (panel.style.display === "none" || !panel.style.display) ? "flex" : "none"; if (panel.style.display === "flex") refresh(); } }; } catch {}
}

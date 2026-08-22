// ui/agentCookiePanel.js — v1136
// "COOKIE SYNC" panel + left-edge minitab for AgentCookie (macOS-only). On the Mac
// build it launches/stops `agentcookie agent-sync`; elsewhere it explains it's Mac-only.

import { createMiniTab } from "./LCARSMiniTab.js";

export function mountAgentCookiePanel(mountOpts = {}) {
    if (document.getElementById("acPanelRoot")) return;
    const api = (op, body) => fetch("/agentcookie/" + op, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body || {}) : undefined }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));

    const panel = document.createElement("div");
    panel.id = "acPanelRoot";
    panel.style.cssText = "position:fixed; right:60px; top:260px; width:420px; max-width:94vw; background:#0a0d12; border:1px solid #233; border-radius:10px; box-shadow:0 10px 40px rgba(0,0,0,.6); display:none; flex-direction:column; z-index:9000; font:12px system-ui,sans-serif; color:#cde; overflow:hidden;";
    panel.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid #1d2736;"><span style="font-weight:700;color:#9fd;letter-spacing:.5px;">\uD83C\uDF6A COOKIE SYNC</span><span style="color:#5a6675;font-size:11px;">AgentCookie</span></div>';

    const body = document.createElement("div"); body.style.cssText = "padding:11px 13px; display:flex; flex-direction:column; gap:9px;";
    const hint = document.createElement("div"); hint.style.cssText = "color:#7a8290;font-size:11px;line-height:1.5;";
    hint.innerHTML = "Keeps a second Mac\u2019s Chrome cookies + per-CLI secrets in sync with your daily-driver Mac over Tailscale, so an agent on the second machine wakes up logged in. <b>macOS only</b>.";
    const stat = document.createElement("div"); stat.style.cssText = "font:11px ui-monospace,monospace; color:#9bd6ff;";
    const opts = document.createElement("div"); opts.style.cssText = "display:flex; flex-direction:column; gap:6px;";
    const mkChk = (lbl) => { const w = document.createElement("label"); w.style.cssText = "display:flex;gap:7px;align-items:center;font-size:12px;color:#cde;"; const c = document.createElement("input"); c.type = "checkbox"; w.append(c, document.createTextNode(lbl)); return { w, c }; };
    const headed = mkChk("Show the owned browser window (--headed)");
    const domRow = document.createElement("div"); domRow.style.cssText = "display:flex;gap:6px;align-items:center;";
    const dom = document.createElement("input"); dom.placeholder = "domain filter, e.g. %github.com (optional)"; dom.style.cssText = "flex:1;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
    domRow.appendChild(dom);
    opts.append(headed.w, domRow);
    const btnRow = document.createElement("div"); btnRow.style.cssText = "display:flex; gap:6px; align-items:center;";
    const startB = document.createElement("button"); startB.textContent = "Start sync"; startB.style.cssText = "padding:6px 12px;background:#2a4d3a;color:#cfe;border:1px solid #4a7d5a;border-radius:6px;cursor:pointer;font-size:11px;";
    const stopB = document.createElement("button"); stopB.textContent = "Stop"; stopB.style.cssText = "padding:6px 12px;background:#5a3a3a;color:#fbb;border:1px solid #8a5a5a;border-radius:6px;cursor:pointer;font-size:11px;";
    const msg = document.createElement("span"); msg.style.cssText = "font-size:11px;color:#8b97a8;";
    btnRow.append(startB, stopB, msg);
    body.append(hint, stat, opts, btnRow); panel.appendChild(body);
    document.body.appendChild(panel);

    async function refresh() {
        const s = await api("status");
        if (!s.supported) { stat.textContent = "\u2014 not supported on " + (s.platform || "this OS") + " (macOS only)"; stat.style.color = "#ffcf6b"; startB.disabled = stopB.disabled = true; startB.style.opacity = stopB.style.opacity = ".5"; return; }
        startB.disabled = stopB.disabled = false; startB.style.opacity = stopB.style.opacity = "1";
        stat.textContent = (s.running ? "\uD83D\uDFE2 syncing (pid " + s.pid + ")" : "\u26AA stopped") + (s.installed ? "" : " \u2014 agentcookie not found on PATH");
        stat.style.color = s.running ? "#9fe88f" : "#9bb";
    }
    startB.addEventListener("click", async () => { msg.textContent = "starting\u2026"; const j = await api("start", { headed: headed.c.checked, domain: dom.value.trim() }); msg.textContent = j.ok ? (j.already ? "already running" : "\u2713 started") : "\u2717 " + (j.error || "failed"); msg.style.color = j.ok ? "#9fe88f" : "#f88"; refresh(); });
    stopB.addEventListener("click", async () => { const j = await api("stop"); msg.textContent = j.stopped ? "\u2713 stopped" : "not running"; refresh(); });

    const toggle = () => { panel.style.display = (panel.style.display === "none" || !panel.style.display) ? "flex" : "none"; if (panel.style.display === "flex") refresh(); };
    const open = () => { panel.style.display = "flex"; refresh(); };
    // v1514 — the standalone "COOKIE SYNC" minitab is suppressed when this panel
    // lives in the Applications launcher (opts.tab === false); open() drives it
    // from the Applications menu item instead.
    if (mountOpts.tab !== false) createMiniTab({ edge: "left", label: "COOKIE SYNC", color: "burgundy", onClick: toggle });
    return { open, toggle, panel };
}

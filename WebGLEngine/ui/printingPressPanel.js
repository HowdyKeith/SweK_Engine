// ui/printingPressPanel.js — v1136
// Floating "CLI PRESS" panel + left-edge minitab. Browses the Printing Press Library
// (agent-native CLIs by mvanhorn) and runs an installed pp-CLI. Talks to /printingpress/*.

import { createMiniTab } from "./LCARSMiniTab.js";

export function mountPrintingPressPanel(opts = {}) {
    if (document.getElementById("ppPanelRoot")) return;
    const api = (op, body) => fetch("/printingpress/" + op, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));

    const panel = document.createElement("div");
    panel.id = "ppPanelRoot";
    panel.style.cssText = "position:fixed; right:60px; top:230px; width:520px; max-width:94vw; height:600px; max-height:80vh; background:#0a0d12; border:1px solid #233; border-radius:10px; box-shadow:0 10px 40px rgba(0,0,0,.6); display:none; flex-direction:column; z-index:9000; font:12px system-ui,sans-serif; color:#cde; overflow:hidden;";

    const head = document.createElement("div");
    head.style.cssText = "display:flex; align-items:center; gap:8px; padding:9px 12px; border-bottom:1px solid #1d2736; flex:0 0 auto;";
    head.innerHTML = '<span style="font-weight:700;color:#9fd;letter-spacing:.5px;">\uD83D\uDDA8\uFE0F CLI PRESS</span><span id="ppCount" style="color:#5a6675;font-size:11px;"></span>';
    panel.appendChild(head);

    const tools = document.createElement("div");
    tools.style.cssText = "display:flex; gap:6px; padding:8px 12px; border-bottom:1px solid #141c28; flex:0 0 auto;";
    const search = document.createElement("input"); search.placeholder = "search 239 agent CLIs\u2026"; search.style.cssText = "flex:1; padding:6px 8px; background:#0c0f14; color:#e8eef8; border:1px solid #2a3340; border-radius:6px; font:11px ui-monospace,monospace;";
    const cat = document.createElement("select"); cat.style.cssText = "padding:6px 8px; background:#0c0f14; color:#cde; border:1px solid #2a3340; border-radius:6px; font:11px ui-monospace,monospace;";
    tools.append(search, cat); panel.appendChild(tools);

    const list = document.createElement("div"); list.style.cssText = "flex:1 1 auto; overflow:auto; padding:6px 10px; display:flex; flex-direction:column; gap:5px;"; panel.appendChild(list);

    const runBar = document.createElement("div"); runBar.style.cssText = "display:flex; gap:6px; padding:8px 12px; border-top:1px solid #141c28; flex:0 0 auto; align-items:center;";
    const runLbl = document.createElement("span"); runLbl.style.cssText = "font-size:11px; color:#9be; min-width:60px;"; runLbl.textContent = "no CLI";
    const runArgs = document.createElement("input"); runArgs.placeholder = "args (e.g. --help)"; runArgs.value = "--help"; runArgs.style.cssText = "flex:1; padding:6px 8px; background:#0c0f14; color:#e8eef8; border:1px solid #2a3340; border-radius:6px; font:11px ui-monospace,monospace;";
    const runBtn = document.createElement("button"); runBtn.textContent = "Run"; runBtn.disabled = true; runBtn.style.cssText = "padding:6px 12px; background:#2a4d3a; color:#cfe; border:1px solid #4a7d5a; border-radius:6px; cursor:pointer; font-size:11px;";
    runBar.append(runLbl, runArgs, runBtn); panel.appendChild(runBar);

    const out = document.createElement("pre"); out.style.cssText = "margin:0; padding:8px 12px; max-height:150px; overflow:auto; background:#06080c; border-top:1px solid #141c28; font:10.5px ui-monospace,monospace; color:#bcd; white-space:pre-wrap; display:none; flex:0 0 auto;"; panel.appendChild(out);

    document.body.appendChild(panel);

    let ENTRIES = [], selected = null;
    const sel = (e) => { selected = e; runLbl.textContent = e.api ? (e.api.toLowerCase().replace(/\s+/g, "-") + "-pp-cli") : e.name; runLbl.title = runLbl.textContent; runBtn.disabled = false; };

    function draw() {
        const q = search.value.trim().toLowerCase(); const c = cat.value;
        list.innerHTML = "";
        const items = ENTRIES.filter(e => (!c || e.category === c) && (!q || e.search.includes(q))).slice(0, 200);
        if (!items.length) { list.innerHTML = '<div style="color:#667; font-size:11px; padding:8px;">no matches</div>'; return; }
        for (const e of items) {
            const row = document.createElement("div"); row.style.cssText = "border:1px solid #1c2531; border-radius:7px; padding:7px 9px; cursor:pointer; background:#0c0f14;";
            row.onmouseenter = () => row.style.borderColor = "#2f4a6a"; row.onmouseleave = () => row.style.borderColor = "#1c2531";
            const t = document.createElement("div"); t.style.cssText = "display:flex; gap:6px; align-items:center;";
            t.innerHTML = '<b style="color:#bfe3ff;">' + (e.name || e.api) + '</b>' + (e.mcp ? '<span style="font-size:9px;color:#7fd1a0;border:1px solid #2a5a40;border-radius:4px;padding:0 4px;">MCP</span>' : '') + '<span style="font-size:9.5px;color:#5a6675;margin-left:auto;">' + e.category + '</span>';
            const d = document.createElement("div"); d.style.cssText = "color:#8b97a8; font-size:10.5px; margin-top:3px;"; d.textContent = e.description || "";
            row.append(t, d); row.onclick = () => { sel(e); [...list.children].forEach(x => x.style.background = "#0c0f14"); row.style.background = "#14202e"; };
            list.appendChild(row);
        }
    }

    runBtn.addEventListener("click", async () => {
        if (!selected) return;
        out.style.display = "block"; out.textContent = "running\u2026"; runBtn.disabled = true;
        const apiName = (selected.api || selected.name || "").toLowerCase().replace(/\s+/g, "-");
        const j = await api("run", { api: apiName, args: runArgs.value.trim() });
        runBtn.disabled = false;
        out.textContent = j.ok ? (j.stdout || "(no output)") : ("\u2717 " + (j.error || "") + (j.stderr ? "\n" + j.stderr : ""));
        out.style.color = j.ok ? "#bcd" : "#f88";
    });
    search.addEventListener("input", draw);
    cat.addEventListener("change", draw);

    async function load() {
        const c = await api("catalog");
        if (!c.ok) { list.innerHTML = '<div style="color:#f88;font-size:11px;padding:8px;">couldn\u2019t load catalog: ' + (c.error || "") + '</div>'; return; }
        ENTRIES = c.entries || [];
        document.getElementById("ppCount").textContent = c.count + " CLIs";
        cat.innerHTML = '<option value="">all categories</option>' + (c.categories || []).map(x => '<option value="' + x + '">' + x + '</option>').join("");
        draw();
    }

    const toggle = () => { panel.style.display = (panel.style.display === "none" || !panel.style.display) ? "flex" : "none"; if (panel.style.display === "flex" && !ENTRIES.length) load(); };
    const open = () => { panel.style.display = "flex"; if (!ENTRIES.length) load(); };
    // v1514 — standalone "CLI PRESS" minitab suppressed when in the Applications launcher.
    if (opts.tab !== false) createMiniTab({ edge: "left", label: "CLI PRESS", color: "voyager", onClick: toggle });
    return { open, toggle, panel };
}

// ui/localMlxPanel.js -- THE LOCAL MLX / OPENAI-COMPATIBLE SERVER CONFIG, PULLED OUT SO A SECOND PAGE CAN HOST IT.
//
// v4036 -- Keith, on being told this is the "Mac qwen run option": "and that option page would want to be in the
// Mac System panel on Server.html too." It was not a page at all -- it was a `type:"custom"` control's render()
// closure sitting inline inside main.js's `_schema.push({id:"mlx", ...})` (the engine's own Settings drawer), and
// nothing outside main.js could reach it.
//
// *** SAME MOVE AS v3908's GITHUB PANEL, NOT A NEW ONE. *** ui/githubPanel.js's own header made the case once
// already: "this page was hosting a floating panel main.js also builds, and main.js mounts THE SAME MODULE into
// its own dock" -- a second copy written for server.html would be the second copy that stops getting the fixes
// the first one gets. This file is that move applied to the MLX config: main.js's schema entry now calls
// mountLocalMlxPanel(host) instead of building the controls inline, and server.html's Mac System panel calls the
// exact same function into a fresh host of its own. One function, two hosts, no drift.
//
// WHY THIS BELONGS IN MAC SYSTEM SPECIFICALLY, using that panel's own membership rule ("what a page CALLS, not
// what it mentions"): the servers this panel talks about running (Rapid-MLX, Osaurus, vMLX, mlx-omni-server) are
// unified-memory Apple-Silicon software, and /mlx/install is explicitly macOS-only in its own on-screen text
// below ("Install buttons are macOS-only (run this on the Apple-Silicon Mac)") -- it is exactly the Mac-side-route
// test that panel already applies to everything else in it.
//
// mountLocalMlxPanel(host) RENDERS DIRECTLY INTO THE HOST PASSED IN, the same shape the settings schema's
// `render(host)` contract already expected -- no floating root, no idempotency guard, because settingsHub.js's
// _row() hands `render()` a FRESH box every time a category is opened (confirmed by reading it: _showCategory
// creates a new container per control, per open), and server.html's overlay call below does the same on each
// click. Re-mounting fresh is also correct behaviour here, not just harmless: the panel's last lines fetch the
// SAVED config from /ai/mlx-config on every mount, so a fresh host means the fields always reflect what is
// actually saved rather than whatever was last typed in a stale copy.
"use strict";

export function mountLocalMlxPanel(host) {
    host.style.cssText = "display:flex; flex-direction:column; gap:8px;";
    const hint = document.createElement("div"); hint.style.cssText = "color:#7a8290;font-size:11px;line-height:1.5;";
    hint.innerHTML = "Point the engine’s <b>brain</b> at a local OpenAI-compatible server — ideal on an Apple-Silicon Mac running <b>Rapid-MLX</b>, <b>Osaurus</b>, <b>vMLX</b>, or <b>mlx-omni-server</b> (unified memory runs big models fast). Set the base URL, then pick “Local MLX server” in the voice/brain selector.";
    host.appendChild(hint);
    const mk = (ph, type) => { const i = document.createElement("input"); i.type = type || "text"; i.placeholder = ph; i.autocomplete = "off"; i.style.cssText = "padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;width:100%;box-sizing:border-box;"; return i; };
    const url = mk("http://127.0.0.1:8080  (or :1234, :11432…)"); const model = mk("model name (e.g. qwen3.5-4b-4bit, or 'default')"); const key = mk("API key (optional — most local servers need none)", "password");
    host.append(url, model, key);
    const row = document.createElement("div"); row.style.cssText = "display:flex; gap:6px; align-items:center;";
    const saveB = document.createElement("button"); saveB.textContent = "Save"; saveB.style.cssText = "padding:6px 12px;background:#2a4d3a;color:#cfe;border:1px solid #4a7d5a;border-radius:6px;cursor:pointer;font-size:11px;";
    const testB = document.createElement("button"); testB.textContent = "Test"; testB.style.cssText = "padding:6px 12px;background:#3a4a6a;color:#cfe;border:1px solid #5a6a8a;border-radius:6px;cursor:pointer;font-size:11px;";
    const msg = document.createElement("span"); msg.style.cssText = "font-size:11px;color:#8b97a8;";
    row.append(saveB, testB, msg); host.appendChild(row);
    // v1139 — detect + install buttons (like the PC side)
    const det = document.createElement("div"); det.style.cssText = "border-top:1px solid #141c28; margin-top:6px; padding-top:8px; display:flex; flex-direction:column; gap:7px;";
    const detRow = document.createElement("div"); detRow.style.cssText = "display:flex; gap:6px; align-items:center;";
    const detB = document.createElement("button"); detB.textContent = "Detect servers + tools"; detB.style.cssText = "padding:6px 12px;background:#3a4a6a;color:#cfe;border:1px solid #5a6a8a;border-radius:6px;cursor:pointer;font-size:11px;";
    const detMsg = document.createElement("span"); detMsg.style.cssText = "font-size:11px;color:#8b97a8;"; detRow.append(detB, detMsg); det.appendChild(detRow);
    const found = document.createElement("div"); found.style.cssText = "display:flex; flex-direction:column; gap:4px;"; det.appendChild(found);
    const tools = document.createElement("div"); tools.style.cssText = "display:flex; flex-direction:column; gap:6px;"; det.appendChild(tools);
    const log = document.createElement("pre"); log.style.cssText = "margin:0;max-height:120px;overflow:auto;background:#06080c;border:1px solid #1a222e;border-radius:6px;padding:7px;font:10px ui-monospace,monospace;color:#bcd;white-space:pre-wrap;display:none;"; det.appendChild(log);
    host.appendChild(det);

    async function renderTools(cat, installed) {
        tools.innerHTML = "";
        if (!cat.supported) { tools.innerHTML = '<div style="font-size:11px;color:#ffcf6b;">Install buttons are macOS-only (run this on the Apple-Silicon Mac). Detect still works here.</div>'; }
        for (const it of (cat.items || [])) {
            const r = document.createElement("div"); r.style.cssText = "display:flex; gap:8px; align-items:center; border:1px solid #1c2531; border-radius:6px; padding:6px 8px;";
            const ok = installed && installed[it.id];
            const t = document.createElement("div"); t.style.cssText = "flex:1; min-width:0;";
            t.innerHTML = '<b style="color:#cfe;">' + it.label + '</b> <span style="color:' + (ok ? "#7fd1a0" : "#6a7585") + ';font-size:10px;">' + (ok ? "✓ installed" : "not detected") + '</span><div style="color:#7a8290;font-size:10px;margin-top:2px;">' + (it.note || "") + '</div>';
            const b = document.createElement("button"); b.textContent = ok ? "Reinstall" : "Install"; b.disabled = !cat.supported; b.style.cssText = "padding:5px 10px;background:" + (cat.supported ? "#2a4d3a" : "#222a33") + ";color:#cfe;border:1px solid #4a7d5a;border-radius:6px;cursor:" + (cat.supported ? "pointer" : "not-allowed") + ";font-size:11px;opacity:" + (cat.supported ? "1" : ".5") + ";";
            b.addEventListener("click", async () => { log.style.display = "block"; log.textContent = "installing " + it.id + "… (this can take a while)"; b.disabled = true; const j = await fetch("/mlx/install", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id }) }).then(r => r.json()).catch(e => ({ ok: false, error: e.message })); b.disabled = false; log.textContent = (j.ok ? "✓ installed " + it.id + "\n\nstart it with:\n  " + (j.run || "") + "\n\n" : "✗ " + (j.error || "failed") + "\n\n") + (j.out || ""); detB.click(); });
            r.append(t, b); tools.appendChild(r);
        }
    }
    detB.addEventListener("click", async () => {
        detMsg.textContent = "probing…"; detMsg.style.color = "#8b97a8";
        const cat = await fetch("/mlx/catalog").then(r => r.json()).catch(() => ({ items: [] }));
        const d = await fetch("/mlx/detect?base=" + encodeURIComponent(url.value.trim())).then(r => r.json()).catch(() => null);
        found.innerHTML = "";
        if (d && d.servers && d.servers.length) {
            detMsg.textContent = "✓ " + d.servers.length + " server(s) found"; detMsg.style.color = "#9fe88f";
            for (const sv of d.servers) { const row2 = document.createElement("div"); row2.style.cssText = "display:flex;gap:8px;align-items:center;font-size:11px;"; const use = document.createElement("button"); use.textContent = "Use"; use.style.cssText = "padding:3px 9px;background:#2a4d3a;color:#cfe;border:1px solid #4a7d5a;border-radius:5px;cursor:pointer;font-size:10px;"; use.addEventListener("click", () => { url.value = sv.base; if (sv.models && sv.models[0]) model.value = sv.models[0]; saveB.click(); }); row2.innerHTML = '<span style="color:#9bd6ff;font-family:ui-monospace,monospace;">' + sv.base + '</span>' + (sv.models && sv.models.length ? '<span style="color:#7a8290;">' + sv.models.slice(0, 3).join(", ") + '</span>' : ''); row2.appendChild(use); found.appendChild(row2); }
        } else { detMsg.textContent = "no running server found (install one below, then start it)"; detMsg.style.color = "#ffcf6b"; }
        renderTools(cat, d && d.installed);
    });
    const get = () => ({ baseUrl: url.value.trim(), model: model.value.trim(), key: key.value });
    saveB.addEventListener("click", async () => { const j = await fetch("/ai/mlx-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(get()) }).then(r => r.json()).catch(() => null); msg.textContent = j && j.ok ? "✓ saved" : "failed"; msg.style.color = "#9fe88f"; key.value = ""; if (j && j.hasKey) key.placeholder = "key saved — type to replace"; });
    testB.addEventListener("click", async () => { msg.textContent = "testing…"; msg.style.color = "#8b97a8"; await fetch("/ai/mlx-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(get()) }); const j = await fetch("/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "mlx", prompt: "Reply with the single word: ready" }) }).then(r => r.json()).catch(e => ({ ok: false, error: e.message })); msg.textContent = j && j.ok ? ("✓ " + (j.text || "responded").slice(0, 40)) : "✗ " + (j.error || "no response"); msg.style.color = j && j.ok ? "#9fe88f" : "#f88"; });
    (async () => { const c = await fetch("/ai/mlx-config").then(r => r.json()).catch(() => null); if (c && c.ok) { url.value = c.baseUrl || ""; model.value = c.model || ""; if (c.hasKey) key.placeholder = "key saved — type to replace"; } })();
}

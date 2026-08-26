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
// v4037 -- weights download (/mlx/pull), on-demand start, and idle auto-exit added -- see the inline comments
// at the bottom of mountLocalMlxPanel() and ai-bridge/mlxInstallBridge.js's own header for the mechanism.
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
            r.append(t, b);
            // v4038 -- Keith: "if we install it, can we also have an uninstall button?" Only shown once Detect has
            // actually found it installed (an Uninstall button on something not present would just error), and
            // only when the catalog says the entry HAS a single command to reverse (it.uninstallable) -- an
            // entry built from source (TurboFieldfare) gets its removal step in the tooltip instead of a button
            // that would spawn a package manager the install never went through either.
            if (ok) {
                const u = document.createElement("button");
                u.textContent = "Uninstall";
                u.disabled = !cat.supported || !it.uninstallable;
                u.title = it.uninstallable ? "" : (it.uninstallNote || "no single uninstall command for this entry");
                u.style.cssText = "padding:5px 10px;background:" + (u.disabled ? "#2a1414" : "#3a1c1c") + ";color:#f99;border:1px solid #6a3a3a;border-radius:6px;cursor:" + (u.disabled ? "not-allowed" : "pointer") + ";font-size:11px;opacity:" + (u.disabled ? ".5" : "1") + ";";
                u.addEventListener("click", async () => { log.style.display = "block"; log.textContent = "uninstalling " + it.id + "…"; u.disabled = true; const j = await fetch("/mlx/uninstall", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id }) }).then(r => r.json()).catch(e => ({ ok: false, error: e.message })); u.disabled = false; log.textContent = (j.ok ? "✓ uninstalled " + it.id : "✗ " + (j.error || "failed")) + "\n\n" + (j.out || ""); detB.click(); });
                r.appendChild(u);
            }
            tools.appendChild(r);
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

    // v4037 -- Keith: "can we fill in the qwen weights download for the mac too? so it will auto install as
    // much as possible, and then be able to run." /mlx/pull installs mlx-lm (reusing the Install button's own
    // pip step above) if it is not already on PATH, then triggers mlx-lm's own HuggingFace fetch for whatever
    // is in the model field. ONLY mlx-lm can be driven this way -- Rapid-MLX, Osaurus and vMLX are apps with
    // their own model managers this bridge has no documented, scriptable way to reach.
    const pull = document.createElement("div"); pull.style.cssText = "border-top:1px solid #141c28; margin-top:6px; padding-top:8px; display:flex; flex-direction:column; gap:7px;";
    const pullNote = document.createElement("div"); pullNote.style.cssText = "font-size:11px;color:#7a8290;line-height:1.5;";
    pullNote.innerHTML = "Fetches the weights for whatever HuggingFace repo id is in the <b>model</b> field above (e.g. <code>mlx-community/Qwen2.5-7B-Instruct-4bit</code>) — blank defaults to a small Qwen2.5 build. Pre-fetching here means the on-demand start below doesn't have to eat a cold multi-gigabyte download inside one chat request's patience window.";
    const pullRow = document.createElement("div"); pullRow.style.cssText = "display:flex; gap:6px; align-items:center;";
    const pullB = document.createElement("button"); pullB.textContent = "Download / preload model weights"; pullB.style.cssText = "padding:6px 12px;background:#2a4d3a;color:#cfe;border:1px solid #4a7d5a;border-radius:6px;cursor:pointer;font-size:11px;";
    const pullMsg = document.createElement("span"); pullMsg.style.cssText = "font-size:11px;color:#8b97a8;";
    pullRow.append(pullB, pullMsg);
    const pullLog = document.createElement("pre"); pullLog.style.cssText = "margin:0;max-height:160px;overflow:auto;background:#06080c;border:1px solid #1a222e;border-radius:6px;padding:7px;font:10px ui-monospace,monospace;color:#bcd;white-space:pre-wrap;display:none;";
    pull.append(pullNote, pullRow, pullLog);
    host.appendChild(pull);
    pullB.addEventListener("click", async () => {
        pullLog.style.display = "block";
        pullLog.textContent = "downloading… (a multi-gigabyte model over a slow connection can take a while — this can run up to 30 minutes before giving up)";
        pullB.disabled = true; pullMsg.textContent = "";
        const j = await fetch("/mlx/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: model.value.trim() }) }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
        pullB.disabled = false;
        pullMsg.textContent = j.ok ? "✓ ready" : "✗ " + (j.error || "failed");
        pullMsg.style.color = j.ok ? "#9fe88f" : "#f88";
        pullLog.textContent = (j.installLog && j.installLog.out ? "[installing mlx-lm]\n" + j.installLog.out + "\n\n" : "") + (j.out || "");
    });

    // v4037 -- Keith: "would we be able to have the SweK engine report [this] is available, and then run on
    // demand? and then exit when idle?" The on-demand start itself is wired into every chat call through this
    // provider (ai-bridge/aiProviders.js's mlxChat -> mlxInstallBridge.ensureRunning), not a button here — this
    // block only REPORTS what that machinery is doing, since nothing else on this page could otherwise see it,
    // and offers Stop rather than making a person wait out the idle timer.
    const stat = document.createElement("div"); stat.style.cssText = "border-top:1px solid #141c28; margin-top:6px; padding-top:8px; display:flex; flex-direction:column; gap:6px;";
    const statLine = document.createElement("div"); statLine.style.cssText = "font-size:11px;color:#8b97a8;line-height:1.5;";
    const stopB = document.createElement("button"); stopB.textContent = "Stop now"; stopB.style.cssText = "padding:5px 10px;background:#3a1c1c;color:#f99;border:1px solid #6a3a3a;border-radius:6px;cursor:pointer;font-size:11px;align-self:flex-start;display:none;";
    stat.append(statLine, stopB); host.appendChild(stat);
    async function refreshStatus() {
        const s = await fetch("/mlx/status").then(r => r.json()).catch(() => null);
        if (!s || !s.ok) { statLine.textContent = "on-demand status unavailable (not running on the Mac itself?)"; stopB.style.display = "none"; return; }
        const limitMin = Math.round((s.idleLimitMs || 0) / 60000);
        if (!s.managed) { statLine.textContent = "nothing started by this panel right now — a server starts automatically on the first chat request through this provider, and stops after " + limitMin + " minute(s) idle."; stopB.style.display = "none"; return; }
        statLine.textContent = "running " + s.model + " on port " + s.port + " (pid " + s.pid + ") — idle " + (s.idleMs / 60000).toFixed(1) + " of " + limitMin + " min before auto-stop.";
        stopB.style.display = "";
    }
    stopB.addEventListener("click", async () => { stopB.disabled = true; await fetch("/mlx/stop", { method: "POST" }).catch(() => null); stopB.disabled = false; refreshStatus(); });
    refreshStatus();
}

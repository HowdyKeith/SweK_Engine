// FILE: ui/engineUpdate.js
// VERSION: v1498 — engine self-update: client prompt + apply + restart-and-reconnect.
//
// The bridge already detects a newer EngineProject_vNNN.zip in Downloads (sysadminBridge) and
// can APPLY it: extract beside the current engine + launch the new START_BUN_Full.bat, which
// kills the old server and rebinds :8787. What was missing is the client side. This adds:
//   - a first-look prompt ("vNNN is ready — install & restart?")
//   - a Settings panel (current/available, Check, Install & restart, auto-update toggle)
//   - after apply: poll /package/info until the NEW version answers, then reload the page.
//
// window.swekEngineUpdate = { status, check, apply, setAutoApply, renderPanel, maybePromptUpdate }

const G = (typeof window !== "undefined") ? window : globalThis;
const j = async (u, opt) => { try { return await fetch(u, opt).then(r => r.json()); } catch { return null; } };

async function status() { return j("/sys/update/status"); }
async function check()  { return j("/sys/update/check"); }
async function apply()  { return j("/sys/update/apply", { method: "POST" }); }
async function setAutoApply(on) { return j("/sys/update/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ update: { enabled: !!on, autoApply: !!on } }) }); }

function _btn(label, primary) { const b = document.createElement("button"); b.textContent = label; b.style.cssText = "padding:6px 12px;border-radius:6px;cursor:pointer;font:12px ui-monospace,monospace;" + (primary ? "background:#0bf;color:#012;border:1px solid #2bd6ff;" : "background:#0c1622;color:#cde;border:1px solid #2a3340;"); return b; }

// After apply launches the new server, the old one exits and :8787 is rebound by the new build.
// Poll /package/info until it reports a version >= target, then reload onto the new engine.
function _waitForNewVersionThenReload(targetV, onProgress) {
    const cur = (G.engineVersion && G.engineVersion()) || (G.ENGINE_VERSION || "");
    let tries = 0; const maxTries = 40;   // ~80s
    const tick = async () => {
        tries++;
        let info = null; try { info = await fetch("/package/info", { cache: "no-store" }).then(r => r.json()); } catch {}
        const v = info && info.version ? String(info.version) : "";
        const vn = parseInt((v.match(/v?(\d+)/) || [])[1] || "0", 10);
        if (vn && vn >= targetV && v !== cur) { onProgress && onProgress("\u2713 v" + vn + " is up \u2014 reloading\u2026", true); setTimeout(() => location.reload(), 800); return; }
        if (tries >= maxTries) { onProgress && onProgress("Taking longer than expected \u2014 reload manually when the new window is up.", false); return; }
        onProgress && onProgress("Restarting\u2026 waiting for v" + targetV + " (" + tries + ")", null);
        setTimeout(tick, 2000);
    };
    setTimeout(tick, 3500);   // give the new launcher a moment to kill the old server + bind
}

function _runApply(onProgress, onDone) {
    onProgress && onProgress("Installing \u2014 approve any UAC prompt\u2026", null);
    apply().then(r => {
        if (r && r.launched) { onProgress && onProgress("New version launched. Restarting the engine\u2026", null); _waitForNewVersionThenReload(r.version, onProgress); onDone && onDone(true, r); }
        else { onProgress && onProgress("\u2717 " + ((r && r.error) || "apply failed") + (r && r.note ? " \u2014 " + r.note : ""), false); onDone && onDone(false, r); }
    }).catch(e => { onProgress && onProgress("\u2717 " + e.message, false); onDone && onDone(false, null); });
}

async function renderPanel(host) {
    host.innerHTML = ""; host.style.cssText = "display:flex;flex-direction:column;gap:8px;";
    const line = document.createElement("div"); line.style.cssText = "font-size:12px;color:#cde;"; line.textContent = "Checking\u2026";
    const sub = document.createElement("div"); sub.style.cssText = "font-size:11px;color:#8b97a8;";
    const row = document.createElement("div"); row.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;align-items:center;";
    const checkBtn = _btn("Check now", false), installBtn = _btn("Install & restart", true);
    const autoRow = document.createElement("label"); autoRow.style.cssText = "display:flex;align-items:center;gap:6px;font-size:11px;color:#cde;cursor:pointer;";
    const autoCb = document.createElement("input"); autoCb.type = "checkbox"; autoRow.append(autoCb, document.createTextNode("Auto-install new versions on startup (no prompt)"));
    const note = document.createElement("div"); note.style.cssText = "font-size:11px;color:#8b97a8;line-height:1.5;";
    // v1499 — fleet options
    const fc = fleetCfg();
    const mkChk = (label, checked) => { const l = document.createElement("label"); l.style.cssText = "display:flex;align-items:center;gap:6px;font-size:11px;color:#cde;cursor:pointer;"; const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = checked; l.append(cb, document.createTextNode(label)); l.cb = cb; return l; };
    const propRow = mkChk("Roll updates out to connected SweK machines (pull a newer peer's build)", fc.propagate);
    const idleRow = mkChk("Only install when idle (defer while rendering / running a demo)", fc.onlyWhenIdle);
    const secRow = document.createElement("label"); secRow.style.cssText = "display:flex;align-items:center;gap:6px;font-size:11px;color:#cde;";
    const secIn = document.createElement("input"); secIn.type = "number"; secIn.min = "0"; secIn.max = "300"; secIn.value = String(fc.autoConfirmSec); secIn.style.cssText = "width:64px;padding:4px 6px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
    secRow.append(document.createTextNode("Auto-confirm the update toast after"), secIn, document.createTextNode("seconds (0 = wait for a click)"));
    const fleetTitle = document.createElement("div"); fleetTitle.style.cssText = "font-size:11px;font-weight:600;color:#9bb0c8;margin-top:4px;"; fleetTitle.textContent = "Fleet / auto-update behaviour";
    // v1502 — GitHub source: pull the newest published release zip into Downloads
    const ghTitle = document.createElement("div"); ghTitle.style.cssText = "font-size:11px;font-weight:600;color:#9bb0c8;margin-top:4px;"; ghTitle.textContent = "Source / GitHub releases";
    const ghLine = document.createElement("div"); ghLine.style.cssText = "font-size:11px;color:#8b97a8;"; ghLine.textContent = "\u2026";
    const ghRow = document.createElement("div"); ghRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;align-items:center;";
    const ghBtn = _btn("Check GitHub & download", false); ghRow.append(ghBtn);
    const ghAuto = mkChk("Auto-fetch newer builds from GitHub on a schedule", false);
    // v1631 — housekeeping: delete superseded EngineProject_vNNN folders whose zip is still in Downloads.
    const hkTitle = document.createElement("div"); hkTitle.style.cssText = "font-size:11px;font-weight:600;color:#9bb0c8;margin-top:4px;"; hkTitle.textContent = "Housekeeping";
    const removeRow = mkChk("Auto Remove Old SweK Directory if Old Zip in Downloads", false);
    const removeLine = document.createElement("div"); removeLine.style.cssText = "font-size:11px;color:#8b97a8;margin-left:22px;line-height:1.5;"; removeLine.textContent = "";
    const cleanBtn = _btn("Clean now", false); cleanBtn.style.cssText += ";margin-left:22px;display:none;";
    row.append(checkBtn, installBtn); host.append(line, sub, row, autoRow, fleetTitle, propRow, idleRow, secRow, ghTitle, ghLine, ghRow, ghAuto, hkTitle, removeRow, removeLine, cleanBtn, note);
    propRow.cb.onchange = () => setFleetCfg({ propagate: propRow.cb.checked });
    idleRow.cb.onchange = () => setFleetCfg({ onlyWhenIdle: idleRow.cb.checked });
    secIn.onchange = () => setFleetCfg({ autoConfirmSec: Math.max(0, Math.min(300, parseInt(secIn.value, 10) || 0)) });
    const setProg = (t, ok) => { sub.textContent = t; sub.style.color = ok === false ? "#f88" : ok === true ? "#9fe88f" : "#9fb3cc"; };
    const refresh = async () => {
        line.textContent = "Checking\u2026"; installBtn.style.display = "none";
        const s = await check();
        if (!s || !s.ok) { line.textContent = "Update check unavailable (bridge offline?)"; return; }
        autoCb.checked = !!s.autoApply;
        removeRow.cb.checked = !!s.autoRemoveOld;
        const cur = "v" + s.current;
        if (s.updateAvailable) { line.innerHTML = "\uD83D\uDD04 <b style='color:#9fe88f'>v" + s.found + " is ready</b> \u2014 you're on " + cur + "."; installBtn.style.display = ""; }
        else if (s.found) { line.textContent = "Up to date (" + cur + "; newest in Downloads v" + s.found + ")."; }
        else { line.textContent = "Up to date (" + cur + "). No newer EngineProject zip in Downloads."; }
        note.innerHTML = "Drops a newer <code>EngineProject_vNNN.zip</code> in your Downloads \u2192 the engine extracts it next to the current one and relaunches (the new launcher frees :8787; the old build is the fallback). Windows only.";
        setProg(s.note || "");
        loadPrunePreview();
    };
    const loadPrunePreview = async () => {
        try {
            const p = await j("/sys/update/prune");   // GET = dry run, never deletes
            if (!p || !p.ok) { removeLine.textContent = ""; cleanBtn.style.display = "none"; return; }
            const n = (p.candidates || []).length;
            if (n) { removeLine.innerHTML = "<span style='color:#e0b56a'>" + n + " old folder(s)</span> would be removed: " + p.candidates.map(c => "v" + c.v).join(", ") + " (their zips are in Downloads)."; cleanBtn.style.display = ""; }
            else { removeLine.textContent = "Nothing to remove \u2014 no superseded folder has its zip sitting in Downloads."; cleanBtn.style.display = "none"; }
        } catch { removeLine.textContent = ""; cleanBtn.style.display = "none"; }
    };
    removeRow.cb.onchange = async () => { await j("/sys/update/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ update: { autoRemoveOld: removeRow.cb.checked } }) }); setProg(removeRow.cb.checked ? "\u2713 will auto-remove old folders on boot (when their zip is in Downloads)" : "auto-remove off", true); loadPrunePreview(); };
    cleanBtn.onclick = async () => { cleanBtn.disabled = true; try { const r = await j("/sys/update/prune", { method: "POST" }); const n = (r && r.removed || []).length; setProg(n ? ("\u2713 removed " + n + " old folder(s)") : "nothing to remove", true); } catch { setProg("clean failed", false); } cleanBtn.disabled = false; loadPrunePreview(); };
    checkBtn.onclick = refresh;
    installBtn.onclick = () => { installBtn.disabled = true; checkBtn.disabled = true; _runApply(setProg, () => {}); };
    autoCb.onchange = async () => { await setAutoApply(autoCb.checked); setProg(autoCb.checked ? "\u2713 auto-install on" : "auto-install off", true); };
    const ghStatus = async () => {
        const g = await j("/sys/update/github");
        ghAuto.cb.checked = !!(g && g.autoFetch);
        if (!g || !g.ok) { ghLine.innerHTML = (g && g.error) ? ("GitHub: " + g.error) : "GitHub: set <code>engineRepo</code> + a token in GitHub settings."; return; }
        if (g.none) { ghLine.textContent = "GitHub (" + g.repo + "): no releases published yet \u2014 use \u201cPublish engine build\u201d in GitHub settings."; return; }
        const rel = g.behind ? ("\u2b06 " + g.latest + " available (you're on " + g.current + ")") : g.ahead ? ("you're ahead of the release " + g.latest) : ("up to date with " + g.latest);
        ghLine.innerHTML = "GitHub <code>" + g.repo + "</code> \u2014 latest release <b>" + (g.latest || "?") + "</b>; " + rel + ".";
    };
    ghBtn.onclick = async () => {
        ghBtn.disabled = true; ghLine.textContent = "Checking GitHub\u2026";
        const r = await j("/sys/update/github/fetch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: false }) });
        ghBtn.disabled = false;
        if (!r || !r.ok) { ghLine.textContent = "GitHub: " + ((r && r.error) || "failed"); }
        else if (r.downloaded) { ghLine.innerHTML = "\u2713 downloaded <b>" + r.latest + "</b> into Downloads."; await refresh(); }
        else if (r.upToDate) { ghLine.textContent = "Already current (" + r.current + "); release is " + r.latest + "."; }
        else if (r.already) { ghLine.textContent = r.latest + " is already in Downloads."; await refresh(); }
        else if (r.none) { ghLine.textContent = r.note || "no releases yet."; }
        else { ghLine.textContent = r.note || "done."; }
        ghStatus();
    };
    ghAuto.cb.onchange = async () => {
        await j("/sys/update/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ update: ghAuto.cb.checked ? { enabled: true, autoFetch: true } : { autoFetch: false } }) });
        setProg(ghAuto.cb.checked ? "\u2713 GitHub auto-fetch on" : "GitHub auto-fetch off", true);
    };
    refresh(); ghStatus();
}

// ---- fleet propagation (v1499) ----
const _fcfg = () => { try { return JSON.parse(localStorage.getItem("swek.update.fleet") || "{}"); } catch { return {}; } };
function fleetCfg() { const c = _fcfg(); return { propagate: c.propagate !== false, onlyWhenIdle: c.onlyWhenIdle !== false, autoConfirmSec: typeof c.autoConfirmSec === "number" ? c.autoConfirmSec : 30 }; }
function setFleetCfg(patch) { const c = Object.assign(_fcfg(), patch || {}); try { localStorage.setItem("swek.update.fleet", JSON.stringify(c)); } catch {} return c; }

// "safe to update" = the engine isn't mid-heavy-op and isn't running a non-sandbox demo.
function isBusy() {
    try { const eb = document.getElementById("engineBusy"); if (eb && eb.classList.contains("on")) return true; } catch {}
    try { if (G.demoManager && G.demoManager.current && G.demoManager.current.id && G.demoManager.current.id !== "blank_sandbox") return true; } catch {}
    return false;
}
async function _peers() { const d = await j("/sync/discovered"); return (d && d.discovered) || []; }
async function _currentVersionNum() { const s = await status(); return (s && s.current) || parseInt(((G.ENGINE_VERSION || "").match(/v?(\d+)/) || [])[1] || "0", 10); }

let _pendingPeerUpdate = null, _idleTimer = null;
function pendingUpdate() { return _pendingPeerUpdate; }

// Ask discovered peers their version; if any is newer, pull its zip into Downloads, then prompt
// (or defer until idle). This is what makes one machine's update roll out to the whole LAN.
async function checkPeersForUpdate() {
    const cfg = fleetCfg(); if (!cfg.propagate) return { ok: true, skipped: "propagate off" };
    const cur = await _currentVersionNum();
    const list = await _peers();
    let best = null;
    for (const p of list) { const v = p.caps && p.caps.version; if (v && v > cur && (!best || v > best.v)) best = { v, url: p.url }; }
    if (!best) return { ok: true, upToDate: true };
    const pull = await j("/update/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: best.url }) });
    if (!pull || !pull.ok || pull.skipped) return { ok: false, pull };
    _offerOrDefer(best.v);
    return { ok: true, pulled: best.v, from: best.url };
}

function _offerOrDefer(foundV) {
    const cfg = fleetCfg();
    if (cfg.onlyWhenIdle && isBusy()) {
        _pendingPeerUpdate = { version: foundV };
        try { G.tvNotify && G.tvNotify("Update pending", "v" + foundV + " will install when the engine is idle.", { corner: "top_end", duration: 6 }); } catch {}
        if (!_idleTimer) _idleTimer = setInterval(() => {
            if (!_pendingPeerUpdate) { clearInterval(_idleTimer); _idleTimer = null; return; }
            if (!isBusy()) { clearInterval(_idleTimer); _idleTimer = null; const v = _pendingPeerUpdate.version; _pendingPeerUpdate = null; _promptApply(v); }
        }, 15000);
        return;
    }
    _promptApply(foundV);
}

function _promptApply(foundV) {
    const cfg = fleetCfg();
    let skip = 0; try { skip = parseInt(localStorage.getItem("swek.updateSkip") || "0", 10) || 0; } catch {}
    if (foundV <= skip) return;
    const fn = G.swekConfirm;
    if (!fn) { _runApply(() => {}, () => {}); return; }   // no toast surface -> just apply
    fn({ id: "engine-update", title: "SweK Engine update", message: "<b>v" + foundV + "</b> is ready. Install it and restart now?", yesLabel: "Install & restart", noLabel: "Later", autoYesSec: cfg.autoConfirmSec || 0,
         onYes: () => _runApply((msg) => { try { G.tvNotify && G.tvNotify("Updating", msg, { corner: "top_end", duration: 6 }); } catch {} }, () => {}),
         onNo: () => { try { localStorage.setItem("swek.updateSkip", String(foundV)); } catch {} } });
}

// First-look prompt: a newer version sitting in Downloads (from the launcher, a manual drop, or a
// peer push) gets a one-click install via the confirm toast (with the configured auto-confirm).
async function maybePromptUpdate() {
    const s = await check();
    if (!s || !s.ok || !s.updateAvailable || !s.found) return;
    if (s.autoApply) {   // auto-install on: apply now (no prompt) but surface a failure so it isn't silent
        _runApply((msg, ok) => { if (ok === false) { try { G.tvNotify && G.tvNotify("Auto-update failed", msg, { corner: "top_end", duration: 8 }); } catch {} } }, () => {});
        return;
    }
    _offerOrDefer(s.found);
}

G.swekEngineUpdate = { status, check, apply, setAutoApply, renderPanel, maybePromptUpdate, checkPeersForUpdate, fleetCfg, setFleetCfg, isBusy, pendingUpdate };
export default G.swekEngineUpdate;

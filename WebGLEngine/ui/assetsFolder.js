// FILE: ui/assetsFolder.js
// VERSION: v1491 — global "local assets folder" picker + first-run prompt.
//
// Lets the user point the engine at a local/external GPU_Assets folder from anywhere
// (Settings -> Assets), and prompts once on first run if it isn't set yet. The LOCAL
// ai-bridge server is what reads the folder (a browser can't read an arbitrary disk
// folder), so this just drives the server's /config/assets-dir + the /fs browse endpoints.
//
// Exposes window.swekAssetsFolder = { getCfg, setDir, openPicker, chooseAndSet, maybeFirstRunPrompt }.

const G = (typeof window !== "undefined") ? window : globalThis;

async function getCfg() {
    try { return await fetch("/config/assets-dir", { cache: "no-store" }).then(r => r.json()); } catch { return null; }
}
async function setDir(dir) {
    try { return await fetch("/config/assets-dir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dir }) }).then(r => r.json()); }
    catch (e) { return { ok: false, error: e && e.message }; }
}

// Server-side folder browser (reuses /fs/roots + /fs/list). Resolves to a chosen path or null.
function openPicker(start) {
    return new Promise((resolve) => {
        const ov = document.createElement("div"); ov.style.cssText = "position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:14px;";
        const box = document.createElement("div"); box.style.cssText = "background:#0a1018;border:1px solid #2bd6ff;border-radius:10px;width:min(520px,96vw);max-height:84vh;display:flex;flex-direction:column;overflow:hidden;color:#cde;font:13px ui-monospace,monospace;box-shadow:0 0 30px rgba(43,150,255,.35);";
        const head = document.createElement("div"); head.style.cssText = "padding:11px 13px;border-bottom:1px solid #244;font-weight:bold;"; head.textContent = "Select assets folder";
        const cur = document.createElement("div"); cur.style.cssText = "padding:7px 13px;font-size:11px;color:#7fd1ff;background:#0c1622;word-break:break-all;border-bottom:1px solid #244;";
        const list = document.createElement("div"); list.style.cssText = "flex:1;overflow:auto;padding:6px;display:flex;flex-direction:column;gap:2px;min-height:180px;";
        const foot = document.createElement("div"); foot.style.cssText = "padding:9px 13px;border-top:1px solid #244;display:flex;gap:8px;justify-content:flex-end;";
        const mk = (t, primary) => { const b = document.createElement("button"); b.textContent = t; b.style.cssText = "padding:8px 13px;border-radius:7px;cursor:pointer;font:12px ui-monospace,monospace;" + (primary ? "background:#0bf;color:#012;border:1px solid #2bd6ff;" : "background:#0c1622;color:#cde;border:1px solid #244;"); return b; };
        const cancel = mk("Cancel", false), choose = mk("Use this folder", true);
        // v1507 — create a new folder in the current location, with a sensible default name.
        const newBtn = mk("\uD83D\uDCC1 New folder", false);
        newBtn.title = "Create a new folder here";
        foot.append(cancel, newBtn, choose); box.append(head, cur, list, foot); ov.appendChild(box); document.body.appendChild(ov);
        foot.style.justifyContent = "space-between";
        let here = start || "";
        newBtn.onclick = async () => {
            if (!here) { cur.textContent = "Pick a drive/location first, then create a folder."; return; }
            const def = "GPU_Assets";   // default-fill the name when they decide to create
            const name = window.prompt("New folder name (created inside:\n" + here + ")", def);
            if (name == null) return;   // cancelled
            const j = await fetch("/fs/mkdir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: here, name }) }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
            if (!j || !j.ok) { cur.textContent = "could not create folder: " + ((j && j.error) || "failed"); return; }
            browse(j.path);   // step into the new folder; "Use this folder" then selects it
        };
        const close = (v) => { try { document.body.removeChild(ov); } catch {} resolve(v); };
        cancel.onclick = () => close(null); choose.onclick = () => close(here || null); ov.onclick = (e) => { if (e.target === ov) close(null); };
        const row = (label, icon, onClick) => { const r = document.createElement("div"); r.style.cssText = "display:flex;gap:8px;align-items:center;padding:9px;border-radius:6px;cursor:pointer;"; r.onmouseenter = () => r.style.background = "#13202e"; r.onmouseleave = () => r.style.background = ""; const i = document.createElement("span"); i.textContent = icon; const t = document.createElement("span"); t.textContent = label; t.style.wordBreak = "break-all"; r.append(i, t); r.onclick = onClick; return r; };
        async function roots() {
            here = ""; cur.textContent = "Drives / start"; list.innerHTML = ""; choose.style.display = "none";
            const j = await fetch("/fs/roots").then(r => r.json()).catch(() => null);
            if (!j || !j.ok) { list.appendChild(row("can't read drives (sign in if remote)", "\u26A0", () => {})); return; }
            if (j.home) list.appendChild(row("Home  " + j.home, "\uD83C\uDFE0", () => browse(j.home)));
            if (j.engine) list.appendChild(row("Engine folder", "\u2699", () => browse(j.engine)));
            (j.roots || []).forEach(d => list.appendChild(row(d, "\uD83D\uDCBD", () => browse(d))));
        }
        async function browse(dir) {
            choose.style.display = ""; const j = await fetch("/fs/list?path=" + encodeURIComponent(dir)).then(r => r.json()).catch(() => null);
            if (!j || !j.ok) {
                cur.textContent = dir + " \u2014 " + ((j && j.error) || "no response"); list.innerHTML = "";
                list.appendChild(row("\uD83D\uDCBD back to drives / start", "\u21a9", () => roots()));
                const par = dir.replace(/[\\\/]+$/, "").replace(/[\\\/][^\\\/]*$/, "");
                if (par && par !== dir) list.appendChild(row(".. up to " + par, "\u2B06", () => browse(par)));
                return;
            }
            here = j.path; cur.textContent = j.path; list.innerHTML = "";
            list.appendChild(row(".. up", "\u2B06", () => { if (j.parent) browse(j.parent); else roots(); }));
            (j.folders || []).forEach(f => list.appendChild(row(f.name, "\uD83D\uDCC1", () => browse(f.path))));
        }
        if (here) browse(here); else roots();
    });
}

// Full flow: read current -> pick -> save. Resolves to the POST result object (or null if cancelled).
async function chooseAndSet() {
    let start = ""; try { const c = await getCfg(); start = (c && c.assetsDir) || ""; } catch {}
    const p = await openPicker(start);
    if (!p) return null;
    return await setDir(p);
}

// First-run prompt: if the assets dir isn't set (source === "default") and the user hasn't
// dismissed it, show a one-time banner offering to choose a folder or keep the built-in assets.
async function maybeFirstRunPrompt() {
    let seen = false; try { seen = localStorage.getItem("swek.assetsFolderPrompt") === "done"; } catch {}
    if (seen) return;
    const c = await getCfg();
    if (!c || !c.ok) return;                       // bridge not reachable yet — don't nag
    if (c.source !== "default") { try { localStorage.setItem("swek.assetsFolderPrompt", "done"); } catch {} return; }
    const done = () => { try { localStorage.setItem("swek.assetsFolderPrompt", "done"); } catch {} try { document.body.removeChild(banner); } catch {} };
    const banner = document.createElement("div");
    banner.style.cssText = "position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99998;background:rgba(10,18,26,.96);border:1px solid #2bd6ff;border-radius:10px;padding:12px 14px;color:#cde;font:13px ui-monospace,monospace;box-shadow:0 8px 30px rgba(0,0,0,.5);max-width:min(560px,94vw);";
    const t = document.createElement("div"); t.style.cssText = "margin-bottom:8px;line-height:1.45;";
    t.innerHTML = "\uD83D\uDCC1 <b>Assets folder not set.</b> Point SweK at a local folder for your downloaded models (.glb), or keep the built-in assets. Change this anytime in Settings \u2192 Assets.";
    const rowb = document.createElement("div"); rowb.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";
    const mk = (label, primary, fn) => { const b = document.createElement("button"); b.textContent = label; b.style.cssText = "padding:7px 12px;border-radius:7px;cursor:pointer;font:12px ui-monospace,monospace;" + (primary ? "background:#0bf;color:#012;border:1px solid #2bd6ff;" : "background:#0c1622;color:#cde;border:1px solid #244;"); b.onclick = fn; return b; };
    const choose = mk("Choose folder\u2026", true, async () => {
        const j = await chooseAndSet();
        if (j && j.ok) {
            t.innerHTML = "\u2713 Assets folder set to <b>" + (j.assetsDir || "") + "</b>" + (j.created && j.created.length ? (" (created: " + j.created.join(", ") + ")") : "") + ". Drop your .glb models in there.";
            rowb.innerHTML = ""; rowb.append(mk("Done", true, done));
            try { G.assetLibrary && G.assetLibrary.refresh && G.assetLibrary.refresh(); } catch {}
        } else if (j && !j.ok) {
            t.innerHTML = "\u2717 Couldn't save: " + (j.error || "failed") + ". You can try again from Settings \u2192 Assets.";
        }
    });
    const keep = mk("Use built-in assets", false, done);
    rowb.append(choose, keep);
    banner.append(t, rowb); document.body.appendChild(banner);
}

G.swekAssetsFolder = { getCfg, setDir, openPicker, chooseAndSet, maybeFirstRunPrompt };
export default G.swekAssetsFolder;

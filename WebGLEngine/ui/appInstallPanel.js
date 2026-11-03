// ui/appInstallPanel.js -- the "Install with SweK" panel of nectarlink.html and duodesk.html (the bridge is ai-bridge/appInstallBridge.js, the gate tools/ship/appInstall-selfcheck.mjs).
//
// Download is a pinned, verified fetch of the vendor's release file onto THIS machine; Run hands it to the OS and is a separate step behind a confirm, because the apps are not code-signed.
// Both are the host's alone: from a remote (tunnel) session the buttons are replaced by a line saying so, and the plain download links on the page remain.
const mb = (n) => (n / 1048576).toFixed(n >= 1048576 * 10 ? 0 : 1) + " MB";

/** What the panel shows, from a /apps/status response: pure, so it can be gated without a browser. */
export function describePanel(status, id) {
    const app = status && status.ok && (status.apps || []).find((a) => a.id === id);
    if (!app) return { available: false, why: (status && status.error) || "the install bridge is not running" };
    const rec = app.assets.find((a) => a.name === app.recommended) || null, job = status.job && status.job.id === id ? status.job : null;
    return {
        available: true, local: status.local === true, name: app.name, version: app.version, host: status.host, recommended: rec,
        canDownload: status.local === true && !!rec && !rec.staged && !(job && !job.done),
        canRun: status.local === true && !!rec && rec.staged,
        busy: !!(job && !job.done), progress: job && job.total ? Math.min(1, job.received / job.total) : 0, error: job && job.done && !job.ok ? job.error : null,
        others: app.assets.filter((a) => a !== rec).map((a) => ({ name: a.name, kind: a.kind, platform: a.platform, size: mb(a.bytes), staged: a.staged, forThisHost: a.platform === status.host.platform && (a.arch === null || a.arch === status.host.arch) })),
        noneForHost: !rec ? "no pinned installer for " + status.host.platform + "/" + status.host.arch + " -- use the links above" : null,
    };
}

export async function mountAppInstall(el, id, fetchFn = fetch) {
    const get = () => fetchFn("/apps/status").then((r) => r.json()).catch((e) => ({ ok: false, error: String(e && e.message || e) }));
    const post = (path, body) => fetchFn(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
    const text = (t) => { const d = document.createElement("div"); d.textContent = t; return d; };
    async function render() {
        const p = describePanel(await get(), id);
        el.textContent = "";
        if (!p.available) { el.append(text("Install with SweK is unavailable: " + p.why + ". The download links above work on their own.")); return; }
        if (!p.local) { el.append(text("Install with SweK works only from the machine that runs the engine (this is a remote or tunnel session). Use the download links above.")); return; }
        if (!p.recommended) { el.append(text(p.noneForHost)); return; }
        const r = p.recommended;
        el.append(text(p.name + " " + p.version + " for " + p.host.platform + "/" + p.host.arch + ": " + r.name + " (" + mb(r.bytes) + "), SHA-256 " + r.sha256.slice(0, 16) + "... checked before it is kept."));
        const row = document.createElement("div"), mk = (label, fn, on) => { const b = document.createElement("button"); b.textContent = label; b.disabled = !on; b.onclick = fn; b.className = "btn"; row.append(b); };
        mk(r.staged ? "Downloaded and verified" : p.busy ? "Downloading " + Math.round(p.progress * 100) + "%" : "Download (verified)", async () => { await post("/apps/download", { id, name: r.name }); poll(); }, p.canDownload);
        mk(r.kind === "deb" ? "Show install command" : "Run installer", async () => {
            if (!confirm(p.name + " is not code-signed. Run " + r.name + " on this machine?")) return;
            const out = await post("/apps/launch", { id, name: r.name, confirm: true });
            alert(out.ok ? (out.note || "started") : "Not run: " + out.error);
        }, p.canRun);
        el.append(row);
        if (p.error) el.append(text("Last download: " + p.error));
        if (p.others.length) el.append(text("Other pinned builds: " + p.others.map((o) => o.name + (o.staged ? " (downloaded)" : "")).join(", ") + " -- download links above."));
    }
    let timer = null;
    function poll() { clearInterval(timer); timer = setInterval(async () => { await render(); const s = await get(); if (!s.job || s.job.done) clearInterval(timer); }, 1000); render(); }
    await render();
}

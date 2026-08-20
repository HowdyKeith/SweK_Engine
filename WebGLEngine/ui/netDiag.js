// FILE: ui/netDiag.js
// VERSION: v1495 — SweK <-> SweK network diagnostic + first-run firewall prompt.
//
// Asymmetric peer visibility (machine A sees B, but B can't see A) is almost always a
// firewall blocking INBOUND on one machine. This panel shows this machine's URL + firewall
// state, lists discovered peers, and probes reachability to each so you can see exactly which
// machine to open. The fix is the existing UAC-gated /sys/firewall/allow on the blocked box.
//
// window.swekNetDiag = { netInfo, firewallStatus, firewallAllow, discovered, probe, renderPanel, maybeFirstRunFirewallPrompt }

const G = (typeof window !== "undefined") ? window : globalThis;
const j = async (u, opt) => { try { return await fetch(u, opt).then(r => r.json()); } catch { return null; } };

async function netInfo() { return j("/net/info"); }
async function firewallStatus() { return j("/sys/firewall/status"); }
async function firewallAllow() { return j("/sys/firewall/allow", { method: "POST" }); }
async function discovered() { return j("/sync/discovered"); }

// Probe a peer bridge from THIS machine (the browser). no-cors so a cross-origin bridge that
// doesn't send CORS headers still counts as reachable; AbortController times out a blocked one.
function probe(url, timeoutMs = 4000) {
    return new Promise((resolve) => {
        const base = String(url || "").replace(/\/+$/, "");
        if (!base) return resolve({ ok: false, error: "no url" });
        const ctrl = new AbortController();
        const t0 = (performance && performance.now) ? performance.now() : Date.now();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        fetch(base + "/sync/caps", { mode: "no-cors", cache: "no-store", signal: ctrl.signal })
            .then(() => { clearTimeout(timer); const ms = Math.round(((performance && performance.now) ? performance.now() : Date.now()) - t0); resolve({ ok: true, ms }); })
            .catch((e) => { clearTimeout(timer); resolve({ ok: false, error: e && e.name === "AbortError" ? "timeout (firewall / not running)" : "unreachable" }); });
    });
}

function _mkBtn(label, primary) { const b = document.createElement("button"); b.textContent = label; b.style.cssText = "padding:6px 12px;border-radius:6px;cursor:pointer;font:12px ui-monospace,monospace;" + (primary ? "background:#0bf;color:#012;border:1px solid #2bd6ff;" : "background:#0c1622;color:#cde;border:1px solid #2a3340;"); return b; }

async function renderPanel(host) {
    host.innerHTML = "";
    host.style.cssText = "display:flex;flex-direction:column;gap:10px;";

    // --- This machine ---
    const meBox = document.createElement("div"); meBox.style.cssText = "border:1px solid #2a3340;border-radius:8px;padding:10px;";
    const meTitle = document.createElement("div"); meTitle.textContent = "This machine"; meTitle.style.cssText = "font-weight:600;color:#cde;margin-bottom:4px;";
    const meUrl = document.createElement("div"); meUrl.style.cssText = "font-size:11px;color:#9fb3cc;word-break:break-all;"; meUrl.textContent = "…";
    const fwLine = document.createElement("div"); fwLine.style.cssText = "font-size:11px;color:#9fb3cc;margin-top:4px;"; fwLine.textContent = "Firewall: …";
    const fwRow = document.createElement("div"); fwRow.style.cssText = "display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap;";
    const fwBtn = _mkBtn("Open my firewall (UAC)", true);
    const fwMsg = document.createElement("span"); fwMsg.style.cssText = "font-size:11px;color:#8b97a8;";
    const manual = document.createElement("div"); manual.style.cssText = "font-size:10px;color:#6b7686;margin-top:5px;font-family:ui-monospace,monospace;word-break:break-all;";
    fwRow.append(fwBtn, fwMsg);
    meBox.append(meTitle, meUrl, fwLine, fwRow, manual);
    host.appendChild(meBox);

    let myPort = 8787;
    const loadMe = async () => {
        const ni = await netInfo();
        if (ni) { myPort = ni.port || myPort; meUrl.textContent = "URL: " + ((ni.urls && ni.urls[0]) || (ni.lanIps && ni.lanIps[0] ? ("http://" + ni.lanIps[0] + ":" + ni.port) : ("port " + ni.port))); }
        const fw = await firewallStatus();
        if (!fw) { fwLine.textContent = "Firewall: (bridge offline)"; fwBtn.style.display = "none"; return; }
        if (!fw.win) { fwLine.textContent = "Firewall: " + (fw.note || "non-Windows — open the port in your OS firewall if peers can't reach you."); fwBtn.style.display = "none"; return; }
        fwLine.innerHTML = "Firewall: inbound rule for TCP " + fw.port + " is <b style='color:" + (fw.ruleExists ? "#9fe88f" : "#ffb15a") + "'>" + (fw.ruleExists ? "present \u2713" : "MISSING") + "</b>" + (fw.firewallOn ? "" : " (firewall is OFF — all allowed)");
        manual.textContent = 'Manual (admin cmd): netsh advfirewall firewall add rule name="VoxelBridge ' + fw.port + '" dir=in action=allow protocol=TCP localport=' + fw.port;
        fwBtn.style.display = fw.ruleExists ? "none" : "";
    };
    fwBtn.onclick = async () => { fwMsg.textContent = "Approve the UAC prompt…"; const r = await firewallAllow(); fwMsg.textContent = r && r.ok ? "✓ opened TCP " + (r.port || myPort) : "✗ " + ((r && (r.err || r.error)) || "failed / declined"); fwMsg.style.color = r && r.ok ? "#9fe88f" : "#f88"; if (r && r.ok) loadMe(); };
    loadMe();

    // --- Peers ---
    const peerBox = document.createElement("div"); peerBox.style.cssText = "border:1px solid #2a3340;border-radius:8px;padding:10px;";
    const pTitle = document.createElement("div"); pTitle.textContent = "Other SweK machines"; pTitle.style.cssText = "font-weight:600;color:#cde;margin-bottom:4px;";
    const pList = document.createElement("div"); pList.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    const addRow = document.createElement("div"); addRow.style.cssText = "display:flex;gap:6px;margin-top:8px;";
    const addInp = document.createElement("input"); addInp.placeholder = "http://OTHER-LAPTOP:8787"; addInp.style.cssText = "flex:1;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
    const addBtn = _mkBtn("Test", false); addRow.append(addInp, addBtn);
    peerBox.append(pTitle, pList, addRow);
    host.appendChild(peerBox);

    const peerRow = (url, agoMs) => {
        const r = document.createElement("div"); r.style.cssText = "display:flex;gap:6px;align-items:center;font-size:11px;";
        const u = document.createElement("span"); u.textContent = url + (agoMs != null ? "  (seen " + Math.round(agoMs / 1000) + "s ago)" : ""); u.style.cssText = "flex:1;color:#cde;word-break:break-all;";
        const tb = _mkBtn("Test reach", false); tb.style.padding = "3px 9px";
        const res = document.createElement("span"); res.style.cssText = "font-size:11px;min-width:90px;color:#8b97a8;";
        tb.onclick = async () => { res.textContent = "probing…"; res.style.color = "#8b97a8"; const p = await probe(url); res.textContent = p.ok ? "✓ reachable " + p.ms + "ms" : "✗ " + p.error; res.style.color = p.ok ? "#9fe88f" : "#f88"; };
        r.append(u, tb, res); return r;
    };
    const loadPeers = async () => {
        pList.innerHTML = "<div style='font-size:11px;color:#8b97a8'>scanning…</div>";
        const d = await discovered();
        pList.innerHTML = "";
        const list = (d && d.discovered) || [];
        if (!list.length) { pList.innerHTML = "<div style='font-size:11px;color:#8b97a8'>None discovered yet. If a machine you KNOW is running isn't here, its beacon isn't reaching you — open its firewall (run the button above ON THAT machine), or add it by URL below and Test.</div>"; return; }
        for (const p of list) pList.appendChild(peerRow(p.url, p.agoMs));
    };
    addBtn.onclick = async () => { const url = addInp.value.trim(); if (!url) return; const row = peerRow(url, null); pList.appendChild(row); row.querySelector("button").click(); };
    loadPeers();

    const help = document.createElement("div"); help.style.cssText = "font-size:11px;color:#8b97a8;line-height:1.5;";
    help.innerHTML = "<b>Reading this:</b> \u201CTest reach\u201D probes a peer <i>from this machine</i>. If you can reach a peer but it can\u2019t reach you, open the firewall on <b>this</b> machine (button above). If you can\u2019t reach a peer, open the firewall on <b>that</b> machine (run the button there). Asset sync needs both directions reachable on the bridge port.";
    host.appendChild(help);
}

// First-run: on Windows, if the inbound rule is missing, offer to open it so other SweK
// machines can reach this one. Shown once (or until opened).
async function maybeFirstRunFirewallPrompt() {
    let seen = false; try { seen = localStorage.getItem("swek.firewallPrompt") === "done"; } catch {}
    if (seen) return;
    const fw = await firewallStatus();
    if (!fw || !fw.ok) return;                 // bridge not up yet — retry next launch
    if (!fw.win) { try { localStorage.setItem("swek.firewallPrompt", "done"); } catch {} return; }
    if (fw.ruleExists) { try { localStorage.setItem("swek.firewallPrompt", "done"); } catch {} return; }
    const done = () => { try { localStorage.setItem("swek.firewallPrompt", "done"); } catch {} try { document.body.removeChild(banner); } catch {} };
    const banner = document.createElement("div");
    banner.style.cssText = "position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:99998;background:rgba(10,18,26,.96);border:1px solid #2bd6ff;border-radius:10px;padding:12px 14px;color:#cde;font:13px ui-monospace,monospace;box-shadow:0 8px 30px rgba(0,0,0,.5);max-width:min(560px,94vw);";
    const t = document.createElement("div"); t.style.cssText = "margin-bottom:8px;line-height:1.45;";
    t.innerHTML = "\uD83D\uDD25 <b>Firewall: this machine isn\u2019t reachable yet.</b> Other SweK machines won\u2019t see it (or sync assets) until inbound TCP " + fw.port + " is allowed. Open it now? (UAC prompt). Change anytime in Settings \u2192 Diagnostics.";
    const row = document.createElement("div"); row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";
    const open = _mkBtn("Open firewall", true), skip = _mkBtn("Skip", false);
    open.onclick = async () => { t.innerHTML = "Approve the UAC prompt\u2026"; const r = await firewallAllow(); if (r && r.ok) { t.innerHTML = "\u2713 Opened inbound TCP " + (r.port || fw.port) + " \u2014 other SweK machines can reach this one now."; row.innerHTML = ""; row.append(_mkBtn("Done", true)); row.firstChild.onclick = done; } else { t.innerHTML = "\u2717 " + ((r && (r.err || r.error)) || "declined") + ". You can retry in Settings \u2192 Diagnostics."; } };
    skip.onclick = done;
    row.append(open, skip); banner.append(t, row); document.body.appendChild(banner);
}

G.swekNetDiag = { netInfo, firewallStatus, firewallAllow, discovered, probe, renderPanel, maybeFirstRunFirewallPrompt };
export default G.swekNetDiag;

// ui/hostingControls.js -- THE HOSTING CONTROLS, ONCE, MOUNTED WHEREVER THEY ARE WANTED.
//
// v4022 -- Keith: "that page should be integrated into the Tunnels menu that shows on the Server.html. some of
// those, or all settings are already in the Tunnels menu. i do not see the quick tunnel option. lets get all
// the settings on one panel."
//
// *** THE QUICK TUNNEL WAS ALREADY ON server.html AND HE STILL COULD NOT FIND IT. *** Its Public-tunnel block
// POSTs /hosting/tunnel {action:"start"} -- byte for byte the call hosting.html's "Start quick tunnel" makes --
// but the button reads "Start tunnel" and starts with display:none until loadTunnel() resolves state. A control
// that is present, unlabelled and invisible-on-arrival is indistinguishable from a missing one, and he was
// right to report it missing.
//
// WHAT WAS GENUINELY ABSENT from server.html: the permanent/named-tunnel setup-script generator, the Drive
// URL-pointer, Tailscale serve/funnel, and NetBird. Four subjects, ~140 lines of wiring, living only in
// hosting.html.
//
// *** SO THE ONE THING THIS FILE MUST NOT BE IS A COPY. *** "Get all the settings on one panel" has an obvious
// wrong implementation -- paste hosting.html's four cards into server.html's drawer -- which would make two
// copies of every control, and v3527's rule has bitten five times in this repository THIS WEEK: the second copy
// is never the one that gets updated. One implementation, two mount points.
//
// AND IT USES NO GLOBAL IDs, WHICH IS NOT A STYLE PREFERENCE HERE. server.html ALREADY OWNS the ids cfStart,
// cfStop, cfInstall and cfTunnel for its own Public-tunnel block. A module minting those same ids inside that
// page would give document.getElementById two answers and hand server.html's existing wiring the wrong one --
// breaking the working panel in the act of extending it. Every element below is held in a local reference.
//
// USAGE:
//   mountHostingControls(hostEl, { sections: ["cloudflare","permanent","tailscale","netbird"], compact: false })
//   -> { root, refresh, destroy }
"use strict";

const J = (u, o) => fetch(u, o).then((r) => r.json());

// ---- tiny DOM helpers: build, do not template. -------------------------------------------------------------
function E(tag, style, text) {
    const e = document.createElement(tag);
    if (style) Object.assign(e.style, style);
    if (text != null) e.textContent = text;
    return e;
}
const DIM = "#7f93a8";
function btn(label, kind) {
    const b = E("button", {
        font: "11px ui-monospace, Menlo, Consolas, monospace", padding: "3px 10px", borderRadius: "5px",
        cursor: "pointer", marginRight: "6px", marginTop: "4px",
        background: kind === "go" ? "#2a4d3a" : kind === "stop" ? "#3a1c1c" : "#243a4d",
        color: kind === "stop" ? "#f99" : "#cfe",
        border: "1px solid " + (kind === "go" ? "#4a7d5a" : kind === "stop" ? "#6a3a3a" : "#4a6a7d"),
    }, label);
    b.type = "button";
    return b;
}
function logBox() {
    return E("pre", { display: "none", whiteSpace: "pre-wrap", maxHeight: "180px", overflow: "auto",
        background: "#0a1210", border: "1px solid #1a2a22", padding: "6px", margin: "5px 0 0",
        font: "10px ui-monospace, Menlo, Consolas, monospace", color: "#8fb3a0" });
}
function head(title) {
    const h = E("div", { color: "#8fc", fontWeight: "bold", marginBottom: "2px", fontSize: "11px" }, title);
    return h;
}
function note(t) { return E("div", { color: DIM, fontSize: "10px", marginTop: "2px", lineHeight: "1.45" }, t); }
function badge(t) {
    return E("span", { fontSize: "9px", padding: "1px 6px", borderRadius: "8px", marginLeft: "6px",
        border: "1px solid #3a4a5a", color: DIM }, t);
}
function setBadge(el, tool) {
    if (tool && tool.installed) { el.textContent = "installed" + (tool.version ? " v" + tool.version : ""); el.style.color = "#7fe0a4"; el.style.borderColor = "#2f6b46"; }
    else { el.textContent = "not installed"; el.style.color = DIM; el.style.borderColor = "#3a4a5a"; }
}

export function mountHostingControls(host, opts = {}) {
    const sections = opts.sections || ["cloudflare", "permanent", "tailscale", "netbird"];
    const root = E("div", { display: "flex", flexDirection: "column", gap: "10px" });
    const timers = [];
    const every = (fn, ms) => { const t = setInterval(fn, ms); timers.push(t); return t; };

    // ---- shared: what is installed on this box --------------------------------------------------------
    const badges = {};
    const installBtns = {};
    async function detect() {
        try {
            const d = await J("/hosting/detect");
            if (badges.cf) setBadge(badges.cf, d.cloudflared);
            if (badges.ts) setBadge(badges.ts, d.tailscale);
            if (installBtns.cf) installBtns.cf.disabled = !!(d.cloudflared && d.cloudflared.installed);
            if (installBtns.ts) installBtns.ts.disabled = !!(d.tailscale && d.tailscale.installed);
            if (d.tailscale && d.tailscale.installed) tsRefresh();
            if (plat) {
                const w = d.winget && d.winget.installed;
                plat.textContent = "platform: " + d.platform + " · winget: " + (w ? "available" : "not found") +
                    (d.platform !== "win32" ? " (one-click install is Windows-only)" : "");
            }
        } catch { for (const k in badges) badges[k].textContent = "bridge unreachable"; }
    }
    async function runInstall(tool, L) {
        L.style.display = "block"; L.textContent = "starting install…";
        const r = await J("/hosting/install", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool }) });
        if (!r.ok) { L.textContent = r.error || "install failed to start"; return; }
        const p = every(async () => {
            const s = await J("/hosting/install/status");
            L.textContent = (s.log || "").slice(-3000) || "working…"; L.scrollTop = L.scrollHeight;
            if (!s.running) { clearInterval(p); L.textContent += "\n\n[done, exit " + s.code + "]"; detect(); }
        }, 1500);
    }

    let plat = null;

    // ---- 1. CLOUDFLARE QUICK TUNNEL -------------------------------------------------------------------
    if (sections.includes("cloudflare")) {
        const s = E("div");
        const h = head("☁️ Cloudflare quick tunnel"); badges.cf = badge("checking…"); h.appendChild(badges.cf);
        s.appendChild(h);
        s.appendChild(note("A public HTTPS URL with nothing for visitors to install. The URL is RANDOM and " +
            "changes every run — good for a smoke test, not for anything you hand out. For a stable address " +
            "use the permanent tunnel below."));
        const row = E("div");
        const bInstall = btn("Install cloudflared"); installBtns.cf = bInstall;
        const bStart = btn("Start quick tunnel", "go");
        const bStop = btn("Stop", "stop"); bStop.disabled = true;
        row.append(bInstall, bStart, bStop); s.appendChild(row);
        const url = E("div", { display: "none", fontSize: "11px", marginTop: "4px", color: "#9ed5ff" });
        const L = logBox(); s.append(url, L);
        bInstall.onclick = () => runInstall("cloudflare", L);

        let poll = null;
        const showUrl = (u) => { url.style.display = "block"; url.innerHTML = "Live: <a href='" + u + "' target='_blank' rel='noopener' style='color:#9ed5ff'>" + u + "</a> — open it on another device."; };
        bStart.onclick = async () => {
            bStart.disabled = true; L.style.display = "block"; L.textContent = "starting tunnel…";
            const r = await J("/hosting/tunnel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }) });
            if (!r.ok) {
                // ALREADY RUNNING IS NOT A FAILURE, and hosting.html learned that the hard way -- without this
                // branch the panel hangs on "starting…" forever while a perfectly good tunnel is already up.
                if (r.url) { L.textContent = "tunnel already running"; showUrl(r.url); bStop.disabled = false; }
                else L.textContent = r.error || "could not start";
                bStart.disabled = false; return;
            }
            bStop.disabled = false;
            poll = every(async () => {
                const st = await J("/hosting/tunnel/status");
                L.textContent = (st.log || "").slice(-2000); L.scrollTop = L.scrollHeight;
                if (st.url) showUrl(st.url);
                if (!st.running) { clearInterval(poll); bStart.disabled = false; bStop.disabled = true; if (!st.url) L.textContent += "\n[tunnel exited]"; }
            }, 1500);
        };
        bStop.onclick = async () => {
            await J("/hosting/tunnel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop" }) });
            if (poll) clearInterval(poll);
            bStart.disabled = false; bStop.disabled = true; url.style.display = "none"; L.textContent += "\n[stopped]";
        };
        root.appendChild(s);
    }

    // ---- 2. PERMANENT (NAMED) TUNNEL + DRIVE POINTER --------------------------------------------------
    if (sections.includes("permanent")) {
        const s = E("div");
        s.appendChild(head("🌐 Permanent URL (named tunnel)"));
        s.appendChild(note("A permanent https://swek.yourdomain.com needs a domain on your Cloudflare account " +
            "(free plan is fine). This generates a one-run setup script for THIS machine's OS: it installs " +
            "cloudflared, creates the tunnel, routes DNS and installs an auto-start service. One step " +
            "(cloudflared tunnel login) opens a browser for you to pick the domain."));
        const row = E("div", { display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", marginTop: "5px" });
        const hostIn = E("input", { flex: "1 1 200px", background: "#0c1622", color: "#d8e6f2",
            border: "1px solid #24323f", borderRadius: "5px", padding: "4px 8px",
            font: "11px ui-monospace, Menlo, Consolas, monospace" });
        hostIn.placeholder = "swek.yourdomain.com";
        const bGen = btn("Generate setup script", "go");
        row.append(hostIn, bGen); s.appendChild(row);
        const script = logBox(); script.style.maxHeight = "240px";
        const tools = E("div", { display: "none" });
        const bCopy = btn("Copy"), bDl = btn("Download script");
        tools.append(bCopy, bDl); s.append(script, tools);

        let lastScript = null, lastFn = "swek-cloudflare-setup.sh";
        bGen.onclick = () => {
            const hn = (hostIn.value || "").trim();
            if (!hn) { hostIn.style.borderColor = "#8f4c4c"; hostIn.focus(); return; }
            hostIn.style.borderColor = "#24323f";
            bGen.disabled = true; bGen.textContent = "generating…";
            J("/cftunnel/setup-script", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hostname: hn }) })
                .then((j) => {
                    bGen.disabled = false; bGen.textContent = "Generate setup script";
                    if (!j || !j.ok) { script.style.display = "block"; script.textContent = "✗ " + ((j && j.error) || "failed"); return; }
                    lastScript = j.script; lastFn = j.filename;
                    script.style.display = "block";
                    script.textContent = "# " + (j.steps || []).join("\n# ") + "\n# NOTE: " + (j.note || "") + "\n\n" + j.script;
                    tools.style.display = "block";
                })
                .catch((e) => { bGen.disabled = false; bGen.textContent = "Generate setup script"; script.style.display = "block"; script.textContent = "✗ " + e; });
        };
        bCopy.onclick = () => { if (lastScript && navigator.clipboard) navigator.clipboard.writeText(lastScript).then(() => { bCopy.textContent = "copied"; setTimeout(() => { bCopy.textContent = "Copy"; }, 1500); }); };
        bDl.onclick = () => {
            if (!lastScript) return;
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([lastScript], { type: "text/plain" }));
            a.download = lastFn; a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        };

        // --- the free alternative, which is the one most people should actually use ---
        s.appendChild(E("div", { borderTop: "1px solid #1e2c3a", margin: "9px 0 6px" }));
        s.appendChild(note("Free alternative — Drive URL pointer. No domain needed. This box writes its current " +
            "tunnel URL to a fixed file in your Drive SweK folder; peers read that file to find the live URL. " +
            "The FILE is permanent even though the URL is not. Needs Drive configured."));
        const prow = E("div", { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginTop: "4px" });
        const lab = E("label", { fontSize: "11px", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" });
        const ptr = E("input"); ptr.type = "checkbox";
        lab.append(ptr, document.createTextNode(" enable Drive URL-pointer"));
        const bWrite = btn("Write pointer now"), bList = btn("List peer pointers");
        prow.append(lab, bWrite, bList); s.appendChild(prow);
        const pl = logBox(); s.appendChild(pl);

        J("/cftunnel/config").then((j) => {
            if (j && j.config) {
                ptr.checked = !!j.config.drivePointer;
                if (j.config.hostname && !hostIn.value) hostIn.value = j.config.hostname;
            }
        }).catch(() => {});
        ptr.onchange = () => { fetch("/cftunnel/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ drivePointer: ptr.checked }) }).catch(() => {}); };
        bWrite.onclick = () => {
            pl.style.display = "block"; pl.textContent = "writing pointer…";
            J("/cftunnel/pointer/write", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
                .then((j) => { pl.textContent = j && j.ok ? "✓ wrote " + (j.wrote || "") + " → " + (j.url || "") : "✗ " + ((j && (j.error || j.skipped)) || "failed"); })
                .catch((e) => { pl.textContent = "✗ " + e; });
        };
        bList.onclick = () => {
            pl.style.display = "block"; pl.textContent = "reading pointers…";
            J("/cftunnel/pointer/list")
                .then((j) => {
                    if (j && j.ok) pl.textContent = (j.pointers && j.pointers.length) ? j.pointers.map((p) => p.name + ": " + p.url).join("\n") : "no pointers found in the Drive folder yet";
                    else pl.textContent = "✗ " + ((j && j.error) || "failed");
                })
                .catch((e) => { pl.textContent = "✗ " + e; });
        };
        root.appendChild(s);
    }

    // ---- 3. TAILSCALE ---------------------------------------------------------------------------------
    let tsRefresh = () => {};
    if (sections.includes("tailscale")) {
        const s = E("div");
        const h = head("🔗 Tailscale"); badges.ts = badge("checking…"); h.appendChild(badges.ts); s.appendChild(h);
        s.appendChild(note("Best when it is just you plus a few trusted devices. SERVE = private to your " +
            "tailnet, nothing public. FUNNEL = public HTTPS and visitors need no Tailscale. Both give the same " +
            "permanent <machine>.<tailnet>.ts.net URL and survive a reboot."));
        const bInstall = btn("Install Tailscale"); installBtns.ts = bInstall; s.appendChild(bInstall);
        const L = logBox(); s.appendChild(L);
        bInstall.onclick = () => runInstall("tailscale", L);
        const ctl = E("div", { display: "none", marginTop: "5px" });
        const urlEl = E("div", { fontSize: "11px", marginBottom: "4px" });
        const bServe = btn("Serve (private)"), bFunnel = btn("Funnel (public)", "go"), bOff = btn("Turn off");
        ctl.append(urlEl, bServe, bFunnel, bOff); s.appendChild(ctl);
        s.appendChild(note("First time only: install, then run `tailscale up` in a terminal to sign in — the " +
            "controls appear here once this box is connected."));

        tsRefresh = async () => {
            try {
                const st = await J("/hosting/tailscale/status");
                if (!st || !st.ok) return;
                if (!st.running) { ctl.style.display = "none"; return; }
                ctl.style.display = "block";
                const active = st.funnel ? "Funnel (public)" : (st.serve ? "Serve (private)" : "off");
                if (st.url) urlEl.innerHTML = "Permanent URL: <a href='" + st.url + "' target='_blank' rel='noopener' style='color:#9ed5ff'>" + st.url + "</a> <span style='color:" + DIM + "'>(" + active + ")</span>";
                else urlEl.innerHTML = "<span style='color:" + DIM + "'>connected, but no ts.net name yet — enable MagicDNS/HTTPS in the admin console</span>";
            } catch {}
        };
        const expose = async (mode) => {
            L.style.display = "block"; L.textContent = mode + ": working…";
            try {
                const r = await J("/hosting/tailscale/expose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, on: true }) });
                if (r && r.ok) { L.textContent = "✓ " + mode + " on — " + (r.url || "") + " (" + (r.note || "") + ")"; tsRefresh(); }
                else {
                    L.textContent = "✗ " + ((r && r.error) || "failed");
                    // THE ENABLE LINK IS THE WHOLE POINT OF THIS BRANCH: funnel refuses until HTTPS is turned on
                    // in the tailnet, and a bare "failed" would send somebody hunting for a setting they were
                    // one click from.
                    if (r && r.enableUrl) L.innerHTML += "<br>Enable it here: <a href='" + r.enableUrl + "' target='_blank' rel='noopener' style='color:#9ed5ff'>" + r.enableUrl + "</a>";
                }
            } catch (e) { L.textContent = "✗ " + e; }
        };
        bServe.onclick = () => expose("serve");
        bFunnel.onclick = () => expose("funnel");
        bOff.onclick = async () => {
            L.style.display = "block"; L.textContent = "turning off…";
            const off = (mode) => J("/hosting/tailscale/expose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, on: false }) });
            try { await off("funnel"); await off("serve"); L.textContent = "✓ off"; tsRefresh(); }
            catch (e) { L.textContent = "✗ " + e; }
        };
        root.appendChild(s);
    }

    // ---- 4. NETBIRD -----------------------------------------------------------------------------------
    if (sections.includes("netbird")) {
        const s = E("div");
        const h = head("🕊 NetBird"); const nb = badge("checking…"); h.appendChild(nb); s.appendChild(h);
        s.appendChild(note("A fully open-source, self-hostable WireGuard P2P mesh — an alternative or " +
            "complement to Tailscale. Devices form direct encrypted peer-to-peer tunnels; only key exchange and " +
            "discovery are brokered. If a box is on a NetBird mesh, SweK can use its 100.x mesh IP as a peer."));
        const info = E("div", { fontSize: "11px", margin: "4px 0", color: DIM }, "not detected on this box");
        const bUp = btn("Join mesh (netbird up)", "go"), bDown = btn("Leave");
        s.append(info, bUp, bDown);
        s.appendChild(note("Client agent: Windows `winget install NetBird.NetBird`, macOS `brew install " +
            "netbird`, Linux the netbird package. To host your OWN control plane use the NetBird entry in " +
            "Settings → Services (needs a public domain + ports 80/443/UDP-3478)."));
        const nbRefresh = () => {
            fetch("/netbird/status", { cache: "no-store" }).then((r) => r.json()).then((st) => {
                if (!st || !st.ok) return;
                if (!st.installed) { nb.textContent = "client not installed"; nb.style.color = DIM; info.textContent = "Install the NetBird client agent (see below) to join a mesh."; return; }
                if (st.connected) {
                    nb.textContent = "on mesh"; nb.style.color = "#7fe0a4"; nb.style.borderColor = "#2f6b46";
                    info.innerHTML = "On a NetBird mesh" + (st.netbirdIp ? (" · this box: <code>" + st.netbirdIp + "</code> · peers: " + (st.peers || 0)) : "") +
                        ". Use that 100.x IP as a peer URL, e.g. <code>http://" + (st.netbirdIp || "100.x.x.x") + ":8787</code>.";
                } else { nb.textContent = "installed, not connected"; nb.style.color = DIM; info.textContent = "NetBird client is installed but this box is not on a mesh yet. Click Join."; }
            }).catch(() => {});
        };
        bUp.onclick = () => {
            const k = prompt("Setup key (optional — leave blank for interactive browser SSO):", "");
            if (k === null) return;   // cancelled: do NOT fire a join nobody confirmed
            J("/netbird/up", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setupKey: k || "" }) })
                .then((x) => { info.textContent = x && x.ok ? "netbird up started — finish any SSO in your browser" : ("failed: " + ((x && (x.error || x.out)) || "?")); nbRefresh(); })
                .catch(() => {});
        };
        bDown.onclick = () => { fetch("/netbird/down", { method: "POST" }).then(nbRefresh).catch(() => {}); };
        nbRefresh();
        root.appendChild(s);
    }

    if (!opts.compact) { plat = note(""); root.appendChild(plat); }

    if (host) host.appendChild(root);
    detect();
    return {
        root,
        refresh() { detect(); tsRefresh(); },
        destroy() { for (const t of timers) clearInterval(t); try { root.remove(); } catch {} },
    };
}

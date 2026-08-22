// ui/haInfoPanel.js — persistent "Home Assistant" info panel. v1 (EngineProject v600).
//
// Docked on the LEFT edge (starts minimized as a tab; opens on hover/click).
// Shows whatever we can detect about a running HA + the bridge + phone reach:
//   - HA reachable? version, URL (the host:port you configured)
//   - entity count + a per-domain breakdown (lights, sensors, switches, …)
//   - bridge availability + listen port
//   - this PC's LAN IP(s) and the URLs a phone should use
//   - whether the phone QR target is reachable (localhost warning) + a live
//     "a device reached the bridge" signal (confirms the phone got through)
//
// Reads /ha/status, /ha/states, /net/info from the bridge (same origin).
// All fields degrade gracefully when HA / the bridge isn't there.

function el(t, s, x) { const e = document.createElement(t); if (s) Object.assign(e.style, s); if (x != null) e.textContent = x; return e; }
async function jget(u) { const r = await fetch(u, { cache: "no-cache" }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }
async function jpost(u, b) { const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return r.json(); }
function ago(ts) { const s = Math.max(0, Math.round((Date.now() - ts) / 1000)); return s < 60 ? s + "s ago" : Math.round(s / 60) + "m ago"; }

const H = { fontWeight: "700", color: "#6cf", fontSize: "11px", margin: "8px 0 3px" };
const DIM = { opacity: "0.7", fontSize: "10px" };

export function mountHaInfoPanel() {
    const root = el("div", { width: "290px", color: "#cde", font: "11px ui-monospace, monospace", padding: "2px 2px 6px" });
    const body = el("div");
    root.appendChild(body);
    const refreshBtn = el("div", { marginTop: "8px", padding: "3px 8px", border: "1px solid #6cf", borderRadius: "3px", cursor: "pointer", textAlign: "center", fontSize: "10px", background: "rgba(100,200,255,0.1)" }, "↻ Refresh");
    root.appendChild(refreshBtn);

    const line = (label, val, color) => {
        const r = el("div", { display: "flex", justifyContent: "space-between", gap: "8px", padding: "1px 0" });
        r.appendChild(el("span", DIM, label));
        r.appendChild(el("span", { color: color || "#cde", textAlign: "right", wordBreak: "break-all" }, val));
        return r;
    };

    async function refresh() {
        // v627 — same guard as the Kaggle panel: don't wipe the panel while the
        // user is typing creds into one of its inputs, or while they're hovering
        // it to read. The 15s auto-poll was erasing a half-entered HA token the
        // moment the user tabbed back to Home Assistant to copy the URL.
        try {
            const ae = document.activeElement;
            if (ae && root.contains(ae) && (ae.tagName === "INPUT" || ae.tagName === "SELECT" || ae.tagName === "TEXTAREA")) return;
            if (root._hovered) return;
        } catch {}
        body.innerHTML = "";

        // ---- Home Assistant ----
        body.appendChild(el("div", H, "HOME ASSISTANT"));
        try {
            const s = await jget("/ha/status");
            if (!s.configured) {
                body.appendChild(el("div", { color: "#fb6" }, "Not configured"));
                const urlIn = el("input", { width: "100%", margin: "3px 0", padding: "3px", boxSizing: "border-box", background: "#0b1422", border: "1px solid #356", color: "#cde", fontSize: "10px" }); urlIn.type = "text"; urlIn.placeholder = "http://homeassistant.local:8123";
                // v627 — pre-fill the default HA URL. homeassistant.local:8123 is the
                // standard mDNS address for a default install, so most users just
                // need to paste the token. Editable if their HA lives elsewhere.
                urlIn.value = "http://homeassistant.local:8123";
                const tokIn = el("input", { width: "100%", margin: "3px 0", padding: "3px", boxSizing: "border-box", background: "#0b1422", border: "1px solid #356", color: "#cde", fontSize: "10px" }); tokIn.type = "password"; tokIn.placeholder = "long-lived access token";
                const save = el("div", { padding: "4px 8px", border: "1px solid #6cf", borderRadius: "3px", cursor: "pointer", textAlign: "center", fontSize: "10px", background: "rgba(100,200,255,0.1)" }, "Save HA config");
                const msg = el("div", { ...DIM, marginTop: "2px" }, "creds are written to ai-bridge/ha.config.json");
                save.addEventListener("click", async () => {
                    if (!urlIn.value.trim() || !tokIn.value.trim()) { msg.textContent = "enter URL + token"; msg.style.color = "#fb6"; return; }
                    msg.textContent = "saving…"; msg.style.color = "#cde"; save.style.pointerEvents = "none";
                    try { const r = await jpost("/ha/config", { url: urlIn.value.trim(), token: tokIn.value.trim() }); msg.textContent = r.ok ? "saved — reconnecting…" : ("✗ " + (r.error || "failed")); }
                    catch (e) { msg.textContent = "✗ " + e.message; msg.style.color = "#f88"; }
                    save.style.pointerEvents = ""; setTimeout(refresh, 700);
                });
                body.appendChild(urlIn); body.appendChild(tokIn); body.appendChild(save); body.appendChild(msg);
            } else if (!s.available) {
                body.appendChild(line("status", "unreachable", "#f88"));
                if (s.error) body.appendChild(el("div", { ...DIM, color: "#f88" }, s.error));
            } else {
                body.appendChild(line("status", "reachable ✓", "#9f8"));
                if (s.version) body.appendChild(line("version", s.version));
                if (s.url) body.appendChild(line("url", s.url));
                // entity breakdown
                // v701 — better 502 / transient-error handling. The /ha/states
                // endpoint can return 502 when HA itself is overloaded or
                // when a backend integration (Enphase, etc.) times out. Show
                // the actual error + offer a Retry button instead of a
                // generic "unavailable" line. Cache last-good count so the
                // panel doesn't lose information across transient failures.
                const entCacheKey = "voxelengine.haEntityCount.v1";
                try {
                    const ents = await jget("/ha/states");
                    const list = Array.isArray(ents) ? ents : (ents.states || ents.entities || []);
                    const byDom = {};
                    for (const e of list) { const d = e.domain || String(e.entity_id || "").split(".")[0] || "?"; byDom[d] = (byDom[d] || 0) + 1; }
                    body.appendChild(line("entities", String(list.length)));
                    try { localStorage.setItem(entCacheKey, JSON.stringify({ count: list.length, ts: Date.now() })); } catch {}
                    const top = Object.entries(byDom).sort((a, b) => b[1] - a[1]).slice(0, 6);
                    if (top.length) body.appendChild(el("div", DIM, top.map(([d, n]) => `${d}:${n}`).join("  ")));
                } catch (e) {
                    // Surface the actual HTTP status when possible; the
                    // jget wrapper throws "HTTP 502" etc.
                    const errMsg = String(e?.message || e);
                    const m502 = /HTTP\s+5\d\d/i.test(errMsg);
                    body.appendChild(el("div", { color: m502 ? "#fb6" : "#f88" }, m502
                        ? "HA states: " + errMsg + " (bridge or HA overloaded; common when Enphase or another integration times out)"
                        : "HA states unavailable — " + errMsg.slice(0, 120)
                    ));
                    // Cached last-good count, if any (rides through transient 5xx)
                    try {
                        const cached = JSON.parse(localStorage.getItem(entCacheKey) || "null");
                        if (cached && cached.count) {
                            const ageMin = Math.round((Date.now() - (cached.ts || 0)) / 60000);
                            body.appendChild(el("div", DIM, `last good: ${cached.count} entities · ${ageMin}m ago`));
                        }
                    } catch {}
                    // Retry button — re-fires the full panel refresh
                    const retry = el("div", { ...BTN, marginTop: "4px", fontSize: "10px" }, "↻ Retry");
                    retry.addEventListener("click", () => { try { refresh(); } catch {} });
                    body.appendChild(retry);
                }
            }
        } catch (e) {
            body.appendChild(el("div", { color: "#f88" }, "bridge /ha not responding"));
        }

        // ---- Discovered on the LAN (true mDNS) ----
        body.appendChild(el("div", H, "DISCOVERED (mDNS)"));
        try {
            const m = await jget("/net/mdns");
            if (!m.available) {
                body.appendChild(el("div", { color: "#fb6" }, "discovery off"));
                if (m.lastError) body.appendChild(el("div", DIM, m.lastError));
                if ((m.lastError || "").includes("not installed")) {
                    const inst = el("div", { marginTop: "4px", padding: "4px 8px", border: "1px solid #6cf", borderRadius: "3px", cursor: "pointer", textAlign: "center", fontSize: "10px", background: "rgba(100,200,255,0.1)" }, "Install bonjour-service");
                    const imsg = el("div", { ...DIM, marginTop: "2px" }, "");
                    inst.addEventListener("click", async () => {
                        imsg.textContent = "installing… (~30s, leave this open)"; imsg.style.color = "#cde"; inst.style.pointerEvents = "none";
                        try { const r = await jpost("/setup/install", { package: "bonjour-service" }); imsg.textContent = r.ok ? "installed — starting discovery…" : ("✗ " + (r.error || "failed")); }
                        catch (e) { imsg.textContent = "✗ " + e.message; imsg.style.color = "#f88"; }
                        inst.style.pointerEvents = ""; setTimeout(refresh, 1000);
                    });
                    body.appendChild(inst); body.appendChild(imsg);
                }
            } else {
                const ha = m.ha || [];
                if (ha.length) {
                    for (const h of ha) body.appendChild(line("HA found", (h.url || h.host) + (h.version ? " (v" + h.version + ")" : ""), "#9f8"));
                    body.appendChild(el("div", DIM, "↳ add this to ai-bridge/ha.config.json if not configured"));
                } else {
                    body.appendChild(el("div", DIM, "no HA advertised on the LAN yet"));
                }
                const others = (m.services || []).filter(s => s.type !== "home-assistant");
                if (others.length) {
                    const byType = {};
                    for (const s of others) byType[s.type] = (byType[s.type] || 0) + 1;
                    body.appendChild(line("other services", String(others.length)));
                    body.appendChild(el("div", DIM, Object.entries(byType).map(([t, n]) => `${t}:${n}`).join("  ")));
                }
            }
        } catch (e) {
            body.appendChild(el("div", DIM, "(mDNS unavailable)"));
        }

        // ---- Bridge + network / phone reachability ----
        body.appendChild(el("div", H, "BRIDGE & PHONE REACH"));
        try {
            const n = await jget("/net/info");
            body.appendChild(line("bridge", "up ✓ (:" + n.port + ")", "#9f8"));
            const host = location.hostname;
            const isLocal = host === "localhost" || host === "127.0.0.1" || host.startsWith("127.");
            const onLan = (n.lanIps || []).includes(host);

            body.appendChild(line("QR points to", host + ":" + (location.port || n.port), isLocal ? "#f88" : (onLan ? "#9f8" : "#fb6")));
            if (isLocal) {
                body.appendChild(el("div", { color: "#f88", fontSize: "10px", margin: "2px 0" }, "Phones can't reach localhost. The phone-connect QR auto-rewrites to your LAN IP, but to be safe re-open the engine on a LAN URL below."));
            } else if (onLan) {
                body.appendChild(el("div", { color: "#9f8", fontSize: "10px", margin: "2px 0" }, "That's a real LAN IP — a phone on the same Wi-Fi should reach it."));
            } else {
                body.appendChild(el("div", { color: "#fb6", fontSize: "10px", margin: "2px 0" }, "Not one of this PC's detected LAN IPs (VPN/secondary NIC?). Use a LAN URL below."));
            }

            if (n.recommended) { const a = el("a", { color: "#9f8", fontSize: "10px", marginTop: "3px", textDecoration: "underline", cursor: "pointer", display: "block" }, "\u2192 open the engine here: " + n.recommended); try { a.href = n.recommended; a.target = "_blank"; a.rel = "noopener"; } catch {} body.appendChild(a); }
            body.appendChild(el("div", DIM, "all detected addresses:"));
            const ifaces = n.interfaces || (n.lanIps || []).map(a => ({ address: a, iface: "", virtual: false }));
            for (const x of ifaces) {
                const u = "http://" + x.address + ":" + n.port + "/";
                body.appendChild(el("div", { fontSize: "10px", wordBreak: "break-all", color: x.virtual ? "#789" : "#bdf" },
                    u + (x.virtual ? "  (virtual/VPN — phone can't use)" : "") + (x.iface ? "  · " + x.iface : "")));
            }
            // v680 — mdnsAdvertise status. If the engine is publishing
            // itself on Bonjour, show the friendly URL in green so the user
            // knows it's the one to share. If not, fall through to the dim
            // legacy hint so the field still appears.
            const ad = n.mdnsAdvertise;
            if (ad && ad.available && ad.url) {
                body.appendChild(el("div", { color: "#9f8", fontSize: "10px", marginTop: "4px", fontWeight: "700" }, "✓ mDNS published"));
                body.appendChild(el("div", { fontSize: "10px", wordBreak: "break-all", color: "#9f8" }, ad.url));
                body.appendChild(el("div", DIM, "(needs Bonjour/avahi on the client. Apple devices + Android + Linux just work; Windows clients need 'Bonjour Print Services' installed.)"));
            } else if (n.mdns) {
                body.appendChild(el("div", DIM, "mDNS (if supported): " + n.mdns));
                if (ad && ad.lastError) {
                    body.appendChild(el("div", { ...DIM, color: "#fb6" }, "advertise error: " + ad.lastError));
                }
            }

            const lc = n.lastExternalClient;
            if (lc && (Date.now() - lc.at) < 120000) {
                body.appendChild(el("div", { color: "#9f8", fontSize: "10px", marginTop: "4px" }, `✓ a device at ${lc.ip} reached the bridge ${ago(lc.at)}`));
            } else {
                body.appendChild(el("div", { ...DIM, marginTop: "4px" }, "no external device seen yet — scan the QR to confirm reach"));
            }
            body.appendChild(el("div", { ...DIM, marginTop: "4px", fontStyle: "italic" }, "Can't see AP-isolation/guest-VLAN/firewall from here — if a LAN IP still fails, it's a router policy."));
        } catch (e) {
            body.appendChild(el("div", { color: "#f88" }, "/net/info unavailable"));
        }
    }

    refreshBtn.addEventListener("click", refresh);
    // v627 — hover guard so reading the panel (e.g. copying a LAN URL) doesn't
    // get wiped by the auto-poll. refresh() checks root._hovered.
    root.addEventListener("mouseenter", () => { root._hovered = true; });
    root.addEventListener("mouseleave", () => { root._hovered = false; });
    refresh();
    const timer = setInterval(refresh, 30000);
    return { root, refresh, dispose() { clearInterval(timer); } };
}

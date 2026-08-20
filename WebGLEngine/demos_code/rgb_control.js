// demos_code/rgb_control.js — RGB lights control panel. v1.
//
// Drives the bridge's /rgb/* proxy, which fans out to OpenRGB (SDK), OpenRGB
// (CLI), or Home Assistant lights and falls back automatically if one is down.
//   GET  /rgb/status   /rgb/devices
//   POST /rgb/set {id,color}   /rgb/off {id}   /rgb/backend {backend}   /rgb/solar {follow}
//
// UNTESTED against real hardware — configure ai-bridge/rgb.config.json and verify.

let wrap = null, devBox = null, statusLine = null, picker = null;

function el(t, s, x) { const e = document.createElement(t); if (s) Object.assign(e.style, s); if (x != null) e.textContent = x; return e; }
async function jget(u) { const r = await fetch(u, { cache: "no-cache" }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }
async function jpost(u, b) { const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return r.json(); }
const btn = (label, on) => { const b = el("div", { padding: "3px 8px", border: "1px solid #6cf", borderRadius: "3px", cursor: "pointer", background: "rgba(100,200,255,0.1)", fontSize: "10px" }, label); b.addEventListener("click", on); return b; };

export default {
    id: "rgb_control",
    label: "RGB LIGHTS — CONTROL",
    hint: "Turn RGB lights on/off + set colors via OpenRGB or HA, with solar-battery auto mode",
    autoplay: false,
    controls: [
        "Status shows which backend is live (OpenRGB SDK / CLI / HA) — auto-falls-back",
        "Pick a color, then Set it on a device (or All)",
        "Follow solar: tints the lights green→amber→red by battery %",
        "Force a backend with the buttons if auto picks the wrong one",
    ],

    start() {
        wrap = el("div", { position: "absolute", top: "60px", right: "16px", width: "320px", maxHeight: "74vh", overflowY: "auto", zIndex: "9300", background: "rgba(6,12,24,0.92)", border: "1px solid rgba(120,180,255,0.4)", borderRadius: "8px", padding: "10px 12px", color: "#cde", font: "11px ui-monospace, monospace", pointerEvents: "auto" });
        wrap.appendChild(el("div", { fontWeight: "700", color: "#6cf", marginBottom: "4px" }, "RGB LIGHTS"));
        statusLine = el("div", { fontSize: "10px", opacity: "0.85", marginBottom: "6px" }, "checking backends…");
        wrap.appendChild(statusLine);

        // backend force row
        const beRow = el("div", { display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px" });
        for (const [lbl, name] of [["Auto", "auto"], ["OpenRGB SDK", "openrgb_sdk"], ["OpenRGB CLI", "openrgb_cli"], ["HA", "ha"]]) {
            beRow.appendChild(btn(lbl, async () => { statusLine.textContent = "switching to " + name + "…"; try { await jpost("/rgb/backend", { backend: name }); } catch (e) {} refresh(); }));
        }
        wrap.appendChild(beRow);

        // color + global actions
        const row = el("div", { display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" });
        picker = el("input", { width: "44px", height: "26px", padding: "0", border: "1px solid #356", background: "transparent" }); picker.type = "color"; picker.value = "#00ff88";
        row.appendChild(picker);
        row.appendChild(btn("Set All", () => setColor("all")));
        row.appendChild(btn("All Off", () => off("all")));
        wrap.appendChild(row);

        // solar follow
        const solarRow = el("div", { display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", fontSize: "10px" });
        const solarChk = el("input"); solarChk.type = "checkbox"; solarChk.id = "rgb-solar-follow";
        solarChk.addEventListener("change", async () => { try { const r = await jpost("/rgb/solar", { follow: solarChk.checked }); solarChk.checked = !!r.follow; } catch (e) {} });
        const solarLbl = el("label", null, "Follow solar battery (green→red)"); solarLbl.htmlFor = "rgb-solar-follow";
        solarRow.appendChild(solarChk); solarRow.appendChild(solarLbl);
        wrap.appendChild(solarRow);

        devBox = el("div", { borderTop: "1px solid rgba(120,180,255,0.15)", paddingTop: "6px" });
        wrap.appendChild(devBox);
        document.body.appendChild(wrap);

        const refresh = async () => {
            try {
                const s = await jget("/rgb/status");
                const av = s.available || {};
                const tag = (k) => `${k.replace("openrgb_", "OpenRGB ").replace("ha", "HA")}${av[k] ? "✓" : "✗"}`;
                statusLine.innerHTML = "";
                statusLine.textContent = `active: ${s.active || "(none)"} · ${["openrgb_sdk", "openrgb_cli", "ha"].map(tag).join("  ")}`;
                statusLine.style.color = s.active ? "#9f8" : "#f88";
                if (s.config) document.getElementById("rgb-solar-follow").checked = !!s.config.solarFollow;
            } catch (e) { statusLine.textContent = "✗ bridge not responding"; statusLine.style.color = "#f88"; }
            try {
                const { devices } = await jget("/rgb/devices");
                devBox.innerHTML = "";
                if (!devices || !devices.length) { devBox.appendChild(el("div", { opacity: "0.5", fontStyle: "italic" }, "(no devices on this backend)")); return; }
                for (const d of devices) {
                    const r = el("div", { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px", padding: "2px 0" });
                    r.appendChild(el("span", { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, d.name || String(d.id)));
                    const acts = el("div", { display: "flex", gap: "4px", flexShrink: "0" });
                    acts.appendChild(btn("Set", () => setColor(d.id)));
                    acts.appendChild(btn("Off", () => off(d.id)));
                    r.appendChild(acts);
                    devBox.appendChild(r);
                }
            } catch (e) { devBox.innerHTML = ""; devBox.appendChild(el("div", { color: "#f88" }, "devices error: " + e.message)); }
        };
        const setColor = async (id) => { try { const r = await jpost("/rgb/set", { id, color: picker.value }); statusLine.textContent = r.ok ? `✓ set (${r.backend}${r.fellBackFrom ? " — fell back from " + r.fellBackFrom : ""})` : ("✗ " + (r.error || "failed")); } catch (e) { statusLine.textContent = "✗ " + e.message; } };
        const off = async (id) => { try { await jpost("/rgb/off", { id }); } catch (e) {} };

        this._refresh = refresh;
        refresh();
    },

    stop() {
        if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
        wrap = devBox = statusLine = picker = null;
    },
};

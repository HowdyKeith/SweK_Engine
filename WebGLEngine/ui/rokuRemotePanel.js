// ui/rokuRemotePanel.js — v742 — PC-side Roku TV remote panel. Mirrors
// the phone TV Remote → Roku panel: SSDP discover, saved-device list
// (shared with phone via voxelengine.devices.roku localStorage), IP
// input, D-pad / nav / playback keys, quick-launch grid, channel search.
//
// All control flows through the bridge's /roku/exec and /roku/discover
// endpoints (same ECP wire as the phone). Saved-device storage key is
// shared with the phone so devices saved on either side appear on both.

function el(t, s, x) {
    const e = document.createElement(t);
    if (s) Object.assign(e.style, s);
    if (x != null) e.textContent = x;
    return e;
}
async function jpost(u, b) {
    try {
        const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
        return r.json();
    } catch (e) { return { ok: false, error: e.message }; }
}

const H   = { fontWeight: "700", color: "#9cf", fontSize: "11px", margin: "8px 0 3px" };
const DIM = { opacity: "0.7", fontSize: "10px" };
const BTN = {
    padding: "4px 8px",
    border: "1px solid #9cf",
    borderRadius: "3px",
    cursor: "pointer",
    textAlign: "center",
    fontSize: "10px",
    background: "rgba(80,150,200,0.10)",
    margin: "2px 0",
    color: "#cde",
};

// Common Roku channel IDs — same set as the phone panel's SHIELD_APPS
// equivalent for Roku. ECP launch needs the numeric channel ID.
const ROKU_APPS = [
    { id: "551012", name: "Hulu",       emoji: "🟢" },
    { id: "12",     name: "Netflix",    emoji: "🔴" },
    { id: "13",     name: "Prime Video",emoji: "🔵" },
    { id: "837",    name: "YouTube",    emoji: "📺" },
    { id: "61322",  name: "HBO Max",    emoji: "🟣" },
    { id: "291097", name: "Disney+",    emoji: "🌟" },
    { id: "151908", name: "Apple TV",   emoji: "🍎" },
    { id: "73376",  name: "Pluto TV",   emoji: "📻" },
    { id: "2285",   name: "Vudu",       emoji: "🎬" },
];

export function mountRokuRemotePanel() {
    const root = el("div", {
        width: "280px",
        color: "#cde",
        font: "11px ui-monospace, monospace",
        padding: "6px",
        background: "rgba(8,16,28,0.92)",
        border: "1px solid rgba(120,200,255,0.25)",
        borderRadius: "6px",
        maxHeight: "85vh",
        overflowY: "auto",
    });
    root.setAttribute("data-ui-panel", "1");

    // Status line at top
    const status = el("div", { color: "#cde", fontSize: "10px", marginBottom: "6px", minHeight: "14px" }, "—");
    function setStatus(msg, color){ status.textContent = msg; status.style.color = color || "#cde"; }
    root.appendChild(status);

    // IP input
    root.appendChild(el("div", H, "Roku IP"));
    const ipRow = el("div", { display: "flex", gap: "4px", alignItems: "center" });
    const ip = el("input", { flex: "1", padding: "3px 5px", background: "#0b1422", border: "1px solid #356", color: "#cde", fontSize: "11px" });
    ip.type = "text";
    ip.value = localStorage.getItem("voxelengine.rokuIp") || "";
    ip.placeholder = "192.168.x.x";
    ip.addEventListener("change", () => localStorage.setItem("voxelengine.rokuIp", ip.value.trim()));
    ipRow.appendChild(ip);
    root.appendChild(ipRow);

    // Saved devices (shared key with phone: voxelengine.devices.roku)
    const devKey = "voxelengine.devices.roku";
    const devRow = el("div", { display: "flex", gap: "4px", marginTop: "4px", alignItems: "center" });
    devRow.appendChild(el("span", DIM, "Saved:"));
    const devSel = el("select", { flex: "1", padding: "2px 4px", background: "#0b1422", border: "1px solid #356", color: "#cde", fontSize: "11px" });
    devRow.appendChild(devSel);
    const devSave = el("div", { ...DIM, padding: "2px 6px", cursor: "pointer", border: "1px solid #356", borderRadius: "3px", fontSize: "11px" }, "💾");
    devSave.title = "Save current IP with a name";
    const devDel  = el("div", { ...DIM, padding: "2px 6px", cursor: "pointer", border: "1px solid #356", borderRadius: "3px", fontSize: "11px" }, "🗑");
    devDel.title = "Delete selected";
    devRow.appendChild(devSave); devRow.appendChild(devDel);
    root.appendChild(devRow);

    function devLoad(){ try { return JSON.parse(localStorage.getItem(devKey) || "[]"); } catch { return []; } }
    function devStore(list){ try { localStorage.setItem(devKey, JSON.stringify(list)); } catch {} }
    function devRender(){
        const list = devLoad();
        devSel.innerHTML = "";
        const none = el("option"); none.value = ""; none.textContent = "(custom)";
        devSel.appendChild(none);
        list.forEach(d => {
            const o = el("option"); o.value = d.ip; o.textContent = d.name + "  ·  " + d.ip;
            devSel.appendChild(o);
        });
        const match = list.find(d => d.ip === ip.value.trim());
        devSel.value = match ? ip.value.trim() : "";
    }
    devSel.addEventListener("change", () => {
        if (devSel.value) {
            ip.value = devSel.value;
            localStorage.setItem("voxelengine.rokuIp", devSel.value);
            setStatus("→ " + (devSel.selectedOptions[0]?.textContent || devSel.value), "#9cf");
        }
    });
    devSave.addEventListener("click", () => {
        const v = ip.value.trim();
        if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) { setStatus("type a valid IP first", "#f88"); return; }
        const name = prompt("Name for this Roku:", "Roku " + v);
        if (!name) return;
        const list = devLoad();
        const idx = list.findIndex(d => d.ip === v);
        if (idx >= 0) list[idx] = { name, ip: v }; else list.push({ name, ip: v });
        devStore(list); devRender(); devSel.value = v;
        setStatus("saved as " + name, "#9f8");
    });
    devDel.addEventListener("click", () => {
        if (!devSel.value) { setStatus("pick a saved device first", "#fa8"); return; }
        const list = devLoad().filter(d => d.ip !== devSel.value);
        devStore(list); devRender();
        setStatus("deleted", "#9cf");
    });
    devRender();

    // Discover
    const discoverBtn = el("div", BTN, "🔍 Find Rokus on LAN");
    discoverBtn.title = "SSDP multicast out every network interface + a direct port-8060 scan of each /24 subnet (finds Rokus even when multicast is blocked). Takes a few seconds.";
    discoverBtn.addEventListener("click", async () => {
        setStatus("scanning subnets…", "#9cf");
        discoverBtn.style.opacity = "0.5";
        try {
            const r = await fetch("/roku/discover");
            const j = await r.json();
            discoverBtn.style.opacity = "1";
            if (!j.ok || !j.devices?.length) {
                const sn = (j.scannedSubnets || []).join(", ") || "none";
                setStatus(`No Rokus found (${j.elapsedMs}ms). Scanned: ${sn}. If your Roku is on another subnet, add its IP manually below.`, "#fa8");
                return;
            }
            setStatus(`Found ${j.count} · ${j.elapsedMs}ms`, "#9f8");
            for (const d of j.devices) {
                if (devLoad().find(x => x.ip === d.ip)) continue;
                const list = devLoad();
                list.push({ name: d.name || "Roku " + d.ip, ip: d.ip });
                devStore(list);
            }
            devRender();
        } catch (e) {
            discoverBtn.style.opacity = "1";
            setStatus("discover err: " + e.message, "#f88");
        }
    });
    root.appendChild(discoverBtn);

    // Helper to send key/launch/search via the bridge
    async function rokuExec(body) {
        const ipv = ip.value.trim();
        if (!ipv) { setStatus("enter Roku IP first", "#f88"); return null; }
        const j = await jpost("/roku/exec", { ip: ipv, ...body });
        if (!j.ok) setStatus("err: " + (j.error || "?"), "#f88");
        return j;
    }

    // D-Pad (Home / Back / Up / Down / Left / Right / Select)
    root.appendChild(el("div", H, "D-Pad"));
    const padRow1 = el("div", { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "3px" });
    const padRow2 = el("div", { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "3px", marginTop: "3px" });
    const padRow3 = el("div", { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "3px", marginTop: "3px" });
    const mkKey = (label, key, title) => {
        const b = el("div", { ...BTN, padding: "6px 4px" }, label);
        if (title) b.title = title;
        b.addEventListener("click", () => rokuExec({ action: "key", key }));
        return b;
    };
    padRow1.appendChild(mkKey("🏠", "Home",   "Home"));
    padRow1.appendChild(mkKey("⬆",  "Up",     "Up"));
    padRow1.appendChild(mkKey("←",  "Back",   "Back"));
    padRow2.appendChild(mkKey("⬅",  "Left",   "Left"));
    padRow2.appendChild(mkKey("OK", "Select", "Select / OK"));
    padRow2.appendChild(mkKey("➡",  "Right",  "Right"));
    padRow3.appendChild(mkKey("ℹ",  "Info",   "Info / *"));
    padRow3.appendChild(mkKey("⬇",  "Down",   "Down"));
    padRow3.appendChild(mkKey("↩",  "InstantReplay", "Instant Replay"));
    root.appendChild(padRow1);
    root.appendChild(padRow2);
    root.appendChild(padRow3);

    // Playback
    root.appendChild(el("div", H, "Playback"));
    const playRow = el("div", { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "3px" });
    playRow.appendChild(mkKey("⏮", "Rev",   "Rewind"));
    playRow.appendChild(mkKey("⏯", "Play",  "Play / Pause"));
    playRow.appendChild(mkKey("⏭", "Fwd",   "Fast-forward"));
    playRow.appendChild(mkKey("⏹", "Power", "Power toggle (some TVs)"));
    root.appendChild(playRow);

    // Power & Volume (PowerOn wakes the TV before a cast)
    root.appendChild(el("div", H, "Power & Volume"));
    const pvRow = el("div", { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: "3px" });
    pvRow.appendChild(mkKey("⏻", "PowerOn", "Power ON / wake the TV"));
    pvRow.appendChild(mkKey("⭘", "PowerOff", "Power OFF"));
    pvRow.appendChild(mkKey("🔇", "VolumeMute", "Mute"));
    pvRow.appendChild(mkKey("🔉", "VolumeDown", "Volume down"));
    pvRow.appendChild(mkKey("🔊", "VolumeUp", "Volume up"));
    root.appendChild(pvRow);

    // Quick launch grid — real installed channels (with icons) once loaded,
    // common-app list as the fallback before then.
    const lh = el("div", { ...H, display: "flex", justifyContent: "space-between", alignItems: "center" });
    lh.appendChild(el("span", {}, "Quick launch"));
    const loadApps = el("span", { ...DIM, cursor: "pointer", border: "1px solid #356", borderRadius: "3px", padding: "1px 6px", fontSize: "10px" }, "⟳ installed");
    loadApps.title = "List the channels actually installed on this Roku, with their real icons";
    lh.appendChild(loadApps);
    root.appendChild(lh);
    const launchGrid = el("div", { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "3px" });
    root.appendChild(launchGrid);

    function renderApps(apps, withIcons) {
        launchGrid.innerHTML = "";
        for (const app of apps) {
            const b = el("div", { ...BTN, padding: "5px 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", minHeight: "36px", justifyContent: "center" });
            if (withIcons) {
                const img = el("img", { width: "30px", height: "auto", borderRadius: "3px", pointerEvents: "none" });
                img.src = "/roku/icon?ip=" + encodeURIComponent(ip.value.trim()) + "&id=" + encodeURIComponent(app.id);
                img.onerror = () => { try { img.remove(); } catch {} };
                b.appendChild(img);
            }
            b.appendChild(el("div", { fontSize: "9px", lineHeight: "1.1" }, (app.emoji ? app.emoji + " " : "") + app.name));
            b.title = "Launch " + app.name + " (channel " + app.id + ")";
            b.addEventListener("click", () => rokuExec({ action: "launch", appId: app.id }));
            launchGrid.appendChild(b);
        }
    }
    renderApps(ROKU_APPS, false);   // common-app fallback until "installed" is clicked

    loadApps.addEventListener("click", async () => {
        const ipv = ip.value.trim();
        if (!ipv) { setStatus("enter Roku IP first", "#f88"); return; }
        setStatus("loading installed channels…", "#9cf"); loadApps.style.opacity = "0.5";
        const j = await rokuExec({ action: "apps" });
        loadApps.style.opacity = "1";
        if (!j || !j.ok || !j.apps) { setStatus("couldn't list channels", "#f88"); return; }
        let apps = [];
        try {
            const xml = new DOMParser().parseFromString(j.apps, "text/xml");
            apps = [...xml.querySelectorAll("app")].map(a => ({ id: a.getAttribute("id"), name: (a.textContent || "").trim() })).filter(a => a.id && a.name);
        } catch {}
        if (!apps.length) { setStatus("no channels returned", "#fa8"); return; }
        apps.sort((a, b) => a.name.localeCompare(b.name));
        renderApps(apps, true);
        setStatus(apps.length + " channels on this Roku", "#9f8");
    });

    // Search
    root.appendChild(el("div", H, "Search"));
    const searchRow = el("div", { display: "flex", gap: "4px" });
    const searchIn = el("input", { flex: "1", padding: "3px 5px", background: "#0b1422", border: "1px solid #356", color: "#cde", fontSize: "11px" });
    searchIn.type = "text"; searchIn.placeholder = "movie / show / actor";
    const searchGo = el("div", { ...BTN, padding: "3px 8px" }, "🔍 Go");
    searchGo.addEventListener("click", () => {
        const text = (searchIn.value || "").trim();
        if (!text) { setStatus("type a search term first", "#fa8"); return; }
        rokuExec({ action: "search", text });
    });
    searchRow.appendChild(searchIn);
    searchRow.appendChild(searchGo);
    root.appendChild(searchRow);

    // Cast video — push a go2rtc HLS stream (or any HLS/MP4 URL) onto the Roku via
    // ECP /input. Roku has no browser, but it'll play an HTTP video stream natively.
    root.appendChild(el("div", H, "Cast video → Roku"));
    const castHint = el("div", { ...DIM, fontSize: "9.5px", lineHeight: "1.45", marginBottom: "3px" },
        "Plays an HLS/MP4 stream on the TV (H.264 + AAC). Use a go2rtc camera or paste any URL. Wake the TV with ⏻ first.");
    root.appendChild(castHint);
    const g2Row = el("div", { display: "flex", gap: "4px", alignItems: "center" });
    const g2Base = el("input", { flex: "1", padding: "3px 5px", background: "#0b1422", border: "1px solid #356", color: "#cde", fontSize: "10px" });
    g2Base.type = "text";
    g2Base.value = localStorage.getItem("voxelengine.go2rtcBase") || ("http://" + (location.hostname || "127.0.0.1") + ":1984");
    g2Base.placeholder = "http://192.168.x.x:1984";
    g2Base.addEventListener("change", () => localStorage.setItem("voxelengine.go2rtcBase", g2Base.value.trim()));
    const g2List = el("div", { ...BTN, padding: "3px 8px", whiteSpace: "nowrap" }, "List");
    g2List.title = "List cameras on this go2rtc server";
    g2Row.appendChild(g2Base); g2Row.appendChild(g2List);
    root.appendChild(g2Row);
    const camGrid = el("div", { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px", margin: "3px 0" });
    root.appendChild(camGrid);
    const urlRow = el("div", { display: "flex", gap: "4px", marginTop: "2px" });
    const castUrl = el("input", { flex: "1", padding: "3px 5px", background: "#0b1422", border: "1px solid #356", color: "#cde", fontSize: "10px" });
    castUrl.type = "text"; castUrl.placeholder = "…/api/stream.m3u8?src=cam  or  http://…/clip.mp4";
    urlRow.appendChild(castUrl);
    root.appendChild(urlRow);
    const optRow = el("div", { display: "flex", gap: "4px", marginTop: "3px", alignItems: "center" });
    const fmtSel = el("select", { padding: "2px 4px", background: "#0b1422", border: "1px solid #356", color: "#cde", fontSize: "10px" });
    for (const f of ["auto", "hls", "mp4", "dash", "mkv"]) { const o = el("option"); o.value = f; o.textContent = f.toUpperCase(); fmtSel.appendChild(o); }
    fmtSel.title = "Stream format. Auto picks from the URL; if the TV stays black, try forcing HLS or MP4.";
    const castGo = el("div", { ...BTN, flex: "1", padding: "5px 4px", background: "rgba(80,200,140,0.18)" }, "▶ Cast to Roku");
    optRow.appendChild(el("span", DIM, "fmt")); optRow.appendChild(fmtSel); optRow.appendChild(castGo);
    root.appendChild(optRow);
    const viaRow = el("label", { display: "flex", gap: "5px", alignItems: "center", marginTop: "3px", fontSize: "9.5px", color: "#9ab", cursor: "pointer" });
    const viaChk = el("input", {}); viaChk.type = "checkbox";
    viaRow.appendChild(viaChk); viaRow.appendChild(el("span", {}, "via sideloaded VoxelCaster channel (handles images + tricky formats)"));
    root.appendChild(viaRow);

    g2List.addEventListener("click", async () => {
        const base = g2Base.value.trim(); if (!base) { setStatus("enter the go2rtc URL", "#fa8"); return; }
        camGrid.innerHTML = ""; setStatus("listing cameras…", "#9cf"); g2List.style.opacity = "0.5";
        const j = await fetch("/camera/streams?base=" + encodeURIComponent(base)).then(r => r.json()).catch(() => null);
        g2List.style.opacity = "1";
        if (!j || !j.ok || !j.cameras || !j.cameras.length) { setStatus("no cameras (check the go2rtc URL)", "#f88"); return; }
        for (const name of j.cameras) {
            const b = el("div", { ...BTN, padding: "4px 4px", fontSize: "9px" }, "📷 " + name);
            b.addEventListener("click", () => { castUrl.value = base.replace(/\/+$/, "") + "/api/stream.m3u8?src=" + encodeURIComponent(name); setStatus("→ " + name, "#9cf"); });
            camGrid.appendChild(b);
        }
        setStatus(j.cameras.length + " camera(s) — tap one", "#9f8");
    });
    castGo.addEventListener("click", async () => {
        const ipv = ip.value.trim(); if (!ipv) { setStatus("enter Roku IP first", "#f88"); return; }
        const url = castUrl.value.trim(); if (!url) { setStatus("pick a camera or paste a URL", "#fa8"); return; }
        setStatus("casting to Roku…", "#9cf"); castGo.style.opacity = "0.5";
        const j = await jpost("/roku/cast", { ip: ipv, url, format: fmtSel.value, via: viaChk.checked ? "dev" : "input" }).catch(() => null);
        castGo.style.opacity = "1";
        if (j && j.ok) setStatus("▶ casting (" + (j.format || "?") + ") — use ⏯/⏹ to control", "#9f8");
        else setStatus("cast failed: " + ((j && j.error) || "?"), "#f88");
    });

    // Sideload the VoxelCaster channel (one-time: enable Dev Mode on the TV first)
    root.appendChild(el("div", H, "Sideload caster channel"));
    const slHint = el("div", { ...DIM, fontSize: "9.5px", lineHeight: "1.5", marginBottom: "4px" });
    slHint.innerHTML = "One-time, <b>on the TV remote</b>: Home \u00d73, Up \u00d72, Right, Left, Right, Left, Right \u2014 enable Developer Mode, set a <b>dev password</b>, accept, reboot. Then install the channel from here.";
    root.appendChild(slHint);
    const slRow = el("div", { display: "flex", gap: "4px", alignItems: "center" });
    const slPw = el("input", { flex: "1", padding: "3px 5px", background: "#0b1422", border: "1px solid #356", color: "#cde", fontSize: "10px" });
    slPw.type = "password"; slPw.placeholder = "dev password";
    const slGo = el("div", { ...BTN, padding: "4px 8px", whiteSpace: "nowrap" }, "Install channel");
    slRow.appendChild(slPw); slRow.appendChild(slGo);
    root.appendChild(slRow);
    const slAlt = el("div", { ...DIM, fontSize: "9px", marginTop: "3px" });
    slAlt.innerHTML = "No-code alternative: browse to <code style='color:#9fd'>http://" + (ip.value.trim() || "&lt;roku-ip&gt;") + "</code>, log in as <b>rokudev</b>, upload the zip.";
    root.appendChild(slAlt);
    slGo.addEventListener("click", async () => {
        const ipv = ip.value.trim(); if (!ipv) { setStatus("enter Roku IP first", "#f88"); return; }
        const pw = slPw.value; if (!pw) { setStatus("enter the dev password", "#fa8"); return; }
        setStatus("installing channel…", "#9cf"); slGo.style.opacity = "0.5";
        const j = await jpost("/roku/sideload", { ip: ipv, password: pw }).catch(() => null);
        slGo.style.opacity = "1";
        if (j && j.ok) { setStatus("✓ " + (j.message || "installed"), "#9f8"); viaChk.checked = true; }
        else setStatus("install failed: " + ((j && j.error) || "?"), "#f88");
    });

    return { root };
}

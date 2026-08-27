// ui/pageGauges.js — v1685
// Unified top-center gauge dock for non-render pages (Universal Viewer, PDF/Comics, Pip-Boy, HEAD/Face, ...).
// Matches the render view's docked stage (ui/dockedGauges.js): ONE visible row of SVG gauges with up/down scroll,
// the SweK robot, and a nav toolbar — Home (-> the configured SweK home, default server.html) and
// Minimize (-> a "Show SweK Engine" tab). Self-contained: imports svgGaugeSet + swekRobot.
//   <script type="module">import { mountPageGauges } from "/ui/pageGauges.js"; mountPageGauges();</script>
//
// v4051 -- Keith: "move the 2 vertical Home/Minimize buttons from the right side of the dock, to the left of
// the 2 row arrows on the left" -- then "the home / minimize buttons should be the same size as the arrows, so
// they match." Home/Minimize (`rtb`) now sit FIRST in topRow, left of the scroll arrows, and share the scroll
// arrows' own 28px size (`NAV_BTN_SIZE`) rather than the 30px they were built at -- a plain literal mismatch,
// not a deliberate size difference; nothing anywhere read or depended on the two being different.

import { mountSvgGaugeSet } from "./svgGaugeSet.js";
import { createSwekRobot } from "./swekRobot.js";

// "Home" follows the host's configured remote-landing page (default server.html).
function goHome(fallback) {
    fetch("/hosting/landing", { cache: "no-store" })
        .then(r => r.json())
        .then(j => { const pg = (j && j.page) || "server.html"; location.href = "/" + String(pg).replace(/^\/+/, ""); })
        .catch(() => { location.href = fallback || "/server.html"; });
}

function toolBtn(glyph, title, size) {
    const s = size || 30;
    const b = document.createElement("button"); b.textContent = glyph; b.title = title;
    Object.assign(b.style, { width: s + "px", height: s + "px", borderRadius: "7px", cursor: "pointer",
        background: "rgba(20,40,58,0.92)", color: "#bfe6ff", border: "1px solid rgba(90,200,255,0.4)",
        fontSize: (s * 0.46) + "px", lineHeight: "1", display: "flex", alignItems: "center",
        justifyContent: "center", padding: "0", flex: "none" });
    b.addEventListener("mouseenter", () => { b.style.background = "rgba(34,66,92,1)"; });
    b.addEventListener("mouseleave", () => { b.style.background = "rgba(20,40,58,0.92)"; });
    return b;
}

export function mountPageGauges(opts = {}) {
    if (typeof document === "undefined" || document.getElementById("swekPageGauges")) return null;
    const backUrl = opts.backUrl || "/server.html";

    // v1815 — shared interface text-scale. Reads the SAME localStorage key server.html
    // writes ("swek.server.fontScale"), so a size chosen on the server console carries to
    // every no-render page automatically. Applied via body zoom (scales everything,
    // including hardcoded-px elements). With no saved preference, a small laptop screen
    // starts a notch smaller. The A−/A+ control added to the dock below also writes this key.
    const FS_KEY = "swek.server.fontScale", FS_MIN = 70, FS_MAX = 160, FS_STEP = 10;
    function _fsAuto() {
        const h = (window.screen && window.screen.height) || window.innerHeight || 900;
        const w = (window.screen && window.screen.width) || window.innerWidth || 1440;
        if (h <= 720 || w <= 1280) return 80;
        if (h <= 900 || w <= 1440) return 90;
        return 100;
    }
    function _fsLoad() {
        let s = null; try { s = localStorage.getItem(FS_KEY); } catch (e) {}
        if (s === null || isNaN(parseInt(s, 10))) return _fsAuto();
        return Math.min(FS_MAX, Math.max(FS_MIN, parseInt(s, 10)));
    }
    let _fsCur = _fsLoad();
    function _fsApply(scale, persist) {
        scale = Math.min(FS_MAX, Math.max(FS_MIN, scale));
        try { document.body.style.zoom = (scale / 100); } catch (e) {}
        _fsCur = scale;
        if (persist) { try { localStorage.setItem(FS_KEY, String(scale)); } catch (e) {} }
        try { if (_fsVal) { _fsVal.title = "Text size " + scale + "% \u00b7 click to reset to the auto default"; _fsVal.style.color = (scale === 100) ? "#7fb0c8" : "#9fe6c0"; } } catch (e) {}
        return scale;
    }
    let _fsVal = null;   // assigned when the dock control is built below
    _fsApply(_fsCur, false);   // apply saved-or-auto immediately, before the dock renders

    const root = document.createElement("div");
    root.id = "swekPageGauges";
    Object.assign(root.style, {
        position: "fixed", top: "8px", left: "50%", transform: "translateX(-50%)",
        zIndex: "9086", display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px",
        background: "linear-gradient(180deg, rgba(8,14,24,0.88), rgba(4,8,15,0.93))",
        border: "1px solid rgba(90,200,255,0.28)", borderRadius: "12px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)", pointerEvents: "auto", maxWidth: "94vw", overflow: "hidden",
        fontFamily: "ui-monospace,monospace",
    });

    // v4051 -- ONE shared size for every small nav button in this dock (scroll arrows, Home, Minimize), so
    // "make X match Y" is a fact about the constant rather than four literals that can drift apart again.
    const NAV_BTN_SIZE = 28;

    // scroll up / down (shown only when there is more than one row of gauges)
    const scrollBtns = document.createElement("div");
    Object.assign(scrollBtns.style, { display: "none", flexDirection: "column", gap: "5px", alignSelf: "center" });
    const upBtn = toolBtn("\u25B2", "Scroll gauges up", NAV_BTN_SIZE);
    const dnBtn = toolBtn("\u25BC", "Scroll gauges down", NAV_BTN_SIZE);
    scrollBtns.append(upBtn, dnBtn);

    // single-row gauge viewport: a clip that shows one row; the grid translates to reveal the other row(s)
    const clip = document.createElement("div");
    Object.assign(clip.style, { overflow: "hidden", display: "flex", alignItems: "flex-start" });
    const gaugeHost = document.createElement("div");
    Object.assign(gaugeHost.style, { display: "flex", alignItems: "flex-start", transition: "transform 0.3s ease" });
    clip.appendChild(gaugeHost);

    const robot = createSwekRobot();
    // v1690 — page robots see a DIFFERENT stream than the engine/server: no toast bus here, so watch the host's peer
    // list. A new peer -> wave; the host going unreachable -> a one-time flash (connection lost).
    try {
        let _lastPeers = -1, _down = false;
        setInterval(function () {
            fetch("/sync/peers", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
                _down = false;
                const n = ((j && j.peers) || []).length;
                if (_lastPeers >= 0 && n > _lastPeers) { try { robot.play && robot.play("wave"); } catch (e) {} try { pushTick("new peer joined \u2014 " + n + " on the LAN"); } catch (e) {} }
                else if (n !== _lastPeers) { try { pushTick(n + " peer" + (n === 1 ? "" : "s") + " on the LAN"); } catch (e) {} }
                _lastPeers = n;
            }).catch(function () { if (!_down) { _down = true; try { robot.flashError && robot.flashError(); } catch (e) {} try { pushTick("host unreachable"); } catch (e) {} } });
        }, 12000);
    } catch (e) {}

    // v1877 — font control is its own vertical toolbar, placed to the RIGHT of the Home toolbar
    // (rightmost). Layout: A+ (top) · "Font" label · A− (bottom). Shares the server.html size key.
    const fsCol = document.createElement("div");
    Object.assign(fsCol.style, { display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", alignSelf: "center", flex: "none" });
    const _fsMk = (txt, sz, title) => { const b = document.createElement("button"); b.textContent = txt; b.title = title; Object.assign(b.style, { font: sz + "px ui-monospace,monospace", lineHeight: "1", padding: "3px 7px", background: "rgba(20,40,55,0.7)", color: "#cfe9d8", border: "1px solid rgba(90,200,255,0.28)", borderRadius: "4px", cursor: "pointer" }); return b; };
    const fsUp = _fsMk("A+", 13, "Larger text");
    const fsLbl = document.createElement("span");
    Object.assign(fsLbl.style, { font: "8px ui-monospace,monospace", color: "#7fb0c8", letterSpacing: "0.12em", textAlign: "center", cursor: "pointer", userSelect: "none", lineHeight: "1" });
    fsLbl.textContent = "FONT"; fsLbl.title = "Text size " + _fsCur + "% · click to reset to the auto default";
    _fsVal = fsLbl;   // the % readout now lives on the label's title/tooltip; the label doubles as the reset target
    const fsDown = _fsMk("A\u2212", 11, "Smaller text");
    fsUp.addEventListener("click", () => _fsApply(_fsCur + FS_STEP, true));
    fsDown.addEventListener("click", () => _fsApply(_fsCur - FS_STEP, true));
    fsLbl.addEventListener("click", () => { try { localStorage.removeItem(FS_KEY); } catch (e) {} _fsApply(_fsAuto(), false); });
    fsCol.append(fsUp, fsLbl, fsDown);

    // v4051 -- WAS the right toolbar; moved to sit left of the scroll arrows (Keith's own words), and
    // sized to match them (was 30px against the arrows' 28px -- a mismatch nobody had asked for).
    const rtb = document.createElement("div");
    Object.assign(rtb.style, { display: "flex", flexDirection: "column", gap: "5px", alignSelf: "center" });
    const homeBtn = toolBtn("\u2302", "Home \u2014 back to SweK Engine home", NAV_BTN_SIZE);
    homeBtn.addEventListener("click", () => goHome(backUrl));
    const minBtn = toolBtn("\u2013", "Minimize gauges", NAV_BTN_SIZE);
    rtb.append(homeBtn, minBtn);

    // robot + its name caption (the robot IS the avatar; its name is the computer's, Title Case e.g. "Galaxina")
    const robotCol = document.createElement("div");
    Object.assign(robotCol.style, { display: "flex", flexDirection: "column", alignItems: "center", gap: "1px", flex: "none" });
    const nameLabel = document.createElement("div");
    Object.assign(nameLabel.style, { font: "10px ui-monospace,monospace", color: "#bfe6ff", letterSpacing: "0.04em", maxWidth: "96px", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
    robotCol.append(robot.el, nameLabel);
    function _titleCase(x) { return String(x || "").toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
    try { fetch("/self/whoami", { cache: "no-store" }).then(r => r.json()).then(j => { if (j && j.name) { const nm = _titleCase(j.name); nameLabel.textContent = nm; try { robot.el.title = nm; } catch (e) {} } }).catch(() => {}); } catch (e) {}

    // the gauges + avatar live in a top row; a scrolling ticker sits underneath them (same as our other avatar tickers)
    const topRow = document.createElement("div");
    Object.assign(topRow.style, { display: "flex", alignItems: "center", gap: "10px" });
    // v4051 -- rtb (Home/Minimize) FIRST: "move the 2 vertical Home/Minimize buttons from the right side of
    // the dock, to the left of the 2 row arrows on the left." Was scrollBtns, clip, robotCol, rtb, fsCol.
    topRow.append(rtb, scrollBtns, clip, robotCol, fsCol);

    const ticker = document.createElement("div");
    Object.assign(ticker.style, { display: "flex", alignItems: "center", gap: "6px", marginTop: "2px", paddingTop: "3px", borderTop: "1px solid rgba(90,200,255,0.18)", overflow: "hidden" });
    const tickClip = document.createElement("div");
    Object.assign(tickClip.style, { flex: "1", minWidth: "0", overflow: "hidden", position: "relative", height: "15px" });
    const tickText = document.createElement("div");
    Object.assign(tickText.style, { position: "absolute", whiteSpace: "nowrap", left: "0", top: "0", lineHeight: "15px", fontSize: "11px", color: "#9fe6c0", willChange: "transform" });
    tickText.textContent = "SweK Engine";
    tickClip.appendChild(tickText); ticker.appendChild(tickClip);

    root.style.flexDirection = "column"; root.style.alignItems = "stretch";
    root.append(topRow, ticker);
    document.body.appendChild(root);

    // ticker feed + right-to-left marquee (matches the server.html / demo tickers)
    var _tickQ = [], _tickX = 0, _tickW = 0, _tickCur = "";
    function pushTick(msg) { if (!msg) return; _tickQ.push(String(msg)); if (_tickQ.length > 30) _tickQ.shift(); }
    function _tickScroll() {
        var cw = tickClip.clientWidth || 180;
        if (_tickCur === "" || _tickX <= -(_tickW + 20)) { _tickCur = _tickQ.shift() || _tickCur || "SweK Engine"; tickText.textContent = _tickCur; _tickW = tickText.scrollWidth || 60; _tickX = cw; }
        _tickX -= 0.7; tickText.style.transform = "translateX(" + _tickX + "px)"; requestAnimationFrame(_tickScroll);
    }
    requestAnimationFrame(_tickScroll);
    try { pushTick("SweK Engine v" + (window.ENGINE_VERSION || "")); } catch (e) {}
    try { window.swekPageTick = pushTick; } catch (e) {}

    // minimized tab
    const pill = document.createElement("div");
    pill.textContent = "\u25B2 Show SweK Engine"; pill.title = "Show the SweK Engine gauges + nav";
    Object.assign(pill.style, {
        position: "fixed", top: "0", left: "50%", transform: "translateX(-50%)",
        zIndex: "9087", cursor: "pointer", display: "none", padding: "3px 12px", borderRadius: "0 0 8px 8px",
        font: "10px ui-monospace,monospace", background: "rgba(8,14,24,0.92)", color: "#bfe6ff",
        border: "1px solid rgba(90,200,255,0.3)", borderTop: "none",
    });
    document.body.appendChild(pill);
    const showDock = () => { root.style.display = "flex"; pill.style.display = "none"; measure(); };
    const hideDock = () => { root.style.display = "none"; pill.style.display = "block"; };
    pill.addEventListener("click", showDock);
    minBtn.addEventListener("click", hideDock);

    // rows + scroll (mirrors ui/dockedGauges.js)
    let rowIdx = 0, rows = 1, rowStep = 0;
    function measure() {
        try {
            const grid = gaugeHost.firstChild;
            if (!grid || !grid.children || !grid.children.length) return;
            const cells = grid.children, cols = 3;
            rows = Math.max(1, Math.ceil(cells.length / cols));
            const cellH = cells[0].offsetHeight || 100;
            rowStep = (cells[cols] ? (cells[cols].offsetTop - cells[0].offsetTop) : cellH);
            clip.style.height = cellH + "px";
            if (rowIdx > rows - 1) rowIdx = 0;
            apply();
            scrollBtns.style.display = (rows > 1) ? "flex" : "none";
        } catch {}
    }
    function apply() { try { gaugeHost.style.transform = "translateY(" + (-rowIdx * rowStep) + "px)"; } catch {} }
    function scroll(dir) { if (rows <= 1) return; rowIdx = (rowIdx + dir + rows) % rows; apply(); }
    upBtn.addEventListener("click", () => scroll(-1));
    dnBtn.addEventListener("click", () => scroll(1));

    let set = null;
    try { set = mountSvgGaugeSet(gaugeHost, { pollMs: 2000, scale: 2, columns: 3 }); set && set.start && set.start(); }
    catch (e) { try { console.warn("[pageGauges] gauge mount failed:", e && e.message); } catch {} }

    try { requestAnimationFrame(() => { measure(); setTimeout(measure, 400); }); } catch { setTimeout(measure, 400); }

    try { window.swekPageGauges = { root: () => root, set: () => set, robot: () => robot, show: showDock, hide: hideDock, scroll }; } catch {}

    // v1916 — the visitor-chat widget rides along with the dock, so it's present on ALL 51 pages that
    // mount page-gauges without a per-page script tag. The widget self-guards: it only renders for a
    // REMOTE (through-tunnel) viewer when visitor chat is enabled, and no-ops otherwise (incl. duplicate
    // loads via window.__swekVisitorChat). Fire-and-forget; a load failure never affects the gauges.
    try {
        if (!window.__swekVisitorChat && !document.querySelector('script[data-swek-visitor-chat]')) {
            var _vc = document.createElement("script");
            _vc.src = "/engine/visitor-chat.js"; _vc.async = true; _vc.setAttribute("data-swek-visitor-chat", "1");
            document.head.appendChild(_vc);
        }
    } catch {}

    return { root, set, robot };
}

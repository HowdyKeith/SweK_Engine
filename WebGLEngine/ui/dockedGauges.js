// ai-bridge sibling: ui/dockedGauges.js — v1675
//
// Top-center docked SVG stage (~1.5in tall x ~4in wide). Sits ABOVE the compass (the compass tucks just under
// it). Shows ONE visible row of SVG gauges (same size as before) with up/down buttons to cycle to the other row,
// the little SweK robot on the same row (turns red on errors), a left toolbar (full-render + scroll up/down), and
// a blue LCARS underbar you click to pop out the full avatar. No 3D here.
//
//   window.dockedGauges.show() / .hide() / .root() / .robot()
//
// The compass (ui/compassWidget.js) looks for #swekDockedGauges and parks just beneath it.

import { mountSvgGaugeSet } from "./svgGaugeSet.js";
import { mountBrainSvg } from "./brainSvg.js";
import { createSwekRobot } from "./swekRobot.js";

let _root = null, _set = null, _timer = 0, _userHidden = false, _restorePill = null;
let _fullBtn = null, _fullOn = false;   // v1770 — the dock starts in its SVG view, so the toolbar button correctly reads "Switch to 3d Render"
let _gaugeHost = null, _gaugeClip = null, _robot = null, _gaugeRow = 0, _rows = 1, _rowStep = 0, _scrollBtns = null;
let _brainHost = null, _brain = null;   // v2727 -- GPU Brain live-mind panel that swaps in for the gauges when active
// v1873 — refs for the in-place SVG↔3D swap: the gauge/avatar row, the avatar column, and the 3D stage host.
let _row = null, _robotCol = null, _stageHost = null, _stage = null, _stageMounting = false, _stageNote = null;

// v1731 — horizontal slide. The dock centers via translateX(-50%); _slideX is a manual nudge (window.dockedGauges.slideX),
// _autoX is an automatic push-right so the dock never hides under the orange demo banner (#demoChrome) when it overlaps.
let _slideX = 0, _autoX = 0;
function _applyPos() { if (_root) { try { _root.style.transform = "translateX(calc(-50% + " + (_slideX + _autoX) + "px))"; } catch {} } }
function _autoNudge() {
    try {
        if (!_root || _root.style.display === "none") return;
        const banner = document.getElementById("demoChrome");
        const saved = _autoX; _autoX = 0; _applyPos();   // measure at the centered position so the nudge can't ratchet
        let want = 0;
        if (banner) {
            const b = banner.getBoundingClientRect(), d = _root.getBoundingClientRect();
            if (b.width && d.width && b.top < d.bottom && b.bottom > d.top) {
                const need = Math.round((b.right + 10) - d.left);   // px to push right to clear the banner + 10px gap
                if (need > 0) want = need;
            }
        }
        _autoX = want; _applyPos(); void saved;
    } catch {}
}
function slideX(px) { _slideX = (+px) || 0; try { localStorage.setItem("voxelengine.dockSlideX", String(_slideX)); } catch {} _applyPos(); }

function _toolBtn(glyph, title, size) {
    const s = size || 28;
    const b = document.createElement("button"); b.textContent = glyph; b.title = title;
    Object.assign(b.style, { width: s + "px", height: s + "px", borderRadius: "7px", cursor: "pointer",
        background: "rgba(20,40,58,0.92)", color: "#bfe6ff", border: "1px solid rgba(90,200,255,0.4)",
        fontSize: (s * 0.5) + "px", lineHeight: "1", display: "flex", alignItems: "center", justifyContent: "center", padding: "0", flex: "none" });
    b.addEventListener("mouseenter", () => { b.style.background = "rgba(34,66,92,1)"; });
    b.addEventListener("mouseleave", () => { b.style.background = "rgba(20,40,58,0.92)"; });
    return b;
}

function _toFullRender() {
    // v1873 — toggle the docked panel IN PLACE between its low-power SVG gauges+avatar and a live 3D
    // stage (the same avatarStage the phone/diorama uses: 3D avatar + 3D ring/gyro/barrel gauges + pet
    // llama), mounted into THIS panel's own row so it fills the exact same docked space. The old wiring
    // only fired an event at the separate demoChrome widget, which isn't visible in the bare sandbox —
    // so clicking appeared to do nothing. Now the swap happens here, in the panel you're looking at.
    _fullOn = !_fullOn;
    if (_fullBtn) {
        _fullBtn.textContent = _fullOn ? "\u25A3" : "\u26F6";
        _fullBtn.title = _fullOn ? "Switch to low-power SVG view" : "Switch to 3d Render";
    }
    // keep the old event too, so demoChrome / renderMode still track the tier (harmless if unused here).
    try { window.dispatchEvent(new CustomEvent(_fullOn ? "swek:dockFullRender" : "swek:dockSvg")); } catch {}
    if (_fullOn) _enter3d(); else _exit3d();
}

// Mount the 3D avatar+gauge stage into the panel's row, hiding the SVG gauges + SVG robot.
function _enter3d() {
    if (!_row) return;
    try { _gaugeClip && (_gaugeClip.style.display = "none"); } catch {}
    try { _robotCol && (_robotCol.style.display = "none"); } catch {}
    if (_stageHost) { _stageHost.style.display = "block"; if (_stage && _stage.setPaused) { try { _stage.setPaused(false); } catch {} } return; }
    if (_stageMounting) return; _stageMounting = true;
    // a canvas sized to roughly the SVG row footprint (fills the same docked space).
    const host = document.createElement("div");
    Object.assign(host.style, { position: "relative", width: "340px", height: "88px", flex: "none", borderRadius: "8px", overflow: "hidden", background: "rgba(6,12,20,0.6)" });
    // v1873b — immediate visible placeholder so clicking the toggle ALWAYS shows a change,
    // even before the GLB/WebGL finishes (or if it fails, this becomes the error text).
    const note = document.createElement("div");
    Object.assign(note.style, { position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 8px",
        font: "11px ui-monospace,monospace", color: "#7fd0ff", letterSpacing: "0.04em", pointerEvents: "none", zIndex: "2" });
    note.textContent = "\u25C8 loading 3D\u2026";
    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block" });
    host.appendChild(canvas); host.appendChild(note);
    // insert where the gauge clip was (front of the row) so layout matches.
    _row.insertBefore(host, _row.firstChild);
    _stageHost = host; _stageNote = note;
    // three gauges (CPU/RAM/GPU) driven from the SVG set's live values; ring/gyro/barrel like the diorama.
    const RGB = { cpu: [1.0, 0.66, 0.2], ram: [0.4, 0.9, 0.5], gpu: [0.7, 0.5, 1.0] };
    const keyFor = (i) => ["cpu", "ram", "gpu"][i] || "cpu";
    const liveVal = (i) => { try { const v = _set && _set.values && _set.values(); if (v) { const k = keyFor(i); return Math.max(0, Math.min(1, (v[k] || 0) / 100)); } } catch {} return 0; };
    const stageGauges = [0, 1, 2].map((i) => ({ style: ["ring", "gyro", "barrel"][i], getValue: () => liveVal(i), color: RGB[keyFor(i)] }));
    import("/face/avatarStage.js").then((mod) => {
        if (!mod || typeof mod.mountStage !== "function") { _fail3d("avatarStage module has no mountStage"); _stageMounting = false; return; }
        try {
            const getScreenCanvas = () => { const sim = document.getElementById("sim"); if (sim && sim.tagName === "CANVAS" && sim !== canvas) return sim; let best = null, area = 0; document.querySelectorAll("canvas").forEach(c => { if (c === canvas) return; const a = (c.width || 0) * (c.height || 0); if (a > area) { area = a; best = c; } }); return best; };
            _stage = mod.mountStage(canvas, { url: "RobotExpressive", gauges: stageGauges, scene: "diorama", compact: true, room: false, getScreenCanvas, selfQuip: true, pet: true });
            if (!_stage || !_stage.ok) { _fail3d("this device/context couldn't start WebGL2 for the 3D stage"); }
            else { if (_stageNote) { _stageNote.style.display = "none"; } try { console.log("[dockedGauges] 3D stage mounted in-panel"); } catch {} }
        } catch (e) { _fail3d((e && e.message) || "3D stage threw on mount"); }
        _stageMounting = false;
    }).catch((e) => { _fail3d("couldn't load avatarStage.js: " + ((e && e.message) || e)); _stageMounting = false; });
}

// Restore the SVG gauges + avatar; pause (keep) the 3D stage so re-entering is instant.
function _exit3d() {
    try { _gaugeClip && (_gaugeClip.style.display = "flex"); } catch {}
    try { _robotCol && (_robotCol.style.display = "flex"); } catch {}
    if (_stageHost) _stageHost.style.display = "none";
    if (_stage && _stage.setPaused) { try { _stage.setPaused(true); } catch {} }   // free the GPU while hidden
}

// If the 3D stage can't mount (no WebGL, load error), show WHY in the panel briefly, then fall
// back to SVG and reset the button — so a failure is visible, never a silent "nothing happened".
function _fail3d(why) {
    try { console.warn("[dockedGauges] 3D stage unavailable:", why || ""); } catch {}
    if (_stageNote && _stageHost) {
        _stageNote.style.display = "flex";
        _stageNote.style.color = "#ffb0b0";
        _stageNote.textContent = "\u26A0 3D unavailable \u2014 " + (why || "staying on SVG");
        // leave the message up for a moment so it's readable, then revert to SVG.
        setTimeout(() => { try { if (_stageHost) { _stageHost.remove(); _stageHost = null; _stageNote = null; } } catch {} _stage = null; _fullOn = false; if (_fullBtn) { _fullBtn.textContent = "\u26F6"; _fullBtn.title = "Switch to 3d Render"; } _exit3d(); }, 2600);
        return;
    }
    try { if (_stageHost) { _stageHost.remove(); _stageHost = null; _stageNote = null; } } catch {}
    _stage = null; _fullOn = false;
    if (_fullBtn) { _fullBtn.textContent = "\u26F6"; _fullBtn.title = "Switch to 3d Render"; }
    _exit3d();
}
function _toFullAvatar() {
    try { window.dispatchEvent(new CustomEvent("swek:dockFullAvatar")); } catch {}
    try { if (window.pip && typeof window.pip.show === "function") window.pip.show(); } catch {}
    // v1678 — keep the dock (and the compass + underbar under it) in place; the full avatar pops out as its own view.
}

function _showRestorePill() {
    if (_restorePill) { _restorePill.style.display = "flex"; return; }
    const p = document.createElement("div"); _restorePill = p;
    p.title = "Show the docked gauges";
    Object.assign(p.style, { position: "fixed", top: "8px", left: "50%", transform: "translateX(-50%)",
        zIndex: "9087", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px",
        padding: "3px 10px", borderRadius: "0 0 8px 8px", font: "10px ui-monospace,monospace",
        background: "linear-gradient(180deg,rgba(8,14,24,0.9),rgba(4,8,15,0.92))",
        color: "#bfe6ff", border: "1px solid rgba(90,200,255,0.3)", borderTop: "none" });
    p.textContent = "\u25B2 Show SweK Engine";
    p.addEventListener("click", () => { p.style.display = "none"; show(); });
    document.body.appendChild(p);
}
// v1685 — "Home" = the configured SweK home (the remote-landing page, default server.html), so it follows the host's pick.
function _goHome() {
    fetch("/hosting/landing", { cache: "no-store" }).then(r => r.json())
        .then(j => { const pg = (j && j.page) || "server.html"; location.href = "/" + String(pg).replace(/^\/+/, ""); })
        .catch(() => { location.href = "/server.html"; });
}

// Measure the gauge grid (mounted into _gaugeHost) and clip the view to a single row; remember the row step so
// the up/down buttons can cycle through the rows. Runs after mount + a frame so layout is settled.
function _measureRows() {
    try {
        const grid = _gaugeHost && _gaugeHost.firstChild;
        if (!grid || !grid.children || !grid.children.length) return;
        const cells = grid.children, cols = 3;
        _rows = Math.max(1, Math.ceil(cells.length / cols));
        const cellH = cells[0].offsetHeight || 100;
        _rowStep = (cells[cols] ? (cells[cols].offsetTop - cells[0].offsetTop) : cellH);
        _gaugeClip.style.height = cellH + "px";
        if (_gaugeRow > _rows - 1) _gaugeRow = 0;
        _applyScroll();
        if (_scrollBtns) _scrollBtns.style.display = (_rows > 1) ? "flex" : "none";
    } catch {}
}
function _applyScroll() {
    try { _gaugeHost.style.transform = "translateY(" + (-_gaugeRow * _rowStep) + "px)"; } catch {}
}
function _scroll(dir) {
    if (_rows <= 1) return;
    _autoReverting = false;   // v1838 — a manual scroll cancels the peers-row auto-revert
    if (_peerRowTimer) { clearTimeout(_peerRowTimer); _peerRowTimer = null; }
    _gaugeRow = (_gaugeRow + dir + _rows) % _rows;   // cycle
    _applyScroll();
}

// v1838 — when the SweK PEERS or SweK REMOTES count changes, drop the row that contains those
// gauges into view for 30s, then fall back to the system/CPU row (row 0). Finds the peers row
// from the live gauge order (cells are laid 3-per-row) rather than hardcoding, so it still works
// if the user reordered their gauges. Manual up/down scrolling cancels the auto-revert.
let _peerRowTimer = null, _autoReverting = false;
function _rowOfSource(src) {
    try {
        const grid = _gaugeHost && _gaugeHost.firstChild;
        if (!grid || !grid.children) return -1;
        const cells = grid.children;
        for (let i = 0; i < cells.length; i++) {
            const c = cells[i];
            // each gauge cell carries its source (data attr set by svgGaugeSet); fall back to label text.
            const s = (c.getAttribute && c.getAttribute("data-source")) || "";
            const txt = (c.textContent || "").toUpperCase();
            if (s === src || (src === "swekpeers" && /SWEK PEERS/.test(txt)) || (src === "swekremotepeers" && /SWEK REMOTES/.test(txt))) {
                return Math.floor(i / 3);
            }
        }
    } catch {}
    return -1;
}
function _showPeerRowThenRevert() {
    if (_rows <= 1) return;   // single row: nothing to swap
    let peerRow = _rowOfSource("swekpeers");
    if (peerRow < 0) peerRow = _rowOfSource("swekremotepeers");
    if (peerRow < 0) return;
    if (_gaugeRow !== peerRow) { _gaugeRow = peerRow; _applyScroll(); }
    _autoReverting = true;
    if (_peerRowTimer) { clearTimeout(_peerRowTimer); }
    _peerRowTimer = setTimeout(() => {
        _peerRowTimer = null;
        if (!_autoReverting) return;   // user scrolled manually — leave them where they are
        _autoReverting = false;
        // fall back to the system row (the one holding CPU), or row 0.
        let cpuRow = _rowOfSource("cpu"); if (cpuRow < 0) cpuRow = 0;
        _gaugeRow = cpuRow; _applyScroll();
    }, 30000);
}

export function mountDockedGauges() {
    if (_root) return;
    _root = document.createElement("div");
    _root.id = "swekDockedGauges";
    Object.assign(_root.style, {
        position: "fixed", top: "0px", left: "50%", transform: "translateX(-50%)",
        boxSizing: "border-box", display: "none", flexDirection: "column", gap: "0", maxWidth: "94vw",
        background: "linear-gradient(180deg, rgba(8,14,24,0.86), rgba(4,8,15,0.92))",
        border: "1px solid rgba(90,200,255,0.28)", borderRadius: "12px 12px 7px 7px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)", zIndex: "9086", pointerEvents: "auto", overflow: "hidden",
    });

    const row = document.createElement("div");
    Object.assign(row.style, { display: "flex", alignItems: "flex-start", gap: "12px", padding: "5px 14px 6px" });   // v1731/1732 - 5px top gap + top-align
    _row = row;

    // single-row gauge viewport: a clip that shows one row; the grid translates to reveal the other row(s)
    _gaugeClip = document.createElement("div");
    Object.assign(_gaugeClip.style, { overflow: "hidden", display: "flex", alignItems: "flex-start" });
    _gaugeHost = document.createElement("div");
    Object.assign(_gaugeHost.style, { display: "flex", alignItems: "flex-start", transition: "transform 0.3s ease" });
    _gaugeClip.appendChild(_gaugeHost);

    _robot = createSwekRobot();
    // v1690 - the engine robot reacts to the engine's own event stream (toasts): peer/sync/error/success.
    try { window.toast && window.toast.subscribe && window.toast.subscribe(function (text, kind) { try { _robot && _robot.react && _robot.react({ msg: text, level: kind }); } catch (e) {} }); } catch (e) {}

    // v1731/1732 - avatar + its computer-name caption (Title Case, e.g. "Galaxina"; /self/whoami). v1732: same font/size as
    // the dial captions + a dark pill, lifted with -NAME_OVERLAP so it overlaps the robot (and keeps overlapping as it drifts).
    const NAME_OVERLAP = 16;   // px the name rides up over the robot; bump if it covers too much/little
    const robotCol = document.createElement("div");
    Object.assign(robotCol.style, { display: "flex", flexDirection: "column", alignItems: "center", gap: "0", flex: "none" });
    _robotCol = robotCol;
    const nameLabel = document.createElement("div");
    Object.assign(nameLabel.style, { position: "relative", zIndex: "2", marginTop: (-NAME_OVERLAP) + "px",
        fontSize: "14px", fontFamily: "ui-monospace,monospace", color: "#bfe6ff", letterSpacing: "0.04em",
        background: "rgba(4,7,12,0.72)", padding: "0 6px", borderRadius: "3px", lineHeight: "1.2",
        maxWidth: "120px", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: "0 1px 1px rgba(0,0,0,0.9)" });
    robotCol.append(_robot.el, nameLabel);
    const _titleCase = (x) => String(x || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    try { fetch("/self/whoami", { cache: "no-store" }).then(r => r.json()).then(j => { if (j && j.name) { const nm = _titleCase(j.name); nameLabel.textContent = nm; try { _robot.el.title = nm; } catch (e) {} } }).catch(() => {}); } catch (e) {}

    // v1732 - gauges + avatar only; the chrome buttons moved to the bar below, freeing the row of its side toolbars.
    row.append(_gaugeClip, robotCol);

    // v1732 - the blue underbar now carries the chrome: SVG/3D toggle + gauge scroll on the left, Home + Minimize on the
    // right. Clicking the empty center still pops the full avatar (buttons stopPropagation so they don't pop it).
    const bar = document.createElement("div");
    Object.assign(bar.style, { height: "20px", display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: "6px", padding: "0 6px", background: "linear-gradient(90deg,#155a92,#2bd6ff,#155a92)",
        borderTop: "1px solid rgba(120,220,255,0.6)" });

    const barLeft = document.createElement("div");
    Object.assign(barLeft.style, { width: "40px", flex: "none" });   // v1766 - empty spacer; chrome moved to the gauge-row toolbar
    const fullBtn = _toolBtn(_fullOn ? "\u25A3" : "\u26F6", _fullOn ? "Switch to low-power SVG view" : "Switch to 3d Render", 16);
    _fullBtn = fullBtn;
    fullBtn.addEventListener("click", (e) => { e.stopPropagation(); _toFullRender(); });
    _scrollBtns = document.createElement("div");
    Object.assign(_scrollBtns.style, { display: "none", flexDirection: "column", alignItems: "center", gap: "4px" });
    const upBtn = _toolBtn("\u25B2", "Scroll gauges up", 16);
    const dnBtn = _toolBtn("\u25BC", "Scroll gauges down", 16);
    upBtn.addEventListener("click", (e) => { e.stopPropagation(); _scroll(-1); });
    dnBtn.addEventListener("click", (e) => { e.stopPropagation(); _scroll(1); });
    _scrollBtns.append(upBtn, dnBtn);
    // v1766 - SVG/3D toggle + gauge scroll moved OFF the bar to a vertical toolbar to the LEFT of the gauges.
    const toolCol = document.createElement("div");
    Object.assign(toolCol.style, { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", flex: "none", paddingTop: "2px" });
    toolCol.append(fullBtn, _scrollBtns);
    row.prepend(toolCol);

    const barCenter = document.createElement("div");
    Object.assign(barCenter.style, { flex: "1", minWidth: "0", textAlign: "center", cursor: "pointer", color: "#04121c",
        fontSize: "9px", fontWeight: "700", letterSpacing: "0.14em", fontFamily: "ui-monospace,monospace", whiteSpace: "nowrap", overflow: "hidden" });
    barCenter.textContent = "\u25AC\u25AC  FULL AVATAR  \u25AC\u25AC";
    barCenter.title = "Click to pop out the full 3D avatar";
    barCenter.addEventListener("click", _toFullAvatar);
    barCenter.addEventListener("mouseenter", () => { bar.style.filter = "brightness(1.18)"; });
    barCenter.addEventListener("mouseleave", () => { bar.style.filter = ""; });

    const barRight = document.createElement("div");
    Object.assign(barRight.style, { display: "flex", alignItems: "center", gap: "4px", flex: "none" });
    const homeBtn = _toolBtn("\u2302", "Home \u2014 back to SweK Engine home", 16);
    homeBtn.addEventListener("click", (e) => { e.stopPropagation(); _goHome(); });
    const minBtn = _toolBtn("\u2013", "Minimize gauges", 16);
    minBtn.addEventListener("click", (e) => { e.stopPropagation(); hide(); _showRestorePill(); });
    barRight.append(homeBtn, minBtn);

    bar.append(barLeft, barCenter, barRight);

    _root.append(row, bar);
    document.body.appendChild(_root);

    try { _set = mountSvgGaugeSet(_gaugeHost, { pollMs: 2000, scale: 2, columns: 3 }); _set && _set.start && _set.start(); }
    catch (e) { try { console.warn("[dockedGauges] gauge mount failed:", e && e.message); } catch {} }

    // v2727 -- when the GPU Brain is active, swap the gauges out for the live-mind SVG (the avatar stays). Fail-safe:
    // any error leaves the gauges up. The brain panel polls /ai/brain/health itself; onActive toggles visibility.
    try {
      _brainHost = document.createElement("div");
      _brainHost.className = "swek-brain-panel";
      _brainHost.style.cssText = "display:none;align-items:center;justify-content:center;";
      if (_gaugeHost && _gaugeHost.parentNode) _gaugeHost.parentNode.insertBefore(_brainHost, _gaugeHost.nextSibling);
      _brain = mountBrainSvg(_brainHost, { pollMs: 2500, onActive: (active) => {
        try { _brainHost.style.display = active ? "flex" : "none"; if (_gaugeHost) _gaugeHost.style.display = active ? "none" : ""; } catch {}
      }});
    } catch (e) { try { console.warn("[dockedGauges] brain panel mount failed:", e && e.message); } catch {} }

    // measure once layout settles (and again shortly after, for late SVG layout)
    try { requestAnimationFrame(() => { _measureRows(); setTimeout(_measureRows, 400); }); } catch { setTimeout(_measureRows, 400); }

    // v1731 — apply any saved manual slide, then auto-nudge off the orange banner once layout settles + on resize.
    try { _slideX = parseFloat(localStorage.getItem("voxelengine.dockSlideX")) || 0; } catch {}
    _applyPos();
    try { requestAnimationFrame(() => { _autoNudge(); setTimeout(_autoNudge, 500); }); } catch {}
    try { window.addEventListener("resize", () => { try { _autoNudge(); } catch {} }); } catch {}

    try { show(); } catch {}   // v1737 - show on mount (engine view); was gated on the compass widget
    // v1838 — listen for peer/remote count changes (emitted by svgGaugeSet.poll) and surface the peers row.
    try { window.addEventListener("swek:peercount", () => { try { _showPeerRowThenRevert(); } catch {} }); } catch {}
    _tick();
    try { console.log("[dockedGauges v1874] docked stage ready (1-row + scroll, robot on row; in-place 3D toggle) \u2014 window.dockedGauges.show()/hide()/robot()"); } catch {}
}

function _compassPresent() {
    try { const d = window._compassWidget && window._compassWidget._dom; if (d) { const r = d.getBoundingClientRect(); if (r && r.height > 0) return true; } } catch {}
    return false;
}

function _emitDock(active) { try { window.dispatchEvent(new CustomEvent(active ? "swek:dockActive" : "swek:dockInactive")); } catch {} }

function _tick() {
    // v1737 - dock visibility is no longer tied to the compass widget (which moved into the peer radar). The dock is
    // shown on mount (engine view) and controlled by show()/hide() + the minimize button; _tick only nudges its position.
    try { _autoNudge(); } catch {}
    _timer = setTimeout(() => { try { requestAnimationFrame(_tick); } catch { _tick(); } }, 1000);
}

function show() { _userHidden = false; if (_root) _root.style.display = "flex"; if (_restorePill) _restorePill.style.display = "none"; _emitDock(true); _measureRows(); try { if (_fullOn && _stage && _stage.setPaused) _stage.setPaused(false); } catch {} }
function hide() { _userHidden = true; if (_root) _root.style.display = "none"; try { if (_fullOn && _stage && _stage.setPaused) _stage.setPaused(true); } catch {} }

try { window.dockedGauges = { mount: mountDockedGauges, show, hide, root: () => _root, robot: () => _robot, scroll: _scroll, slideX }; } catch {}

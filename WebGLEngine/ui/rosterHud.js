// ============================================================================
// ui/rosterHud.js
//
// Round 179 — tiny floating progress indicator for the headless roster
// runner. Auto-shows whenever the runner is active AND no full roster
// demo overlay is currently mounted. Auto-hides on run end + idle.
//
// Why it exists: the round-179 headless mode lets the user close the
// roster demo and keep the run going. Without this HUD they'd have
// no visual confirmation that the run is still happening — they'd
// just see materials and meshes appearing in the engine and would
// have to switch back to the demo to check progress (which in this
// codebase REGENERATES the world, so not ideal).
//
// The HUD is informational only — it doesn't click-through to open
// the demo (switching demos here is destructive). Users can run an
// engine-side demo (kaiju, ogre, alien_swarm) and watch the kaiju
// fill in with new materials and meshes as the roster lands them.
//
// Layout: bottom-left corner, opposite the parallax preview which
// lives bottom-right.
// ============================================================================

import { rosterRunner } from "../ai/RosterRunner.js";

let hud = null;
let rafId = null;
let _wasActive = false;

function _styleHud() {
    return `
        position:fixed; left:18px; bottom:18px; z-index:10001;
        background:rgba(15,15,15,0.95); color:#ccc; border:1px solid #8aff9e44;
        border-radius:6px; padding:8px 12px; font-family:monospace; font-size:11px;
        box-shadow:0 4px 16px rgba(0,0,0,0.5);
        display:flex; gap:10px; align-items:center;
    `;
}

function _ensure() {
    // Hide if the roster demo overlay is mounted (it shows everything
    // we'd show, plus more)
    const demoMounted = !!document.querySelector("#entries_grid");
    if (demoMounted) {
        if (hud) { hud.remove(); hud = null; }
        return;
    }
    // Hide if never been active this session
    if (!rosterRunner.isActive() && !_wasActive) {
        if (hud) { hud.remove(); hud = null; }
        return;
    }
    // Hide ~3s after a finished run becomes idle
    if (!rosterRunner.isActive() && _wasActive
        && rosterRunner.runStart > 0
        && (performance.now() - rosterRunner.runStart) > 3000
        && !rosterRunner.getStates().some(s => s.status === "ok" || s.status === "fail")) {
        // Edge case: theme was changed mid-display, no completed entries.
        // Just hide.
        if (hud) { hud.remove(); hud = null; }
        return;
    }
    if (!hud) {
        hud = document.createElement("div");
        hud.id = "roster-hud";
        hud.style.cssText = _styleHud();
        hud.title = "Roster runner status (headless mode — round 179)";
        document.body.appendChild(hud);
    }
}

function _render() {
    if (!hud) return;
    const theme = rosterRunner.getTheme();
    if (!theme) { hud.innerHTML = "ROSTER · no theme"; return; }
    const { acquired, total } = rosterRunner.counts();
    const active = rosterRunner.isActive();
    const elapsed = rosterRunner.elapsedSec();
    const elapsedStr = active ? `${elapsed.toFixed(0)}s`
        : (rosterRunner.runStart > 0
            ? `${((performance.now() - rosterRunner.runStart) / 1000).toFixed(0)}s ✓`
            : "");
    const dotColor = active ? "#ffd884" : (acquired > 0 ? "#8aff9e" : "#888");

    hud.innerHTML = `
        <span style="color:${dotColor}; font-weight:bold;">● ROSTER</span>
        <span style="color:#aaa;">${theme.displayName.replace(/\s*\(.*$/, "")}</span>
        <span style="color:#8aff9e; font-weight:bold;">${acquired}/${total}</span>
        ${elapsedStr ? `<span style="color:#888;">·</span><span style="color:#aaa;">${elapsedStr}</span>` : ''}
    `;
}

function _tick() {
    rafId = requestAnimationFrame(_tick);
    if (rosterRunner.isActive()) _wasActive = true;
    _ensure();
    _render();
}

rosterRunner.addListener((event) => {
    if (event.type === "run-start") _wasActive = true;
    _ensure();
    _render();
});

export const rosterHud = {
    init() {
        if (!rafId) rafId = requestAnimationFrame(_tick);
    },
};

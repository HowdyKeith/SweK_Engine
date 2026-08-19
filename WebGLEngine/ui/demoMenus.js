// FILE: ui/demoMenus.js
// VERSION: v1 (EngineProject v598)
//
// Per-demo contextual rail. The world-building menus — Civs, Kaiju, Assets,
// Narrative, Gallery, and the planet/atmosphere cycler — should only appear in
// the demos they actually apply to, instead of cluttering every stage (incl.
// the blank sandbox).
//
// Wiring (in main.js):
//   import { applyDemoMenus, setDemoMenuRefs } from "./ui/demoMenus.js";
//   setDemoMenuRefs({ dock });                 // once, after the dock is built
//   applyDemoMenus(demoManager.current);       // once at startup
//   ...and applyDemoMenus(next) inside demoManager.setById() on every switch.
//
// Rules (per the design):
//   kaiju demo          → Civs, Kaiju, Assets, Narrative, Gallery, Planets
//   OGRE demo           → all of the above EXCEPT Kaiju
//   FPS / single-player → Assets, Gallery, Planets (no Civs, no Kaiju)
//   DOOM / WAD demo     → DOOM panel only
//   blank / sandbox / sims / anything else → none (clean stage)
//
// Dock tabs (Civs/Kaiju/Assets are dock panels) toggle via the Dock API.
// Free-standing minitabs (Narrative/Gallery) and the planet cycler are matched
// by their visible label / the window._spaceTab handle. The DOOM panel is the
// .doom-mode-panel element.

let _refs = { dock: null, spaceTab: null };

export function setDemoMenuRefs(refs) { _refs = { ..._refs, ...refs }; }

export function classifyDemo(demo) {
    if (!demo) return "other";
    const hay = (String(demo.id || "") + " " + String(demo.label || "")).toLowerCase();
    if (/wad|doom/.test(hay)) return "doom";
    if (demo.kaijuSim === true || /\bkaiju\b/.test(hay)) return "kaiju";
    if (/ogre/.test(hay)) return "ogre";
    if (/fps|first.?person|single.?player|shooter|deathmatch/.test(hay)) return "fps";
    return "other";
}

// Which contextual menus each demo class is allowed to show.
const POLICY = {
    kaiju: new Set(["civs", "kaiju", "assets", "narrative", "gallery", "planets"]),
    ogre:  new Set(["civs", "assets", "narrative", "gallery", "planets"]),
    fps:   new Set(["assets", "gallery", "planets"]),
    doom:  new Set(["doom"]),
    other: new Set(),
};

// Match a free-standing minitab by a substring of its visible label.
function minitabByLabel(substr) {
    const want = substr.toLowerCase();
    for (const el of document.querySelectorAll(".lcars-minitab")) {
        if ((el.textContent || "").toLowerCase().includes(want)) return el;
    }
    return null;
}
function showEl(el, vis) { if (el) el.style.display = vis ? "" : "none"; }

export function applyDemoMenus(demo) {
    const cls = classifyDemo(demo);
    const allow = POLICY[cls] || POLICY.other;
    const dock = _refs.dock;

    // Civs / Kaiju / Assets are dock panels.
    if (dock && dock.setVisible) {
        dock.setVisible("civs",   allow.has("civs"));
        dock.setVisible("kaiju",  allow.has("kaiju"));
        dock.setVisible("assets", allow.has("assets"));
        if (dock.reflow) dock.reflow();
    }

    // Narrative / Gallery are free-standing minitabs (matched by label).
    showEl(minitabByLabel("narrative"), allow.has("narrative"));
    showEl(minitabByLabel("gallery"),   allow.has("gallery"));

    // Planet / atmosphere cycler — main.js exposes window._spaceTab.
    showEl(_refs.spaceTab || (typeof window !== "undefined" && window._spaceTab) || null, allow.has("planets"));

    // DOOM panel + any DOOM tab — only on the DOOM/WAD demo.
    showEl(minitabByLabel("doom"), allow.has("doom"));
    if (!allow.has("doom")) {
        const dp = document.querySelector(".doom-mode-panel");
        if (dp) dp.style.display = "none";
    }

    try { console.log(`[demoMenus] ${demo?.id ?? "?"} → ${cls}: ${[...allow].join(", ") || "(clean)"}`); } catch (e) {}
}

// WebGLEngine/render/subAquariumLabel.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is render/subAquariumLabel-selfcheck.mjs; nextRounds fly-kind-peer-registration
// and fish-pilot-tank-kind, 2026-11-17)
//
// WHAT FLIES THIS SUB, AS THE TANK'S LIST SAYS IT. Before this the row said "stateful", "network" or "PD autopilot", so a sub whose circuit the page had not registered (a peer's fly
// sub before the circuit loaded, a fish sub on a page without the fish kind) or whose kind refused its weights read "PD autopilot" -- true of what flew it, silent about why.
// Pure: a snapshot record in, a short string out.
"use strict";
export const KIND_NAMES = Object.freeze({ flycx: "stateful", fish: "zebrafish" });
/** The label of a tank snapshot record (render/subAquariumSim.mjs's snapshot: circuit, kind, kindError, waiting, pilot). */
export function pilotLabel(s) {
    if (s.kind) return KIND_NAMES[s.kind] || s.kind;
    if (s.kindError) return `PD autopilot (${s.circuit} refused: ${String(s.kindError).slice(0, 60)})`;
    if (s.waiting) return `PD autopilot, waiting for its kind (${s.circuit})`;
    return s.pilot === "network" && (s.circuit === undefined || s.circuit === "gfc") ? "network" : "PD autopilot";
}

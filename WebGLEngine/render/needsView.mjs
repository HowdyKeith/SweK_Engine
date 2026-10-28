// WebGLEngine/render/needsView.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE LIST LINE OF A SUB WITH NEEDS (render/subAquariumSim.mjs's `needs` event, physics/mechanics/subNeeds.mjs): what a page writes under the sub: the charge and the hull class, the draw, whether it is on the refill trip or charging (and exposed on a snorkel), the hull's strain
// against its collapse depth, the damage and the flooding. A snapshot row's `needs` is { cls, frac, energy, capacity, watts, refilling, charging, exposed, strain, damage, flood, collapseDepth, depth, pressure, canRefill, pump, repair, repairing (v4905) }, or null. Pure: no DOM.
"use strict";

const CLASS_NAMES = Object.freeze({ battery: "battery", snorkel: "battery + snorkel", airIndependent: "air-independent", unlimited: "unlimited" });
const pct = (v) => (Number.isFinite(v) ? Math.round(v * 100) : 0);

/** The line for a snapshot row, or "" for a row with no needs. */
export function needsLine(row) {
    const n = row && row.needs;
    if (!n) return "";
    const kw = Number.isFinite(n.watts) ? (n.watts / 1000).toFixed(1) : "0.0";
    const charge = n.cls === "unlimited" ? "charge unlimited" : `charge ${pct(n.frac)}%`;
    const trip = n.refilling ? " · REFILLING" : "", on = n.charging ? ` · charging${n.exposed ? " (exposed)" : ""}` : "";
    // v4905 -- the pump and the repair, only when they are asked for: the repair waits for the surface and a near stop, and says so
    const pump = n.pump > 0 ? ` · pump ${pct(n.pump)}%` : "", repair = n.repair > 0 ? ` · repair ${pct(n.repair)}%${n.repairing ? "" : " (waits for the surface)"}` : "";
    return `${CLASS_NAMES[n.cls] || n.cls} · ${charge} · ${kw} kW${trip}${on} · hull ${n.strain.toFixed(2)} of ${Math.round(n.collapseDepth)} m · damage ${pct(n.damage)}% · flood ${(n.flood * 100).toFixed(1)}%${pump}${repair}`;
}

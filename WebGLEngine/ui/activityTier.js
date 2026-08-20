// FILE: ui/activityTier.js
// VERSION: v1 — round 361
//
// Bucketizes a 0..100 utilization value into one of three named tiers
// used by the Ollama panel + future widgets to replace the EKG-style
// ticker. The tiers map nicely to ambient activity language: rocking
// (idle, low burn), walking (moderate steady load), sprinting (heavy
// hot load).
//
// Thresholds are intentionally generous on the "walking" side because
// real GPUs spend most of their time there during light inference;
// "sprinting" is reserved for sustained > 50% util.

export const TIERS = {
    rocking: {
        label: "ROCKING",
        color: "#8aff9e",
        bg:    "rgba(60, 130, 80, 0.35)",
        glyph: "🪑",
        description: "idle / waiting",
    },
    walking: {
        label: "WALKING",
        color: "#ffd884",
        bg:    "rgba(180, 140, 60, 0.35)",
        glyph: "🚶",
        description: "moderate steady load",
    },
    sprinting: {
        label: "SPRINTING",
        color: "#ff8aff",
        bg:    "rgba(180, 80, 180, 0.35)",
        glyph: "🏃",
        description: "heavy hot load",
    },
    unknown: {
        label: "—",
        color: "#666",
        bg:    "rgba(50, 50, 50, 0.35)",
        glyph: "·",
        description: "no signal",
    },
};

/**
 * Given a utilization percent (0..100) return the tier key.
 *
 * @param {number|null|undefined} utilPct
 * @returns {"rocking"|"walking"|"sprinting"|"unknown"}
 */
export function tierForUtil(utilPct) {
    if (utilPct === null || utilPct === undefined || !Number.isFinite(utilPct)) return "unknown";
    if (utilPct < 10)  return "rocking";
    if (utilPct < 50)  return "walking";
    return "sprinting";
}

/** Convenience: full tier descriptor object given a util percent. */
export function tierInfoForUtil(utilPct) {
    return TIERS[tierForUtil(utilPct)];
}

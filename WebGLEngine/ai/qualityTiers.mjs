// WebGLEngine/ai/qualityTiers.mjs -- v4299 (Level 12)
//
// THE LAST TYPED ORDERING, DERIVED. ai/AutoQualityController.js has walked `TIER_ORDER = ["fast", "balanced",
// "quality"]  // ascending difficulty` since v643 -- a claim about cost that nobody measured, named as the
// remainder in tools/ship/shaderComplexity-selfcheck.mjs at Level 11. A tier is a set of knobs; each knob that is
// ON pulls a shader into the frame; render/shaderComplexity.mjs scores shaders. So a tier's cost is the sum of
// the encoded scores of the shaders its knobs switch on, and the order is a sort, not a list.
//
// *** balanced AND quality TIE, AND THE TIE IS THE TRUTH. *** Their knob sets are identical ({ bloom: true });
// the controller's own header says the reload-only knobs that would separate them are "documented as future
// tiers". A typed order hid that; a derived one breaks the tie by name and SAYS it is a tie, so the day a knob
// separates them the order can change without anybody editing an array.
"use strict";
import { complexityOf } from "../render/shaderComplexity.mjs";

/** Which shader source each knob switches on. Data: a gate reads it back and a reader can dispute a line. */
export const KNOB_SHADERS = Object.freeze({
    bloom: Object.freeze(["render/bloomPass.js"]),
});

/** The cost of one tier's knob set: the sum of the complexity scores of every shader an ON knob pulls in. */
export function tierCost(knobs, readShader) {
    let score = 0; const shaders = [];
    for (const [knob, on] of Object.entries(knobs || {})) {
        if (!on) continue;
        for (const rel of KNOB_SHADERS[knob] || []) {
            const src = readShader(rel);
            // No reader (a page without the file): an ON knob still costs SOMETHING, so the order stays sane
            // -- one point per shader it would pull in -- and the row says the score is a stand-in.
            if (src == null) { score += 1; shaders.push({ knob, shader: rel, score: 1, class: null, standIn: true }); continue; }
            const c = complexityOf(src); score += c.score; shaders.push({ knob, shader: rel, score: c.score, class: c.class });
        }
    }
    return { score, shaders };
}

/**
 * The tiers in ASCENDING cost, derived. Ties break by name and are reported as ties, never silently ordered.
 * `readShader(rel)` returns the shader module's text (a page fetches; a gate reads the file) or null.
 */
export function tierOrder(tierKnobs, readShader) {
    const rows = Object.keys(tierKnobs).map((name) => ({ name, ...tierCost(tierKnobs[name], readShader) }));
    rows.sort((a, b) => (a.score - b.score) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const ties = [];
    for (let i = 1; i < rows.length; i++) if (rows[i].score === rows[i - 1].score) ties.push([rows[i - 1].name, rows[i].name]);
    return { order: rows.map((r) => r.name), rows, ties };
}

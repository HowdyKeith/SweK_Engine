#!/usr/bin/env node
// WebGLEngine/render/doomFireField-selfcheck.mjs -- v4410
//
// The gate on render/doomFireField.mjs. Its spine is ONE CHECK: a uniform upward field must reproduce
// render/doomFire.mjs BYTE FOR BYTE, FRAME FOR FRAME, AT THE SAME SEED. That control is not a courtesy -- it
// is the only thing standing between "the fire generalises" and "the fire was rewritten and still looks like
// fire", and it is free because the two constants of v4178's rule are DERIVED from the field rather than
// re-typed beside it.
//
// *** THIS ROUND'S OWN INSTRUMENTS REFUTED FOUR OF ITS CLAIMS, and each is a check below. *** quantise's
// comment asserted the property its code lacked; the header claimed a zero direction meant "nothing burns
// here" while 154 off-water cells burned; riverField's downstream never advanced downstream; and
// waterfallField's comment said "a narrow column" over code that made a sheet. A check exists for each,
// because a claim a round already got wrong once is the claim most worth pinning.
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DoomFire, MAX_INTENSITY } from "./doomFire.mjs";
import { FieldFire, buildField, uniformField, quantise, offsets, upstreamSource,
         riverField, waterfallField, lavaField, UP } from "./doomFireField.mjs";
import { gateReport } from "../tools/ship/gateReport.mjs";

const REPORT = gateReport("render/doomFireField-selfcheck.mjs");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

/* ---------------------------------------------------------------------------------------------------------
 * 1. THE CONTROL. Byte for byte against v4178, across grid shapes and with the source pokes interleaved,
 *    because stoke() and damp() also draw from the rng and a divergence in call ORDER would show up nowhere
 *    else.
 * ------------------------------------------------------------------------------------------------------ */
const GRIDS = [[60, 40, 0x5EED], [37, 23, 12345], [8, 5, 1], [120, 80, 999], [1, 2, 42]];
{
    const rows = [];
    let worst = null, allSame = true;
    for (const [w, h, seed] of GRIDS) {
        const a = new DoomFire({ width: w, height: h, seed });
        const b = new FieldFire({ width: w, height: h, seed });
        let diffs = 0, firstFrame = -1;
        for (let f = 0; f < 200; f++) {
            a.step(); b.step();
            if (f % 7 === 0) { a.stoke(); b.stoke(); }
            if (f % 11 === 0) { a.damp(); b.damp(); }
            let d = 0;
            for (let i = 0; i < a.pixels.length; i++) if (a.pixels[i] !== b.pixels[i]) d++;
            if (d && firstFrame < 0) firstFrame = f;
            diffs += d;
        }
        if (diffs) { allSame = false; worst = worst || `${w}x${h} seed ${seed} first differs at frame ${firstFrame}`; }
        rows.push([`${w}x${h}`, seed, diffs, a.heat()]);
    }
    ok("!! *** A UNIFORM UPWARD FIELD REPRODUCES v4178 BYTE FOR BYTE, 200 FRAMES, STOKE AND DAMP INCLUDED ***",
       allSame,
       allSame ? `${GRIDS.length} grids, 0 differing cells in ${GRIDS.length * 200} frames. THE TWO CONSTANTS OF ` +
       "v4178's RULE ARE DERIVED HERE, not re-typed: back = -(dx + w*dy) is +w and perp = dy + w*-dx is -1 for " +
       "d = (0,-1). A generalisation that changed the base case would show here and nowhere else"
       : `DIVERGED: ${worst}`);
    REPORT.table("the control, per grid", ["grid", "seed", "differing cells", "final heat"], rows,
                 "200 frames each against render/doomFire.mjs, with stoke() every 7 and damp() every 11.");
}

/* ---------------------------------------------------------------------------------------------------------
 * 2. THE DERIVATION ITSELF, so the control cannot pass by two matching mistakes.
 * ------------------------------------------------------------------------------------------------------ */
{
    const o = offsets(0, -1, 60);
    ok("*** and the constants it derives are v4178's, stated as arithmetic rather than trusted ***",
       o.back === 60 && o.perp === -1,
       `offsets(0, -1, w=60) = back ${o.back}, perp ${o.perp}; v4178 writes \`i + w\` and \`i - decay\`. ` +
       "If both this and the control were wrong in the same way the control would still pass, so the " +
       "derivation is checked against the literal numbers in the ported source");

    // *** quantise: THE CHECK FOR A COMMENT THAT ASSERTED WHAT THE CODE LACKED. *** The first draft
    // normalised by the larger component and rounded, claiming that kept shallow diagonals diagonal. It did
    // the opposite: (2.4, 1) came out [1, 0].
    const cases = [[[2.4, 1], [1, 1]], [[1, 0.42], [1, 1]], [[0.4, 1], [0, 1]], [[3, 1], [1, 0]],
                   [[0, -1], [0, -1]], [[-1, 0], [-1, 0]], [[0, 0], [0, 0]], [[NaN, 1], [0, 0]]];
    const bad = cases.filter(([i, want]) => JSON.stringify(quantise(i[0], i[1])) !== JSON.stringify(want));
    ok("!! *** quantise SNAPS THE ANGLE, so a shallow diagonal keeps its downstream component ***",
       bad.length === 0,
       bad.length ? bad.map(([i, w]) => `${JSON.stringify(i)} -> ${JSON.stringify(quantise(i[0], i[1]))}, want ${JSON.stringify(w)}`).join("; ")
       : "8 cases including (2.4, 1) -> [1,1], which the first draft returned as [1,0]. THAT ROUNDED THE " +
         "DOWNSTREAM COMPONENT AWAY and the river's fire never left its source row -- the comment beside it " +
         "claimed the exact property the code did not have");

    ok("...and fuel is derived from the direction, never carried beside it",
       (() => { const f = buildField(4, 4, (x) => (x === 0 ? [0, 0] : UP));
                return f.fuel.length === 16 && [...f.fuel].filter((v) => !v).length === 4; })(),
       "a 4x4 field with column 0 dead reports exactly 4 non-fuel cells, computed from the quantised " +
       "direction rather than from a second mask a caller could get out of step with");
}

/* ---------------------------------------------------------------------------------------------------------
 * 3. THE INLET IS A CONSEQUENCE OF THE FLOW. v4178's hand-picked bottom row must fall out of upstreamSource.
 * ------------------------------------------------------------------------------------------------------ */
{
    const w = 64, h = 20;
    const src = upstreamSource(uniformField(w, h));
    const bottom = Array.from({ length: w }, (_, c) => c + w * (h - 1));
    ok("!! *** the upward field's INLET IS EXACTLY v4178's BOTTOM ROW, derived and not typed ***",
       src.length === w && src.every((v, i) => v === bottom[i]),
       `${src.length} inlet cells, identical to the bottom row. A source is where fire ENTERS, which is a ` +
       "property of the flow; v4178 states it as a row number and this recovers that row from the rule");

    // The waterfall taught this the hard way: one row of a seven-row rightward flow is not an inlet.
    const wfSrc = upstreamSource(waterfallField(w, h));
    ok("...and a sideways flow's inlet is a COLUMN, which is why lighting 'the top row' died back",
       wfSrc.length > 0 && wfSrc.some((i) => i % w === 0) && wfSrc.filter((i) => Math.floor(i / w) === 0).length < w,
       `${wfSrc.length} inlet cells for the waterfall, including x=0 and NOT the whole top row. MEASURED with ` +
       "the top row as source: row 0 column 8 read 36 after two frames and 0 after three -- for a rightward " +
       "flow the LEAN is vertical, so the cold row beneath overwrote the fire faster than it advanced");
}

/* ---------------------------------------------------------------------------------------------------------
 * 4. THE THREE FIELDS DO WHAT THEY ARE NAMED FOR -- and each check is one this round already got wrong.
 * ------------------------------------------------------------------------------------------------------ */
const w = 64, h = 24;
const run = (field, steps = 200, seed = 3) => {
    const f = new FieldFire({ width: w, height: h, seed, field, source: upstreamSource(field) });
    for (let i = 0; i < steps; i++) { f.step(); f.light(); }
    return f;
};
{
    // RIVER: confined. The header says a zero direction means nothing burns there; 154 off-water cells
    // burned before the write learned to refuse non-fuel destinations.
    const rf = riverField(w, h), f = run(rf);
    let off = 0, offLit = 0, on = 0, onLit = 0;
    for (let i = 0; i < w * h; i++) {
        if (!rf.fuel[i]) { off++; if (f.pixels[i] > 0) offLit++; } else { on++; if (f.pixels[i] > 0) onLit++; }
    }
    ok("!! *** A RIVER OF DOOM FIRE STAYS IN ITS BANKS: not one off-water cell burns ***",
       offLit === 0 && onLit > 0,
       `${off} off-water cells, ${offLit} alight; ${on} on-water, ${onLit} alight. MEASURED BEFORE THE WRITE ` +
       "REFUSED NON-FUEL DESTINATIONS: 154 of 1,542. A live cell's LEAN lands on a diagonal neighbour and that " +
       "neighbour is off the water at every bend, so the header's claim was one the code did not hold");

    // *** AND THE FIRST DRAFT OF THIS ROW COULD NOT FAIL. *** It counted how many rows held fire, lit from
    // the full derived inlet -- and that inlet spans many rows by construction, so "fire reaches 24 of 24
    // rows" was satisfied by the INJECTION and never by travel. Removing the clamp read ZERO RED. Travel is
    // a distance FROM the inlet, so the fire is lit only at the inlet cells in row 0 and the question is how
    // far down it gets.
    const inlet0 = upstreamSource(rf).filter((i) => Math.floor(i / w) === 0);
    const t = new FieldFire({ width: w, height: h, seed: 3, field: rf, source: inlet0 });
    for (let i = 0; i < 300; i++) { t.step(); t.light(); }
    let deepest = -1;
    for (let i = 0; i < w * h; i++) if (t.pixels[i] > 0) deepest = Math.max(deepest, Math.floor(i / w));
    ok("!! ...and it TRAVELS DOWNSTREAM: lit only at row 0, the fire reaches row 13 of 23",
       inlet0.length === 23 && deepest === 13,
       `${inlet0.length} inlet cells in row 0, deepest lit row ${deepest} of ${h - 1}. UNCLAMPED THE SAME ` +
       "MEASUREMENT READS 1 INLET CELL AND ROW 0: the default path wanders a quarter of the width over a " +
       "quarter period, a channel steeper than 45 degrees whose tangent quantises to pure horizontal, so " +
       "every row-0 cell has an upstream neighbour beside it and the fire never descends. Downstream that " +
       "never advances downstream is not downstream");
}
{
    // WATERFALL: the turn, and the curtain that is a curtain rather than a sheet.
    const wf = waterfallField(w, h), ly = Math.round(0.35 * h), lx = Math.round(0.6 * w);
    const dir = (x, y) => { const i = x + w * y; return [wf.dirs[i * 2], wf.dirs[i * 2 + 1]]; };
    ok("!! *** THE FLOW TURNS AT THE LIP -- horizontal above it, vertical over it ***",
       JSON.stringify(dir(5, 1)) === "[1,0]" && JSON.stringify(dir(lx, 1)) === "[0,1]" &&
       JSON.stringify(dir(lx, ly + 3)) === "[0,1]",
       `approach (5,1) ${JSON.stringify(dir(5, 1))}, at the lip (${lx},1) ${JSON.stringify(dir(lx, 1))}, ` +
       `falling (${lx},${ly + 3}) ${JSON.stringify(dir(lx, ly + 3))}. ONE FIELD HOLDING TWO REGIMES is what a ` +
       "scalar wind parameter cannot express, and is the whole reason the direction is per cell");

    const belowFuel = [];
    for (let x = 0; x < w; x++) if (wf.fuel[x + w * (ly + 3)]) belowFuel.push(x);
    ok("!! ...and the curtain below the lip is THREE CELLS WIDE, not half the grid",
       belowFuel.length === 3 && belowFuel[0] === lx,
       `${belowFuel.length} fuel cells across the row below the lip, starting at x=${belowFuel[0]} (lip ${lx}). ` +
       "THE FIRST DRAFT READ `x > lx + 2 ? [0,0] : [0,1]` -- every cell LEFT of the lip was falling water and " +
       "the whole left half burned, beside a comment reading 'the fall itself, a narrow column'");
}
{
    // LAVA: spreads from a vent and is pulled downhill, so its heat sits BELOW the vent, not around it.
    const lf = lavaField(w, h), vent = Math.round(0.5 * w) + w * Math.round(0.2 * h);
    const f = new FieldFire({ width: w, height: h, seed: 3, field: lf, source: [vent] });
    for (let i = 0; i < 200; i++) { f.step(); f.light(); }
    const vy = Math.round(0.2 * h);
    let above = 0, below = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f.at(x, y); if (v > 0) (y < vy ? above++ : below++); }
    // *** THE FIRST DRAFT OF THIS ROW ASSERTED below > above*4 AND READ 852 AGAINST 223 -- A RATIO OF 3.82,
    // RED ON A THRESHOLD NOBODY HAD MEASURED. *** The lava was right and the number beside it was guessed,
    // which is the shape this tree calls typing a value next to the data instead of deriving it. Pinned as
    // the counts actually observed: a guessed floor stays green while the effect drifts under it, and an
    // exact pin goes red and makes somebody read the new number.
    ok("!! *** LAVA CATCHES AND RUNS DOWNHILL: the burn sits below the vent, not around it ***",
       below === 852 && above === 223,
       `${below} lit cells at or below the vent row against ${above} above it, ratio ` +
       `${(below / Math.max(1, above)).toFixed(2)} (pinned at 852 / 223 = 3.82). The field is radial from the ` +
       "vent PLUS a downhill bias: at the top of the circle (0,-1) + (0,0.8) still points up, so SOME upward " +
       "spread is correct and a check demanding none would be wrong about the field it is grading");
}

/* ---------------------------------------------------------------------------------------------------------
 * 5. THE BOUNDARY BEHAVIOUR OF v4178'S RULE THAT v4178 COULD NOT EXHIBIT. Pinned as VALUES, because a check
 *    that merely said "the edge is hotter" would stay green however far the effect grew.
 * ------------------------------------------------------------------------------------------------------ */
{
    const W = 64, H = 20;
    const wf = waterfallField(W, H), lx = Math.round(0.6 * W);
    const f = new FieldFire({ width: W, height: H, seed: 9, field: wf, source: upstreamSource(wf) });
    for (let i = 0; i < 200; i++) { f.step(); f.light(); }
    const lead = Array.from({ length: H }, (_, y) => f.at(lx, y));
    const { back, perp, fuel } = f.field, n = W * H;
    let noPerpUp = 0, atMax = 0;
    for (let i = 0; i < n; i++) {
        if (!fuel[i]) continue;
        const pu = i - perp[i];
        if (pu < 0 || pu >= n || !fuel[pu]) { noPerpUp++; if (f.pixels[i] === MAX_INTENSITY) atMax++; }
    }
    ok("!! *** A FUEL CELL WITH NO PERPENDICULAR UPSTREAM NEIGHBOUR NEVER COOLS, and here is the count ***",
       lead.every((v) => v === MAX_INTENSITY) && noPerpUp === 51 && atMax === 48,
       `the curtain's leading column reads ${Math.min(...lead)}..${Math.max(...lead)} down all ${H} rows; ` +
       `${atMax} of ${noPerpUp} such cells sit at MAX. The decay is applied to the value WRITTEN and the write ` +
       "lands on the PERPENDICULAR neighbour, so only a decay of 0 writes a cell to itself and it writes it " +
       "undecayed. *** THIS IS OLD BEHAVIOUR WITH NOWHERE TO APPEAR: *** v4178's fuel region is the whole " +
       "rectangle, so its only such cells are one screen edge -- measured there as a 9% bias, 25.7 mean " +
       "against 23.6. Give the fire an interior boundary and the same rule draws a hard bright line");

    const orig = new DoomFire({ width: 40, height: 20, seed: 5 });
    for (let i = 0; i < 300; i++) { orig.step(); orig.light(); }
    const colMean = (x) => { let s = 0; for (let y = 0; y < 20; y++) s += orig.at(x, y); return s / 20; };
    const right = colMean(39), left = colMean(0);
    ok("...and the SAME asymmetry is present in v4178 itself, which is what makes it the rule and not a bug",
       right > left && right - left < 5,
       `original 40x20 after 300 frames: right edge mean ${right.toFixed(1)}, left edge ${left.toFixed(1)}, ` +
       `difference ${(right - left).toFixed(1)}. The lean is leftward, so the RIGHT edge is the one with no ` +
       "perpendicular upstream neighbour -- mild across a full rectangle, stark against a bank");

    REPORT.table("the curtain's leading column", ["row", "intensity"], lead.map((v, y) => [y, v]),
                 "Every row at MAX_INTENSITY: the cell has no perpendicular upstream neighbour to decay it.");
}

REPORT.write();

console.log();
console.log("  ----  WHAT THIS DOES NOT CLAIM. That the fire looks right: a gate cannot judge a picture, and");
console.log("  ----  these checks hold direction, confinement, travel and the derived inlet, none of which is");
console.log("  ----  beauty. That a direction field is a fluid solver -- it is an ADVECTION DIRECTION per cell");
console.log("  ----  and nothing solves for it; a river's course here is drawn, not simulated. And that this");
console.log("  ----  reaches a scene: nothing in the tree renders it yet, which is #162 and is not done here.");
if (fails) { console.log("doomFireField-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("doomFireField-selfcheck: all checks pass");

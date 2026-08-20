// WebGLEngine/tools/ship/rleBrickMap-selfcheck.mjs -- v3042
//
// Run: node tools/ship/rleBrickMap-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES voxel/rleBrickMap.js -- the coarse occupancy mip derived from the canonical RLE, and the DDA that skips
// solid queries using it.
//
// THREE THINGS ARE UNDER TEST AND THEY FAIL DIFFERENTLY.
//
// 1. THE INVARIANT IS TWO-SIDED. "Every empty brick is really empty" passes an ALL-ONES map. "Every occupied
//    brick really holds something" passes an ALL-ZEROS map. Either check alone is a control that cannot fail, so
//    both are asserted, and both trivial maps are fed in to prove each check rejects the map the other accepts.
//
// 2. THE TWO FAILURE DIRECTIONS ARE NOT THE SAME BUG. A brick wrongly marked occupied costs speed. A brick
//    wrongly marked empty makes a ray pass through a wall, silently, with nothing downstream looking wrong. The
//    module reports them separately and this gate proves the unsafe direction actually loses a hit.
//
// 3. TRAVERSAL EQUIVALENCE. traverseBricked must return the same first-hit voxel, face and step count as the
//    proven traverseDDA oracle. It is written to be equivalent by construction (identical state machine, one
//    extra guard), so the interesting question is whether the brick consult is LOAD-BEARING -- which is what the
//    sabotage answers -- and what the query saving actually MEASURES, which is reported and never asserted,
//    because a speed threshold is a flaky gate.

import { readFileSync, readdirSync } from "node:fs";
import {
    brickMapFromRLE, brickDims, brickIndex, brickForVoxel, verifyBrickMap, describeBrickMap,
    occupancy, traverseBricked, traverseBrickedJumping, DEFAULT_BRICK, SOLID_NONZERO,
} from "../../voxel/rleBrickMap.js";
import { traverseDDA } from "../../voxel/voxelDDA.js";
import { buildIndex, getRLEIndexed } from "../../voxel/voxelRLE.js";
import { chunkToRLE, chunkIndexReal } from "../../voxel/rleWorldBridge.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (msg) => console.log("  ----  " + msg);

// --- fixtures ----------------------------------------------------------------------------------------------
const SX = 48, SY = 32, SZ = 48;
const DIMS = { sx: SX, sy: SY, sz: SZ };

function terrain(seed = 1) {
    const v = new Uint8Array(SX * SY * SZ);
    for (let x = 0; x < SX; x++) for (let z = 0; z < SZ; z++) {
        const h = Math.min(SY - 1, Math.floor(9 + 5 * Math.sin((x + seed) * 0.19) * Math.cos(z * 0.15) + 3 * Math.sin((x + z) * 0.11)));
        for (let y = 0; y < h; y++) v[chunkIndexReal(x, y, z, DIMS)] = (y === h - 1) ? 1 : (y >= h - 3 ? 4 : 6);
    }
    for (let x = 20; x < 27; x++) for (let z = 20; z < 27; z++) for (let y = 22; y < 27; y++) v[chunkIndexReal(x, y, z, DIMS)] = 5;
    return v;
}
const empty = () => new Uint8Array(SX * SY * SZ);
const oneVoxel = () => { const v = empty(); v[chunkIndexReal(30, 25, 30, DIMS)] = 5; return v; };

const rleOf = (c) => chunkToRLE(c, DIMS, chunkIndexReal);
const solidFn = (rle) => { const p = buildIndex(rle); return (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ) ? false : getRLEIndexed(rle, p, x, y, z) !== 0; };

// --- 1. the map is EXACT on real fixtures --------------------------------------------------------------------
{
    let allOk = true, detail = "";
    for (const [name, chunk] of [["terrain", terrain(1)], ["terrain2", terrain(5)], ["empty", empty()], ["oneVoxel", oneVoxel()]]) {
        const rle = rleOf(chunk);
        const res = verifyBrickMap(brickMapFromRLE(rle), rle);
        if (!res.ok) { allOk = false; detail = name + ": " + describeBrickMap(res); }
    }
    ok("the derived map is EXACT on all 4 fixtures (no optimistic brick, no wasteful brick)", allOk, detail);

    const rle = rleOf(terrain(1));
    const map = brickMapFromRLE(rle);
    const occ = occupancy(map);
    ok("brick dims cover the chunk", map.bx === Math.ceil(SX / DEFAULT_BRICK) && map.by === Math.ceil(SY / DEFAULT_BRICK) && map.bz === Math.ceil(SZ / DEFAULT_BRICK));
    ok("the map is much smaller than the volume", map.data.length * 64 <= SX * SY * SZ, map.data.length + " bricks vs " + (SX * SY * SZ) + " voxels");
    ok("it is not trivially all-occupied or all-empty (or the fixture proves nothing)",
        occ.occupied > 0 && occ.occupied < occ.total, (100 * occ.fraction).toFixed(1) + "% occupied");
    ok("brick index is X-fastest, same convention as the volume cache (no fifth index order)",
        brickIndex(2, 3, 4, map) === 2 + map.bx * (3 + map.by * 4));
    ok("brickForVoxel reads 0 outside the chunk (nothing out there to hit)",
        brickForVoxel(map, -1, 0, 0) === 0 && brickForVoxel(map, SX, 0, 0) === 0 && brickForVoxel(map, 0, SY, 0) === 0);

    // a non-dividing brick size must still cover the edges
    const odd = brickMapFromRLE(rle, { brick: 7 });
    ok("a brick size that does not divide the chunk still covers every voxel", verifyBrickMap(odd, rle).ok,
        describeBrickMap(verifyBrickMap(odd, rle)));
}

// --- 2. BOTH DIRECTIONS OF THE INVARIANT, each proven against the map the other would accept -------------------
{
    const rle = rleOf(terrain(1));
    const good = brickMapFromRLE(rle);

    const allOnes = { ...good, data: new Uint8Array(good.data.length).fill(1) };
    const allZeros = { ...good, data: new Uint8Array(good.data.length) };

    const rOnes = verifyBrickMap(allOnes, rle);
    const rZeros = verifyBrickMap(allZeros, rle);

    ok("SABOTAGE(all-ones map): a check that only asked 'are empty bricks empty' would PASS it",
        rOnes.unsafe.length === 0);
    ok("SABOTAGE(all-ones map): the wasteful direction CATCHES it", rOnes.ok === false && rOnes.wasteful.length > 0);
    ok("SABOTAGE(all-ones map): it is reported SAFE, because it is -- it only costs speed",
        rOnes.safe === true && /SAFE but not exact/.test(describeBrickMap(rOnes)));

    ok("SABOTAGE(all-zeros map): a check that only asked 'are occupied bricks occupied' would PASS it",
        rZeros.wasteful.length === 0);
    ok("SABOTAGE(all-zeros map): the unsafe direction CATCHES it", rZeros.safe === false && rZeros.unsafe.length > 0);
    ok("SABOTAGE(all-zeros map): it names the brick AND the solid voxel that disproves it", (() => {
        const u = rZeros.unsafe[0];
        return u && Number.isInteger(u.bx) && u.provenBy && solidFn(rle)(u.provenBy.x, u.provenBy.y, u.provenBy.z) &&
               ((u.provenBy.x / good.brick) | 0) === u.bx && ((u.provenBy.y / good.brick) | 0) === u.by && ((u.provenBy.z / good.brick) | 0) === u.bz;
    })(), rZeros.unsafe[0] ? "brick (" + rZeros.unsafe[0].bx + "," + rZeros.unsafe[0].by + "," + rZeros.unsafe[0].bz + ")" : "");
    ok("SABOTAGE(all-zeros map): described as UNSAFE and NOT repaired",
        /UNSAFE/.test(describeBrickMap(rZeros)) && /NOT repaired/.test(describeBrickMap(rZeros)));

    // verify writes nothing
    const copy = Uint8Array.from(allZeros.data);
    verifyBrickMap(allZeros, rle);
    ok("verifyBrickMap does not repair the map it just condemned", allZeros.data.every((b, i) => b === copy[i]));

    // v3043 -- THE CAP IS NOT THE COUNT. v3042 guarded the PUSH by maxReport, so unsafe.length and
    // wasteful.length were the report limit rather than the total, and the page printed "4 bricks claim occupied
    // and hold nothing" for an all-ones map over a half-full world where the real answer is 78. A limit printed
    // where a measurement belongs, and nothing was red because 4 is a perfectly plausible number.
    //
    // Caught by Keith reading the page output, which is the whole argument for shipping a front door.
    ok("the reported total is a COUNT, not the report cap", rOnes.wastefulCount > rOnes.wasteful.length,
        rOnes.wastefulCount + " wasteful, " + rOnes.wasteful.length + " listed");
    ok("...and it agrees with an INDEPENDENT count of the same thing", (() => {
        const g2 = brickMapFromRLE(rle);
        let n = 0;
        for (let i = 0; i < g2.data.length; i++) if (!g2.data[i]) n++;   // all-ones is wasteful exactly where the exact map is empty
        return rOnes.wastefulCount === n;
    })());
    ok("...and the sentence quotes the total and admits how many it listed",
        new RegExp("^brick map SAFE but not exact: " + rOnes.wastefulCount + " of ").test(describeBrickMap(rOnes)) &&
        /first 4 listed/.test(describeBrickMap(rOnes)), describeBrickMap(rOnes));
    ok("unsafe counts the same way", rZeros.unsafeCount > rZeros.unsafe.length && rZeros.unsafeCount === occupancy(brickMapFromRLE(rle)).occupied,
        rZeros.unsafeCount + " unsafe, " + rZeros.unsafe.length + " listed");
    ok("SABOTAGE(cap-as-count): raising maxReport must NOT change the total -- if it does, the total is a cap",
        verifyBrickMap(allOnes, rle, { maxReport: 1 }).wastefulCount === rOnes.wastefulCount &&
        verifyBrickMap(allOnes, rle, { maxReport: 999 }).wastefulCount === rOnes.wastefulCount);
}

// --- 3. TRAVERSAL EQUIVALENCE vs the proven oracle -------------------------------------------------------------
{
    const chunk = terrain(1);
    const rle = rleOf(chunk);
    const isSolid = solidFn(rle);
    const map = brickMapFromRLE(rle);

    let N = 0, hitEq = 0, faceEq = 0, stepEq = 0, tEq = 0;
    let oracleQueries = 0, brickQueries = 0, hits = 0;
    for (let i = 0; i < 5000; i++) {
        const a = i * 0.0731 + 0.011, b = (i % 97) * 0.0217 - 1.0;
        const ro = [SX / 2 + 0.37, SY - 1.61, SZ / 2 + 0.29];
        const rd = [Math.cos(a) * Math.cos(b), Math.sin(b) - 0.35, Math.sin(a) * Math.cos(b)];
        if (isSolid(Math.floor(ro[0]), Math.floor(ro[1]), Math.floor(ro[2]))) continue;

        let oq = 0;
        const counting = (x, y, z) => { oq++; return isSolid(x, y, z); };
        const o = traverseDDA(ro[0], ro[1], ro[2], rd[0], rd[1], rd[2], counting, 300);
        const m = traverseBricked(ro[0], ro[1], ro[2], rd[0], rd[1], rd[2], isSolid, map, 300);

        N++;
        oracleQueries += oq; brickQueries += m.queries;
        if (o.hit) hits++;
        if (o.hit === m.hit && (!o.hit || (o.vx === m.vx && o.vy === m.vy && o.vz === m.vz))) hitEq++;
        if (!o.hit || (o.nx === m.nx && o.ny === m.ny && o.nz === m.nz)) faceEq++;
        if (o.steps === m.steps) stepEq++;
        if (o.t === m.t) tEq++;
    }
    ok("EQUIVALENCE: bricked first-hit voxel == traverseDDA oracle", hitEq === N, hitEq + "/" + N);
    ok("EQUIVALENCE: bricked hit face normal == oracle", faceEq === N, faceEq + "/" + N);
    ok("EQUIVALENCE: identical step count (the state machine really is the same one)", stepEq === N, stepEq + "/" + N);
    ok("EQUIVALENCE: identical t, bit for bit", tEq === N, tEq + "/" + N);
    ok("the ray set is meaningful: enough rays, and enough of them actually hit something",
        N > 3000 && hits > N * 0.3, N + " rays, " + hits + " hits");

    // REPORTED, NEVER ASSERTED -- a speed threshold is a flaky gate (the meshPerf lesson).
    say("MEASURED solid queries over " + N + " rays: oracle " + oracleQueries.toLocaleString() +
        ", bricked " + brickQueries.toLocaleString() +
        "  (" + (100 * (1 - brickQueries / oracleQueries)).toFixed(1) + "% fewer; each one is an O(log runs) binary search)");
    ok("the brick map does reduce solid queries at all (if it did not, it is decoration)", brickQueries < oracleQueries);
}

// --- 4. THE SABOTAGE THAT PROVES THE SKIP IS LOAD-BEARING ------------------------------------------------------
// Mark one genuinely occupied brick as empty. If traversal still finds every hit, the brick consult was never
// doing anything and this whole module is decoration.
{
    const chunk = terrain(1);
    const rle = rleOf(chunk);
    const isSolid = solidFn(rle);
    const good = brickMapFromRLE(rle);

    // the floating block lives at voxels 20..26 -> brick (2,2,2) at B=8 covers 16..23
    const bi = brickIndex(2, 2, 2, good);
    ok("the brick chosen for sabotage really is occupied", good.data[bi] === 1);
    const holed = { ...good, data: Uint8Array.from(good.data) };
    holed.data[bi] = 0;

    const vres = verifyBrickMap(holed, rle);
    ok("SABOTAGE(one brick holed): verify calls it UNSAFE, not merely different", vres.safe === false && vres.unsafeCount === 1);

    // fire rays straight at the block from outside and count hits lost
    let lost = 0, fired = 0;
    for (let dxi = 0; dxi < 40; dxi++) for (let dzi = 0; dzi < 40; dzi++) {
        const ro = [0.5, 18.5 + (dxi % 3) * 0.13, 0.5];
        const target = [17 + (dxi % 6), 17 + (dzi % 6), 17 + ((dxi + dzi) % 6)];
        const rd = [target[0] - ro[0], target[1] - ro[1], target[2] - ro[2]];
        const o = traverseBricked(ro[0], ro[1], ro[2], rd[0], rd[1], rd[2], isSolid, good, 300);
        const h = traverseBricked(ro[0], ro[1], ro[2], rd[0], rd[1], rd[2], isSolid, holed, 300);
        fired++;
        if (o.hit && (!h.hit || h.vx !== o.vx || h.vy !== o.vy || h.vz !== o.vz)) lost++;
    }
    ok("SABOTAGE(one brick holed): rays that hit with the good map MISS or hit elsewhere with the holed one",
        lost > 0, lost + " of " + fired + " rays changed answer -- the brick consult is load-bearing");
}

// --- 5. THE JUMPING FORM, MEASURED RATHER THAN ASSUMED ---------------------------------------------------------
// traverseBrickedJumping advances by n*tDelta in one operation instead of adding tDelta n times. Arithmetically
// identical, numerically not. This measures how often that difference changes the answer, so the decision to
// keep it out of the default is evidence and not a hunch.
{
    const rle = rleOf(terrain(1));
    const isSolid = solidFn(rle);
    const map = brickMapFromRLE(rle);
    let N = 0, sameHit = 0, sameFace = 0, sameSteps = 0;
    for (let i = 0; i < 4000; i++) {
        const a = i * 0.0619 + 0.007, b = (i % 89) * 0.0233 - 1.0;
        const ro = [SX / 2 + 0.37, SY - 1.61, SZ / 2 + 0.29];
        const rd = [Math.cos(a) * Math.cos(b), Math.sin(b) - 0.35, Math.sin(a) * Math.cos(b)];
        if (isSolid(Math.floor(ro[0]), Math.floor(ro[1]), Math.floor(ro[2]))) continue;
        const s = traverseBricked(ro[0], ro[1], ro[2], rd[0], rd[1], rd[2], isSolid, map, 300);
        const j = traverseBrickedJumping(ro[0], ro[1], ro[2], rd[0], rd[1], rd[2], isSolid, map, 300);
        N++;
        if (s.hit === j.hit && (!s.hit || (s.vx === j.vx && s.vy === j.vy && s.vz === j.vz))) sameHit++;
        if (!s.hit || (s.nx === j.nx && s.ny === j.ny && s.nz === j.nz)) sameFace++;
        if (s.steps === j.steps) sameSteps++;
    }
    const hitDiff = N - sameHit, faceDiff = N - sameFace, stepDiff = N - sameSteps;
    say("MEASURED jumping vs stepping over " + N + " rays: hit differs on " + hitDiff +
        ", face differs on " + faceDiff + ", step count differs on " + stepDiff);
    say(hitDiff === 0
        ? "the jump did NOT change a single first hit here -- a candidate for the default, but it needs its own equivalence gate, not this note"
        : "the jump DOES change first hits, which is exactly why it is not the shipped default");
    ok("the jumping form is exported but is NOT what traverseBricked does", (() => {
        const src = readFileSync(new URL("../../voxel/rleBrickMap.js", import.meta.url), "utf8");
        const body = src.slice(src.indexOf("export function traverseBricked("), src.indexOf("export function traverseBrickedJumping"))
                        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");   // read CODE, not the note explaining it
        const accum = body.match(/tMax[XYZ]\s*\+=[^;]*/g) || [];
        return accum.length === 3 && accum.every((a) => /^tMax[XYZ] \+= tDelta[XYZ]$/.test(a.trim())) &&
               /bx \* tDeltaX/.test(body);   // the INITIALISATION is a multiply and is identical to the oracle
    })(), "the loop accumulates tDelta exactly once per step on each axis; only the tMax INITIALISATION multiplies, and that line is identical to the oracle");
    ok("the jumping form still never reports a hit the stepping form calls air (it may differ, it may not lie)", (() => {
        // whatever it hits must actually be solid -- a jump past a wall is the failure that matters
        let bad = 0;
        for (let i = 0; i < 800; i++) {
            const a = i * 0.101, b = (i % 53) * 0.031 - 0.8;
            const ro = [SX / 2 + 0.41, SY - 1.37, SZ / 2 + 0.23];
            const rd = [Math.cos(a) * Math.cos(b), Math.sin(b) - 0.3, Math.sin(a) * Math.cos(b)];
            const j = traverseBrickedJumping(ro[0], ro[1], ro[2], rd[0], rd[1], rd[2], isSolid, map, 300);
            if (j.hit && !isSolid(j.vx, j.vy, j.vz)) bad++;
        }
        return bad === 0;
    })());
}

// --- 6. refusals + browser safety ------------------------------------------------------------------------------
{
    const rle = rleOf(terrain(1));
    ok("refuses a nonsense brick size", (() => {
        for (const b of [0, -3, 2.5]) { try { brickMapFromRLE(rle, { brick: b }); return false; } catch {} }
        return true;
    })());
    ok("verify refuses a map of the wrong dimensions rather than comparing a prefix", (() => {
        const m = brickMapFromRLE(rle);
        const r = verifyBrickMap({ ...m, sx: SX + 8 }, rle);
        return r.ok === false && /dimension mismatch/.test(r.reason || "");
    })());
    const src = readFileSync(new URL("../../voxel/rleBrickMap.js", import.meta.url), "utf8");
    ok("browser-safe: no node builtin at module scope, no DOM",
        !/^\s*import[^\n]*["'](node:|fs|path|url|crypto)/m.test(src) && !/\bdocument\b|\bwindow\b/.test(src));
    ok("imports only sibling voxel modules", (src.match(/^\s*import[^\n]*/gm) || []).every((l) => /["']\.\//.test(l)));
    ok("the asymmetry is written down where the next reader will meet it",
        /UNSAFE/.test(src) && /WASTEFUL/.test(src) && /asymmetr/i.test(src));
}

// ---- v3153: THE MAP NOW RECORDS WHAT QUESTION IT ANSWERS, NOT ONLY WHICH WORLD --------------------------------
// A brick map is a claim of the form "UNDER THIS NOTION OF SOLID, this brick is empty". It carried a
// srcFingerprint naming WHICH WORLD it describes and nothing naming the predicate -- so verifyBrickMap had its
// OWN default, independent of the build's, and checking a custom-built map with it answered a question about a
// map that was never built.
{
    const v = empty();
    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) for (let y = 0; y < 6; y++) v[chunkIndexReal(x, y, z, DIMS)] = 1;
    v[chunkIndexReal(30, 25, 30, DIMS)] = 5;
    const rle = rleOf(v);
    const TYPE5_AIR = (t) => t !== 0 && t !== 5;
    const custom = brickMapFromRLE(rle, { isSolid: TYPE5_AIR });

    ok("the map records the PREDICATE it was built with, not just the world",
        custom.isSolid === TYPE5_AIR && brickMapFromRLE(rle).isSolid === SOLID_NONZERO);

    ok("verifying with no predicate uses the MAP'S own, not a second default",
        verifyBrickMap(custom, rle).safe === true);

    ok("a DIFFERENT predicate is REFUSED rather than silently answered",
        (() => { const r = verifyBrickMap(custom, rle, { isSolid: SOLID_NONZERO });
                 return r.ok === false && /not the one this map was built with/.test(r.reason || ""); })());

    ok("passing the SAME predicate explicitly is still accepted",
        verifyBrickMap(custom, rle, { isSolid: TYPE5_AIR }).safe === true);

    // v3154 -- THIS ASSERTED "one definition IN THIS MODULE" AND WENT RED WHEN v3154 MOVED IT TO THE BASE.
    // v3153 fixed two copies here and froze THE LOCATION as the invariant; the property is that voxel/ holds
    // exactly ONE, wherever it lives. NINETEENTH MECHANISM-PIN, mine, ONE ROUND AFTER writing the law down --
    // and the fix is the same every time: assert the PROPERTY, never the arrangement that satisfied it today.
    ok("voxel/ holds exactly ONE definition of solid, wherever it lives",
        (() => {
            const dir = new URL("../../voxel/", import.meta.url);
            let total = 0;
            for (const f of readdirSync(dir)) {
                if (!f.endsWith(".js")) continue;
                const raw = readFileSync(new URL(f, dir), "utf8");
                // Comments stripped first: v3153's version counted its OWN comment and found two.
                const code = raw.replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
                total += code.split("(t) => t !== 0").length - 1;
            }
            const base = readFileSync(new URL("../../voxel/voxelRLE.js", import.meta.url), "utf8");
            return total === 1 && /export const SOLID_NONZERO/.test(base);
        })());

    say("v3153 DEMONSTRATED BEFORE FIXING: this exact map reported EXACT under the predicate that built it and");
    say("UNSAFE (1 of 144 bricks claim EMPTY and hold a solid) under the default. THE SAME MAP, TWO ANSWERS,");
    say("and nothing recorded which question was being asked -- so the verdict had no subject.");
    say("SCOPE: the marcher's isSolid is a POSITION predicate (x,y,z); the map's is a TYPE predicate (t). TWO");
    say("SIGNATURES WEARING ONE NAME -- not comparable by identity, not supposed to be equal, required to");
    say("AGREE, which verifyBrickMap proves EXHAUSTIVELY (every brick, every voxel). This round fixed WHICH");
    say("predicate that proof is about. Six copies of the lambda remain in other voxel modules: NOT done here.");
}

console.log("rleBrickMap-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);

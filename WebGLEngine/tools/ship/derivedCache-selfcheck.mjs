// WebGLEngine/tools/ship/derivedCache-selfcheck.mjs -- v3065
//
// Run: node tools/ship/derivedCache-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES lib/derivedCache.js -- the contract four caches in this tree implement by hand.
//
// THE CHECK THAT MATTERS IS SECTION 2. A "generalisation" that merely LOOKS like the thing it generalises is a
// fifth implementation with a nicer name, and the way it goes wrong is subtly disagreeing with the four that
// already work. So the primitive is wired around the REAL rleVolumeCache and must reach the SAME verdict and the
// SAME coordinate as compareVolumeToRLE -- on clean data and on corrupted data.
//
// And section 3 is why the contract exists at all: makeHealingCache is exported so the gate can DEMONSTRATE that
// a repairing verify reports a clean pass on corrupt data, rather than the rule being asserted in a comment.

import { readFileSync } from "node:fs";
import { makeDerivedCache, makeHealingCache } from "../../lib/derivedCache.js";
import { rleToVolume, volumeAt, volumeIndex, compareVolumeToRLE, rleFingerprint } from "../../voxel/rleVolumeCache.js";
import { buildIndex, getRLEIndexed } from "../../voxel/voxelRLE.js";
import { chunkToRLE, chunkIndexReal } from "../../voxel/rleWorldBridge.js";
import { codeOnly } from "./sourceScan.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const toySpec = (name) => ({
    name, derive: (s) => s.a.map((x) => x * 2), fingerprint: (s) => s.a.join(","),
    positions: (s) => s.a.keys(), expected: (s, i) => s.a[i] * 2, actual: (v, i) => v[i], describe: (i) => "index " + i,
});

// --- 1. the three rules, each demonstrated --------------------------------------------------------------------
{
    const src = { a: [1, 2, 3, 4, 5] };
    const c = makeDerivedCache(toySpec("toy"));
    c.rebuild(src);
    ok("parity passes on a freshly derived cache", c.verify(src).ok);

    c.value[2] = 99;
    const r = c.verify(src);
    ok("!! RULE 3 -- a divergence reports a COORDINATE, not a boolean",
        r.ok === false && r.first.where === "index 2" && r.first.expected === 6 && r.first.actual === 99);
    ok("...and describeResult says it was not repaired", /not repaired/.test(c.describeResult(r)));
    ok("!! RULE 2 -- verify WRITES NOTHING: the corruption survives the check", c.value[2] === 99);
    ok("!! RULE 1 -- the fingerprint is BLIND to that corruption, and that is correct",
        c.isStale(src) === false,
        "a match says nothing we track moved; it is not a claim that the derivation was right");
    src.a[0] = 7;
    ok("...and it DOES see the source move", c.isStale(src) === true);
    ok("sync() rebuilds only when stale", (() => {
        const c2 = makeDerivedCache(toySpec("t2")); const s2 = { a: [1, 2] };
        c2.rebuild(s2); const before = c2.stats.derives;
        const x = c2.sync(s2); s2.a[1] = 9; const y = c2.sync(s2);
        return x.changed === false && y.changed === true && c2.stats.derives === before + 1;
    })());
}

// --- 2. IT AGREES WITH THE HAND-WRITTEN CACHE IT GENERALISES ---------------------------------------------------
{
    const S = 16, H = 64, DIMS = { sx: S, sy: H, sz: S };
    const v = new Uint8Array(S * H * S);
    for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
        const h = 6 + ((x * 3 + z * 5) % 9);
        for (let y = 0; y < h; y++) v[chunkIndexReal(x, y, z, DIMS)] = 1 + ((x + y + z) % 6);
    }
    const rle = chunkToRLE(v, DIMS, chunkIndexReal);
    const prefix = buildIndex(rle);

    const cache = makeDerivedCache({
        name: "volume",
        derive: (r) => rleToVolume(r),
        fingerprint: (r) => rleFingerprint(r),
        *positions() { for (let z = 0; z < S; z++) for (let y = 0; y < H; y++) for (let x = 0; x < S; x++) yield [x, y, z]; },
        expected: (r, [x, y, z]) => getRLEIndexed(r, prefix, x, y, z),
        actual: (vol, [x, y, z]) => volumeAt(vol, x, y, z),
        describe: ([x, y, z]) => "(" + x + "," + y + "," + z + ")",
    });
    cache.rebuild(rle);

    ok("!! clean: the primitive and compareVolumeToRLE BOTH pass, over the same 16384 voxels",
        cache.verify(rle).ok === true && compareVolumeToRLE(cache.value, rle).ok === true &&
        cache.verify(rle).checked === S * H * S);

    // corrupt one voxel and require the two to name the SAME place
    const tx = 9, ty = 21, tz = 4;
    const was = volumeAt(cache.value, tx, ty, tz);
    cache.value.data[volumeIndex(tx, ty, tz, cache.value)] = (was + 5) & 7;
    const mine = cache.verify(rle), theirs = compareVolumeToRLE(cache.value, rle);
    ok("!! corrupted: both FAIL", mine.ok === false && theirs.ok === false);
    ok("!! ...and they name the SAME coordinate, with the same expected and actual",
        mine.first.where === "(" + theirs.first.x + "," + theirs.first.y + "," + theirs.first.z + ")" &&
        mine.first.expected === theirs.first.expected && mine.first.actual === theirs.first.actual,
        mine.first.where + " expected " + mine.first.expected + " got " + mine.first.actual);
    ok("...so the primitive is a faithful generalisation, not a fifth implementation with a nicer name", true,
        "a generalisation that disagreed with the four working caches would be the bug it was written to prevent");
}

// --- 3. THE HEALING SHAPE, demonstrated rather than asserted ---------------------------------------------------
{
    const src = { a: [1, 2, 3] };
    const h = makeHealingCache(toySpec("healer"));
    h.rebuild(src);
    h.value[1] = -1;
    ok("!! SABOTAGE: a repairing verify reports a CLEAN PASS on corrupt data", h.verify(src).ok === true,
        "which is why rule 2 exists -- such a cache can never be observed wrong");
    ok("...and it is named so nobody ships it by accident", /do not ship/.test(h.name));

    const honest = makeDerivedCache(toySpec("honest"));
    honest.rebuild(src);
    honest.value[1] = -1;
    ok("...while the honest one reports the same corruption", honest.verify(src).ok === false);
}

// --- 4. refusals and the staleness shape -----------------------------------------------------------------------
{
    ok("a spec missing a required function is refused at construction", (() => {
        for (const missing of ["derive", "fingerprint", "positions", "expected", "actual"]) {
            const s = toySpec("x"); delete s[missing];
            try { makeDerivedCache(s); return false; } catch (e) { if (!new RegExp(missing).test(e.message)) return false; }
        }
        return true;
    })());
    ok("verify before any rebuild refuses rather than passing vacuously", (() => {
        const c = makeDerivedCache(toySpec("empty"));
        const r = c.verify({ a: [1] });
        return r.ok === false && /nothing derived yet/.test(r.reason);
    })());
    ok("!! a derive that returns nothing leaves NOTHING, not the last good value", (() => {
        // the sysadminBridge shape: `if (f) lastFound = f.v` keeps reporting the last version it ever saw when
        // the scan now finds none -- a remembered result presented as a current measurement.
        let give = true;
        const c = makeDerivedCache({ ...toySpec("nullable"), derive: () => (give ? [2, 4] : null), fingerprint: () => (give ? "a" : "b") });
        c.rebuild({ a: [1, 2] });
        give = false;
        c.sync({ a: [1, 2] });
        return c.value === null;
    })(), "keeping the old value here is exactly the bug still open in sysadminBridge updateStatus");
}

// --- 5. the source says which rule is which ---------------------------------------------------------------------
{
    const src = readFileSync(new URL("../../lib/derivedCache.js", import.meta.url), "utf8");
    const prose = src.replace(/\n\s*\/\/\s?/g, " ").replace(/\s+/g, " ");
    ok("all three rules are written down where the next implementer meets them",
        /STALE != WRONG/.test(prose) && /VERIFY NEVER WRITES/.test(prose) && /REPORT A COORDINATE/.test(prose));
    ok("...and it names the four hand-written caches it was factored out of",
        /rleVolumeCache/.test(prose) && /rleBrickMap/.test(prose) && /rleRegionVolume/.test(prose) && /voxelVolumeStream/.test(prose));
    ok("...and the fifth one that got it wrong", /sysadminBridge/.test(prose));
    ok("isStale is named for what it proves, not called isValid", /isStale\(/.test(codeOnly(src)) && !/isValid/.test(codeOnly(src)));
    ok("browser-safe, no imports", !/^\s*import/m.test(codeOnly(src)) && !/\bdocument\s*[.[]/.test(codeOnly(src)));
}

console.log("derivedCache-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);

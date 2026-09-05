// FILE: world/orrery.mjs -- v4189
//
// SweK at the centre, the things it has taken in orbit around it.
//
// Keith's design, in his words: "a swek view of the universe would be swek at center, and repos place into
// orbit with swek, or another repo already orbiting swek. repos from space, some big, some small, some
// complicated, some simple. some energetic, some we just crush other projectiles into them, so it ejects what
// we want. for example we have to, or are allowed to vendor in their executable." And then: "over time".
//
// *** THIS FILE IS THE DATA MODEL, NOT THE VIEW, AND THAT SPLIT IS DELIBERATE. *** An orrery whose bodies are
// invented is a screensaver. Every field here comes from something already in the tree and checkable: the
// directories under vendor/, the licence files inside them, and the date git says each first appeared. A
// renderer can be written against this and graded against the same facts; written the other way round, the
// picture would decide what was true.
//
// ---- *** THE CAPTURE STATE IS THE LICENCE, WHICH IS THE WHOLE POINT OF THE METAPHOR *** --------------------
// Keith's "crush other projectiles into them, so it ejects what we want" is vendoring, exactly: you cannot
// take the whole body, so you take the fragment you are permitted to take. So a body's state is not decoration
// -- it is what the tree is actually allowed to do with it:
//
//   CAPTURED  -- vendored, with licence provenance present in the tree. The bytes are here and may ship on.
//   UNPAPERED -- vendored, and NO licence provenance found. The bytes are here and nothing says they may be.
//   REACHED   -- used but not vendored: streamed, fetched, or linked. See gpu/khronosSamples.mjs, where the
//                same distinction decides what mayVendor() will and will not clear.
//
// ---- *** FINDING THE LICENCE IS THE PART THAT KEEPS GOING WRONG, SO IT IS DONE CAREFULLY HERE *** ----------
// Three times in one session a scan of mine for "a licence file" missed a real one:
//   jeromeetienne/fireworks.js  -- MIT-LICENSE.txt, which does not START with "licen"
//   vendor/fonts                -- IBMPlexSerif-OFL.txt, the SIL Open Font Licence under the font's own name
//   vendor/wasm                 -- a LICENSE nested under quickjs/, not at the directory root
// Each time the first answer was "no licence", which for this model is the difference between CAPTURED and
// UNPAPERED -- a false accusation against a dependency that is properly licensed. So the search here is
// recursive, matches the licence word anywhere in the filename, and knows the common licence-name suffixes.
"use strict";

// *** THE PERIOD COMES FROM kepler.js RATHER THAN BEING RESTATED HERE, AND v4185 GOT THAT WRONG. *** That
// round wrote period = sqrt(a^3) and claimed in as many words that "a placed body and a simulated one agree"
// with physics/orbits/kepler.js. They did not: kepler's period(a, mu) is 2*PI*sqrt(a^3/mu), so the two
// differed BY EXACTLY 2*PI -- 96.2 against 604.7 at a = 21. A renderer animating with kepler's integrator
// would have had every body lag its stated period by a factor of six, and the gate would not have noticed
// because it checked T^2 = a^3, which is true of the WRONG constant too. Restating a law is how two modules
// end up describing different universes; importing the function is how they cannot.
import { period as keplerPeriod } from "../physics/orbits/kepler.js";
import { seedFor, seedProvenance } from "./orrerySeed.mjs";   // v4189 -- the commit that brought a body in is its planet seed

/** A body's relationship to SweK. Frozen so a caller can compare against these rather than retype them. */
export const CAPTURED = "captured";
export const UNPAPERED = "unpapered";
export const REACHED = "reached";

/**
 * Filenames that ARE a licence. Deliberately wider than "starts with LICENSE", for the reasons above.
 * OFL, APACHE, GPL, BSD, MPL and NOTICE all appear as bare filenames in real dependency trees.
 */
const LICENCE_NAME = /(^|[^a-z])(licen[cs]e|copying|notice|attribution|ofl|apache|gpl|lgpl|bsd|mpl|unlicense)([^a-z]|$)/i;

/** True when this filename, on its own, is licence provenance. */
/**
 * v4420 -- *** A FILE OF A DOCUMENTARY KIND, WHICH THIS RULE HAD NEVER REQUIRED. ***
 * Introduced by tools/ship/patternWidth.mjs at v4418 and moved here because this is where the licence question
 * lives and a second copy is a second chance to disagree.
 */
const DOCUMENTARY = /(^[^.]+$)|\.(txt|md|rst|adoc|text|1st)$/i;
export const isDocumentary = (base) => DOCUMENTARY.test(String(base || ""));

export function isLicenceFile(name) {
    if (typeof name !== "string" || !name) return false;
    // *** AND THE OTHER DIRECTION WAS NEVER CHECKED. *** v4263 widened LICENCE_NAME three times to stop this
    // rule falsely accusing properly licensed dependencies, and each widening was right. Nobody then asked what
    // it accepts that it should not: measured at v4420, TWO OF THE SIX FILES IT MATCHED IN THIS TREE ARE .mjs
    // MODULES -- brain/rl/attribution.mjs and its gate -- because the rule looks for the word anywhere in the name
    // and "attribution" is a perfectly good name for code about attribution. A licence is a DOCUMENT, and
    // requiring that costs the rule nothing: all 17 licences under vendor/ are documentary and stay matched.
    // Found by tools/ship/predicatePairs.mjs, which discovered that this and isPaperFile CROSS rather than nest.
    if (!isDocumentary(name.split("/").pop())) return false;
    return LICENCE_NAME.test(name);
}

/**
 * Find licence provenance for one body, given a flat list of the paths inside it.
 * Returns { found, path } -- the PATH matters, because "nested three levels down under one sub-package" is a
 * different quality of evidence from "at the root", and a person auditing this should see which they have.
 */
export function licenceFor(paths) {
    const list = (paths || []).filter((p) => typeof p === "string");
    // a root-level licence is the strongest evidence, so it wins over a nested one
    const root = list.find((p) => !p.includes("/") && isLicenceFile(p));
    if (root) return { found: true, path: root, depth: 0 };
    const nested = list.filter((p) => isLicenceFile(p.split("/").pop()));
    if (nested.length) {
        nested.sort((a, b) => a.split("/").length - b.split("/").length);
        return { found: true, path: nested[0], depth: nested[0].split("/").length - 1 };
    }
    return { found: false, path: null, depth: -1 };
}

/**
 * Orbital placement. *** THE PERIOD CARRIES THE MEANING, WHICH IS WHY IT IS NOT ARBITRARY. ***
 *
 * Keith: "some energetic". A body that arrived recently and is still moving orbits fast and close; one that
 * landed long ago and has not changed sits far out, barely moving. So the semi-major axis grows with AGE --
 * days since the body arrived -- and the period follows Kepler's third law from that axis, rather than being
 * a second free parameter. Two numbers that could disagree are one number that cannot.
 *
 * @param days  days since the body arrived (0 = arrived today)
 * @returns { a, period } in arbitrary but consistent units
 */
export function orbitFor(days, opts = {}) {
    const a0 = opts.innerRadius ?? 3;          // the closest a body can sit
    const perDay = opts.spreadPerDay ?? 0.6;   // how fast the orbit widens with age
    const a = a0 + Math.max(0, days) * perDay;
    // The tree's own function, not a second spelling of Kepler's third law. See the note at the top.
    return { a, period: keplerPeriod(a) };
}

/**
 * v4474 -- THE THIRD ORBITAL ELEMENT, AND WHAT IT MEANS. The orrery has drawn every orbit in one plane since v4185,
 * and a 3D picture of a flat system is a flat picture. The tilt OUT of that plane is derived the way the axis and
 * the size are: from the vendor tree. It is the body's OPACITY -- the fraction of its bytes nobody can read (wasm,
 * fonts, images, archives): a body that is source text lies in the plane of the readable; one that is mostly a
 * binary tilts out of it, up to MAX_INCLINATION at fully opaque. Measured over the baked tree at v4474: three of
 * fifteen bodies tilt (fonts 0.97, box3d 0.79, wasm 0.63); the other twelve are 0.000 and stay in the ecliptic.
 * The NODE -- where the tilted orbit crosses the plane -- is the body's own phase (world/orreryView.mjs), so at
 * day zero every body is exactly where the 2D page draws it, and the two pictures part only as time runs.
 */
export const OPAQUE_EXT = /\.(wasm|bin|dat|ttf|otf|woff2?|eot|png|jpe?g|gif|webp|bmp|ico|glb|gltf|ktx2?|basis|mp3|ogg|wav|mp4|webm|zip|gz|7z|tar|so|dll|dylib|pdf|sqlite|db)$/i;
export const MAX_INCLINATION = 40 * Math.PI / 180;
/** The fraction of a body's bytes in opaque files, 0..1; 0 for a body with no files (nothing to tilt on). */
export function opacityOf(files) {
    let total = 0, opaque = 0;
    for (const f of Array.isArray(files) ? files : []) {
        if (!f || typeof f.path !== "string") continue;
        const bytes = Math.max(0, Number(f.bytes) || 0);
        total += bytes; if (OPAQUE_EXT.test(f.path)) opaque += bytes;
    }
    return total > 0 ? opaque / total : 0;
}
/** Inclination in radians from an opacity: linear, 0 for source text, MAX_INCLINATION for a body that is all binary. */
export function inclinationFor(opacity) { const o = Number(opacity); return MAX_INCLINATION * (Number.isFinite(o) ? Math.min(1, Math.max(0, o)) : 0); }

/** Size from the body's byte count. Cube root, so a library a thousand times larger is ten times wider. */
export function radiusFor(bytes, opts = {}) {
    const scale = opts.sizeScale ?? 0.06;
    return Math.max(0.15, Math.cbrt(Math.max(1, bytes || 1)) * scale / 10);
}

/**
 * Build the system.
 *
 * @param bodies [{ name, paths: [...], bytes, arrived: "YYYY-MM-DD", reached?: true }]
 * @param opts.today  the date to measure ages against, so a gate is not at the mercy of the clock
 */
export function buildOrrery(bodies = [], opts = {}) {
    // A string is a calendar day; a Date is an instant. Both are accepted because a gate wants the first
    // (so it is not at the mercy of the clock) and a browser has only the second.
    const today = opts.today instanceof Date ? opts.today
                : opts.today ? new Date(opts.today + "T00:00:00Z") : new Date();
    const out = bodies.map((b) => {
        // *** THE PATH LIST MAY ARRIVE UNDER EITHER NAME, AND GETTING THIS WRONG IS A FALSE ACCUSATION. ***
        // The scanner hands over `paths`; the baked orrery.json carries `files` ([{path, bytes}]) and no
        // `paths`, because storing both would be the same list twice. Reading only `paths` meant every body
        // loaded from the bake had licenceFor(undefined) -> found: false -> UNPAPERED, so the browser drew all
        // fourteen in the ratchet's red while the node gate read twelve as CAPTURED. Nothing threw and the
        // page looked fine; it was simply accusing twelve properly licensed dependencies of having no licence.
        const paths = Array.isArray(b.paths) ? b.paths
                    : Array.isArray(b.files) ? b.files.map((f) => (f && f.path) || "") : [];
        const lic = b.reached ? { found: false, path: null, depth: -1 } : licenceFor(paths);
        const state = b.reached ? REACHED : (lic.found ? CAPTURED : UNPAPERED);
        const arrived = b.arrived ? new Date(b.arrived + "T00:00:00Z") : null;
        // *** FLOOR, NOT ROUND, AND THE DIFFERENCE IS VISIBLE. *** "Days since it arrived" is 0 all through
        // the day it arrived and 1 all through the next. Math.round made it tick over at NOON instead: the
        // node gate, which passes a midnight date, read krbn at a = 9.6 while the browser -- running at
        // 18:00 on the same day, against the same orrery.json -- drew it at a = 10.20 with a period a whole
        // 18 units longer. Two readings of one tree that disagreed because one of them was half a day early.
        const days = arrived ? Math.max(0, Math.floor((today - arrived) / 86400000)) : 0;
        const orb = orbitFor(days, opts);
        const opacity = opacityOf(Array.isArray(b.files) ? b.files : null);
        // *** ageKnown, BECAUSE THE SCANNER IS RIGHT AND THE FIRST VERSION OF THIS WAS NOT. ***
        // tools/ship/orreryScan.mjs says of a null date: "a real answer (a shallow clone, or a path never
        // committed) and is NOT the same as 'arrived today'". This function then put both on day 0, which is
        // the innermost, fastest orbit -- so a body git simply could not date was drawn as the newest arrival
        // in the system. It still has to be drawn SOMEWHERE, and the inner orbit is the least-committal
        // placement; what was missing is that the picture never said which it was. A renderer can now mark it.
        return {
            name: b.name, state, licence: lic.path, licenceDepth: lic.depth,
            arrived: b.arrived || null, ageDays: days, ageKnown: !!arrived,
            a: orb.a, period: orb.period, radius: radiusFor(b.bytes, opts),
            // v4474 -- the third element: how far out of the readable plane, from what cannot be read
            opacity, inclination: inclinationFor(opacity),
            bytes: Math.max(0, Number(b.bytes) || 0),
            // the git half of the seed, and whether it is really there -- world/orrerySeed.mjs explains why
            // the NAME is folded in with it (nine bodies share one first commit)
            sha: b.sha || null,
            seed: seedFor(b.sha, b.name),
            seedSourced: seedProvenance(b.sha).sourced,
            // carried through for the TERRAIN scale -- world/orreryView.mjs turns these into heightfield entries
            files: Array.isArray(b.files) ? b.files : null,
            parent: b.parent || "SweK",
        };
    });
    // sorted by orbit so a renderer draws them outward, and a diff between rounds is readable
    out.sort((x, y) => x.a - y.a || x.name.localeCompare(y.name));
    return {
        centre: "SweK",
        bodies: out,
        captured: out.filter((b) => b.state === CAPTURED).length,
        unpapered: out.filter((b) => b.state === UNPAPERED).map((b) => b.name),
        reached: out.filter((b) => b.state === REACHED).length,
    };
}

/** A readable report, for a console. */
export function report(system) {
    const l = [`orrery: ${system.bodies.length} bodies around ${system.centre}`,
               `  captured ${system.captured} · reached ${system.reached} · UNPAPERED ${system.unpapered.length}`];
    if (system.unpapered.length) l.push("    no licence provenance in the tree: " + system.unpapered.join(", "));
    return l.join("\n");
}

/**
 * *** THE RATCHET. *** A vendored body with no licence provenance is not a rendering problem, it is a thing
 * this repository is shipping without saying it may. The count may only go DOWN.
 */
/**
 * *** THE RATCHET REACHED ZERO, AND NOBODY KNEW FOR FORTY-FIVE ROUNDS. ***
 *
 * It was 2 -- box3d and htmx, the two bodies backlog #61 named as "vendored with no licence provenance in the
 * tree". Both have since gained a LICENSE, and this file could not see it: orrery.json was last baked at v4189
 * and the browser reads the BAKE, not the tree. So the page has been printing "2 of 14 bodies carry no licence
 * provenance" over a tree where the answer is none of 15, and the two staleness gates that say so
 * (orrerySeed-selfcheck, orreryView-selfcheck) have been red on the register since v4279 saying exactly that.
 * v4329 re-baked, because #68's fleet has to enumerate bodies from the same place everything else reads.
 *
 * *** AND THE COMPARISON IS NOW EQUALITY, NOT `<=`, WHICH IS v4258'S LESSON APPLIED HERE. *** citedSources
 * found that a bound is satisfied more easily the looser it gets, so a baseline guarded by `<=` can be edited
 * upward and nothing says so. The debt is exactly measurable, so the baseline must BE it: a newly vendored
 * body with no licence goes red on the next run, and clearing one means editing this number down in the same
 * commit.
 */
export const UNPAPERED_BASELINE = 0;

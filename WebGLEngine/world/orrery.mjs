// FILE: world/orrery.mjs -- v4185
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
export function isLicenceFile(name) {
    if (typeof name !== "string" || !name) return false;
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
    // T^2 = a^3 with GM = 1: the same law physics/orbits/kepler.js integrates, so a body placed here and a
    // body simulated there agree instead of drifting apart.
    return { a, period: Math.sqrt(a * a * a) };
}

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
    const today = opts.today ? new Date(opts.today + "T00:00:00Z") : new Date();
    const out = bodies.map((b) => {
        const lic = b.reached ? { found: false, path: null, depth: -1 } : licenceFor(b.paths);
        const state = b.reached ? REACHED : (lic.found ? CAPTURED : UNPAPERED);
        const arrived = b.arrived ? new Date(b.arrived + "T00:00:00Z") : null;
        const days = arrived ? Math.max(0, Math.round((today - arrived) / 86400000)) : 0;
        const orb = orbitFor(days, opts);
        return {
            name: b.name, state, licence: lic.path, licenceDepth: lic.depth,
            arrived: b.arrived || null, ageDays: days,
            a: orb.a, period: orb.period, radius: radiusFor(b.bytes, opts),
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
export const UNPAPERED_BASELINE = 2;

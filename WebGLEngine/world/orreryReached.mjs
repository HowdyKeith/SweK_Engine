// FILE: world/orreryReached.mjs -- v4330
//
// THE THINGS SweK REACHED AND DID NOT TAKE, placed in the orrery as what they physically are: UNBOUND.
//
// #48, in Keith's framing: "Little Prince micro-planets: cast the Khronos catalogue as the inhabitants."
// The prince VISITS each tiny planet and leaves. He takes nothing. That is not a decoration on top of this
// tree's licence model -- it IS the model. world/orrery.mjs has named three states since v4189:
//
//     CAPTURED   vendored, licence present. The bytes are here.
//     UNPAPERED  vendored, no licence found. The bytes are here and nothing says they may be.
//     REACHED    used but not vendored: streamed, fetched, or linked.
//
// *** AND THE THIRD ONE HAS NEVER HAD A SINGLE BODY. *** ui/orreryDraw.js has carried a colour for it
// (#33ccff, "reached, not vendored: streamed or linked, never copied in") since the renderer was written.
// orrery.json holds fifteen bodies and every one of them is a directory under vendor/. `report()` has printed
// "reached 0" every time it has ever run. A legend entry that has never drawn anything is a claim about this
// repository -- that it reaches nothing -- and the claim is false: two registers in this tree hold 189 such
// sources between them.
//
// ---- *** THE PRODUCER WAS BUILT FOR THIS AND ITS OUTPUT WAS A FALSE ACCUSATION *** ------------------------
// world/reachedLicences.mjs:asBodies() says in its own doc-comment "The register as orbital bodies, for
// world/orrery.mjs -- severity is the body's heft". Its only caller is its own gate. And feeding what it
// returns to buildOrrery, measured:
//
//     buildOrrery(asBodies())  ->  39 UNPAPERED, 0 REACHED
//
// -- because the field that decides the state is `reached`, and the shape emits `vendored: false` instead.
// buildOrrery reads no `reached`, finds no licence in an empty path list, and files all thirty-nine as
// "vendored here with no licence provenance in the tree", including the twenty-two whose licences are OPEN
// and quoted verbatim two files away. The exact defect world/orrery.mjs's own header warns about, from the
// exact function written to prevent it. Fixed at the producer; this module is the consumer it was waiting for.
//
// ---- *** UNBOUND IS A DERIVATION, NOT A STYLING CHOICE *** ------------------------------------------------
// A captured body orbits: its axis comes from its age, its period from physics/orbits/kepler.js, and it comes
// round again. A source this tree read and did not take never entered. So it is not on an ellipse at all --
// it is on a flyby, it passes once, and it leaves. The orbit's shape carries the licence fact, which is
// exactly what orrery.mjs asked for when it said the capture state "is not decoration -- it is what the tree
// is actually allowed to do with it".
//
// The trajectory is the zero-energy case, e = 1, and its closed form is Barker's equation. MEASURED AGAINST
// THE TREE'S OWN INTEGRATOR before a line of it was drawn: starting a state at perihelion and stepping it
// with kepler.js's stepRK4 for 400,000 steps, the integrated position and this closed form agree to a worst
// relative error of 2.6e-14 over forty time units. So the picture is not a curve that looks parabolic; it is
// the same trajectory the tree's physics module produces, in a form a renderer can evaluate at one t.
//
// ---- *** AND THE OBVIOUS TEST FOR "UNBOUND" IS WRONG, WHICH IS THE ROUND'S REAL FINDING *** ----------------
// kepler.js offers semiMajorFromEnergy(E, mu) = (E < 0 ? -mu/(2E) : Infinity). Infinity IS the tree's own way
// of saying "no semi-major axis, this thing is not coming back", so `a === Infinity` looks like the check.
//
// IT IS NOT. A parabola has E EXACTLY ZERO, and exactly zero is the one value a float cannot be trusted to
// land on. Measured over 20,000 states built from the exact parabolic formulae across 4,000 perihelia:
//
//     4,592 of 20,000 came out with E < 0  -- 23% of them -- and semiMajorFromEnergy returned a huge FINITE
//     axis for every one. Worst |E| * q over the whole sweep: 6.9e-16, which is float noise and nothing else.
//
// So a sign test would call nearly a quarter of these bodies bound, and which quarter depends on rounding.
// The honest classification compares against the natural energy scale -- mu/q, the only energy in the problem
// -- and boundnessOf() below returns "parabolic" for |E| <= tol * mu/q rather than reading a sign. THIS IS
// NOT A LOOSENED TEST: it is the only test that has an answer. A sign test on a quantity whose true value is
// zero is measuring the rounding, and the rounding is not about the licence.
"use strict";

import { specificEnergy, semiMajorFromEnergy } from "../physics/orbits/kepler.js";
import { phaseFor } from "./orreryView.mjs";        // the same FNV the captured bodies are spread by
import { fnv1a, SEP } from "./orrerySeed.mjs";      // and the same "fold the name in" rule, for a second draw

/** A body that passes. Frozen so a caller compares against it rather than retyping the string. */
export const FLYBY = "flyby";

/** The three postures a reached source can be in, once the licence question is asked of it. */
export const MAY_TAKE = "may-take";        // open, redistributable: SweK could vendor this and has not
export const MAY_NOT_TAKE = "may-not-take";// read, and the terms forbid it
export const NOT_ASKED = "not-asked";      // the licence has not been read. NOT the same as "nothing wrong".

/**
 * *** THE ONLY LENGTH IN THIS FILE THAT COMES FROM DATA: HOW CLOSE IT CAME. ***
 *
 * A reached source has no bytes in this tree -- that is what reached MEANS -- so it cannot be sized or aged
 * the way a captured body is. What it CAN have is a footprint: the number of files in this repository that
 * exist because of it. world/reachedLicences.mjs records exactly that, per source, in takenPaths (files whose
 * content owes it something) and citedPaths (files that name it). loov/jsfx left seven; twenty-two of the
 * thirty-nine left none at all.
 *
 * More footprint means it came closer. log1p, because that is the rule this tree already uses everywhere a
 * count or a size becomes a length -- world/repoHeightfield.js takes log1p of a file size, and v4329's
 * altitudeFor takes log1p of an importer's bytes. A fourth spelling of "turn a count into a distance" would
 * be a fourth thing to keep in agreement.
 *
 * The scale is FIXED rather than normalised over the population, and that is deliberate: dividing by the
 * largest footprint would move every other body whenever one source gained a citation, so a picture of an
 * unchanged source would change. Here a source's perihelion depends on that source and nothing else.
 */
export function perihelionFor(footprint, opts = {}) {
    const far = opts.farthest ?? 40;      // never touched this tree: passes at the outside
    const near = opts.nearest ?? 16;      // the closest a passing body comes -- see the gate: outside every
    const gain = opts.qGain ?? 8;         // captured orbit, because it was never captured
    const n = Math.max(0, Number(footprint) || 0);
    return Math.max(near, far - Math.log1p(n) * gain);
}

/**
 * When this body is at perihelion, and which way its approach points. Two independent draws from the same
 * hash the rest of the orrery uses, folded the way world/orrerySeed.mjs folds a name in: hash(name + SEP +
 * role). One hash with two roles rather than two hashes, so there is one function to keep honest.
 *
 * The epoch is spread over `loop` -- for the page, the slowest captured period -- so the flybys do not all
 * arrive at once. Without it every one of them would sit at perihelion at t = 0, which is not a picture of
 * things passing, it is a picture of a collision.
 */
export function epochFor(name, loop) {
    const L = Number(loop) > 0 ? Number(loop) : 1;
    return (fnv1a(String(name || "") + SEP + "epoch") / 4294967296) * L;
}

/** The direction of the perihelion, in radians. phaseFor is imported rather than restated: one spreader. */
export function aimFor(name) { return phaseFor(String(name || "") + SEP + "aim"); }

/**
 * *** BARKER'S EQUATION, SOLVED EXACTLY. *** The parabolic anomaly D = tan(nu/2) satisfies
 *
 *     t - T = sqrt(2 q^3 / mu) * (D + D^3 / 3)
 *
 * which is a depressed cubic D^3 + 3D - 3W = 0 in W = (t - T) * sqrt(mu / (2 q^3)). Its discriminant is
 * positive for every real W, so Cardano gives the single real root in closed form and there is no iteration
 * to converge, diverge, or need a step count. That matters here for the same reason orreryBake refuses to
 * bake positions: a picture that has to be integrated from t = 0 to be drawn at t cannot be drawn at t.
 *
 * Returns the full state, position AND velocity, because the velocity is what lets a caller ask kepler.js
 * whether this thing is bound -- and that question is the whole point of drawing it differently.
 *
 * @param q     perihelion distance
 * @param dt    time since perihelion passage (negative is inbound)
 * @param mu    gravitational parameter, matching kepler.js's default of 1
 */
export function barker(q, dt, mu = 1) {
    const Q = Math.max(1e-9, Number(q) || 0);
    const t = Number.isFinite(dt) ? dt : 0;
    const m = Number(mu) > 0 ? Number(mu) : 1;
    const W = t * Math.sqrt(m / (2 * Q * Q * Q));
    const s = Math.sqrt((9 * W * W) / 4 + 1);
    const D = Math.cbrt((3 * W) / 2 + s) + Math.cbrt((3 * W) / 2 - s);
    const nu = 2 * Math.atan(D);
    const r = Q * (1 + D * D);
    // Perifocal velocity of a conic, at e = 1 and semi-latus rectum p = 2q. The general formula, with the
    // eccentricity set to the value that makes it a parabola -- not a parabola-specific rewrite of it.
    const k = Math.sqrt(m / (2 * Q));
    return { x: r * Math.cos(nu), y: r * Math.sin(nu), r, nu, D,
             vx: -k * Math.sin(nu), vy: k * (1 + Math.cos(nu)) };
}

/**
 * Where a reached body is at time t, in the orrery's own frame: the flyby rotated so its perihelion points
 * along the body's aim, and shifted so perihelion happens at its epoch.
 *
 * @param body  { name, q, epoch, aim } from reachedBodyFor
 * @param tDays the same days the captured bodies' axes are measured in
 */
export function flybyAt(body, tDays = 0, mu = 1) {
    const q = Number(body && body.q) || 1;
    const aim = Number(body && body.aim) || 0;
    const epoch = Number(body && body.epoch) || 0;
    const t = Number.isFinite(tDays) ? tDays : 0;
    const s = barker(q, t - epoch, mu);
    const c = Math.cos(aim), sn = Math.sin(aim);
    return {
        x: s.x * c - s.y * sn, y: s.x * sn + s.y * c,
        vx: s.vx * c - s.vy * sn, vy: s.vx * sn + s.vy * c,
        r: s.r, nu: s.nu, sincePerihelion: t - epoch,
    };
}

/**
 * Bound, parabolic, or hyperbolic -- asked of kepler.js and answered against the problem's own energy scale.
 * See the header: the sign of E is not usable when the true E is zero, and 23% of exactly-parabolic states
 * measured here read negative. `tol` is in units of mu/q, so it means the same thing at every perihelion.
 */
export function boundnessOf(state, mu = 1, q = 1, tol = 1e-9) {
    const E = specificEnergy(state, mu);
    const scale = (Number(mu) || 1) / Math.max(1e-9, Number(q) || 1);
    const a = semiMajorFromEnergy(E, mu);
    if (Math.abs(E) <= tol * scale) return { kind: "parabolic", bound: false, energy: E, a, scale };
    return { kind: E < 0 ? "elliptical" : "hyperbolic", bound: E < 0, energy: E, a, scale };
}

/**
 * One reached source as a body.
 *
 * *** NO RADIUS IS DERIVED, AND THAT IS THE SECOND REFUSAL IN THIS FILE. *** A captured body's radius is the
 * cube root of its byte count. A reached source has no bytes here. The tempting substitutes are all
 * properties of the thing as PUBLISHED rather than of anything this tree holds -- a Khronos model's variant
 * count is how many encodings Khronos offers, a repository's star count is not in the tree at all -- so
 * drawing one as a size would be inventing a size out of a directory listing. Every reached body is drawn at
 * the same minimum, because you cannot see how big a thing you did not take. world/orreryView.mjs refused
 * eccentricity on exactly this ground; this is the same refusal about the other axis.
 */
export function reachedBodyFor(src, opts = {}) {
    const name = String((src && src.name) || "");
    const footprint = Math.max(0, Number(src && src.footprint) || 0);
    const q = perihelionFor(footprint, opts);
    return {
        name, reached: true, kind: FLYBY,
        q, aim: aimFor(name), epoch: epochFor(name, opts.loop ?? 1),
        footprint,
        may: (src && src.may) || NOT_ASKED,
        register: (src && src.register) || null,     // which register this came out of, so a reader can go read it
        licenceUrl: (src && src.licenceUrl) || null,
        radius: opts.radius ?? 0.15,                 // the floor world/orrery.mjs's radiusFor already clamps to
    };
}

/** Many of them, sorted by name so a filesystem or object-key order cannot change the picture. */
export function reachedBodies(sources = [], opts = {}) {
    return sources.map((s) => reachedBodyFor(s, opts)).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The register in world/reachedLicences.mjs, as sources this module can place.
 *
 * The footprint is takenPaths + citedPaths, which is the register's own record of what this repository owes
 * each source. `may` collapses severityOf's five levels to the one question a picture can carry: could SweK
 * take this? OPEN says yes and it has not; everything else says no, for a reason the register states.
 */
export function fromReachedRegister(sources = [], severityOf = null) {
    return sources.map((e) => {
        const taken = (e && e.takenPaths) || [], cited = (e && e.citedPaths) || [];
        const sev = typeof severityOf === "function" ? severityOf(e) : (e && e.severity);
        return {
            name: String((e && e.repo) || ""),
            footprint: taken.length + cited.length,
            may: sev === 0 ? MAY_TAKE : MAY_NOT_TAKE,
            register: "world/reachedLicences.mjs",
            licenceUrl: (e && e.sourceUrl) || null,
        };
    });
}

/**
 * The Khronos glTF sample catalogue, as sources this module can place. #48's inhabitants.
 *
 * *** THE FOOTPRINT HERE HAD TO BE MEASURED NARROWLY, AND TWO WIDER MEASUREMENTS WERE WRONG FIRST. ***
 * The obvious question -- which of the 150 models does this tree name? -- came back 148 OF 150, because the
 * scan included gpu/khronosSamples.mjs, which holds all 150 names. The catalogue counted its own catalogue.
 * Excluding it gives 13, and those are still almost all coincidence: DirectionalLight matched 63 times as
 * three.js's light class, Box 30 in a BZFlag map parser, Cameras 26 as a UI panel label, Cube 21 and Triangle
 * 12 as the vocabulary of any 3D engine. Placing thirteen planets by that would have placed them by English.
 *
 * So a model counts as reached only when a file that IMPORTS the catalogue names it as a whole string literal
 * -- an actual request for that model. Measured: one caller, glb_viewer.html, and one model, the Fox. The
 * other 149 are reachable (the page fills its <select> from models()) and have never been asked for by name.
 *
 * @param names     the catalogue, in its own order
 * @param visited   the names actually requested, from tools/ship/orreryReachedScan.mjs
 * @param mayVendor gpu/khronosSamples.mjs's own function -- passed in, so this file stays pure of that import
 */
export function fromKhronos(names = [], visited = [], mayVendor = null) {
    const seen = new Set(visited);
    return names.map((n) => {
        const v = typeof mayVendor === "function" ? mayVendor(n) : null;
        // *** FAILS CLOSED THE SAME WAY mayVendor DOES. *** "not read" is its own answer here rather than
        // being folded in with "read and refused": 134 of the 150 have never had their licence opened, and a
        // picture that drew those as forbidden would be reporting a decision nobody has made.
        const may = !v ? NOT_ASKED
                  : v.posture === "unknown" ? NOT_ASKED
                  : v.ok ? MAY_TAKE : MAY_NOT_TAKE;
        return { name: String(n), footprint: seen.has(n) ? 1 : 0, may,
                 register: "gpu/khronosSamples.mjs", licenceUrl: (v && v.licenceUrl) || null };
    });
}

/** How many of these are inside a given radius at time t -- what a frame can actually show. */
export function passingWithin(bodies = [], tDays = 0, radius = Infinity, mu = 1) {
    let n = 0;
    for (const b of bodies) if (flybyAt(b, tDays, mu).r <= radius) n++;
    return n;
}

/**
 * A digest of the whole population, for a gate and a readout: the counts by posture and by register, and the
 * closest approach anyone makes. Derived from the bodies, never typed beside them.
 */
export function reachedDigest(bodies = []) {
    const byMay = {}, byRegister = {};
    let closest = Infinity, touched = 0;
    for (const b of bodies) {
        byMay[b.may] = (byMay[b.may] || 0) + 1;
        if (b.register) byRegister[b.register] = (byRegister[b.register] || 0) + 1;
        closest = Math.min(closest, b.q);
        if (b.footprint > 0) touched++;
    }
    return { total: bodies.length, byMay, byRegister, touched,
             closest: bodies.length ? closest : null };
}

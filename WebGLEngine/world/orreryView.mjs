// FILE: world/orreryView.mjs -- v4186
//
// THE VIEW MODEL FOR THE ORRERY. Pure: no DOM, no GL, no fs, so orrery.html and a gate see the same numbers.
// world/orrery.mjs says WHAT the bodies are; this says WHERE they are at a given moment and WHICH SCALE the
// viewer is looking at them from.
//
// *** THE ZOOM IS ONE AXIS, NOT THREE PAGES. *** Keith's framing: micro planet -> terrain view. The three
// scales are the same data read at three magnifications --
//
//     SYSTEM   the whole orrery: SweK at centre, every vendored body in orbit
//     PLANET   one body as a micro planet, sized by its byte count
//     TERRAIN  that same body's file tree as ground, via world/repoHeightfield.js
//
// and the level is chosen by a MEASURED quantity -- how many pixels across the focused body currently is --
// rather than by a mode flag someone sets. A body you have zoomed until it fills the screen IS at planet
// scale; that is not a separate opinion from its apparent size.
//
// *** THE ORBITS ARE CIRCLES, AND THAT IS A STATEMENT RATHER THAN A SHORTCUT. *** A circle is the e = 0 case
// of Kepler's, and every number in it is derived: age gives the semi-major axis, the axis gives the period
// through physics/orbits/kepler.js, the period gives the angular rate. Giving each body an eccentricity would
// look better and mean nothing -- there is no quantity in a vendored directory that IS its eccentricity, so
// it would be a number invented to be drawn. When one turns up, this is where it goes.
"use strict";

/** The three magnifications. Ordered, so a comparison between them is meaningful. */
export const ZOOM_SYSTEM = 0;
export const ZOOM_PLANET = 1;
export const ZOOM_TERRAIN = 2;
export const ZOOM_NAMES = Object.freeze(["system", "planet", "terrain"]);

/**
 * The thresholds, in pixels of apparent body diameter. Chosen from what the scale can actually SHOW:
 * under ~120px a micro planet is a dot with no readable surface, and under ~900px a treemapped file tree
 * cannot be read at all -- vendor/krbn has 233 files, which is under 4px each at 900px across.
 */
export const PLANET_PX = 120;
export const TERRAIN_PX = 900;

/**
 * Which scale a body of this apparent size is being viewed at.
 * @param px apparent diameter in screen pixels
 */
export function levelFor(px) {
    const d = Number.isFinite(px) ? px : 0;
    if (d >= TERRAIN_PX) return ZOOM_TERRAIN;
    if (d >= PLANET_PX) return ZOOM_PLANET;
    return ZOOM_SYSTEM;
}

/**
 * A body's starting angle. Deterministic from the name, so the same tree always draws the same picture and a
 * screenshot from one machine can be compared with another's. Without it every body would sit on the same ray
 * at t = 0 and the system would open as a straight line rather than an orrery.
 *
 * FNV-1a over the name, then into [0, 2*PI). The hash is not cryptographic and does not need to be; it needs
 * to be the same everywhere, which integer arithmetic in a 32-bit lane is.
 */
export function phaseFor(name) {
    let h = 0x811c9dc5;
    const s = String(name == null ? "" : name);
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i) & 0xff;
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return (h / 4294967296) * 2 * Math.PI;
}

/**
 * Where a body is at time t.
 *
 * The angular rate is 2*PI / period and NOTHING ELSE -- no speed field, no per-body multiplier. That is the
 * whole point of deriving the period from the axis last round: a body further out is drawn slower because it
 * IS slower, so the picture cannot drift from the physics.
 *
 * @param body  a body from buildOrrery: needs { name, a, period }
 * @param tDays simulation time in the same days the axis is measured in
 */
export function positionAt(body, tDays = 0) {
    const a = Number(body && body.a) || 0;
    const period = Number(body && body.period) || 0;
    const t = Number.isFinite(tDays) ? tDays : 0;
    // A zero or missing period would divide by zero. It cannot happen for a real body -- kepler's period is
    // positive for every positive axis -- so this holds the body still rather than inventing a rate for it.
    const angle = phaseFor(body && body.name) + (period > 0 ? (2 * Math.PI * t) / period : 0);
    return { x: a * Math.cos(angle), y: a * Math.sin(angle), angle, a };
}

/**
 * v4474 -- Where a body is at time t, IN THREE AXES. positionAt's circle, rotated: the orbit is tilted by the
 * body's `inclination` about the line of nodes, and the ascending node is the body's own phase, so u = 2*PI*t/period
 * is the angle past the node and at t = 0 the body is exactly where positionAt puts it (z = 0). The classical form:
 *   x = a (cosO cos u - sinO sin u cos i),  y = a (sinO cos u + cosO sin u cos i),  z = a sin u sin i.
 * With i = 0 this IS positionAt to rounding, which is why the 2D page keeps drawing positionAt and loses nothing:
 * its picture is the ecliptic with every orbit unrolled into it, not a view from above.
 *
 * @param body  needs { name, a, period, inclination? } -- a missing inclination is 0, the plane
 */
export function positionAt3(body, tDays = 0) {
    const a = Number(body && body.a) || 0;
    const period = Number(body && body.period) || 0;
    const inc = Number(body && body.inclination) || 0;
    const t = Number.isFinite(tDays) ? tDays : 0;
    const node = phaseFor(body && body.name);
    const u = period > 0 ? (2 * Math.PI * t) / period : 0;
    const cO = Math.cos(node), sO = Math.sin(node), cu = Math.cos(u), su = Math.sin(u), ci = Math.cos(inc), si = Math.sin(inc);
    return { x: a * (cO * cu - sO * su * ci), y: a * (sO * cu + cO * su * ci), z: a * su * si, angle: node + u, a, inclination: inc, node };
}

/**
 * Apparent diameter in pixels, given how many pixels one orbital unit covers.
 * `radius` on a body is a radius, so the diameter is twice it -- the thresholds above are diameters because
 * that is what a viewer judges "how big is it on screen" by.
 */
export function apparentPx(body, pxPerUnit) {
    return 2 * (Number(body && body.radius) || 0) * (Number(pxPerUnit) || 0);
}

/**
 * The entries world/repoHeightfield.js consumes, for the TERRAIN scale.
 *
 * *** BYTES ARE PASSED AS THE SIZE, AND NO LINE COUNT IS INVENTED. *** repoHeightfield's `lines` is documented
 * as "the size that becomes both area and height", and it takes log1p of it -- so a byte count is exactly the
 * kind of quantity it wants. Dividing bytes by some bytes-per-line guess to produce a fake `lines` would
 * change nothing about the picture (log1p of a scaled weight shifts every leaf together) while putting a
 * number in the data that no file in the tree has.
 */
export function terrainEntriesFor(body) {
    const files = (body && body.files) || [];
    return files.map((f) => ({ path: String(f.path || ""), lines: Math.max(0, Number(f.bytes) || 0) }));
}

/** The furthest orbit, so a renderer can frame the whole system without guessing. */
export function extentOf(system) {
    const bodies = (system && system.bodies) || [];
    let far = 0;
    for (const b of bodies) far = Math.max(far, (Number(b.a) || 0) + (Number(b.radius) || 0));
    return far;
}

/**
 * How long the whole system takes to return to its starting arrangement -- or rather, the honest answer:
 * it generally never does. The periods are irrational multiples of one another, so there is no common return.
 * What a scrub bar CAN offer is the slowest body's period, after which the outermost body has come round once
 * and every inner one has lapped it some non-integer number of times. That is the useful loop length, and
 * calling it a "period of the system" would be wrong.
 */
export function slowestPeriod(system) {
    const bodies = (system && system.bodies) || [];
    let p = 0;
    for (const b of bodies) p = Math.max(p, Number(b.period) || 0);
    return p;
}

// WebGLEngine/brain/subCountermeasures.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_COUNTERMEASURES_WIP.md, the command tools/ship/takeCountermeasures.mjs, the gate brain/subCountermeasures-selfcheck.mjs)
//
// WHAT A SUBMARINE CAN THROW AT A TORPEDO: a DECOY (a drifting noisemaker that the seeker prefers because it is louder than the boat), a BUBBLE SCREEN (a curtain that costs the seeker decibels on any line through it) and an ANTI-TORPEDO INTERCEPTOR (a small fast torpedo that listens
// for launched torpedoes). physics/mechanics/subTorpedo.mjs says it has "no decoys or countermeasures ... each an addition"; the additions there are three options (a target's `sl`, `screens`, `params`) and this module holds the rest: the three entities, their inventory, the stepping, the arenas' one-call
// interface (createCm) and the tactician's wrapper (withCountermeasures). **THE NUMBERS IN CM ARE MY CHOICES, NOT MEASUREMENTS** (brain/SUB_COUNTERMEASURES_WIP.md section 0 says so and so does every line that reports them).
//
//   DECOY        a source of CM.decoy.sl dB (a boat at full speed is 119, a launched torpedo 125) released at the boat's position, drifting at CM.decoy.drift m/s on a heading 90 degrees off the boat's (alternating sides), for CM.decoy.life s; a boat carries CM.decoy.count, CM.decoy.spacing s apart.
//                The seeker's rule is unchanged (the LOUDEST thing in its cone), so it takes the decoy whenever the decoy is in the cone; a torpedo that detonates on a decoy damages nothing.
//   SCREEN       a sphere of CM.screen.r m left where it was released for CM.screen.life s (CM.screen.count a boat): the seeker loses CM.screen.db dB on a line through it (one screen counts once). The proximity fuse is physical and is not touched.
//   INTERCEPTOR  launched along the bearing of a heard torpedo (the boat has a bearing and an elevation, no range): cruise 9 m/s, 20 s of burn, 0.4 rad/s, a 50-degree half-cone, armed after 15 m, the torpedo's own ears; it hears LAUNCHED TORPEDOES (125 dB) of the other side and detonates inside the fuse's 8 m,
//                destroying the torpedo. It is SILENT to the boats (a simplification, said). CM.interceptor.count a boat.
//   THE TACTICIAN a wrapper: when a heard torpedo's SNR first reaches the thresholds it sets decoy / screen / intercept on the order (the SNR is the only distance a passive boat has: 22 dB is about 330 m, 24 about 270). The wrapper rate-limits itself; the arena enforces the inventory.
//
// Pure: no DOM, no clock, no Math.random. Everything is deterministic from the arena's own ticks.
"use strict";
import * as K from "../physics/mechanics/subSonar.mjs";
import * as Tp from "../physics/mechanics/subTorpedo.mjs";

export const CM = Object.freeze({
    decoy: Object.freeze({ sl: 130, drift: 1.2, life: 40, count: 3, spacing: 6 }),
    screen: Object.freeze({ r: 20, db: 20, life: 30, count: 2, spacing: 10 }),
    interceptor: Object.freeze({ count: 2, spacing: 5, params: Object.freeze({ launchSpeed: 4, cruise: 9, accel: 3, turnRate: 0.4, pitchRate: 0.25, endurance: 20, armDistance: 15, halfCone: 50 * Math.PI / 180 }) }),
    tactician: Object.freeze({ decoySnr: 22, screenSnr: 22, interceptSnr: 24, decoyEvery: 6, screenEvery: 10, interceptEvery: 5 }),
    ids: Object.freeze({ decoy: 2000, torpedo: 3000, interceptor: 4000 }),
});
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** An inventory: which of the three a boat carries. `enabled` is { decoy, screen, interceptor } (booleans); a missing one is not carried. */
export const kitOf = (enabled = {}) => ({ decoy: enabled.decoy ? CM.decoy.count : 0, screen: enabled.screen ? CM.screen.count : 0, interceptor: enabled.interceptor ? CM.interceptor.count : 0 });
export const KIT_NONE = Object.freeze(kitOf({}));
export const KIT_ALL = Object.freeze(kitOf({ decoy: true, screen: true, interceptor: true }));
/** True for a kit that carries something. */
export const carries = (kit) => !!kit && (kit.decoy > 0 || kit.screen > 0 || kit.interceptor > 0);

/**
 * The countermeasures of one fight. `kits` is { boatId: kit }. Returns an object the arena calls:
 *   order(boatId, cmd, platform, tick, dt) -> [event]   the boat's order at a look: cmd.decoy / cmd.screen / cmd.intercept ({ bearing (absolute), elevation }) release what the inventory and the spacing allow; platform is { pos, heading, pitch }.
 *   decoyTargets() -> [target]                           the decoys as targets for an ordinary torpedo (ids from CM.ids.decoy up, with `sl`).
 *   screenList() -> [{ pos, r, db }] or null             the screens for stepTorpedo's `screens`.
 *   isDecoy(id)                                          is a torpedo event's target a decoy.
 *   stepInterceptors(torps, { dt, tick, seed, floor, hostile }) -> [{ index, torpedo, owner, interceptor }]   steps every interceptor against the torpedoes `hostile(torpedo, interceptor)` calls hostile (default: another owner's) and returns the torpedoes destroyed (the arena marks them).
 *   step(dt)                                             ages and moves the decoys, ages the screens.
 *   stats, inventory                                     counts for the report.
 */
export function createCm(kits = {}) {
    const decoys = [], screens = [], interceptors = [], stats = { decoysReleased: 0, screensReleased: 0, interceptorsLaunched: 0, decoyed: 0, intercepted: 0 };
    const inventory = {}; for (const id of Object.keys(kits)) inventory[id] = { ...kits[id], lastDecoy: -Infinity, lastScreen: -Infinity, lastIntercept: -Infinity, side: 1 };
    let nextDecoy = 0, nextScreen = 0, nextInterceptor = 0;
    const ready = (last, spacing, tick, dt) => tick - last >= Math.round(spacing / dt);   // whole ticks: no float edge at the spacing
    return {
        stats, inventory,
        order(boatId, cmd, platform, tick, dt) {
            const inv = inventory[boatId], ev = []; if (!inv || !cmd) return ev;
            if (cmd.decoy === true && inv.decoy > 0 && ready(inv.lastDecoy, CM.decoy.spacing, tick, dt)) {
                inv.decoy--; inv.lastDecoy = tick; inv.side = -inv.side;
                const hd = wrap(platform.heading + inv.side * Math.PI / 2), id = CM.ids.decoy + nextDecoy++;
                decoys.push({ id, owner: boatId, pos: [platform.pos[0], platform.pos[1], platform.pos[2]], vel: [CM.decoy.drift * Math.cos(hd), -CM.decoy.drift * Math.sin(hd), 0], heading: hd, speed: CM.decoy.drift, sl: CM.decoy.sl, age: 0 });
                stats.decoysReleased++; ev.push({ type: "decoy", boat: boatId, id });
            }
            if (cmd.screen === true && inv.screen > 0 && ready(inv.lastScreen, CM.screen.spacing, tick, dt)) {
                inv.screen--; inv.lastScreen = tick;
                const id = nextScreen++; screens.push({ id, owner: boatId, pos: [platform.pos[0], platform.pos[1], platform.pos[2]], r: CM.screen.r, db: CM.screen.db, age: 0 });
                stats.screensReleased++; ev.push({ type: "screen", boat: boatId, id });
            }
            if (cmd.intercept && Number.isFinite(cmd.intercept.bearing) && inv.interceptor > 0 && ready(inv.lastIntercept, CM.interceptor.spacing, tick, dt)) {
                inv.interceptor--; inv.lastIntercept = tick;
                const id = CM.ids.interceptor + nextInterceptor++;
                interceptors.push(Tp.launch(boatId, { pos: platform.pos, heading: cmd.intercept.bearing, pitch: clamp(Number.isFinite(cmd.intercept.elevation) ? cmd.intercept.elevation : 0, -0.6, 0.6) }, { id, params: CM.interceptor.params }));
                stats.interceptorsLaunched++; ev.push({ type: "interceptor", boat: boatId, id });
            }
            return ev;
        },
        decoyTargets: () => decoys.map((d) => ({ id: d.id, pos: d.pos, heading: d.heading, speed: d.speed, sl: d.sl })),
        screenList: () => (screens.length ? screens.map((s) => ({ pos: s.pos, r: s.r, db: s.db })) : null),
        isDecoy: (id) => id >= CM.ids.decoy && id < CM.ids.torpedo,
        stepInterceptors(torps, { dt = 1 / 30, tick = 0, seed = 0, floor = Tp.TORPEDO.maxDepth, hostile = (t, q) => t.owner !== q.owner } = {}) {
            const killed = [];
            for (let k = 0; k < interceptors.length; k++) {
                const q = interceptors[k]; if (q.status !== "running") continue;
                const targets = [], at = [];
                torps.forEach((t, index) => { if (t.status === "running" && hostile(t, q)) { targets.push({ id: CM.ids.torpedo + t.id, pos: t.pos, heading: t.heading, speed: t.speed, sl: K.SONAR.torpedoSL }); at.push(index); } });
                const r = Tp.stepTorpedo(q, targets, { dt, tick, seed, floor, params: CM.interceptor.params }); interceptors[k] = r.torpedo;
                if (r.event) { const index = at.find((i) => CM.ids.torpedo + torps[i].id === r.event.target); if (index !== undefined) { killed.push({ index, torpedo: torps[index].id, owner: q.owner, interceptor: q.id }); stats.intercepted++; } }
            }
            for (let k = interceptors.length - 1; k >= 0; k--) if (interceptors[k].status !== "running") interceptors.splice(k, 1);
            return killed;
        },
        step(dt) {
            for (const d of decoys) { d.pos = [d.pos[0] + d.vel[0] * dt, d.pos[1] + d.vel[1] * dt, d.pos[2]]; d.age++; }
            for (const s of screens) s.age++;
            for (let i = decoys.length - 1; i >= 0; i--) if (decoys[i].age >= Math.round(CM.decoy.life / dt)) decoys.splice(i, 1);   // ages are ticks: whole numbers, no float edge at the life
            for (let i = screens.length - 1; i >= 0; i--) if (screens[i].age >= Math.round(CM.screen.life / dt)) screens.splice(i, 1);
        },
        counts: () => ({ decoys: decoys.length, screens: screens.length, interceptors: interceptors.length }),
    };
}

/**
 * A tactician with the countermeasure rule around it: `decide` is any tactician (obs -> order); `theta` is CM.tactician or a { decoySnr, screenSnr, interceptSnr, decoyEvery, screenEvery, interceptEvery }; `enabled` is { decoy, screen, interceptor }.
 * The louder (closer) of the heard torpedoes is the one it reacts to; a release is asked for at most once per ...Every seconds. The order is the wrapped tactician's with decoy / screen / intercept added; nothing else changes.
 */
export function withCountermeasures(decide, theta = CM.tactician, enabled = { decoy: true, screen: true, interceptor: true }) {
    let lastDecoy = -Infinity, lastScreen = -Infinity, lastIntercept = -Infinity;
    return function (obs) {
        const out = decide(obs) || {}, torp = obs.contacts.filter((c) => c.kind === "torpedo");
        if (torp.length) {
            const c = torp.reduce((a, b) => (b.snr > a.snr ? b : a)), t = obs.t;
            if (enabled.decoy && c.snr >= theta.decoySnr && t - lastDecoy >= theta.decoyEvery) { out.decoy = true; lastDecoy = t; }
            if (enabled.screen && c.snr >= theta.screenSnr && t - lastScreen >= theta.screenEvery) { out.screen = true; lastScreen = t; }
            if (enabled.interceptor && c.snr >= theta.interceptSnr && t - lastIntercept >= theta.interceptEvery) { out.intercept = { bearing: wrap(obs.self.heading + c.bearing), elevation: c.elevation }; lastIntercept = t; }
        }
        return out;
    };
}

/** The lines that say what the numbers are (every report of this module prints them: they are choices). */
export function reportLines() {
    const D = CM.decoy, S = CM.screen, I = CM.interceptor, P = I.params, Tt = CM.tactician;
    return [`[subCountermeasures] THE NUMBERS ARE CHOSEN, NOT MEASURED: decoy ${D.sl} dB drifting ${D.drift} m/s for ${D.life} s (${D.count} a boat, ${D.spacing} s apart); screen ${S.r} m, ${S.db} dB for ${S.life} s (${S.count} a boat); interceptor ${P.cruise} m/s for ${P.endurance} s, ${(P.halfCone * 180 / Math.PI).toFixed(0)} deg cone (${I.count} a boat)`,
        `  the tactician releases at heard-torpedo SNR ${Tt.decoySnr} dB (decoy), ${Tt.screenSnr} (screen), ${Tt.interceptSnr} (interceptor); the torpedo's own seeker hears a 130 dB decoy from ${K.rangeWhere((r) => Tp.seekerSNR(D.sl, r)).toFixed(0)} m and a 2 m/s boat from ${Tp.seekerRange(2).toFixed(0)} m`];
}

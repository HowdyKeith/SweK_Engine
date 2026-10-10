// WebGLEngine/brain/roster.mjs -- v4827
//
// THE LINEUP OF A RACE, AS DATA: for each of up to four cars, which brain DRIVES it and which brain works its TURRET, chosen from what the page holds, and resolved to the
// weight vectors brain/drivePolicy.mjs and brain/gunnerPolicy.mjs race. race-brain.html's "Load Racers" panel is this module with a table around it.
//
// *** WHAT A "BRAIN" IS ON THIS PAGE, SAID ONCE, BECAUSE THE PANEL'S WORDS DEPEND ON IT. *** Every driver is the SAME network -- 9 features into the 46 real E-PG compass
// neurons of a fly's central complex and their 842 real synapses, out to steer and drive -- and every gunner the SAME network over the Giant Fiber circuit. What differs
// between "hand", "stored", "peer" and "zero" is the WEIGHTS: hand-set rules written through the net, a vector of zeros (does nothing), noise on either, the vector
// trained in idle time by the tree's (1+1)-ES (the GPU Brain's shape, stored in this browser), or a vector imported from a peer. So a lineup is a choice of weights.
// A different ARCHITECTURE -- a plain dense net, the pilot policy, a tactics policy -- is a different policy module with its own features and outputs, and is not on
// this list until it has the driver or gunner contract (features -> steer/drive, features -> yaw/pitch/fire/drop/ignite).
//
// Pure: no DOM, no storage, no clock. The page hands it what it holds (ctx) and gets the race's inputs back; a seeded rng is the caller's, consumed in slot order, so a
// lineup is a function of (specs, ctx, seed) and the same lineup races to the same fingerprint.
"use strict";

export const SLOTS = 4;
export const SLOT_COLOURS = Object.freeze(["red", "green", "yellow", "purple"]);
export const AUTO = "auto", NONE = "none";
export const NOISE_05 = 0.05, NOISE_10 = 0.1;
const isLib = (id) => typeof id === "string" && id.startsWith("lib:");

/** Four slots, every choice "auto": the lineup the page raced before there was a panel (resolveRoster reproduces it exactly; the gate holds that). */
export const defaultSpecs = () => Array.from({ length: SLOTS }, () => ({ driver: AUTO, gunner: AUTO }));

/** Read specs back from untrusted JSON (storage, a URL): anything malformed becomes "auto" and an unknown id is kept to be refused by name at resolve. Never throws. */
export function sanitizeSpecs(raw) {
    const out = defaultSpecs();
    if (!Array.isArray(raw)) return out;
    for (let i = 0; i < SLOTS && i < raw.length; i++) {
        const r = raw[i]; if (!r || typeof r !== "object") continue;
        if (typeof r.driver === "string" && r.driver.length < 64) out[i].driver = r.driver;
        if (typeof r.gunner === "string" && r.gunner.length < 64) out[i].gunner = r.gunner;
    }
    return out;
}

/**
 * What can be chosen RIGHT NOW. ctx: { stored, storedGun, library: { drive: [{id,label,weights}], gun: [...] } } -- a source that needs something the page does not hold is not offered
 * (no "stored brain" before one has been trained). Returns { driver: [{id,label}], gunner: [{id,label}] }.
 */
export function choices(ctx) {
    const lib = ctx.library || { drive: [], gun: [] };
    const driver = [{ id: AUTO, label: "default for this car" }];
    if (ctx.stored) driver.push({ id: "stored", label: "stored brain (trained in idle time)" }, { id: "storednoise", label: "stored brain + noise 0.05" });
    driver.push({ id: "hand", label: "hand weights" }, { id: "noise05", label: "hand + noise 0.05" }, { id: "noise10", label: "hand + noise 0.1" }, { id: "zero", label: "zero (does not drive)" });
    if (lib.drive.length) driver.push({ id: "peer", label: "peer brain (the latest imported)" });
    for (const e of lib.drive) driver.push({ id: e.id, label: "imported: " + e.label });
    driver.push({ id: NONE, label: "(no car in this slot)" });
    const gunner = [{ id: AUTO, label: "default for this car" }];
    if (ctx.storedGun) gunner.push({ id: "stored", label: "stored gunner (trained in idle time)" });
    gunner.push({ id: "hand", label: "hand gunner" }, { id: "zero", label: "zero (never fires)" });
    if (lib.gun.length) gunner.push({ id: "peer", label: "peer gunner (the latest imported)" });
    for (const e of lib.gun) gunner.push({ id: e.id, label: "imported: " + e.label });
    return { driver, gunner };
}

/** The legacy lineup, per slot: what "auto" meant before the panel. `stored`/`peer` say what the page holds. */
function autoDriver(slot, ctx, peer) {
    if (slot === 0) return ctx.stored ? "stored" : "hand";
    if (slot === 1) return ctx.stored ? "hand" : "noise05";
    if (slot === 2) return ctx.stored ? "storednoise" : "noise10";
    return peer ? "peer" : "zero";
}
function autoGunner(slot, ctx, peer) {
    if (slot === 0) return ctx.storedGun ? "stored" : "hand";
    if (slot === SLOTS - 1) return peer ? "peer" : "hand";
    return "hand";
}

/**
 * Resolve specs to a race. specs: four { driver, gunner } (ids from choices(), or AUTO / NONE). ctx: { D, GP, stored, storedGun, library, rng } -- D and GP are the policy
 * modules (handWeights, zeroWeights, perturb / handWeights, zeroWeights), `stored`/`storedGun` the weights held in this browser or null, `rng` a seeded () => [0,1).
 * Returns { cars: [{ slot, colour, driver: { id, label, weights }, gunner: { id, label, weights } }], problems: [string] }. A choice the page cannot honour
 * (an id nothing holds) falls back to the hand weights AND SAYS SO in `problems`; it never throws and never silently substitutes.
 */
export function resolveRoster(specs, ctx) {
    const { D, GP } = ctx, lib = ctx.library || { drive: [], gun: [] }, problems = [], cars = [];
    const peerDrive = lib.drive.length ? lib.drive[lib.drive.length - 1] : null, peerGun = lib.gun.length ? lib.gun[lib.gun.length - 1] : null;
    const rng = ctx.rng || (() => 0.5);
    const all = Array.isArray(specs) ? specs : defaultSpecs();
    for (let slot = 0; slot < SLOTS; slot++) {
        const s = all[slot] || { driver: AUTO, gunner: AUTO };
        if (s.driver === NONE) continue;
        let did = s.driver === AUTO || s.driver == null ? autoDriver(slot, ctx, peerDrive) : s.driver, gid = s.gunner === AUTO || s.gunner == null ? autoGunner(slot, ctx, peerGun) : s.gunner;
        const driver = ((id) => {
            if (id === "stored" && ctx.stored) return { id, label: "stored brain", weights: ctx.stored };
            if (id === "storednoise" && ctx.stored) return { id, label: "stored + noise", weights: D.perturb(ctx.stored, NOISE_05, rng) };
            if (id === "hand") return { id, label: "hand", weights: D.handWeights() };
            if (id === "noise05") return { id, label: "hand + noise 0.05", weights: D.perturb(D.handWeights(), NOISE_05, rng) };
            if (id === "noise10") return { id, label: "hand + noise 0.1", weights: D.perturb(D.handWeights(), NOISE_10, rng) };
            if (id === "zero") return { id, label: "zero", weights: D.zeroWeights() };
            if (id === "peer" && peerDrive) return { id, label: "peer brain", weights: peerDrive.weights };
            if (isLib(id)) { const e = lib.drive.find((x) => x.id === id); if (e) return { id, label: "imported " + e.label, weights: e.weights }; }
            problems.push(`car ${slot + 1} (${SLOT_COLOURS[slot]}): the driver choice "${id}" is not available here; the hand weights drive`);
            return { id: "hand", label: "hand", weights: D.handWeights() };
        })(did);
        const gunner = ((id) => {
            if (id === "stored" && ctx.storedGun) return { id, label: "stored gunner", weights: ctx.storedGun };
            if (id === "hand") return { id, label: "hand gunner", weights: GP.handWeights() };
            if (id === "zero") return { id, label: "zero gunner (never fires)", weights: GP.zeroWeights() };
            if (id === "peer" && peerGun) return { id, label: "peer gunner", weights: peerGun.weights };
            if (isLib(id)) { const e = lib.gun.find((x) => x.id === id); if (e) return { id, label: "imported gunner " + e.label, weights: e.weights }; }
            problems.push(`car ${slot + 1} (${SLOT_COLOURS[slot]}): the gunner choice "${id}" is not available here; the hand gunner fires`);
            return { id: "hand", label: "hand gunner", weights: GP.handWeights() };
        })(gid);
        cars.push({ slot, colour: SLOT_COLOURS[slot], driver, gunner });
    }
    if (!cars.length) problems.push("no car is selected: a race needs at least one");
    return { cars, problems };
}

/** One line per car for the HUD and the gates: "1. red: driver hand + noise 0.05, gunner hand gunner". */
export function describe(roster) { return roster.cars.map((c, i) => `${i + 1}. ${c.colour}: driver ${c.driver.label}, gunner ${c.gunner.label}`); }

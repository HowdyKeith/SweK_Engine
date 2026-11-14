// WebGLEngine/brain/rl/escapeEnv.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY ESCAPES TO ITS HOME (backlog `fly-escapes-home`; Keith, 2026-11-14: "Let's do all 3"). A fly feeds in the yard of its house; things fly at it or past it; it must run home for the ones on a
// collision course and keep feeding through the ones that are not. Same drop-in interface as brain/rl/buildEnv.mjs (obsDim / actDim / maxSteps / reset / step), so brain/rl/dockPolicy.js's trainDockES
// drives it. WHY THIS TASK: the fruit fly's Giant Fiber Circuit is its escape circuit -- in the animal it fires on a LOOMING object and triggers take-off -- so this is the one task in the tree whose
// decision is the one that circuit makes: escape now, or not.
//
// THE WORLD is real voxels: the house of brain/rl/buildEnv.mjs's homePlan(seed), built whole in a miniWorld, in a 14 x 14 yard. A cell is walkable when its ground-level voxel is air, so the walls and
// the windows are in the way and THE DOOR IS THE WAY IN (the plan's two voxels of air). The room inside is the only safe place.
//
// *** WHAT THE POLICY DOES NOT HAVE TO LEARN: the way. *** The action is ONE number: above 0 the fly goes HOME, otherwise it goes to its FOOD (and feeds when it is there). The body walks the shortest
// way over the cells (a breadth-first field to the room, another to the food), half a cell a tick. What the policy chooses is WHEN -- the trigger.
//
// THE MOVERS come one at a time, from 12 to 16 cells away at any bearing, at 0.4 to 0.7 cells a tick, a disc 0.6 in radius:
//   strike   aimed at the fly every tick (pure pursuit). It catches a fly it comes within 0.7 of that is not in the room; a fly in the room is given up on.
//   pass     a straight line that misses where the fly was by 3 to 6 cells. Harmless.
// The fly cannot outrun a strike in the open (it is slower), and it can always be home in time if it goes at once: 6 to 16 ticks of walking against 17 to 40 of flight.
//
//   OBS (13)   a mover is there (0 / 1) | its angular size (2 atan(radius / distance), x 2) | ITS LOOMING RATE (the size's change a tick, x 20) | ITS BEARING RATE (the bearing's change a tick, x 5)
//              | the bearing's cosine and sine | the way home and the way to the food, in cells / 10 | in the room | at the food | the step over maxSteps | two noise draws
//              The two rates are seen through 20 percent noise, and the bearing rate includes the fly's own walking, as an eye's would.
//   ACTION (1) above 0: go home. Otherwise: go to the food and feed.
//   REWARD     0.5 / maxSteps for a tick spent feeding, and 0.5 at the end for being alive: an episode's return is 0.5 x (the share of the time it fed) + 0.5 x (it lived). Hiding all day is 0.5.
//
// RULES are four flies written by hand, the floors a trained fly is measured against: freeze (never flee), hide (never leave), fleeAll (home whenever anything is in the sky), and reflex -- home when
// the thing LOOMS ON A STEADY BEARING (the collision course), and, once it has left its food, for as long as the thing still looms. reflex's one threshold is from the geometry; the rule was written
// twice (the first asked for a steady bearing all the way home, and the fly's own walking unsteadied it: 96 of 205 strikes caught) and is not tuned beyond that.
// Pure but for the world it writes: no I/O, no clock, no Math.random.
"use strict";
import { miniWorld } from "../../render/voxelDevice.mjs";
import { homePlan, SITE, ORIGIN, BLOCKS } from "./buildEnv.mjs";

export const OBS_DIM = 13, ACT_DIM = 1, MAX_STEPS = 160;
export const YARD_LO = -4, YARD = SITE + 8;                       // cells YARD_LO .. YARD_LO + YARD - 1 each way: the site and four cells around it
export const FLY_SPEED = 0.5, BIRD_RADIUS = 0.6, CATCH = 0.7, P_STRIKE = 0.5, RATE_NOISE = 0.2;
export const BIRD_SPEED = Object.freeze([0.4, 0.7]), BIRD_START = Object.freeze([12, 16]), PASS_MISS = Object.freeze([3, 6]), GAP = Object.freeze([6, 14]), FOOD_WAY = Object.freeze([3, 8]), PASS_BEYOND = 6;
export const REFLEX = Object.freeze({ steady: 0.02 });   // the reflex rule's one threshold, in the observation's units: a bearing changing less than this a tick is STEADY (a pass's least, from the geometry: 0.023)

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v)), idx = (x, z) => (z - YARD_LO) * YARD + (x - YARD_LO), inYard = (x, z) => x >= YARD_LO && z >= YARD_LO && x < YARD_LO + YARD && z < YARD_LO + YARD;
const STEPS4 = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);

/** The fewest steps over walkable cells from each cell to any of `targets` ([x, z] cells); Infinity where there is no way. */
export function wayField(walk, targets) {
    const d = new Float64Array(YARD * YARD).fill(Infinity), queue = [];
    for (const [x, z] of targets) if (inYard(x, z) && walk[idx(x, z)]) { d[idx(x, z)] = 0; queue.push([x, z]); }
    for (let h = 0; h < queue.length; h++) { const [x, z] = queue[h], here = d[idx(x, z)]; for (const [dx, dz] of STEPS4) { const nx = x + dx, nz = z + dz; if (inYard(nx, nz) && walk[idx(nx, nz)] && d[idx(nx, nz)] === Infinity) { d[idx(nx, nz)] = here + 1; queue.push([nx, nz]); } } }
    return d;
}

export class EscapeEnv {
    constructor(opts = {}) {
        this.obsDim = OBS_DIM; this.actDim = ACT_DIM; this.maxSteps = opts.maxSteps || MAX_STEPS;
        this.world = opts.world || miniWorld(); this.at = opts.at || ORIGIN;
        for (let z = YARD_LO; z < YARD_LO + YARD; z++) for (let x = YARD_LO; x < YARD_LO + YARD; x++) this.world.setVoxel(this.at.x + x, this.at.y - 1, this.at.z + z, BLOCKS.ground);
        this.plan = null; this.reset(opts.seed || 1);
    }
    reset(seed = 1) {
        const W = this.world, at = this.at;
        if (this.plan) for (const c of this.plan.cells) W.setVoxel(at.x + c.x, at.y + c.y, at.z + c.z, BLOCKS.air);   // the last house is taken down
        const p = this.plan = homePlan(seed); for (const c of p.cells) W.setVoxel(at.x + c.x, at.y + c.y, at.z + c.z, c.id);   // and this one stands whole
        this.walk = new Uint8Array(YARD * YARD);
        for (let z = YARD_LO; z < YARD_LO + YARD; z++) for (let x = YARD_LO; x < YARD_LO + YARD; x++) this.walk[idx(x, z)] = W.voxelAt(at.x + x, at.y, at.z + z) === 0 ? 1 : 0;
        const room = []; for (let z = 1; z < p.d - 1; z++) for (let x = 1; x < p.w - 1; x++) room.push([x, z]);
        this.homeWay = wayField(this.walk, room);
        const r = this._r = mulberry32((seed >>> 0) ^ 0x2545f491), spots = [];
        for (let z = YARD_LO; z < YARD_LO + YARD; z++) for (let x = YARD_LO; x < YARD_LO + YARD; x++) { const w = this.homeWay[idx(x, z)], inHouse = x >= 0 && z >= 0 && x < p.w && z < p.d; if (!inHouse && w >= FOOD_WAY[0] && w <= FOOD_WAY[1]) spots.push([x, z]); }
        if (!spots.length) throw new Error(`escapeEnv.EscapeEnv: plan ${seed} has no place to feed within ${FOOD_WAY[0]} to ${FOOD_WAY[1]} steps of its room`);
        this.food = spots[Math.floor(r() * spots.length)]; this.foodWay = wayField(this.walk, [this.food]);
        this.x = this.food[0] + 0.5; this.z = this.food[1] + 0.5;
        this.t = 0; this.fed = 0; this.caught = false; this.mover = null; this.wait = this._gap(); this.log = []; this.ret = 0;
        this._n1 = r() * 2 - 1; this._n2 = r() * 2 - 1;
        return this._obs(null, null);
    }
    _gap() { return GAP[0] + Math.floor(this._r() * (GAP[1] - GAP[0] + 1)); }
    cellOf() { return [Math.floor(this.x), Math.floor(this.z)]; }
    inRoom() { const [x, z] = this.cellOf(); return inYard(x, z) && this.homeWay[idx(x, z)] === 0; }
    atFood() { return Math.abs(this.x - this.food[0] - 0.5) < 1e-9 && Math.abs(this.z - this.food[1] - 0.5) < 1e-9; }
    /** What an eye at the fly sees of the mover: its distance, its angular size and its bearing. */
    sight() { const m = this.mover; if (!m) return null; const dx = m.x - this.x, dz = m.z - this.z, d = Math.hypot(dx, dz); return { d, size: 2 * Math.atan(BIRD_RADIUS / Math.max(d, 1e-6)), bearing: Math.atan2(dz, dx) }; }
    _obs(before, now) {
        const o = new Float32Array(OBS_DIM), [cx, cz] = this.cellOf();
        if (now) {
            o[0] = 1; o[1] = clamp(now.size * 2, 0, 1); o[4] = Math.cos(now.bearing); o[5] = Math.sin(now.bearing);
            if (before) {
                let turn = now.bearing - before.bearing; if (turn > Math.PI) turn -= 2 * Math.PI; else if (turn < -Math.PI) turn += 2 * Math.PI;
                o[2] = clamp((now.size - before.size) * 20 * (1 + RATE_NOISE * (this._r() * 2 - 1)), -1, 1);
                o[3] = clamp(turn * 5 * (1 + RATE_NOISE * (this._r() * 2 - 1)), -1, 1);
            }
        }
        o[6] = Math.min(1, this.homeWay[idx(cx, cz)] / 10); o[7] = Math.min(1, this.foodWay[idx(cx, cz)] / 10); o[8] = this.inRoom() ? 1 : 0; o[9] = this.atFood() ? 1 : 0;
        o[10] = this.maxSteps ? this.t / this.maxSteps : 0; o[11] = this._n1; o[12] = this._n2;
        return o;
    }
    _walk(field) {
        const [cx, cz] = this.cellOf(); let best = [cx, cz], least = field[idx(cx, cz)];
        for (const [dx, dz] of STEPS4) { const nx = cx + dx, nz = cz + dz; if (inYard(nx, nz) && this.walk[idx(nx, nz)] && field[idx(nx, nz)] < least) { least = field[idx(nx, nz)]; best = [nx, nz]; } }
        const tx = best[0] + 0.5, tz = best[1] + 0.5, dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
        if (d <= FLY_SPEED) { this.x = tx; this.z = tz; } else { this.x += dx / d * FLY_SPEED; this.z += dz / d * FLY_SPEED; }
    }
    _spawn() {
        const r = this._r, strike = r() < P_STRIKE, speed = BIRD_SPEED[0] + r() * (BIRD_SPEED[1] - BIRD_SPEED[0]), bearing = r() * 2 * Math.PI, far = BIRD_START[0] + r() * (BIRD_START[1] - BIRD_START[0]);
        const m = { kind: strike ? "strike" : "pass", speed, x: this.x + far * Math.cos(bearing), z: this.z + far * Math.sin(bearing), age: 0, life: Math.ceil((far + (strike ? far : PASS_BEYOND)) / speed), fled: false };   // a pass is gone once it is PASS_BEYOND cells past where the fly was; a strike that has not ended by twice its flight is given up
        const miss = (PASS_MISS[0] + r() * (PASS_MISS[1] - PASS_MISS[0])) * (r() < 0.5 ? 1 : -1);   // drawn for a strike too, so the stream does not depend on the kind
        if (!strike) { const ax = this.x - Math.sin(bearing) * miss - m.x, az = this.z + Math.cos(bearing) * miss - m.z, a = Math.hypot(ax, az); m.dx = ax / a; m.dz = az / a; }
        return m;
    }
    step(action) {
        const home = Number.isFinite(action[0]) && action[0] > 0, before = this.sight();
        this._walk(home ? this.homeWay : this.foodWay);
        let reward = 0; if (!home && this.atFood()) { this.fed++; reward += 0.5 / this.maxSteps; }
        let m = this.mover;
        if (m) {
            if (!this.atFood()) m.fled = true;
            if (m.kind === "strike") { const dx = this.x - m.x, dz = this.z - m.z, d = Math.hypot(dx, dz) || 1; m.x += dx / d * Math.min(m.speed, d); m.z += dz / d * Math.min(m.speed, d); } else { m.x += m.dx * m.speed; m.z += m.dz * m.speed; }
            m.age++;
            const d = Math.hypot(m.x - this.x, m.z - this.z), safe = this.inRoom();
            if (m.kind === "strike" && d < CATCH && !safe) this.caught = true;
            if (this.caught || (m.kind === "strike" && safe) || m.age >= m.life) { this.log.push({ kind: m.kind, fled: m.fled, caught: this.caught, age: m.age }); this.mover = m = null; this.wait = this._gap(); }
        } else if (--this.wait <= 0) { this.mover = this._spawn(); }
        this.t++; this._n1 = this._r() * 2 - 1; this._n2 = this._r() * 2 - 1;
        const done = this.caught || this.t >= this.maxSteps; if (done && !this.caught) reward += 0.5;
        this.ret += reward;
        const now = this.sight(), obs = this._obs(m && before && now ? before : null, now);
        return { obs, reward, done, info: { caught: this.caught, fed: this.fed, t: this.t, movers: this.log.length, docked: done && !this.caught, crashed: this.caught, dist: 1 - this.ret } };
    }
}

/** See the header: four flies written by hand. Each is act(obs) -> [number]. */
export const RULES = Object.freeze({
    freeze: () => [-1],
    hide: () => [1],
    fleeAll: (o) => [o[0] > 0 ? 1 : -1],
    reflex: (o) => [o[0] > 0 && o[2] > 0 && (Math.abs(o[3]) < REFLEX.steady || o[9] === 0) ? 1 : -1],   // it looms, and either its bearing is steady or the fly has already left its food (its own walking then turns the bearing, so the bearing is no longer asked)
});
export default EscapeEnv;

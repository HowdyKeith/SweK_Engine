// WebGLEngine/brain/rl/buildEnv.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A HOME, BUILT ONE BLOCK AT A TIME IN THE VOXEL WORLD: a policy that chooses WHERE THE NEXT BLOCK GOES. Keith, 2026-11-12: "Could it build a home in a vowel [voxel] world?" (backlog `voxel-home`,
// brain/BACKLOG_2026-11-12_BRAIN_PROJECTS.md). Same drop-in interface as brain/rl/paintEnv.js (obsDim / actDim / maxSteps / reset / step), so brain/rl/dockPolicy.js's trainDockES drives it.
//
// THE PLAN is a small house from the tree's own building grammar: a footprint 4 to 6 voxels a side (the seed's), one floor of three wall layers and a roof layer. world/buildingGrammar.mjs is run on
// it and world/buildingFacade.mjs's facadeVoxels gives the windows (glass, in the middle wall layer) and the door (two voxels of air on the front). ONE THING IS NEW HERE: THE HOUSE IS HOLLOW. CityGen's
// building is a solid column with a facade stamped on it; this plan keeps only the perimeter walls and the roof, so there is a room inside.
//
// *** WHAT THE POLICY DOES NOT HAVE TO LEARN, AS IN THE PAINTER: the block and its height. *** The action is two numbers, a COLUMN of the 6 x 6 site. The block that goes there is the plan's lowest
// missing block of that column -- its material the plan's (stone wall, glass window, the roof's block) -- so the policy never chooses a material or a height. What it chooses is the ORDER, and the
// order matters because A BLOCK MUST BE HELD UP: it rests on the ground, on the block under it, or against a block beside it in its own layer. The lintel over the door needs a wall beside it first;
// the roof over the room grows inward from the walls. A choice that cannot be placed (the column is finished, is outside the house, or its next block has nothing to hold it) is a step spent.
//
//   OBS (40)   the 6 x 6 site, a column each: the share of the house's four layers still missing there | the share of the whole plan missing | the step over maxSteps | two noise draws (the episode's)
//   ACTION (2) [x, z] in [-1, 1], each cut into the site's six columns
//   REWARD     1 / (the plan's blocks) for a block placed: an episode's return is the share of the home built
//
// homePlan(seed) is the plan; homeCheck(world, plan, at) reads a HOME'S FUNCTION off the voxels (every block there, roofed, a door, and the room closed but for the door: a flood from outside
// reaches the room only through it); greedyColumn(env) is the three-line rule that always finishes, the ceiling a learned builder is measured under.
// The world is render/voxelDevice.mjs's miniWorld (or any world with setVoxel / voxelAt): the env writes real voxels, so a page can mesh what a builder built.
// Pure but for the world it writes: no I/O, no clock, no Math.random.
"use strict";
import { miniWorld } from "../../render/voxelDevice.mjs";
import { buildingGrammar } from "../../world/buildingGrammar.mjs";
import { facadeSpecFor, facadeVoxels, FACADE } from "../../world/buildingFacade.mjs";

export const SITE = 6, WALL_LAYERS = 3, LAYERS = 4;
export const OBS_DIM = SITE * SITE + 4, ACT_DIM = 2;
export const BLOCKS = Object.freeze({ air: 0, wall: 1, roof: 2, ground: 3, glass: FACADE.glass });
export const ORIGIN = Object.freeze({ x: 5, y: 1, z: 5 });   // the site's corner in the world: the ground is the layer under y
export const MAX_STEPS = 96;

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const keyOf = (x, y, z) => (y * SITE + z) * SITE + x;

/** See the header. { seed, w, d, cells: [{ x, y, z, id }] (every block, lowest layer first), door: [{ x, y, z }], windows, blocks, columns: per site column its blocks bottom-up, hash }. */
export function homePlan(seed) {
    const r = mulberry32((seed >>> 0) ^ 0x51ed270b), w = 4 + Math.floor(r() * 3), d = 4 + Math.floor(r() * 3), rect = { x: 0, z: 0, w, d, h: LAYERS };
    const over = new Map(); for (const o of facadeVoxels(rect, buildingGrammar(seed >>> 0 || 1, facadeSpecFor(rect)))) if (o.dy < WALL_LAYERS) over.set(keyOf(o.dx, o.dy, o.dz), o.mat);
    const cells = [], door = []; let windows = 0;
    for (let y = 0; y < LAYERS; y++) for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
        const edge = x === 0 || z === 0 || x === w - 1 || z === d - 1;
        if (y === WALL_LAYERS) { cells.push({ x, y, z, id: BLOCKS.roof }); continue; }
        if (!edge) continue;   // the room
        const o = over.get(keyOf(x, y, z));
        if (o === FACADE.air) { door.push({ x, y, z }); continue; }
        if (o === FACADE.glass) windows++;
        cells.push({ x, y, z, id: o === FACADE.glass ? BLOCKS.glass : BLOCKS.wall });
    }
    const columns = Array.from({ length: SITE * SITE }, () => []); for (const c of cells) columns[c.z * SITE + c.x].push(c);
    let h = 0x811c9dc5; for (const c of cells) { h ^= keyOf(c.x, c.y, c.z) * 16 + c.id; h = Math.imul(h, 0x01000193) >>> 0; }
    return { seed, w, d, cells, door, windows, blocks: cells.length, columns, hash: (h >>> 0).toString(16).padStart(8, "0") };
}

/** See the header: what is true of the voxels at `at` (default ORIGIN) against a plan. */
export function homeCheck(world, plan, at = ORIGIN) {
    const v = (x, y, z) => world.voxelAt(at.x + x, at.y + y, at.z + z);
    let placed = 0, wrong = 0; for (const c of plan.cells) { const id = v(c.x, c.y, c.z); if (id === c.id) placed++; else if (id) wrong++; }
    let roofed = true; for (let z = 0; z < plan.d; z++) for (let x = 0; x < plan.w; x++) if (!v(x, WALL_LAYERS, z)) roofed = false;
    const door = plan.door.length > 0 && plan.door.every((c) => !v(c.x, c.y, c.z));
    // the room, flooded from outside through air: a box one voxel wider than the site and one layer higher; with the door's two voxels counted solid the flood must NOT reach the room, and with them open it must
    const flood = (shutDoor) => {
        const lo = -1, hi = SITE, top = LAYERS, shut = new Set(shutDoor ? plan.door.map((c) => keyOf(c.x, c.y, c.z)) : []), seen = new Set(), stack = [[lo, 0, lo]], inRoom = (x, y, z) => x > 0 && z > 0 && x < plan.w - 1 && z < plan.d - 1 && y < WALL_LAYERS;
        let reached = false;
        while (stack.length) {
            const [x, y, z] = stack.pop(); if (x < lo || z < lo || x > hi || z > hi || y < 0 || y > top) continue;
            const k = ((y + 1) * 16 + (z + 1)) * 16 + (x + 1); if (seen.has(k)) continue; seen.add(k);
            const inSite = x >= 0 && z >= 0 && x < SITE && z < SITE && y < LAYERS;
            if (inSite && (v(x, y, z) || shut.has(keyOf(x, y, z)))) continue;
            if (inRoom(x, y, z)) reached = true;
            stack.push([x + 1, y, z], [x - 1, y, z], [x, y + 1, z], [x, y - 1, z], [x, y, z + 1], [x, y, z - 1]);
        }
        return reached;
    };
    const enclosed = !flood(true), entered = flood(false);
    return { placed, wrong, blocks: plan.blocks, complete: placed === plan.blocks && wrong === 0, roofed, door, enclosed, entered, home: placed === plan.blocks && wrong === 0 && roofed && door && enclosed && entered };
}

export class BuildEnv {
    constructor(opts = {}) {
        this.obsDim = OBS_DIM; this.actDim = ACT_DIM; this.maxSteps = opts.maxSteps || MAX_STEPS;
        this.world = opts.world || miniWorld(); this.at = opts.at || ORIGIN; this.planOf = typeof opts.planOf === "function" ? opts.planOf : homePlan;
        for (let z = -1; z <= SITE; z++) for (let x = -1; x <= SITE; x++) this.world.setVoxel(this.at.x + x, this.at.y - 1, this.at.z + z, BLOCKS.ground);
        this.plan = null; this.reset(opts.seed || 1);
    }
    reset(seed = 1) {
        if (this.plan) for (const c of this.plan.cells) this.world.setVoxel(this.at.x + c.x, this.at.y + c.y, this.at.z + c.z, BLOCKS.air);   // the last home is taken down
        this.plan = this.planOf(seed); this.next = new Int32Array(SITE * SITE); this.placed = 0; this.rejected = 0; this.t = 0; this.last = null;
        this._noise = mulberry32((seed >>> 0) ^ 0x9e3779b9); this._n1 = this._noise() * 2 - 1; this._n2 = this._noise() * 2 - 1;
        return this._obs();
    }
    has(x, y, z) { return x >= 0 && z >= 0 && x < SITE && z < SITE && y >= 0 && y < LAYERS && this.world.voxelAt(this.at.x + x, this.at.y + y, this.at.z + z) !== 0; }
    /** The block a column would take next, or null when it has none left (finished, or outside the house). */
    nextOf(col) { const list = this.plan.columns[col]; return this.next[col] < list.length ? list[this.next[col]] : null; }
    /** Is a planned block held up: on the ground, on the block under it, or against a block beside it in its layer? */
    held(c) { return c.y === 0 || this.has(c.x, c.y - 1, c.z) || this.has(c.x + 1, c.y, c.z) || this.has(c.x - 1, c.y, c.z) || this.has(c.x, c.y, c.z + 1) || this.has(c.x, c.y, c.z - 1); }
    missing() { return this.plan.blocks ? 1 - this.placed / this.plan.blocks : 0; }
    _obs() {
        const out = new Float32Array(OBS_DIM);
        for (let col = 0; col < SITE * SITE; col++) out[col] = (this.plan.columns[col].length - this.next[col]) / LAYERS;
        out[SITE * SITE] = this.missing(); out[SITE * SITE + 1] = this.maxSteps ? this.t / this.maxSteps : 0; out[SITE * SITE + 2] = this._n1; out[SITE * SITE + 3] = this._n2;
        return out;
    }
    /** An action in [-1, 1]^2 as a site column. */
    columnFor(action) { const cut = (v) => Math.min(SITE - 1, Math.max(0, Math.floor(((Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0)) + 1) / 2) * SITE))); return cut(action[1]) * SITE + cut(action[0]); }
    step(action) {
        const col = this.columnFor(action), c = this.nextOf(col); let reward = 0, why = null;
        if (!c) why = "nothing left in that column"; else if (!this.held(c)) why = "nothing to hold the block up";
        if (why) { this.rejected++; this.last = { col, placed: null, why }; }
        else { this.world.setVoxel(this.at.x + c.x, this.at.y + c.y, this.at.z + c.z, c.id); this.next[col]++; this.placed++; reward = 1 / this.plan.blocks; this.last = { col, placed: c, why: null }; }
        this.t++; this._n1 = this._noise() * 2 - 1; this._n2 = this._noise() * 2 - 1;
        const complete = this.placed === this.plan.blocks, done = complete || this.t >= this.maxSteps, missing = this.missing();
        return { obs: this._obs(), reward, done, info: { placed: this.placed, rejected: this.rejected, blocks: this.plan.blocks, missing, complete, last: this.last, docked: complete, crashed: false, dist: missing } };
    }
}

/** See the header: the first column, in the site's order, whose next block can be placed; as an action. null when the home is built. */
export function greedyColumn(env) {
    for (let col = 0; col < SITE * SITE; col++) { const c = env.nextOf(col); if (c && env.held(c)) return [((col % SITE) + 0.5) / SITE * 2 - 1, (Math.floor(col / SITE) + 0.5) / SITE * 2 - 1]; }
    return null;
}
export default BuildEnv;

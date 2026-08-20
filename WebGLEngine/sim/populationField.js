// WebGLEngine/sim/populationField.js -- v3118
//
// POPULATION STATE AS A TEXTURE, AND THE ARITHMETIC OF GETTING AN ANSWER BACK OUT.
//
// Keith's design: hold population state in a large texture, step it on the GPU, render to a target, and read
// pixels to decide what spawns and where. The pattern is right. Two things about it need saying before any of
// it is built, and this file is the part that can be checked without a GPU.
//
// THE STACK IS NOT THE ONE IN THE SKETCH. Niagara grids and HLSL are Unreal. SweK is WebGL2/WebGPU, so the same
// idea is a ping-pong pair of float textures with a fragment shader as the update step (or a WebGPU compute
// pass). Nothing about the API ports; everything about the SHAPE does.
//
// *** AND THE READBACK IS THE WHOLE PROBLEM. *** gl.readPixels on a 1024x1024 RGBA32F target is 16 MB AND A
// GPU-TO-CPU SYNCHRONISATION STALL -- the pipeline drains, the main thread waits, and the frame is gone. That
// is this tree's oldest lesson for the fourth time: the poller, /sync/status walking the asset tree on the
// server thread, detectForVideo blocking a rAF tick, and now this. A design that reads the full field every
// frame would cost more than the simulation saves.
//
// SO: REDUCE ON THE GPU, READ BACK THE SMALL THING. You do not need a million texels to answer "how many should
// spawn and roughly where" -- you need per-region counts. A 32x32 tiling of a 1024x1024 field is 1024 numbers
// instead of 1,048,576, which is the difference between a 16 MB stall and a 4 KB one. Same shape as v3116
// refusing to post 478 landmarks per frame for the sake of the four it reads.
//
// WHAT A TILE COUNT CANNOT TELL YOU, said here so nobody discovers it later: it gives HOW MANY and ROUGHLY
// WHERE, never WHICH. Exact per-agent identity needs a prefix sum or an append buffer, which is a bigger
// structure and a different round. If the answer you need is "spawn near the crowded places", tiles are
// sufficient; if it is "spawn adjacent to agent #412,338", they are not, and no amount of tuning changes that.
//
// FOR SCALE: the population that exists today is simulation/AmbientNPCs.js -- TWELVE NPCs in a plain array,
// stepped in a for-loop on the main thread. A 1024-square field is 1,048,576 slots. The jump is five orders of
// magnitude, which is why the readback discipline matters at all: at twelve, none of this would be worth it.

/** RGBA32F, one texel per agent slot. x, y, z in RGB; kind and liveness packed into A. */
export const CHANNELS = 4;
export const BYTES_PER_TEXEL = 16;              // RGBA32F

export function fieldPlan({ side = 1024 } = {}) {
    if (!Number.isInteger(side) || side <= 0 || (side & (side - 1)) !== 0) {
        // POWER OF TWO IS NOT FUSSINESS. The tiling below must divide the field exactly; a 1000-square field
        // with 32-square tiles leaves a 8-pixel margin whose agents are silently never counted, and a
        // population that quietly under-reports at the edges is the hardest kind of bug to notice.
        throw new RangeError("field side must be a power of two, got " + side);
    }
    return { side, slots: side * side, bytes: side * side * BYTES_PER_TEXEL };
}

export function tilePlan(field, { tile = 32 } = {}) {
    if (!Number.isInteger(tile) || tile <= 0 || field.side % tile !== 0) {
        throw new RangeError("tile must divide the field exactly: " + field.side + " % " + tile);
    }
    const tilesPerSide = field.side / tile;
    return {
        tile, tilesPerSide,
        tiles: tilesPerSide * tilesPerSide,
        slotsPerTile: tile * tile,
        bytes: tilesPerSide * tilesPerSide * BYTES_PER_TEXEL,
    };
}

/** What the reduction actually buys. Reported rather than asserted -- it is a ratio, and ratios drift. */
export function readbackCost(field, tiles) {
    return { fullBytes: field.bytes, reducedBytes: tiles.bytes, ratio: field.bytes / tiles.bytes };
}

/**
 * Pack liveness and kind into one float.
 *
 * ONE CHANNEL, NOT TWO, because RGB is spoken for by position and a fifth channel does not exist. Kind is an
 * integer and liveness is a bit, so: kind * 2 + alive. That inverts exactly, which is the only property worth
 * having -- an encoding you cannot invert is a place for state to rot.
 */
export function packSlot(kind, alive) {
    if (!Number.isInteger(kind) || kind < 0 || kind > 32767) throw new RangeError("kind out of range: " + kind);
    return kind * 2 + (alive ? 1 : 0);
}
export function unpackSlot(v) {
    const n = Math.max(0, Math.round(v));
    return { kind: Math.floor(n / 2), alive: (n % 2) === 1 };
}

/**
 * Turn a reduced readback into spawn intents.
 *
 * @param counts Float32Array of length tiles.tiles -- live agents per tile, as the reduction produced them
 * @param opts   { target } desired live agents per tile
 * @returns      [{ tx, ty, spawn }] for tiles that are UNDER target, biggest deficit first
 */
export function spawnIntents(counts, tiles, { target = 8 } = {}) {
    if (!counts || counts.length !== tiles.tiles) {
        // A SHORT BUFFER IS NOT AN EMPTY WORLD. Returning [] here would read as "nothing to spawn" when the
        // truth is "the readback was the wrong size", and the population would quietly stop growing.
        throw new RangeError("counts length " + (counts ? counts.length : "null") + " != tiles " + tiles.tiles);
    }
    const out = [];
    for (let i = 0; i < counts.length; i++) {
        const have = Math.max(0, Math.round(counts[i]));
        if (have >= target) continue;
        out.push({ tx: i % tiles.tilesPerSide, ty: Math.floor(i / tiles.tilesPerSide), spawn: target - have });
    }
    out.sort((a, b) => b.spawn - a.spawn);
    return out;
}

/**
 * v3123 -- TURN INTENTS INTO CONCRETE WRITES. The half that was missing.
 *
 * spawnIntents says "tile 5 wants 8 agents". This says WHICH SLOT each one goes in, and it can only answer
 * because v3123 made the reduction report a free slot per tile on the pass that was already counting.
 *
 * *** ONE FREE SLOT PER TILE PER READBACK IS A REAL RATE LIMIT, AND IT IS STATED RATHER THAN HIDDEN. *** A tile
 * needing eight agents gets ONE per readback cycle, so a sparse world fills over several cycles instead of in a
 * frame. That is a deliberate consequence of buying the free slot for nothing: reporting N free slots per tile
 * would need N channels or a second pass, and neither is worth it before anyone has watched the fill rate and
 * found it too slow.
 *
 * A FULL TILE REPORTS -1 AND IS SKIPPED. Spawning into a full tile would overwrite a living agent, and the
 * symptom -- population stable while births are reported -- would look like the birth rule not working.
 *
 * @param makeAgent (tx, ty, slot) => { x, y, z, packed } -- the CALLER's business. This module knows about
 *        crowding and slots; it knows nothing about where a game wants its creatures or what kind they are.
 */
export function planSpawns(intents, free, tiles, makeAgent, { budget = 64 } = {}) {
    if (typeof makeAgent !== "function") throw new TypeError("planSpawns needs a makeAgent(tx, ty, slot)");
    const writes = [];
    let wanted = 0, noSlot = 0, cappedAt = null;
    const seen = new Set();
    for (const it of intents) {
        wanted += Math.max(0, Math.round(it.spawn) || 0);
        if (writes.length >= budget) { cappedAt = budget; continue; }   // BOUNDED HERE, not trusted to the caller
        const t = it.ty * tiles.tilesPerSide + it.tx;
        const slot = Math.round(free[t]);
        if (!(slot >= 0)) { noSlot++; continue; }        // full tile, or no readback for it -- skip, never guess
        // v3149 -- TWO INTENTS IN ONE TILE WOULD SHARE A SLOT AND THE SECOND WOULD OVERWRITE THE FIRST, giving
        // one agent for two births while the caller counts two. spawnIntents emits ONE intent per tile so this
        // is unreachable from it TODAY -- and planSpawns is exported, takes any intent list, and would have
        // been silently wrong for the next caller. Measured before wiring: [100, 100, 200] for three intents
        // where two shared a tile.
        if (seen.has(slot)) { noSlot++; continue; }
        seen.add(slot);
        const a = makeAgent(it.tx, it.ty, slot);
        writes.push({ slot, x: a.x, y: a.y, z: a.z, packed: a.packed });
    }
    // *** THE SHORTFALL IS RETURNED, NOT LEFT IN A COMMENT. ***
    //
    // spawnIntents says "this tile wants 8 more agents" and the reduction knows ONE free slot per tile, so a
    // tile wanting eight gets ONE. That rate limit is deliberate -- the free slot rides along on a pass that was
    // already counting, and finding N free slots per tile needs a prefix sum and a different round. But the
    // return value used to be a bare array, so A CALLER SAW FOUR WRITES AND COULD NOT TELL THAT THIRTY-TWO
    // BIRTHS WERE ASKED FOR. A world growing eight times slower than its policy intends looks exactly like a
    // world whose policy is working, and the number that distinguishes them was being computed and dropped.
    return {
        writes, wanted, delivered: writes.length,
        unmet: Math.max(0, wanted - writes.length),
        noSlot, cappedAt,
        limitedBy: cappedAt != null ? "budget" : (noSlot > 0 ? "free-slots" : (wanted > writes.length ? "one-slot-per-tile" : null)),
    };
}

/**
 * *** THE RULE THAT MATTERS MOST. ***
 *
 * A readback that never lands must read as UNKNOWN, never as an answer. If the fence has not resolved, the
 * honest statement is "we do not know how crowded the world is" -- and spawning on that is inventing
 * population from a stalled pipeline, while NOT spawning on it is a world that quietly stops growing and looks
 * like a design choice. Both are wrong; the caller has to be told which situation it is in.
 *
 * The lifecycle is NOT reimplemented here: face/detectPump.js already decides exactly this -- at most one
 * request in flight, drop rather than queue, and idle / alive / silent kept apart. A GPU fence and a worker
 * reply are the same problem wearing different hardware, and a second copy would drift from the first.
 */
export function intentsOrUnknown(pumpHealth, counts, tiles, opts) {
    if (pumpHealth === "silent") return { known: false, why: "readback pipeline silent -- crowding is unknown", intents: null };
    if (pumpHealth === "idle" || counts == null) return { known: false, why: "no readback has landed yet", intents: null };
    return { known: true, why: null, intents: spawnIntents(counts, tiles, opts) };
}

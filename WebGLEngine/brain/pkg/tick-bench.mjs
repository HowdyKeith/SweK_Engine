// brain/pkg/tick-bench.mjs — v2253
//
// Measure the cell manager's steady-state tick cost, so "is Bun faster?" is answered on YOUR rig instead of
// guessed. Same file runs under both -- compare the numbers:
//
//   node brain/pkg/tick-bench.mjs
//   bun  brain/pkg/tick-bench.mjs
//
// It builds a full owned wing, points it at several moving targets, and times tickOwned (the whole decide ->
// stepAI -> stepFlight -> fire loop that a per-cell owner runs every frame). Reports ticks/sec and the ceiling
// on how many NPCs one owner sustains at 30 fps. Pure: no network, no clock beyond the timer.

import { makeWorld, tickOwned } from "../esPilot.mjs";

const COUNT = Number(process.env.BENCH_NPCS || 64);     // owned ships in the cell
const TARGETS = Number(process.env.BENCH_TARGETS || 6); // things to shoot at
const SECONDS = Number(process.env.BENCH_SECONDS || 3); // wall-clock budget
const DT = 1 / 30;

const runtime = (typeof globalThis.Bun !== "undefined" || (process.versions && process.versions.bun)) ? `bun ${process.versions.bun}` : `node ${process.versions.node}`;

const world = makeWorld("bench", 128, COUNT, "brain-bench");
// synthetic hostiles that drift, so decide() and reachability actually do work each tick
const targets = Array.from({ length: TARGETS }, (_, i) => ({
    id: "t" + i, x: Math.cos(i) * 6000, y: Math.sin(i) * 6000, vx: 40 - i * 10, vy: i * 8 - 20,
    heading: i * 30, team: "player", isPlayer: i === 0, shield: 120, armor: 90, maxShield: 120, maxArmor: 90, dps: 12,
}));

function moveTargets(now) { for (const t of targets) { t.x += t.vx * DT; t.y += t.vy * DT; } }

// warm the JIT before timing
for (let i = 0; i < 300; i++) { moveTargets(i); tickOwned(world, targets, undefined, DT, 1000 + i * 33); }

let ticks = 0, shots = 0;
const t0 = performance.now();
const budgetMs = SECONDS * 1000;
let now = 100000;
while (performance.now() - t0 < budgetMs) {
    moveTargets(now);
    shots += tickOwned(world, targets, undefined, DT, now).length;
    ticks++; now += 33;
}
const elapsed = (performance.now() - t0) / 1000;

const tps = ticks / elapsed;
const usPerTick = (elapsed / ticks) * 1e6;
const npcUpdatesPerSec = tps * COUNT;
const sustainable30fps = Math.floor(npcUpdatesPerSec / 30);

console.log(`runtime            ${runtime}`);
console.log(`owned NPCs / cell  ${COUNT}   targets ${TARGETS}`);
console.log(`ticks/sec          ${tps.toFixed(0)}`);
console.log(`us per tick        ${usPerTick.toFixed(1)}`);
console.log(`npc-updates/sec    ${npcUpdatesPerSec.toFixed(0)}`);
console.log(`sustains @30fps     ~${sustainable30fps} NPCs in one cell before a second owner is needed`);
console.log(`(sanity: ${shots} shots fired over ${ticks} ticks)`);

---
type: claim
title: "Two peers' brain traces can be diffed at the same moment"
description: "The trace carried only `seq` -- a per-process counter, the order THIS brain decided things. Peers resolve outcomes as the network delivers them, so seq 400 here and seq 400 there a"
tags: [open, "swek-engine", v2549]
timestamp: v2549
---

# Two peers' brain traces can be diffed at the same moment

- **Status:** open  
- **Since:** v2549

## Prediction

The trace carried only `seq` -- a per-process counter, the order THIS brain decided things. Peers resolve outcomes as the network delivers them, so seq 400 here and seq 400 there are NOT the same moment; diffing them yields a confident, meaningless answer, which is worse than no answer because you would believe it. v2549 gives the ENGINE a clock and carries it down: RoomWorld.advance() -> snapshotBody().tick -> the bridge's stored snapshot -> brain -> trace record. PREDICTION: two peers running the same seeded room, traced with BRAIN_TRACE=1, now produce records that can be aligned at tick N -- and the first real divergence will be findable rather than arguable.

## Why

Nothing owned a clock because NOTHING OWNED THE ADVANCE: the page drives the loop, stepAgent() moves ONE agent, the bridge only relays. A tick invented anywhere downstream would be a number about the relay, not about the world. My own note in trace.mjs said this four versions ago and called it 'a real change, on the engine side, not something a trace can invent'.

## Measured

The chain is proven in isolation: two RoomWorlds, same seed, 12 advances -> the same tick AND byte-identical heights, so a diff at tick N is about the BRAINS and not about the moment. NOT YET RUN ACROSS TWO MACHINES -- that needs the arm64 Mac linked and BRAIN_TRACE=1 on both.

## Kill condition

Run two peers on the same seeded room with BRAIN_TRACE=1 and align by tick. If records at the same tick describe visibly different worlds, the tick is not a shared clock and this dies. Also dies if any page ships a tick without owning a world -- a relayed tick is a lie with a number on it.

# Citations

- Code: RIG-ONLY end to end (brain.js is Deno-only and will not import in Node). GATED: the clock counts FRAMES not agents (sabotage-proven: spawnAgent++ -> red); a tickless record OMITS the field rather than writing 0 (sabotage-proven: `tick: tick ?? 0` -> red), because null is not tick 0 and a page with no world could otherwise claim tick 0 for everything and let two machines be 'aligned' at a moment neither was in. Also: the clock does NOT advance while paused.
- Page: `/brain-room.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.

// FILE: ai/AIManager.js
// VERSION: v4 - SIGNAL-INTEGRATED + ROUTER-AWARE
//
// Holds the agent list and the throttled action queue. Each frame, main
// loop calls update(snapshot); we tick every agent in order and drain the
// queue (rate-limited by AIActionQueue.maxPerTick).
//
// New in v4: opts.router. When provided, AIActionQueue forwards commands
// through CommandRouter.exec() — same path VBA and WS clients use — so
// AI side-effects are subject to the same dispatch surface (and the same
// future hooks: per-command logging, validation, telemetry, etc).

import { AIActionQueue } from "./AIActionQueue.js";

export class AIManager {
    constructor(world, ecs, signalBus, opts = {}) {
        this.world = world;
        this.ecs = ecs;
        this.signalBus = signalBus;

        this.agents = [];
        this.queue = new AIActionQueue(world, ecs, opts.router || null);

        // Throttled to AIObservationBus's tickRate (250ms by default), but
        // we count ticks here for HUD visibility. Set externally if you
        // want to tick faster than the observation bus does.
        this.tickedCount = 0;
        this.lastTickedAt = 0;
    }

    addAgent(agent) {
        this.agents.push(agent);
    }

    removeAgent(id) {
        const i = this.agents.findIndex(a => a.id === id);
        if (i >= 0) this.agents.splice(i, 1);
    }

    update(snapshot) {
        for (const agent of this.agents) {
            const result = agent.onTick(snapshot);
            if (result?.commands) this.queue.push(result.commands);
        }
        this.queue.flush();
        this.tickedCount++;
        this.lastTickedAt = performance.now();
    }
}

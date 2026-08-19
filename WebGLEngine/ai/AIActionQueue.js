// FILE: ai/AIActionQueue.js
// VERSION: v2 - ROUTER DELEGATION + RUNAWAY THROTTLE
//
// Collects commands from agents during their onTick(), drains up to
// maxPerTick=10 of them per frame to bound runaway agents. When a
// CommandRouter is provided, every drained command goes through
// router.exec() — same dispatch path as VBA/WS clients, so any future
// telemetry/logging/validation added to the router automatically applies
// to AI commands too.
//
// Falls back to inline _execute when no router is available (used in
// node tests where we don't construct a full main.js wiring).

export class AIActionQueue {
    constructor(world, ecs, router = null) {
        this.world = world;
        this.ecs = ecs;
        this.router = router;

        this.queue = [];
        this.maxPerTick = 10;
        this.enabled = true;

        // Counters for HUD / debug.
        this.flushedTotal = 0;
        this.lastFlushed = 0;
        this.dropped = 0;
    }

    push(commands) {
        if (!this.enabled) return;
        for (const cmd of commands) this.queue.push(cmd);

        // Soft cap on backlog so a runaway agent producing 1000 cmds per
        // tick can't grow the queue unbounded. Drop oldest.
        const HARD_CAP = 200;
        while (this.queue.length > HARD_CAP) {
            this.queue.shift();
            this.dropped++;
        }
    }

    flush() {
        const count = Math.min(this.queue.length, this.maxPerTick);
        for (let i = 0; i < count; i++) {
            this._execute(this.queue.shift());
        }
        this.lastFlushed = count;
        this.flushedTotal += count;
    }

    _execute(cmd) {
        if (!cmd || !cmd.type) return;

        // Unified path — same surface VBA/WS use.
        if (this.router) {
            this.router.exec(cmd);
            return;
        }

        // Legacy fallback (tests / no-router setups).
        switch (cmd.type) {
            case "voxel:set":
                this.world.setVoxel(cmd.x, cmd.y, cmd.z, cmd.value ?? 1);
                break;
            case "voxel:remove":
                this.world.setVoxel(cmd.x, cmd.y, cmd.z, 0);
                break;
            case "entity:move": {
                const e = this.ecs?.getEntity?.(cmd.id);
                if (e) { e.x = cmd.x; e.y = cmd.y; e.z = cmd.z; }
                break;
            }
            case "camera:set":
                if (cmd.camera && cmd.data) Object.assign(cmd.camera, cmd.data);
                break;
            default:
                console.warn("[AI QUEUE] unknown command:", cmd.type);
        }
    }
}

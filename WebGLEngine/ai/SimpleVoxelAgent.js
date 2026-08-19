// FILE: ai/SimpleVoxelAgent.js
// VERSION: v3 - SIGNAL-BASED COMMUNICATION AGENT

import { AIAgentMemory } from "./AIAgentMemory.js";
import { AICommandValidator } from "./AICommandValidator.js";

export class SimpleVoxelAgent {

    constructor(id, signalBus) {

        this.id = id;

        this.memory = new AIAgentMemory();

        this.signals = signalBus;

        this.role = "neutral";
    }

    onTick(snapshot) {

        this.memory.observe(snapshot);

        const commands = [];

        const pos = snapshot.camera;

        // --------------------------------------------------------
        // READ SIGNALS (OTHER AGENTS "COMMUNICATE" HERE)
        // --------------------------------------------------------

        const nearbySignals = this.signals.sense(
            Math.floor(pos.x),
            Math.floor(pos.y),
            Math.floor(pos.z),
            4
        );

        // --------------------------------------------------------
        // INTERPRET SIGNAL PATTERNS
        // --------------------------------------------------------

        const dangerSignal = nearbySignals.find(s => s.value === 9);
        const buildSignal  = nearbySignals.find(s => s.value === 2);

        // --------------------------------------------------------
        // REACT TO SIGNALS
        // --------------------------------------------------------

        if (dangerSignal) {

            commands.push({
                type: "voxel:remove",
                x: dangerSignal.x,
                y: dangerSignal.y,
                z: dangerSignal.z
            });
        }

        if (buildSignal && this.role === "builder") {

            commands.push({
                type: "voxel:set",
                x: Math.floor(pos.x + 1),
                y: 60,
                z: Math.floor(pos.z),
                value: 1
            });
        }

        // --------------------------------------------------------
        // RANDOM SIGNAL EMISSION (AGENT OUTPUT)
        // --------------------------------------------------------

        if (Math.random() < 0.01) {

            this.signals.emit(
                Math.floor(pos.x + Math.random() * 3),
                60,
                Math.floor(pos.z + Math.random() * 3),
                this.role === "builder" ? 2 : 9
            );
        }

        return {
            commands: AICommandValidator.filter(commands)
        };
    }
}
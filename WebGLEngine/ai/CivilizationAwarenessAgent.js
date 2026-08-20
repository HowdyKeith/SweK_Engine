// FILE: ai/CivilizationAwarenessAgent.js
// VERSION: v2 - SNAPSHOT-DRIVEN (was: extra civilizations arg)
//
// AIManager calls every agent's onTick(snapshot). The original v1 used
// onTick(snapshot, civilizations) which would fall over when wired to
// the manager. v2 reads snapshot.civilizations directly — the main loop
// already includes the live civ list when it builds the snapshot.
//
// Behavior:
//   * For each civ with score > 0.75: place a "reinforcement" voxel
//     (value=3 = GRASS) at its center. Visible green pillar grows where
//     stable civilizations exist.
//   * For each civ with stability < 0.2: place a "decay marker" by
//     removing a voxel near the civ. Empty pockets appear where
//     civilizations are dying.
//
// All commands flow through AIActionQueue → CommandRouter (same path as
// VBA / WS / other AI agents).

import { AICommandValidator } from "./AICommandValidator.js";

export class CivilizationAwarenessAgent {
    constructor(id, signalBus, memory) {
        this.id = id;
        this.signalBus = signalBus;
        this.memory = memory;
        this.role = "observer";
    }

    onTick(snapshot) {
        const civilizations = snapshot.civilizations || [];
        if (civilizations.length === 0) return { commands: [] };

        const commands = [];

        for (const civ of civilizations) {
            // Reinforce stable, high-score civs.
            if ((civ.score ?? 0) > 0.75) {
                commands.push({
                    type: "voxel:set",
                    x: Math.floor(civ.center.x),
                    y: Math.floor(civ.center.y) + 1,
                    z: Math.floor(civ.center.z),
                    value: 3,   // GRASS
                });
            }

            // Mark decaying civs by clearing a voxel nearby.
            if ((civ.stability ?? 1) < 0.2) {
                commands.push({
                    type: "voxel:remove",
                    x: Math.floor(civ.center.x),
                    y: Math.floor(civ.center.y),
                    z: Math.floor(civ.center.z),
                });
            }
        }

        return { commands: AICommandValidator.filter(commands) };
    }
}

// FILE: bridge/SceneLoader.js
// VERSION: v1 - SCENE.JSON -> ECS POPULATION
//
// Reads the JSON produced by VBA's ECS_Exporter.bas and turns each entity
// description into ECS entities + components. Component shapes here mirror
// the JSON shapes the exporter writes:
//
//   { id, components: {
//       transform: { x, y, z, yaw? },
//       velocity:  { x, y, z },
//       camera:    { pitch },
//       enemy:     { health, state },
//       ai:        { type },
//       render:    { type }
//   } }
//
// Tag is derived from the components present (camera => player, enemy/ai =>
// enemy, else prop) but we also let the JSON pass an explicit "tag":"X"
// override.

import {
    Position, Velocity, AI, Camera, Enemy, Render, Tag,
} from "../core/ecs/components.js";

export class SceneLoader {
    constructor(ecsWorld) {
        this.ecs = ecsWorld;
        this.lastMeta = null;
    }

    // Load and populate. Returns the parsed scene meta block ({ seed,
    // tickRate, ... }) for the caller, or null on failure.
    async loadFromUrl(url = "./scene.json") {
        let json;
        try {
            const res = await fetch(url, { cache: "no-store" });
            if (!res.ok) {
                console.warn(`[SceneLoader] ${url} -> ${res.status}, skipping`);
                return null;
            }
            json = await res.json();
        } catch (err) {
            console.warn(`[SceneLoader] could not fetch ${url}:`, err.message);
            return null;
        }
        return this.applyScene(json);
    }

    applyScene(scene) {
        if (!scene || !Array.isArray(scene.entities)) {
            console.warn("[SceneLoader] scene has no entities array");
            return null;
        }

        this.lastMeta = scene.meta || null;
        let count = 0;

        for (const ent of scene.entities) {
            const id = this.ecs.createEntity();
            const c = ent.components || {};

            if (c.transform) {
                this.ecs.addComponent(id, new Position(
                    c.transform.x || 0,
                    c.transform.y || 0,
                    c.transform.z || 0,
                ));
            }
            if (c.velocity) {
                this.ecs.addComponent(id, new Velocity(
                    c.velocity.x || 0,
                    c.velocity.y || 0,
                    c.velocity.z || 0,
                ));
            } else if (c.transform) {
                // Anything with a transform should at least be able to move
                // — gives MovementSystem a target to integrate.
                this.ecs.addComponent(id, new Velocity(0, 0, 0));
            }

            if (c.camera) {
                this.ecs.addComponent(id, new Camera(c.camera));
            }
            if (c.enemy) {
                this.ecs.addComponent(id, new Enemy(c.enemy));
            }
            if (c.ai) {
                this.ecs.addComponent(id, new AI(c.ai));
            }
            if (c.render) {
                this.ecs.addComponent(id, new Render(c.render));
            }

            // Tag derivation. Explicit JSON tag wins.
            let kind = ent.tag || c.tag?.kind;
            if (!kind) {
                if (c.camera) kind = "player";
                else if (c.enemy || c.ai) kind = "enemy";
                else kind = "prop";
            }
            this.ecs.addComponent(id, new Tag(kind));

            count++;
        }

        console.log(`[SceneLoader] applied ${count} entities (seed=${this.lastMeta?.seed})`);
        return this.lastMeta;
    }
}

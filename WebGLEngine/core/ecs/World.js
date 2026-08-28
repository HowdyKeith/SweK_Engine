import { Entity } from "./Entity.js";
import { ComponentStore } from "./ComponentStore.js";

export class World {
    constructor() {
        this.entities = new Map();
        this.components = new ComponentStore();
        this.systems = [];
        this.time = 0;
    }

    createEntity() {
        const e = new Entity();
        this.entities.set(e.id, e);
        return e.id;
    }

    removeEntity(id) {
        // *** THE ACTUAL BUG: this used to ONLY delete from `entities`, never from `components`. ***
        // Nothing that draws a frame ever reads `entities` -- bridge/ecs_render_bridge.js's getVisibleEntities()
        // queries `this.components.getAll(Position)` directly -- so a "despawned" entity's Position (and every
        // other component it carried) stayed in the store forever, and it kept rendering exactly as before.
        // Every demo's own stop() calling `router.exec({type:"entity:despawn", id})` (tridchess, dejarik,
        // ambientNPCs, aquariumDemo, openSeaDemo, treeSpawner, ...) inherits this fix for free -- none of them
        // were ever wrong; this was the one shared function underneath all of them that silently did half its job.
        this.entities.delete(id);
        this.components.removeEntity(id);
    }

    // Removes EVERY entity and its components. commandRouter.js's world:reset/world:hardReset handlers have
    // called `this.env.ecs?.clearAll` since v337 and logged "cleared N ECS entities" -- but this method never
    // existed, so `ecs?.clearAll` was always undefined and that whole branch was dead: neither Reset button
    // ever actually cleared an ECS entity. Returns {cleared} so those call sites' existing log line is finally
    // reporting a real count instead of never running at all.
    clearAll() {
        const cleared = this.entities.size;
        for (const id of [...this.entities.keys()]) this.components.removeEntity(id);
        this.entities.clear();
        return { cleared };
    }

    addComponent(entityId, component) {
        this.components.add(entityId, component);
    }

    getComponent(entityId, componentClass) {
        return this.components.get(entityId, componentClass);
    }

    addSystem(system) {
        system.world = this;
        this.systems.push(system);
    }

    step(dt) {
        this.time += dt;

        for (const sys of this.systems) {
            sys.update(dt, this);
        }
    }
}
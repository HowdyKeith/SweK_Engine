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
        this.entities.delete(id);
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
export class ComponentStore {
    constructor() {
        this.store = new Map();
    }

    add(entityId, component) {
        const type = component.constructor.name;

        if (!this.store.has(type)) {
            this.store.set(type, new Map());
        }

        this.store.get(type).set(entityId, component);
    }

    get(entityId, componentClass) {
        const type = componentClass.name;
        return this.store.get(type)?.get(entityId);
    }

    remove(entityId, componentClass) {
        const type = componentClass.name;
        this.store.get(type)?.delete(entityId);
    }

    // Removes EVERY component this entity carries, across all types. Without this, deleting an entity from
    // World.entities did nothing to stop it rendering: bridge/ecs_render_bridge.js's getVisibleEntities() reads
    // straight from this store (this.ecs.components.getAll(Position)), never from World.entities at all -- so a
    // "despawned" entity whose Position component was never removed here kept drawing forever. Returns true if
    // the entity carried at least one component (so a caller can tell "nothing to remove" from "removed").
    removeEntity(entityId) {
        let had = false;
        for (const typeMap of this.store.values()) {
            if (typeMap.delete(entityId)) had = true;
        }
        return had;
    }

    getAll(componentClass) {
        const type = componentClass.name;
        return this.store.get(type) || new Map();
    }
}
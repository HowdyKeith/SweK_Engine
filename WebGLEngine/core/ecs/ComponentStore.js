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

    getAll(componentClass) {
        const type = componentClass.name;
        return this.store.get(type) || new Map();
    }
}
let NEXT_ENTITY_ID = 1;

export class Entity {
    constructor() {
        this.id = NEXT_ENTITY_ID++;
        this.alive = true;
    }
}
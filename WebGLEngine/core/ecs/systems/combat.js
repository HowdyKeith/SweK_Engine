export class CombatSystem {
    constructor(world) {
        this.world = world;
        this.hitCooldown = new Map();
    }

    update(dt) {
        // placeholder for future weapon system sync
        // VBA already handles "event trigger"
        // JS handles actual resolution if needed
    }

    damage(entityId, amount) {
        const enemy = this.world.get(entityId, "enemy");
        if (!enemy) return;

        enemy.health -= amount;

        if (enemy.health <= 0) {
            this.world.entities.delete(entityId);
            console.log("[ECS] Entity died:", entityId);
        }
    }
}
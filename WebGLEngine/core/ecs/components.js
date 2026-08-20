// FILE: core/ecs/components.js
// VERSION: v2 - added Camera, Enemy, Render, Tag
//
// Components are dumb data bags. Behaviour lives in systems. The set here
// matches what ECS_Exporter.bas emits per entity (transform / velocity /
// camera / ai / enemy / render).

export class Position {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x; this.y = y; this.z = z;
        // Round 53 — yaw (rotation around Y, radians, 0 = facing +Z)
        // and tiltX (pitch around the local right axis after yaw, radians,
        // positive = nose up). Default 0 keeps existing entities oriented
        // exactly as before.
        this.yaw = 0;
        this.tiltX = 0;
        // Round 81 — tiltZ (roll around the entity's local Z axis after
        // yaw + pitch). Enables full 3-axis tumbling. Default 0 keeps
        // existing entities oriented exactly as before.
        this.tiltZ = 0;
    }
}

export class Velocity {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x; this.y = y; this.z = z;
    }
}

export class VoxelRef {
    constructor(voxelId) { this.voxelId = voxelId; }
}

export class AI {
    constructor(opts = {}) {
        this.state = opts.state ?? "idle";
        this.targetX = opts.targetX ?? 0;
        this.targetZ = opts.targetZ ?? 0;
        this.type = opts.type ?? "wander";
    }
}

export class Camera {
    constructor(opts = {}) {
        this.pitch = opts.pitch ?? 0;
        this.yaw   = opts.yaw   ?? 0;
        this.fov   = opts.fov   ?? 70;
    }
}

export class Enemy {
    constructor(opts = {}) {
        this.health = opts.health ?? 5;
        this.state  = opts.state  ?? "idle";
    }
}

export class Render {
    constructor(opts = {}) {
        this.type = opts.type ?? "mesh";
        this.assetId = opts.assetId ?? null;
        this.scale = opts.scale ?? 1;
        // Round 41 — non-uniform scale (overrides `scale` when present).
        // If any of scaleX/Y/Z is non-null they are used as a 3-vector.
        // Defaults inherit from `scale` for uniform back-compat.
        this.scaleX = opts.scaleX ?? null;
        this.scaleY = opts.scaleY ?? null;
        this.scaleZ = opts.scaleZ ?? null;
        this.animClip = opts.animClip ?? null;
        this.colorMul = opts.colorMul ?? 1.0;
        // Round 26 — additive RGB color tint.
        this.colorTint = opts.colorTint ?? null;
        // v549 — lerp-to-color tint. tintMix 0 = normal, 1 = solid tintColor;
        // applied AFTER colorMul/colorTint. The general per-entity recolor hook
        // (camouflage, freeze, poison, fade, team recolor, hit flash…).
        this.tintColor = opts.tintColor ?? null;
        this.tintMix = opts.tintMix ?? 0;
    }
}

// Discriminator used by ecs_render_bridge so EntityDebugRenderer knows
// what color to draw. Values: "player" | "enemy" | "prop".
export class Tag {
    constructor(kind = "prop") {
        this.kind = kind;
    }
}

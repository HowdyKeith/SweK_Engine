// FILE: bridge/ecs_render_bridge.js
// VERSION: v2 - SURFACES assetId FOR EntityMeshRenderer
//
// Purpose: the renderer reads ECS transforms through this layer. v2 also
// pulls the optional assetId from Render so the entity-mesh renderer can
// route to a triangle-mesh path (vs the cube fallback).
//
// Direction:  Renderer  <-  ECS
//             "give me a flat list of {id, kind, x, y, z, assetId} for drawing."

import { Position, Tag, Camera, AI, Render } from "../core/ecs/components.js";

export class EntityRenderBridge {
    constructor(ecsWorld) {
        this.ecs = ecsWorld;
    }

    // Returns a flat array EntityCubeRenderer + EntityMeshRenderer iterate.
    // Kind derivation:
    //   1. explicit Tag component         (authored intent wins)
    //   2. Camera component  -> "player"
    //   3. AI component      -> "enemy"
    //   4. otherwise         -> "prop"
    getVisibleEntities() {
        const out = [];
        const positions = this.ecs.components.getAll(Position);

        for (const [id, pos] of positions) {
            const tag    = this.ecs.getComponent(id, Tag);
            const cam    = this.ecs.getComponent(id, Camera);
            const ai     = this.ecs.getComponent(id, AI);
            const render = this.ecs.getComponent(id, Render);

            let kind = "prop";
            if (tag && tag.kind) kind = tag.kind;
            else if (cam) kind = "player";
            else if (ai)  kind = "enemy";

            out.push({
                id,
                kind,
                x: pos.x, y: pos.y, z: pos.z,
                yaw:   pos.yaw   ?? 0,
                tiltX: pos.tiltX ?? 0,
                tiltZ: pos.tiltZ ?? 0,                       // was dropped — roll never reached the renderer
                assetId:  render ? render.assetId  : null,
                scale:    render ? render.scale    : null,
                scaleX:   render ? render.scaleX   : null,      // round 41
                scaleY:   render ? render.scaleY   : null,
                scaleZ:   render ? render.scaleZ   : null,
                animClip: render ? render.animClip : null,
                colorMul: render ? render.colorMul : 1.0,    // round 22
                colorTint: render ? render.colorTint : null, // round 26
                tintColor: render ? render.tintColor : null, // v549 — lerp-to-color tint
                tintMix:   render ? render.tintMix   : 0,
            });
        }
        return out;
    }

    getEntityTransform(id) {
        const pos = this.ecs.getComponent(id, Position);
        if (!pos) return null;
        return { x: pos.x, y: pos.y, z: pos.z };
    }
}

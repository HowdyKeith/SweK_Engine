// demos_code/freeglut_shapes.js — port of the VBA engine's FreeGLUT_Demo
//
// The VBA engine's FreeGLUT_Demo.bas shows a rotating shape (cube,
// sphere, torus, teapot, octahedron) against a dark blue background
// with a floor grid. Keys 1-5 cycle shapes, Space toggles wireframe.
//
// This is the WebGL equivalent — a row of 5 entities, each spinning,
// auto-cycling colors so the showcase reads as "the engine can render
// many distinct surfaces simultaneously." Same conceptual demo as the
// VBA original (a shape showcase), adapted to a multi-entity world
// where you can see all five at once rather than one-at-a-time.
//
// VBA reference: EngineCore_63_Enemies.xlsm → FreeGLUT_Demo.bas → RunGLUT()

const ROW_Y     = 28;       // mid-air row height
const SPACING   = 12;       // horizontal gap between shapes
const SPIN_PER_SEC = Math.PI * 0.7;   // ~126°/s — matches the VBA m_Angle += 0.8 per idle tick

// 5 entity kinds covering varied visual personalities, mirroring the
// 5 FreeGLUT shapes (cube/sphere/torus/teapot/octahedron). The WebGL
// engine doesn't have geometric primitive entities by name, so we
// substitute existing entity kinds with distinct visual identities.
const SHAPES = [
    { kind: "remote_player_marker", scale: 3.0, label: "marker" },     // cube-ish
    { kind: "caster_wizard",        scale: 2.5, label: "wizard" },     // pale gold
    { kind: "caster_tank",          scale: 2.5, label: "tank" },       // blood-iron
    { kind: "portal_holy",          scale: 3.5, label: "holy portal" },// glowing white-gold
    { kind: "portal_tech",          scale: 3.5, label: "tech portal" },// glowing cyan
];

let entities = [];      // { id, x, y, z, yaw, tilt }
let yawAccum = 0;
let tiltAccum = 0;

export default {
    id:    "freeglut_shapes",
    label: "SHAPE GALLERY (FREEGLUT PORT)",
    hint:  "shape showcase — VBA FreeGLUT_Demo.RunGLUT ported to WebGL",
    controls: [
        "Auto — five entities rotate in a row",
        "WASD + mouse — fly around to see all sides",
        "Compare with EngineCore.xlsm → FreeGLUT_Demo.RunGLUT (keys 1-5)",
    ],

    start(ctx) {
        entities = [];
        const totalWidth = (SHAPES.length - 1) * SPACING;
        const startX = -totalWidth / 2;
        for (let i = 0; i < SHAPES.length; i++) {
            const shape = SHAPES[i];
            const x = startX + i * SPACING;
            const id = ctx.spawnMesh(shape.kind, x, ROW_Y, 0, shape.scale);
            if (id == null) {
                console.warn(`[freeglut_shapes] spawnMesh failed for ${shape.kind}`);
                continue;
            }
            entities.push({ id, x, y: ROW_Y, z: 0, kind: shape.kind, label: shape.label });
        }
        yawAccum = 0;
        tiltAccum = 0;
        // Position camera to take in the whole row
        try { ctx.lookAt?.(0, ROW_Y, 0); } catch {}
        ctx.kpop?.info?.("Shape gallery", `${entities.length} shapes rotating — VBA FreeGLUT port`);
        console.log("[freeglut_shapes] started;", entities.length, "entities");
    },

    tick(ctx, dt) {
        if (entities.length === 0) return;
        yawAccum  = (yawAccum  + SPIN_PER_SEC        * dt) % (Math.PI * 2);
        tiltAccum = (tiltAccum + SPIN_PER_SEC * 0.4 * dt) % (Math.PI * 2);
        // Each entity rotates with a small phase offset so the row reads
        // as varied rather than military-parade-synchronized
        for (let i = 0; i < entities.length; i++) {
            const e = entities[i];
            const phase = i * 0.4;
            ctx.router?.exec?.({
                type: "entity:move",
                id:   e.id,
                x:    e.x,
                y:    e.y,
                z:    e.z,
                yaw:  (yawAccum + phase) % (Math.PI * 2),
                tilt: (tiltAccum + phase * 0.5) % (Math.PI * 2),
            });
        }
    },

    stop(ctx) {
        for (const e of entities) {
            ctx.despawnEntity?.(e.id);
        }
        entities = [];
        console.log("[freeglut_shapes] stopped");
    },
};

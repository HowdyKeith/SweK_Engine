// WebGLEngine/core/ecs/World-selfcheck.mjs — v4079
//
// Run: node core/ecs/World-selfcheck.mjs   (pure, no browser)
//
// Keith: switching from one orange-pill demo (index.html's full render page) to a different one did not clear
// the old demo first -- the new one started ON TOP of the old, entities from the prior demo still visible.
// Reproduced live (headless Chromium, index.html): window._perfStats.entCount -- a REAL per-frame draw count,
// not a sticky counter (EntityCubeRenderer/EntityMeshRenderer recompute lastDrawn = entities.length every
// frame) -- climbed monotonically across 12 demo switches (50 -> 57 -> 117 -> 237 -> 865 -> ... -> 2612),
// NEVER dropping, even switching FROM the heaviest demo (missile_command, 2612 entities) back to something
// small. Isolated further: booting straight to "kaiju" and letting its city sim settle for 6s gave 1180
// entities; switching to "wildlife" (whose own FRESH-BOOT baseline is 0) left entCount at EXACTLY 1180 --
// kaiju's own entities never went away.
//
// *** THE ROOT CAUSE WAS NOT IN ANY OF THE 42 DEMOS. *** kaijuManager.kaiju and civManager.civilizations were
// BOTH SIZE 0 after the switch -- the demo-specific managers' own bookkeeping was correct. The bug was one
// shared function underneath all of them: World.removeEntity(id) (called by every demo's stop() via
// router.exec({type:"entity:despawn", id})) only ever did `this.entities.delete(id)`. Nothing that draws a
// frame reads World.entities -- bridge/ecs_render_bridge.js's getVisibleEntities() queries
// `this.ecs.components.getAll(Position)` DIRECTLY -- so an entity's Position (and every other component)
// stayed in ComponentStore forever, and it kept rendering exactly as before "despawning" it. Every demo that
// ever called entity:despawn (tridchess, dejarik, ambientNPCs, aquariumDemo, openSeaDemo, treeSpawner, ...) was
// individually correct; the one function all of them funneled through silently did half its job.
//
// *** AND THE "RESET" BUTTON'S OWN CLAIM WAS DEAD CODE FOR THE SAME REASON, ONE LAYER UP. *** commandRouter.js's
// world:reset / world:hardReset handlers have logged "cleared N ECS entities" since v337, gated on
// `this.env.ecs?.clearAll` -- but World never HAD a clearAll() method, so that branch was always undefined and
// never ran. Reset never actually cleared an ECS entity either. World.clearAll() is added here for the first
// time, which turns that branch live rather than adding a new call site for it.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const { World } = await import(path.join(HERE, "World.js"));
const { ComponentStore } = await import(path.join(HERE, "ComponentStore.js"));
const { EntityRenderBridge } = await import(path.resolve(HERE, "..", "..", "bridge", "ecs_render_bridge.js"));
const { Position } = await import(path.join(HERE, "components.js"));

console.log("World-selfcheck -- despawn actually despawns, and Reset actually resets\n");

console.log("0. *** ComponentStore.removeEntity() -- THE PRIMITIVE THE FIX ADDS ***");
{
    const store = new ComponentStore();
    store.add(1, new Position(1, 2, 3));
    store.add(2, new Position(4, 5, 6));
    ok("!! both entities' Position components are present before removal",
        store.getAll(Position).has(1) && store.getAll(Position).has(2));
    const had = store.removeEntity(1);
    ok("!! *** removeEntity(1) removes ONLY entity 1's component, leaves entity 2's untouched ***",
        had === true && !store.getAll(Position).has(1) && store.getAll(Position).has(2));
    ok("...and returns false for an id that never had any component (nothing to remove, honestly reported)",
        store.removeEntity(999) === false);
}

console.log("\n1. *** REPRODUCED: THE OLD PATH (entities.delete ALONE) LEAVES THE COMPONENT BEHIND ***");
{
    const world = new World();
    const id = world.createEntity();
    world.addComponent(id, new Position(7, 8, 9));
    // The OLD, broken removeEntity body, inlined here rather than imported, so this gate does not depend on
    // main.js ever regressing back to it -- this proves what WOULD happen if it did.
    const oldRemoveEntity = (w, entityId) => { w.entities.delete(entityId); };
    oldRemoveEntity(world, id);
    ok("!! *** the old one-line removeEntity leaves the entity's Position component in the store ***",
        !world.entities.has(id) && world.components.getAll(Position).has(id),
        "entities.delete() succeeded (entity gone from the Map) but the component that actually drives " +
        "rendering is still there -- this is the exact defect that shipped");
}

console.log("\n2. *** FIXED: World.removeEntity() NOW ALSO REMOVES THE COMPONENTS ***");
{
    const world = new World();
    const id = world.createEntity();
    world.addComponent(id, new Position(7, 8, 9));
    world.removeEntity(id);
    ok("!! *** removeEntity() now removes both the entity AND its component(s) ***",
        !world.entities.has(id) && !world.components.getAll(Position).has(id));
}

console.log("\n3. *** END TO END: THE SAME QUERY THE RENDERER ACTUALLY USES NO LONGER SEES A DESPAWNED ENTITY ***");
{
    // Not a proxy metric -- bridge/ecs_render_bridge.js's getVisibleEntities() IS what
    // render/EntityMeshRenderer.js and render/EntityCubeRenderer.js iterate every frame.
    const world = new World();
    const bridge = new EntityRenderBridge(world);
    const a = world.createEntity(); world.addComponent(a, new Position(1, 0, 1));
    const b = world.createEntity(); world.addComponent(b, new Position(2, 0, 2));
    ok("!! both entities are visible before either is despawned",
        bridge.getVisibleEntities().some((e) => e.id === a) && bridge.getVisibleEntities().some((e) => e.id === b));
    world.removeEntity(a);
    const visible = bridge.getVisibleEntities();
    ok("!! *** THE DESPAWNED ENTITY IS GONE FROM getVisibleEntities(), THE ENTITY THAT WASN'T IS STILL THERE ***",
        !visible.some((e) => e.id === a) && visible.some((e) => e.id === b),
        visible.length + " entities visible (expected 1, id=" + b + ")");
}

console.log("\n4. *** World.clearAll() -- THE METHOD commandRouter.js's world:reset HAS CALLED (AS ecs?.clearAll)");
console.log("   SINCE v337, ALWAYS UNDEFINED UNTIL NOW ***");
{
    const world = new World();
    const ids = [world.createEntity(), world.createEntity(), world.createEntity()];
    for (const id of ids) world.addComponent(id, new Position(id, id, id));
    ok("!! three entities exist with components before clearAll()",
        world.entities.size === 3 && world.components.getAll(Position).size === 3);
    const r = world.clearAll();
    ok("!! *** clearAll() reports {cleared: 3}, matching commandRouter.js's own log line's expectation ***",
        r && r.cleared === 3);
    ok("!! ...and both the entities Map and every component type are actually empty afterward",
        world.entities.size === 0 && world.components.getAll(Position).size === 0);
    ok("...and clearAll() on an already-empty world reports {cleared: 0} rather than throwing",
        world.clearAll().cleared === 0);
}

console.log("\n5. *** WIRING: commandRouter.js's world:reset/world:hardReset now find a REAL clearAll ***");
{
    const fs = await import("node:fs");
    const crSrc = fs.readFileSync(path.resolve(HERE, "..", "commandRouter.js"), "utf8");
    ok("!! world:reset still gates on this.env.ecs?.clearAll -- the same guard, now backed by a real method",
        /if \(t === "world:reset"\)/.test(crSrc) && (crSrc.match(/this\.env\.ecs\?\.clearAll/g) || []).length >= 2,
        "two call sites (world:reset, world:hardReset) both read the same guard -- neither needed a new call " +
        "site added; the fix was making the method they already call actually exist");
}

console.log("\n" + (fails ? fails + " FAILED" : "all passed"));
if (fails) process.exit(1);

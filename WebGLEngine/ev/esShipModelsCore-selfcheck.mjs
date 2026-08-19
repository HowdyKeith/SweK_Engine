// WebGLEngine/ev/esShipModelsCore-selfcheck.mjs — v3827
//
// Answer key for GLB ship assignment's testable half: classify, key sanitising, and the per-class store's
// persistence (against a mock storage, so it runs headless). Same shape as the flight-radar aircraft assignment.

import { esShipClass, kindForUrl, makeModelStore, ES_SHIP_CLASSES } from "./esShipModelsCore.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };

// 1) CLASSIFY -- from cls.name (spawnEnemies), a bare name, a string cls, and the catch-all.
ok(esShipClass({ cls: { name: "Raider" } }) === "raider", "cls.name Raider -> raider");
ok(esShipClass({ name: "Marauder" }) === "marauder", "name Marauder -> marauder");
ok(esShipClass({ cls: "Corsair" }) === "corsair", "string cls Corsair -> corsair");
ok(esShipClass({ name: "Frigate" }) === "unknown", "unknown name -> unknown");
ok(esShipClass({}) === "unknown" && esShipClass(null) === "unknown", "missing -> unknown, null-safe");
ok(ES_SHIP_CLASSES.includes("unknown"), "unknown is a real class (procedural default)");

// 2) KEY SANITISING -- distinct urls -> distinct safe keys; nothing but [a-z0-9._-].
ok(kindForUrl("/GPU_Assets/ships/raider.glb") !== kindForUrl("https://x/y.glb"), "distinct urls -> distinct keys");
ok(/^esglb_[a-z0-9._-]*$/i.test(kindForUrl("/a b/c!.glb")), "key is cache-safe: " + kindForUrl("/a b/c!.glb"));

// 3) STORE -- set/get/clear, yaw snapping, unknown-class rejection, and PERSISTENCE across a reload.
{
    let backing = {};
    const mock = { getItem: (k) => (k in backing ? backing[k] : null), setItem: (k, v) => { backing[k] = String(v); } };
    const s = makeModelStore(mock);
    ok(s.get("raider") === null, "unset class -> null");
    ok(s.set("raider", "/GPU_Assets/ships/raider.glb", 90) === true, "set raider");
    ok(s.get("raider").url.endsWith("raider.glb") && s.get("raider").yaw === 90, "get returns url + yaw");
    ok(s.set("marauder", "/x.glb", 200).valueOf() === true && s.get("marauder").yaw === 180, "yaw snaps to 0/90/180/270 (200 -> 180)");
    ok(s.set("frigate", "/x.glb") === false, "unknown class rejected");
    ok(Object.keys(backing).length === 1, "one storage key used");

    // a fresh store over the SAME backing must see the assignments -- this is the persistence the picker relies on
    const s2 = makeModelStore(mock);
    ok(s2.get("raider") && s2.get("raider").url.endsWith("raider.glb"), "persists across reload (new store, same storage)");
    ok(Object.keys(s2.all()).length === 2, "all() lists both assignments");
    s2.clear("raider");
    ok(makeModelStore(mock).get("raider") === null, "clear persists");
}

// 4) NULL STORAGE -- degrades to in-memory, never throws (a page with localStorage disabled still runs).
{
    const s = makeModelStore(null);
    ok(s.set("corsair", "/c.glb") === true && s.get("corsair").url === "/c.glb", "null storage works in-memory");
}

if (fail) { console.error(`\nesShipModelsCore-selfcheck: ${pass} pass, ${fail} FAIL`); process.exit(1); }
console.log(`esShipModelsCore-selfcheck: all ${pass} pass`);

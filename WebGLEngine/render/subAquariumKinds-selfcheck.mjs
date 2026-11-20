// WebGLEngine/render/subAquariumKinds-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/subAquariumKinds-selfcheck.mjs      (about 2 s)
//
// THE GATE OF render/subAquariumKinds.mjs (backlog `fly-kind-peer-registration`) AND OF THE ONE ADDITIVE FIELD IT NEEDS FROM render/subAquariumSim.mjs, snapshot `kindWait`:
//   1 THE FIELD    on a real tank: a sub of another circuit with its weights and no kind registered has kindWait "kind"; with a kind registered and the wrong weight count, "count"; seated by its kind, null; a gfc sub and a sub with no weights, null; a kind whose builder throws leaves kindWait null and kindError set.
//   2 ENSURE       on a real tank holding waiting subs of fish, plain14, leaky (and one of an unknown circuit): ensureKinds registers exactly the three it has loaders for, the tank then flies them by those kinds (snapshot `kind`), the unknown one is remembered and reported, a second call registers nothing (each circuit once); flycx with no heading-loop circuit
//                  is NOT tried (a later call, with the circuit, registers it); a loader that throws, and a registration the tank refuses, are recorded in state.failed and do not throw.
//   3 THE LABEL    pilotLabel for every case: gfc network, gfc autopilot, each shipped kind by name, waiting, no kind (unknown), kind failed to load, weights do not fit, kind refused it; never "PD autopilot" for a non-gfc sub.
//   4 THE SOURCE   pure: no DOM, no clock, no Math.random, no file read; the only imports are the dynamic ones of the loaders.
// NOT CHECKED, said plainly: the page wiring (two calls in sub-aquarium.html); that a browser serves the loaders' imports. Sabotage: see the log at the foot of this header (none run yet).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "./subAquariumSim.mjs";
import * as K from "./subAquariumKinds.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const entry = (id, circuit, n, extra) => ({ id, name: id, hue: 10, from: "10.0.0.7", local: false, theta: null, circuit, weights: Array.from({ length: n }, () => 0), ...(extra || {}) });
const snapOf = (q, id) => q.snapshot().find((s) => s.id === id);

console.log("subAquariumKinds-selfcheck -- kinds registered on arrival, and what the list says\n");

// 1 THE FIELD
{
    const q = A.createTank();
    q.sync([entry("a", "fish", 803), entry("b", "fish", 5), entry("c", "fish", 803), entry("d", "gfc", 963), { id: "e", name: "e", hue: 1, from: "x", local: false, theta: null, circuit: "fish" }, entry("f", "thrower", 3)]);
    ok("a waiting sub (weights kept, no kind registered for its circuit) has kindWait \"kind\"", snapOf(q, "a").kindWait === "kind" && snapOf(q, "a").kind === null);
    ok("a gfc sub and a sub with no weights have kindWait null", snapOf(q, "d").kindWait === null && snapOf(q, "e").kindWait === null);
    q.registerPilotKind("thrower", { weightCount: 3, build() { throw new Error("no"); } });
    ok("a kind whose builder throws: kindWait null and kindError set", snapOf(q, "f").kindWait === null && /no/.test(snapOf(q, "f").kindError || ""));
    q.registerPilotKind("fish", { weightCount: 803, build: () => () => ({ pitch: 0, yaw: 0, thrust: 0, ballast: 0 }) });
    ok("seated by its kind: kindWait null and kind \"fish\"", snapOf(q, "a").kindWait === null && snapOf(q, "a").kind === "fish" && snapOf(q, "c").kind === "fish");
    ok("a registered kind and the wrong weight count: kindWait \"count\"", snapOf(q, "b").kindWait === "count" && snapOf(q, "b").kind === null);
}

// 2 ENSURE
const FISH = 803, PLAIN14 = 954, LEAKY = 2;
{
    const q = A.createTank(), state = K.newKindState();
    q.sync([entry("f1", "fish", FISH), entry("p1", "plain14", PLAIN14), entry("l1", "leaky", LEAKY), entry("u1", "martian", 7), entry("x1", "flycx", 1729), entry("g1", "gfc", 963)]);
    ok("before: six subs, five waiting circuits in first-seen order", K.waitingCircuits(q.snapshot()).join() === "fish,plain14,leaky,martian,flycx");
    const r = await K.ensureKinds(q, q.snapshot(), state);
    ok("registers exactly the three circuits it has loaders for (flycx waits for its circuit, martian has no loader)", r.registered.join() === "fish,plain14,leaky" && r.seated === 3);
    ok("the tank now flies fish, plain14 and leaky by their kinds", snapOf(q, "f1").kind === "fish" && snapOf(q, "p1").kind === "plain14" && snapOf(q, "l1").kind === "leaky");
    ok("the unknown circuit is remembered, not retried; flycx is not tried yet; the gfc sub is untouched", state.unknown.has("martian") && !state.tried.has("flycx") && !state.tried.has("gfc") && snapOf(q, "g1").kindWait === null);
    const r2 = await K.ensureKinds(q, q.snapshot(), state);
    ok("a second call registers nothing (each circuit once)", r2.registered.length === 0 && r2.seated === 0);
    state.ctx.flyCircuit = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "vendor", "hemibrain", "hemibrain-cx-heading-loop.json"), "utf8"));
    const r3 = await K.ensureKinds(q, q.snapshot(), state);
    ok("with the heading-loop circuit handed in, flycx registers and its sub is seated (1,729 weights)", r3.registered.join() === "flycx" && snapOf(q, "x1").kind === "flycx", JSON.stringify(r3));
    const st = K.newKindState(), q2 = A.createTank(); q2.sync([entry("z", "boom", 1), entry("y", "nope", 1)]);
    const bad = { boom: async () => { throw new Error("import failed"); }, nope: async () => ({ weightCount: 0, build() {} }) };
    const r4 = await K.ensureKinds(q2, q2.snapshot(), st, bad);
    ok("a loader that throws and a kind the tank refuses are recorded in state.failed and do not throw", r4.registered.length === 0 && /import failed/.test(st.failed.get("boom") || "") && st.failed.has("nope"), JSON.stringify([...st.failed]));
    { // each circuit is tried ONCE, whatever happens to it: a loader that keeps failing is called one time over three refreshes; an unknown circuit is marked tried
        let calls = 0; const q3 = A.createTank(), s3 = K.newKindState(); q3.sync([entry("w", "flaky", 4), entry("m", "martian", 4)]);
        const flaky = { flaky: async () => { calls++; throw new Error("down"); } };
        for (let i = 0; i < 3; i++) await K.ensureKinds(q3, q3.snapshot(), s3, flaky);
        ok("a failing loader is called once over three refreshes, and an unknown circuit is marked tried", calls === 1 && s3.tried.has("flaky") && s3.tried.has("martian") && s3.unknown.has("martian"), "calls " + calls);
        ok("waitingCircuits counts only subs with no kind registered (kindWait \"kind\"), not the wrong-length ones", K.waitingCircuits([{ circuit: "a", kindWait: "count" }, { circuit: "b", kindWait: null }, { circuit: "c", kindWait: "kind" }, { circuit: "c", kindWait: "kind" }]).join() === "c");
        const fk = await K.LOADERS.fish(), fc = await K.LOADERS["fish-control"](), pk = await K.LOADERS.plain14(), lk = await K.LOADERS.leaky();
        ok("each loader returns the kind of ITS circuit: fish 803 weights, fish-control 803, plain14 954, leaky 2; flycx without its circuit answers null", fk.circuit === "fish" && fk.weightCount === 803 && fc.circuit === "fish-control" && fc.weightCount === 803 && pk.circuit === "plain14" && pk.weightCount === 954 && lk.circuit === "leaky" && lk.weightCount === 2 && (await K.LOADERS.flycx({})) === null && (await K.LOADERS.flycx()) === null);
    }
    const sp = K.newKindState(), ownProp = await K.ensureKinds(A.createTank(), [{ id: "q", circuit: "constructor", kindWait: "kind" }], sp, {});
    ok("a circuit named like an Object prototype member is not a loader: it is reported as unknown, not as a failed load", ownProp.registered.length === 0 && sp.unknown.has("constructor") && sp.failed.size === 0);
}

// 3 THE LABEL
{
    const st = K.newKindState(); st.failed.set("fx", "import failed"); st.unknown.add("martian");
    const L = (s, state) => K.pilotLabel({ circuit: "fish", kind: null, kindError: null, kindWait: null, pilot: "autopilot", ...s }, state);
    ok("gfc network and gfc autopilot", L({ circuit: "gfc", pilot: "network" }) === "network" && L({ circuit: "gfc" }) === "PD autopilot" && K.pilotLabel({ pilot: "network" }) === "network");
    ok("seated kinds by name", L({ circuit: "flycx", kind: "flycx" }) === "stateful fly" && L({ kind: "fish" }) === "zebrafish-wired" && L({ circuit: "plain14", kind: "plain14" }) === "plain net" && L({ circuit: "leaky", kind: "leaky" }) === "leaky unit" && L({ circuit: "other", kind: "other" }) === "other");
    ok("waiting, with and without a state", L({ kindWait: "kind" }) === "waiting for its kind (fish)" && L({ kindWait: "kind" }, K.newKindState()) === "waiting for its kind (fish)");
    ok("no kind, failed to load, weights do not fit, refused", L({ circuit: "martian", kindWait: "kind" }, st) === "autopilot: no kind for circuit martian" && /^autopilot: the fx kind failed to load \(import failed\)$/.test(L({ circuit: "fx", kindWait: "kind" }, st)) && L({ kindWait: "count" }) === "autopilot: its weights do not fit the fish kind" && L({ kindError: "boom" }) === "autopilot: its kind refused it (boom)");
    const all = [L({ kindWait: "kind" }), L({ kindWait: "count" }), L({ kindError: "e" }), L({ circuit: "martian", kindWait: "kind" }, st), L({ circuit: "fx", kindWait: "kind" }, st)];
    ok("!! never \"PD autopilot\" for a sub that was sent to fly something else", all.every((x) => x !== "PD autopilot" && !/^PD autopilot/.test(x)));
}

// 4 THE SOURCE
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "subAquariumKinds.mjs"), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    const imports = [...src.matchAll(/(?:^|[^\w.])import\s*\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]).sort();
    ok("!! pure: no Math.random, no clock, no DOM, no file or network; the only imports are the five loaders' dynamic ones", !/Math\.random|Date\.now|performance\.now|document\.|window\.|fetch\(|node:|readFileSync/.test(src) && !/^import\s/m.test(src) && imports.join() === "../brain/pilotLeakyHeading.mjs,./subAquariumFish.mjs,./subAquariumFish.mjs,./subAquariumFlyCx.mjs,./subAquariumPlain14.mjs", imports.join());
}

finished = true;
console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks pass");
if (fails) process.exit(1);

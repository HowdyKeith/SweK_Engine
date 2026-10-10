#!/usr/bin/env node
// WebGLEngine/brain/roster-selfcheck.mjs -- v4827
//
// Run: node brain/roster-selfcheck.mjs
//
// GRADES brain/roster.mjs and race-brain.html's "Load Racers" panel built on it: for each of four cars, which brain DRIVES it and which works its TURRET, then Start Race.
//
// Section 1, THE DEFAULT IS THE OLD LINEUP: every slot on "default for this car" resolves to the exact weights and names the page built before there was a panel (the old
// inline code is kept here as the oracle), for each of the four states the page can be in (a stored brain or not, an imported peer or not). Section 2, EVERY CHOICE: each id the panel
// can offer resolves to a vector of the right length with finite entries, an id nothing holds falls back by name and says so, "(no car)" removes the car and keeps the others' colours,
// the library's ids resolve to the entry itself (and "peer" is the LATEST of two), hostile saved choices are sanitised, and the noise is consumed in slot order. Section 3, THE CHOICE REACHES THE RACE: real races through
// raceWithGunners -- a zero driver does not move and a hand driver does, a zero gunner never fires and a hand gunner does, the same lineup is the same fingerprint, a swapped lineup is
// not. Section 4, THE PAGE: race-brain.html in its own browser -- the panel is there with four rows, the default names are the old ones, a choice made in a select is the car that
// races after Start Race, a slot set to no car leaves three, an imported brain is offered and can be given to a car, and the choices survive a reload.
//
// SABOTAGE LOG -- v4827, fifteen, each applied to brain/roster.mjs (or race-brain.html where named), the gate run, the file restored. Reds are rows, counted by `grep -c '^  FAIL'`.
//   A  the third car's default driver "noise10" -> "noise05"                 3 red (the default lineup, stored absent, peer absent and imported; the page's names on load)
//   B  the fallback for an id nothing holds stops saying so                   1 red (the ghost-id row: four problems named, none silent)
//   C  "stored brain" offered with none held                                 2 red (the offered-set row, and the page's select options)
//   D  a no-car slot renumbers the cars after it (colour/slot by position)    1 red (the roster-only row: car 3 stays yellow when car 2 is out)
//   E  the zero DRIVER resolves to the hand weights                          3 red (two default-lineup rows that carry a zero car, and the race row: the zero car drove 100 m)
//   F  the zero GUNNER resolves to the hand gunner                           1 red (the race row: the zero gunner took shots)
//   G  "peer" picks the FIRST import instead of the latest                   1 red (the two-import row; the one-entry library of the first draft could not tell)
//   H  an imported id resolves to a copy of its weights                      2 red (identity rows for the driver and the gunner)
//   I  a 200-character saved id is kept                                      1 red (the sanitise row)
//   J  the noise drawn from the stream in reverse slot order                 14 red (every default-lineup row and the noise-order row: the whole panel rests on it)
//   K  an empty lineup is not reported                                       1 red (the no-car-at-all row)
//   L  race-brain.html builds the race from the default specs, not the selects   3 red (the chosen-driver, no-car and imported-brain page rows)
//   M  race-brain.html does not save a choice                                1 red (the reload row)
//   N  race-brain.html numbers the trucks by position, not slot             *** 0 red the first time *** -- the page row removed the LAST slot, where position and slot are the same
//                                                                            number. Row added that removes a MIDDLE slot and reads which truck is on the road (rb.trucks); then 1 red.
//   O  the Default lineup button does nothing                                1 red (the reset row)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { initNode, mod } from "../physics/box3d/box3dNode.mjs";
import { worldFromModule } from "../render/slugTicker.mjs";
import * as D from "./drivePolicy.mjs";
import * as GP from "./gunnerPolicy.mjs";
import * as R from "./roster.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);
const st = await initNode(); if (!st.ready) { console.log("  FAIL  box3d wasm: " + st.reason); process.exit(1); }
const worldFrom = () => worldFromModule(mod(), [0, -9.81, 0]);
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const mkRng = () => { let a = 99; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; };   // the page's own seeded rng
const stored = D.perturb(D.handWeights(), 0.2, mkRng()), storedGun = GP.handWeights().map((v, i) => (i % 7 === 0 ? v + 0.01 : v)), peerD = D.perturb(D.handWeights(), 0.3, mkRng()), peerG = GP.handWeights().map((v, i) => (i % 5 === 0 ? v - 0.02 : v));
const lib = (withPeer) => (withPeer ? { drive: [{ id: "lib:drive-aaaa1111", label: "aaaa1111 (score 12)", weights: peerD }], gun: [{ id: "lib:gun-bbbb2222", label: "bbbb2222", weights: peerG }] } : { drive: [], gun: [] });
const ctxOf = (hasStored, withPeer, rng = mkRng()) => ({ D, GP, stored: hasStored ? stored : null, storedGun: hasStored ? storedGun : null, library: lib(withPeer), rng });

sec("1. THE DEFAULT IS THE OLD LINEUP, to the byte, in all four states the page can be in");
{
    // the code race-brain.html had before the panel, kept as the oracle: brains, names and gunner weights for a stored brain (cur), a stored gunner (gcur) and a peer
    const legacy = (cur, gcur, peerBrain, peerGunnerBrain, rng) => {
        const brains = cur ? [cur, D.handWeights(), D.perturb(cur, 0.05, rng), peerBrain || D.zeroWeights()] : [D.handWeights(), D.perturb(D.handWeights(), 0.05, rng), D.perturb(D.handWeights(), 0.1, rng), peerBrain || D.zeroWeights()];
        const names = cur ? ["stored brain", "hand", "stored + noise", peerBrain ? "peer brain" : "zero"] : ["hand", "hand + noise 0.05", "hand + noise 0.1", peerBrain ? "peer brain" : "zero"];
        const peerSlot = brains.length - 1;
        const gunners = brains.map((c, i) => (gcur && i === 0 ? gcur : (i === peerSlot && peerGunnerBrain) ? peerGunnerBrain : GP.handWeights()));
        return { brains, names, gunners };
    };
    for (const [hasStored, withPeer] of [[false, false], [false, true], [true, false], [true, true]]) {
        const old = legacy(hasStored ? stored : null, hasStored ? storedGun : null, withPeer ? peerD : null, withPeer ? peerG : null, mkRng());
        const now = R.resolveRoster(R.defaultSpecs(), ctxOf(hasStored, withPeer));
        const dOk = now.cars.length === 4 && now.cars.every((c, i) => same(c.driver.weights, old.brains[i])), nOk = now.cars.every((c, i) => c.driver.label === old.names[i]), gOk = now.cars.every((c, i) => same(c.gunner.weights, old.gunners[i]));
        ok(`!! stored brain ${hasStored ? "held" : "absent"}, peer ${withPeer ? "imported" : "absent"}: the default lineup is the old one -- four drivers' weights, their four names and four gunners' weights, bit for bit`, dOk && nOk && gOk && now.problems.length === 0, `names ${now.cars.map((c) => c.driver.label).join(" | ")}`);
    }
    const a = R.resolveRoster(R.defaultSpecs(), ctxOf(true, true)), b = R.resolveRoster(R.defaultSpecs(), ctxOf(true, true));
    ok("the same specs, context and seed give the same weights twice (a lineup is a function of its inputs)", a.cars.every((c, i) => same(c.driver.weights, b.cars[i].driver.weights)));
}

sec("2. EVERY CHOICE THE PANEL CAN OFFER");
{
    const ctx = ctxOf(true, true), ch = R.choices(ctx);
    const finite = (w, n) => w.length === n && Array.from(w).every(Number.isFinite);
    let bad = [];
    for (const d of ch.driver.filter((x) => x.id !== R.NONE)) for (const g of ch.gunner) {
        const r = R.resolveRoster([{ driver: d.id, gunner: g.id }, { driver: R.NONE, gunner: R.AUTO }, { driver: R.NONE, gunner: R.AUTO }, { driver: R.NONE, gunner: R.AUTO }], ctxOf(true, true));
        if (r.cars.length !== 1 || r.problems.length || !finite(r.cars[0].driver.weights, D.WEIGHT_COUNT) || !finite(r.cars[0].gunner.weights, GP.WEIGHT_COUNT)) bad.push(d.id + "/" + g.id);
    }
    ok(`!! all ${ch.driver.length - 1} driver choices x ${ch.gunner.length} gunner choices resolve to vectors of the right length (${D.WEIGHT_COUNT} and ${GP.WEIGHT_COUNT}) with every entry finite, and no problem is raised`, bad.length === 0, bad.join(", ") || `${(ch.driver.length - 1) * ch.gunner.length} pairs`);
    const none = R.choices(ctxOf(false, false));
    ok("a source that needs something the page does not hold is not OFFERED: no stored brain or gunner, no peer, no imported entries before they exist", !none.driver.some((x) => /stored|peer|lib:/.test(x.id)) && !none.gunner.some((x) => /stored|peer|lib:/.test(x.id)) && none.driver.some((x) => x.id === "hand") && none.gunner.some((x) => x.id === "zero"), none.driver.map((x) => x.id).join(","));
    ok("...and offered once held: stored, stored + noise, peer and the library's own ids", ["stored", "storednoise", "peer", "lib:drive-aaaa1111"].every((id) => ch.driver.some((x) => x.id === id)) && ["stored", "peer", "lib:gun-bbbb2222"].every((id) => ch.gunner.some((x) => x.id === id)));

    const ghost = R.resolveRoster([{ driver: "stored", gunner: "peer" }, { driver: "lib:drive-nothing", gunner: "lib:gun-nothing" }, { driver: R.AUTO, gunner: R.AUTO }, { driver: R.AUTO, gunner: R.AUTO }], ctxOf(false, false));
    ok("!! a choice nothing holds (a saved 'stored brain' when none is held, an imported id that is gone) falls back to the hand weights AND IS REPORTED BY NAME -- never a silent substitute, never a throw", ghost.problems.length === 4 && /car 1 \(red\).*"stored"/.test(ghost.problems[0]) && /"lib:gun-nothing"/.test(ghost.problems[3]) && same(ghost.cars[0].driver.weights, D.handWeights()), ghost.problems[0]);
    const gone = R.resolveRoster([{ driver: R.AUTO, gunner: R.AUTO }, { driver: R.NONE, gunner: R.AUTO }, { driver: R.AUTO, gunner: R.AUTO }, { driver: R.NONE, gunner: R.AUTO }], ctxOf(false, false));
    ok("a slot set to no car leaves the others, each keeping ITS colour and slot (car 3 is still yellow when car 2 is out)", gone.cars.length === 2 && gone.cars[0].slot === 0 && gone.cars[1].slot === 2 && gone.cars[1].colour === "yellow" && /yellow/.test(R.describe(gone)[1]) && !/green/.test(R.describe(gone).join(" ")), R.describe(gone).join(" | "));
    const empty = R.resolveRoster(Array.from({ length: 4 }, () => ({ driver: R.NONE, gunner: R.AUTO })), ctxOf(false, false));
    ok("a lineup with no car at all is reported (the page then races the default and says why), not run as an empty race", empty.cars.length === 0 && empty.problems.some((p) => /no car is selected/.test(p)));
    const e = R.resolveRoster([{ driver: "lib:drive-aaaa1111", gunner: "lib:gun-bbbb2222" }, { driver: "peer", gunner: "peer" }, { driver: R.AUTO, gunner: R.AUTO }, { driver: R.AUTO, gunner: R.AUTO }], ctxOf(false, true));
    ok("the library's entry is the weights handed back (identity, not a copy that drifts), by its own id and by 'peer' (the latest)", e.cars[0].driver.weights === peerD && e.cars[0].gunner.weights === peerG && e.cars[1].driver.weights === peerD && e.cars[1].gunner.weights === peerG);
    const peerD2 = D.perturb(D.handWeights(), 0.4, mkRng()), two = { D, GP, stored: null, storedGun: null, rng: mkRng(), library: { drive: [{ id: "lib:drive-first", label: "first", weights: peerD }, { id: "lib:drive-second", label: "second", weights: peerD2 }], gun: [] } };
    const lat = R.resolveRoster([{ driver: "peer", gunner: R.AUTO }, { driver: "lib:drive-first", gunner: R.AUTO }, { driver: "lib:drive-second", gunner: R.AUTO }, { driver: R.NONE, gunner: R.AUTO }], two);
    ok("with two imports held, 'peer' is the LATEST one and each id is its own entry: car 1 'peer' = the second, car 2 = the first, car 3 = the second by id", lat.cars[0].driver.weights === peerD2 && lat.cars[1].driver.weights === peerD && lat.cars[2].driver.weights === peerD2 && lat.problems.length === 0);
    const s = R.sanitizeSpecs([{ driver: "hand", gunner: 7 }, null, "x", { driver: "z".repeat(200), gunner: "zero" }, { driver: "zero", gunner: "zero" }, { driver: "extra", gunner: "extra" }]);
    ok("saved choices from storage are sanitised: a non-object, a number, a 200-character id and a fifth entry are dropped to 'default for this car' or ignored, four slots always", s.length === 4 && s[0].driver === "hand" && s[0].gunner === R.AUTO && s[1].driver === R.AUTO && s[3].driver === R.AUTO && s[3].gunner === "zero" && R.sanitizeSpecs("junk").every((x) => x.driver === R.AUTO) && R.sanitizeSpecs(null).length === 4, JSON.stringify(s[3]));
    const n1 = R.resolveRoster([{ driver: "noise05", gunner: R.AUTO }, { driver: "noise10", gunner: R.AUTO }, { driver: R.NONE, gunner: R.AUTO }, { driver: R.NONE, gunner: R.AUTO }], ctxOf(false, false)), n2 = R.resolveRoster([{ driver: "noise10", gunner: R.AUTO }, { driver: "noise05", gunner: R.AUTO }, { driver: R.NONE, gunner: R.AUTO }, { driver: R.NONE, gunner: R.AUTO }], ctxOf(false, false));
    ok("the noise comes off the seeded stream in SLOT order: the same two choices in swapped slots draw the first and the second numbers of the stream the other way round", !same(n1.cars[0].driver.weights, n2.cars[1].driver.weights) && !same(n1.cars[1].driver.weights, n2.cars[0].driver.weights));
}

sec("3. THE CHOICE REACHES THE RACE: real races through raceWithGunners");
{
    const run = (specs, hasStored = false, withPeer = false, seconds = 20) => {
        const r = R.resolveRoster(specs, ctxOf(hasStored, withPeer)), out = GP.raceWithGunners(worldFrom, r.cars.map((c) => c.driver.weights), r.cars.map((c) => c.gunner.weights), { seed: 1, seconds });
        return { r, out };
    };
    const four = (a, b, c, d) => [a, b, c, d].map((x) => (x ? { driver: x[0], gunner: x[1] } : { driver: R.NONE, gunner: R.AUTO }));
    const A = run(four(["hand", "hand"], ["zero", "zero"], null, null)), res = A.out.results;
    ok("!! a ZERO driver does not drive and a HAND driver does: after 20 s the zero car is within 3 m of where it started and the hand car is over 100 m down the road", res[1].metres < 3 && res[0].metres > 100, `hand ${res[0].metres.toFixed(1)} m, zero ${res[1].metres.toFixed(1)} m`);
    const B = run(four(["hand", "zero"], ["hand", "hand"], null, null), false, false, 30), bres = B.out.results;
    ok("!! a ZERO gunner never fires and a HAND gunner does: over 30 s the car with the zero gunner took no shot and the car with the hand gunner took some", bres[0].shots === 0 && bres[1].shots > 0, `zero gunner ${bres[0].shots} shots, hand gunner ${bres[1].shots} shots`);
    const C1 = run(four(["hand", "hand"], ["noise05", "hand"], null, null)), C2 = run(four(["hand", "hand"], ["noise05", "hand"], null, null)), C3 = run(four(["noise05", "hand"], ["hand", "hand"], null, null));
    ok("the same lineup twice is the same race to the bit, and the same two drivers in swapped cars is another race (a choice is positional)", C1.out.fingerprint === C2.out.fingerprint && C1.out.fingerprint !== C3.out.fingerprint, `${C1.out.fingerprint} / ${C2.out.fingerprint} / swapped ${C3.out.fingerprint}`);
    const P = run(four(["lib:drive-aaaa1111", "lib:gun-bbbb2222"], ["peer", "hand"], null, null), false, true, 20), pres = P.out.results, handDrive = D.weightsHash(D.handWeights()), handGun = D.weightsHash(GP.handWeights());
    ok("an imported brain drives the car it was given to, by its own id and by 'peer': both cars race with the library entry's weights (its hash), not the hand weights", pres[0].hash === D.weightsHash(peerD) && pres[1].hash === D.weightsHash(peerD) && pres[0].hash !== handDrive, `${pres[0].hash} / ${pres[1].hash} vs hand ${handDrive}`);
    ok("...and an imported gunner works the turret of the car it was given to while the other car keeps the hand gunner", pres[0].gunnerHash === D.weightsHash(peerG) && pres[0].gunnerHash !== handGun && pres[1].gunnerHash === handGun, `${pres[0].gunnerHash} / ${pres[1].gunnerHash} vs hand ${handGun}`);
}

sec("4. THE PAGE: race-brain.html in its own browser");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 240000, script: `async () => {
            const boot = async () => {
                const f = document.createElement("iframe"); f.style.width = "1100px"; f.style.height = "800px"; f.src = "/race-brain.html"; document.body.appendChild(f);
                await new Promise((res) => { f.onload = res; });
                const doc = f.contentDocument, win = f.contentWindow, txt = (id) => (doc.getElementById(id) || {}).textContent || "";
                const t1 = performance.now(); while (performance.now() - t1 < 150000 && !/a turret on each/.test(txt("tick")) && !/threw|HTTP/.test(txt("be") + txt("tick"))) { globalThis.__swekStep = "waiting: " + txt("tick").slice(0, 60); await new Promise((res) => setTimeout(res, 50)); }
                return { f, doc, win, txt, booted: /a turret on each/.test(txt("tick")) };
            };
            const A = await boot(); if (!A.booted) return { booted: false, be: A.txt("be") };
            const { doc, win, txt } = A, rb = win.__raceBrain, byId = (id) => doc.getElementById(id);
            const choose = (id, v) => { const s = byId(id); s.value = v; s.dispatchEvent(new win.Event("change", { bubbles: true })); };
            const out = { booted: true };
            out.rows = doc.querySelectorAll("#rosterRows tr").length; out.selects = doc.querySelectorAll("#rosterRows select").length;
            out.panelOpen = !!byId("roster") && byId("roster").open; out.startText = (byId("race") || {}).textContent; out.raceInPanel = !!byId("roster").querySelector("#race");
            out.defaultNames = rb.names.slice(); out.defaultSpecs = JSON.stringify(rb.specs); out.defaultTick = txt("tick");
            out.driverOptions = Array.from(byId("drv1").options).map((o) => o.value); out.gunnerOptions = Array.from(byId("gun1").options).map((o) => o.value);
            // a driver chosen for car 2 and a gunner for car 1, then Start Race
            choose("drv1", "zero"); choose("gun0", "zero"); byId("race").click();
            out.afterNames = rb.names.slice(); out.afterRoster = rb.roster.cars.map((c) => c.driver.label + " / " + c.gunner.label); out.afterNote = txt("rosterNote");
            // a slot set to no car
            choose("drv3", "none"); byId("race").click(); out.threeCars = rb.names.length; out.threeTick = txt("tick"); out.threeSlots = rb.roster.cars.map((c) => c.slot).join(",");
            // a slot in the MIDDLE set to no car: cars 1, 2 and 4 race, and car 4 keeps ITS (purple) truck and slot -- the last slot alone cannot tell a slot from a position
            choose("drv3", "auto"); choose("drv2", "none"); byId("race").click(); out.midSlots = rb.roster.cars.map((c) => c.slot).join(","); out.midFiles = rb.trucks.map((t) => t.file).join(",");
            choose("drv2", "auto"); choose("drv3", "none");
            // an imported brain, through the real file input: exported from the page, then imported back
            const realCreate = win.URL.createObjectURL.bind(win.URL); let cap = null; win.URL.createObjectURL = (b) => { cap = b; return realCreate(b); };
            byId("exportBrain").click(); win.URL.createObjectURL = realCreate;
            const blob = cap ? JSON.parse(await cap.text()) : null;
            const peerBefore = txt("peer"); const dt = new win.DataTransfer(); dt.items.add(new win.File([JSON.stringify(blob)], "peer.json", { type: "application/json" }));
            const input = byId("importBrainFile"); input.files = dt.files; input.dispatchEvent(new win.Event("change", { bubbles: true }));
            const t2 = performance.now(); while (performance.now() - t2 < 5000 && txt("peer") === peerBefore) await new Promise((res) => setTimeout(res, 10));
            out.libraryAfterImport = rb.library.drive.length; out.driverOptionsAfterImport = Array.from(byId("drv0").options).map((o) => o.value);
            const libId = rb.library.drive[0] && rb.library.drive[0].id; out.libId = libId;
            if (libId) { choose("drv0", libId); byId("race").click(); out.importedName = rb.names[0]; out.importedLabel = rb.roster.cars[0].driver.label; }
            out.persisted = JSON.stringify(rb.specs);
            // survive a reload: boot a second page in a new iframe, in the same origin (same localStorage)
            A.f.remove();
            const B = await boot(); if (!B.booted) return { ...out, reloadBooted: false };
            out.reloadBooted = true; out.reloadDrv1 = B.doc.getElementById("drv1").value; out.reloadGun0 = B.doc.getElementById("gun0").value; out.reloadDrv3 = B.doc.getElementById("drv3").value;
            // the reset button
            B.doc.getElementById("rosterReset").click(); out.afterReset = [B.doc.getElementById("drv1").value, B.doc.getElementById("gun0").value, B.doc.getElementById("drv3").value];
            return out;
        }` });
        ok("the harness booted race-brain.html and drove the panel", r.ok && r.result && r.result.booted, r.ok ? (r.result ? "" : "") : String(r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 300));
        if (r.ok && r.result && r.result.booted) {
            const p = r.result;
            ok("!! the panel is there, open, with four rows and eight selects (a driver and a gunner for each car), and the Start Race button is the page's own #race, inside it", p.panelOpen && p.rows === 4 && p.selects === 8 && p.raceInPanel && /Start Race/.test(p.startText), `${p.rows} rows, ${p.selects} selects, button "${p.startText}"`);
            ok("!! on load nothing is chosen and the lineup is the old one: every select on 'default for this car' and the cars named hand, hand + noise 0.05, hand + noise 0.1, zero", /"driver":"auto","gunner":"auto"/.test(p.defaultSpecs) && p.defaultNames.join("|") === "hand|hand + noise 0.05|hand + noise 0.1|zero", p.defaultNames.join(" | "));
            ok("...and with no stored brain, no peer and no library, the panel does not OFFER a stored brain, a peer or an imported one", !p.driverOptions.some((v) => /stored|peer|lib:/.test(v)) && !p.gunnerOptions.some((v) => /stored|peer|lib:/.test(v)) && p.driverOptions.includes("hand") && p.driverOptions.includes("zero") && p.driverOptions.includes("none"), p.driverOptions.join(","));
            ok("!! a choice made in a select is the car that races after Start Race: car 2 set to the zero driver is named zero, and car 1's gunner set to zero shows as the zero gunner in the lineup line", p.afterNames[1] === "zero" && /zero gunner/.test(p.afterRoster[0]) && /zero gunner/.test(p.afterNote), `${p.afterNames.join(" | ")}; ${p.afterRoster[0]}`);
            ok("!! a slot set to '(no car)' leaves three cars on the road, the others keeping their slots (0,1,2), and the HUD counts three", p.threeCars === 3 && p.threeSlots === "0,1,2" && /3 cars/.test(p.threeTick), `${p.threeTick.slice(0, 160)}`);
            ok("!! a slot in the MIDDLE set to '(no car)' leaves cars 1, 2 and 4, and car 4 keeps its slot and its own (purple) truck on the road, not the third car's", p.midSlots === "0,1,3" && p.midFiles === "vehicle-truck-red.glb,vehicle-truck-green.glb,vehicle-truck-purple.glb", `slots ${p.midSlots}; trucks ${p.midFiles}`);
            ok("!! an imported brain is OFFERED (the library grew, the selects gained 'peer' and its own id) and can be given to ANY car: car 1 set to it drives as 'imported'", p.libraryAfterImport === 1 && p.driverOptionsAfterImport.includes("peer") && p.driverOptionsAfterImport.some((v) => /^lib:drive-/.test(v)) && /imported/.test(p.importedName || "") , `${p.importedName}; options ${p.driverOptionsAfterImport.join(",")}`);
            ok("!! the choices survive a reload: the zero driver on car 2, the zero gunner on car 1 and 'no car' on car 4 are what a fresh page shows (an imported id does not persist -- the library is this session's)", p.reloadBooted && p.reloadDrv1 === "zero" && p.reloadGun0 === "zero" && p.reloadDrv3 === "none", `${p.reloadDrv1}, ${p.reloadGun0}, ${p.reloadDrv3}`);
            ok("...and Default lineup puts every select back on 'default for this car'", p.afterReset && p.afterReset.every((v) => v === "auto"), JSON.stringify(p.afterReset));
        }
    }
}

console.log(fails ? `\nroster-selfcheck: ${fails} FAILED` : "\nroster-selfcheck: all checks pass");
process.exitCode = fails ? 1 : 0;

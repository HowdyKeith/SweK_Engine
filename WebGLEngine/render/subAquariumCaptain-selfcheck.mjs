// WebGLEngine/render/subAquariumCaptain-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). Run: node render/subAquariumCaptain-selfcheck.mjs
//
// THE GATE OF THE CAPTAIN AND THE BREACH IN THE SUB AQUARIUM (2026-11-19; brain/SUB_STATIONS_WIP.md section 10): render/subAquariumSim.mjs's setCaptain and breach on a sub with needs, the snapshot's captain and leak,
// render/needsView.mjs's list line, and sub-aquarium.html's captain menu and breach button.
//   1  the API refuses what it cannot use, by name, and changes nothing
//   2  a captain and the advisor do not share a boat; null gives it back to the refill trip; ending the event mends the breach and dismisses the captain
//   3  the snapshot: the leak builds over 5 s from the breach and holds; the captain's kind, con, reason, overrides and watch
//   4  in the tank, from one starting state, breached at 7 %: no captain loses the boat; FIXED and TRIAGE keep it 300 s; TRIAGE has the con as "breach" and ends shallower than FIXED
//   5  the list line; 6 the page
// SABOTAGED -- 27 mutants, each alone in place and restored, EVERY ONE RED BY NAME (final pass): render/subAquariumSim.mjs C01 any captain | C02 a captain with no needs | C03 triage built as fixed | C04 the advisor kept beside a captain |
//   C05 a captain kept beside the advisor | C06 null keeps the captain | C07 the captain never flies | C08 the captain's pump and repair not given to the physics | C09 any leak | C10 a breach with no needs | C11 the leak at once |
//   C12 the leak never reaching the physics | C13 a restarted event keeping the breach | C14 a default breach of 5 % | C15 the snapshot's leak the full leak | C16 the watch dropped | C17 TRIAGE rescuing at the open sea's depths |
//   C18 TRIAGE without its frozen knobs; render/needsView.mjs V01 the captain not in the line | V02 the breach not in the line | V03 the con's words lost | V04 "acting" always; sub-aquarium.html P01 no triage in the menu |
//   P02 the menu not calling setCaptain | P03 a 5 % breach | P04 the menu never synced | P05 the menu enabled with no needs.
// THREE WENT 0 RED ON THE FIRST PASS AND GOT ROWS: C08 (no row put the captain where it asks for the pump), C13 (the row ended the event first, which mends by another path; and restarting over a running event leaves a stale breach
//   whose start is in the new clock's future, so it reads 0 for a few seconds -- the row now waits 12 s), C17 (the row flew FIXED only, which was built with the tank's rescue; TRIAGE's was the one changed).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "./subAquariumSim.mjs";
import { needsLine } from "./needsView.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0, finished = false;
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const guarded = (name, f) => { try { f(); } catch (e) { ok(`${name} ran to the end`, false, "THREW " + String((e && e.stack) || e).split("\n").slice(0, 2).join(" | ").slice(0, 300)); } };
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const J = JSON.stringify;
const entry = (id) => ({ id, name: "Sub " + id, hue: 100, pilot: "autopilot", from: "x", local: true, weights: null });
const tankWith = (ids = ["a"]) => { const t = A.createTank(); t.sync(ids.map(entry)); return t; };
const run = (t, s) => { for (let i = 0; i < Math.round(s * 30); i++) t.step(1 / 30); };
const snap = (t, id = "a") => t.snapshot().find((x) => x.id === id);
console.log("subAquariumCaptain-selfcheck -- a captain over the stations, and a breached hull, in the Sub Aquarium\n");

sec("1. the API");
guarded("section 1", () => {
    const t = tankWith(["a", "b"]); run(t, 5); t.setNeeds("a", "battery");
    const bad = [["a captain that is not fixed, triage or null", () => t.setCaptain("a", "admiral"), /^subAquariumSim\.setCaptain: a captain is "fixed", "triage" or null, got "admiral"/],
        ["a captain on a sub with no needs", () => t.setCaptain("b", "triage"), /setCaptain: the sub has no needs/], ["a breach of 0", () => t.breach("a", 0), /^subAquariumSim\.breach: a leak is a fraction of the weight above 0 and at most 0\.2, got 0/],
        ["a breach over 0.2", () => t.breach("a", 0.25), /got 0\.25/], ["a breach that is not a number", () => t.breach("a", "x"), /got "x"/], ["a breach on a sub with no needs", () => t.breach("b", 0.05), /breach: the sub has no needs/]];
    for (const [what, f, re] of bad) { const e = throws(f); ok(`refuses ${what}, by name`, e !== null && re.test(e), e || "did not throw"); }
    ok("...and changed nothing: no captain, no leak", snap(t).needs.captain === null && snap(t).needs.leak === 0);
    ok("a bad captain is refused BEFORE the id is looked up; an unknown id answers null for both", throws(() => t.setCaptain("zz", "admiral")) !== null && t.setCaptain("zz", "triage") === null && t.breach("zz", 0.05) === null);
    ok("setCaptain answers the captain; breach answers the leak (0.07 by default)", t.setCaptain("a", "fixed") === "fixed" && t.breach("a") === 0.07 && t.setCaptain("a", null) === null);
});

sec("2. who has the boat");
guarded("section 2", () => {
    const t = tankWith(); run(t, 5); t.setNeeds("a", "battery"); t.setAdvisor("a", true); t.setCaptain("a", "triage"); run(t, 1);
    ok("a captain turns the advisor off", snap(t).needs.advisor.on === false && snap(t).needs.captain.kind === "triage");
    t.setAdvisor("a", true); run(t, 1);
    ok("the advisor turns the captain off", snap(t).needs.advisor.on === true && snap(t).needs.captain === null);
    t.setAdvisor("a", false); t.setCaptain("a", "fixed"); t.setCaptain("a", null); run(t, 1);
    ok("null gives the boat back to the refill trip (no captain, no advisor)", snap(t).needs.captain === null && snap(t).needs.advisor.on === false);
    t.setCaptain("a", "triage"); t.breach("a", 0.05); run(t, 6); t.setEvent("a", null); t.setNeeds("a", "battery"); run(t, 1);
    ok("ending the event mends the breach and dismisses the captain: needs started again have no leak and no captain", snap(t).needs.leak === 0 && snap(t).needs.captain === null);
    t.setCaptain("a", "triage"); t.breach("a", 0.05); run(t, 6); t.setNeeds("a", "battery"); run(t, 12);
    ok("so does STARTING the needs again over a running one (no event ended in between), and it stays mended (12 s on: a stale breach would have built up by then, its start being in the new event's future)", snap(t).needs.leak === 0 && snap(t).needs.captain === null, J([snap(t).needs.leak, snap(t).needs.captain]));
});

sec("3. the snapshot");
guarded("section 3", () => {
    const t = tankWith(); run(t, 5); t.setNeeds("a", "battery"); t.setCaptain("a", "fixed"); run(t, 2); t.breach("a", 0.06);
    const l0 = snap(t).needs.leak; run(t, 2.5); const l1 = snap(t).needs.leak; run(t, 2.5); const l2 = snap(t).needs.leak; run(t, 10); const l3 = snap(t).needs.leak;
    ok("the leak is 0 at the breach, half of it 2.5 s later, all of it from 5 s on, and it holds", l0 === 0 && Math.abs(l1 - 0.03) < 0.002 && Math.abs(l2 - 0.06) < 1e-9 && l3 === 0.06, J([l0, l1, l2, l3]));
    const c = snap(t).needs.captain;
    ok("the captain's record: its kind, who has the con, why, the stations overriding the helm this tick, and the watch of the whole event", c.kind === "fixed" && typeof c.con === "string" && Array.isArray(c.overrides) && c.watch && typeof c.watch.con.mission === "number" && typeof c.watch.overrides.damage === "number", J(c));
    ok("the watch has counted every tick since the captain came aboard (a positive count, and only the stations FIXED has)", Object.values(c.watch.con).reduce((a, b) => a + b, 0) > 400 && J(Object.keys(c.watch.con).sort()) === '["energy","mission"]' && J(Object.keys(c.watch.overrides)) === '["damage"]', J(c.watch));
});

sec("4. in the tank: breached at 7 %");
guarded("section 4", () => {
    const fly = (cap) => {
        const t = tankWith(); run(t, 20); t.setNeeds("a", "battery"); if (cap) t.setCaptain("a", cap); const lost0 = snap(t).lost, d0 = snap(t).depth; t.breach("a", 0.07);
        let lostAt = null, cons = new Set(); for (let k = 0; k < 60; k++) { run(t, 5); const s = snap(t); if (s.needs && s.needs.captain) cons.add(s.needs.captain.con); if (s.lost > lost0 && lostAt === null) lostAt = (k + 1) * 5; }
        return { lostAt, d0, d: snap(t).depth, cons: [...cons], event: snap(t).event };
    };
    const none = fly(null), fixed = fly("fixed"), triage = fly("triage");
    console.log(`    none: ${J(none)}\n    fixed: ${J(fixed)}\n    triage: ${J(triage)}`);
    ok("with no captain the breached boat is LOST (crushed and put back) within 120 s", none.lostAt !== null && none.lostAt <= 120, J(none));
    ok("FIXED keeps it 300 s", fixed.lostAt === null && fixed.event === "needs", J(fixed));
    ok("TRIAGE keeps it 300 s, takes the con as BREACH, and ends shallower than it started and than FIXED", triage.lostAt === null && triage.cons.includes("breach") && triage.d < triage.d0 - 5 && triage.d < fixed.d - 5, J([triage.d0, triage.d, fixed.d]));
    ok("FIXED never takes the con as breach (it has no such station)", !fixed.cons.includes("breach"), J(fixed.cons));
    const firstOver = (cap) => { const t = tankWith(); for (let i = 0; i < 600; i++) t.step(1 / 30); t.setNeeds("a", "battery"); t.setCaptain("a", cap); t.breach("a", 0.07);
        for (let i = 0; i < 30 * 120; i++) { t.step(1 / 30); const sn = snap(t); if (sn.needs.captain.watch.overrides.damage > 0) return sn.depth - sn.target.depth; } return null; };
    const overs = ["fixed", "triage"].map(firstOver);
    ok("both captains' damage control rescues on the TANK's room (RESCUE: it first acts about 2 m past the target, not the open sea's 5)", overs.every((o) => o !== null && o > 1.9 && o < 3), J(overs.map((o) => (o === null ? "never" : o.toFixed(2)))));
    const h = tankWith(); run(h, 20); h.setNeeds("a", "battery"); h.injure("a", 0.6); h.setCaptain("a", "triage"); h.breach("a", 0.07); let pump = 0;
    for (let k = 0; k < 300 && pump === 0; k++) { run(h, 1); pump = Math.max(pump, snap(h).needs.pump); }
    ok("the captain WORKS THE PUMP itself: on an injured, breached boat its energy station asks and the tank's physics is given it (the snapshot's pump reaches 1, with no box ticked)", pump === 1, String(pump));
});

sec("5. the list line");
guarded("section 5", () => {
    const row = (n) => ({ needs: { cls: "battery", frac: 0.5, watts: 3000, strain: 0.1, collapseDepth: 60, damage: 0, flood: 0, advisor: { on: false }, leak: 0, captain: null, ...n } });
    const plain = needsLine(row({})), cap = needsLine(row({ captain: { kind: "triage", con: "breach", overrides: ["damage"] }, leak: 0.0712 })), fx = needsLine(row({ captain: { kind: "fixed", con: "mission", overrides: [] } }));
    ok("with no captain and no breach the line has neither", !/CAPTAIN|BREACHED/.test(plain), plain);
    ok("a captain is named with who has the con in words, and 'damage control acting' when it overrides; a breach shows its leak to a tenth of a percent", /CAPTAIN triage: breach \(going up while there is charge\), damage control acting/.test(cap) && /BREACHED \(leak 7\.1%\)/.test(cap), cap);
    ok("FIXED on the mission says so, with no 'acting'", /CAPTAIN fixed: the mission/.test(fx) && !/acting/.test(fx), fx);
    ok("the energy station's con reads 'energy (going up for charge)'", /CAPTAIN fixed: energy \(going up for charge\)/.test(needsLine(row({ captain: { kind: "fixed", con: "energy", overrides: [] } }))));
});

sec("6. the page");
guarded("section 6", () => {
    const html = fs.readFileSync(path.join(ENG, "sub-aquarium.html"), "utf8");
    ok("the page has the captain menu (off, fixed, triage) and the breach button, both disabled until the sub has needs", /<select id="captainSel" disabled><option value="">off<\/option><option value="fixed">fixed<\/option><option value="triage">triage<\/option><\/select>/.test(html) && /<button id="breachBtn" disabled /.test(html));
    ok("the menu calls tank.setCaptain with the choice (off as null) and puts the menu back to off when it is refused", /\$\("captainSel"\)\.onchange = \(\) => \{ if \(!selected\) return; try \{ tank\.setCaptain\(selected, \$\("captainSel"\)\.value \|\| null\); \} catch \(e\) \{[^}]*\$\("captainSel"\)\.value = ""; \} \};/.test(html));
    ok("the button breaches the selected sub at 7 % and says so", /\$\("breachBtn"\)\.onclick = [^\n]*tank\.breach\(selected, 0\.07\)/.test(html) && /"hull breached: a leak of "/.test(html));
    ok("every snapshot sets the menu from the sub's own captain and enables both only with needs", /\$\("captainSel"\)\.disabled = \$\("breachBtn"\)\.disabled = !on; \$\("captainSel"\)\.value = on && me\.needs\.captain \? me\.needs\.captain\.kind : "";/.test(html));
});

finished = true;
console.log(fails ? `\nsubAquariumCaptain-selfcheck: ${fails} FAILED` : "\nsubAquariumCaptain-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);

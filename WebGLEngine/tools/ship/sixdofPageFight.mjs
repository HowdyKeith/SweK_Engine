// WebGLEngine/tools/ship/sixdofPageFight.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE 6-DOF PAGE'S OWN FIGHT, MEASURED, as brain/SIXDOF_PAGE_FIGHT_WIP.md registers it: the five pilots on es-box3d-6dof.html's Load Pilots panel played against each other FROM BOTH SIDES in the page's own
// three-a-side battle (window.__sixdof.runBattles: fleet target assignment, collisions with ram damage, the staggered first shot, the 900-tick limit), on fresh battle seeds. This is the library -- the
// registration as data, the plan, the browser script the command runs, the controls, the sign test, the readings and the verdict. The command is tools/ship/sixdofPageFightCmd.mjs and prints no score;
// the gate is tools/ship/sixdofPageFight-selfcheck.mjs.
//
// NODE ONLY (it drives a browser through tools/ship/webgpuHarness.mjs); the page itself is untouched by this round.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as M6 from "../../brain/pilot6dofMlp.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";
import { runInEngineOrigin } from "./webgpuHarness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENG = path.resolve(HERE, "..", "..");
export const DEFAULT_RESULTS = path.join(ENG, "brain", "sixdofPageFightResults.json");
export const REGISTRATION = "brain/SIXDOF_PAGE_FIGHT_WIP.md";
/** The page's own choices, in the order a pairing names them, each held to its file's hash ("scripted" has none: it is the page's own PD autopilot). */
export const PILOTS = Object.freeze([
    Object.freeze({ id: "scripted", name: "the PD autopilot", file: null, policy: null, hash: null }),
    Object.freeze({ id: "shipped", name: "the fruit fly's Default", file: "pilot6dofWeightsDefault.json", policy: "pilot6dofPolicy", hash: "215e26d9" }),
    Object.freeze({ id: "league", name: "the fruit fly's League pilot", file: "pilot6dofWeightsLeague.json", policy: "pilot6dofPolicy", hash: "32789ff9" }),
    Object.freeze({ id: "close", name: "the fruit fly's close-quarters pilot", file: "pilot6dofWeightsClose.json", policy: "pilot6dofPolicy", hash: "360580a7" }),
    Object.freeze({ id: "gpu", name: "the GPU Brain's pilot", file: "pilot6dofMlpWeightsDefault.json", policy: "pilot6dofMlp", hash: "0ffd8554" }),
]);
export const PILOT_IDS = Object.freeze(PILOTS.map((p) => p.id));
export const BRAINS = Object.freeze(PILOTS.filter((p) => p.hash).map((p) => p.id));
const range = (a, n) => Object.freeze(Array.from({ length: n }, (_, i) => a + i));
/** The registered battle seeds, fresh; and every block a page run had flown before (the page's gate 1-120, v4895's balance measurement 1-300). */
export const SEEDS = range(80001, 100);
export const USED_BATTLE_SEEDS = range(1, 300);
/** C-pilots' scratch DUEL seeds (another seed space: the headless duel's own). */
export const CONTROL_DUEL_SEEDS = Object.freeze([99401, 99402]);
export const ALPHA = 0.01;
export const MAX_TICKS = 4000;   // runBattles' own guard; the page's 900-tick limit ends every battle first
export const DETERMINISM_PAIR = Object.freeze({ a: "shipped", b: "gpu" });

/** The command's first act: refuse a results file that exists (a round's results are never overwritten). The reason, or null. A function so the gate holds it without ever starting a run. */
export const refuseExisting = (file, exists = fs.existsSync) => (exists(file) ? `${file} exists -- a round's results are never overwritten` : null);

/** Parse `--results <file>`, REFUSING an option it does not know. */
export function parseArgs(argv) {
    const o = { results: DEFAULT_RESULTS };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--results") { const v = argv[++i]; if (!v) throw new Error("--results needs a file"); o.results = v; }
        else throw new Error(`unknown option ${JSON.stringify(a)} (known: --results)`);
    }
    return o;
}

/** The plan: every pair of pilots from both sides (X on side A against Y on side B, then Y on A against X on B), then each pilot against itself, all on the same seeds. */
export function plan(pilots = PILOT_IDS, seeds = SEEDS) {
    const out = [];
    for (let i = 0; i < pilots.length; i++) for (let j = i + 1; j < pilots.length; j++) { out.push({ a: pilots[i], b: pilots[j], seeds: [...seeds] }); out.push({ a: pilots[j], b: pilots[i], seeds: [...seeds] }); }
    for (const p of pilots) out.push({ a: p, b: p, seeds: [...seeds], mirror: true });
    return out;
}

/** The exact two-sided sign test on n = wins + losses decisive battles: the chance of a split at least this uneven from a fair coin. */
export function signTest(wins, losses) {
    const n = wins + losses, k = Math.min(wins, losses);
    if (n === 0) return 1;
    let logTerm = -n * Math.LN2, sum = Math.exp(logTerm);   // C(n,0) / 2^n, then C(n,i+1) = C(n,i) (n-i)/(i+1)
    for (let i = 0; i < k; i++) { logTerm += Math.log((n - i) / (i + 1)); sum += Math.exp(logTerm); }
    return Math.min(1, 2 * sum);
}

/** A pairing's reading, the registered rule: "x better" / "y better" when the sign test on the decisive battles is under ALPHA, "no difference shown" otherwise. */
export const readingOf = (x, y, wins, losses, alpha = ALPHA) => { const p = signTest(wins, losses); return wins > losses && p < alpha ? `${x} better` : losses > wins && p < alpha ? `${y} better` : "no difference shown"; };

/** The duel's own floor (train6dofLeague.mjs's LEAD_FLOOR), reported beside the sign test and testing nothing. */
export const FLOOR = 8;
export const floorReading = (x, y, lead) => (lead >= FLOOR ? `${x} better` : lead <= -FLOOR ? `${y} better` : "no difference shown");

/** One pairing from both sides, from x's point of view: x on side A in (a=x, b=y) wins on "A"; x on side B in (a=y, b=x) wins on "B". */
export function pairTally(matchups, x, y) {
    const asA = matchups.find((m) => !m.mirror && m.a === x && m.b === y), asB = matchups.find((m) => !m.mirror && m.a === y && m.b === x);
    if (!asA || !asB) throw new Error(`pairTally: no matchup for ${x} against ${y} from both sides`);
    let wins = 0, losses = 0, draws = 0, timeouts = 0;
    for (const [w, to] of asA.out) { if (w === "A") wins++; else if (w === "B") losses++; else draws++; timeouts += to; }
    for (const [w, to] of asB.out) { if (w === "B") wins++; else if (w === "A") losses++; else draws++; timeouts += to; }
    const lead = wins - losses;
    return { x, y, games: asA.out.length + asB.out.length, wins, losses, draws, timeouts, lead, p: signTest(wins, losses), reading: readingOf(x, y, wins, losses), floorReading: floorReading(x, y, lead) };
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

/** THE VERDICT, from a results file: every pairing, H1, H2 (four readings), H3 (the totals), and what is reported beside them. */
export function verdictOf(file) {
    const ids = file.pilots, pairs = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push(pairTally(file.matchups, ids[i], ids[j]));
    const find = (x, y) => pairs.find((p) => p.x === x && p.y === y);
    const h1 = find("shipped", "gpu"), h2 = BRAINS.map((id) => find("scripted", id));
    const totals = ids.map((id) => {
        const mine = pairs.filter((p) => p.x === id || p.y === id), t = { id, wins: 0, losses: 0, draws: 0, games: 0 };
        for (const p of mine) { const asX = p.x === id; t.wins += asX ? p.wins : p.losses; t.losses += asX ? p.losses : p.wins; t.draws += p.draws; t.games += p.games; }
        return { ...t, lead: t.wins - t.losses };
    });
    const closeLead = totals.find((t) => t.id === "close").lead, h3met = totals.every((t) => t.id === "close" || t.lead < closeLead);
    const mirrors = file.matchups.filter((m) => m.mirror).map((m) => ({ id: m.a, aWins: m.out.filter((r) => r[0] === "A").length, bWins: m.out.filter((r) => r[0] === "B").length, draws: m.out.filter((r) => r[0] === "draw").length, timeouts: m.out.reduce((n, r) => n + r[1], 0) }));
    const all = file.matchups.flatMap((m) => m.out);
    return {
        pairs,
        h1: { pair: h1, met: h1.reading === "shipped better", reading: h1.reading === "shipped better" ? "carries over" : h1.reading === "gpu better" ? "reverses" : "no difference shown" },
        h2: h2.map((p) => ({ pilot: p.y, pair: p, reading: p.reading === `${p.y} better` ? "beats the autopilot" : p.reading === "scripted better" ? "loses to the autopilot" : "no difference shown" })),
        h3: { met: h3met, totals: [...totals].sort((a, b) => b.lead - a.lead) },
        mirrors, battles: all.length, timeouts: all.reduce((n, r) => n + r[1], 0), medianTicks: median(all.map((r) => r[2])),
    };
}

/** Node's half of C-pilots: each brain's file, imported the way the page imports it, and its fingerprints in the headless duel against the PD autopilot on the control seeds. */
export function nodeControls(seeds = CONTROL_DUEL_SEEDS) {
    const out = {};
    for (const p of PILOTS.filter((q) => q.hash)) {
        const mod = p.policy === "pilot6dofMlp" ? M6 : P6, imp = PB.importBrain(PB.describePolicy(p.policy, mod), JSON.parse(fs.readFileSync(path.join(ENG, "brain", p.file), "utf8")));
        out[p.id] = imp.ok ? { hash: weightsHash(imp.weights), fps: seeds.map((seed) => P6.duel(mod.pilotFor(imp.weights), "autopilot", { seed }).fingerprint) } : { hash: null, fps: [], reason: imp.reason };
    }
    return out;
}

/** C-pilots: the page holds every brain as the registered file (by hash), each brain's lineup on the page is the choice asked for, and the page's own pilot function flies Node's fingerprints. */
export function cPilotsCheck(page, node = nodeControls()) {
    const bad = [];
    for (const p of PILOTS.filter((q) => q.hash)) {
        const pg = page && page.pilots && page.pilots[p.id], nd = node[p.id];
        if (!pg) { bad.push(`${p.id}: the page reported nothing`); continue; }
        if (pg.hash !== p.hash) bad.push(`${p.id}: the page holds ${pg.hash}, not the registered ${p.hash}${pg.error ? " (" + pg.error + ")" : ""}`);
        if (!nd || nd.hash !== p.hash) bad.push(`${p.id}: the file is ${nd && nd.hash}, not the registered ${p.hash}`);
        if (pg.lineup !== p.id) bad.push(`${p.id}: the page's team A flew "${pg.lineup}"`);
        if (!nd || pg.fps.join() !== nd.fps.join()) bad.push(`${p.id}: the page's pilot function does not fly Node's fingerprints`);
    }
    return { ok: bad.length === 0, problems: bad };
}

/** C-determinism: the second run of one matchup gives the same battles, battle for battle (winner, timeout, ticks, both fleets' hull). */
export function determinismCheck(matchups, again) {
    const first = again && matchups.find((m) => !m.mirror && m.a === again.a && m.b === again.b);
    if (!first) return { ok: false, same: 0, of: 0, problem: "no first run to compare" };
    const same = again.out.filter((r, i) => JSON.stringify(r) === JSON.stringify(first.out[i])).length;
    return { ok: same === first.out.length && again.out.length === first.out.length, a: again.a, b: again.b, same, of: first.out.length };
}

/**
 * THE PAGE'S HALF, run by runInEngineOrigin (serialised into the browser; browser globals only). args: { controlDuelSeeds, run, plan, determinism, maxTicks }. It boots the page, waits for every brain's file,
 * reports C-pilots' page half, and -- only when `run` -- plays the plan through runBattles, one seed at a time, then the determinism matchup again. It returns raw battles; it reads nothing.
 */
export const BROWSER_SCRIPT = `async (args) => {
    const f = document.createElement("iframe"); f.style.cssText = "width:900px;height:600px;border:0"; f.src = "/es-box3d-6dof.html"; document.body.appendChild(f);
    const t0 = performance.now(), held = (R) => ["shipped", "league", "close", "gpu"].every((k) => R[k] || R[k + "Error"]);
    while (performance.now() - t0 < 90000) { await new Promise((r) => setTimeout(r, 250)); const w = f.contentWindow; if (w && w.__sixdof && w.__sixdof.roster && held(w.__sixdof.roster)) break; }
    const S = f.contentWindow.__sixdof, R = S.roster, { weightsHash } = await import("/brain/drivePolicy.mjs"), P6b = await import("/brain/pilot6dofPolicy.mjs");
    const out = { pilots: {} };
    for (const id of (args.controlIds || ["shipped", "league", "close", "gpu"])) {   // the lineup is the PAGE's own: a choice it does not hold comes back as the hand pilot it fell back to
        R.setSpecs({ A: id, B: "scripted" }); R.startFight();
        const fn = R.pilotAi("A");
        out.pilots[id] = { hash: R[id] ? weightsHash(R[id]) : null, error: R[id + "Error"] || null, lineup: R.lineup.A && R.lineup.A.id, fps: args.controlDuelSeeds.map((seed) => P6b.duel(fn, "autopilot", { seed }).fingerprint) };
    }
    const play = async (m) => {
        R.setSpecs({ A: m.a, B: m.b }); R.startFight();
        const lineup = [R.lineup.A.id, R.lineup.B.id], rows = [];
        for (const s of m.seeds) { const x = S.runBattles(1, s, args.maxTicks)[0]; rows.push([x.w, x.timeout ? 1 : 0, x.ticks, x.hpA, x.hpB]); }
        await new Promise((r) => setTimeout(r, 0));
        return { a: m.a, b: m.b, mirror: !!m.mirror, lineup, out: rows };
    };
    if (args.run) {
        out.matchups = [];
        for (const m of args.plan) { console.log("[swek-step] " + m.a + " against " + m.b); out.matchups.push(await play(m)); }
        if (args.determinism) out.again = await play(args.determinism);
    }
    R.setSpecs({ A: "auto", B: "auto" });
    return out;
}`;

/**
 * THE ROUND: C-pilots in one browser (nothing is flown on the battle seeds unless it holds), then the plan and the determinism matchup in a second. `seeds` and `pilots` default to the registered ones; the gate
 * hands in scratch seeds and fewer pilots. Returns the plain object the command writes -- raw battles and the controls, no reading.
 */
export async function runRound({ seeds = SEEDS, pilots = PILOT_IDS, determinism = DETERMINISM_PAIR, engineRoot = ENG, timeoutMs = 1800000, node = nodeControls(), harness = runInEngineOrigin } = {}) {
    const result = { registration: REGISTRATION, at: new Date().toISOString(), seeds: [seeds[0], seeds[seeds.length - 1], seeds.length], registeredSeeds: seeds === SEEDS && pilots === PILOT_IDS, pilots: [...pilots], maxTicks: MAX_TICKS };
    const c = await harness({ engineRoot, timeoutMs: 240000, script: BROWSER_SCRIPT, args: { controlDuelSeeds: [...CONTROL_DUEL_SEEDS], run: false } });
    if (!c.ok) { result.stopped = "the browser did not run the controls: " + String(c.reason || c.error || "").slice(0, 300); return result; }
    result.cPilotsPage = c.result.pilots;   // the page's own report (hash, lineup, fingerprints per brain), kept as evidence
    result.cPilots = cPilotsCheck(c.result, node);
    if (!result.cPilots.ok) { result.stopped = "C-pilots failed, so nothing was flown on the battle seeds"; return result; }
    const r = await harness({ engineRoot, timeoutMs, script: BROWSER_SCRIPT, args: { controlDuelSeeds: [...CONTROL_DUEL_SEEDS], run: true, plan: plan(pilots, seeds), determinism: determinism ? { ...determinism, seeds: [...seeds] } : null, maxTicks: MAX_TICKS } });
    if (!r.ok) { result.stopped = "the browser did not finish the plan: " + String(r.reason || r.error || "").slice(0, 300); return result; }
    result.cPilotsAgain = cPilotsCheck(r.result, node);   // the second browser holds the same pilots
    result.matchups = r.result.matchups;
    result.cDeterminism = determinism ? determinismCheck(result.matchups, r.result.again) : null;
    return result;
}

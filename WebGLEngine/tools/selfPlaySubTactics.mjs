// WebGLEngine/tools/selfPlaySubTactics.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/selfPlaySubTactics.mjs cross  --thetas a.json,b.json,... [--seeds 24] [--out matrix.json]
//      node tools/selfPlaySubTactics.mjs league --seed 7000 --gens 3 --iters 60 --out league.json [--from theta.json]
//
// SELF-PLAY for the submarine tactician: the drones of brain/subDuel.mjs are fixed scripts, so "beats the hunter" means "beats one doctrine". Here the opponent is another TACTICIAN with its own theta, and the question
// is whether a doctrine survives a best-responding enemy.
//   cross   every theta against every other (and "default" = brain/subTactics.mjs THETA_DEFAULT), in BOTH SEATS: the duel's seats are not symmetric (A starts with the other boat inside 60 degrees of its nose and
//           B headed anywhere), so each pair is fought with X as A and again with X as B (scoreFor from B's side), on the same scenario geometry (kind "patrol": it fixes the geometry; the opponent override replaces
//           the drone). The matrix is X's mean score against Y over both seats; the seats are also reported apart.
//   league  generation 0 is the --from theta (or the default); generation g is a (1+1)-ES started from generation g-1's champion that scores each candidate against the previous generations (the last three, and the
//           default) in both seats on 8 fixed geometries. A generation that is not better than the last against the pool is still kept (and said). The output is every generation's theta, its score against its pool,
//           and the cross-play matrix of all generations: if a later generation beats an earlier one but loses to a still-earlier one, the doctrines CYCLE (rock-paper-scissors).
// Deterministic for a seed. AUDIT_SET is NOT read.
"use strict";
import fs from "node:fs";
import * as D from "../brain/subDuel.mjs";
import * as TA from "../brain/subTactics.mjs";

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (r) => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/** X's mean score against Y over the given seeds, in both seats: { asA, asB, mean }. */
export function match(thX, thY, seeds) {
    let a = 0, b = 0;
    for (const s of seeds) {
        const sc = D.scenario(s, "patrol");
        a += D.duel(D.sideHand(thX)(), sc, { opponent: D.sideHand(thY)() }).score;                                    // X in seat A (the seat that starts with the other boat in its forward arc)
        b += D.scoreFor(D.duel(D.sideHand(thY)(), sc, { opponent: D.sideHand(thX)() }), "B");                         // X in seat B
    }
    return { asA: a / seeds.length, asB: b / seeds.length, mean: (a + b) / (2 * seeds.length) };
}
export function mutateTheta(theta, r) {
    const o = { ...theta }, k = 1 + Math.floor(r() * 3);
    for (let j = 0; j < k; j++) { const name = TA.THETA_NAMES[Math.floor(r() * TA.THETA_NAMES.length)], [lo, hi] = TA.THETA_BOUNDS[name]; o[name] = theta[name] + 0.1 * (hi - lo) * gauss(r); }
    return TA.clampTheta(o);
}
const loadTheta = (f) => f === "default" ? TA.clampTheta(TA.THETA_DEFAULT) : TA.clampTheta(JSON.parse(fs.readFileSync(f, "utf8")).theta);
export function crossMatrix(names, thetas, seeds) {
    const m = names.map(() => names.map(() => null));
    for (let i = 0; i < thetas.length; i++) for (let j = 0; j < thetas.length; j++) if (i !== j) m[i][j] = match(thetas[i], thetas[j], seeds);
    return m;
}
const printMatrix = (names, m) => {
    console.log("row X vs column Y: X's mean score over both seats (asA / asB)");
    console.log("".padEnd(16) + names.map((n) => n.slice(0, 14).padEnd(16)).join(""));
    m.forEach((row, i) => console.log(names[i].slice(0, 14).padEnd(16) + row.map((c) => (c ? `${c.mean.toFixed(2)} (${c.asA.toFixed(1)}/${c.asB.toFixed(1)})` : "-").padEnd(16)).join("")));
};

const mode = process.argv[2], arg = (f, d = null) => { const i = process.argv.indexOf(f); return i === -1 ? d : process.argv[i + 1]; };
if (process.argv[1] && process.argv[1].endsWith("selfPlaySubTactics.mjs")) {
    if (mode === "cross") {
        const files = (arg("--thetas", "") || "").split(",").filter(Boolean), names = ["default", ...files.map((f) => f.split("/").pop().replace(/\.json$/, ""))], thetas = ["default", ...files].map(loadTheta);
        const seeds = Array.from({ length: +arg("--seeds", 24) }, (_, i) => 1001 + i), m = crossMatrix(names, thetas, seeds);
        printMatrix(names, m); if (arg("--out")) fs.writeFileSync(arg("--out"), JSON.stringify({ names, seeds, matrix: m, thetas }));
    } else if (mode === "league") {
        const seed = +arg("--seed", 7000), gens = +arg("--gens", 3), iters = +arg("--iters", 60), out = arg("--out"), from = arg("--from") || "default";
        if (!out) { console.error("usage: node tools/selfPlaySubTactics.mjs league --seed N --gens N --iters N --out file.json [--from theta.json]"); process.exit(2); }
        const rng = mulberry(seed), trainSeeds = Array.from({ length: 8 }, (_, i) => 1 + i), pool = [loadTheta("default")], names = ["default"], thetas = [loadTheta(from)], t0 = Date.now(), log = [];
        if (from !== "default") { names.push("gen0"); } else names.push("gen0");
        const opponents = (g) => [pool[0], ...thetas.slice(Math.max(0, g - 3), g)];   // the default and the last three generations
        const score = (th, opps) => opps.reduce((a, o) => a + match(th, o, trainSeeds).mean, 0) / opps.length;
        for (let g = 1; g <= gens; g++) {
            const opps = opponents(g); let best = thetas[g - 1], bestScore = score(best, opps), improved = 0;
            for (let i = 1; i <= iters; i++) {
                const cand = mutateTheta(best, rng), s = score(cand, opps);
                if (s > bestScore + 1e-9) { best = cand; bestScore = s; improved++; } else if (s >= bestScore - 1e-9) best = cand;
                if (i % 10 === 0) console.error(`league ${seed} gen ${g} iter ${i} vs-pool ${bestScore.toFixed(3)} (${improved} improved, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
            }
            thetas.push(best); names.push(`gen${g}`); log.push({ gen: g, improved, vsPool: bestScore, opponents: opps.length });
            fs.writeFileSync(out + ".ckpt", JSON.stringify({ seed, names, thetas, log }));
        }
        const all = [pool[0], ...thetas], allNames = ["default", ...names.slice(1)], evalSeeds = Array.from({ length: 24 }, (_, i) => 1001 + i), m = crossMatrix(allNames, all, evalSeeds);
        printMatrix(allNames, m);
        fs.writeFileSync(out, JSON.stringify({ seed, from, gens, iters, names: allNames, thetas: all, log, evalSeeds, matrix: m }));
    } else { console.error("usage: node tools/selfPlaySubTactics.mjs cross|league ..."); process.exit(2); }
}

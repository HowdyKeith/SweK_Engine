// WebGLEngine/brain/jetLeagueSets-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE JET NETWORKS' FIGHTS: brain/jetLeagueSets.mjs holds the sets a jet network is trained, picked and graded on, and a set that has graded a champion is SPENT. So what this gate holds is what makes a set trustworthy and what makes it reusable only once:
//   1  SHAPE      the sizes the league library's rules were written for (12 / 32 / 100 duels, 100 + 100 audits, 400 / 120 / 200 classic fights), the kinds in them (duels and nothing else in the league slots, the four kinds in equal numbers in the classic ones), frozen
//   2  SEEDS      each slot is exactly the seed range the header says, contiguous, in order; every seed is 15000 or more; the next free block is above all of them
//   3  JET SCALE  every fight is jetFight.scenario(seed, kind) -- the trainers' scenario with every length x3.1 and every speed x140/45 -- recomputed here and compared whole, and none is at the trainers' scale (a jet at 45 m/s, 300 m up)
//   4  FRESH      no (kind, seed) of any slot is in any set of dogfightTask.mjs or of jetFight.mjs (the jets' fight set, and the bench set except in the reserve slot, which IS the bench set), the fruit fly's audits are not the GPU Brain's, and no two slots share a fight (the throwaway smoke sets are the trainers' own seeds on purpose and are the only overlap, said)
//   5  SLOTS      the maps the league library reads (SETS_FLY, SETS_GPU, SETS_SMOKE): the same eight slots, the GPU Brain's audit / classic audit / safety are its own and the other five are shared, the smoke map points every slot at throwaway fights
//   6  FRONT DOOR the report names the module and the sizes
//   7  WIDE       (added for the second recipe) the wide training objective: 96 duels in 8 batches of 12 (seeds 16100..16195, each batch the next block of twelve in order, the batches together the flat set), the prune set 24 duels (16200..16223); none of
//                 them is in any other slot or set (the checks above run over them too); the slot maps carry them (the GPU Brain's the very same objects as the fruit fly's, the throwaway map two batches of two and the four throwaway duels)
//
// SABOTAGE LOG -- 22 mutants of brain/jetLeagueSets.mjs, EVERY ONE RED BY NAME (red count after each), none left at 0:
//   J01 train range one short 3 | J02 held-out starts in the training block 2 | J03 pool at the trainers' pool seeds 3 | J04 the two audits are one block 2 | J05 classic pool at 50 of each kind 3 |
//   J06 safety overlaps the classic audit 2 | J07 next free block inside the used ones 2 | J08 the scenarios are the trainers' 2 | J09 the league slots hold turning fights 1 | J10 the classic sets hold two kinds 3 |
//   J11 the GPU audit is the fruit fly's 2 | J12 the GPU safety is the fruit fly's 2 | J13 the reserve is the trainers' bench 1 | J14 the smoke map reads the real pool 1 | J15 the smoke map reads the real audit 1 |
//   J16 the throwaway duels are 9100..9102 1 | J17 the seed table is not frozen 1 | J18 an entry of the seed table is not frozen 1 | J19 the report names no module 1 | J20 the report drops the next free block 1 |
//   J21 a set is not frozen 1 | J22 the held-out set is in the training block exactly 4
//   THE WIDE TRAINING SETS (the second recipe; section 7) -- 16 more mutants of brain/jetLeagueSets.mjs and the two old ones whose target text moved (J07 and J13) re-aimed, all red by name:
//   W01 batches of 11 duels 2 | W02 the wide range one short 4 | W03 the wide range starts one late 2 | W04 the prune set overlaps the batches 4 | W05 the prune set is in the pool 5 | W06 the batches overlap each other 1 | W07 a batch is not frozen 1
//   W08 the batch list is not frozen 1 | W09 the GPU Brain has batches of its own 1 | W10 the throwaway map has one batch of four 1 | W11 the throwaway prune set is the real one 1 | W12 the throwaway batches are the real ones 1
//   W13 the wide set holds turning fights 2 | W14 the wide set is at the trainers' scale 2 | W15 the report forgets the wide sets 1 | W16 the fruit fly map lacks the prune set 1 | J07 (next free block 16200, inside the wide sets) 2 | J13 1.
"use strict";
import * as S from "./jetLeagueSets.mjs";
import * as JF from "./jetFight.mjs";
import * as D from "./dogfightTask.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const sec = (t) => console.log("\n" + t);
const key = (x) => x.kind + ":" + x.seed;
const seeds = (set) => set.map((x) => x.seed);
const contiguous = (set, lo, hi) => set.every((x, i) => x.seed === lo + (i % (hi - lo + 1)));
const SLOTS = Object.freeze({ JET_LEAGUE_TRAIN_SET: "train", JET_LEAGUE_HELD_OUT_SET: "heldOut", JET_LEAGUE_POOL_SET: "pool", JET_LEAGUE_AUDIT_SET: "audit", JET_LEAGUE_AUDIT2_SET: "audit2",
    JET_POOL_FIGHT_SET: "classicPool", JET_AUDIT_FIGHT_SET: "classicAudit", JET_AUDIT2_FIGHT_SET: "classicAudit2", JET_SAFETY_FIGHT_SET: "safety", JET_SAFETY2_FIGHT_SET: "safety2",
    JET_LEAGUE_TRAIN_WIDE_SET: "trainBatches", JET_LEAGUE_TRAIN_PRUNE_SET: "trainPrune" });
const MINE = Object.entries(SLOTS).map(([name, slot]) => ({ name, slot, set: S[name], range: S.SEEDS[slot] }));

console.log("jetLeagueSets-selfcheck -- the fights the jet networks are trained, picked and graded on\n");

sec("1. SHAPE");
{
    const n = Object.fromEntries(MINE.map((m) => [m.slot, m.set.length]));
    ok("!! THE SIZES THE RULES WERE WRITTEN FOR: training 12 duels, held-out 32, pool 100, the two league audits 100 each; the classic pool 400 fights (100 of each kind), the two classic audits 120 (30 of each), the two safety audits 200 (50 of each); the wide training set 96 duels and its prune set 24; the throwaway sets 4 duels and 8 fights",
        n.train === 12 && n.heldOut === 32 && n.pool === 100 && n.audit === 100 && n.audit2 === 100 && n.trainBatches === 96 && n.trainPrune === 24 && n.classicPool === 400 && n.classicAudit === 120 && n.classicAudit2 === 120 && n.safety === 200 && n.safety2 === 200 && S.JET_LEAGUE_SMOKE_SET.length === 4 && S.JET_SMOKE_FIGHT_SET.length === 8, JSON.stringify(n));
    const leagueSlots = MINE.filter((m) => /^JET_LEAGUE_/.test(m.name)), classicSlots = MINE.filter((m) => !/^JET_LEAGUE_/.test(m.name));
    ok("!! THE LEAGUE SLOTS ARE DUELS AND NOTHING BUT (the only fight in which the opponent hunts and shoots); THE CLASSIC SLOTS HAVE THE FOUR KINDS IN EQUAL NUMBERS",
        leagueSlots.every((m) => m.set.every((x) => x.kind === "duel")) && S.JET_LEAGUE_SMOKE_SET.every((x) => x.kind === "duel")
        && classicSlots.every((m) => D.KINDS.every((k) => m.set.filter((x) => x.kind === k).length === m.set.length / D.KINDS.length)) && D.KINDS.every((k) => S.JET_SMOKE_FIGHT_SET.filter((x) => x.kind === k).length === 2));
    ok("every set, every scenario and every slot map is frozen (a set is a record, not a place a run gets to write)", MINE.every((m) => Object.isFrozen(m.set) && m.set.every(Object.isFrozen)) && [S.SETS_FLY, S.SETS_GPU, S.SETS_SMOKE, S.SEEDS].every(Object.isFrozen) && Object.values(S.SEEDS).every(Object.isFrozen));
}

sec("2. SEEDS");
{
    ok("!! EACH SLOT IS EXACTLY THE SEED RANGE THE HEADER SAYS, IN ORDER: train 15200..15211, held-out 15300..15331, pool 15600..15699, audits 15400..15499 and 15500..15599, classic pool 15000..15099, classic audits 15700..15729 and 15800..15829, safety 15900..15949 and 16000..16049 (the classic ones the same range once per kind)",
        JSON.stringify(S.SEEDS) === JSON.stringify({ train: [15200, 15211], heldOut: [15300, 15331], pool: [15600, 15699], audit: [15400, 15499], audit2: [15500, 15599], classicPool: [15000, 15099], classicAudit: [15700, 15729], classicAudit2: [15800, 15829], safety: [15900, 15949], safety2: [16000, 16049], trainBatches: [16100, 16195], trainPrune: [16200, 16223] })
        && MINE.every((m) => contiguous(m.set, m.range[0], m.range[1])), MINE.filter((m) => !contiguous(m.set, m.range[0], m.range[1])).map((m) => m.name).join(","));
    const all = MINE.flatMap((m) => seeds(m.set));
    ok("!! EVERY SEED IS 15000 OR MORE (the trainers' sets end at 9103 and the jets' bench is 100..159), AND THE NEXT FREE BLOCK (16300) IS ABOVE ALL OF THEM, so a retrain's fresh audits have somewhere to go", Math.min(...all) === 15000 && Math.max(...all) === 16223 && S.NEXT_FREE_SEED === 16300 && S.NEXT_FREE_SEED > Math.max(...all), `${Math.min(...all)}..${Math.max(...all)}`);
}

sec("3. JET SCALE");
{
    const fresh = (x) => JSON.stringify(JF.scenario(x.seed, x.kind)) === JSON.stringify(x);
    ok("!! EVERY FIGHT OF EVERY SLOT IS jetFight.scenario(seed, kind) RECOMPUTED, WHOLE (" + MINE.reduce((t, m) => t + m.set.length, 0) + " fights): the same seed is the same fight at jet scale", MINE.every((m) => m.set.every(fresh)) && S.JET_LEAGUE_SMOKE_SET.every(fresh) && S.JET_SMOKE_FIGHT_SET.every(fresh));
    const jet = MINE.flatMap((m) => m.set);
    ok("!! NONE IS AT THE TRAINERS' SCALE: every aircraft starts between 100 and 190 m/s (the trainers' fights are 30 to 60) at a height of 1,000 m or more (the trainers' are 300 m); the trainers' scenario for the same seed is a different fight",
        jet.every((x) => x.a.speed >= 100 && x.a.speed <= 190 && x.b.speed >= 100 && x.b.speed <= 190 && x.a.pos[2] >= 1000 && x.b.pos[2] >= 1000) && jet.slice(0, 50).every((x) => JSON.stringify(D.scenario(x.seed, x.kind)) !== JSON.stringify(x)));
}

sec("4. FRESH SEEDS");
{
    const dSets = Object.entries(D).filter(([n, v]) => /_SET$/.test(n) && Array.isArray(v)), jSets = Object.entries(JF).filter(([n, v]) => /_SET$/.test(n) && Array.isArray(v));
    const used = new Map(); for (const [n, set] of [...dSets, ...jSets]) for (const x of set) { const k = key(x); if (!used.has(k)) used.set(k, []); used.get(k).push(n); }
    const smokeNames = new Set(["JET_LEAGUE_SMOKE_SET", "JET_SMOKE_FIGHT_SET"]);
    const clash = MINE.flatMap((m) => m.set.map(key).filter((k) => used.has(k)).map((k) => m.name + " " + k + " in " + used.get(k).join("+")));
    ok("!! NO FIGHT OF ANY SLOT IS IN ANY SET OF dogfightTask.mjs OR jetFight.mjs (" + dSets.length + " trainer sets and " + jSets.length + " jet sets read), so a jet network is never graded on a fight a pilot has been trained, picked or audited on", clash.length === 0 && dSets.length >= 20 && jSets.length >= 2, clash.slice(0, 3).join("; "));
    const smokeIn = [...S.JET_LEAGUE_SMOKE_SET, ...S.JET_SMOKE_FIGHT_SET].map(key), bench = new Set(JF.JET_BENCH_SET.map(key));
    ok("the throwaway sets are the trainers' own throwaway seeds (9100..9103 and 9000..9001) ON PURPOSE and are the only overlap with them; the reserve slot IS the jets' bench set", smokeIn.every((k) => used.has(k) && used.get(k).some((n) => /SMOKE/.test(n))) && S.SETS_FLY.reserve === JF.JET_BENCH_SET && bench.size === 120 && [...smokeNames].every((n) => S[n]));
    const seen = new Map(), dupes = [];
    for (const m of MINE) for (const x of m.set) { const k = key(x); if (seen.has(k)) dupes.push(m.name + "+" + seen.get(k) + " " + k); else seen.set(k, m.name); }
    ok("!! NO TWO SLOTS SHARE A FIGHT, and the fruit fly's audits (league, classic, safety) are not the GPU Brain's: an audit is read once, for one champion", dupes.length === 0 && seeds(S.JET_LEAGUE_AUDIT_SET)[0] !== seeds(S.JET_LEAGUE_AUDIT2_SET)[0] && S.SETS_FLY.audit !== S.SETS_GPU.audit && S.SETS_FLY.classicAudit !== S.SETS_GPU.classicAudit && S.SETS_FLY.safety !== S.SETS_GPU.safety, dupes.slice(0, 3).join("; "));
}

sec("5. THE SLOT MAPS THE LIBRARY READS");
{
    const names = "train,heldOut,pool,audit,classicPool,classicAudit,safety,reserve,trainBatches,trainPrune";
    ok("!! SETS_FLY, SETS_GPU AND SETS_SMOKE HAVE THE LIBRARY'S TEN SLOTS (train, heldOut, pool, audit, classicPool, classicAudit, safety, reserve, then the two wide-training ones, trainBatches and trainPrune), in that order, and the fruit fly's map is the first block of audits",
        [S.SETS_FLY, S.SETS_GPU, S.SETS_SMOKE].every((m) => Object.keys(m).join() === names) && S.SETS_FLY.train === S.JET_LEAGUE_TRAIN_SET && S.SETS_FLY.heldOut === S.JET_LEAGUE_HELD_OUT_SET && S.SETS_FLY.pool === S.JET_LEAGUE_POOL_SET && S.SETS_FLY.audit === S.JET_LEAGUE_AUDIT_SET && S.SETS_FLY.classicPool === S.JET_POOL_FIGHT_SET && S.SETS_FLY.classicAudit === S.JET_AUDIT_FIGHT_SET && S.SETS_FLY.safety === S.JET_SAFETY_FIGHT_SET);
    ok("!! THE GPU BRAIN'S MAP SHARES FIVE SLOTS WITH THE FRUIT FLY'S (train, heldOut, pool, classicPool, reserve) AND HAS ITS OWN THREE AUDITS (league, classic, safety: the second block)",
        ["train", "heldOut", "pool", "classicPool", "reserve"].every((k) => S.SETS_GPU[k] === S.SETS_FLY[k]) && S.SETS_GPU.audit === S.JET_LEAGUE_AUDIT2_SET && S.SETS_GPU.classicAudit === S.JET_AUDIT2_FIGHT_SET && S.SETS_GPU.safety === S.JET_SAFETY2_FIGHT_SET);
    ok("--smoke POINTS EVERY DUEL SLOT AT THE FOUR THROWAWAY DUELS AND EVERY CLASSIC SLOT AT THE EIGHT THROWAWAY FIGHTS, so running the command to see that it runs reads no audit",
        ["train", "heldOut", "pool", "audit"].every((k) => S.SETS_SMOKE[k] === S.JET_LEAGUE_SMOKE_SET) && ["classicPool", "classicAudit", "safety", "reserve"].every((k) => S.SETS_SMOKE[k] === S.JET_SMOKE_FIGHT_SET));
}

sec("7. THE WIDE TRAINING SETS");
{
    const B = S.JET_LEAGUE_TRAIN_BATCHES, W = S.JET_LEAGUE_TRAIN_WIDE_SET;
    ok("!! 96 DUELS IN 8 BATCHES OF 12, EACH BATCH THE NEXT BLOCK OF TWELVE SEEDS IN ORDER (16100..16111, 16112..16123, ... 16184..16195), the batches together exactly the flat set, in order, and S.WIDE_BATCH_DUELS says 12",
        S.WIDE_BATCH_DUELS === 12 && B.length === 8 && B.every((b, i) => b.length === 12 && seeds(b).every((sd, j) => sd === 16100 + 12 * i + j)) && B.flat().length === 96 && B.flat().every((x, i) => x === W[i]), B.map((b) => b[0].seed).join());
    ok("every batch and the batch list are frozen, and every duel in them is a duel", Object.isFrozen(B) && B.every(Object.isFrozen) && B.flat().every((x) => x.kind === "duel") && S.JET_LEAGUE_TRAIN_PRUNE_SET.every((x) => x.kind === "duel"));
    ok("!! THE PRUNE SET IS 24 DUELS ON ITS OWN SEEDS (16200..16223), NOT ONE OF THE BATCHES' DUELS: the objective and the prune never meet the same fight", S.JET_LEAGUE_TRAIN_PRUNE_SET.length === 24 && seeds(S.JET_LEAGUE_TRAIN_PRUNE_SET).every((sd, i) => sd === 16200 + i) && !S.JET_LEAGUE_TRAIN_PRUNE_SET.some((x) => W.some((y) => y.seed === x.seed)));
    ok("!! NONE OF THE WIDE TRAINING DUELS IS IN THE TRAINING, HELD-OUT, POOL OR AUDIT SLOTS OF THE FIRST RECIPE (so the held-out set that picks a champion, the pool that decides eligibility and the audits that grade it have never been trained on)",
        [...W, ...S.JET_LEAGUE_TRAIN_PRUNE_SET].every((x) => ![S.JET_LEAGUE_TRAIN_SET, S.JET_LEAGUE_HELD_OUT_SET, S.JET_LEAGUE_POOL_SET, S.JET_LEAGUE_AUDIT_SET, S.JET_LEAGUE_AUDIT2_SET].some((set) => set.some((y) => y.seed === x.seed))));
    ok("!! THE SLOT MAPS CARRY THEM: the fruit fly's map holds the batch list and the prune set, the GPU Brain's map the very same objects, the throwaway map two batches of two throwaway duels and the four throwaway duels as its prune set",
        S.SETS_FLY.trainBatches === B && S.SETS_FLY.trainPrune === S.JET_LEAGUE_TRAIN_PRUNE_SET && S.SETS_GPU.trainBatches === B && S.SETS_GPU.trainPrune === S.JET_LEAGUE_TRAIN_PRUNE_SET
        && S.SETS_SMOKE.trainBatches.length === 2 && S.SETS_SMOKE.trainBatches.every((b) => b.length === 2) && S.SETS_SMOKE.trainBatches.flat().every((x, i) => x === S.JET_LEAGUE_SMOKE_SET[i]) && S.SETS_SMOKE.trainPrune === S.JET_LEAGUE_SMOKE_SET);
}

sec("6. THE FRONT DOOR");
{
    const L = S.reportLines();
    ok("the report names the module, the seed floor and the next free block, the wide training sets, and each size (12, 32, 100, 100 + 100; 400, 120 + 120, 200 + 200, 120), and says nothing undefined", L.length === 3 && /\[jetLeagueSets\]/.test(L[0]) && /15000 and up/.test(L[0]) && /16300/.test(L[0]) && /8 batches of 12 duels \(96\), prune 24 duels/.test(L[2]) && /train 12 duels, held-out 32, pool 100, audits 100 \+ 100 duels; classic pool 400 fights, classic audits 120 \+ 120, safety 200 \+ 200, reserve 120/.test(L[1]) && !L.some((l) => /undefined|NaN/.test(l)), L[1]);
}

console.log(fails ? `\njetLeagueSets-selfcheck: ${fails} FAILED` : "\njetLeagueSets-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);

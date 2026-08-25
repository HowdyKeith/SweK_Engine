// brain.js -- SweK GPU Brain v1 (Deno + headless WebGPU)
//
// A standalone process that gives kaiju terrain-aware navigation without
// costing the engine's frame budget. The loop:
//
//   1. GET  {BRIDGE}/ai/brain/snapshot   -- the browser publishes a coarse
//      height grid around the camera + goal points (civ centers) at ~2Hz
//   2. Solve a cost-weighted flow field toward the goals on the GPU
//      (see flowfield.js -- slope + water penalties route around both)
//   3. POST {BRIDGE}/ai/brain/flowfield  -- the browser picks it up and
//      kaiju sample it when their CPU path planner fails
//
// Authority model unchanged: the game owns positions, this process only
// produces fields the game may consult. Kill it any time -- the engine
// falls back to exactly its old behavior.
//
// Run via START_BRAIN.bat, or:
//   deno run --unstable-webgpu --allow-net --allow-env brain.js
// Env: KPOP-style knobs -- BRAIN_BRIDGE (default http://127.0.0.1:8787),
//      BRAIN_HZ (solve rate cap, default 4), BRAIN_ITERS (relax override).

import { initGPU } from "./gpu.js";
import { traceEnabled, traceOpen, traceDecision, traceFlush, traceStats } from "./trace.mjs";   // v2520 -- opt-in session trace (BRAIN_TRACE=1)
import { FlowFieldSolver } from "./flowfield.js";
import { FlowFieldSolverCPU } from "./flowfieldCpu.js";   // v2073 -- Phase A: CPU fields brain (no GPU needed)
import { FlowFieldSolverAuto } from "./flowfieldAuto.js"; // v2213 -- probe-select + budget-guard GPU vs CPU
import { QuadrantScheduler } from "./quadrants.js";       // v2186 -- pack nav/player/threat into ONE solve
import { BatchedMLP } from "./mlp.js";
import { buildLayers, buildFeatures, FEATURES,
         buildAttackLayers, buildAttackFeatures, ATK_FEATURES,
         buildAttackLayersDeep,
         CIVDEF_FEATURES, buildCivDefWeights, buildCivDefFeatures,
         CIVTARGET_FEATURES, buildCivTargetWeights, buildCivTargetFeatures } from "./policy.js";
import { OnlineTrainer, MLPTrainer, loadWeights, saveWeights,
         loadDeepWeights, saveDeepWeights,
         saveReplays, loadReplays } from "./learn.js";
import { KAIJU_ATTACK_DAMAGE } from "./attackDamage.js";
// v76 -- REPAIR of a latent break found while wiring the evidence
// bundle: brain.js calls reportMilestone 36 times and news
// MilestoneWatcher once, but NO import existed -- milestones.js
// exports both and nothing imported it. Most call sites sit inside
// try/catch, so the ReferenceError would be EATEN and milestones
// would silently stop. If the rig's milestone stream has been quiet:
// this was why. If it has not: the rig's tree differs from this
// bundle -- the evidence bundle will say which.
import { MilestoneWatcher, reportMilestone } from "./milestones.js";

// v2149 -- Windows path fix. `new URL(rel, import.meta.url).pathname` yields
// "/C:/dir/file.json" on Windows: the leading slash makes every Deno.readTextFile /
// writeTextFile fail with "The system cannot find the path specified" (os error 3).
// That silently broke ALL weights + replay persistence on Windows -- the brain
// re-learned from the hand policy every boot and never saved. Strip the slash only
// when a drive letter follows, and percent-decode so "Program Files" works. POSIX
// paths are returned unchanged. Function declaration so it hoists above first use.
function _localPath(rel) {
    let s = decodeURIComponent(new URL(rel, import.meta.url).pathname);
    if (/^\/[A-Za-z]:/.test(s)) s = s.slice(1);
    return s;
}

// v2151 -- learned state must OUTLIVE the version folder. brain.js lives inside
// EngineProject_vNNNN/, and every ship creates a NEW folder, so weights/replay written
// next to brain.js were abandoned on each version bump: the brain re-learned from the
// hand policy forever ("no trained weights found" on every boot, on every machine).
// State now lives in a stable per-machine dir (same ~/.voxelbridge root assetSync
// already uses). Override with BRAIN_STATE_DIR. A one-time migration copies any file
// still sitting next to brain.js into the state dir, so nothing on disk is lost.
const STATE_DIR = (() => {
    const env = (Deno.env.get("BRAIN_STATE_DIR") || "").trim();
    if (env) return env.replace(/[\\/]+$/, "");
    const home = Deno.env.get("USERPROFILE") || Deno.env.get("HOME") || "";
    if (home) return home.replace(/[\\/]+$/, "") + "/.voxelbridge/brain";
    return _localPath("./");   // last resort: old behaviour
})();
function _statePath(name) {
    try { Deno.mkdirSync(STATE_DIR, { recursive: true }); } catch {}
    const dst = STATE_DIR + "/" + name;
    try { Deno.statSync(dst); return dst; } catch {}          // already there
    const legacy = _localPath("./" + name);                    // one-time migration
    try { Deno.statSync(legacy); Deno.copyFileSync(legacy, dst); console.log(`[brain] migrated ${name} -> ${STATE_DIR}`); } catch {}
    return dst;
}

let _fetchWarned = false;   // v2150 -- one-shot warn for the snapshot-fetch catch (declared at module top: no TDZ)


const BRIDGE = (Deno.env.get("BRAIN_BRIDGE") || "http://127.0.0.1:8787").replace(/\/+$/, "");
const HZ = Math.max(0.5, Number(Deno.env.get("BRAIN_HZ") || 4));
const TICK_MS = 1000 / HZ;

const stats = { solves: 0, skips: 0, errors: 0, lastMs: 0, snapTs: 0 };
let solver = null;
let _fieldBackend = null;   // v2207 -- published with the field: "cpu (exact Dijkstra)" | "gpu (...)"
let _builtFieldMode = null; // v2230 -- the field-solver mode the current solvers were built under (snap.fieldSolver, else env); rebuild when it changes
let threatSolver = null;
let playerSolver = null;   // v11   // v2 -- separate instance so nav + threat never share seed buffers
let qs = null;             // v2186 -- QuadrantScheduler; packs nav/player/threat into one dispatch
let _quadWarned = false;   // v2186 -- one-shot explanation when packing is asked for but not safe
let mlp = null;            // v2 -- aggro policy (see policy.js)
let atkMlp = null;         // v3 -- attack selection policy
// v4/v5 -- online learning state
const LEARN = Deno.env.get("BRAIN_LEARN") !== "0";
const EPSILON = Math.max(0, Math.min(0.5, Number(Deno.env.get("BRAIN_EPSILON") ?? 0.10)));
const WEIGHTS_PATH = _statePath("weights_attack.json");
const AGGRO_W_PATH = _statePath("weights_aggro.json");
let trainer = null;        // v5 -- MLPTrainer over the deep attack net
let atkLayers = null;      // live layer arrays (mutated by backprop, hot-swapped to GPU)
let sinceSave = 0;
// v5 -- aggro learning (single sigmoid layer -> plain SGD): reward is
// brave-window survival, reported by the engine (PATCH-B2e)
const aggroTrainer = new OnlineTrainer({ lr: Number(Deno.env.get("BRAIN_LR") ?? 0.02), minBuffer: 16 });
let aggroW = null;
const AGGRO_NOISE = Math.max(0, Math.min(0.5, Number(Deno.env.get("BRAIN_AGGRO_EPSILON") ?? 0.08)));
// v6 -- civ-defense learning: outcomes are attributed civ-bolt impacts
// (PATCH-B10); hold decisions produce no outcome, so a small flip
// exploration keeps hold-heavy policies from starving their data.
const CIVDEF_W_PATH = _statePath("weights_civdef.json");
const CIVTGT_W_PATH = _statePath("weights_civtarget.json");
const PACKORD_W_PATH = _statePath("weights_packorder.json");
// v10 -- per-king personality: a stable hash of the king's id offsets
// the order logit, so some kings are born coordinators and others lone
// wolves -- and the SAME king keeps the SAME temperament across brain
// restarts (hash, not RNG). 0 disables.
const PERSONALITY = Math.max(0, Math.min(1.5, Number(Deno.env.get("BRAIN_KING_PERSONALITY") ?? 0.35)));
// v14 -- faction DISPOSITION: shifts the temperament offset MEAN, where
// BRAIN_KING_PERSONALITY sets its spread. A duel can now field a
// reckless faction (BIAS +0.25: bolder on average) against a cautious
// one (BIAS -0.25) -- per-process env, so each policy instance carries
// its own culture on top of per-king variance.
const TEMPER_BIAS = Math.max(-1, Math.min(1, Number(Deno.env.get("BRAIN_TEMPER_BIAS") ?? 0)));
function idHash01(id) {   // deterministic [-1, 1] from any id
    const s = String(id);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    // murmur-style finalizer: FNV alone barely avalanches on short ids
    // that differ in one trailing character -- sequential kaiju ids all
    // landed within 0.02 of neutral without this.
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return ((h >>> 0) / 4294967295) * 2 - 1;
}
const PACKORD_NOISE = Math.max(0, Math.min(0.5, Number(Deno.env.get("BRAIN_PACKORD_EPSILON") ?? 0.08)));
// v12 -- brain-vs-brain: BRAIN_KINDS="space,tech" restricts THIS brain's
// POLICIES (attack, aggro, pack orders) to kaiju of the listed kinds.
// Fields (nav, threat, player) stay world-wide -- terrain is not a
// faction. Two BRAIN_ROLE=policy instances with disjoint kind lists
// post partial payloads; the bridge merges their policy maps PER-ID
// (PATCH-B1f), so each faction fights under its own evolving mind.
// Learning isolates for free: each brain only remembers rows for its
// own kaiju, and outcome ingestion is row-matched by id -- a foreign
// faction's outcomes simply never match.
const KINDS_FILTER = (() => {
    const s = (Deno.env.get("BRAIN_KINDS") ?? "").trim();
    return s ? new Set(s.split(",").map(x => x.trim()).filter(Boolean)) : null;
})();
const mine = (k) => !KINDS_FILTER || KINDS_FILTER.has(k.kind);
// v12 -- temperament narration: remember each king's last order to
// narrate FLIPS (not every publish).
const lastOrderByKing = new Map();
// v13 -- match-recap counters (reported at SIGINT as a war summary)
const recap = { orders: 0, focusOrders: 0, flips: 0, byTemper: { bold: 0, wary: 0, even: 0 } };
// v15 -- cross-game measurement: per-domain attack hit-rates. One brain
// can serve kaiju + dungeon + raycaster; this answers whether shared
// weights help or hurt each, empirically, from the outcome stream.
const domainStats = { kaiju: { n: 0, hits: 0 }, dungeon: { n: 0, hits: 0 }, raycaster: { n: 0, hits: 0 } };
// v16 -- THE SPLIT EXPERIMENT (run it if v15's numbers say shared
// weights hurt). BRAIN_DOMAIN_SPLIT=1 gives dungeon and raycaster
// their own OUTPUT HEADS while the hidden layer stays SHARED BY
// REFERENCE: every domain trainer wraps the same L1 Float32Array (so
// representation learning pools across games) with its own L2 (so
// what "a good shot" MEANS can differ per game). Heads start as
// clones of the kaiju head -- split day changes nothing until
// outcomes diverge. OFF (default) = v15 behavior exactly.
const SPLIT = Deno.env.get("BRAIN_DOMAIN_SPLIT") === "1";
const HEADS_PATH = _statePath("weights_attack_heads.json");
let atkHeads = null;        // { dungeon: L2like, raycaster: L2like }
let domTrainers = null;     // { dungeon: MLPTrainer, raycaster: MLPTrainer }
let headsDirty = 0;
function cpuFwdSplit(L1, head, x) {
    let out = head.b[0];
    for (let o = 0; o < L1.nOut; o++) {
        let z = L1.b[o];
        for (let i = 0; i < L1.nIn; i++) z += L1.W[o * L1.nIn + i] * x[i];
        if (z > 0) out += head.W[o] * z;      // relu hidden
    }
    return 1 / (1 + Math.exp(-out));          // sigmoid head
}
let domainReportAt = 500;
// v40 -- trade episode state
const TRADE_LOG_PATH = _statePath("trade_log.json");
let tradeLog = []; try { tradeLog = JSON.parse(Deno.readTextFileSync(TRADE_LOG_PATH)); } catch {}
let tradeDirty = false, tradeReportAt = 300;
// v41 -- TRADE LADDER state: the T ladder's pattern on trader boldness.
const TRADE_STATE_PATH = _statePath("trade_state.json");
let tradeState = { adoptedT: null, adoptedAt: null, streak: 0, streakT: null };
try { tradeState = { ...tradeState, ...JSON.parse(Deno.readTextFileSync(TRADE_STATE_PATH)) }; } catch {}
const tradeT = () => tradeState.adoptedT ?? 0.5;
let evSession = { start: 0, at: 0, n: 0, hpMid: 0, accLast: 0 };
// v43 -- escort effectiveness state
const ESCORT_PATH = _statePath("escort_stats.json");
let escortAgg = null; try { escortAgg = JSON.parse(Deno.readTextFileSync(ESCORT_PATH)); } catch {}
let escortReportAtS = 0, escortThresholdServed = 1.5;
let escortThresholdsBySys = null;   // v48
// v44 -- randomized escort A/B state + served-threshold history
const ESCORT_AB_PATH = _statePath("escort_ab.json");
let escortAB = { lo: [], hi: [] };
try { escortAB = { lo: [], hi: [], ...JSON.parse(Deno.readTextFileSync(ESCORT_AB_PATH)) }; } catch {}
let escortABReportAt = 40;
// v46/v47 -- faction bias, now LIVE: the combined BRAIN_EV_BIAS env
// string remains the operator's hard pin (parsed once, wins outright);
// absent that, per-faction FLOAT gates (BRAIN_EV_BIAS_CONFED /
// _PIRATE, [-0.5, 0.5]) read through gateNum -- console-flippable, no
// restart, undo/redo for free. Precedence stated: env string > env
// float > gates file > 0.
const EV_BIAS_PIN = (() => {
    const out = {};
    const raw = Deno.env.get("BRAIN_EV_BIAS") ?? "";
    for (const part of raw.split(",")) {
        const [k, v] = part.split(":").map(s => s && s.trim());
        const num = Number(v);
        if ((k === "confed" || k === "pirate") && Number.isFinite(num)) out["ev_" + k] = Math.max(-0.5, Math.min(0.5, num));
    }
    return Object.keys(out).length ? out : null;
})();
function evBias() {
    if (EV_BIAS_PIN) return EV_BIAS_PIN;
    return {
        ev_confed: gateNum("BRAIN_EV_BIAS_CONFED", 0, -0.5, 0.5),
        ev_pirate: gateNum("BRAIN_EV_BIAS_PIRATE", 0, -0.5, 0.5),
    };
}
// v45 -- LEARNED INTERCEPT state: the v43 curve's base (was the
// hardcoded 1.5) now nudges on decisive randomized verdicts.
const ESCORT_TH_STATE_PATH = _statePath("escort_th_state.json");
let escortThState = { baseTh: 1.5, streak: 0 };
try { escortThState = { baseTh: 1.5, streak: 0, ...JSON.parse(Deno.readTextFileSync(ESCORT_TH_STATE_PATH)) }; } catch {}
const ESCORT_TH_HIST_PATH = _statePath("escort_th_history.json");
let escortThHist = []; try { escortThHist = JSON.parse(Deno.readTextFileSync(ESCORT_TH_HIST_PATH)); } catch {}
let escortThHistAt = 0;
const ESCORT_AB_HIST_PATH = _statePath("escort_ab_history.json");   // v47
// v48 -- bias A/B state
const BIAS_AB_PATH = _statePath("bias_ab.json");
let biasAB = { on: [], off: [] };
try { biasAB = { on: [], off: [], ...JSON.parse(Deno.readTextFileSync(BIAS_AB_PATH)) }; } catch {}
let biasABReportAt = 20;
// v49 -- magnitude ladder state
const BIAS_MAG_PATH = _statePath("bias_mag_state.json");
// v51 -- LADDER LIFE diary: every shrink/floor/med/reopen, one line.
const BIAS_MAG_HIST_PATH = _statePath("bias_mag_history.json");
function magEvent(ev51, mag51) {
    try {
        let h = []; try { h = JSON.parse(Deno.readTextFileSync(BIAS_MAG_HIST_PATH)); } catch {}
        h.push({ ts: Date.now(), ev: ev51, mag: mag51 });
        ringKeep(h, 300);
        Deno.writeTextFileSync(BIAS_MAG_HIST_PATH, JSON.stringify(h));
    } catch {}
}
let biasABMagState = { mag: 0.15, found: null, lastShrunkFrom: null, driftStreak: 0 };
try { biasABMagState = { mag: 0.15, found: null, lastShrunkFrom: null, driftStreak: 0, ...JSON.parse(Deno.readTextFileSync(BIAS_MAG_PATH)) }; } catch {}
const TELEM_PATH = _statePath("difficulty_telemetry.json");   // v40 -- shared with rc
setInterval(() => { if (tradeDirty) { tradeDirty = false; try { Deno.writeTextFileSync(TRADE_LOG_PATH, JSON.stringify(tradeLog)); } catch {} } }, 15000);
// v17 -- SPLIT-EXPERIMENT VERDICT: per-regime domain tallies persist
// across sessions (this session's counts fold in under its regime key);
// once both regimes have data, the periodic report includes a verdict
// per domain via a two-proportion z-test -- "winning" only clears
// |z| > 1.96, otherwise "no significant difference yet". The brain
// runs the experiment AND reads out the result.
const REGIME = SPLIT ? "split" : "shared";
const REGIME_PATH = _statePath("regime_stats.json");
const REGIME_HP_PATH = _statePath("regime_hp.json");   // v51
// v52 -- regime hp goes PER-DOMAIN: {dom: {split:[], shared:[]}}. The
// v51 file was ev-only with top-level arrays; the loader LIFTS that
// shape into .ev rather than losing a night's data to a migration.
// Feeding domains: ev (v51) and raycaster (v52 -- its session close
// already computes hpMidband, the data was one push away). The
// DUNGEON stays out: its wire format carries no hp (hpMidband is a
// hardcoded null at the rec). v53 CLOSED that gap: the dungeon's
// outcome posts now carry hp, the brain samples them, and all three
// domains feed buckets through this one path.
function regimeHpLoad() {
    let rh = {};
    try { rh = JSON.parse(Deno.readTextFileSync(REGIME_HP_PATH)); } catch {}
    if (Array.isArray(rh.split) || Array.isArray(rh.shared))
        rh = { ev: { split: rh.split ?? [], shared: rh.shared ?? [] } };   // legacy lift
    return rh;
}
function regimeHpPush(dom52, val52) {
    if (val52 == null) return;
    try {
        const rh = regimeHpLoad();
        rh[dom52] = rh[dom52] ?? { split: [], shared: [] };
        rh[dom52][SPLIT ? "split" : "shared"].push(val52);
        ringKeep(rh[dom52].split, 200); ringKeep(rh[dom52].shared, 200);
        Deno.writeTextFileSync(REGIME_HP_PATH, JSON.stringify(rh));
    } catch {}
}
let regimeStats = { split: {}, shared: {} };
try { regimeStats = { split: {}, shared: {}, ...JSON.parse(Deno.readTextFileSync(REGIME_PATH)) }; } catch {}
const _sessionBase = JSON.parse(JSON.stringify(domainStats));   // zeros
function regimeMerged() {
    const out = JSON.parse(JSON.stringify(regimeStats));
    for (const d of Object.keys(domainStats)) {
        const cur = (out[REGIME][d] = out[REGIME][d] || { n: 0, hits: 0 });
        cur.n += domainStats[d].n; cur.hits += domainStats[d].hits;
    }
    return out;
}
function saveRegime() {
    traceTick();   // v2520 -- flush the trace wherever the brain already decided a write is safe
    try { Deno.writeTextFileSync(REGIME_PATH, JSON.stringify(regimeMerged())); } catch {}
}
function twoPropZ(h1, n1, h2, n2) {
    if (n1 < 30 || n2 < 30) return 0;
    const p1 = h1 / n1, p2 = h2 / n2, p = (h1 + h2) / (n1 + n2);
    const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
    return se > 0 ? (p1 - p2) / se : 0;
}
// v18 -- verdict HISTORY: every verdict computation appends its z-values
// so report.html can chart significance emerging over time.
const REGIME_HIST_PATH = _statePath("regime_history.json");
function appendRegimeHistory(zByDomain) {
    try {
        let h = [];
        try { h = JSON.parse(Deno.readTextFileSync(REGIME_HIST_PATH)); } catch {}
        h.push({ ts: Date.now(), ...zByDomain });
        ringKeep(h, 1000);   // v30
        Deno.writeTextFileSync(REGIME_HIST_PATH, JSON.stringify(h));
    } catch {}
}

function regimeVerdict() {
    const R = regimeMerged();
    const lines = [];
    for (const d of ["kaiju", "dungeon", "raycaster", "ev", "fps"]) {
        const s = R.split[d], sh = R.shared[d];
        if (!s?.n || !sh?.n) continue;
        const z = twoPropZ(s.hits, s.n, sh.hits, sh.n);
        const ps = Math.round(100 * s.hits / s.n), psh = Math.round(100 * sh.hits / sh.n);
        // v51 -- the co-primary stencil's THIRD application: for ev (the
        // only domain with hp buckets -- both files feed from ev session
        // closes, one per regime), BRAIN_DIFF_COPRIMARY=on raises the hit
        // bar to 2.24 and lets an hp-midband Welch at the same bar decide
        // when hits cannot; hits win direction ties, raw/trimmed must
        // agree on hp. Other domains stay single-endpoint -- no hp data,
        // and a co-primary with no data is still a wish (the v49 line).
        let verdict, hpClause = "";
        // v52 -- the co-primary now applies to ANY domain with hp buckets
        // (ev and raycaster today; the dungeon the day its page publishes
        // hp -- see regimeHpPush). One code path, per-domain data.
        const rh51 = regimeHpLoad()[d];
        if (rh51 && gateValue("BRAIN_DIFF_COPRIMARY", "off", ["off", "on"]) === "on") {
            const HS = rh51?.split ?? [], HSh = rh51?.shared ?? [];
            let hpDir51 = 0;
            if (HS.length >= 10 && HSh.length >= 10) {
                const tvHp = welchT(HS, HSh);
                const sT = madTrim(HS), shT = madTrim(HSh);
                const tvHpT = (sT.length >= 10 && shT.length >= 10) ? welchT(sT, shT) : null;
                if (Math.abs(tvHp) > 2.24 && (tvHpT == null || (Math.abs(tvHpT) > 2.24 && Math.sign(tvHpT) === Math.sign(tvHp))))
                    hpDir51 = Math.sign(tvHp);
                hpClause = ` [hp co-primary t=${tvHp.toFixed(2)}, bar 2.24]`;
            } else hpClause = ` [hp co-primary abstains: split n=${HS.length}, shared n=${HSh.length}]`;
            const zDecisive = Math.abs(z) > 2.24;
            verdict = zDecisive ? (z > 0 ? "SPLIT winning" : "SHARED winning")
                    : hpDir51 !== 0 ? (hpDir51 > 0 ? "SPLIT winning (by hp co-primary)" : "SHARED winning (by hp co-primary)")
                    : "no significant difference yet";
        } else {
            verdict = Math.abs(z) > 1.96 ? (z > 0 ? "SPLIT winning" : "SHARED winning")
                                         : "no significant difference yet";
        }
        lines.push(`${d}: split ${ps}% (n=${s.n}) vs shared ${psh}% (n=${sh.n}) -> ${verdict} (z=${z.toFixed(2)})${hpClause}`);
        (regimeVerdict._z = regimeVerdict._z || {})[d] = Math.round(z * 100) / 100;   // v18
        regimeVerdict._z[d + "_n"] = s.n + sh.n;   // v19 -- sample count for the chart
    }
    if (lines.length && regimeVerdict._z) { appendRegimeHistory(regimeVerdict._z); regimeVerdict._z = null; }   // v18
    return lines.length ? "[brain] split verdict -- " + lines.join("; ") : null;
}
// v39 -- "ev" joins the domains: Escape Velocity ships report as
// ev-<id> and get their own hit-rates, per-domain T sweeps, and
// selection A/B buckets for free (everything downstream keys off this
// function). (The v39 scope note about ev riding the kaiju head is
// RETIRED: v40 gave ev its own head -- debts should be marked paid
// where they were incurred.)
// v56 -- fps joins the map (brain WIRED, engine DORMANT: no fps- ids
// flow until the DungeonDemo boolean flips WITH the next dungeon
// reset; until then every fps row simply renders empty, the ev precedent)
const domainOf = (id) => String(id).startsWith("dgn-") ? "dungeon" : String(id).startsWith("rc-") ? "raycaster" : String(id).startsWith("ev-") ? "ev" : String(id).startsWith("fps-") ? "fps" : "kaiju";
// v30 -- ONE ring policy, two modes (the unification of three ad-hoc
// implementations). Without plotFn: a HARD ring -- splice the oldest,
// byte-identical to the scattered splices it replaces (converting plain
// rings to downsampling would silently change their semantics, so the
// helper refuses to). With plotFn: WISE-FORGETTING -- past cap, the
// older half thins to every 2nd entry but plotFn-flagged entries (which
// receive (entry, index, arr) so sequence properties like sign flips
// can be judged) are never dropped. Mutates in place, returns arr.
function ringKeep(arr, cap, plotFn) {
    if (arr.length <= cap) return arr;
    if (!plotFn) { arr.splice(0, arr.length - cap); return arr; }
    const half = Math.floor(arr.length / 2);
    const kept = [];
    for (let i = 0; i < half; i++) if (plotFn(arr[i], i, arr) || i % 2 === 0) kept.push(arr[i]);
    const tail = arr.slice(half);
    arr.length = 0;
    arr.push(...kept, ...tail);
    return arr;
}
// v20 -- DIFFICULTY REWARD RESEARCH: the missing measurement, built.
// Nothing yet defines "the player is having a good fight", so this
// telemetry records the candidates per raycaster SESSION (a session
// ends after 60s without rc outcomes): duration (engagement proxy),
// enemy hit-rate against the player (pressure), final marksmanship
// (skill), and hp-midband fraction (time spent between 25 and 75 HP
// -- fights that hover there are neither stomps nor slaughters).
// Records persist to difficulty_telemetry.json; a session-close
// milestone summarizes. WHEN one of these proves out as a reward,
// the v19 heuristic modulation gets replaced by a learned policy --
// not before.
const DIFF_TELEM_PATH = _statePath("difficulty_telemetry.json");
// v22 -- CONTROLLED DIFFICULTY TEST (BRAIN_DIFF_AB=1). Alternating rc
// sessions: arm 0 = the v19 heuristic exactly; arm 1 = heuristic plus a
// LEARNED session-level offset theta, updated by a (1+1) evolution
// strategy on the nominated candidate reward (BRAIN_DIFF_REWARD,
// default hp-midband): keep direction while the reward improves, flip
// when it drops, step 0.05, theta clamped to [-0.3, 0.3]. The OUTCOME
// metric is session DURATION (the engagement proxy), compared across
// arms by Welch's t-test at 20+ sessions per arm -- reward candidates
// steer the learner; duration judges the arms. |t| > 2.0 is treated as
// significant (normal approximation; stated, not hidden).
const DIFF_AB = Deno.env.get("BRAIN_DIFF_AB") === "1";
const DIFF_REWARD = Deno.env.get("BRAIN_DIFF_REWARD") ?? "hpMidband";
// v23 -- DIFF ADOPTION LADDER, same shape as the T ladder: after
// BRAIN_DIFF_AUTO_K consecutive DECISIVE verdicts in the same
// direction, the test resolves -- LEARNED wins promote theta as the
// standing offset for ALL sessions (alternation stops); HEURISTIC
// wins RETIRE the test symmetrically (a decisive loss should end the
// experiment too, not run it forever). Both need the human gate
// BRAIN_DIFF_AUTO=adopt; the default SUGGESTS. A resolved state
// persists and applies even with BRAIN_DIFF_AB unset; reset = delete
// difficulty_ab.json.
// v26 -- DIFF_AUTO is now a live gate lookup (see gateValue above)
const DIFF_AUTO_K = Math.max(1, Number(Deno.env.get("BRAIN_DIFF_AUTO_K") ?? 3));
const DIFF_AB_PATH = _statePath("difficulty_ab.json");
let diffAB = { idx: 0, theta: 0, dir: 1, lastReward: null, arms: { heuristic: [], learned: [] },
               verdictStreak: 0, resolved: null, edgeStreak: 0 };   // v23 -- resolved: {mode:"promoted",theta}|{mode:"retired"}
try { diffAB = { ...diffAB, ...JSON.parse(Deno.readTextFileSync(DIFF_AB_PATH)) }; } catch {}
function saveDiffAB() { try { Deno.writeTextFileSync(DIFF_AB_PATH, JSON.stringify(diffAB)); } catch {} }
// v24 -- DUNGEON DIFFICULTY A/B (BRAIN_DIFF_AB_DGN=1): the rc machinery
// generalized the honest-but-ugly way -- a PARALLEL twin with its own
// state file, not a premature abstraction over two cases (unify when a
// third domain appears; this is a stated tradeoff, not an oversight).
// Differences from rc: the dungeon publishes no player acc/hp, so the
// default reward is CLOSENESS (1 - 2*|enemyHitRate - 0.5|, computable
// from outcomes alone), and the learned offset rides dgn- aggro, which
// DungeonAI now actually consumes for cadence (PATCH-B22).
const DIFF_AB_DGN = Deno.env.get("BRAIN_DIFF_AB_DGN") === "1";
const DIFF_REWARD_DGN = Deno.env.get("BRAIN_DIFF_REWARD_DGN") ?? "closeness";
const DIFF_AB_DGN_PATH = _statePath("difficulty_ab_dgn.json");
let diffABDgn = { idx: 0, theta: 0, dir: 1, lastReward: null, arms: { heuristic: [], learned: [] },
                  verdictStreak: 0, resolved: null, edgeStreak: 0, step: 0.05 };
try { diffABDgn = { ...diffABDgn, ...JSON.parse(Deno.readTextFileSync(DIFF_AB_DGN_PATH)) }; } catch {}
function saveDiffABDgn() { try { Deno.writeTextFileSync(DIFF_AB_DGN_PATH, JSON.stringify(diffABDgn)); } catch {} }
let dgnSession = null;
function dgnTelemetryOutcome(o) {
    const now = Date.now();
    if (dgnSession && now - dgnSession.last > 60000) dgnTelemetryClose();
    if (!dgnSession) {
        dgnSession = { start: now, last: now, shots: 0, enemyHits: 0, hpSamples: 0, hpMid: 0,   // v53 -- dgn hp
                       arm: (DIFF_AB_DGN && !diffABDgn.resolved) ? (diffABDgn.idx++ % 2 === 0 ? "heuristic" : "learned") : null };
        if (DIFF_AB_DGN && !diffABDgn.resolved) saveDiffABDgn();
    }
    dgnSession.last = now;
    dgnSession.shots++; if (o.hit) dgnSession.enemyHits++;
    // v53 -- dgn hp sampling, the rc pattern verbatim (v52's named gap,
    // closed the day the data arrived)
    if (typeof o.hp === "number") { dgnSession.hpSamples++; if (o.hp >= 25 && o.hp <= 75) dgnSession.hpMid++; }
}
function dgnTelemetryClose() {
    if (!dgnSession || dgnSession.shots < 3) { dgnSession = null; return; }
    const ehr = dgnSession.enemyHits / dgnSession.shots;
    const rec = { ts: dgnSession.start, dom: "dgn",
                  durS: Math.round((dgnSession.last - dgnSession.start) / 1000),
                  enemyHitRate: Math.round(100 * ehr) / 100, playerAcc: null,
                  hpMidband: dgnSession.hpSamples ? Math.round(100 * dgnSession.hpMid / dgnSession.hpSamples) / 100 : null,
                  dom: "dungeon" };   // v53/v54 -- hp computed; dom tags the shared file
    regimeHpPush("dungeon", rec.hpMidband);   // v53 -- the v52 one-path lights up by itself
    try {
        let h = [];
        try { h = JSON.parse(Deno.readTextFileSync(DIFF_TELEM_PATH)); } catch {}
        h.push(rec); ringKeep(h, 500);   // v30
        Deno.writeTextFileSync(DIFF_TELEM_PATH, JSON.stringify(h));
    } catch {}
    // v26 -- dungeon warm-restart monitor (twin of the rc v25 one; its
    // first promotion can now actually be probationed)
    if (diffABDgn.resolved?.mode === "promoted" && Array.isArray(diffABDgn.resolved.baselineArr) && diffABDgn.resolved.baselineArr.length >= 5) {
        const R = diffABDgn.resolved;
        (R.post = R.post || []).push(rec.durS); ringKeep(R.post, 200);   // v30
        if (R.post.length >= 20) {
            const post20d = R.post.slice(-20);
            const tv = welchT(post20d, R.baselineArr);
            // v36 -- twin parity: the same agreement-gated one-sided test
            const postTrD = madTrim(post20d), baseTrD = madTrim(R.baselineArr);
            const tvTrD = (postTrD.length >= 10 && baseTrD.length >= 10) ? welchT(postTrD, baseTrD) : null;
            const rawWorseD = tv < -2.0;
            const driftedD = tvTrD == null ? rawWorseD : (rawWorseD && tvTrD < -2.0);
            if (rawWorseD && tvTrD != null && tvTrD >= -2.0) {
                reportMilestone(BRIDGE, `[brain] dungeon drift check: raw t=${tv.toFixed(2)} vs trimmed t=${tvTrD.toFixed(2)} DISAGREE; streak withheld`, NARRATE === "ollama");
            }
            if (driftedD) R.driftStreak = (R.driftStreak || 0) + 1; else R.driftStreak = 0;
            if (R.driftStreak >= DIFF_AUTO_K) {
                if (gateValue("BRAIN_DIFF_AUTO", "suggest") === "adopt") {
                    const warmTheta = R.theta;
                    diffABDgn.resolved = null;
                    diffABDgn.theta = warmTheta; diffABDgn.dir = Math.random() < 0.5 ? -1 : 1;
                    diffABDgn.step = 0.05; diffABDgn.lastReward = null; diffABDgn.verdictStreak = 0; diffABDgn.edgeStreak = 0;
                    diffABDgn.arms = { heuristic: [], learned: [] };
                    reportMilestone(BRIDGE, `[brain] dungeon difficulty test RE-OPENED (drift); ES warm-restarts from theta=${warmTheta.toFixed(2)}`, NARRATE === "ollama");
                } else {
                    R.driftStreak = 0;
                    reportMilestone(BRIDGE, `[brain] promoted dungeon theta looks DRIFTED; suggests re-opening -- gate: BRAIN_DIFF_AUTO=adopt`, NARRATE === "ollama");
                }
            }
        }
        saveDiffABDgn();
    }
    if (DIFF_AB_DGN && dgnSession.arm) {
        const armArr = diffABDgn.arms[dgnSession.arm];
        armArr.push(rec.durS); ringKeep(armArr, 200);   // v30
        // v53 -- dgn co-primary raw material starts accumulating (the
        // verdict wiring is phase-54; arriving there with data beats
        // arriving with a wish)
        if (rec.hpMidband != null) {
            (diffABDgn.armsHp = diffABDgn.armsHp || { heuristic: [], learned: [] })[dgnSession.arm].push(rec.hpMidband);
            ringKeep(diffABDgn.armsHp[dgnSession.arm], 200);
        }
        if (dgnSession.arm === "learned") {
            const reward = DIFF_REWARD_DGN === "closeness" ? 1 - 2 * Math.abs(ehr - 0.5) : rec[DIFF_REWARD_DGN];
            if (reward != null) {
                diffABDgn.step = diffABDgn.step ?? 0.05;
                if (diffABDgn.lastReward != null && reward < diffABDgn.lastReward) {
                    diffABDgn.dir = -diffABDgn.dir;
                    diffABDgn.step = Math.max(0.0125, diffABDgn.step * 0.7);
                } else if (diffABDgn.lastReward != null) diffABDgn.step = Math.min(0.05, diffABDgn.step * 1.15);
                diffABDgn.theta = Math.max(-0.3, Math.min(0.3, diffABDgn.theta + diffABDgn.dir * diffABDgn.step));
                diffABDgn.lastReward = reward;
                if (Math.abs(diffABDgn.theta) >= 0.3 - 1e-9) diffABDgn.edgeStreak++; else diffABDgn.edgeStreak = 0;
                if (diffABDgn.edgeStreak >= 5) {
                    diffABDgn.theta = 0; diffABDgn.dir = Math.random() < 0.5 ? -1 : 1;
                    diffABDgn.edgeStreak = 0; diffABDgn.lastReward = null; diffABDgn.step = 0.05;
                    reportMilestone(BRIDGE, `[brain] dungeon difficulty ES re-seeded (clamp edge x5)`, NARRATE === "ollama");
                }
            }
        }
        saveDiffABDgn();
        const H = diffABDgn.arms.heuristic, L = diffABDgn.arms.learned;
        if (H.length >= 20 && L.length >= 20) {
            const tv = welchT(L, H);
            const Ltr2 = madTrim(L), Htr2 = madTrim(H);   // v35
            const tvT2 = (Ltr2.length >= 10 && Htr2.length >= 10) ? welchT(Ltr2, Htr2) : null;
            let agree2 = agreeVerdict(tv, tvT2);
            // v54 -- dgn co-primary VERDICT (the rc stencil's third
            // difficulty application, wired now that v53's data has had a
            // phase to pool): same gate, same 2.24 Bonferroni bars, same
            // duration-wins-ties, same abstain-under-10-with-counts.
            let coNote54 = "";
            const DHL = diffABDgn.armsHp?.learned ?? [], DHH = diffABDgn.armsHp?.heuristic ?? [];
            let tvHp54 = null, tvHpT54 = null;
            if (DHL.length >= 10 && DHH.length >= 10) {
                tvHp54 = welchT(DHL, DHH);
                const aT = madTrim(DHL), bT = madTrim(DHH);
                tvHpT54 = (aT.length >= 10 && bT.length >= 10) ? welchT(aT, bT) : null;
            }
            if (gateValue("BRAIN_DIFF_COPRIMARY", "off", ["off", "on"]) === "on") {
                const BAR54 = 2.24;
                const rateDec54 = Math.abs(tv) > BAR54 && (tvT2 == null || (Math.abs(tvT2) > BAR54 && Math.sign(tvT2) === Math.sign(tv)));
                let hpDir54 = 0;
                if (tvHp54 != null) {
                    if (Math.abs(tvHp54) > BAR54 && (tvHpT54 == null || (Math.abs(tvHpT54) > BAR54 && Math.sign(tvHpT54) === Math.sign(tvHp54))))
                        hpDir54 = Math.sign(tvHp54);
                    coNote54 = ` | hp-midband: ${(DHL.reduce((a, b) => a + b, 0) / DHL.length).toFixed(2)} vs ${(DHH.reduce((a, b) => a + b, 0) / DHH.length).toFixed(2)} (t=${tvHp54.toFixed(2)}; co-primary, bar 2.24)`;
                } else coNote54 = ` | hp-midband co-primary abstains (learned n=${DHL.length}, heuristic n=${DHH.length})`;
                agree2 = rateDec54 ? { decisive: true, dir: Math.sign(tv), note: "" }
                       : hpDir54 !== 0 ? { decisive: true, dir: hpDir54, note: " (decided by hp-midband co-primary)" }
                       : { decisive: false, dir: 0, note: agree2.note };
            }
            const mH = H.reduce((x, y) => x + y, 0) / H.length, mL = L.reduce((x, y) => x + y, 0) / L.length;
            let verdict = agree2.decisive ? (agree2.dir > 0 ? "LEARNED holds players longer" : "HEURISTIC holds players longer") + agree2.note : "no significant difference yet" + agree2.note;
            if (agree2.decisive) {
                const d24 = agree2.dir;
                diffABDgn.verdictStreak = (Math.sign(diffABDgn.verdictStreak) === d24) ? diffABDgn.verdictStreak + d24 : d24;
            } else diffABDgn.verdictStreak = 0;
            if (Math.abs(diffABDgn.verdictStreak) >= DIFF_AUTO_K && !diffABDgn.resolved) {
                const won = diffABDgn.verdictStreak > 0;
                if (gateValue("BRAIN_DIFF_AUTO", "suggest") === "adopt") {
                    diffABDgn.resolved = won ? { mode: "promoted", theta: diffABDgn.theta,
                                                 baselineArr: diffABDgn.arms.learned.slice(-200), post: [], driftStreak: 0 }
                                             : { mode: "retired" };   // v26 -- baseline captured, twin parity
                    verdict += won ? " -- PROMOTED for the dungeon" : " -- RETIRED for the dungeon";
                } else verdict += ` -- suggests ${won ? "PROMOTING" : "RETIRING"} (gate: BRAIN_DIFF_AUTO=adopt)`;
                saveDiffABDgn();
            }
            const oL2 = madOutlierCount(L), oH2 = madOutlierCount(H);   // v34
            const caution2 = (oL2 || oH2)
                ? ` [caution: outliers -- learned ${oL2}, heuristic ${oH2}; inspect the strips]`
                : "";
            // v55 -- dgn diary entry (the v50 rc write, dom-tagged twin)
            try {
                const DHP = _statePath("diff_ab_history.json");
                let dh55 = []; try { dh55 = JSON.parse(Deno.readTextFileSync(DHP)); } catch {}
                dh55.push({ ts: Date.now(), tDur: Math.round(tv * 100) / 100,
                            tHp: tvHp54 == null ? null : Math.round(tvHp54 * 100) / 100,
                            nDur: L.length + H.length, nHp: DHL.length + DHH.length,
                            dom: "dungeon" });
                ringKeep(dh55, 500);
                Deno.writeTextFileSync(DHP, JSON.stringify(dh55));
            } catch {}
            reportMilestone(BRIDGE,
                `[brain] dungeon difficulty A/B (reward=${DIFF_REWARD_DGN}, theta=${diffABDgn.theta.toFixed(2)}): learned ${mL.toFixed(0)}s (n=${L.length}) vs heuristic ${mH.toFixed(0)}s (n=${H.length}) -> ${verdict} (raw t=${tv.toFixed(2)}${tvT2 != null ? ", trimmed t=" + tvT2.toFixed(2) : ""})${coNote54}${caution2}`,
                NARRATE === "ollama");
        }
    }
    dgnSession = null;
}

// v34 -- MAD outlier count (the report's v33 lesson reaching the
// verdicts): Welch assumes roughly normal arms, and a fat-tailed arm
// can buy or block significance with a handful of freak sessions. The
// verdict FLAGS outliers rather than trimming them -- silently
// dropping data is a methods change that deserves its own gate, not a
// quiet if-statement. Robust (median + MAD, 1.4826) for the same
// masking reason the report needed it.
function madOutlierCount(arr) {
    if (arr.length < 5) return 0;
    const srt = [...arr].sort((x, y) => x - y);
    const med = srt[Math.floor(srt.length / 2)];
    const devs = arr.map(v => Math.abs(v - med)).sort((x, y) => x - y);
    const ms = 1.4826 * devs[Math.floor(devs.length / 2)];
    if (ms <= 1e-9) return 0;
    return arr.filter(v => Math.abs(v - med) > 3 * ms).length;
}
// v35 -- MAD trim (the methods change, done in the open): returns the
// array minus its robust outliers. The verdicts report BOTH t values
// and the ladder only counts verdicts where raw and trimmed AGREE on
// significance and direction -- trimming never decides alone, it can
// only withhold consent. If trimming leaves an arm under 10 sessions,
// the trimmed t abstains and the raw verdict stands with a note (a
// heavily-trimmed arm is itself information).
function madTrim(arr) {
    if (arr.length < 5) return arr;
    const srt = [...arr].sort((x, y) => x - y);
    const med = srt[Math.floor(srt.length / 2)];
    const devs = arr.map(v => Math.abs(v - med)).sort((x, y) => x - y);
    const ms = 1.4826 * devs[Math.floor(devs.length / 2)];
    if (ms <= 1e-9) return arr;
    return arr.filter(v => Math.abs(v - med) <= 3 * ms);
}
// verdict agreement: decisive only when both tests clear the bar with
// the same sign; returns {decisive, dir, note}
function agreeVerdict(tRaw, tTrim) {
    const sigR = Math.abs(tRaw) > 2.0, sigT = tTrim != null && Math.abs(tTrim) > 2.0;
    if (tTrim == null) return { decisive: sigR, dir: Math.sign(tRaw), note: " (trimmed abstains: arm too small after trim)" };
    if (sigR && sigT && Math.sign(tRaw) === Math.sign(tTrim)) return { decisive: true, dir: Math.sign(tRaw), note: "" };
    if (sigR !== sigT || (sigR && sigT)) return { decisive: false, dir: 0, note: " (raw and trimmed DISAGREE -- outliers are arguing; streak withheld)" };
    return { decisive: false, dir: 0, note: "" };
}
function welchT(a, b) {
    const n1 = a.length, n2 = b.length;
    const m1 = a.reduce((x, y) => x + y, 0) / n1, m2 = b.reduce((x, y) => x + y, 0) / n2;
    const v1 = a.reduce((x, y) => x + (y - m1) ** 2, 0) / (n1 - 1);
    const v2 = b.reduce((x, y) => x + (y - m2) ** 2, 0) / (n2 - 1);
    const se = Math.sqrt(v1 / n1 + v2 / n2);
    return se > 0 ? (m1 - m2) / se : 0;
}
let rcSession = null;   // { start, last, shots, enemyHits, acc, hpSamples, hpMid }
function rcTelemetryOutcome(o) {
    const now = Date.now();
    if (rcSession && now - rcSession.last > 60000) rcTelemetryClose();
    if (!rcSession) {
        rcSession = { start: now, last: now, shots: 0, enemyHits: 0, acc: null, hpSamples: 0, hpMid: 0,
                      // v23 -- a resolved test stops alternating
                      arm: (DIFF_AB && !diffAB.resolved) ? (diffAB.idx++ % 2 === 0 ? "heuristic" : "learned") : null };
        if (DIFF_AB && !diffAB.resolved) saveDiffAB();
    }
    rcSession.last = now;
    rcSession.shots++; if (o.hit) rcSession.enemyHits++;
}
function rcTelemetrySnapshot(goals) {
    if (!rcSession) return;
    const g = goals.find(g2 => typeof g2.acc === "number" || typeof g2.hp === "number");
    if (!g) return;
    if (typeof g.acc === "number") rcSession.acc = g.acc;
    if (typeof g.hp === "number") { rcSession.hpSamples++; if (g.hp >= 25 && g.hp <= 75) rcSession.hpMid++; }
}
// v21 -- CORRELATION PASS: once 50+ sessions exist, which candidate
// tracks session length? Pearson r of duration against each candidate
// (plus the derived "closeness" = 1 - 2*|enemyHitRate - 0.5|, peaking
// when the fight is evenly matched). Duration is itself only an
// ENGAGEMENT PROXY and correlation is not causation -- this pass
// nominates a reward candidate for a controlled test, it does not
// crown one.
function pearson(xs, ys) {
    const n = xs.length;
    if (n < 3) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    const d = Math.sqrt(sxx * syy);
    return d > 0 ? sxy / d : null;
}
function telemetryCorrelations() {
    let h = [];
    try { h = JSON.parse(Deno.readTextFileSync(DIFF_TELEM_PATH)); } catch { return null; }
    if (!Array.isArray(h)) return null;
    // v24 -- per-domain: dgn records (dom:"dgn") and rc (untagged legacy +
    // future dom:"rc") correlate separately; mixed-domain r would be soup
    h = h.filter(r => (r.dom ?? "rc") === "rc");
    if (h.length < 50) return null;
    const cands = {
        "enemy-hit": r => r.enemyHitRate,
        "closeness": r => r.enemyHitRate != null ? 1 - 2 * Math.abs(r.enemyHitRate - 0.5) : null,
        "acc": r => r.playerAcc,
        "hp-midband": r => r.hpMidband,
    };
    const parts = [];
    let best = null;
    for (const [name, fn] of Object.entries(cands)) {
        const pairs = h.map(r => [fn(r), r.durS]).filter(([a, b]) => a != null && b != null);
        if (pairs.length < 20) continue;
        const r = pearson(pairs.map(p2 => p2[0]), pairs.map(p2 => p2[1]));
        if (r == null) continue;
        parts.push(`${name} r=${r >= 0 ? "+" : ""}${r.toFixed(2)}`);
        if (!best || Math.abs(r) > Math.abs(best.r)) best = { name, r };
    }
    if (!parts.length) return null;
    return `[brain] difficulty correlations vs session length (n=${h.length}): ${parts.join(", ")}` +
        (best ? ` -- ${best.name} leads (nominate for a controlled test, correlation is not causation)` : "");
}

function rcTelemetryClose() {
    if (!rcSession || rcSession.shots < 3) { rcSession = null; return; }
    const rec = {
        ts: rcSession.start,
        durS: Math.round((rcSession.last - rcSession.start) / 1000),
        enemyHitRate: Math.round(100 * rcSession.enemyHits / rcSession.shots) / 100,
        playerAcc: rcSession.acc,
        hpMidband: rcSession.hpSamples ? Math.round(100 * rcSession.hpMid / rcSession.hpSamples) / 100 : null,
        dom: "raycaster",   // v54 -- rc and dgn share this file; untagged rows are pre-v54 mixed history
    };
    regimeHpPush("raycaster", rec.hpMidband);   // v52 -- null-safe inside
    try {
        let h = [];
        try { h = JSON.parse(Deno.readTextFileSync(DIFF_TELEM_PATH)); } catch {}
        h.push(rec); ringKeep(h, 500);   // v30
        Deno.writeTextFileSync(DIFF_TELEM_PATH, JSON.stringify(h));
    } catch {}
    reportMilestone(BRIDGE,
        `[brain] rc session telemetry: ${rec.durS}s, enemy hit ${Math.round(rec.enemyHitRate * 100)}%, ` +
        `your acc ${rec.playerAcc != null ? Math.round(rec.playerAcc * 100) + "%" : "-"}, ` +
        `hp mid-band ${rec.hpMidband != null ? Math.round(rec.hpMidband * 100) + "%" : "-"}`,
        NARRATE === "ollama");
    // v25 -- WARM RESTART monitor: a promoted theta is a bet that must
    // keep paying under drift (players change, policies retrain around
    // it). Promoted-era sessions accumulate; once 20 exist, the last 20
    // are Welch-tested against the promotion-time baseline. Three
    // consecutive significantly-WORSE checks re-open the test through
    // the same human gate -- and the ES restarts WARM, from the promoted
    // theta, not from zero: the old optimum is the best guess for the
    // new one's neighborhood.
    if (diffAB.resolved?.mode === "promoted" && Array.isArray(diffAB.resolved.baselineArr) && diffAB.resolved.baselineArr.length >= 5) {
        const R = diffAB.resolved;
        (R.post = R.post || []).push(rec.durS); ringKeep(R.post, 200);   // v30
        if (R.post.length >= 20) {
            const post20 = R.post.slice(-20);
            const tv = welchT(post20, R.baselineArr);
            // v36 -- DRIFT adopts the v35 agreement rule (the v34 open
            // question, RESOLVED): re-opening a promoted test is expensive,
            // and agreement-gating errs conservative in exactly that
            // direction. The test here is ONE-SIDED -- both must agree the
            // post window is WORSE (t < -2.0) -- and the v35 abstain rule
            // carries over: if trimming starves either side under 10, the
            // trimmed t abstains and raw decides alone, with the v34 flag
            // still naming the outliers.
            const postTr = madTrim(post20), baseTr = madTrim(R.baselineArr);
            const tvTr = (postTr.length >= 10 && baseTr.length >= 10) ? welchT(postTr, baseTr) : null;
            const rawWorse = tv < -2.0;
            const drifted = tvTr == null ? rawWorse : (rawWorse && tvTr < -2.0);
            if (rawWorse && tvTr != null && tvTr >= -2.0) {
                reportMilestone(BRIDGE, `[brain] drift check: raw t=${tv.toFixed(2)} says worse but trimmed t=${tvTr.toFixed(2)} disagrees -- outliers are arguing; streak withheld`, NARRATE === "ollama");
            } else if (rawWorse) {
                const oP = madOutlierCount(post20);
                if (oP) reportMilestone(BRIDGE, `[brain] drift check counted (raw t=${tv.toFixed(2)}${tvTr != null ? ", trimmed t=" + tvTr.toFixed(2) : ", trimmed abstains"}): ${oP} outlier session(s) flagged in the post window`, NARRATE === "ollama");
            }
            if (drifted) R.driftStreak = (R.driftStreak || 0) + 1;
            else R.driftStreak = 0;
            if (R.driftStreak >= DIFF_AUTO_K) {
                if (gateValue("BRAIN_DIFF_AUTO", "suggest") === "adopt") {
                    const warmTheta = R.theta;
                    diffAB.resolved = null;
                    diffAB.theta = warmTheta; diffAB.dir = Math.random() < 0.5 ? -1 : 1;
                    diffAB.step = 0.05; diffAB.lastReward = null; diffAB.verdictStreak = 0; diffAB.edgeStreak = 0;
                    diffAB.arms = { heuristic: [], learned: [] };   // fresh eras only
                    reportMilestone(BRIDGE, `[brain] difficulty test RE-OPENED (promoted theta drifted: ${DIFF_AUTO_K} consecutive worse-than-baseline checks); ES warm-restarts from theta=${warmTheta.toFixed(2)}`, NARRATE === "ollama");
                } else {
                    R.driftStreak = 0;   // re-arm the check rather than spamming
                    reportMilestone(BRIDGE, `[brain] promoted difficulty theta looks DRIFTED (last 20 sessions significantly under the promotion baseline); suggests re-opening the test -- set BRAIN_DIFF_AUTO=adopt to allow`, NARRATE === "ollama");
                }
            }
        }
        saveDiffAB();
    }
    // v22 -- controlled test bookkeeping
    if (DIFF_AB && rcSession.arm) {
        const armArr = diffAB.arms[rcSession.arm];
        armArr.push(rec.durS); ringKeep(armArr, 200);   // v30
        // v49 -- CO-PRIMARY raw material: hp-midband per arm (null hp
        // sessions simply do not join; the verdict abstains under 10).
        // (v53 update: the dungeon NOW publishes hp -- its diffAB armsHp
        // collects below at the dgn close, and the dgn VERDICT co-primary
        // is phase-54 work once that data has depth. Data first.)
        if (rec.hpMidband != null) {
            (diffAB.armsHp = diffAB.armsHp || { heuristic: [], learned: [] })[rcSession.arm].push(rec.hpMidband);
            ringKeep(diffAB.armsHp[rcSession.arm], 200);
        }
        if (rcSession.arm === "learned") {
            const reward = rec[DIFF_REWARD];
            if (reward != null) {
                // v24 -- step-size decay: a flip means we overshot the
                // optimum (shrink toward fine steps, floor 0.0125); a hold
                // means we are still climbing (regrow toward 0.05). The
                // fixed 0.05 was coarse once settled -- the ES oscillated
                // a full step wide forever.
                diffAB.step = diffAB.step ?? 0.05;
                if (diffAB.lastReward != null && reward < diffAB.lastReward) {
                    diffAB.dir = -diffAB.dir;
                    diffAB.step = Math.max(0.0125, diffAB.step * 0.7);
                } else if (diffAB.lastReward != null) {
                    diffAB.step = Math.min(0.05, diffAB.step * 1.15);
                }
                diffAB.theta = Math.max(-0.3, Math.min(0.3, diffAB.theta + diffAB.dir * diffAB.step));
                diffAB.lastReward = reward;
                // v23 -- RESTART KICK: theta pinned at a clamp edge for 5+
                // learned sessions means the ES is pushing against a wall
                // (or chasing noise off the map). Re-seed at 0 with a fresh
                // random direction rather than grinding the boundary.
                if (Math.abs(diffAB.theta) >= 0.3 - 1e-9) diffAB.edgeStreak++;
                else diffAB.edgeStreak = 0;
                if (diffAB.edgeStreak >= 5) {
                    diffAB.theta = 0; diffAB.dir = Math.random() < 0.5 ? -1 : 1;
                    diffAB.edgeStreak = 0; diffAB.lastReward = null;
                    diffAB.step = 0.05;   // v24 -- kick also resets the step
                    reportMilestone(BRIDGE, `[brain] difficulty ES re-seeded: theta sat at the clamp edge for 5 sessions (wall or noise); back to 0, fresh direction`, NARRATE === "ollama");
                }
            }
        }
        saveDiffAB();
        const H = diffAB.arms.heuristic, L = diffAB.arms.learned;
        if (H.length >= 20 && L.length >= 20) {
            const tv = welchT(L, H);
            // v35 -- the trimmed twin: both t values reported; the streak
            // requires their agreement
            const Ltr = madTrim(L), Htr = madTrim(H);
            const tvT = (Ltr.length >= 10 && Htr.length >= 10) ? welchT(Ltr, Htr) : null;
            let agree = agreeVerdict(tv, tvT);
            // v49 -- GATED CO-PRIMARY (the v48 escort pattern, generalized):
            // BRAIN_DIFF_COPRIMARY=on raises both bars to 2.24 (Bonferroni)
            // and lets hp-midband decide when duration cannot -- with
            // duration winning direction ties as primary-among-equals.
            // Direction semantics: HIGHER midband under learned = the
            // learned arm keeps players in the sweet zone = learned wins.
            // v50 -- hp t computed whenever the data exists: the DIARY
            // records both endpoints regardless of whether the gate lets
            // the second one decide -- so flipping the gate on later
            // inherits history instead of starting blind.
            const HL = diffAB.armsHp?.learned ?? [], HH = diffAB.armsHp?.heuristic ?? [];
            let tvHp50 = null, tvHpT50 = null;
            if (HL.length >= 10 && HH.length >= 10) {
                tvHp50 = welchT(HL, HH);
                const hlT = madTrim(HL), hhT = madTrim(HH);
                tvHpT50 = (hlT.length >= 10 && hhT.length >= 10) ? welchT(hlT, hhT) : null;
            }
            let coNote49 = "";
            if (gateValue("BRAIN_DIFF_COPRIMARY", "off", ["off", "on"]) === "on") {
                const BAR49 = 2.24;
                const rateDecisive49 = Math.abs(tv) > BAR49 && (tvT == null || (Math.abs(tvT) > BAR49 && Math.sign(tvT) === Math.sign(tv)));
                let hpDir = 0;
                if (tvHp50 != null) {
                    if (Math.abs(tvHp50) > BAR49 && (tvHpT50 == null || (Math.abs(tvHpT50) > BAR49 && Math.sign(tvHpT50) === Math.sign(tvHp50))))
                        hpDir = Math.sign(tvHp50);
                    coNote49 = ` | hp-midband: ${(HL.reduce((a, b) => a + b, 0) / HL.length).toFixed(2)} vs ${(HH.reduce((a, b) => a + b, 0) / HH.length).toFixed(2)} (t=${tvHp50.toFixed(2)}; co-primary, bar 2.24)`;
                } else coNote49 = ` | hp-midband co-primary abstains (arm n < 10)`;
                agree = rateDecisive49 ? { decisive: true, dir: Math.sign(tv), note: "" }
                      : hpDir !== 0 ? { decisive: true, dir: hpDir, note: " (decided by hp-midband co-primary)" }
                      : { decisive: false, dir: 0, note: agree.note };
            }
            // v50 -- ENDPOINT DIARY (the v47 escort pattern, generalized):
            // {ts, tDur, tHp, nDur, nHp} per report, 500-ring.
            try {
                const DHP = _statePath("diff_ab_history.json");
                let dh50 = []; try { dh50 = JSON.parse(Deno.readTextFileSync(DHP)); } catch {}
                dh50.push({ ts: Date.now(), tDur: Math.round(tv * 100) / 100,
                            tHp: tvHp50 == null ? null : Math.round(tvHp50 * 100) / 100,
                            nDur: L.length + H.length, nHp: HL.length + HH.length,
                            dom: "raycaster" });   // v55 -- dom column (decided over per-domain files: one reader, v36 unions, tags beat filenames)
                ringKeep(dh50, 500);
                Deno.writeTextFileSync(DHP, JSON.stringify(dh50));
            } catch {}
            const mH = H.reduce((x, y) => x + y, 0) / H.length, mL = L.reduce((x, y) => x + y, 0) / L.length;
            const verdict = agree.decisive ? (agree.dir > 0 ? "LEARNED holds players longer" : "HEURISTIC holds players longer") + agree.note
                                           : "no significant difference yet" + agree.note;
            let ladder = "";
            // v23/v35 -- the ladder now counts AGREED decisive verdicts only
            if (agree.decisive) {
                const dir23 = agree.dir;
                diffAB.verdictStreak = (Math.sign(diffAB.verdictStreak) === dir23) ? diffAB.verdictStreak + dir23 : dir23;
            } else diffAB.verdictStreak = 0;
            if (Math.abs(diffAB.verdictStreak) >= DIFF_AUTO_K && !diffAB.resolved) {
                const won = diffAB.verdictStreak > 0;
                if (gateValue("BRAIN_DIFF_AUTO", "suggest") === "adopt") {
                    // v25 -- keep the winning arm's durations as the drift
                    // baseline: post-promotion sessions need something to
                    // drift AGAINST.
                    diffAB.resolved = won ? { mode: "promoted", theta: diffAB.theta,
                                              baselineArr: diffAB.arms.learned.slice(-200), post: [], driftStreak: 0 }
                                          : { mode: "retired" };
                    ladder = won ? ` -- PROMOTED: theta=${diffAB.theta.toFixed(2)} is now the standing offset for all sessions (alternation stops)`
                                 : ` -- RETIRED: the heuristic won decisively; the test stops (delete difficulty_ab.json to rerun)`;
                } else {
                    ladder = won ? ` -- suggests PROMOTING theta=${diffAB.theta.toFixed(2)} (${diffAB.verdictStreak} decisive verdicts); set BRAIN_DIFF_AUTO=adopt to allow`
                                 : ` -- suggests RETIRING the test (${-diffAB.verdictStreak} decisive heuristic wins); set BRAIN_DIFF_AUTO=adopt to allow`;
                }
            }
            // v34 -- outlier caution: flag when freak sessions may be doing
            // the arguing. (The v34 open question -- do cautioned verdicts
            // feed streaks? -- was resolved across v35/v36: the agreement
            // gate answers it structurally. A cautioned verdict counts iff
            // raw and trimmed AGREE; the caution itself remains a flag.)
            const oL = madOutlierCount(L), oH = madOutlierCount(H);
            const caution = (oL || oH)
                ? ` [caution: ${oL ? oL + " outlier session(s) in learned" : ""}${oL && oH ? ", " : ""}${oH ? oH + " in heuristic" : ""} -- Welch assumes roughly normal arms; inspect the report strips]`
                : "";
            reportMilestone(BRIDGE,
                `[brain] difficulty A/B (reward=${DIFF_REWARD}, theta=${diffAB.theta.toFixed(2)}): learned ${mL.toFixed(0)}s/session (n=${L.length}) vs heuristic ${mH.toFixed(0)}s (n=${H.length}) -> ${verdict} (raw t=${tv.toFixed(2)}${tvT != null ? ", trimmed t=" + tvT.toFixed(2) : ""})${coNote49}${caution}${ladder}`,
                NARRATE === "ollama");
        }
    }
    rcSession = null;
    const corr = telemetryCorrelations();   // v21 -- runs once 50 sessions exist
    if (corr) reportMilestone(BRIDGE, corr, NARRATE === "ollama");
}
const CIVDEF_TAU = Math.max(0.05, Math.min(0.9, Number(Deno.env.get("BRAIN_CIVDEF_TAU") ?? 0.35)));
// v8 -- clipped-IPS cap for civdef explore probes. The clip sweep (see
// NOTES) showed full IPS (cap 12) hurts when the model represents the
// world well (variance) and helps when it cannot (bias); 3 is the
// measured hedge. Set 1 to disable IPS entirely, raise it only if you
// suspect heavily correlated logging. Applied to civdef ONLY: attack
// explore/fallback firing provenance is not logged cleanly enough to
// assign honest propensities there (a phase-9 item if ever).
const IPS_CAP = Math.max(1, Math.min(16, Number(Deno.env.get("BRAIN_IPS_CAP") ?? 3)));
// v9 -- attack picks joined the IPS scheme: provenance from PATCH-B11
// (brain | brain-explore | rotation) plus the publish-time pick record
// below give honest propensities. Rotation fire has no defined
// propensity under our behavior policy -> weight 1 (trained, uncorrected).
const lastAtkPick = new Map();
// v18 -- EMPHASIS PROPENSITIES. Kaiju whose roster attacks all carry an
// interval (the OGRE) run in EMPHASIS MODE: the published pick is
// SAMPLED from a softmax over the scores (temperature 0.35), and since
// BOTH weapons keep firing at known relative rates under either
// emphasis (the de-emphasized one at 1/1.5x -- OgreScenario PATCH-B20),
// the marginal probability that an observed shot is weapon W is exact:
//   p(W) = sum_E pi(E) * rate_W(E) / sum_V rate_V(E)
// That is a true propensity for the observed-shot distribution, so IPS
// applies HONESTLY -- lifting v17's stated weight-1 asymmetry.
// v20 -- selection-mode A/B: "epsilon" (argmax + epsilon-uniform, the
// v4 path) vs "sampled" (softmax-sampled picks for ALL kaiju with a
// choice, the v19 king mechanism generalized). The hook said compare
// regret FIRST -- so this ships the comparison, not the switchover:
// kaiju-domain outcomes tally under whichever mode produced them
// (selection_stats.json, persisted across sessions), and the periodic
// report includes a z-tested verdict. HONESTY NOTE: what we measure is
// realized hit-rate difference between the two logging policies -- a
// REGRET PROXY, not true regret (which needs the counterfactual
// optimum nothing observes). Retire epsilon when the proxy says so.
const ATK_SELECT = (Deno.env.get("BRAIN_ATK_SELECT") ?? "epsilon") === "sampled" ? "sampled" : "epsilon";
const SELECT_PATH = _statePath("selection_stats.json");
// v2520 -- the session trace lands beside the brain's other state. One file per process: two brains on one box
// would otherwise interleave their decisions into one file and produce a session that never happened.
const TRACE_PATH = _statePath("session-" + (globalThis.Deno?.pid ?? 0) + ".jsonl");
if (traceEnabled()) { traceOpen(TRACE_PATH); console.log("[trace] BRAIN_TRACE=1 -- recording decisions to " + TRACE_PATH); }
// v21 -- PER-DOMAIN breakdown: the aggregate could mask a game where
// epsilon still wins (dungeon boss picks and kaiju melee live in very
// different feature regions). Old flat files migrate into the kaiju
// bucket -- that is where all v20 tallies actually came from.
const _emptySel = () => ({ kaiju: { n: 0, hits: 0 }, dungeon: { n: 0, hits: 0 }, raycaster: { n: 0, hits: 0 } });
let selectStats = { epsilon: _emptySel(), sampled: _emptySel() };
try {
    const j = JSON.parse(Deno.readTextFileSync(SELECT_PATH));
    for (const mode of ["epsilon", "sampled"]) {
        if (!j[mode]) continue;
        if (typeof j[mode].n === "number") { selectStats[mode].kaiju = { n: j[mode].n, hits: j[mode].hits ?? 0 }; }   // v20 flat shape
        else selectStats[mode] = { ..._emptySel(), ...j[mode] };
    }
} catch {}
function saveSelectStats() {
    try { Deno.writeTextFileSync(SELECT_PATH, JSON.stringify(selectStats)); } catch {}
}
// v2520 -- flush the trace whenever the brain saves its own state. The buffer holds 512 records; a brain that is
// killed mid-buffer would otherwise lose its last 511 decisions -- and the end of a session is exactly the part
// worth reading.
function traceTick() { try { traceFlush(); } catch {} }

function selectionVerdict() {
    const parts = [];
    for (const d of ["kaiju", "dungeon", "raycaster", "ev", "fps"]) {   // v21 -- per-domain
        const a = selectStats.sampled[d], b = selectStats.epsilon[d];
        if (!a || !b || a.n < 30 || b.n < 30) continue;
        const z = twoPropZ(a.hits, a.n, b.hits, b.n);
        const v = Math.abs(z) > 1.96 ? (z > 0 ? "SAMPLED winning" : "EPSILON winning") : "no significant difference yet";
        parts.push(`${d}: sampled ${Math.round(100 * a.hits / a.n)}% (n=${a.n}) vs epsilon ${Math.round(100 * b.hits / b.n)}% (n=${b.n}) -> ${v} (z=${z.toFixed(2)})`);
    }
    return parts.length ? "[brain] selection verdict (hit-rate proxy) -- " + parts.join("; ") : null;
}
// v21 -- the sampling temperature is finally a KNOB (T=0.35 was
// inherited from emphasis mode and never tuned), and picks now feed a
// T-SWEEP LOG rich enough for OFFLINE policy evaluation: each sampled
// pick's outcome records the full candidate score vector, the fired
// name, the logged propensity, and the reward -- so report time can
// SNIPS-estimate the value of ANY temperature from the same data,
// without running it live.
// v22 -- ACTING ON THE SWEEP. Precedence: an explicit BRAIN_ATK_T PINS
// the temperature (manual mode, auto-adoption disabled); otherwise the
// brain may adopt the sweep's starred T after BRAIN_ATK_T_AUTO_K
// consecutive agreeing reports with a real margin (>0.01 SNIPS over
// the running T) -- and only when BRAIN_ATK_T_AUTO=adopt, the human-
// approval gate. Default is SUGGEST: the brain says what it would do
// and waits for permission. Adopted T persists across restarts.
const T_ENV_PINNED = Deno.env.get("BRAIN_ATK_T") != null;
// v26 -- CONSOLE GATES. The bridge writes brain/gates.json; precedence
// is ENV > FILE > DEFAULT -- an explicit env var is the operator's
// hard setting and always wins over the console's soft setting. Re-read
// lazily with a 5s cache: decision points are report-frequency, the
// file is tiny, and a flipped button should not need a brain restart.
const GATES_PATH = _statePath("gates.json");
let _gatesCache = { at: 0, val: {} };
function gateValue(key, dflt, vals) {
    // v48 -- optional per-key value set (default stays suggest/adopt);
    // anything outside the set falls through to the next layer
    const V = vals || ["suggest", "adopt"];
    const env = Deno.env.get(key);
    if (env != null && V.includes(env)) return env;
    const now = Date.now();
    if (now - _gatesCache.at > 5000) {
        _gatesCache.at = now;
        try { _gatesCache.val = JSON.parse(Deno.readTextFileSync(GATES_PATH)); } catch { _gatesCache.val = {}; }
    }
    const v = _gatesCache.val[key];
    return V.includes(v) ? v : dflt;
}
const T_AUTO_DEFAULT = "suggest";
// v47 -- FLOAT GATE reader: same precedence (ENV > FILE > DEFAULT),
// same 5s cache as gateValue, numeric validation instead of the
// suggest/adopt coercion. Junk at any layer falls through to the next.
function gateNum(key, dflt, lo, hi) {
    const chk = (v) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
    const env = Deno.env.get(key);
    if (env != null) { const n = chk(env); if (n != null) return n; }
    const now = Date.now();
    if (now - _gatesCache.at > 5000) {
        _gatesCache.at = now;
        try { _gatesCache.val = JSON.parse(Deno.readTextFileSync(GATES_PATH)); } catch { _gatesCache.val = {}; }
    }
    const n = chk(_gatesCache.val[key]);
    return n != null ? n : dflt;
}
const T_AUTO_K = Math.max(1, Number(Deno.env.get("BRAIN_ATK_T_AUTO_K") ?? 3));
const SWEEP_STATE_PATH = _statePath("t_sweep_state.json");
let sweepState = { streakT: null, streak: 0, adoptedT: null,
                   dom: {} };   // v23 -- per-domain: { kaiju: {streakT, streak, adoptedT}, ... }
try { sweepState = { ...sweepState, ...JSON.parse(Deno.readTextFileSync(SWEEP_STATE_PATH)) }; } catch {}
let atkT = Math.max(0.05, Math.min(3, T_ENV_PINNED ? Number(Deno.env.get("BRAIN_ATK_T"))
                                                   : (sweepState.adoptedT ?? 0.35)));
function saveSweepState() { try { Deno.writeTextFileSync(SWEEP_STATE_PATH, JSON.stringify(sweepState)); } catch {} }
const SWEEP_PATH = _statePath("t_sweep_log.json");
let sweepLog = [];
try { sweepLog = JSON.parse(Deno.readTextFileSync(SWEEP_PATH)); } catch {}
let sweepDirty = 0;
function sweepAppend(rec) {
    sweepLog.push(rec);
    ringKeep(sweepLog, 5000);   // v30 -- hard ring, unified
    if (++sweepDirty >= 25) { sweepDirty = 0; try { Deno.writeTextFileSync(SWEEP_PATH, JSON.stringify(sweepLog)); } catch {} }
}
// SNIPS (self-normalized IPS): value(T) = sum(w_i * r_i) / sum(w_i),
// w_i = pi_T(a_i | scores_i) / p_logged_i. Self-normalization trades a
// little bias for a lot of variance -- the right call at these n.
function snipsValue(T, log) {
    let num = 0, den = 0;
    for (const e of log) {
        if (!e.scores || !e.p || e.p <= 0) continue;
        const names = Object.keys(e.scores);
        const exps = names.map(nm => Math.exp(e.scores[nm] / T));
        const Z = exps.reduce((a, b) => a + b, 0);
        const pT = exps[names.indexOf(e.fired)] / Z;
        if (!(pT > 0)) continue;
        const w = Math.min(10, pT / e.p);   // weight cap tames tails
        num += w * (e.hit ? 1 : 0); den += w;
    }
    return den > 0 ? num / den : null;
}
function sweepReport() {
    if (sweepLog.length < 300) return null;
    const grid = [0.2, 0.35, 0.5, 0.75, 1.0];
    // v26 -- ERA WINDOWING (the T ladder's probation). Honest analysis:
    // the ladder was already self-correcting -- adoption moves atkT, and
    // the streak/margin logic keeps comparing new stars against it, so
    // re-adoption and reversion both worked. What it lacked was a clean
    // window: the 5000-ring mixes pre- and post-adoption picks, so an
    // adopted T was being judged partly on data from the policy it
    // replaced. With an adoption in force, the maintenance grid runs on
    // POST-ADOPTION entries only (falling back to the full log until
    // 300 have accumulated).
    let evalLog = sweepLog;
    if (sweepState.adoptedT != null && sweepState.adoptedAt) {
        const post = sweepLog.filter(e => (e.ts ?? 0) >= sweepState.adoptedAt);
        if (post.length >= 300) evalLog = post;
    }
    const vals = grid.map(T => ({ T, v: snipsValue(T, evalLog) })).filter(x => x.v != null);
    if (!vals.length) return null;
    const best = vals.reduce((a, b) => (b.v > a.v ? b : a));
    let line = `[brain] T-sweep (SNIPS, n=${sweepLog.length}): ` +
        vals.map(x => `T=${x.T} -> ${x.v.toFixed(3)}${x.T === best.T ? "*" : ""}`).join(", ") +
        ` (running at T=${atkT})`;
    // v22 -- per-domain grids: the best kaiju T need not be the best
    // dungeon T (especially under the split); domains price separately
    // once they have 300 entries of their own.
    for (const d of ["kaiju", "dungeon", "raycaster", "ev", "fps"]) {
        let sub = sweepLog.filter(e => e.d === d);
        // v26 -- domain era window mirrors the global one
        const DS0 = sweepState.dom[d];
        if (DS0?.adoptedT != null && DS0.adoptedAt) {
            const postD = sub.filter(e => (e.ts ?? 0) >= DS0.adoptedAt);
            if (postD.length >= 300) sub = postD;
        }
        if (sub.length < 300) continue;
        const dv = grid.map(T => ({ T, v: snipsValue(T, sub) })).filter(x => x.v != null);
        if (!dv.length) continue;
        const db = dv.reduce((a, b) => (b.v > a.v ? b : a));
        line += ` | ${d} (n=${sub.length}): best T=${db.T} -> ${db.v.toFixed(3)}`;
        // v23 -- per-domain adoption: when a domain's own sweep DISAGREES
        // with the running temperature decisively (its own streak + its
        // own margin on its own subset), that domain gets its own T.
        // Same gates as the global ladder: pin, K-streak, margin, human.
        const DS = (sweepState.dom[d] = sweepState.dom[d] || { streakT: null, streak: 0, adoptedT: null });
        if (db.T === DS.streakT) DS.streak++;
        else { DS.streakT = db.T; DS.streak = 1; }
        const runningT = DS.adoptedT ?? atkT;
        const curD = dv.find(x => Math.abs(x.T - runningT) < 1e-9);
        const marginD = curD ? db.v - curD.v : Infinity;
        if (db.T !== runningT && DS.streak >= T_AUTO_K && marginD > 0.01) {
            if (T_ENV_PINNED) line += ` (would adopt for ${d}; pinned)`;
            else if (gateValue("BRAIN_ATK_T_AUTO", T_AUTO_DEFAULT) === "adopt") {
                DS.adoptedT = db.T; DS.streak = 0;
                DS.adoptedAt = Date.now();   // v26
                line += ` (ADOPTED for ${d})`;
            } else line += ` (suggests adopting for ${d}; gate closed)`;
        }
    }
    // v22 -- adoption ladder: streak of agreeing sweeps, margin gate,
    // env-pin gate, human-approval gate -- in that order.
    if (best.T === sweepState.streakT) sweepState.streak++;
    else { sweepState.streakT = best.T; sweepState.streak = 1; }
    const cur = vals.find(x => Math.abs(x.T - atkT) < 1e-9);
    const margin = cur ? best.v - cur.v : Infinity;
    if (best.T !== atkT && sweepState.streak >= T_AUTO_K && margin > 0.01) {
        if (T_ENV_PINNED) {
            line += ` -- would adopt T=${best.T} (${sweepState.streak} agreeing sweeps) but BRAIN_ATK_T pins it`;
        } else if (gateValue("BRAIN_ATK_T_AUTO", T_AUTO_DEFAULT) === "adopt") {
            atkT = best.T;
            sweepState.adoptedT = best.T; sweepState.streak = 0;
            sweepState.adoptedAt = Date.now();   // v26 -- era boundary
            line += ` -- ADOPTED T=${best.T} (${T_AUTO_K}+ agreeing sweeps, margin ${margin.toFixed(3)}); persists across restarts`;
        } else {
            line += ` -- suggests adopting T=${best.T} (${sweepState.streak} agreeing sweeps, margin ${margin.toFixed(3)}); set BRAIN_ATK_T_AUTO=adopt to allow`;
        }
    }
    // v27 -- ERA CHART data: each report appends its grid to
    // t_sweep_history.json (1000-ring), flagging reports where an
    // adoption fired so the chart can mark era boundaries.
    try {
        let hist27 = [];
        try { hist27 = JSON.parse(Deno.readTextFileSync(_statePath("t_sweep_history.json"))); } catch {}
        const entry = { ts: Date.now(), adopted: line.includes("ADOPTED") };
        for (const x of vals) entry["T" + x.T] = Math.round(x.v * 10000) / 10000;
        hist27.push(entry);
        // v28 -- COMPACTION instead of a hard ring: 1000 reports at
        // 500-outcome spacing is weeks of story, and a ring forgets the
        // oldest chapters first. When full, DOWNSAMPLE the older half --
        // keep every 2nd entry -- but NEVER drop an adoption-flagged
        // entry: the gold verticals are the plot; thinning may only take
        // the connective tissue between them.
        ringKeep(hist27, 1000, (e) => e.adopted);   // v30 -- unified wise-forgetting
        Deno.writeTextFileSync(_statePath("t_sweep_history.json"), JSON.stringify(hist27));
    } catch {}
    saveSweepState();
    return line;
}
const EMPH_T = 0.35;
const EMPH_SLOW = 1.5;   // must match PATCH-B20's de-emphasis multiplier
function emphasisShotProb(name, probs, intervals) {
    let p = 0;
    for (const E of Object.keys(probs)) {
        let rW = 0, rSum = 0;
        for (const V of Object.keys(intervals)) {
            const r = (1 / intervals[V]) * (V === E ? 1 : 1 / EMPH_SLOW);
            rSum += r;
            if (V === name) rW = r;
        }
        if (rSum > 0) p += probs[E] * (rW / rSum);
    }
    return p;
}   // kaijuId -> { name, explore, n }
// v9 -- BRAIN_RESET=1: archive current weights, re-distill from the hand
// priors, KEEP replay buffers (fresh mind, remembered experience).
const RESET = Deno.env.get("BRAIN_RESET") === "1";
// v7 -- experience sharing between policy brains (through the mailbox)
const SHARE = Deno.env.get("BRAIN_SHARE") === "1";
const INSTANCE = "brain-" + Math.random().toString(36).slice(2, 8);
let shareCursor = 0;
// v7 -- learning milestones -> /sys/logs (BRAIN_NARRATE=ollama embellishes)
const NARRATE = (Deno.env.get("BRAIN_NARRATE") || "template").toLowerCase();
const watcher = new MilestoneWatcher();
// v7 -- periodic weight snapshots (before/after portfolio artifacts)
const SNAP_EVERY = 500;
let lastSnapStep = 0;
const REPLAY_PATH   = _statePath("replay_buffers.json");
const civDefTrainer = new OnlineTrainer({ lr: Number(Deno.env.get("BRAIN_LR") ?? 0.02), minBuffer: 12 });
let civDefW = null;
const civTgtTrainer = new OnlineTrainer({ lr: Number(Deno.env.get("BRAIN_LR") ?? 0.02), minBuffer: 12 });
civDefTrainer.ipsCap = IPS_CAP;
const packOrdTrainer = new OnlineTrainer({ lr: Number(Deno.env.get("BRAIN_LR") ?? 0.02), minBuffer: 8 });
packOrdTrainer.ipsCap = IPS_CAP;
let packOrdW = null;
let civTgtW = null;
const CIVDEF_NOISE = Math.max(0, Math.min(0.5, Number(Deno.env.get("BRAIN_CIVDEF_EPSILON") ?? 0.06)));
// v5 -- split-brain roles: "all" (default) | "fields" (nav+threat only)
// | "policy" (aggro+attack only). Two processes on two machines POST
// partial payloads; the bridge merges them (PATCH-B1b).
const ROLE = (Deno.env.get("BRAIN_ROLE") || "all").toLowerCase();
// v2073 -- Phase A: BRAIN_BACKEND=cpu runs the flow-field solver on the
// CPU (exact Dijkstra) and NEEDS NO GPU. The attack/aggro POLICY is a GPU
// MLP, so a CPU brain is fields-only by construction -- we force ROLE to
// fields when backend=cpu rather than let policy silently no-op. This is
// the "slower resource absorbs the simpler navigation work" piece: point
// a CPU brain at the bridge and it joins the fleet as a fields solver,
// freeing a GPU brain for policy / high-value work.
const BACKEND = (Deno.env.get("BRAIN_BACKEND") || "gpu").toLowerCase();
const CPU_FIELDS = BACKEND === "cpu";
// v2074 -- Phase C: role can be reassigned live by the scheduler, so it is
// a let, not a const. DO_FIELDS/DO_POLICY are recomputed whenever it
// changes. A CPU brain is PINNED to fields (it cannot run the GPU MLP), so
// scheduler assignments to "policy" are refused for CPU backends.
let EFFECTIVE_ROLE = CPU_FIELDS ? "fields" : ROLE;
let DO_FIELDS = EFFECTIVE_ROLE !== "policy";
let DO_POLICY = EFFECTIVE_ROLE !== "fields";
const SCHED_OPTIN = Deno.env.get("BRAIN_SCHED") === "1";   // consent to be scheduled
// v2186 -- QUADRANT PACKING, opt-in via BRAIN_QUADRANTS=1.
// The brain runs up to three INDEPENDENT solves per tick on the same grid --
// nav (snap.goals), player-seek (the player cell), threat (kaiju cells). They
// differ only in their seeds, which is exactly the shape QuadrantScheduler
// packs: one atlas, one relaxation loop, one readback.
//
// Off by default, and for two honest reasons:
//   1. CORRECTNESS. Packing is exact ONLY when the snapshot declares
//      impassDh > 0. The gutters that isolate quadrants are enforced by the
//      solver's impassable-edge filter, which is itself gated on impassDh > 0
//      (flowfieldCpu._relax / k_cost). With the game terrain's default
//      impassDh = 0 the filter is a no-op, relaxation walks straight across a
//      gutter, and the quadrants bleed into one another. We refuse to pack in
//      that case rather than publish a silently wrong field. We do NOT invent
//      an impassDh to force packing: that would make intra-task walls
//      impassable too, so the packed field would no longer match a separate
//      solve -- the very equivalence the feature rests on.
//   2. IT IS A GPU WIN, NOT A CPU ONE. The payoff is amortizing the GPU's
//      ~30ms fixed submit+readback across three tasks instead of paying it
//      three times. The default field backend is the exact CPU Dijkstra
//      (v2156, benchmarked ~50x faster), whose cost scales with cells: a 2x2
//      atlas holding 3 tasks is ~4x the cells, so packing there is at best a
//      wash. Pair BRAIN_QUADRANTS=1 with BRAIN_FIELD_SOLVER=gpu.
const QUADRANTS = Deno.env.get("BRAIN_QUADRANTS") === "1";
// v2187 -- PIPELINED READBACK, opt-in via BRAIN_FIELD_PIPELINE=1 (GPU solver only).
// Takes the ~29.7ms mapAsync stall off the critical path by returning the PREVIOUS
// tick's field while this tick's runs. Unlike quadrant packing, the win does not
// shrink as the grid grows -- it removes the fixed cost rather than dividing it.
//
// The cost is one snapshot of latency, and it is not free everywhere:
//   · nav / player flow -- fine. The field already trails the snapshot it was built
//     from; one more tick of trail is invisible to a kaiju descending a gradient.
//   · threat -- feeds the aggro/civdef POLICIES. A stale threat grid pairs this
//     tick's features with last tick's danger, which is a (small) label-noise source
//     for the online trainers. Enable with that in mind, or run it on a fields-role
//     brain where no policy consumes it.
// Meaningless for the CPU solver (exact, synchronous, no stall to hide), so it is
// ignored there.
const FIELD_PIPELINE = Deno.env.get("BRAIN_FIELD_PIPELINE") === "1";
// v2187 -- FEED-FORWARD ITERATION COUNT (GPU solver only). ON by default: it sizes
// each solve's relaxation loop from how many sweeps the LAST solve actually needed,
// read back for free on the existing readback. The default cap is the old fixed
// heuristic, so it can only SHRINK the loop below today's count (a speed win on
// terrain that converges early) -- never grow past it, so the field is never less
// converged than today. This half runs automatically; it is not a dormant switch.
//   · BRAIN_FIELD_ITER_FIXED=1 -- restore the rigid ceil(max(w,h)*1.7), no tracking.
//   · BRAIN_FIELD_ITER_CAP=<mult> -- raise the cap to mult*max(w,h). This is the
//     OPT-IN half: it lets the loop grow past the heuristic so a maze whose geodesic
//     is longer than its diameter can actually CONVERGE (the likely fix for the
//     bench's ~40deg mean flow error), trading solve time for accuracy. Default mult
//     is the heuristic's 1.7 (i.e. cap = today's count).
const FIELD_ITER_FIXED = Deno.env.get("BRAIN_FIELD_ITER_FIXED") === "1";
const FIELD_ITER_CAP_MULT = Number(Deno.env.get("BRAIN_FIELD_ITER_CAP")) || 0;   // 0 => default (heuristic)
function applyRole(newRole) {
    if (!newRole || newRole === EFFECTIVE_ROLE) return false;
    if (CPU_FIELDS && newRole !== "fields") return false;   // CPU cannot do policy
    if (newRole !== "fields" && newRole !== "policy" && newRole !== "all") return false;
    EFFECTIVE_ROLE = newRole;
    DO_FIELDS = EFFECTIVE_ROLE !== "policy";
    DO_POLICY = EFFECTIVE_ROLE !== "fields";
    console.log(`[brain] SCHEDULER reassigned role -> ${EFFECTIVE_ROLE} (applied at safe boundary)`);
    return true;
}
let lastSnapTs = 0;

async function tick(device) {
    // 1. pull the latest snapshot the browser published
    let snap;
    try {
        const r = await fetch(BRIDGE + "/ai/brain/snapshot");
        const j = await r.json();
        snap = j && j.ok ? j.snapshot : null;
        // v48 -- BIAS A/B ingest + verdict: per-SET randomized pirate
        // thumb (the set is the natural unit -- coin at set start,
        // outcome = who took the set). Two-proportion z on pirate win
        // rates at 10+ sets per arm; |z| > 1.96 declares.
        if (snap && snap.src === "ev" && Array.isArray(snap.biasSets) && snap.biasSets.length) {
            for (const bs of snap.biasSets) {
                if ((bs.arm === "on" || bs.arm === "off") && (bs.pirateWon === true || bs.pirateWon === false))
                    biasAB[bs.arm].push({ w: bs.pirateWon ? 1 : 0, ts: Date.now() });
            }
            ringKeep(biasAB.on, 200); ringKeep(biasAB.off, 200);
            try { Deno.writeTextFileSync(BIAS_AB_PATH, JSON.stringify(biasAB)); } catch {}
            if (biasAB.on.length >= 10 && biasAB.off.length >= 10 && biasAB.on.length + biasAB.off.length >= biasABReportAt) {
                biasABReportAt = biasAB.on.length + biasAB.off.length + 6;
                const p1 = biasAB.on.reduce((s, e) => s + e.w, 0) / biasAB.on.length;
                const p0 = biasAB.off.reduce((s, e) => s + e.w, 0) / biasAB.off.length;
                const n1 = biasAB.on.length, n0 = biasAB.off.length;
                const pp = (p1 * n1 + p0 * n0) / (n1 + n0);
                const se = Math.sqrt(pp * (1 - pp) * (1 / n1 + 1 / n0));
                const z48 = se > 0 ? (p1 - p0) / se : 0;
                const v48 = Math.abs(z48) > 1.96 ? (z48 > 0 ? "the thumb WORKS (pirates take more sets)" : "the thumb BACKFIRES") : "no significant effect yet";
                // v49 -- MAGNITUDE LADDER: dose-finding by down-titration.
                // A WORKS verdict shrinks the served thumb 0.05 (floor
                // 0.05) hunting the minimal effective dose; a non-detection
                // AFTER a shrink -- at the SAME evidence bar, so power is
                // symmetric across steps -- steps back up and HOLDS: the
                // last working dose is the answer. Arms reset on every
                // magnitude change (era hygiene, as always). Gated by
                // BRAIN_BIAS_MAG_AUTO. Honest limit stated: "not detected
                // at this n" is the step-back trigger, not proof of no
                // effect -- the design accepts that asymmetry because the
                // cost of a too-small thumb is one era of data, not a
                // wrong conclusion carved anywhere.
                if (gateValue("BRAIN_BIAS_MAG_AUTO", "suggest") === "adopt") {
                    const B = biasABMagState;
                    // (v49 fix, caught by the walk: the original reconstructed
                    // lastShrunkFrom as mag+0.05 -- 0.1+0.05 is
                    // 0.15000000000000002 in IEEE and the <=0.15 guard went
                    // false. Record the working dose IN the shrink branch,
                    // where it is sitting right there; never rebuild floats.)
                    if (Math.abs(z48) > 1.96 && z48 > 0 && !B.found) {
                        if (B.mag > 0.05) {
                            B.lastShrunkFrom = B.mag;   // the dose that just proved itself
                            const nm = Math.round((B.mag - 0.05) * 100) / 100;
                            reportMilestone(BRIDGE, `[brain] bias magnitude ladder: ${B.mag} works -- titrating DOWN to ${nm}; arms reset`, NARRATE === "ollama");
                            magEvent("shrink", nm);   // v51
                            B.mag = nm;
                            biasAB = { on: [], off: [] }; biasABReportAt = 20;
                            try { Deno.writeTextFileSync(BIAS_AB_PATH, JSON.stringify(biasAB)); } catch {}
                        } else {
                            B.found = B.mag;
                            reportMilestone(BRIDGE, `[brain] bias magnitude ladder: ${B.mag} works at the floor -- minimal dose is ${B.mag}`, NARRATE === "ollama");
                            magEvent("floor", B.mag);   // v51
                        }
                    } else if (B.found != null) {
                        // v50 -- MINIMAL-DOSE DRIFT WATCH: a found dose stays
                        // on PROBATION against the live control -- the off
                        // arm keeps randomizing, so the baseline is not a
                        // snapshot but the running experiment itself. Three
                        // consecutive non-significant contrasts at 20+ sets
                        // per arm re-open the ladder: found cleared, mag
                        // held at the found value, arms reset. Honest
                        // scope: this watch only breathes while ?biasab=1
                        // keeps flipping coins -- no experiment, no probation.
                        if (n1 >= 20 && n0 >= 20) {
                            if (Math.abs(z48) <= 1.96) B.driftStreak = (B.driftStreak || 0) + 1;
                            else B.driftStreak = 0;
                            if (B.driftStreak >= 3) {
                                reportMilestone(BRIDGE, `[brain] minimal dose ${B.found} DRIFTED (3 non-significant contrasts vs live control at matched n); ladder re-opened at mag=${B.found}`, NARRATE === "ollama");
                                magEvent("reopen", B.found);   // v51
                                B.found = null; B.lastShrunkFrom = null; B.driftStreak = 0;
                                biasAB = { on: [], off: [] }; biasABReportAt = 20;
                                try { Deno.writeTextFileSync(BIAS_AB_PATH, JSON.stringify(biasAB)); } catch {}
                            }
                        }
                    } else if (Math.abs(z48) <= 1.96 && B.lastShrunkFrom != null && !B.found) {
                        B.found = B.lastShrunkFrom;
                        B.mag = B.lastShrunkFrom;
                        reportMilestone(BRIDGE, `[brain] bias magnitude ladder: ${B.mag} not detected at matched n -- stepping back; MINIMAL EFFECTIVE DOSE = ${B.found}`, NARRATE === "ollama");
                        magEvent("med", B.found);   // v51
                        biasAB = { on: [], off: [] }; biasABReportAt = 20;
                        try { Deno.writeTextFileSync(BIAS_AB_PATH, JSON.stringify(biasAB)); } catch {}
                    }
                    try { Deno.writeTextFileSync(BIAS_MAG_PATH, JSON.stringify(B)); } catch {}
                }
                reportMilestone(BRIDGE, `[brain] pirate-bias A/B (randomized per set): win rate ${(p1 * 100).toFixed(0)}% biased (n=${n1}) vs ${(p0 * 100).toFixed(0)}% clean (n=${n0}) -> ${v48} (z=${z48.toFixed(2)})`, NARRATE === "ollama");
            }
        }
        // v43 -- ESCORT EFFECTIVENESS ingest: cumulative page counters
        // land in escort_stats.json; every 5 escort-minutes of new
        // exposure, report both piracy rates WITH THE CONFOUNDING STATED:
        // escorts exist because piracy spiked, so the arms are not
        // randomized and the naive comparison is biased AGAINST escorts
        // -- a rate ratio near 1 under that bias is already evidence
        // they work. A randomized threshold test is the honest next
        // step, named, not built.
        if (snap && snap.src === "ev" && snap.escortStats) {
            const es = snap.escortStats;
            if (es.escortS >= 0 && es.calmS >= 0) {
                escortAgg = es;   // cumulative from page start; latest wins
                try { Deno.writeTextFileSync(ESCORT_PATH, JSON.stringify(escortAgg)); } catch {}
                if (es.escortS - escortReportAtS >= 300) {
                    escortReportAtS = es.escortS;
                    const rE = es.piratedEscort / Math.max(1 / 60, es.escortS / 60);
                    const rC = es.piratedCalm / Math.max(1 / 60, es.calmS / 60);
                    reportMilestone(BRIDGE, `[brain] escort effectiveness (OBSERVATIONAL -- escorts deploy exactly when piracy is hot, so this comparison is biased against them): ` +
                        `${rE.toFixed(2)} pirated/min under escort (${(es.escortS / 60).toFixed(0)}min) vs ${rC.toFixed(2)} calm (${(es.calmS / 60).toFixed(0)}min); ` +
                        `ratio ${(rE / Math.max(1e-9, rC)).toFixed(2)} -- near-1 under this bias already favors escorts; randomized-threshold test is the honest next step`, NARRATE === "ollama");
                }
            }
        }
        // v44 -- ESCORT A/B ingest + UNBIASED verdict: randomized
        // episodes land per arm (escort_ab.json, 200-ring each); at 20+
        // per arm, Welch on per-episode rates -- the coin at episode
        // start is what makes this comparison honest where v43's could
        // only confess. Direction: lo = escorts earlier; rate_lo
        // significantly BELOW rate_hi = earlier escorts cut piracy.
        if (snap && snap.src === "ev" && Array.isArray(snap.escortEpisodes) && snap.escortEpisodes.length) {
            for (const ep of snap.escortEpisodes) {
                if ((ep.arm === "lo" || ep.arm === "hi") && ep.durS >= 10)
                    escortAB[ep.arm].push({ durS: ep.durS, pirated: ep.pirated | 0, ts: Date.now(),
                        ...(Array.isArray(ep.bySys) && ep.bySys.length === 6 ? { bySys: ep.bySys } : {}) });   // v51 -- secondary readout
            }
            ringKeep(escortAB.lo, 200); ringKeep(escortAB.hi, 200);
            try { Deno.writeTextFileSync(ESCORT_AB_PATH, JSON.stringify(escortAB)); } catch {}
            if (escortAB.lo.length >= 20 && escortAB.hi.length >= 20 && escortAB.lo.length + escortAB.hi.length >= escortABReportAt) {
                escortABReportAt = escortAB.lo.length + escortAB.hi.length + 10;
                const rates = a => escortAB[a].map(e => e.pirated / (e.durS / 60));
                const rl = rates("lo"), rh = rates("hi");
                const tv44 = welchT(rl, rh);
                const mean = x => x.reduce((s, v) => s + v, 0) / x.length;
                const verdict44 = Math.abs(tv44) > 2.0
                    ? (tv44 < 0 ? "EARLIER ESCORTS CUT PIRACY" : "earlier escorts are NOT helping (later arm cleaner)")
                    : "no significant difference yet";
                // v46 -- INTERCEPT DRIFT WATCH: a nudged base on the
                // promoted-theta probation. Post = POOLED post-nudge episode
                // rates (the jitter is a symmetric coin, so pooling both arms
                // is fair -- they sample the same new base); baseline = the
                // winning arm's rates at nudge time. Direction INVERTS from
                // the theta watches: piracy rates go UP when things get
                // worse, so drift = Welch(post, baseline) t > +2, raw and
                // trimmed agreeing (v36). Three agreed-worse reports step
                // the base BACK to prevBaseTh through the same gate.
                if (escortThState.prevBaseTh != null && Array.isArray(escortThState.baselineArr) && escortThState.baselineArr.length >= 10) {
                    const pooled = rl.concat(rh);
                    if (pooled.length >= 20) {
                        const p20 = pooled.slice(-40);
                        const tvI = welchT(p20, escortThState.baselineArr);
                        const pTr46 = madTrim(p20), bTr46 = madTrim(escortThState.baselineArr);
                        const tvIT = (pTr46.length >= 10 && bTr46.length >= 10) ? welchT(pTr46, bTr46) : null;
                        const worse46 = tvIT == null ? tvI > 2.0 : (tvI > 2.0 && tvIT > 2.0);
                        if (tvI > 2.0 && tvIT != null && tvIT <= 2.0)
                            reportMilestone(BRIDGE, `[brain] intercept drift: raw t=${tvI.toFixed(2)} vs trimmed t=${tvIT.toFixed(2)} DISAGREE; streak withheld`, NARRATE === "ollama");
                        if (worse46) escortThState.driftStreak = (escortThState.driftStreak || 0) + 1;
                        else escortThState.driftStreak = 0;
                        if (escortThState.driftStreak >= 3) {
                            if (gateValue("BRAIN_ESCORT_AUTO", "suggest") === "adopt") {
                                reportMilestone(BRIDGE, `[brain] nudged intercept ${escortThState.baseTh.toFixed(2)} DRIFTED (piracy up vs the evidence that earned it); stepping back to ${escortThState.prevBaseTh.toFixed(2)}`, NARRATE === "ollama");
                                escortThState.baseTh = escortThState.prevBaseTh;
                                escortThState.prevBaseTh = null; escortThState.baselineArr = null; escortThState.driftStreak = 0;
                                escortAB = { lo: [], hi: [] }; escortABReportAt = 40;
                                try { Deno.writeTextFileSync(ESCORT_AB_PATH, JSON.stringify(escortAB)); } catch {}
                            } else {
                                escortThState.driftStreak = 0;
                                reportMilestone(BRIDGE, `[brain] nudged intercept looks DRIFTED; suggests stepping back -- gate: BRAIN_ESCORT_AUTO=adopt`, NARRATE === "ollama");
                            }
                        }
                    }
                }
                // v48 -- GATED CO-PRIMARY: BRAIN_ESCORT_COPRIMARY=on promotes
                // duration from reported-only to a real endpoint -- done
                // PROPERLY: Bonferroni splits alpha across the two, so each
                // bar rises 2.0 -> 2.24. A verdict is then decisive if
                // EITHER endpoint clears ITS bar with raw/trimmed agreement
                // (duration direction: shorter fights under lo = t < -2.24
                // counts as earlier-wins). The tradeoff is stated: two
                // chances to win, but each is harder -- that is the price
                // of not p-hacking. Off (default) = v46 rate-only at 2.0.
                const COPRIM = gateValue("BRAIN_ESCORT_COPRIMARY", "off", ["off", "on"]) === "on";
                const BAR = COPRIM ? 2.24 : 2.0;
                let coDir = 0;
                if (COPRIM && Math.abs(tvDur) > BAR) {
                    const dlTr = madTrim(dl), dhTr = madTrim(dh);
                    const tvDurT = (dlTr.length >= 10 && dhTr.length >= 10) ? welchT(dlTr, dhTr) : null;
                    if (tvDurT == null || (Math.abs(tvDurT) > BAR && Math.sign(tvDurT) === Math.sign(tvDur)))
                        coDir = tvDur < 0 ? -1 : 1;
                }
                // v45 -- the intercept LEARNS: the ladder pattern on the
                // randomized verdicts. Signed streak (down = earlier wins,
                // up = later wins); 3 consecutive same-direction decisive
                // verdicts + the BRAIN_ESCORT_AUTO gate nudge baseTh 0.15
                // that way, clamped [1.0, 2.0] -- and the ARMS RESET: old
                // episodes measured jitter around the OLD base; mixing eras
                // would poison the experiment that earned the nudge.
                let ladder45 = "";
                const rateDecisive = Math.abs(tv44) > BAR;
                if (rateDecisive || coDir !== 0) {
                    // rate wins ties on direction (primary among equals)
                    const dir45 = rateDecisive ? (tv44 < 0 ? -1 : 1) : coDir;
                    escortThState.streak = (Math.sign(escortThState.streak) === dir45) ? escortThState.streak + dir45 : dir45;
                    if (Math.abs(escortThState.streak) >= 3) {
                        if (gateValue("BRAIN_ESCORT_AUTO", "suggest") === "adopt") {
                            const nb = Math.max(1.0, Math.min(2.0, escortThState.baseTh + 0.15 * dir45));
                            ladder45 = nb === escortThState.baseTh
                                ? ` -- intercept already at the ${dir45 < 0 ? "1.0 floor" : "2.0 ceiling"}; holding`
                                : ` -- INTERCEPT NUDGED ${escortThState.baseTh.toFixed(2)} -> ${nb.toFixed(2)}; arms reset for the new era`;
                            // v46 -- INTERCEPT DRIFT baseline (the promoted-theta
                            // stencil): keep the WINNING arm's rates -- the
                            // evidence that earned this nudge -- plus the base we
                            // left, so a drifted nudge can step back home.
                            if (nb !== escortThState.baseTh) {
                                escortThState.baselineArr = (dir45 < 0 ? rl : rh).slice(-200);
                                escortThState.prevBaseTh = escortThState.baseTh;
                                escortThState.driftStreak = 0;
                            }
                            escortThState.baseTh = nb; escortThState.streak = 0;
                            escortAB = { lo: [], hi: [] }; escortABReportAt = 40;
                            try { Deno.writeTextFileSync(ESCORT_AB_PATH, JSON.stringify(escortAB)); } catch {}
                        } else {
                            ladder45 = ` -- 3 verdicts agree (${dir45 < 0 ? "earlier" : "later"}); gate: BRAIN_ESCORT_AUTO=adopt to nudge the intercept`;
                        }
                    } else ladder45 = ` -- streak ${escortThState.streak}`;
                } else escortThState.streak = 0;
                try { Deno.writeTextFileSync(ESCORT_TH_STATE_PATH, JSON.stringify(escortThState)); } catch {}
                // v46 -- episode LENGTH, the secondary endpoint: reported,
                // never acted on. Escorts may shorten fights even when
                // piracy rates tie -- worth seeing. But only the rate feeds
                // the intercept ladder: acting on two endpoints without
                // multiplicity correction is p-hacking with extra steps,
                // and this system does not do that quietly.
                const dl = escortAB.lo.map(e => e.durS), dh = escortAB.hi.map(e => e.durS);
                const tvDur = welchT(dl, dh);
                const durNote = ` | episode length: lo ${mean(dl).toFixed(0)}s vs hi ${mean(dh).toFixed(0)}s (t=${tvDur.toFixed(2)}; secondary endpoint, reported not acted on)`;
                // v47 -- both endpoints get a diary: {ts, tRate, tDur, n}
                // per report (500-ring) so the era chart can show whether
                // the two stories ever diverge -- rates tying while
                // durations separate is exactly the pattern worth seeing.
                try {
                    let abh = [];
                    try { abh = JSON.parse(Deno.readTextFileSync(ESCORT_AB_HIST_PATH)); } catch {}
                    abh.push({ ts: Date.now(), tRate: Math.round(tv44 * 100) / 100, tDur: Math.round(tvDur * 100) / 100, nLo: rl.length, nHi: rh.length });
                    ringKeep(abh, 500);
                    Deno.writeTextFileSync(ESCORT_AB_HIST_PATH, JSON.stringify(abh));
                } catch {}
                reportMilestone(BRIDGE, `[brain] escort threshold A/B (RANDOMIZED -- the honest one): ` +
                    `lo ${mean(rl).toFixed(2)}/min (n=${rl.length}) vs hi ${mean(rh).toFixed(2)}/min (n=${rh.length}) -> ${verdict44} (Welch t=${tv44.toFixed(2)}, base=${escortThState.baseTh.toFixed(2)})${durNote}${ladder45}`, NARRATE === "ollama");
            }
        }
        // v43 -- SERVED ESCORT THRESHOLD: the brain sees pirated
        // fractions; a hot economy lowers the tripwire (escorts sortie
        // earlier), a quiet one raises it (no navy for a calm sea).
        // Linear in recent pirated fraction, clamped [0.8, 2.5].
        if (tradeLog.length >= 50) {
            const recent43 = tradeLog.slice(-200);
            const pf = recent43.filter(e => e.pirated).length / recent43.length;
            escortThresholdServed = Math.max(0.8, Math.min(2.5, escortThState.baseTh * (1 - 2 * (pf - 0.1))));   // v45 -- learned intercept
            // v48 -- PER-SYSTEM thresholds: the same learned-intercept
            // curve on six LOCAL pirated fractions. A system with fewer
            // than 15 sys-tagged legs falls back to the global fraction --
            // a tripwire tuned on three data points is a coin toss wearing
            // a uniform. Untagged legacy entries feed only the global.
            escortThresholdsBySys = [];
            for (let si = 0; si < 6; si++) {
                const legs = recent43.filter(e => e.sys === si);
                const lf = legs.length >= 15 ? legs.filter(e => e.pirated).length / legs.length : pf;
                escortThresholdsBySys.push(Math.round(Math.max(0.8, Math.min(2.5, escortThState.baseTh * (1 - 2 * (lf - 0.1)))) * 100) / 100);
            }
            // v44 -- the tripwire's diary: {ts, th, pf} at most once a
            // minute; the era chart draws the pair
            if (Date.now() - escortThHistAt > 60000) {
                escortThHistAt = Date.now();
                escortThHist.push({ ts: Date.now(), th: Math.round(escortThresholdServed * 100) / 100, pf: Math.round(pf * 1000) / 1000,
                                    bySys: escortThresholdsBySys });   // v49 -- the sparkline's food
                ringKeep(escortThHist, 1000);
                try { Deno.writeTextFileSync(ESCORT_TH_HIST_PATH, JSON.stringify(escortThHist)); } catch {}
            }
        }
        // v40 -- EV TELEMETRY: the rc pattern (60s-gap segmentation) on
        // the ev snapshot's published player {hp, acc}; closed sessions
        // land in difficulty_telemetry.json with dom:"ev", so the v24
        // correlation pass and the CSV export see them for free.
        if (snap && snap.src === "ev" && snap.player) {
            const now40 = Date.now();
            if (evSession.at && now40 - evSession.at > 60000) {
                const durS = Math.round((evSession.at - evSession.start) / 1000);
                if (durS >= 15 && evSession.n >= 3) {
                    try {
                        let h = JSON.parse(Deno.readTextFileSync(TELEM_PATH));
                        h.push({ ts: evSession.start, dom: "ev", durS,
                                 hpMidband: evSession.hpMid / Math.max(1, evSession.n),
                                 playerAcc: evSession.accLast });
                        ringKeep(h, 500);
                        Deno.writeTextFileSync(TELEM_PATH, JSON.stringify(h));
                        // v51/v52 -- the same close feeds the REGIME hp
                        // buckets, now per-domain (see regimeHpPush).
                        regimeHpPush("ev", Math.round(100 * evSession.hpMid / Math.max(1, evSession.n)) / 100);
                    } catch {}
                }
                evSession = { start: now40, at: 0, n: 0, hpMid: 0, accLast: 0 };
            }
            if (!evSession.start) evSession.start = now40;
            evSession.at = now40; evSession.n++;
            const hp40 = Number(snap.player.hp);
            if (hp40 >= 0.25 && hp40 <= 0.75) evSession.hpMid++;
            if (snap.player.acc != null) evSession.accLast = Number(snap.player.acc);
        }
        // v40 -- TRADING EPISODES: a new episode type, not a bent combat
        // one (a margin is a scalar reward, not a hit boolean -- reusing
        // the attack map would have lied about semantics). EV freighters
        // report {scores, pIdx, p, margin}; entries ring in
        // trade_log.json; at 300+ a SNIPS grid prices TRADER BOLDNESS
        // (softmax temperature over expected-margin scores) exactly the
        // way attack T is priced -- snipsValue already takes scalar
        // rewards, propensities are what they are.
        if (snap && Array.isArray(snap.trades) && snap.trades.length) {
            for (const tr of snap.trades) {
                if (!Array.isArray(tr.scores) || tr.pIdx == null || !(tr.p > 0) || typeof tr.margin !== "number") continue;
                tradeLog.push({ scores: tr.scores, pIdx: tr.pIdx, p: tr.p, margin: tr.margin, ts: Date.now(),
                                ...(tr.pirated ? { pirated: true } : {}),
                                ...(Number.isInteger(tr.sys) ? { sys: tr.sys } : {}) });   // v48 -- where the leg ended (or died)
            }
            ringKeep(tradeLog, 5000);
            tradeDirty = true;
            if (tradeLog.length >= 300 && tradeLog.length >= tradeReportAt) {
                tradeReportAt = tradeLog.length + 150;
                const grid = [0.2, 0.35, 0.5, 0.75, 1.0];
                const vals = grid.map(T => {
                    // SNIPS over softmax-at-T propensities, margin as reward
                    let num = 0, den = 0;
                    for (const e of tradeLog) {
                        const mx = Math.max(...e.scores);
                        const ex = e.scores.map(s => Math.exp((s - mx) / T));
                        const Z = ex.reduce((a, b) => a + b, 0);
                        const pT = ex[e.pIdx] / Z;
                        const w = Math.min(10, pT / e.p);
                        num += w * e.margin; den += w;
                    }
                    return { T, v: den > 0 ? num / den : null };
                }).filter(x => x.v != null);
                if (vals.length) {
                    const best = vals.reduce((a, b) => b.v > a.v ? b : a);
                    // v41 -- TRADE LADDER: K agreeing sweeps starring the same
                    // T, RELATIVE margin over the running T (margins are in
                    // world units, so absolute thresholds would drift with
                    // the economy -- 2% relative does not), era-windowed
                    // post-adoption (the v26 lesson arrives pre-paid: entries
                    // carried ts from birth), gated by BRAIN_TRADE_T_AUTO
                    // through the same gates.json the console flips.
                    let evalVals = vals;
                    if (tradeState.adoptedT != null && tradeState.adoptedAt) {
                        const post = tradeLog.filter(e => (e.ts ?? 0) >= tradeState.adoptedAt);
                        if (post.length >= 300) {
                            evalVals = [0.2, 0.35, 0.5, 0.75, 1.0].map(T => {
                                let num = 0, den = 0;
                                for (const e of post) {
                                    const mx = Math.max(...e.scores);
                                    const ex = e.scores.map(s => Math.exp((s - mx) / T));
                                    const Z = ex.reduce((a, b) => a + b, 0);
                                    const pT = ex[e.pIdx] / Z;
                                    const w = Math.min(10, pT / e.p);
                                    num += w * e.margin; den += w;
                                }
                                return { T, v: den > 0 ? num / den : null };
                            }).filter(x => x.v != null);
                        }
                    }
                    // v42 -- TRADE DRIFT WATCH: adopted boldness on the same
                    // probation promoted thetas got. Post-adoption margins
                    // accumulate; the last 100 Welch-test against the
                    // adoption baseline, ONE-SIDED worse, raw AND trimmed
                    // agreeing (the v36 rule verbatim); 3 consecutive
                    // agreed-worse sweeps re-open through the gate: adoption
                    // cleared, serving falls back to 0.5, the streak
                    // machinery re-arms. No warm restart here -- T is a
                    // discrete grid; there is no neighborhood to resume from.
                    if (tradeState.adoptedT != null && Array.isArray(tradeState.baselineArr) && tradeState.baselineArr.length >= 20) {
                        tradeState.post = tradeLog.filter(e => (e.ts ?? 0) >= tradeState.adoptedAt).slice(-200).map(e => e.margin);
                        if (tradeState.post.length >= 100) {
                            const p100 = tradeState.post.slice(-100);
                            const tvD = welchT(p100, tradeState.baselineArr);
                            const pTr = madTrim(p100), bTr = madTrim(tradeState.baselineArr);
                            const tvDT = (pTr.length >= 10 && bTr.length >= 10) ? welchT(pTr, bTr) : null;
                            const worse = tvDT == null ? tvD < -2.0 : (tvD < -2.0 && tvDT < -2.0);
                            if (tvD < -2.0 && tvDT != null && tvDT >= -2.0)
                                reportMilestone(BRIDGE, `[brain] trade drift: raw t=${tvD.toFixed(2)} vs trimmed t=${tvDT.toFixed(2)} DISAGREE; streak withheld`, NARRATE === "ollama");
                            if (worse) tradeState.driftStreak = (tradeState.driftStreak || 0) + 1;
                            else tradeState.driftStreak = 0;
                            if (tradeState.driftStreak >= 3) {
                                if (gateValue("BRAIN_TRADE_T_AUTO", "suggest") === "adopt") {
                                    reportMilestone(BRIDGE, `[brain] adopted trade T=${tradeState.adoptedT} DRIFTED (3 agreed-worse sweeps vs adoption baseline); re-opened, serving default 0.5`, NARRATE === "ollama");
                                    tradeState.adoptedT = null; tradeState.adoptedAt = null;
                                    tradeState.baselineArr = null; tradeState.post = []; tradeState.driftStreak = 0;
                                } else {
                                    tradeState.driftStreak = 0;
                                    reportMilestone(BRIDGE, `[brain] adopted trade T looks DRIFTED; suggests re-opening -- gate: BRAIN_TRADE_T_AUTO=adopt`, NARRATE === "ollama");
                                }
                            }
                        }
                    }
                    const eb = evalVals.reduce((a, b) => b.v > a.v ? b : a, evalVals[0]);
                    const running = evalVals.find(x => x.T === tradeT());
                    const marginOk = running && running.v !== 0 ? (eb.v - running.v) / Math.abs(running.v) > 0.02 : eb.T !== tradeT();
                    let ladder41 = "";
                    if (eb.T !== tradeT() && marginOk) {
                        tradeState.streak = (tradeState.streakT === eb.T) ? tradeState.streak + 1 : 1;
                        tradeState.streakT = eb.T;
                        if (tradeState.streak >= 3) {
                            if (gateValue("BRAIN_TRADE_T_AUTO", "suggest") === "adopt") {
                                tradeState.adoptedT = eb.T; tradeState.adoptedAt = Date.now(); tradeState.streak = 0;
                                // v42 -- TRADE DRIFT baseline: the margins that
                                // justified this adoption, captured at the moment
                                // of adoption (the promoted-theta doctrine).
                                tradeState.baselineArr = tradeLog.slice(-200).map(e => e.margin);
                                tradeState.post = []; tradeState.driftStreak = 0;
                                ladder41 = ` -- ADOPTED T=${eb.T} (3 agreeing sweeps, >2% relative margin)`;
                            } else {
                                ladder41 = ` -- 3 sweeps agree on T=${eb.T} (+>2%); gate: BRAIN_TRADE_T_AUTO=adopt`;
                            }
                        } else ladder41 = ` -- streak ${tradeState.streak}/3 on T=${eb.T}`;
                    } else tradeState.streak = 0, tradeState.streakT = null;
                    try { Deno.writeTextFileSync(TRADE_STATE_PATH, JSON.stringify(tradeState)); } catch {}
                    reportMilestone(BRIDGE, `[brain] trader boldness sweep (n=${tradeLog.length}${tradeState.adoptedT != null ? ", era-windowed" : ""}): ` +
                        evalVals.map(x => `T=${x.T}:${x.v.toFixed(1)}`).join(" ") +
                        ` -> best T=${eb.T}, serving T=${tradeT()}${ladder41}`, NARRATE === "ollama");
                }
            }
        }
    } catch (e) {
        // v2150 -- this catch used to be silent, so a single failed snapshot fetch at
        // boot (the brain racing the server's first listen) showed up forever as an
        // unexplained "errors=1" with no way to know what it was. Report the first
        // occurrence, then stay quiet so a flapping bridge can't spam the console.
        stats.errors++;
        if (!_fetchWarned) { _fetchWarned = true; console.error("[brain] snapshot fetch failed (first occurrence, usually the bridge not up yet):", (e && e.message) || e); }
        return;
    }
    if (!snap || !snap.w || !snap.h || !Array.isArray(snap.heights)) { stats.skips++; return; }
    if (snap.ts === lastSnapTs) { stats.skips++; return; }   // nothing new
    lastSnapTs = snap.ts;
    stats.snapTs = snap.ts;

    // v4/v5 -- engine-reported outcomes -> experience buffers. Attack
    // outcomes label attack rows; "aggro" outcomes (PATCH-B2e brave-window
    // survival: 1 = a kaiju that fought on because the policy said brave
    // was still alive 12s later, 0 = it died) label aggro rows.
    if (LEARN && DO_POLICY && Array.isArray(snap.outcomes) && snap.outcomes.length) {
        const atk = snap.outcomes.filter(o => o.kind !== "aggro" && o.kind !== "civdef");
        // v9 -- attach propensities from provenance (PATCH-B11 src field +
        // the publish-time pick record). Unknown provenance -> p omitted
        // -> weight 1 (uncorrected, still trained).
        for (const o of atk) {
            // v15 -- domain tally (before any propensity gating: every
            // resolved shot counts toward its game's hit-rate)
            const D = domainStats[domainOf(o.id)];
            D.n++; if (o.hit) D.hits++;
            // v2520 -- the session trace. Off unless BRAIN_TRACE=1: this is one line per decision and the brain
            // makes thousands a minute. Aggregate hit-rates cannot tell you the brain spent ninety seconds firing
            // into a wall -- a wall and a miss look identical in a ratio. This is the ORDER, which they cannot be.
            if (traceEnabled()) {
                const _pk = lastAtkPick.get(o.id);
                traceDecision({
                    id: o.id,
                    dom: domainOf(o.id),
                    choice: o.name,                 // WHAT IT CHOSE. The first version left this out entirely.
                    mode: _pk?.mode ?? null,        // "sampled" | "emphasis" | null (the epsilon/argmax path)
                    hit: !!o.hit,
                    // The softmax probability the brain gave the choice that fired -- only meaningful for a
                    // sampled pick, and omitted otherwise rather than faked. The epsilon path's propensity is a
                    // different formula computed further down, and averaging two different things into one column
                    // would be a number that means nothing.
                    p: _pk?.mode === "sampled" ? _pk.probs?.[o.name] : undefined,
                    src: o.src,                     // "brain" | "brain-explore" | ... : rotation fallbacks are the tell
                });
            }
            if (domainOf(o.id) === "raycaster") rcTelemetryOutcome(o);   // v20
            if (domainOf(o.id) === "dungeon") dgnTelemetryOutcome(o);   // v24
            const pick = lastAtkPick.get(o.id);
            // v20 -- selection A/B tally: kaiju-domain outcomes credit the
            // mode whose record produced them (sampled records vs the
            // argmax/epsilon path); rotation fallbacks credit neither.
            {   // v21 -- tally per DOMAIN (sampled mode reaches dgn-/rc- picks too)
                const selD = domainOf(o.id);
                if (pick?.mode === "sampled") { const S2 = selectStats.sampled[selD]; S2.n++; if (o.hit) S2.hits++; }
                else if (pick && pick.mode == null) { const S2 = selectStats.epsilon[selD]; S2.n++; if (o.hit) S2.hits++; }
            }
            // v18 -- emphasis mode: exact observed-shot propensity, whatever
            // the engine stamped (it fires on its own schedule; WE know the
            // sampling distribution and the rate mechanics)
            if (pick?.mode === "emphasis" && pick.intervals?.[o.name] != null) {
                o.p = emphasisShotProb(o.name, pick.probs, pick.intervals);
                continue;
            }
            // v19 -- sampled-selection: the fired pick's propensity is its
            // softmax prob. Rotation fallbacks (name not in the published
            // distribution... it always is; the tell is src) stay weight 1.
            if (pick?.mode === "sampled" && pick.probs?.[o.name] != null
                && (o.src === "brain" || o.src === "brain-explore")) {
                o.p = pick.probs[o.name];
                // v21 -- feed the offline T-sweep: candidate scores + fired
                // pick + logged propensity + reward, all this estimator needs
                if (pick.scores) sweepAppend({ scores: pick.scores, fired: o.name, p: o.p, hit: o.hit ? 1 : 0, d: domainOf(o.id), ts: Date.now() });   // v26 -- era stamp
                continue;
            }
            if (!pick || pick.name !== o.name) continue;
            if (o.src === "brain")          o.p = (1 - EPSILON) + EPSILON / pick.n;
            else if (o.src === "brain-explore") o.p = EPSILON / pick.n;
        }
        rcTelemetrySnapshot(snap.goals);   // v20 -- hp/acc sampling per publish
        if (rcSession && Date.now() - rcSession.last > 60000) rcTelemetryClose();   // v20 -- idle close
        if (dgnSession && Date.now() - dgnSession.last > 60000) dgnTelemetryClose();   // v24
        // v15 -- cross-game report every 500 attack outcomes
        {
            const tot = domainStats.kaiju.n + domainStats.dungeon.n + domainStats.raycaster.n;
            if (tot >= domainReportAt) {
                domainReportAt += 500;
                const fmt = (d) => d.n ? `${Math.round(100 * d.hits / d.n)}% (n=${d.n})` : "-";
                reportMilestone(BRIDGE,
                    `[brain] cross-game hit-rates: kaiju ${fmt(domainStats.kaiju)}, dungeon ${fmt(domainStats.dungeon)}, raycaster ${fmt(domainStats.raycaster)}`,
                    NARRATE === "ollama");
                saveRegime();   // v17 -- fold this session into its regime
                const v17line = regimeVerdict();
                if (v17line) reportMilestone(BRIDGE, v17line, NARRATE === "ollama");
                saveSelectStats();   // v20
                const v20line = selectionVerdict();
                if (v20line) reportMilestone(BRIDGE, v20line, NARRATE === "ollama");
                const v21sweep = sweepReport();   // v21
                if (v21sweep) reportMilestone(BRIDGE, v21sweep, NARRATE === "ollama");
            }
        }
        const poo = snap.outcomes.filter(o => o.kind === "packorder")
            .map(o => ({ id: o.id, name: "packorder", hit: o.r, civsHit: 0, kaijuHit: 0 }));
        if (poo.length) packOrdTrainer.ingest(poo, () => 0.6);
        const cto = snap.outcomes.filter(o => o.kind === "civtarget")
            .map(o => ({ id: o.id, name: o.name, hit: o.hit, civsHit: 0, kaijuHit: o.kaijuHit ?? 0 }));
        if (cto.length) civTgtTrainer.ingest(cto, () => 0.6);
        const cdo = snap.outcomes.filter(o => o.kind === "civdef")
            .map(o => ({ id: o.id, name: "civdef", hit: o.hit, civsHit: 0, kaijuHit: o.kaijuHit ?? 0 }));
        if (cdo.length) civDefTrainer.ingest(cdo, () => 0.6);   // dmg=0.6 -> reward = hit(+multi-kaiju bonus)
        const agg = snap.outcomes.filter(o => o.kind === "aggro")
            .map(o => ({ id: o.id, name: "aggro", hit: o.r, civsHit: 0, kaijuHit: 0 }));
        if (trainer && atk.length) {
            if (SPLIT && domTrainers) {   // v16 -- outcomes train their domain's head
                const by = { kaiju: [], dungeon: [], raycaster: [] };
                atk.forEach(o => by[domainOf(o.id)].push(o));
                const rew = (name) => KAIJU_ATTACK_DAMAGE[name] ?? 0.3;
                if (by.kaiju.length) trainer.ingest(by.kaiju, rew);
                if (by.dungeon.length) domTrainers.dungeon.ingest(by.dungeon, rew);
                if (by.raycaster.length) domTrainers.raycaster.ingest(by.raycaster, rew);
            } else trainer.ingest(atk, (name) => KAIJU_ATTACK_DAMAGE[name]);
        }
        if (agg.length) aggroTrainer.ingest(agg, () => 0.6);   // dmg=0.6 -> reward == o.r exactly
    }

    // 2. (re)build the solver if the grid shape changed OR the operator flipped the field-solver
    //    mode live (brain-maze's GPU/AUTO/CPU toggle rides in on snap.fieldSolver). v2230.
    const _reqFieldMode = snap.fieldSolver ? String(snap.fieldSolver).toLowerCase().trim() : "";   // "cpu"|"auto"|"gpu"|"gpu-raw"; "" => env default
    if (!solver || solver.w !== snap.w || solver.h !== snap.h || _reqFieldMode !== _builtFieldMode) {
        const cfg = { cell: snap.cell, iterations: Number(Deno.env.get("BRAIN_ITERS")) || undefined,
                      impassDh: +snap.impassDh || 0 };   // v2186 — hard wall impassability from the snapshot (maze room sets it; game terrain omits it => 0 => off)
        // v2156 -- MEASURED, not assumed. brain/bench.mjs on the rig (Intel Iris, 12 timed
        // solves/size) says the GPU relaxation solver LOSES on both axes at the grid sizes
        // this brain actually uses:
        //     64^2   cpu 0.58ms   gpu 31.27ms   0.02x   cos 0.797 (37 deg mean error)
        //     96^2   cpu 0.71ms   gpu 46.00ms   0.02x   cos 0.719 (44 deg)
        //    128^2   cpu 0.89ms   gpu 46.54ms   0.02x   cos 0.753 (41 deg)
        // GPU time is FLAT while cells nearly double (96->128: work x1.78, time x1.01), so
        // it is overhead-bound: ~29.7ms fixed submit+mapAsync readback per solve. And the
        // field is not merely approximate -- ~20% of cells point >45 deg wrong. Raising
        // iterations to converge only makes it slower (3x iters ~= 62ms, still 87x behind).
        // So FIELDS now default to the exact CPU Dijkstra solver.
        //
        // This is deliberately SEPARATE from CPU_FIELDS (BRAIN_BACKEND=cpu), which means
        // "this box has no GPU" and pins the brain to the fields role, disabling the policy
        // MLP. We keep the GPU device for the MLP and merely solve fields on the CPU.
        // Force the old behaviour with BRAIN_FIELD_SOLVER=gpu.
        // v2213 -- BRAIN_FIELD_SOLVER now has THREE opt-in GPU modes (default stays CPU):
        //   (unset)/cpu -> exact CPU Dijkstra. Zero cost, unchanged, benchmarked winner.
        //   auto        -> PROBE: run both solvers on the real grid for BRAIN_FIELD_PROBE
        //                  solves, keep GPU only if it is BOTH faster (by BRAIN_FIELD_MARGIN)
        //                  AND accurate (agreement >= BRAIN_FIELD_COS) vs the exact CPU field.
        //                  Serves the exact CPU field during the probe (no consumer ever sees
        //                  an approximate field while calibrating).
        //   gpu         -> WATCHED GPU: live from solve 1, but a per-solve budget guard demotes
        //                  it to CPU if a solve exceeds BRAIN_FIELD_BUDGET_MS for
        //                  BRAIN_FIELD_GUARD_STRIKES solves in a row (or throws). Sticky until
        //                  the grid reshapes (which rebuilds + re-arms). Non-pipelined so the
        //                  guard can actually see the readback cost.
        //   gpu-raw     -> the pre-v2213 behaviour: raw FlowFieldSolver, pipeline honored,
        //                  NO probe and NO guard. The escape hatch for the unwatched path.
        // auto/gpu/gpu-raw all still require a real adapter (that is initGPU's job); a box
        // with no GPU uses BRAIN_BACKEND=cpu, which never reaches here.
        const fieldSolverEnv = _reqFieldMode || (Deno.env.get("BRAIN_FIELD_SOLVER") || "").toLowerCase();
        _builtFieldMode = _reqFieldMode;   // v2230 -- remember what we built under so the next same-mode snapshot doesn't rebuild
        const wantGpuRaw     = !CPU_FIELDS && fieldSolverEnv === "gpu-raw";
        const wantGpuManaged = !CPU_FIELDS && (fieldSolverEnv === "gpu" || fieldSolverEnv === "auto");
        const useCpuFields   = !(wantGpuRaw || wantGpuManaged);
        const FF = useCpuFields ? FlowFieldSolverCPU
                 : wantGpuRaw   ? FlowFieldSolver
                 : FlowFieldSolverAuto;
        if (wantGpuManaged) {
            // These ride in `cfg` (i.e. solver opts); the CPU/GPU inner solvers ignore the
            // extra keys, and FlowFieldSolverAuto reads them. Shared by all field solvers below.
            cfg.mode     = fieldSolverEnv;   // "auto" or "gpu"
            cfg.budgetMs = Number(Deno.env.get("BRAIN_FIELD_BUDGET_MS")) || 12;
            cfg.strikes  = Number(Deno.env.get("BRAIN_FIELD_GUARD_STRIKES")) || 3;
            cfg.probeN   = Number(Deno.env.get("BRAIN_FIELD_PROBE")) || 6;
            cfg.cosTol   = Number.isFinite(+Deno.env.get("BRAIN_FIELD_COS")) && Deno.env.get("BRAIN_FIELD_COS") != null
                           ? Number(Deno.env.get("BRAIN_FIELD_COS")) : 0.95;
            cfg.margin   = Number.isFinite(+Deno.env.get("BRAIN_FIELD_MARGIN")) && Deno.env.get("BRAIN_FIELD_MARGIN") != null
                           ? Number(Deno.env.get("BRAIN_FIELD_MARGIN")) : 0.9;
        }
        // v2187 -- feed-forward iteration control is a GPU-only concept (the CPU solver
        // is exact Dijkstra with no iteration count). On by default; cap raised only if
        // the operator asked. iterMin/iterCap are per-grid, so derive from snap.w/h.
        if (!useCpuFields) {
            cfg.feedForward = !FIELD_ITER_FIXED;
            if (FIELD_ITER_CAP_MULT > 0) cfg.iterCap = Math.ceil(Math.max(snap.w, snap.h) * FIELD_ITER_CAP_MULT);
        }
        // v2187 -- pipelined readback is a GPU-only concept; the CPU solver has no stall to hide.
        // v2213 -- and only the RAW gpu path is pipelined: the managed (auto/gpu) wrapper forces
        // pipeline off so the probe compares fresh fields and the budget guard can see the cost.
        if (wantGpuRaw && FIELD_PIPELINE) cfg.pipeline = true;
        cfg.label = "nav";   // v2213 -- distinguishes the three field solvers in field-auto logs
        solver = new FF(device, snap.w, snap.h, cfg);
        // v2207 -- remember WHICH solver, so the field can say so. The brain-maze room is a lie detector for
        // the solver, and a lie detector that cannot name the accused is a rumour.
        // v2213 -- for the managed wrapper the true backend is decided at runtime (probe/guard), so the
        // live string comes from solver.backend at telemetry time; this is just the initial label.
        // v2230 -- if the operator asked for a GPU mode but this box has no adapter (CPU_FIELDS),
        // say so, so the maze toggle doesn't look broken when it silently stays on CPU.
        const _gpuAsked = _reqFieldMode === "gpu" || _reqFieldMode === "auto" || _reqFieldMode === "gpu-raw";
        _fieldBackend = useCpuFields ? ("cpu (exact Dijkstra" + (_gpuAsked && CPU_FIELDS ? ", no GPU adapter on this box" : "") + ")")
                      : wantGpuRaw   ? "gpu (fixed-iteration Jacobi, raw)"
                      : (cfg.mode === "auto" ? "auto (probing gpu vs cpu)" : "gpu (watched)");
        cfg.label = "threat";
        threatSolver = new FF(device, snap.w, snap.h, cfg);
        // v11 -- third field: player-seeking flow for FPS/dungeon
        // enemies. Same solver, goals = [the player]. Dungeon walls are
        // VOXELS (3-high plugs), so the height snapshot already encodes
        // corridors -- slope cost routes monsters around walls with no
        // dungeon-specific code anywhere in the brain.
        cfg.label = "player";
        playerSolver = new FF(device, snap.w, snap.h, cfg);
        // v2186 -- the scheduler calls makeSolver(w, h, opts) with NO device (see
        // quadrants.js); our solvers take (device, w, h, opts). Adapt.
        //
        // ITERATIONS ARE NOT PORTABLE ACROSS GRID SIZES. The GPU solver propagates
        // distance exactly ONE cell per iteration and defaults to ceil(max(w,h)*1.7).
        // The atlas is much larger than snap.w x snap.h, so forwarding a fixed
        // BRAIN_ITERS (tuned for the snapshot grid) would silently UNDER-CONVERGE
        // every packed field -- flow vectors pointing nowhere in the far corners,
        // with no error raised. So: if the operator pinned iterations, scale that
        // pin by the atlas/grid ratio; otherwise drop it and let the solver derive
        // the right count from the atlas dimensions itself.
        // (The CPU solver is exact Dijkstra and ignores `iterations` entirely.)
        if (QUADRANTS) {
            if (qs && qs._solver && qs._solver.destroy) { try { qs._solver.destroy(); } catch {} }
            const _snapMax = Math.max(snap.w, snap.h);
            qs = new QuadrantScheduler(
                (w, h, o) => {
                    const c = { ...cfg, ...o, label: "quad" };
                    if (cfg.iterations) c.iterations = Math.ceil(cfg.iterations * (Math.max(w, h) / _snapMax));
                    else delete c.iterations;
                    return new FF(device, w, h, c);
                },
                { cell: snap.cell, impassDh: +snap.impassDh || 0 },
            );
        }
        const how = useCpuFields
            ? ("cpu (exact Dijkstra)" + (CPU_FIELDS ? "" : " -- benchmarked 50x faster + exact; BRAIN_FIELD_SOLVER=auto to probe, =gpu to force+watch"))
            : wantGpuRaw
                ? ("gpu (iters=" + solver.iterations + ", raw/unwatched)")
                : (cfg.mode === "auto"
                    ? ("auto (probe " + cfg.probeN + " solves, keep gpu if faster*" + cfg.margin + " and agree>=" + cfg.cosTol + "; else cpu)")
                    : ("gpu (watched: demote to cpu if >" + cfg.budgetMs + "ms x" + cfg.strikes + ")"));
        const _extra = (cfg.pipeline ? " +pipelined-readback (fields lag 1 tick)" : "")
                     + (QUADRANTS ? " +quadrants" : "")
                     + (!useCpuFields ? (FIELD_ITER_FIXED ? " +fixed-iters" : (" +feed-forward-iters" + (FIELD_ITER_CAP_MULT > 0 ? ` (cap ${FIELD_ITER_CAP_MULT}x)` : " (cap=heuristic)"))) : "");
        console.log(`[brain] solvers ${snap.w}x${snap.h} cell=${snap.cell} backend=${how}${_extra}`);
    }
    if (!mlp) mlp = new BatchedMLP(device, buildLayers(), 64);
    if (!atkMlp && DO_POLICY && RESET) {
        for (const wp of [WEIGHTS_PATH, AGGRO_W_PATH, CIVDEF_W_PATH, CIVTGT_W_PATH]) {
            try { await Deno.rename(wp, wp.replace(/\.json$/, ".pre-reset.json")); 
                  console.log("[brain] RESET: archived", wp.split("/").pop()); } catch {}
        }
    }
    if (!atkMlp && DO_POLICY) {
        // v5 -- deep net (13 -> 16 relu -> 1 sigmoid), distilled from the
        // hand policy so it starts EXACTLY equal to it. loadDeepWeights is
        // v4-back-compatible: an old linear weights file distills its
        // LEARNED weights into the h0/h1 pathway, carrying knowledge over.
        const loaded = await loadDeepWeights(WEIGHTS_PATH, buildAttackLayersDeep);
        atkLayers = loaded.layers;
        trainer = new MLPTrainer(atkLayers, { lr: Number(Deno.env.get("BRAIN_LR") ?? 0.02) });
        trainer.steps = loaded.steps;
        atkMlp = new BatchedMLP(device, atkLayers, 256);
        // v16 -- split heads: load or clone-from-kaiju
        if (SPLIT) {
            atkHeads = {};
            let saved = null;
            try { saved = JSON.parse(await Deno.readTextFile(HEADS_PATH)); } catch {}
            // v40 -- EV HEAD: the v39 stated debt paid. Same clone-from-
            // kaiju birth, same shared hidden layer, own judgment.
            for (const dom of ["dungeon", "raycaster", "ev", "fps"]) {
                const src = saved?.[dom];
                // v57 -- FPS HEAD DECISION, in writing before the flip:
                // fps births as a CLONE OF THE DUNGEON'S TRAINED HEAD, not
                // kaiju's and not fresh. Reasons, ranked: (1) the shooter's
                // enemy-side decision problem IS the dungeon's -- same
                // monsters, same attack space, only the camera differs;
                // (2) months of dgn training beat a cold start on fps's
                // sparser traffic; (3) the drift/verdict machinery exists
                // precisely to catch an imported bias that does not fit --
                // a wrong prior is correctable, a wasted prior is not.
                // Chain: saved fps > saved dungeon > kaiju (loop order
                // guarantees nothing here -- we read from SAVED, not from
                // the freshly built sibling, so order cannot bite).
                const fpsSrc = dom === "fps" ? (src ?? saved?.dungeon) : src;
                atkHeads[dom] = {
                    nIn: atkLayers[1].nIn, nOut: 1, act: "sigmoid",
                    W: Float32Array.from(fpsSrc?.W ?? atkLayers[1].W),
                    b: Float32Array.from(fpsSrc?.b ?? atkLayers[1].b),
                };
                if (dom === "fps" && !src) {
                    const birth76 = `[brain] fps head born from ${saved?.dungeon ? "the DUNGEON's trained head (v57 decision)" : "kaiju (no dungeon head saved yet)"}`;
                    console.log(birth76);
                    // v76 -- promoted to a MILESTONE: the evidence bundle can
                    // only zip what the bridge can see, and a console.log
                    // dies with the terminal. Fire-and-forget.
                    try { reportMilestone(BRIDGE, birth76, false); } catch {}
                }
            }
            domTrainers = {};
            for (const dom of ["dungeon", "raycaster", "ev", "fps"]) {   // v40 -- one loop, three heads
                domTrainers[dom] = new MLPTrainer([atkLayers[0], atkHeads[dom]], { lr: Number(Deno.env.get("BRAIN_LR") ?? 0.02), minBuffer: 8 });
                domTrainers[dom].ipsCap = IPS_CAP;
                if (saved) domTrainers[dom].steps = saved[dom]?.steps ?? 0;
            }
            console.log(`[brain] DOMAIN SPLIT on: heads ${saved ? "loaded" : "cloned from kaiju"} (shared hidden by reference)`);
        }
        const ag = await loadWeights(AGGRO_W_PATH, buildLayers()[0].W);
        aggroW = ag.W; aggroTrainer.steps = ag.steps;
        mlp.updateWeights(0, aggroW);
        // v6 -- civ-defense weights + replay buffers survive restarts
        const cd = await loadWeights(CIVDEF_W_PATH, buildCivDefWeights());
        civDefW = cd.W; civDefTrainer.steps = cd.steps;
        const ct = await loadWeights(CIVTGT_W_PATH, buildCivTargetWeights());
        civTgtW = ct.W; civTgtTrainer.steps = ct.steps;
        // v10 -- pack-order weights over [packNorm, energy, threatAtTarget, bias]
        const po = await loadWeights(PACKORD_W_PATH, Float32Array.from([2.0, 1.0, -2.0, -1.4]));
        packOrdW = po.W; packOrdTrainer.steps = po.steps;
        // v10 -- cross-machine replay warm-start: if sharing is on and the
        // local replay came back empty, pull the bridge's persistent ring
        // (PATCH-B1e) so a fresh install starts with the fleet's memory.
        if (SHARE) {
            try {
                const tot = trainer.buffer.length + aggroTrainer.buffer.length + civDefTrainer.buffer.length;
                if (tot === 0) {
                    const r = await fetch(BRIDGE + "/ai/brain/experience?after=0&exclude=" + INSTANCE);
                    const j = await r.json();
                    if (j?.ok && j.samples?.length) {
                        const byPol = { attack: [], aggro: [], civdef: [], civtarget: [], packorder: [] };
                        for (const s of j.samples) if (byPol[s.pol]) byPol[s.pol].push(s);
                        const n = (trainer?.ingestForeign(byPol.attack, ATK_FEATURES) ?? 0)
                                + aggroTrainer.ingestForeign(byPol.aggro, FEATURES)
                                + civDefTrainer.ingestForeign(byPol.civdef, CIVDEF_FEATURES)
                                + civTgtTrainer.ingestForeign(byPol.civtarget, CIVTARGET_FEATURES)
                                + packOrdTrainer.ingestForeign(byPol.packorder, 4);
                        shareCursor = j.seq ?? 0;
                        console.log(`[brain] replay warm-start from the bridge ring: ${n} samples`);
                    }
                }
            } catch {}
        }
        if (LEARN) await loadReplays(REPLAY_PATH, {
            attack: { trainer, featLen: ATK_FEATURES },
            aggro:  { trainer: aggroTrainer, featLen: FEATURES },
            civdef: { trainer: civDefTrainer, featLen: CIVDEF_FEATURES },
            civtarget: { trainer: civTgtTrainer, featLen: CIVTARGET_FEATURES },
            packorder: { trainer: packOrdTrainer, featLen: 4 },
        });
    }

    const heights = Float32Array.from(snap.heights);
    const goals = (snap.goals || []).map(g => ({
        gx: Math.round((g.x - snap.ox) / snap.cell),
        gy: Math.round((g.z - snap.oz) / snap.cell),
    }));
    if (!goals.length) { stats.skips++; return; }

    const t0 = performance.now();
    // v5 -- role split: nav flow is a fields-role product; the threat
    // field is computed by BOTH roles (policies consume it too, and it
    // is cheap next to duplicating the mailbox plumbing).
    let field = null;
    let playerField = null;   // v11
    // v2146 -- toCell was declared below (line ~1896) but first used here inside the
    // DO_FIELDS block for the player field -> "Cannot access 'toCell' before
    // initialization" (TDZ). Hoisted above its first use.
    const toCell = (wx, wz) => ({
        gx: Math.round((wx - snap.ox) / snap.cell),
        gy: Math.round((wz - snap.oz) / snap.cell),
    });
    // v2186 — the solver is cached per grid size, but impassDh can change per snapshot
    // (e.g. the maze page toggles walls impassable). Keep it in sync cheaply each solve.
    const _imp = +snap.impassDh || 0;
    // v2204 -- a caller may ask for a bigger sweep budget. The GPU solver's default cap is its own
    // heuristic, so the controller can never grow past it; a maze whose geodesic is longer than the grid
    // diameter gets a TRUNCATED field, and a walker following it stalls at a wall. The maze room asks for
    // w*h, the true upper bound. Game terrain sends nothing and is unchanged.
    const _cap = +snap.iterCap || 0;

    // v2186 — hoisted above the fields block so the threat task can be PACKED with
    // nav + player. The separate-solve path below is unchanged and still fires when
    // packing is off/unsafe or when this brain is policy-only (DO_FIELDS false).
    const kaiju = Array.isArray(snap.kaiju) ? snap.kaiju : [];
    let threat = null;

    // v2186 — clamp a cell into the grid BEFORE it is packed. The standalone solvers
    // clamp their own goals (flowfieldCpu.solve / flowfield.solve), but the scheduler
    // offsets goals into a quadrant *unclamped* (`p.ox + (g.gx|0)`), so an out-of-grid
    // kaiju or player would seed a GUTTER or, worse, a NEIGHBOURING TASK's quadrant.
    // Clamping here reproduces the standalone behaviour exactly.
    const clampCell = (c) => ({
        gx: Math.max(0, Math.min(snap.w - 1, c.gx | 0)),
        gy: Math.max(0, Math.min(snap.h - 1, c.gy | 0)),
    });

    // Packing is EXACT only with impassDh > 0 (the gutter filter is gated on it).
    const wantQuad = QUADRANTS && DO_FIELDS;
    const canQuad = wantQuad && _imp > 0 && qs;
    if (wantQuad && !canQuad && !_quadWarned) {
        _quadWarned = true;
        console.log("[brain] BRAIN_QUADRANTS=1 but this snapshot has impassDh=0 -- "
                  + "gutters would not isolate quadrants, so fields would bleed between tasks. "
                  + "Falling back to separate solves (correct, just not packed).");
    }

    if (canQuad) {
        // ONE dispatch for every independent nav task this tick. Each task is the
        // same grid with different seeds, so each is a genuine quadrant.
        qs.cell = snap.cell;
        qs.impassDh = _imp;
        qs.gutterH = _imp * 100;   // keep the gutter jump >> impassDh (constructor invariant)

        const tasks = [{ id: "nav", w: snap.w, h: snap.h, heights, goals: goals.map(clampCell) }];
        const hasPlayerField = !!(snap.player && Number.isFinite(snap.player.x));
        if (hasPlayerField) tasks.push({ id: "player", w: snap.w, h: snap.h, heights,
                                         goals: [clampCell(toCell(snap.player.x, snap.player.z))] });
        if (kaiju.length) tasks.push({ id: "threat", w: snap.w, h: snap.h, heights,
                                       goals: kaiju.map(k => clampCell(toCell(k.x, k.z))) });

        const packed = await qs.solve(tasks);
        field = packed.get("nav") || null;                                   // { w, h, fx, fz, dist }
        playerField = hasPlayerField ? (packed.get("player") || null) : null;
        // The threat field only ever needed dist; the pack computes flow for it too
        // (the scheduler asks for both). That is the price of the shared dispatch.
        const th = packed.get("threat");
        if (th && th.dist) threat = th.dist;
        if (!field) { stats.skips++; return; }
    } else if (DO_FIELDS) {
        if (solver && solver.impassDh !== _imp) solver.impassDh = _imp;
        if (solver && _cap > 0 && "iterCap" in solver && solver.iterCap !== _cap) solver.iterCap = _cap;
        field = await solver.solve(heights, goals, { wantDist: true });   // v2186 — dist rides along: consumers (brain-maze walker, any wall-escape steering) descend it when the flow vector is locally blocked
        // v11 -- player field (only when the engine reports a player)
        if (snap.player && Number.isFinite(snap.player.x) && playerSolver) {
            const pc = toCell(snap.player.x, snap.player.z);
            playerField = await playerSolver.solve(heights, [pc]);
        } else playerField = null;
        if (!field) { stats.skips++; return; }
    }

    // v2 -- threat field: kaiju positions as sources, DISTANCE readback
    // (no flow pass). Cost-weighted, so terrain between you and a kaiju
    // genuinely reads as safety. Consumed by retreat-point selection.
    // v2186 -- `kaiju`/`threat` are declared above (the packed path needs them).
    // When the pack already produced the threat field, do NOT solve it again.
    // A policy-only brain (DO_FIELDS false) never packs, so it still lands here.
    if (kaiju.length && !threat) {
        const r = await threatSolver.solve(heights, kaiju.map(k => toCell(k.x, k.z)),
                                           { wantFlow: false, wantDist: true });
        if (r && r.dist) threat = r.dist;
    }

    // v2073 -- PHASE B: task PRIORITY, computed from what is actually
    // happening (not a hand-set label that someone must remember). The
    // scheduler needs to know which solves are latency-critical so it can
    // route them to fast brains and let slow/CPU brains absorb the rest.
    //   mode     -- fps when a player is present + kaiju fighting them,
    //               else combat when kaiju are active, else nav (quiet).
    //   priority -- 0..3. A player under active fire is high; monster
    //               NAVIGATION toward a player is medium (a CPU brain can
    //               carry it -- exactly the FPS/WAD pathing question);
    //               a quiet nav field with no combat is low.
    //   navOnly  -- true when this solve is pure fields (no live combat
    //               decisions needed), i.e. safe for a CPU/fields brain.
    const _activeCombat = kaiju.length > 0 && Array.isArray(snap.outcomes) && snap.outcomes.length > 0;
    const _hasPlayer = !!(snap.player && Number.isFinite(snap.player.x));
    const _playerMoving = _hasPlayer && (snap.player.spd || 0) > 0.5;
    let workMode, workPriority;
    if (_hasPlayer && kaiju.length) { workMode = "fps"; workPriority = _playerMoving || _activeCombat ? 3 : 2; }
    else if (kaiju.length)          { workMode = "combat"; workPriority = _activeCombat ? 2 : 1; }
    else                            { workMode = "nav"; workPriority = 0; }
    // navOnly: the FIELDS are all this solve needs downstream. FPS monster
    // pathing IS navOnly (the player-seek field is a fields product); the
    // learned attack HEAD is policy and rides separately. So a CPU brain
    // covers FPS/WAD navigation but not its policy head -- honest split.
    const workNavOnly = !DO_POLICY || (!kaiju.length && !_activeCombat);

    // v2 -- per-kaiju aggression through the GPU policy (see policy.js).
    // aggro 0.5 == the engine's stock retreat threshold exactly.
    // v8 -- shared threat sampler (aggro features, civdef, and now the
    // attack net's cross-policy features all read the same grid)
    const threatDistAt = (x, z) => {
        if (!threat) return null;
        const c = toCell(x, z);
        if (c.gx < 0 || c.gy < 0 || c.gx >= snap.w || c.gy >= snap.h) return null;
        const dv = threat[c.gy * snap.w + c.gx];
        return dv > 1e8 ? null : dv;
    };

    const aggro = {};
    if (DO_POLICY && kaiju.length && threat) {
        const goalDistAt = (x, z) => {
            let best = null;
            for (const g of snap.goals) {
                const d = Math.hypot(g.x - x, g.z - z);
                if (best == null || d < best) best = d;
            }
            return best;
        };
        const X = new Float32Array(kaiju.length * FEATURES);
        kaiju.forEach((k, i) => X.set(buildFeatures(k, threatDistAt, goalDistAt, snap.cell), i * FEATURES));
        try {
            const y = await mlp.forward(X, kaiju.length);
            kaiju.forEach((k, i) => {
                let a = y[i];
                // v5 -- brave-side exploration: brave windows only exist when
                // the policy pushes PAST the stock threshold, so a policy that
                // drifts timid stops generating its own training data. With
                // p=BRAIN_AGGRO_EPSILON, nudge a kaiju brave to keep the data
                // flowing (one-sided by design; timid has no counterfactual).
                if (LEARN && AGGRO_NOISE > 0 && Math.random() < AGGRO_NOISE) a = Math.min(1, a + 0.35);
                // v19 -- BRAIN-SERVED raycaster difficulty: when the player
                // goal carries a marksmanship reading (acc 0..1), rc-
                // enemies' boldness follows it -- a deadly player faces
                // bolder enemies, a fumbling one gets breathing room.
                // HEURISTIC and stated as such: a LEARNED difficulty policy
                // needs a reward for "the player is having a good fight",
                // which nothing measures yet. Centralizing it here still
                // beats the local formula: one knob, all clients, stacked
                // on the learned aggro rather than replacing it.
                // v24 -- dungeon A/B: the learned/promoted offset rides dgn-
                // aggro (consumed by DungeonAI cadence, PATCH-B22)
                if (String(k.id).startsWith("dgn-")) {
                    a = Math.max(0, Math.min(1, a
                        + (diffABDgn.resolved?.mode === "promoted" ? diffABDgn.resolved.theta
                           : (DIFF_AB_DGN && dgnSession?.arm === "learned" ? diffABDgn.theta : 0))));
                }
                if (String(k.id).startsWith("rc-")) {
                    const accG = snap.goals.find(g => typeof g.acc === "number");
                    if (accG) a = Math.max(0, Math.min(1, a + 0.6 * (accG.acc - 0.5)
                        // v22 -- treatment arm adds the learned offset;
                        // v23 -- a PROMOTED theta applies to every session
                        + (diffAB.resolved?.mode === "promoted" ? diffAB.resolved.theta
                           : (DIFF_AB && rcSession?.arm === "learned" ? diffAB.theta : 0))));
                }
                aggro[k.id] = Math.round(a * 1000) / 1000;
            });
            // v5 -- remember aggro rows for outcome matching (key id:aggro)
            if (LEARN) aggroTrainer.rememberRows(kaiju.map((k, i) => ({
                id: k.id, name: "aggro",
                x: Array.from(X.subarray(i * FEATURES, (i + 1) * FEATURES)),
            })));
        } catch (e) { console.error("[brain] mlp:", e.message); }
    }
    // v3 -- attack selection: one row per (kaiju, legal attack), one
    // batched GPU forward, argmax per kaiju. Rows only for kaiju that
    // have attacks and a target (or a goal to aim at); rows wildly out
    // of range still score, they just sink under the bias.
    // v5 -- civ-defense decisions: per-civ shoot/hold for the retaliation
    // module (simulation/civRetaliation.js). Scored on the CPU -- three
    // multiplies per civ does not earn a GPU dispatch; it shares the
    // threat grid the GPU already produced.
    const civDef = {};
    if (DO_POLICY && threat && Array.isArray(snap.goals)) {
        for (const g of snap.goals) {
            if (g.id == null) continue;
            const gx = Math.round((g.x - snap.ox) / snap.cell);
            const gy = Math.round((g.z - snap.oz) / snap.cell);
            let td = 9999;
            if (gx >= 0 && gy >= 0 && gx < snap.w && gy < snap.h) {
                const dv = threat[gy * snap.w + gx];
                if (dv < 1e8) td = dv;
            }
            const threatNear = Math.max(0, Math.min(1, 1 - td / 60));
            const healthy = Math.max(0, Math.min(1, (g.energy ?? 1)));
            // v6 -- nearest kaiju (tier + distance == shot distance): the
            // features that let the policy learn which shots actually land
            let nearTier = 0, nearDist = 45;
            for (const k of kaiju) {
                if (!mine(k)) continue;   // v12 -- faction filter
                const d = Math.hypot(k.x - g.x, k.z - g.z);
                if (d < nearDist) { nearDist = d; nearTier = k.tier ?? 0; }
            }
            const x = buildCivDefFeatures(threatNear, healthy, nearTier, nearDist);
            let z = 0;
            for (let i = 0; i < CIVDEF_FEATURES; i++) z += civDefW[i] * x[i];
            const score = 1 / (1 + Math.exp(-z));
            // v8 -- decision-theoretic gate. With IPS-corrected training the
            // sigmoid now estimates P(hit|x) over the WHOLE state space, so
            // the threshold stops being an arbitrary 0.5 and becomes an
            // explicit cost/value tradeoff: shoot when hit probability
            // clears tau (BRAIN_CIVDEF_TAU, default 0.35 -- a bolt costs
            // 0.02 civ energy; how sure the city must be is a design knob).
            let shoot = score > CIVDEF_TAU, explore = false;
            if (LEARN && !shoot && CIVDEF_NOISE > 0 && Math.random() < CIVDEF_NOISE) {
                shoot = true; explore = true;   // probe the hold region
            }
            // v8 -- propensity: a normal shoot fires with certainty (p=1);
            // an explore probe fired with probability CIVDEF_NOISE, so its
            // outcome is IPS-weighted 1/eps (clipped) by the trainer --
            // that one probe stands in for the whole hold region it sampled.
            if (LEARN) civDefTrainer.rememberRows([{ id: g.id, name: "civdef", x,
                p: explore ? CIVDEF_NOISE : 1.0 }]);
            // v7 -- TARGET selection: score every kaiju within bolt range and
            // pick the best, instead of the module's nearest-only default.
            // Rows are keyed civId:kaijuId so the impact event (which now
            // carries targetKaijuId, PATCH-B10b) labels exactly the row that
            // aimed the shot.
            let target = null, tScore = -1;
            if (shoot) {
                for (const k of kaiju) {
            if (!mine(k)) continue;   // v12 -- faction filter
                    const d = Math.hypot(k.x - g.x, k.z - g.z);
                    if (d > 45) continue;
                    const xr = buildCivTargetFeatures(d / 45, (k.tier ?? 0) / 10, k.energy ?? 1,
                                                      !!k.king, healthy, threatNear);
                    let zt = 0;
                    for (let i = 0; i < CIVTARGET_FEATURES; i++) zt += civTgtW[i] * xr[i];
                    const sc = 1 / (1 + Math.exp(-zt));
                    if (LEARN) civTgtTrainer.rememberRows([{ id: g.id, name: String(k.id), x: xr }]);
                    if (sc > tScore) { tScore = sc; target = k.id; }
                }
            }
            civDef[g.id] = { shoot, target, score: Math.round(score * 1000) / 1000, ...(explore ? { explore: true } : {}) };
        }
    }

    // v9 -- pack coordination orders: per-king focus/free-hunt. Hand-set
    // linear policy for now (pack-level reward attribution is its own
    // research problem -- stated in NOTES, not hand-waved): coordinate
    // when the pack is big enough to matter and the king is healthy
    // enough to lead; scatter when the target area is a meat grinder.
    const packOrder = {};
    if (DO_POLICY) {
        for (const k of kaiju) {
            if (!mine(k)) continue;   // v12 -- faction filter
            if (!k.king) continue;
            const packNorm = Math.min(1, (k.packSize ?? 0) / 6);
            const thTgt = (k.tx != null) ? (() => {
                const d = threatDistAt(k.tx, k.tz);
                return d == null ? 0 : Math.max(0, Math.min(1, 1 - d / 60));
            })() : 0;
            const x = [packNorm, Math.max(0, Math.min(1, k.energy ?? 1)), thTgt, 1.0];
            let z = 0;
            for (let i = 0; i < 4; i++) z += packOrdW[i] * x[i];
            // v10 -- temperament: stable per-id logit offset
            const temper = PERSONALITY * idHash01(k.id) + TEMPER_BIAS;   // v14 -- disposition
            z += temper;
            const score = 1 / (1 + Math.exp(-z));
            let focus = score > 0.5, explore = false;
            // v10 -- one-sided data again (no-order windows are never
            // labeled): occasional focus probes, propensity-tagged
            if (LEARN && !focus && PACKORD_NOISE > 0 && Math.random() < PACKORD_NOISE) {
                focus = true; explore = true;
            }
            if (LEARN) packOrdTrainer.rememberRows([{ id: k.id, name: "packorder", x,
                p: explore ? PACKORD_NOISE : 1.0 }]);
            const temperament = temper > 0.12 ? "bold" : temper < -0.12 ? "wary" : "even";
            packOrder[k.id] = { focus, score: Math.round(score * 1000) / 1000,
                                temperament,
                                ...(explore ? { explore: true } : {}) };
            // v12 -- narrate ORDER FLIPS with the king's temperament, so
            // the /sys/logs feed reads like a war report instead of a
            // weight dump. Flips only -- steady orders stay silent.
            if (!explore) {
                const prev = lastOrderByKing.get(k.id);
                recap.orders++;
                if (focus) recap.focusOrders++;
                if (prev !== undefined && prev !== focus) {
                    recap.flips++;
                    recap.byTemper[temperament] = (recap.byTemper[temperament] || 0) + 1;
                    const verb = focus ? "orders the pack to focus" : "releases the pack to free-hunt";
                    reportMilestone(BRIDGE, `[brain] the ${temperament} king ${k.id} ${verb} (pack ${k.packSize ?? 0}, conviction ${Math.abs(score - 0.5).toFixed(2)})`, NARRATE === "ollama");
                }
                lastOrderByKing.set(k.id, focus);
            }
        }
    }

    const attack = {};
    if (DO_POLICY) {
        const rows = [];
        const owners = [];
        for (const k of kaiju) {
            if (!mine(k)) continue;   // v12 -- faction filter
            if (!Array.isArray(k.attacks) || !k.attacks.length) continue;
            if (k.tx == null && !snap.goals.length) continue;
            for (const a of k.attacks) {
                rows.push(buildAttackFeatures(k, a, snap.goals, threatDistAt));   // v8: threat context
                owners.push({ id: k.id, name: a.name });
            }
        }
        if (rows.length) {
            // v4 -- remember EVERY scored row so any fired attack (our pick,
            // an exploration pick, or the engine's rotation fallback) can be
            // matched to its features when the outcome comes back
            if (LEARN) {
                const all = owners.map((o, i) => ({ id: o.id, name: o.name, x: rows[i] }));
                if (SPLIT && domTrainers) {   // v16 -- route rows to their domain's trainer
                    const by = { kaiju: [], dungeon: [], raycaster: [] };
                    all.forEach(r => by[domainOf(r.id)].push(r));
                    if (by.kaiju.length) trainer.rememberRows(by.kaiju);
                    if (by.dungeon.length) domTrainers.dungeon.rememberRows(by.dungeon);
                    if (by.raycaster.length) domTrainers.raycaster.rememberRows(by.raycaster);
                } else trainer.rememberRows(all);
            }
            const X = new Float32Array(rows.length * ATK_FEATURES);
            rows.forEach((r, i) => X.set(r, i * ATK_FEATURES));
            try {
                const y = await atkMlp.forward(X, rows.length);
                const scoredById = {};   // v18 -- for emphasis sampling
                owners.forEach((o, i) => {
                    let s = y[i];
                    // v16 -- split: non-kaiju rows re-score through their own
                    // head on CPU (row counts are tiny; the GPU batch keeps
                    // serving the kaiju head)
                    if (SPLIT && atkHeads) {
                        const dom = domainOf(o.id);
                        if (dom !== "kaiju") s = cpuFwdSplit(atkLayers[0], atkHeads[dom], rows[i]);
                    }
                    (scoredById[o.id] = scoredById[o.id] || []).push({ name: o.name, s, i });   // v18
                    if (!attack[o.id] || s > attack[o.id].score) {
                        attack[o.id] = { name: o.name, score: Math.round(s * 1000) / 1000 };
                    }
                });
                // v4 -- epsilon exploration: some kaiju get a uniform-random
                // LEGAL attack instead of the argmax, so the learner sees
                // counterfactuals instead of only its own favorite. Marked
                // in the publish for debuggability.
                if (LEARN && EPSILON > 0) {
                    const byId = {};
                    owners.forEach((o) => { (byId[o.id] = byId[o.id] || []).push(o.name); });
                    for (const id of Object.keys(byId)) {
                        if (Math.random() < EPSILON) {
                            const names = byId[id];
                            attack[id] = { name: names[(Math.random() * names.length) | 0],
                                           score: attack[id]?.score ?? 0, explore: true };
                        }
                    }
                }
                // v18 -- emphasis mode: kaiju whose attacks ALL carry an
                // interval get a SOFTMAX-SAMPLED pick (sampling IS the
                // exploration -- the epsilon flip above is undone for them)
                // and a pick record rich enough for exact shot propensities.
                {
                    const byIdAtk = {};
                    for (const k2 of kaiju) byIdAtk[k2.id] = k2.attacks;
                    // v19 -- semantics guard: RATE-EMPHASIS math only applies
                    // where the engine keeps firing both weapons (the OGRE,
                    // flagged emphMode in the roster). Kaiju picks are
                    // SELECTION -- the engine fires the pick -- so kings get
                    // sampled-selection below instead: propensity is the
                    // softmax prob of the pick, directly. Interval presence
                    // alone must never trigger emphasis (kings now carry
                    // cooldown-annotated repertoires).
                    const emphIds = new Set(kaiju.filter(k2 => k2.emphMode === true).map(k2 => k2.id));
                    for (const id of Object.keys(scoredById)) {
                        if (!emphIds.has(id)) continue;
                        const atksK = byIdAtk[id];
                        if (!Array.isArray(atksK) || atksK.length < 2) continue;
                        if (!atksK.every(a => typeof a.interval === "number" && a.interval > 0)) continue;
                        const rows2 = scoredById[id];
                        const exps = rows2.map(r => Math.exp(r.s / EMPH_T));
                        const Z = exps.reduce((a, b) => a + b, 0);
                        const probs = {};
                        rows2.forEach((r, j) => { probs[r.name] = exps[j] / Z; });
                        let u = Math.random(), pickName = rows2[rows2.length - 1].name;
                        for (let j = 0; j < rows2.length; j++) { u -= exps[j] / Z; if (u <= 0) { pickName = rows2[j].name; break; } }
                        const intervals = {};
                        atksK.forEach(a => { intervals[a.name] = a.interval; });
                        attack[id] = { name: pickName,
                                       score: Math.round((rows2.find(r => r.name === pickName)?.s ?? 0) * 1000) / 1000,
                                       emphasis: true };
                        lastAtkPick.set(id, { mode: "emphasis", probs, intervals });
                    }
                }
                // v19 -- SAMPLED-SELECTION for kings: instead of argmax +
                // epsilon-uniform, the published pick is drawn from the
                // softmax over the repertoire's scores (T=0.35). Cleaner
                // IPS than epsilon: the propensity of the fired pick is
                // its softmax prob, directly; every pick explores in
                // proportion to its plausibility.
                {
                    // v20 -- eligibility: kings always (v19 proved it); ALL
                    // kaiju when BRAIN_ATK_SELECT=sampled (the A/B's B arm)
                    const kingIds = new Set(kaiju.filter(k2 => (ATK_SELECT === "sampled" ? true : k2.king) && k2.emphMode !== true).map(k2 => k2.id));
                    for (const id of Object.keys(scoredById)) {
                        if (!kingIds.has(id)) continue;
                        const rows2 = scoredById[id];
                        if (rows2.length < 2) continue;
                        // v23 -- per-domain temperature when a domain has
                        // adopted its own; the global atkT otherwise
                        const tEff = sweepState.dom[domainOf(id)]?.adoptedT ?? atkT;
                        const exps = rows2.map(r => Math.exp(r.s / tEff));
                        const Z = exps.reduce((a, b) => a + b, 0);
                        const probs = {}, scoresByName = {};
                        rows2.forEach((r, j) => { probs[r.name] = exps[j] / Z; scoresByName[r.name] = Math.round(r.s * 10000) / 10000; });
                        let u = Math.random(), pickName = rows2[rows2.length - 1].name;
                        for (let j = 0; j < rows2.length; j++) { u -= exps[j] / Z; if (u <= 0) { pickName = rows2[j].name; break; } }
                        attack[id] = { name: pickName,
                                       score: Math.round((rows2.find(r => r.name === pickName)?.s ?? 0) * 1000) / 1000,
                                       sampled: true };
                        lastAtkPick.set(id, { mode: "sampled", probs, scores: scoresByName });   // v21 -- scores for the sweep
                    }
                }
                // v9 -- remember what we published (and how many legal
                // options existed) so outcome-time propensities are exact:
                //   fired our argmax:  p = (1 - eps) + eps/n
                //   fired an explore:  p = eps / n
                {
                    const counts = {};
                    owners.forEach((o) => { counts[o.id] = (counts[o.id] || 0) + 1; });
                    for (const id of Object.keys(attack)) {
                        if (attack[id].emphasis || attack[id].sampled) continue;   // v18/v19 -- richer record already set
                        lastAtkPick.set(id, { name: attack[id].name,
                                              explore: !!attack[id].explore,
                                              n: counts[id] || 1 });
                    }
                }
            } catch (e) { console.error("[brain] attack mlp:", e.message); }
        }
    }
    stats.lastMs = performance.now() - t0;
    stats.solves++;

    // 3. publish (floats rounded to 2 decimals -- direction vectors do not
    //    need more, and it roughly halves the JSON)
    const round = (a) => Array.from(a, v => Math.round(v * 100) / 100);
    try {
        await fetch(BRIDGE + "/ai/brain/flowfield", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                partial: EFFECTIVE_ROLE !== "all",   // v5 -- bridge merges partial payloads (PATCH-B1b)
                role: EFFECTIVE_ROLE,
                tradeT: tradeT(),   // v41 -- brain-served trader boldness rides to the page
                escortThreshold: Math.round(escortThresholdServed * 100) / 100,   // v43 -- served tripwire
                escortThresholds: escortThresholdsBySys,   // v48 -- six local tripwires (null until data)
                factionBias: evBias(),   // v46/v47 -- live per-faction aggro bias
                biasABMag: biasABMagState.found ?? biasABMagState.mag,   // v49 -- the ladder's current dose
                ox: snap.ox, oz: snap.oz, cell: snap.cell, w: snap.w, h: snap.h,
                // v2207 -- WHO solved this, with how many sweeps, and how many it needed. A GPU field whose
                // controller wanted more sweeps than its cap allowed is TRUNCATED: far from the goal the
                // distances are wrong, the flow points nowhere, and a walker stalls against a wall. The CPU
                // backend is an exact Dijkstra and cannot truncate, so its `needed` is null and means so.
                solver: {
                    backend: (solver && typeof solver.backend === "string") ? solver.backend : _fieldBackend,   // v2213 -- live probe/guard state from the managed wrapper
                    iters: solver && solver.lastIters != null ? solver.lastIters : null,
                    needed: solver && solver.lastNeeded != null ? solver.lastNeeded : null,
                    iterCap: solver && solver.iterCap != null ? solver.iterCap : null,
                    impassDh: solver ? (solver.impassDh || 0) : 0,
                    truncated: !!(solver && solver.lastNeeded != null && solver.lastIters != null && solver.lastNeeded >= solver.lastIters),
                },
                fx: field ? round(field.fx) : null,
                fz: field ? round(field.fz) : null,
                // v2186 — the distance field itself. The maze walker's wall-escape descends
                // dist when the flow at its cell is blocked (corner clips, freshly drawn
                // walls before the next solve); without dist published, that fallback
                // silently returned null and the walker stalled at walls ("gets to a wall
                // and gives up"). 1 decimal is plenty (floor cost ≈1/cell); unreachable
                // (BIG=1e9) is pinned to exactly 1e8 so consumers' `< 1e8` reachability
                // checks still classify it as unreachable after rounding.
                dist: (field && field.dist) ? Array.from(field.dist, v => (v >= 1e7 ? 1e8 : Math.round(v * 10) / 10)) : null,
                pfx: playerField ? round(playerField.fx) : null,   // v11 -- player-seeking flow
                pfz: playerField ? round(playerField.fz) : null,
                // v2 -- threat distances capped + rounded to 1 decimal;
                // 1e8+ (unreachable) publishes as 9999 = "no threat here"
                threat: threat ? Array.from(threat, v => Math.round(Math.min(v, 9999) * 10) / 10) : null,
                aggro: DO_POLICY ? aggro : null,
                attack: DO_POLICY ? attack : null,
                civDef: DO_POLICY ? civDef : null,
                packOrder: DO_POLICY ? packOrder : null,
                learn: (LEARN && DO_POLICY && trainer) ? { attack: trainer.stats(), aggro: aggroTrainer.stats(), civdef: civDefTrainer.stats(), civtarget: civTgtTrainer.stats(), packorder: packOrdTrainer.stats(), domains: domainStats } : null,
                goals: snap.goals, solveMs: Math.round(stats.lastMs * 10) / 10,
                brainId, brainGpu, brainRole: EFFECTIVE_ROLE, brainKinds: (Deno.env.get("BRAIN_KINDS") ?? "").trim() || null,   // v2071 -- fleet scoring identity
                workMode, workPriority, workNavOnly,   // v2073 -- Phase B: task priority for the scheduler
                schedOptIn: SCHED_OPTIN,                // v2074 -- Phase C: consent to scheduling
                expBusy: (typeof diffAB !== "undefined" && diffAB && !diffAB.resolved) || (typeof diffABDgn !== "undefined" && diffABDgn && !diffABDgn.resolved) || false,   // v2074 -- mid-experiment: do not reassign now
                startTime: START_TIME,                  // v2088 -- for sibling arbitration
                ts: Date.now(),
            }),
        }).then(async (r) => {
            let j = null;
            try { j = await r.json(); } catch {}
            // v2088 -- sibling arbitration: if the bridge flagged us to retire
            // (a newer brain for our GPU+role took over, e.g. after an update),
            // step down gracefully -- save weights + replay, then exit. Checked
            // BEFORE the scheduling early-return so it always applies. Guard so
            // we only retire once.
            if (j && j.retire && !_retiring) {
                _retiring = true;
                console.log("[brain] bridge says a newer sibling superseded us -- retiring gracefully");
                try {
                    await saveReplays(REPLAY_PATH, {
                        attack: { trainer }, aggro: { trainer: aggroTrainer }, civdef: { trainer: civDefTrainer },
                    });
                } catch (e) { console.error("[brain] retire save:", e && e.message); }
                Deno.exit(0);
            }
            // v2074 -- Phase C: the scheduler's assignment rides back on the
            // POST response. Apply it ONLY at this safe boundary (a tick has
            // just completed) and ONLY when not mid-experiment -- expBusy in
            // the payload already told the bridge, but we double-check here so
            // a race cannot swap a role under a running A/B test.
            if (!SCHED_OPTIN) return;
            try {
                const expBusy = (typeof diffAB !== "undefined" && diffAB && !diffAB.resolved) ||
                                (typeof diffABDgn !== "undefined" && diffABDgn && !diffABDgn.resolved);
                if (j && j.assignRole && !expBusy) applyRole(j.assignRole);
            } catch {}
        }).catch(() => {});
    } catch { stats.errors++; }

    // v4/v5 -- one backprop minibatch per solve when there's experience;
    // hot-swap BOTH layers of the deep net; persist every 20 steps. Aggro
    // trains through the plain single-layer SGD path.
    if (LEARN && DO_POLICY && trainer && atkLayers && trainer.step()) {
        atkMlp.updateWeights(0, atkLayers[0].W, atkLayers[0].b);
        atkMlp.updateWeights(1, atkLayers[1].W, atkLayers[1].b);
        sinceSave++;
        if (sinceSave >= 20) {
            sinceSave = 0;
            await saveDeepWeights(WEIGHTS_PATH, atkLayers, trainer.steps);
        }
    }
    // v16 -- split-domain training: each head trains on its own outcomes;
    // BOTH also nudge the SHARED hidden layer (that is the experiment:
    // pooled representation, separated judgment), so any step re-uploads
    // L1 to the GPU net serving the kaiju.
    if (LEARN && DO_POLICY && SPLIT && domTrainers && atkLayers) {
        let l1Moved = false;
        for (const dom of ["dungeon", "raycaster", "ev", "fps"]) {   // v40
            if (domTrainers[dom].step()) { l1Moved = true; headsDirty++; }
        }
        if (l1Moved && atkMlp) atkMlp.updateWeights(0, atkLayers[0].W, atkLayers[0].b);
        if (headsDirty >= 20) {
            headsDirty = 0;
            try {
                const headsOut = {};   // v40 -- domain-generic save
                for (const dom of ["dungeon", "raycaster", "ev", "fps"])
                    headsOut[dom] = { W: [...atkHeads[dom].W], b: [...atkHeads[dom].b], steps: domTrainers[dom].steps };
                await Deno.writeTextFile(HEADS_PATH, JSON.stringify(headsOut));
            } catch {}
        }
    }
    if (LEARN && DO_POLICY && aggroW && aggroTrainer.step(aggroW)) {
        mlp.updateWeights(0, aggroW);
        if (aggroTrainer.steps % 20 === 0) await saveWeights(AGGRO_W_PATH, aggroW, aggroTrainer.steps);
    }
    // v6 -- civ-defense SGD (CPU scoring, no GPU buffer to hot-swap) +
    // periodic replay persistence riding the same cadence
    if (LEARN && DO_POLICY && civDefW && civDefTrainer.step(civDefW)) {
        if (civDefTrainer.steps % 20 === 0) await saveWeights(CIVDEF_W_PATH, civDefW, civDefTrainer.steps);
    }
    if (LEARN && DO_POLICY && civTgtW && civTgtTrainer.step(civTgtW)) {
        if (civTgtTrainer.steps % 20 === 0) await saveWeights(CIVTGT_W_PATH, civTgtW, civTgtTrainer.steps);
    }
    if (LEARN && DO_POLICY && packOrdW && packOrdTrainer.step(packOrdW)) {
        if (packOrdTrainer.steps % 20 === 0) await saveWeights(PACKORD_W_PATH, packOrdW, packOrdTrainer.steps);
    }

    // v7 -- experience sharing: push fresh local samples, pull peers'.
    // Foreign samples enter buffers only (never re-shared -- no echo).
    if (LEARN && DO_POLICY && SHARE) {
        try {
            const fresh = [];
            for (const [pol, tr] of [["attack", trainer], ["aggro", aggroTrainer],
                                     ["civdef", civDefTrainer], ["civtarget", civTgtTrainer]]) {
                for (const s of tr.drainNew()) fresh.push({ pol, x: s.x, r: s.r });
            }
            if (fresh.length) {
                await fetch(BRIDGE + "/ai/brain/experience", {
                    method: "POST", headers: { "content-type": "application/json" },
                    body: JSON.stringify({ from: INSTANCE, samples: fresh }),
                });
            }
            const r = await fetch(BRIDGE + `/ai/brain/experience?after=${shareCursor}&exclude=${INSTANCE}`);
            const j = await r.json();
            if (j?.ok) {
                shareCursor = j.seq ?? shareCursor;
                const byPol = { attack: [], aggro: [], civdef: [], civtarget: [], packorder: [] };
                for (const s of j.samples || []) if (byPol[s.pol]) byPol[s.pol].push(s);
                if (byPol.attack.length && trainer) trainer.ingestForeign(byPol.attack, ATK_FEATURES);
                aggroTrainer.ingestForeign(byPol.aggro, FEATURES);
                civDefTrainer.ingestForeign(byPol.civdef, CIVDEF_FEATURES);
                civTgtTrainer.ingestForeign(byPol.civtarget, CIVTARGET_FEATURES);
                if (byPol.packorder) packOrdTrainer.ingestForeign(byPol.packorder, 4);
            }
        } catch {}
    }

    // v7 -- milestones: probe the live nets every 100 attack steps; report
    // decision flips + civ hold-radius drift to /sys/logs (server.html).
    if (LEARN && DO_POLICY && trainer) {
        for (const line of watcher.evaluate(atkLayers, civDefW, trainer.steps)) {
            reportMilestone(BRIDGE, line, NARRATE === "ollama");   // fire-and-forget
        }
        // v7 -- weight snapshots every 500 steps: the before/after artifact.
        if (trainer.steps - lastSnapStep >= SNAP_EVERY) {
            lastSnapStep = trainer.steps;
            try {
                const dir = _localPath("./snapshots/");
                await Deno.mkdir(dir, { recursive: true });
                await saveDeepWeights(dir + `weights_attack.${trainer.steps}.json`, atkLayers, trainer.steps);
                // v8 -- snapshot the linear policies too, so the report
                // generator can chart every policy's drift
                if (aggroW)  await saveWeights(dir + `weights_aggro.${trainer.steps}.json`, aggroW, aggroTrainer.steps);
                if (civDefW) await saveWeights(dir + `weights_civdef.${trainer.steps}.json`, civDefW, civDefTrainer.steps);
                if (civTgtW) await saveWeights(dir + `weights_civtarget.${trainer.steps}.json`, civTgtW, civTgtTrainer.steps);
                console.log(`[brain] snapshot saved @ ${trainer.steps} steps (all policies)`);
            } catch (e) { console.error("[brain] snapshot:", e.message); }
        }
    }
    if (LEARN && DO_POLICY && trainer && (stats.solves % 50) === 0) {
        await saveReplays(REPLAY_PATH, {
            attack: { trainer }, aggro: { trainer: aggroTrainer }, civdef: { trainer: civDefTrainer },
        });
    }
}

// v2073 -- Phase A: a CPU fields brain never touches the GPU, so it must
// NOT call initGPU() (which hard-refuses a software adapter by design).
// It reports a CPU device descriptor instead and runs on any box.
let device = null, desc;
if (CPU_FIELDS) {
    desc = "CPU (" + (Deno.build?.arch || "cpu") + ", exact Dijkstra fields)";
    console.log("[gpu] skipped -- CPU fields brain (BRAIN_BACKEND=cpu)");
} else {
    ({ device, desc } = await initGPU());
}
// v2071 -- brain identity for fleet scoring: the bridge cannot rank
// brains it cannot tell apart. A stable-per-process id (gpu + role +
// pid) plus the human-readable gpu name and role ride in every field
// POST, so the bridge can build a per-brain speed scoreboard and a
// routing recommendation. BRAIN_ID overrides for pinned fleet naming.
const brainId = (Deno.env.get("BRAIN_ID") || `${desc}|${ROLE}|${Deno.pid}`).slice(0, 80);
const brainGpu = desc;
// v2148 -- the brain never printed its own version, so a stale brain.js launched
// from an OLD extracted folder looked identical to a fresh one while the server
// window announced the new version. Print the build AND the absolute file path
// Deno actually loaded, so "which brain am I running" is never a guess again.
const BRAIN_BUILD = "v3994";   // v3994 -- Lotka-Volterra predator-prey device: the time-average theorem
// and Volterra's principle (harvesting BOTH species raises the average prey). Nothing in the brain models
// ecology; this bump is the ritual marker.
// v3993 -- kepler gains the explicit-Euler companion: a matched first-order
// pair (explicit vs semi-implicit Euler) that isolates SYMPLECTICITY from ORDER, which verlet-vs-rk4 cannot.
// Nothing in the brain integrates orbits; this bump is the ritual marker.
// v3992 -- requested-stop exit code. exitNow() exits 20 instead of 0 so a shutdown
// the server was ASKED for stops landing in swek_exit_report.bat's RC==0 "this window should have kept serving"
// box. Nothing in the brain reads the bridge's exit code; this bump is the ritual marker.
// v2408 -- collapse the repetitive per-tick status into a single in-place spinner line (like the KPop listener), so a
// long idle run doesn't scroll hundreds of identical lines. On a real TTY it rewrites one line; when piped/redirected
// it falls back to plain lines so logs stay grep-able.
const _SPIN = ["|", "/", "-", "\\"]; let _spinI = 0;
function _logStatus(line) {
    if (process.stdout && process.stdout.isTTY) process.stdout.write("\r\x1b[2K[brain] " + _SPIN[_spinI++ & 3] + " " + line);
    else console.log("[brain] " + line);
}
console.log(`[brain] build ${BRAIN_BUILD}`);
console.log(`[brain] loaded from: ${_localPath(import.meta.url)}`);
console.log(`[brain] bridge=${BRIDGE} rate=${HZ}Hz`);
console.log(`[brain] running on: ${desc}`);
console.log(`[brain] fleet id: ${brainId} (role=${ROLE})`);

// v6 -- graceful shutdown: ctrl+c saves weights + replay buffers before
// exit, so a brain stopped mid-evening loses nothing.
try {
    Deno.addSignalListener("SIGINT", async () => {
        console.log("[brain] SIGINT -- saving weights + replay buffers");
        // v13 -- match recap: one war-summary line through the milestone
        // route (BRAIN_NARRATE=ollama turns it into prose). Fire-and-forget
        // with a short grace so the POST can leave before exit.
        try {
            const kinds = KINDS_FILTER ? [...KINDS_FILTER].join(",") : "all";
            const line = `[brain] match recap (${kinds}): ${recap.orders} orders issued, ` +
                `${recap.focusOrders} focus / ${recap.orders - recap.focusOrders} free-hunt, ` +
                `${recap.flips} changes of mind (bold ${recap.byTemper.bold}, wary ${recap.byTemper.wary}, even ${recap.byTemper.even}); ` +
                `attack policy at ${trainer?.steps ?? 0} training steps`;
            reportMilestone(BRIDGE, line, NARRATE === "ollama");
            saveRegime();   // v17 -- verdict data survives the session
            saveSelectStats();   // v20
            const v17line = regimeVerdict();
            if (v17line) reportMilestone(BRIDGE, v17line, NARRATE === "ollama");
            await new Promise(r => setTimeout(r, 400));
        } catch {}
        try {
            if (atkLayers && trainer) await saveDeepWeights(WEIGHTS_PATH, atkLayers, trainer.steps);
            if (aggroW) await saveWeights(AGGRO_W_PATH, aggroW, aggroTrainer.steps);
            if (civDefW) await saveWeights(CIVDEF_W_PATH, civDefW, civDefTrainer.steps);
            if (trainer) await saveReplays(REPLAY_PATH, {
                attack: { trainer }, aggro: { trainer: aggroTrainer }, civdef: { trainer: civDefTrainer },
            });
        } catch (e) { console.error("[brain] shutdown save:", e.message); }
        Deno.exit(0);
    });
} catch {}

let lastLog = 0;

// v2088 -- sibling handshake. Before the first solve, tell the bridge we exist.
// If a live sibling (same GPU + role) is already running, newest-wins: either
// we supersede it (the bridge flags the old one to retire) or, if an even-newer
// brain is already live, we bow out now instead of duplicating work. This is
// the in-band answer to "shouldn't a brain notice another brain?" -- yes, via
// the bridge that already tracks every brain's identity. The v2087 process-kill
// stays as belt-and-suspenders for a wedged brain that can't self-report.
const START_TIME = Date.now();
// v2451 -- say hello REPEATEDLY, not once. The original said hello exactly once at boot and swallowed the failure if
// the bridge was not up yet ("the poller tolerates that") -- but the BRIDGE does not tolerate it: a brain that never
// registered reads as offline forever, however alive it is. And since the fleet entry expires after 60s, an idle brain
// that registered perfectly would vanish anyway. So this now runs on a timer: it recovers from a bridge that was down
// at boot, and it keeps an IDLE brain visible as idle instead of dead. Failure stays silent and non-fatal.
async function sayHello(first) {
    try {
        const hello = await fetch(BRIDGE + "/ai/brain/hello", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ brainId, brainGpu, brainRole: EFFECTIVE_ROLE, startTime: START_TIME }),
        }).then(r => r.json()).catch(() => null);
        if (!hello) return false;
        if (hello.proceed === false) {
            console.log(`[brain] a newer sibling for ${brainGpu}|${EFFECTIVE_ROLE} is already live -- stepping aside (${hello.reason || ""})`);
            Deno.exit(0);
        }
        if (first && hello.sibling && hello.sibling.action === "retiring-old") {
            console.log(`[brain] superseding an older sibling on ${brainGpu}|${EFFECTIVE_ROLE}; it will retire on its next tick`);
        }
        return true;
    } catch { return false; }   /* bridge not up yet -> the timer will try again */
}
let _helloOk = await sayHello(true);
if (!_helloOk) console.log("[brain] bridge did not answer hello yet -- will keep announcing; the panel will show me as idle once it does");
let _lastHello = Date.now();

let _retiring = false;
while (true) {
    const t0 = performance.now();
    try { await tick(device); } catch (e) { stats.errors++; console.error("[brain] tick:", e.message); }
    // being alive is worth saying even when there is nothing to solve
    if (Date.now() - _lastHello > 15000) { _lastHello = Date.now(); const ok = await sayHello(false); if (ok && !_helloOk) { _helloOk = true; console.log("[brain] bridge is answering now -- registered"); } }
    if (performance.now() - lastLog > 10000) {
        lastLog = performance.now();
        // v2068 -- trainer null-guard: the trainer is lazily constructed
        // inside tick() only once attack data arrives (line ~1751); on a
        // fresh boot with an empty world it stays null past the first 10s
        // log tick. Every other site guards with `trainer &&` -- this one
        // did not, and crashed the brain before a single kaiju fired.
        const L = trainer ? trainer.stats() : null;
        _logStatus(L
            ? `solves=${stats.solves} skips=${stats.skips} errors=${stats.errors} lastSolve=${stats.lastMs.toFixed(1)}ms | learn: steps=${L.steps} buffer=${L.buffer} avgReward=${L.avgReward}`
            : `solves=${stats.solves} skips=${stats.skips} errors=${stats.errors} lastSolve=${stats.lastMs.toFixed(1)}ms | learn: idle (no attack data yet -- start any GPU Brain demo to begin training)`);
    }
    const spent = performance.now() - t0;
    await new Promise(r => setTimeout(r, Math.max(25, TICK_MS - spent)));
}

// WebGLEngine/brain/subAvoidLossAudit.mjs -- the nav loss audit (backlog `nav-avoid-loss-audit`, brain/SUB_FIELD_NAV_WIP.md). POST-HOC, said plainly: a reading of flights already
// recorded (HELD10-12, brain/subAvoidHeld10/11/12.*.jsonl), not a test; it names a lever for the next registered round and decides nothing by itself.
//   node brain/subAvoidLossAudit.mjs   -> one line per loss, then the tallies.
// Each lost flight is flown again with a per-tick trace by a copy of brain/subAvoidNav.mjs's flyAvoid loop (the module itself is not touched); the copy must reproduce the recorded
// status, hit, ticks and path exactly, or the audit stops.
import fs from "node:fs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as ST from "./subTask.mjs";
import * as MT from "./missionTask.mjs";
import * as N from "./subFieldNav.mjs";
import * as H from "./subHardNav.mjs";
import * as A from "./subAvoidNav.mjs";
import * as AP from "./autopilotSub.mjs";
const pilot = (s, t, c) => AP.decide(s, t, c), model = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 }));
const HOW = { "any+predict+edge+avoid-arc": "arc", "any+predict+edge+avoid-arc-edge": "arc-edge", "any+predict+edge+avoid-arc-edge-least": "arc-edge-least" };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a)), deg = (a) => Math.round(a * 180 / Math.PI);
function trace(sc, armName) {   // flyAvoid's loop, with every tick kept
    const how = HOW[armName], arm = "any+predict+edge", spec = H.ARM_SPEC[arm], dt = S.DT, total = Math.round(H.SECONDS_HARD / dt), st = sc.start, every = Math.max(1, Math.round(H.REPLAN_S / dt)), mode = "predict";
    let field = H.buildLadderField(H.planShapes(sc, 0, { mode, blind: false, horizon: H.HORIZON_S }), sc.goal, st, { ladder: H.MARGIN_LADDER, edgeExtra: spec.edge });
    let s = S.createState({ pos: [st.x, st.y, -st.depth], speed: st.speed, heading: st.heading, pitch: st.pitch, bank: st.bank, gamma: 0, w: [0, 0, 0], model });
    const clearAt = (x, y, depth, tt) => sc.obstacles.reduce((m, o) => Math.min(m, H.gapTo(o, x, y, depth, tt)), Infinity);
    let status = "timeout", path = 0, ticks = 0, hit = null; const T = [];
    for (let i = 0; i < total; i++) {
        if (i > 0 && i % every === 0) field = H.buildLadderField(H.planShapes(sc, i * dt, { mode, blind: false, horizon: H.HORIZON_S }), sc.goal, { x: s.pos[0], y: s.pos[1] }, { ladder: H.MARGIN_LADDER, own: { x: s.pos[0], y: s.pos[1] }, edgeExtra: spec.edge });
        let target = H.hardTarget(arm, s, field, sc.goal, { obstacles: sc.obstacles, t: i * dt, at: H.posAt, minDepth: sc.minDepth, yieldSpeed: H.YIELD_SPEED });
        const hc = S.attitude(s).heading, h0 = target.heading;
        const a = A.avoidHeadingArc(s.pos[0], s.pos[1], i * dt, hc, h0, sc.obstacles, sc.minDepth, { edge: how !== "arc", least: how === "arc-edge-least" });
        target = { ...target, heading: a.heading };
        T.push({ t: i * dt, x: s.pos[0], y: s.pos[1], hc, h0, h: a.heading, fired: a.fired, turned: a.turned, stuck: a.stuck,
            planShip: A.conflictArc(s.pos[0], s.pos[1], i * dt, hc, h0, sc.obstacles, sc.minDepth), planStatic: A.conflictArc(s.pos[0], s.pos[1], i * dt, hc, h0, sc.obstacles, sc.minDepth, { ships: false, statics: true }),
            planEdge: A.conflictArc(s.pos[0], s.pos[1], i * dt, hc, h0, [], sc.minDepth, { ships: false, edge: true }) });
        const cv = ST.currentAt(sc.current, i * dt), res = S.stepSub(model, s, pilot(s, target, cv), dt, cv, sc.weightError), px = s.pos[0], py = s.pos[1];
        s = res.state; ticks++;
        if (res.status !== "submerged") { status = res.status; break; }
        const x = s.pos[0], y = s.pos[1], now = (i + 1) * dt; path += Math.hypot(x - px, y - py);
        if (clearAt(x, y, -s.pos[2], now) < 0) { status = "collided"; hit = (sc.obstacles.find((o) => H.gapTo(o, x, y, -s.pos[2], now) < 0) || {}).type || null; break; }
        if (x < N.REGION.x0 || x > N.REGION.x1 || y < N.REGION.y0 || y > N.REGION.y1) { status = "left"; break; }
        if (MT.reached(s, sc.goal)) { status = "reached"; break; }
    }
    return { status, hit, ticks, path, T, end: { x: s.pos[0], y: s.pos[1] } };
}
const files = fs.readdirSync("brain").filter((f) => /^subAvoidHeld1[012]\.\d+\.jsonl$/.test(f)).sort();
const recs = files.flatMap((f) => fs.readFileSync(`brain/${f}`, "utf8").trim().split("\n").map((l) => ({ set: f.split(".")[0].replace("subAvoid", ""), ...JSON.parse(l) })));
const bySeed = {}; for (const r of recs) (bySeed[`${r.set}:${r.seed}`] ||= []).push(r);
const losses = recs.filter((r) => !r.reached), rows = [], W = Math.round(10 / S.DT);
for (const r of losses) {
    const sc = H.hardScenario(r.seed, r.kind), tr = trace(sc, r.arm);
    if (tr.status !== r.status || tr.hit !== r.hit || tr.ticks !== r.ticks || Math.abs(tr.path - r.path) > 1e-9) throw new Error(`audit copy does not reproduce ${r.set} seed ${r.seed} ${r.arm}: ${tr.status}/${tr.hit}/${tr.ticks} against ${r.status}/${r.hit}/${r.ticks}`);
    const last = tr.T.slice(-W), frac = (k) => last.filter((q) => q[k]).length / last.length, fin = tr.T[tr.T.length - 1], R = N.REGION;
    const edgeDist = Math.min(fin.x - R.x0, R.x1 - fin.x, fin.y - R.y0, R.y1 - fin.y), side = tr.status !== "left" ? "" : [["x0", tr.end.x < R.x0], ["x1", tr.end.x > R.x1], ["y0", tr.end.y < R.y0], ["y1", tr.end.y > R.y1]].filter(([, v]) => v).map(([k]) => k).join("+");
    const state = frac("stuck") >= 0.5 ? "stuck" : frac("turned") >= 0.5 ? "turning" : frac("fired") > 0 ? "mixed" : "quiet";
    const planTrouble = last.some((q) => q.planShip) ? "ship" : last.some((q) => q.planStatic) ? "static" : last.some((q) => q.planEdge) ? "edge" : "none";
    const other = bySeed[`${r.set}:${r.seed}`].filter((o) => o.arm !== r.arm).map((o) => o.status).join("/");
    rows.push({ set: r.set, seed: r.seed, arm: r.arm.replace("any+predict+edge+", ""), loss: r.status === "collided" ? r.hit : r.status + (side ? ":" + side : ""), t: fin.t, goal: Math.hypot(sc.goal.x - fin.x, sc.goal.y - fin.y), edgeDist, state,
        stuck: frac("stuck"), turned: frac("turned"), planTrouble, offPlan: deg(Math.abs(wrap(fin.h - fin.h0))), lag: deg(Math.abs(wrap(fin.h - fin.hc))), shipSpeed: r.shipSpeed, other });
}
console.log("POST-HOC: a reading of recorded flights, not a test.  (set seed arm | loss | t | to goal | to edge | rule over the last 10 s | the plan's heading over the last 10 s in trouble with | |flown - plan| | |commanded - actual| | ship speed | other arm)");
for (const q of rows) console.log(`${q.set} ${q.seed} ${q.arm} | ${q.loss} | ${q.t.toFixed(0)} s | ${q.goal.toFixed(0)} m | ${q.edgeDist.toFixed(0)} m | ${q.state} (stuck ${(q.stuck * 100).toFixed(0)} %, turned ${(q.turned * 100).toFixed(0)} %) | ${q.planTrouble} | ${q.offPlan} deg | ${q.lag} deg | ${q.shipSpeed.toFixed(2)} | ${q.other}`);
const tally = (key) => { const c = {}; for (const q of rows) { const k = `${q.arm} ${typeof key === "function" ? key(q) : q[key]}`; c[k] = (c[k] || 0) + 1; } return Object.entries(c).sort().map(([k, v]) => `  ${v}  ${k}`).join("\n"); };
console.log(`\n${rows.length} losses in ${recs.length} flights\nby loss:\n${tally("loss")}\nby the rule's state:\n${tally("state")}\nby loss and state:\n${tally((q) => q.loss.split(":")[0] + " / " + q.state)}\nby loss and the plan's trouble:\n${tally((q) => q.loss.split(":")[0] + " / plan " + q.planTrouble)}`);
console.log(`goal distance at loss (median, m): ${["collided", "left"].map((k) => { const g = rows.filter((q) => (k === "left") === q.loss.startsWith("left")).map((q) => q.goal).sort((a, b) => a - b); return `${k} ${g.length ? g[Math.floor(g.length / 2)].toFixed(0) : "-"}`; }).join(", ")}`);

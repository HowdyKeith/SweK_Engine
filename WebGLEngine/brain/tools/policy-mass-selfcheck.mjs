// WebGLEngine/brain/tools/policy-mass-selfcheck.mjs — v2540
//
// Run: node brain/tools/policy-mass-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The whole value of this tool is that it can say BACKWARDS. A tool that can only ever report "looks fine" is
// decoration -- it would pass on a brain that had learned to lose. So these build traces where the answer is
// known by construction and check it finds them.
import { parseTrace, massVsMerit, spearman, verdict, syntheticTrace, DEMO_TRACES, analyseTrace } from "./policy-mass.mjs";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// Build a trace in the REAL record shape (read off brain/trace.mjs, not remembered).
// mass[i] = the softmax weight the brain gives option i;  merit[i] = the rate it actually hits.
// The generator now lives in policy-mass.mjs so the PAGE demonstrates the tool with the SAME known-answer
// traces the gate proves it on. This thin wrapper keeps the positional call sites below unchanged.
const trace = (mass, merit, n = 400, seed = 7) => syntheticTrace({ mass, merit, n, seed });

// ---- 1. Spearman itself, before trusting anything built on it ---------------------------------------------
{
    ok("perfectly agreeing orders -> +1", Math.abs(spearman([1, 2, 3, 4], [10, 20, 30, 40]) - 1) < 1e-9);
    ok("perfectly opposed orders -> -1", Math.abs(spearman([1, 2, 3, 4], [40, 30, 20, 10]) + 1) < 1e-9);
    ok("fewer than 3 points -> null, not a number", spearman([1, 2], [2, 1]) === null);
    // ALL TIES must not report a correlation. Without the tie handling this returns a confident fake.
    ok("all values tied -> null, not a fake -1", spearman([5, 5, 5, 5], [1, 2, 3, 4]) === null);
}

// ---- 2. THE ONE THAT MATTERS: it must catch a BACKWARDS policy ---------------------------------------------
{
    // mass descending, merit ASCENDING: the brain confidently picks the worst option.
    const t = parseTrace(trace([0.5, 0.3, 0.15, 0.05], [0.1, 0.3, 0.6, 0.9], 1200));
    const m = massVsMerit(t.recs);
    const d = m.domains.attack;
    ok("A BACKWARDS POLICY IS CAUGHT", d.rho !== null && d.rho < -0.5,
       "rho = " + (d.rho === null ? "null" : d.rho.toFixed(3)) + "  -> " + verdict(d.rho, d.rows.length).text);
}

// ---- 3. ...and must NOT cry wolf on a good policy -----------------------------------------------------------
{
    const t = parseTrace(trace([0.5, 0.3, 0.15, 0.05], [0.9, 0.6, 0.3, 0.1], 1200));
    const m = massVsMerit(t.recs);
    const d = m.domains.attack;
    ok("a policy that favours what works reads +ve", d.rho !== null && d.rho > 0.5,
       "rho = " + (d.rho === null ? "null" : d.rho.toFixed(3)) + "  -> " + verdict(d.rho, d.rows.length).text);
}

// ---- 4. ...and must say "noise" when it is noise ------------------------------------------------------------
{
    // every option equally good: mass cannot correlate with merit because merit is flat
    const t = parseTrace(trace([0.4, 0.3, 0.2, 0.1], [0.5, 0.5, 0.5, 0.5], 2000));
    const m = massVsMerit(t.recs);
    const d = m.domains.attack;
    ok("flat merit does not produce a confident verdict", d.rho === null || Math.abs(d.rho) < 0.85,
       "rho = " + (d.rho === null ? "null" : d.rho.toFixed(3)));
}

// ---- 5. it only reads sampled records, and says so ----------------------------------------------------------
{
    // p is ONLY written on mode === "sampled". Records from the argmax path carry no p and MUST be ignored
    // rather than counted as p = 0, which would drag every mass toward zero and invent a correlation.
    const lines = [JSON.stringify({ t: "session", at: 1 })];
    for (let i = 0; i < 100; i++) lines.push(JSON.stringify({ t: "d", seq: i, id: "u", dom: "attack", choice: "opt0", mode: "emphasis", hit: 1 }));
    for (let i = 0; i < 40; i++) lines.push(JSON.stringify({ t: "d", seq: 200 + i, id: "u", dom: "attack", choice: "opt1", mode: "sampled", hit: 0, p: 0.7 }));
    const m = massVsMerit(parseTrace(lines.join("\n")).recs);
    ok("records with no p are ignored, not counted as zero", m.sampledN === 40, m.sampledN + " sampled of 140 total");
    ok("...and the domain only counts the sampled ones", m.domains.attack.n === 40);
}

// ---- 6. rare options are dropped, not reported ---------------------------------------------------------------
{
    // An option picked twice has a hit rate of 0%, 50% or 100%. Ranking it against an option picked 300 times is
    // how you get a confident verdict out of nothing.
    const lines = [JSON.stringify({ t: "session", at: 1 })];
    for (let i = 0; i < 300; i++) lines.push(JSON.stringify({ t: "d", seq: i, id: "u", dom: "attack", choice: "common", mode: "sampled", hit: i % 2, p: 0.9 }));
    for (let i = 0; i < 2; i++) lines.push(JSON.stringify({ t: "d", seq: 900 + i, id: "u", dom: "attack", choice: "rare", mode: "sampled", hit: 1, p: 0.1 }));
    const m = massVsMerit(parseTrace(lines.join("\n")).recs, { minN: 12 });
    const names = m.domains.attack.rows.map((r) => r.name);
    ok("an option seen twice is dropped, not ranked", !names.includes("rare") && names.includes("common"),
       "kept: " + JSON.stringify(names) + ", dropped " + m.domains.attack.dropped);
}

// ---- 7. a verdict on 3 options does not get to sound confident ------------------------------------------------
{
    ok("too few options -> the verdict says so", verdict(0.99, 3).cls === "dim", verdict(0.99, 3).text);
    ok("...but 5 options with rho +0.9 does read as learning", verdict(0.9, 5).cls === "ok");
}

// ---- 8. the real trace shape parses ---------------------------------------------------------------------------
{
    const real = '{"t":"session","at":1784229115729,"build":"unknown","pid":4242}\n' +
                 '{"t":"d","seq":1,"id":"u0","dom":"attack","choice":"opt2","mode":"emphasis","hit":0,"p":0.5812613554298878}\n' +
                 '{"t":"d","seq":2,"id":"u1","dom":"aggro","choice":"opt3","mode":"sampled","hit":1,"p":0.31}\n' +
                 '{"t":"truncated","after":200000,"why":"cap"}';
    const t = parseTrace(real);
    ok("the real record shape parses", t.recs.length === 2 && t.head.pid === 4242 && t.truncated.after === 200000);
}

// ---- 9. the FRONT-DOOR path: the demos the page shows, through the same analyse the bridge calls -------------
{
    // The page has no real BRAIN_TRACE to point at (capture is off by default), so it demonstrates on these three
    // known-answer traces. If the demo the page shows and the answer the gate proved ever diverged, the page
    // would be theatre. So run the SAME generator through the SAME analyse the bridge uses, and check each lands
    // where its name promises.
    const a = analyseTrace(syntheticTrace(DEMO_TRACES.backwards)).domains.attack;
    ok("DEMO backwards -> the page will render it as BACKWARDS", a.rho < -0.5 && a.verdict.cls === "hot",
       "rho = " + a.rho.toFixed(3) + " cls=" + a.verdict.cls);
    const b = analyseTrace(syntheticTrace(DEMO_TRACES.learning)).domains.attack;
    ok("DEMO learning -> renders as learning (green)", b.rho > 0.5 && b.verdict.cls === "ok",
       "rho = " + b.rho.toFixed(3) + " cls=" + b.verdict.cls);
    const c = analyseTrace(syntheticTrace(DEMO_TRACES.noise)).domains.attack;
    ok("DEMO noise -> does NOT read as a confident verdict", c.rho === null || Math.abs(c.rho) < 0.85,
       "rho = " + (c.rho === null ? "null" : c.rho.toFixed(3)));
    // analyseTrace on an empty / no-p trace must return an ANSWER (sampledN 0), not throw -- that is the state a
    // page that uploads a real-but-argmax-only trace lands in, and it must not look like a crash.
    const empty = analyseTrace('{"t":"session","at":1}\n{"t":"d","seq":1,"id":"u","dom":"attack","choice":"o","mode":"emphasis","hit":1}');
    ok("analyse of a no-p trace is an answer, not a throw", empty.sampledN === 0 && Object.keys(empty.domains).length === 0,
       "sampledN=" + empty.sampledN);
}

console.log(fails ? "\npolicy-mass-selfcheck: " + fails + " FAILED" : "\npolicy-mass-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);

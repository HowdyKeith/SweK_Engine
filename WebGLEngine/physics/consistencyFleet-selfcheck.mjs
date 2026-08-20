// WebGLEngine/physics/consistencyFleet-selfcheck.mjs — v3285
//
// Run: node physics/consistencyFleet-selfcheck.mjs   (~40s — MEASURED; two routes are really executed)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// The board going fleet-wide brings one tempting mistake with it: run the SAME route on two machines, watch the
// numbers agree, record a pair. They will agree -- the code is seeded and deterministic -- and the agreement
// carries no information about the physics. Most of this gate is about refusing that, because a board that
// certifies empty agreements is worse than no board: it looks like evidence.

import { ROUTES, runRoute, foldRoute, admissible, assemble, fleetLines, SCHEMA_VERSION } from "./consistencyFleet.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const synth = (routeId, host, value) => ({ kind: "swek-consistency-route", schemaVersion: SCHEMA_VERSION,
    routeId, pair: ROUTES[routeId].pair, side: ROUTES[routeId].side, mechanism: ROUTES[routeId].mechanism,
    value, host, at: new Date().toISOString(), ms: 1 });

// ---- 1. EMPTY IS NOT AGREEMENT --------------------------------------------------------------------------------
{
    const a = assemble({});
    ok("!! an empty fleet claims NO pairs and says so (no report is not the same as no disagreement)",
       a.pairs.length === 0 && fleetLines(a).some((l) => /not the same as no disagreement/.test(l)));
}

// ---- 2. ONE SIDE IS INCOMPLETE, NEVER AGREE ---------------------------------------------------------------------
{
    let st = foldRoute({}, synth("ising-tc/binder", "hostA", 2.2379));
    const a = assemble(st);
    ok("!! one side reporting is INCOMPLETE, not agreement",
       a.pairs.length === 0 && a.incomplete.length === 1 && /INCOMPLETE is not AGREE/.test(a.incomplete[0].why));
}

// ---- 3. THE MISTAKE: SAME ROUTE, TWO MACHINES -------------------------------------------------------------------
{
    let st = foldRoute({}, synth("ising-tc/binder", "hostA", 2.2379));
    st = foldRoute(st, synth("ising-tc/binder", "hostB", 2.2379));
    const a = assemble(st);
    ok("!! the SAME route on two hosts forms NO pair, however exactly the numbers agree",
       a.pairs.length === 0,
       "two hosts reported 2.2379 and 2.2379 — identical, deterministic, and carrying no information about the physics");
    ok("!! ...and it is labelled REPRODUCIBILITY rather than silently dropped (the work was real, the claim is different)",
       a.reproducibility.length === 1 && a.reproducibility[0].hosts.length === 2,
       a.reproducibility[0].note);
    const adm = admissible({ pair: "P", mechanism: "m1", host: "hostA" }, { pair: "P", mechanism: "m1", host: "hostB" });
    ok("!! admissible() refuses same-mechanism explicitly, and names hosts as no substitute",
       !adm.ok && /does not make it two mechanisms/.test(adm.why), adm.why);
}

// ---- 4. TWO MECHANISMS ON TWO HOSTS: A REAL PAIR, AND STRONGER FOR IT ---------------------------------------------
{
    let st = foldRoute({}, synth("ising-tc/binder", "hostA", 2.2379));
    st = foldRoute(st, synth("ising-tc/fisher", "hostB", 2.2209));
    const a = assemble(st);
    ok("!! two mechanisms on two hosts DO form a pair, and the cross-host independence is recorded",
       a.pairs.length === 1 && a.pairs[0].agree && a.pairs[0].crossHost,
       a.pairs[0].independence + " | diff " + a.pairs[0].diff.toFixed(4) + " tol " + a.pairs[0].tol.toFixed(4));
    ok("...and the same two mechanisms on ONE host still pair, just without the bonus dimension",
       (() => { let s2 = foldRoute({}, synth("ising-tc/binder", "solo", 2.2379));
                s2 = foldRoute(s2, synth("ising-tc/fisher", "solo", 2.2209));
                const r = assemble(s2); return r.pairs.length === 1 && !r.pairs[0].crossHost; })());
}

// ---- 5. THE HUB RE-GRADES: A SUBMITTED VERDICT IS NOT BELIEVED, IT IS REFUSED --------------------------------------
{
    const lying = { ...synth("ising-tc/fisher", "hostB", 9.9999), agree: true };
    const st = foldRoute(foldRoute({}, synth("ising-tc/binder", "hostA", 2.2379)), lying);
    const a = assemble(st);
    ok("!! a report carrying its own verdict is REJECTED at fold time (peers measure, the hub grades)",
       st.rejected.length === 1 && /VERDICT/.test(st.rejected[0].why), st.rejected[0].why);
    ok("...so the fabricated agreement never reaches the board at all",
       a.pairs.length === 0 && a.incomplete.length === 1);

    // and a plain wrong value simply disagrees -- the hub computes it from the two numbers
    let st2 = foldRoute({}, synth("ising-tc/binder", "hostA", 2.2379));
    st2 = foldRoute(st2, synth("ising-tc/fisher", "hostB", 2.9000));
    const a2 = assemble(st2);
    ok("!! agreement is COMPUTED BY THE HUB from the two numbers, so a wrong value reads DISAGREE",
       a2.pairs.length === 1 && !a2.pairs[0].agree,
       "diff " + a2.pairs[0].diff.toFixed(4) + " against tol " + a2.pairs[0].tol.toFixed(4));
}

// ---- 6. A PEER CANNOT RELABEL ITS OWN MECHANISM ---------------------------------------------------------------------
{
    // submit the binder route while CLAIMING to be the fisher mechanism, to sneak a same-route pair past the rule
    const forged = { ...synth("ising-tc/binder", "hostB", 2.2379), mechanism: "fisher-amplitude-ratio", side: "b" };
    let st = foldRoute({}, synth("ising-tc/binder", "hostA", 2.2379));
    st = foldRoute(st, forged);
    const a = assemble(st);
    ok("!! the mechanism is looked up LOCALLY from the routeId, so a relabelled report cannot forge independence",
       a.pairs.length === 0 && a.reproducibility.length === 1,
       "a peer claiming a different mechanism for the same route is still one mechanism run twice");
}

// ---- 7. MALFORMED REPORTS ARE RECORDED, NEVER GUESSED AT --------------------------------------------------------------
{
    let st = {};
    for (const bad of [
        { kind: "something-else", routeId: "ising-tc/binder", value: 1, host: "h" },
        { ...synth("ising-tc/binder", "h", 1), routeId: "no-such-route" },
        { ...synth("ising-tc/binder", "h", 1), value: NaN },
        { ...synth("ising-tc/binder", "", 1) },
        { ...synth("ising-tc/binder", "h", 1), schemaVersion: 99 },
    ]) st = foldRoute(st, bad);
    ok("every malformed report lands in `rejected` with a reason, and none reaches the board",
       st.rejected.length === 5 && Object.keys(st.routes).length === 0,
       st.rejected.map((r) => r.why.split(";")[0]).join(" | "));
}

// ---- 8. THE ROUTES REALLY RUN, AND A REPORT CANNOT CARRY A VERDICT -----------------------------------------------------
{
    const rep = runRoute("lbm-nu/shear-decay", { host: "gate-box" });
    ok("!! a route actually executes on this machine and returns a number, not a claim",
       Number.isFinite(rep.value) && rep.kind === "swek-consistency-route" && !("agree" in rep),
       "lbm-nu/shear-decay measured " + rep.value.toFixed(5) + " in " + rep.ms + "ms");
    const other = runRoute("lbm-nu/configured", { host: "gate-box" });
    const a = assemble(foldRoute(foldRoute({}, rep), other));
    ok("!! ...and two genuinely-run routes assemble into an agreeing pair end to end",
       a.pairs.length === 1 && a.pairs[0].agree,
       a.pairs[0].a.value.toFixed(5) + " vs " + a.pairs[0].b.value.toFixed(5) + " (diff " + a.pairs[0].diff.toExponential(2) + ")");
    let threw = false;
    try { runRoute("lbm-nu/configured", { host: "h", extra: { agree: true } }); } catch { threw = true; }
    ok("a peer cannot even BUILD a report containing a verdict key", threw);
}

// ---- 9. THE FLEET PATH IS WIRED, NOT DECORATIVE -----------------------------------------------------------------------
// Twice this session a module shipped with a gate, a page and no caller. Checked at the SHIPPING call site.
{
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("../ai-bridge/androidPeerBridge.js", import.meta.url), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! the submit path ACCEPTS a consistency-route kind (a peer can actually deliver one)",
       /"swek-consistency-route"/.test(code));
    ok("!! ...and folds it through consistencyFleet, persisting the assembled state",
       /import\(\s*["']\.\.\/physics\/consistencyFleet\.mjs["']\s*\)/.test(code) &&
       /foldRoute\(/.test(code) && /consistency-fleet\.json/.test(code));
    ok("!! ...and the hub ASSEMBLES on arrival, so a disagreement surfaces at submission time",
       /assemble\(/.test(code) && /disagree/.test(code),
       "a peer is told how many pairs its number completed and how many disagree");
}

console.log(fails ? ("[consistencyFleet-selfcheck] FAILED " + fails) : "[consistencyFleet-selfcheck] all passed");
process.exit(fails ? 1 : 0);

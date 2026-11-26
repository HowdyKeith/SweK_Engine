// Round 14 diagnostic (EXPLORATORY, run AFTER the registered result): what R_down does during the loom, and whether ANY threshold rho would have made the global gate mask the stripes. Run: node brain/stealthRound14-diag.mjs
import * as O from "./oppLoom.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
for (const rv of [0.05, 0.1]) {
    console.log(`r/v ${rv}: R_down at the frame of the raw peak, and its range over frames where the raw count is over half its peak`);
    for (const [nm, st, hz] of [["plain", "none", 4], ["static", "static", 4], ["down", "moving", 4], ["up", "moving", -4]]) {
        const r = O.runOpp(loomingEllipse({ rv, stripes: st, stripeHz: hz }).frames, { opp: { scope: "global" } }), pk = Math.max(...r.nActRaw), kpk = r.nActRaw.indexOf(pk);
        const Rs = r.Rs.map((v, i) => (r.nActRaw[i] > pk / 2 ? v : null)).filter((v) => v !== null);
        console.log(`  ${nm.padEnd(6)} peak ${pk} at frame ${kpk}, R at peak ${r.Rs[kpk] === null ? "-" : r.Rs[kpk].toFixed(3)}, R over the active frames ${Math.min(...Rs).toFixed(3)} to ${Math.max(...Rs).toFixed(3)}`);
    }
}
console.log("\nrho sweep, global gate: ratio of the moving-DOWN peak to the plain peak, and the plain peak against ungated (r/v 50 / 100 ms)");
for (const rho of [0.5, 0.3, 0.2, 0.1, 0.05, 0.02]) { const row = []; for (const rv of [0.05, 0.1]) { const pk = (st, hz = 4) => Math.max(...O.runOpp(loomingEllipse({ rv, stripes: st, stripeHz: hz }).frames, { opp: { scope: "global", rho } }).nAct); const base = Math.max(...O.runOpp(loomingEllipse({ rv }).frames, { opp: { scope: "global", rho: 1 } }).nAct); row.push(`r/v ${rv}: down ${(pk("moving") / pk("none")).toFixed(3)} up ${(pk("moving", -4) / pk("none")).toFixed(3)} static ${(pk("static") / pk("none")).toFixed(3)} plain kept ${(pk("none") / base).toFixed(3)}`); } console.log(`rho ${rho}: ${row.join(" | ")}`); }

// WebGLEngine/tools/ship/takeNeedsTask.mjs -- UNNUMBERED. The command that runs the survey run's rule pilots over a set and prints the table (brain/needsTask.mjs; brain/NEEDS_AND_LIMITS.md "Round 2"). No exports on purpose: it is the library's caller that is not a gate.
//   node tools/ship/takeNeedsTask.mjs [--set baseline|train|heldout|audit] [--kinds plain,deep,far,both] [--pilots SPIN,DIRECT,TRIP,HULLONLY,GUARDED]
// THE AUDIT SET IS THE ONE FOR PIECE 4 (a stateful pilot) and has not been read by anything: asking for it here is refused unless --read-audit-once is given, so that reading it is a decision and not a default.
import * as T from "../../brain/needsTask.mjs";

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const setName = opt("set", "baseline"), sets = { baseline: [501, 508], train: [1, 10], heldout: [11, 20], audit: [51, 62] };
if (!(setName in sets)) { console.error(`takeNeedsTask: --set must be one of ${Object.keys(sets).join(", ")}`); process.exit(2); }
if (setName === "audit" && !args.includes("--read-audit-once")) { console.error("takeNeedsTask: the audit set (seeds 51-62) is piece 4's and has not been read; add --read-audit-once to read it"); process.exit(2); }
const kinds = (opt("kinds", T.KINDS.join(",")) || "").split(",").filter(Boolean), names = (opt("pilots", Object.keys(T.PILOTS).join(",")) || "").split(",").filter(Boolean);
for (const k of kinds) if (!T.KINDS.includes(k)) { console.error(`takeNeedsTask: unknown kind ${JSON.stringify(k)}`); process.exit(2); }
for (const n of names) if (!(n in T.PILOTS)) { console.error(`takeNeedsTask: unknown pilot ${JSON.stringify(n)}`); process.exit(2); }
const set = T.setOf(kinds, sets[setName][0], sets[setName][1]);
console.log(`survey run, set ${setName} (seeds ${sets[setName].join("-")}), kinds ${kinds.join(",")}: mean score, crushed, stranded per kind`);
for (const n of names) {
    const e = T.evaluate(T.PILOTS[n], set);
    console.log(n.padEnd(9) + e.score.toFixed(3) + "  " + Object.entries(e.byKind).map(([k, v]) => `${k} ${v.score.toFixed(3)} (c${v.crushed} s${v.stranded} v${v.visited.toFixed(1)})`).join("  "));
}

// Self-check for ev/esConditions.js. Grammar tests always run; pass an ES data/ dir to also stress
// every real to-offer/on-complete block:  node es-conditions-selfcheck.mjs /path/to/endless-sky/data
import { parseES } from "../esParse.js";
import { createConditionStore, evaluateTest, applyActions, evalExpr } from "../esConditions.js";
import fs from "fs"; import path from "path";
let pass = 0, fail = 0; const ok = (n, c) => c ? pass++ : (fail++, console.log("  FAIL:", n));
{
  const s = createConditionStore({ conditions: { a: 5, b: 3 }, credits: 1000, reputation: { Republic: -2 } }, null, { rng: () => 0.5 });
  ok("expr precedence", evalExpr(["a", "+", "b", "*", "2"], s) === 11);
  ok("parens", evalExpr(["(", "a", "+", "b", ")", "*", "2"], s) === 16);
  ok("credits/reputation/random derived", s.get("credits") === 1000 && s.get("reputation: Republic") === -2 && s.get("random") === 50);
  const t = parseES('to offer\n\thas "f"\n\t"count" >= 3\n\tor\n\t\t"reputation: Pirate" < 0\n\t\thas "sp"').children[0];
  const p = { conditions: { f: 1, count: 3 }, reputation: { Pirate: -5 } }; const st = createConditionStore(p, null);
  ok("and+or true", evaluateTest(t, st) === true); st.set("count", 1); ok("comparison false", evaluateTest(t, st) === false);
  const a = parseES('on complete\n\tset "x"\n\t"s" = 10\n\t"s" += 5\n\t"cap" = 100\n\t"cap" <?= 40\n\t"n" ++\n\tpayment 5').children[0];
  const p2 = { conditions: {} }; const s2 = createConditionStore(p2, null); const r = applyActions(a, s2);
  ok("set/=/+=", s2.get("x") === 1 && s2.get("s") === 15); ok("<?= min", s2.get("cap") === 40); ok("++", s2.get("n") === 1);
  ok("payment skipped", r.skipped.length === 1 && r.skipped[0][0] === "payment");
}
const dir = process.argv[2];
if (dir && fs.existsSync(dir)) {
  let missions = 0, tests = 0, applies = 0, threw = 0;
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith("_")) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith(".txt")) scan(p); } };
  const scan = (f) => { let root; try { root = parseES(fs.readFileSync(f, "utf8")); } catch { return; }
    for (const m of root.children) { if (m.tokens[0] !== "mission" && m.tokens[0] !== "event") continue; missions++;
      const s = createConditionStore({ conditions: {}, reputation: {} }, null);
      for (const c of m.children) { try { const key = c.tokens.join(" ");
        if (/^(to (offer|complete|fail|accept)|conditions)$/.test(key)) { evaluateTest(c, s); tests++; }
        else if (/^on /.test(key)) { applyActions(c, s); applies++; } } catch { threw++; } } } };
  walk(dir);
  ok("no throws across real data", threw === 0);
  console.log(`  (${missions} missions+events, ${tests} tests, ${applies} action blocks, ${threw} throws)`);
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

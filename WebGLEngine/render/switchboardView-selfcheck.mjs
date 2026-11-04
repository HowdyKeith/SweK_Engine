// WebGLEngine/render/switchboardView-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/switchboardView-selfcheck.mjs      (about 1 s)
//
// THE GATE OF render/switchboardView.mjs AND OF switchboard.html (the page of the switchboard core, brain/switchboard.mjs).
//   1 DEFAULTS  the starting values per task, copies not the frozen objects, an unknown task refused.
//   2 ARMS      the arms a task can take are its layer's, in order, with notes, controls and the default ticks.
//   3 VIEW      rows from a board reading: bar clamped to [0, 1], a verdict per control with its class and word (beats, ties, below, missing), the text of the difference; a malformed reading refused.
//   4 TEXT      the copy text: the board's lines, the caveat, the not-on-board list.
//   5 PAGE      switchboard.html: demo meta tags, a title of two words, the modules it imports exist, every element id the script reads exists, nothing put in as markup (no innerHTML or insertAdjacentHTML),
//               the page lists what is not on the board, the layout holds at phone width (a media query), and the run cap and refusals are in the script.
// NOT CHECKED, said plainly: how the page looks (a screenshot is looked at, not asserted); a run in a real browser is done by hand when the page changes.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, t = 1e-9) => Math.abs(a - b) < t;
import * as B from "../brain/switchboard.mjs";
import * as V from "./switchboardView.mjs";
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const srcRaw = fs.readFileSync(new URL("./switchboardView.mjs", import.meta.url), "utf8"), src = srcRaw.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const page = fs.readFileSync(new URL("../switchboard.html", import.meta.url), "utf8");
console.log("switchboardView-selfcheck -- the switchboard page\n");

sec("1. DEFAULTS");
{
    const s = V.defaultsOf("survey"), d = V.defaultsOf("dropout");
    ok("!! survey defaults: seeds 1344-1349, 200 s, gauge sd 0.1, kinds far and both, arms rule-r8, rule-low06, twin-standard; dropout: ids 0-3, 120 s, no arm list (all)", J(s.range) === J({ from: 1344, to: 1349 }) && s.seconds === 200 && s.sd === 0.1 && J(s.kinds) === '["far","both"]' && J(s.arms) === '["rule-r8","rule-low06","twin-standard"]' && J(d.range) === J({ from: 0, to: 3 }) && d.seconds === 120 && d.arms === null && d.kinds === undefined);
    s.range.from = 1; s.kinds.push("x"); s.arms.pop();
    ok("!! defaultsOf hands out copies: changing one leaves the next call and the frozen defaults alone", V.defaultsOf("survey").range.from === 1344 && V.defaultsOf("survey").kinds.length === 2 && V.defaultsOf("survey").arms.length === 3 && Object.isFrozen(V.DEFAULTS) && Object.isFrozen(V.DEFAULTS.survey) && Object.isFrozen(V.DEFAULTS.survey.range));
    ok("!! an unknown task is refused with this module's message naming the two", /^switchboardView\.defaultsOf: unknown task "zz" \(survey, dropout\)$/.test(thr(() => V.defaultsOf("zz"))));
}
sec("2. ARMS");
{
    const bd = B.standardBoard({ noisy: Array(963).fill(0) }), sa = V.armsFor(bd, "survey"), da = V.armsFor(bd, "dropout");
    ok("!! the survey takes the six decision arms in registration order, with notes and controls; only the three default ones are ticked", J(sa.map((a) => a.id)) === '["rule-r8","rule-low06","twin-standard","twin-events","twin-wide","twin-ensemble"]' && J(sa.filter((a) => a.checked).map((a) => a.id)) === '["rule-r8","rule-low06","twin-standard"]' && sa.every((a) => a.note.length > 5) && J(sa[1].controls) === '["rule-r8"]' && sa[0].controls.length === 0);
    ok("!! the dropout takes the flying arms only (the autopilot and the network), all ticked (the task has no default list); the arm objects are not the board's own", J(da.map((a) => a.id)) === '["autopilot","network-noisy"]' && da.every((a) => a.checked) && (() => { da[1].controls.push("x"); return J(bd.arms.get("network-noisy").controls) === '["autopilot"]'; })());
    ok("!! an unknown task is refused", /^switchboardView\.armsFor: unknown task "q"$/.test(thr(() => V.armsFor(bd, "q"))));
}
sec("3. VIEW");
{
    const mk = (lines, per, pairs) => ({ lines, per, pairs });
    const rd = mk(["HEAD LINE", "..."], [{ id: "a", n: 4, mean: 0.5, bad: 0 }, { id: "b", n: 4, mean: 1.3, bad: 2 }, { id: "c", n: 4, mean: -0.2, bad: 0 }, { id: "d", n: 4, mean: 0.25, bad: 1 }],
        [{ arm: "b", control: "a", mean: 0.8, se: 0.1, better: 4, worse: 0, same: 0, badA: 2, badB: 0, reading: "BETTER" }, { arm: "c", control: "a", mean: -0.7, se: 0.1, better: 0, worse: 4, same: 0, badA: 0, badB: 0, reading: "WORSE" },
            { arm: "d", control: "a", mean: -0.25, se: 0.5, better: 1, worse: 2, same: 1, badA: 1, badB: 0, reading: "TIES" }, { arm: "d", control: "gone", missing: true }]);
    const v = V.viewOf(rd, "survey");
    ok("!! the head is the board's first line; one row per arm in order with its mean, bad count and n; the bar is the mean clamped into [0, 1] (1.3 -> 1, -0.2 -> 0, 0.5 stays)", v.head === "HEAD LINE" && J(v.rows.map((r) => r.id)) === '["a","b","c","d"]' && v.rows[1].bad === 2 && v.rows[0].n === 4 && v.rows[0].bar === 0.5 && v.rows[1].bar === 1 && v.rows[2].bar === 0 && v.rows[3].bar === 0.25);
    const [vb, vc, vd1, vd2] = [v.rows[1].verdicts[0], v.rows[2].verdicts[0], v.rows[3].verdicts[0], v.rows[3].verdicts[1]];
    ok("!! the verdicts: BETTER is class beats and the word BEATS, WORSE below and IS BELOW, TIES ties and TIES, a control not flown missing with its own word; an arm with no control has none", vb.cls === "beats" && vb.word === "BEATS" && vc.cls === "below" && vc.word === "IS BELOW" && vd1.cls === "ties" && vd1.word === "TIES" && vd2.cls === "missing" && vd2.word === "control not flown" && vd2.control === "gone" && v.rows[0].verdicts.length === 0 && v.rows[3].verdicts.length === 2);
    ok("!! the verdict text carries the signed difference, the se, the better/worse/same counts and the bad counts of both arms, in the board's own wording", vb.text === "+0.8000 (se 0.1000; better 4, worse 0, same 0; bad 2 against 0)" && vc.text === "-0.7000 (se 0.1000; better 0, worse 4, same 0; bad 0 against 0)");
    ok("!! the caveat is the task's (the survey's and the dropout's differ; an unknown task has none); the dropout's says a BEATS is not evidence for the wiring", /survey's/.test(v.caveat) && /handful of dives cannot see/.test(v.caveat) && /100 to 116 percent/.test(V.viewOf(rd, "dropout").caveat) && V.viewOf(rd, "zz").caveat === "" && v.caveat !== V.viewOf(rd, "dropout").caveat);
    ok("!! a reading that is not the board's (null, no per, no pairs, no lines) is refused with this module's message", [null, {}, { per: [], pairs: [] }, { per: [], lines: [] }, { pairs: [], lines: [] }].every((x) => /^switchboardView\.viewOf: expected the board's reading/.test(thr(() => V.viewOf(x, "survey")))));
    const real = B.createBoard().addTask({ name: "t", layer: "decision", run: (arm) => arm.sc.map((s, i) => ({ key: "k" + i, score: s, bad: false })) }).addArm({ id: "x", layer: "decision", sc: [0.5, 0.6, 0.7, 0.4] }).addArm({ id: "y", layer: "decision", sc: [0.6, 0.7, 0.8, 0.5], controls: ["x"] });
    const vr = V.viewOf(real.read(real.run("t", ["x", "y"], {})), "survey");
    ok("!! on a real board reading: y BEATS its control x (+0.1000 on four identical-spread dives, se 0)", vr.rows[1].verdicts[0].cls === "beats" && vr.rows[1].verdicts[0].text.startsWith("+0.1000 (se 0.0000"));
}
sec("4. TEXT");
{
    const rd = { lines: ["L1", "L2"], per: [], pairs: [] }, t = V.textOf(rd, "dropout");
    ok("!! the copy text is the board's lines, a blank line, the task's caveat, a blank line, and the not-on-board list with a dash each", t.startsWith("L1\nL2\n\n") && t.includes(V.viewOf(rd, "dropout").caveat) && /\nNOT ON THE BOARD YET:\n  - the fish pilot/.test(t) && t.split("\n  - ").length === V.notOnBoard.length + 1);
    ok("!! not-on-board names the fish pilot, the stateful and stateless fly, the plain net and the leaky unit, the needs circuit and the disturbance task; the list is frozen", V.notOnBoard.length === 5 && /fish pilot/.test(V.notOnBoard[0]) && /stateful fly/.test(V.notOnBoard[1]) && /leaky unit/.test(V.notOnBoard[2]) && /needs circuit/.test(V.notOnBoard[3]) && /disturbance/.test(V.notOnBoard[4]) && Object.isFrozen(V.notOnBoard) && Object.isFrozen(V.caveat));
}
sec("5. PAGE");
{
    const script = page.split('<script type="module">')[1].split("</script>")[0];
    ok("!! the page has the demo meta tags (title Switchboard, a description, category science) and a title of two words", /<meta name="demo:title" content="Switchboard">/.test(page) && /<meta name="demo:desc" content="[^"]{40,}">/.test(page) && /<meta name="demo:category" content="science">/.test(page) && /<title>SweK &middot; Switchboard<\/title>/.test(page));
    ok("!! it imports the core and the view as modules that exist beside it", /import \* as B from "\.\/brain\/switchboard\.mjs"/.test(script) && /import \* as V from "\.\/render\/switchboardView\.mjs"/.test(script) && fs.existsSync(new URL("../brain/switchboard.mjs", import.meta.url)) && fs.existsSync(new URL("../render/switchboardView.mjs", import.meta.url)));
    const used = [...new Set([...script.matchAll(/\$\("([A-Za-z]+)"\)/g)].map((m) => m[1]))], have = (id) => new RegExp(`id="${id}"`).test(page);
    ok("!! every element id the script reads exists in the markup", used.length >= 14 && used.every(have), used.filter((i) => !have(i)).join(","));
    ok("!! nothing from a name or a file is put in as markup: no innerHTML, outerHTML or insertAdjacentHTML anywhere in the page; text goes in with textContent", !/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(page) && /textContent/.test(script));
    ok("!! the page lists what is not on the board and loads the two weight files, saying so when one cannot be loaded", /V\.notOnBoard/.test(script) && /pilotSubWeightsRobustNoisyWip\.json/.test(script) && /pilotSubWeightsWip\.json/.test(script) && /could not be loaded/.test(script) && fs.existsSync(new URL("../brain/pilotSubWeightsRobustNoisyWip.json", import.meta.url)) && fs.existsSync(new URL("../brain/pilotSubWeightsWip.json", import.meta.url)));
    ok("!! the run is cancelable and bounded: a Stop button, a cap of 50 seeds, 'at least one arm' and 'at least one kind' refusals, a partial run shows nothing, and a refusal from the core is shown", /id="stop"/.test(page) && /49/.test(script) && /Tick at least one arm/.test(script) && /Tick at least one kind/.test(script) && /nothing is shown for a partial run/.test(script) && /Refused: /.test(script));
    ok("!! it works at phone width: a media query collapses the two columns", /@media \(max-width: ?800px\)[^}]*main \{ grid-template-columns:minmax\(0,1fr\)/.test(page) && /name="viewport"/.test(page));
    ok("!! the page does not claim more than the board does: it says seeds not measurements, and that the fish pilot, stateful fly, plain net, leaky unit, needs circuit and lesion toggle are not on the board", /a reading of THOSE seeds/.test(page) && /NOT on the board yet/.test(page));
    ok("!! the module reads no clock, no random number, no file and no DOM", !/Date\.now|Math\.random|performance\.now|readFileSync|document\.|window\./.test(src));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;

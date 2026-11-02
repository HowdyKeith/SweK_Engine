// WebGLEngine/brain/capabilityMap-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/capabilityMap-selfcheck.mjs      (~0.12 s)
//
// THE GATE OF brain/capabilityMap.mjs, the map of which brain can do what at each simulation level (docs/BRAIN-CAPABILITY-MAP.md). A map like this goes stale the day a result changes, so the gate does not trust it: it OPENS every file and every changelog entry the
// map cites and looks for the quoted number, and it holds the Markdown to what the data renders.
//   1  THE DATA     every task has the five brains' cells; every status is in the vocabulary; a claim carries words and a source; a result carries a quote; ids are unique; the levels are sub, sky, space and other; the numbers of the summary are the data's
//   2  THE SOURCES  every cited file exists and every quote is IN it; every cited changelog version has an entry and the quote is in THAT entry (not just anywhere in the changelog)
//   3  THE VALIDATOR, WITH FIXTURES  it reports each kind of break: an unknown status, a missing cell, a cell for a brain that does not exist, a claim with no source, a result with no quote, a quote that is not there, a file that does not exist, a
//                    changelog entry that does not exist, a duplicate task, a non-boolean 'shoots', a NOT_BUILT cell that cites a source
//   4  THE DOCUMENT docs/BRAIN-CAPABILITY-MAP.md is exactly what the data renders (ASCII only), names every task and every level, and the command's --check agrees
//
// SABOTAGED -- 36 mutants of brain/capabilityMap.mjs (the vocabulary and what needs a source or a quote; the brain order; a quote number, a changelog version, a file path, a status, a shoots flag, a dropped quote, a dropped cell, a duplicate id in the DATA; every check of the validator; the tally, the status words, the shoots words, the placeholder, the sources line, the paragraph, the legend, the amoeba sentence, the level heading and the report in the RENDER), each in place and restored, every one red BY NAME, identity 0. FIRST PASS: 4 read 0 red or did not match -- ROWS ADDED: a source with neither a file nor a log; two patterns fixed.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as M from "./capabilityMap.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), DOCS = path.resolve(ENG, "..", "docs");
let fails = 0;
const ok = (name, cond, detail) => { try { if (typeof cond === "function") cond = cond(); } catch (e) { cond = false; detail = "threw: " + e.message; } console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
console.log("capabilityMap-selfcheck -- which brain can do what\n");

const changelog = fs.readFileSync(path.join(DOCS, "CHANGELOG.md"), "utf8");
const logEntry = (v) => { const i = changelog.indexOf(`\n## ${v} `); if (i < 0) return null; const j = changelog.indexOf("\n## v", i + 5); return changelog.slice(i, j < 0 ? undefined : j); };
const real = { file: (p) => { const f = path.join(ENG, p); return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null; }, log: logEntry };

sec("1. THE DATA");
{
    const bad = M.validate(M.LEVELS, real);
    ok("!! the real data is sound: every task has all five brains' cells, valid statuses, words, sources, quotes, unique ids", bad.length === 0, bad.slice(0, 3).join(" | "));
    ok("!! the brains are the hand rule, the fly circuit, the GPU Brain, the fish circuits and a language model; the levels are sub, sky, space and other; there are 15 tasks and 75 cells", J(M.BRAINS.map((b) => b.id)) === J(["hand", "fly", "gpu", "fish", "lm"]) && J(M.LEVELS.map((l) => l.id)) === J(["sub", "sky", "space", "other"]) && M.ALL_TASKS.length === 15 && M.allCells().length === 75);
    const t = M.tally();
    ok("!! the tally adds up to the cells and counts what the data says (11 trained, 1 hand-wired, 2 no champion, 4 tuned, 1 scripted, 1 no effect, 1 not concluded, 11 exists-unread, 41 not built, 2 not applicable)", Object.values(t).reduce((a, b) => a + b, 0) === 75 && J(t) === J({ TRAINED: 11, HAND_WIRED: 1, NO_CHAMPION: 2, TUNED: 4, SCRIPTED: 1, NO_EFFECT: 1, NOT_CONCLUDED: 1, EXISTS_UNREAD: 11, NOT_BUILT: 41, NOT_APPLICABLE: 2 }));
    ok("!! the weapons column is honest about who shoots: the sub duel, the jet dogfight, the bomber and capital-ship fights, the fleet battles, the 6-DOF space duel and the race-car turret shoot; flight, the aircraft, the rotors, the survey run, the estimator, space navigation and the lava do not", J(M.ALL_TASKS.filter((x) => x.shoots).map((x) => x.id)) === J(["sub-duel", "sky-dogfight", "sky-bomber", "sky-es", "space-6dof", "other-drive"]));
    ok("!! the vocabulary: ten statuses; the ones that claim a result need a quote (trained, hand-wired, no champion, tuned, no effect, not concluded); not built and not applicable need nothing", M.STATUSES.length === 10 && J(M.NEEDS_QUOTE) === J(["TRAINED", "HAND_WIRED", "NO_CHAMPION", "TUNED", "NO_EFFECT", "NOT_CONCLUDED"]) && !M.NEEDS_SOURCE.includes("NOT_BUILT") && !M.NEEDS_SOURCE.includes("NOT_APPLICABLE") && M.NEEDS_SOURCE.includes("EXISTS_UNREAD"));
}

sec("2. THE SOURCES");
{
    const srcs = M.allCells().flatMap((c) => (c.cell.src || []).map((s) => ({ ...s, where: `${c.task}/${c.brain}` })));
    const files = srcs.filter((s) => s.file), logs = srcs.filter((s) => s.log), quotes = srcs.filter((s) => s.quote);
    ok("!! every cited file exists", files.length > 10 && files.every((s) => real.file(s.file) !== null), files.filter((s) => real.file(s.file) === null).map((s) => s.file).join(", "));
    ok("!! every cited changelog version has its own entry, and every quote cited against one is inside THAT entry", logs.length >= 8 && logs.every((s) => logEntry(s.log) !== null) && logs.filter((s) => s.quote).every((s) => logEntry(s.log).includes(s.quote)), logs.filter((s) => logEntry(s.log) === null || (s.quote && !logEntry(s.log).includes(s.quote))).map((s) => `${s.log} "${s.quote}"`).join(", "));
    ok("!! every quote cited against a file is in that file", quotes.filter((s) => s.file).length >= 8 && quotes.filter((s) => s.file).every((s) => real.file(s.file).includes(s.quote)));
    ok("!! the map cites the numbers it prints: the fly flight pilot's -0.3199, the rotor pilot's -1.2188, the space pilot's 106-12, the fleet tactics' 54-22, the sub tactician's 141W 1L 18D and the rule advisor's 0.763 are each a quote of a source", ["-0.3199", "-1.2188", "106-12", "54-22", "141W 1L 18D", "RULE-GF 0.763 | 0.713 | 0.806"].every((q) => quotes.some((s) => s.quote.includes(q))));
}

sec("3. THE VALIDATOR, WITH FIXTURES");
{
    const fx = { file: (p) => (p === "a.md" ? "the number is 42 and more" : null), log: (v) => (v === "v1" ? "## v1 -- title\nthe result was 7-3" : null) };
    const cell = (status, text = "words", src = []) => ({ status, text, src });
    const nb = () => ({ status: "NOT_BUILT", text: "nothing" });
    const task = (cells, id = "t1", shoots = false) => ({ id, name: id, shoots, cells });
    const full = (over = {}) => ({ hand: nb(), fly: nb(), gpu: nb(), fish: nb(), lm: nb(), ...over });
    const lv = (...tasks) => [{ id: "l", name: "L", tasks }];
    const run = (levels) => M.validate(levels, fx);
    ok("!! a sound fixture reads clean (a quoted file, a quoted changelog entry, not-built cells)", J(run(lv(task(full({ hand: cell("TRAINED", "w", [{ file: "a.md", quote: "42" }]), fly: cell("TUNED", "w", [{ log: "v1", quote: "7-3" }]) }))))) === "[]");
    ok("!! an unknown status is reported by name", run(lv(task(full({ hand: { status: "MAGIC", text: "w" } })))).some((p) => /t1\/hand: status "MAGIC" is not in the vocabulary/.test(p)));
    ok("!! a missing brain cell is reported; so is a cell for a brain that does not exist", run(lv(task({ hand: nb(), fly: nb(), gpu: nb(), fish: nb() }))).some((p) => /no cell for lm/.test(p)) && run(lv(task(full({ amoeba: nb() })))).some((p) => /unknown brain amoeba/.test(p)));
    ok("!! a claim with no source and a result with no quote are each reported", run(lv(task(full({ hand: cell("EXISTS_UNREAD", "w", []) })))).some((p) => /EXISTS_UNREAD with no source/.test(p)) && run(lv(task(full({ hand: cell("TRAINED", "w", [{ file: "a.md" }]) })))).some((p) => /TRAINED with no quoted source/.test(p)));
    ok("!! a quote that is not in the source, a file that does not exist and a changelog entry that does not exist are each reported by name", run(lv(task(full({ hand: cell("TRAINED", "w", [{ file: "a.md", quote: "43" }]) })))).some((p) => /"43" is not in a\.md/.test(p)) && run(lv(task(full({ hand: cell("TRAINED", "w", [{ file: "zz.md", quote: "x" }]) })))).some((p) => /zz\.md does not exist/.test(p)) && run(lv(task(full({ hand: cell("TRAINED", "w", [{ log: "v9", quote: "x" }]) })))).some((p) => /changelog v9 does not exist/.test(p)) && run(lv(task(full({ hand: cell("TRAINED", "w", [{ log: "v1", quote: "9-9" }]) })))).some((p) => /"9-9" is not in changelog v1/.test(p)));
    ok("!! a source with neither a file nor a changelog version is reported as such", run(lv(task(full({ hand: cell("TRAINED", "w", [{ quote: "x" }]) })))).some((p) => /neither file nor log/.test(p)));
    ok("!! a quote must be in the CITED entry: a number that is in another entry's text does not count", run(lv(task(full({ hand: cell("TRAINED", "w", [{ log: "v1", quote: "42" }]) })))).some((p) => /"42" is not in changelog v1/.test(p)));
    ok("!! a duplicate task id, a non-boolean shoots, a NOT_BUILT cell that cites a source, and a cell with no words are each reported", run(lv(task(full()), task(full()))).some((p) => /listed twice/.test(p)) && run(lv(task(full(), "t1", "yes"))).some((p) => /shoots must be true or false/.test(p)) && run(lv(task(full({ hand: { status: "NOT_BUILT", text: "x", src: [{ file: "a.md" }] } })))).some((p) => /NOT_BUILT must not cite a source/.test(p)) && run(lv(task(full({ hand: { status: "SCRIPTED", text: "", src: [{ file: "a.md" }] } })))).some((p) => /no words/.test(p)));
}

sec("4. THE DOCUMENT");
{
    const doc = fs.existsSync(path.join(DOCS, "BRAIN-CAPABILITY-MAP.md")) ? fs.readFileSync(path.join(DOCS, "BRAIN-CAPABILITY-MAP.md"), "utf8") : "", md = M.renderMarkdown() + "\n";
    ok("!! docs/BRAIN-CAPABILITY-MAP.md is exactly what the data renders, and `node tools/ship/takeCapabilityMap.mjs --check` agrees", doc === md && (() => { try { execFileSync(process.execPath, [path.join(ENG, "tools", "ship", "takeCapabilityMap.mjs"), "--check"], { encoding: "utf8" }); return true; } catch (e) { return false; } })());
    ok("!! the document is ASCII, names every level and every task, has the legend with all ten statuses and the one-paragraph reading, and says an amoeba brain does not exist in the tree", !/[^\x00-\x7F]/.test(md) && M.LEVELS.every((l) => md.includes("## " + l.name)) && M.ALL_TASKS.every((t) => md.includes(t.name)) && M.STATUSES.every((s) => md.includes("| " + ({ HAND_WIRED: "HAND-WIRED", NO_CHAMPION: "NO CHAMPION", NO_EFFECT: "NO EFFECT", NOT_CONCLUDED: "NOT CONCLUDED", EXISTS_UNREAD: "EXISTS, UNREAD", NOT_BUILT: "-", NOT_APPLICABLE: "n/a" }[s] || s) + " |")) && /What the map says in one paragraph/.test(md) && /'amoeba brain' does not exist/.test(md));
    ok("!! each level's table has a row per task with a status word in all five brain columns, and the cells with words never print the 'nothing built' placeholder", M.LEVELS.every((l) => l.tasks.every((t) => md.includes(`| ${t.name} | ${t.shoots ? "yes" : "no"} | `))) && !/nothing built\./.test(md));
    ok("!! reportLines names the counts", /15 tasks x 5 brains = 75 cells/.test(M.reportLines()[0]));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);

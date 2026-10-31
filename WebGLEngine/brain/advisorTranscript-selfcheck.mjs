// WebGLEngine/brain/advisorTranscript-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/advisorTranscript-selfcheck.mjs      (~1 s)
//
// THE GATE OF brain/advisorTranscript.mjs, the recorded-decision seat a language-model chip plugs into (brain/NEEDS_AND_LIMITS.md Round 4: "a language-model chip is a LATER round on the same socket with recorded decisions"). No model exists here: `modelFn` is a scripted function, so every
// branch has a worked answer.
//   1  CONSTANTS   the schemas, the 30-tick default, the cap range, the modes, the reply format.
//   2  THE PROMPT  deterministic; rounded the way a gauge is read; the bearing relative to the heading; the station list in order; NOTHING from outside the observation (a seed, a true charge, a secret field) can reach it.
//   3  THE REPLY   parsed strictly: wrapped in prose or a code fence, the first of several objects, every wrong type and every out-of-range station refused with its reason, the cap clamped, extra fields ignored.
//   4  THE TRANSCRIPT  keys differ by model, params and prompt; a collision is an error; text round trip; a bad header, another schema, a malformed entry, a forged key and a conflicting duplicate are refused.
//   5  THE SEAT    record calls the model once per distinct prompt every 30 ticks and holds the decision between; the station is resolved against the CURRENT observation; an invalid reply is silence; replay NEVER calls a model, reproduces the recorded decisions and refuses an unknown situation.
//   6  THE DIVES   (real flights) a recorded run replays to the same fingerprint and score with zero model calls; another dive's replay is refused; a model that answers garbage is the brain alone, bit for bit.
//   7  THE SOURCE  the file imports nothing but the sub model, reads no clock or random number and has no network, process or file access.
// NOT CHECKED, said plainly: any real model (none is called here); the quality of any advice (that is the experiment).
//
// SABOTAGE LOG (42 mutants of brain/advisorTranscript.mjs, each run against a copy of this gate, 4 at a time; every one red BY NAME):
//   the constants: the default delay, the prompt schema, the cap floor. the prompt: depth, time and gauge rounded another way, the bearing not relative, its sign flipped, not wrapped, a visited flag flipped, the station index off by one, a seed leaking in, a true charge leaking in.
//   the reply: braces inside a string ending the object, a boolean not required, the station bound and its lower bound, the integer test, the cap not clamped, clamped to 1, its type unchecked. the key: params ignored, the model id ignored, one hash twice.
//   the transcript: a forged key, a foreign header, another schema, a conflicting duplicate accepted; a round trip that drops an entry. the seat: asking every tick, replay calling a model, a miss answered with silence, an invalid reply holding the old decision, the station object held across ticks, a collision unchecked,
//   hits and invalid counts dropped, a recording not stored, a repeated prompt asked again; the mode, the model function and the delay unchecked.
//   Seven went 0 red on the first pass and each became a row or a deletion: a true charge on the READINGS (the leak row only tried the observation), `Array.isArray(o)` (DEAD: the first object is always a plain object, so the guard is deleted), the key's two halves (a row asserts they differ), a replay GIVEN a model function (it must still refuse a miss and
//   never touch it), an invalid reply AFTER a valid one (the old decision must not be held), depth rounded to metres and the bearing's sign (the first rows were blind to both: 12.00 and a lenient +-90 regex). A syntax-broken mutant reads 0 red (a crash prints no FAIL line): the bearing-wrap mutant first was one and is now a valid expression.
"use strict";
import fs from "node:fs";
import * as T from "./needsTask.mjs";
import * as A from "./advisorChip.mjs";
import * as X from "./advisorTranscript.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const J = JSON.stringify;
console.log("advisorTranscript-selfcheck -- the recorded-decision seat\n");

// a hand-built situation: a boat at (10, 20), depth 12 m, heading 0 (the nose along +x), three stations
const stOf = (heading = 0) => ({ pos: [10, 20, -12], vel: [2, 0, 0], q: [Math.cos(-heading / 2), 0, 0, Math.sin(-heading / 2)], w: [0, 0, 0] });
const obsOf = (extra = {}, t = 41.7) => ({ t, r: { depth: 12, frac: 0.4321, strain: 0.2, damage: 0.05, flood: 0.0123, collapseDepth: 60, ...extra }, stations: [{ x: 110, y: 20, depth: 20, visited: false }, { x: 10, y: 120, depth: 35, visited: true }, { x: -90, y: 20, depth: 8, visited: false }] });

sec("1. THE CONSTANTS");
ok("!! the schemas are 1 and 1, the seat decides every 30 ticks, the cap is held to 0.5-0.95, the modes are record and replay, and the reply format names every field", X.PROMPT_SCHEMA === 1 && X.TRANSCRIPT_SCHEMA === 1 && X.EVERY === 30 && J(X.CAP_RANGE) === J({ lo: 0.5, hi: 0.95 }) && J(X.MODES) === J(["record", "replay"]) && ["surface", "station", "cap", "pump", "repair"].every((f) => X.REPLY_FORMAT.includes(f)) && Object.isFrozen(X.MODES));

sec("2. THE PROMPT");
{
    const st = stOf(), obs = obsOf(), p = X.renderPrompt(st, obs);
    ok("!! the prompt is deterministic (the same situation, the same text) and says the schema", p === X.renderPrompt(stOf(), obsOf()) && /prompt schema 1/.test(p));
    ok("!! the numbers are rounded as a gauge is read: time 42 s, depth 12.00 m, the charge gauge 0.43, strain 0.20, damage 0.05, flooding 0.012, collapse depth 60 m", /time 42 s of 600/.test(p) && /depth 12 m\./.test(p) && /charge gauge reads 0\.43 \(it is noisy\)/.test(p) && /hull strain 0\.2 of its limit/.test(p) && /damage 0\.05/.test(p) && /flooding 0\.012/.test(p) && /hull collapse depth 60 m/.test(p));
    ok("!! each station is listed in order with its state, its distance and its bearing from the nose (+y is the vessel's LEFT, so port is negative): station 0 100 m ahead (0 deg), station 1 VISITED 100 m to port (-90 deg), station 2 100 m astern (-180 deg)", /station 0: not visited, 100 m away, bearing 0 deg[^\n]*depth 20 m/.test(p) && /station 1: VISITED, 100 m away, bearing -90 deg[^\n]*depth 35 m/.test(p) && /station 2: not visited, 100 m away, bearing -180 deg[^\n]*depth 8 m/.test(p));
    const p90 = X.renderPrompt(stOf(Math.PI / 2), obs);
    ok("!! the bearing is RELATIVE to the heading and WRAPPED to -180..180: with the boat turned a quarter turn to the right, station 0 is -90, station 1 -180 and station 2 (raw -270) is +90", /station 0: not visited, 100 m away, bearing -90 deg/.test(p90) && /station 1: VISITED, 100 m away, bearing -180 deg/.test(p90) && /station 2: not visited, 100 m away, bearing 90 deg/.test(p90));
    ok("!! depth and the gauge keep two decimals (12.346 m reads 12.35, a gauge of 0.4361 reads 0.44) and flooding three", /depth 12\.35 m\./.test(X.renderPrompt(st, obsOf({ depth: 12.346, frac: 0.4361 }))) && /charge gauge reads 0\.44 /.test(X.renderPrompt(st, obsOf({ depth: 12.346, frac: 0.4361 }))) && /time 42 s/.test(X.renderPrompt(st, obsOf({}, 41.7))));
    const leak = X.renderPrompt({ ...st, secret: "TOPSECRET" }, { ...obs, seed: 4242, trueFrac: 0.7777, scenario: "SCENARIOX", r: { ...obs.r, trueEnergy: 123456, trueFrac: 0.9191 } });
    ok("!! nothing outside the observation reaches the prompt: a seed, a true charge, a scenario name, a secret on the state and a true energy on the readings are absent from the text", leak === p && !/4242|0\.7777|0\.9191|SCENARIOX|TOPSECRET|123456/.test(leak));
    ok("  the prompt asks for one json object and says what each field means", /Reply with ONE json object and nothing else/.test(p) && /surface = go up and stay up/.test(p) && /repair = mend the hull/.test(p));
}

sec("3. THE REPLY (strict)");
{
    const good = '{"surface": false, "station": 2, "cap": 0.8, "pump": true, "repair": false}', P = (r, n = 3) => X.parseReply(r, n);
    ok("!! a plain object parses; so does one wrapped in prose and one in a code fence; the first of two objects is taken", P(good).ok && J(P(good).decision) === J({ surface: false, station: 2, cap: 0.8, pump: true, repair: false }) && P("Sure! Here you go:\n```json\n" + good + "\n```\nHope that helps.").ok && P(good + ' {"surface": true, "station": 0, "cap": 0.5, "pump": false, "repair": false}').decision.station === 2);
    ok("!! a null station is allowed and an extra field is ignored; braces inside a string do not end the object", P('{"surface": true, "station": null, "cap": 0.9, "pump": false, "repair": false, "why": "a } in prose"}').ok && P('{"surface": true, "station": null, "cap": 0.9, "pump": false, "repair": false, "why": "a } in prose"}').decision.station === null);
    ok("!! the cap is clamped to 0.5-0.95 (0.3 -> 0.5, 2 -> 0.95)", P(good.replace("0.8", "0.3")).decision.cap === 0.5 && P(good.replace("0.8", "2")).decision.cap === 0.95);
    const bad = (r, re, n) => { const x = P(r, n); return x.ok === false && re.test(x.why); };
    ok("!! every wrong reply is refused with its reason: no object, not json, an array, a string where a boolean is, a missing field, a station of 3 (of 3), -1, 1.5 or 'a', a cap as a string or NaN", bad("no idea", /no json object/) && bad("{surface: true}", /not valid json/) && bad("[1, 2]", /no json object|not an object/) && bad(good.replace("true", '"yes"'), /pump is not a boolean/) && bad('{"surface": true, "station": 0, "cap": 0.8, "pump": false}', /repair is not a boolean/) && bad(good.replace('"station": 2', '"station": 3'), /station/) && bad(good.replace('"station": 2', '"station": -1'), /station/) && bad(good.replace('"station": 2', '"station": 1.5'), /station/) && bad(good.replace('"station": 2', '"station": "a"'), /station/) && bad(good.replace("0.8", '"high"'), /cap is not a number/) && bad(good.replace("0.8", "null"), /cap is not a number/) && bad("{", /no json object/) && bad(good, /station/, 2));
}

sec("4. THE TRANSCRIPT");
{
    const m = { id: "model-a", params: { temperature: 0 } }, pr = "a prompt";
    ok("!! the key differs by model id, by params and by prompt, is stable, and is 16 hex digits", X.keyOf(m, pr) === X.keyOf({ id: "model-a", params: { temperature: 0 } }, pr) && X.keyOf(m, pr) !== X.keyOf({ ...m, id: "model-b" }, pr) && X.keyOf(m, pr) !== X.keyOf({ ...m, params: { temperature: 1 } }, pr) && X.keyOf(m, pr) !== X.keyOf(m, pr + ".") && /^[0-9a-f]{16}$/.test(X.keyOf(m, pr)));
    const halves = ["p1", "p2", "a longer prompt", "x".repeat(200)].map((q) => X.keyOf(m, q));
    ok("!! the key is TWO independent hashes: its two halves differ for every prompt tried", halves.every((k) => k.slice(0, 8) !== k.slice(8)));
    ok("!! a transcript needs a model with an id and a whole number of ticks of 1 or more", /model with an id/.test(throws(() => X.createTranscript({})) || "") && /model with an id/.test(throws(() => X.createTranscript({ model: { params: {} } })) || "") && /every/.test(throws(() => X.createTranscript({ model: m, every: 0 })) || "") && /every/.test(throws(() => X.createTranscript({ model: m, every: 2.5 })) || "") && X.createTranscript({ model: m }).header.every === 30);
    const tr = X.createTranscript({ model: m, every: 10 }), mk = (prompt, reply) => ({ key: X.keyOf(m, prompt), prompt, reply, decision: null });
    for (const e of [mk("p1", "r1"), mk("p2", "r2")]) tr.entries.set(e.key, e);
    const txt = X.serialize(tr), back = X.parseTranscript(txt);
    ok("!! text round trip: the header and both entries come back in order; the text is a header line then one line per entry", back.header.model.id === "model-a" && back.header.every === 10 && J([...back.entries.values()]) === J([...tr.entries.values()]) && txt.split("\n").filter(Boolean).length === 3);
    const lines = txt.split("\n").filter(Boolean), e1 = JSON.parse(lines[1]);
    ok("!! refused: empty text, a first line that is not a header, another schema, a malformed entry, an entry whose key does not match its prompt, the same key with two different replies", /empty/.test(throws(() => X.parseTranscript("")) || "") && /not json/.test(throws(() => X.parseTranscript("nope")) || "") && /not an advisor-transcript header/.test(throws(() => X.parseTranscript('{"kind":"x"}')) || "") && /schema 2/.test(throws(() => X.parseTranscript(J({ ...tr.header, schema: 2 }))) || "") && /malformed/.test(throws(() => X.parseTranscript(lines[0] + "\n" + J({ key: "k" }))) || "") && /does not match its prompt/.test(throws(() => X.parseTranscript(lines[0] + "\n" + J({ ...e1, key: "0000000000000000" }))) || "") && /twice with different replies/.test(throws(() => X.parseTranscript(lines.join("\n") + "\n" + J({ ...e1, reply: "other" }))) || ""));
    ok("  the same entry twice is accepted once (a recording can be concatenated with itself)", X.parseTranscript(lines.join("\n") + "\n" + lines[1]).entries.size === 2);
}

sec("5. THE SEAT (a scripted model)");
{
    const m = { id: "scripted", params: { t: 0 } }, goodFor = (i) => J({ surface: i % 2 === 1, station: 0, cap: 0.8, pump: false, repair: false });
    const tr = X.createTranscript({ model: m, every: 5 }); let calls = 0; const prompts = [];
    const modelFn = (p) => { prompts.push(p); return goodFor(calls++); };
    const seat = X.llmSeat({ transcript: tr, mode: "record", modelFn })({});
    const st = stOf(), outs = Array.from({ length: 12 }, (_, i) => seat(st, obsOf({}, i)));
    ok("!! record asks the model every 5 ticks (ticks 0, 5 and 10: three calls in twelve ticks) and holds the decision between: surface false for ticks 0-4, true for 5-9, false for 10-11", calls === 3 && J(outs.map((d) => d.surface)) === J([false, false, false, false, false, true, true, true, true, true, false, false]) && seat.stats.ticks === 12 && seat.stats.asks === 3 && seat.stats.calls === 3 && seat.stats.hits === 0 && tr.entries.size === 3);
    const seatB = X.llmSeat({ transcript: tr, mode: "record", modelFn })({}); for (let i = 0; i < 6; i++) seatB(st, obsOf({}, i));
    ok("!! a situation already in the transcript is not asked again: a second recording over the same ticks makes no call (hits 2, calls 0)", calls === 3 && seatB.stats.hits === 2 && seatB.stats.calls === 0);
    const o1 = obsOf({}, 0), o2 = { ...obsOf({}, 0), stations: o1.stations.map((q, i) => (i === 0 ? { ...q, visited: true } : q)) };
    const tr2 = X.createTranscript({ model: m, every: 100 }), s2 = X.llmSeat({ transcript: tr2, mode: "record", modelFn: () => goodFor(0) })({}), d1 = s2(st, o1), d2 = s2(st, o2);
    ok("!! the station is held as an INDEX and resolved against the CURRENT observation: the decision's station is the object of this tick's list (the same index, a fresh object, the visited flag current)", d1.station === o1.stations[0] && d2.station === o2.stations[0] && d2.station.visited === true && d1.station.visited === false);
    const trBad = X.createTranscript({ model: m, every: 2 }); let k = 0; const sb = X.llmSeat({ transcript: trBad, mode: "record", modelFn: () => (k++ === 0 ? "I refuse" : goodFor(0)) })({}), ob = Array.from({ length: 4 }, (_, i) => sb(st, obsOf({}, i)));
    ok("!! an invalid reply is SILENCE for that step (null) and is counted; the next valid reply speaks again", ob[0] === null && ob[1] === null && ob[2] !== null && ob[3] !== null && sb.stats.invalid === 1 && [...trBad.entries.values()][0].decision === null && [...trBad.entries.values()][0].reply === "I refuse");
    let replayCalls = 0; const trip = X.parseTranscript(X.serialize(tr));
    const rseat = X.llmSeat({ transcript: trip, mode: "replay", modelFn: () => { replayCalls++; return "x"; } })({}), rout = Array.from({ length: 12 }, (_, i) => rseat(st, obsOf({}, i)));
    ok("!! replay NEVER calls a model (one is passed and is never touched) and reproduces the recorded decisions exactly, through a text round trip of the transcript (calls 0, hits 3)", replayCalls === 0 && J(rout.map((d) => d.surface)) === J(outs.map((d) => d.surface)) && J(rout.map((d) => d.cap)) === J(outs.map((d) => d.cap)) && rseat.stats.hits === 3 && rseat.stats.calls === 0);
    const unknown = obsOf({ depth: 31.5 }, 0), rs2 = X.llmSeat({ transcript: trip, mode: "replay" })({});
    let miss = null; try { rs2(st, unknown); } catch (e) { miss = e; }
    ok("!! replay refuses a situation the transcript does not hold: a TranscriptMiss naming the key, never an invented answer", miss instanceof X.TranscriptMiss && /no recorded answer/.test(miss.message) && /^[0-9a-f]{16}$/.test(miss.key));
    let touched = 0, missWith = null; try { X.llmSeat({ transcript: trip, mode: "replay", modelFn: () => { touched++; return "x"; } })({})(st, unknown); } catch (e) { missWith = e; }
    ok("!! a replay that was GIVEN a model function still refuses a miss and never touches it", missWith instanceof X.TranscriptMiss && touched === 0);
    const trI = X.createTranscript({ model: m, every: 2 }); let q2 = 0; const si = X.llmSeat({ transcript: trI, mode: "record", modelFn: () => (q2++ === 0 ? goodFor(0) : "garbled") })({}), oi = Array.from({ length: 4 }, (_, i) => si(st, obsOf({}, i)));
    ok("!! a valid reply followed by an invalid one: the seat is silent after it (the old decision is NOT held over a refusal): decisions, null, null at ticks 2-3", oi[0] !== null && oi[1] !== null && oi[2] === null && oi[3] === null && si.stats.invalid === 1);
    ok("!! the seat refuses a bad call: no transcript, a bad mode, and record without a model function", /transcript is required/.test(throws(() => X.llmSeat({ mode: "replay" })) || "") && /mode "live"/.test(throws(() => X.llmSeat({ transcript: tr, mode: "live" })) || "") && /needs modelFn/.test(throws(() => X.llmSeat({ transcript: tr, mode: "record" })) || ""));
    const trc = X.createTranscript({ model: m, every: 1 }), pc = X.renderPrompt(st, obsOf({}, 0)); trc.entries.set(X.keyOf(m, pc), { key: X.keyOf(m, pc), prompt: "a DIFFERENT prompt", reply: "{}", decision: null });
    ok("!! a hash collision is an error, not a wrong answer: an entry under this prompt's key that holds a different prompt throws", /collides with a different prompt/.test(throws(() => X.llmSeat({ transcript: trc, mode: "replay" })({})(st, obsOf({}, 0))) || ""));
}

sec("6. THE DIVES (real flights, baseline dive far 503 on the noisy gauge)");
{
    const sc = T.scenario(503, "far"), obsSeat = T.ruleSeat("obs"), m = { id: "scripted-chip", params: {} };
    const script = (prompt) => { const q = [...prompt.matchAll(/station (\d): not visited, (\d+) m away/g)].sort((a, b) => Number(a[2]) - Number(b[2]))[0]; return J({ surface: Number((/ depth ([\d.]+) m\. charge/.exec(prompt) || [0, 0])[1]) > 15, station: q ? Number(q[1]) : null, cap: 0.85, pump: false, repair: false }); };
    const base = T.fly(T.GUARDED_OBS, sc, { gauge: T.GAUGE });
    const tr = X.createTranscript({ model: m }); let calls = 0;
    const recorded = T.fly(A.advisedPilot(obsSeat, X.llmSeat({ transcript: tr, mode: "record", modelFn: (p) => { calls++; return script(p); } }), "VETO"), sc, { gauge: T.GAUGE });
    const saved = X.serialize(tr); let replayCalls = 0;
    const replayed = T.fly(A.advisedPilot(obsSeat, X.llmSeat({ transcript: X.parseTranscript(saved), mode: "replay", modelFn: () => { replayCalls++; return "x"; } }), "VETO"), sc, { gauge: T.GAUGE });
    ok("!! a recorded run replays to the SAME fingerprint and score with zero model calls (the recorded run asked once a second: about 600 calls, one per distinct situation)", calls > 300 && calls <= 600 && replayCalls === 0 && replayed.fingerprint === recorded.fingerprint && replayed.score === recorded.score && tr.entries.size === calls, `${calls} calls, score ${recorded.score}`);
    const other = (() => { try { T.fly(A.advisedPilot(obsSeat, X.llmSeat({ transcript: X.parseTranscript(saved), mode: "replay" }), "VETO"), T.scenario(502, "deep"), { gauge: T.GAUGE }); return null; } catch (e) { return e; } })();
    ok("!! replaying that transcript on ANOTHER dive is refused (TranscriptMiss), not answered", other instanceof X.TranscriptMiss);
    const trG = X.createTranscript({ model: m }), garbage = T.fly(A.advisedPilot(obsSeat, X.llmSeat({ transcript: trG, mode: "record", modelFn: () => "I would rather not say." }), "VETO"), sc, { gauge: T.GAUGE });
    ok("!! a model that answers garbage on every step is the brain ALONE, bit for bit (GUARDED-OBS: same fingerprint, same score), and every answer is counted invalid", garbage.fingerprint === base.fingerprint && garbage.score === base.score && [...trG.entries.values()].every((e) => e.decision === null));
    ok("  the advice, when it is heard, is used: the scripted chip changes the run (it is not the brain alone)", recorded.fingerprint !== base.fingerprint);
}

sec("7. THE SOURCE");
{
    const src = fs.readFileSync(new URL("./advisorTranscript.mjs", import.meta.url), "utf8"), code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    const imports = [...code.matchAll(/^import .* from "([^"]+)";/gm)].map((m) => m[1]);
    ok("!! the file imports nothing but the sub model, and has no network, process, file, clock or random access", J(imports) === J(["../physics/mechanics/subModel6dof.mjs"]) && !/fetch\(|XMLHttpRequest|WebSocket|child_process|spawn|exec\(|readFileSync|writeFileSync|Date\.now|new Date|Math\.random|performance\.now|process\./.test(code));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;

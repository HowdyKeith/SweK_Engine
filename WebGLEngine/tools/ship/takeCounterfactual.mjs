// WebGLEngine/tools/ship/takeCounterfactual.mjs -- UNNUMBERED (the version is chosen at ship time) (the command line is tools/ship/takeCounterfactualCmd.mjs; the material is brain/counterfactual.mjs; the registration is brain/COUNTERFACTUAL_WIP.md; the gate is tools/ship/takeCounterfactual-selfcheck.mjs)
//
// THE COMMANDS OF THE COUNTERFACTUAL RE-FLIGHTS (registered before any of this was written and before any model was asked a request):
//   fly      --seed S [--kit decoy,screen]       flies the pair of scenario S (the Sea OGRE, three defenders, without and with the three countermeasures) and then the same scenario with the named subset of the kit (none given = no kit), and prints the re-flight's facts, numbered on after the pair's. Engine only: no model.
//   subsets  --seed S                            flies scenario S under all eight subsets of the kit and prints one line each: the outcome, the score, the defenders lost, which shown run it repeats, the first divergence from the empty kit and the decoyed and intercepted counts, and whether the score is above or below the empty kit's. Engine only: no model.
//   propose  --base <host:port> --key <key> --model <id> --set dev|registered --out <file>
//                                                asks the model ONCE per pair (temperature 0, 600 tokens, no retries) for ONE re-flight (the facts of the pair, then the ask), through ui/privateLmClient.mjs `chatStream` (the cross-platform LLM client or any OpenAI-compatible server), and records the transcript exactly as tools/ship/takeAfterAction.mjs does:
//                                                a header (the model id AS THE SERVER REPORTS IT, the id asked for, the parameters, the set) and one line a reply under the key of (model, parameters, prompt). RESUMABLE; a reply that did not arrive whole is NOT recorded and stops the run.
//   report   --in <file> [--in <file> ...]       OFFLINE (never asks a model): the PIPELINE checks first (the empty kit repeats run B and the full kit run K on every seed of the set, a re-flight is deterministic, the new facts are numbered on, a request round-trips; the transcripts are whole), then per model VALID, the refusals by reason, the share that repeat a shown run, the share whose outcome is new and the kits asked for, then the bottom line.
// The key goes into a request header and nowhere else. A library: the network, the files and the flights are seams `io` gives. NO orientation default is set (the Sea OGRE numbers of the series are the engine's own default).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "../../brain/afterAction.mjs";
import * as CF from "../../brain/counterfactual.mjs";
import { reportedModel, askOnce, readTranscript } from "./takeAfterAction.mjs";
import { normalizeBase } from "../../ui/privateLmClient.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const SET_NAMES = Object.freeze(Object.keys(A.SETS)), TRANSCRIPT_KIND = "counterfactual-transcript";
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : String(x));
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);

/** The pairs of a set with their facts and proposal prompts: [{ seed, pair, facts, prompt }]. `fly` is the seam (default: the real fights). */
export function pairsOf(set, fly = A.flyPair) {
    return A.seedsOf(set).map((seed) => { const pair = fly(seed), facts = A.factsOf(pair); return { seed, pair, facts, prompt: CF.proposalPromptOf(facts, seed) }; });
}
export const headerOf = (model, set, requested) => ({ ...A.headerOf(model), kind: TRANSCRIPT_KIND, set, requested });
/** The registered transcript checks for this transcript kind: the header is a counterfactual-transcript, then the after-action checks of the replies (twelve, one model, no duplicate, every key what its prompt says). */
export function transcriptChecks(header, entries, expected) {
    const f = [];
    if (!header || header.kind !== TRANSCRIPT_KIND) f.push("the header is not a " + TRANSCRIPT_KIND);
    for (const x of A.transcriptChecks(header ? { ...header, kind: "afterAction-transcript" } : header, entries, expected)) if (!/^the header is not an afterAction-transcript/.test(x)) f.push(x);
    return f;
}

// ---- the subsets table -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The eight subsets of one scenario: [{ kit, name, run, repeats, divergence, decoyed, intercepted, delta }] with `delta` the score minus the empty kit's. */
export function subsetsOf(seed, fly = A.flyPair) {
    const pair = fly(seed), rows = CF.SUBSETS.map((kit) => { const run = CF.flyKit(seed, [...kit]); return { kit: [...kit], name: CF.kitName(kit), run, repeats: CF.repeatsOf(pair, run), divergence: A.divergenceOf(pair.base.events, run.events), decoyed: run.events.filter((e) => e.type === "decoyed").length, intercepted: run.events.filter((e) => e.type === "intercepted").length }; });
    return { seed, pair, rows: rows.map((r) => ({ ...r, delta: r.run.score - rows[0].run.score })) };
}
export function subsetLines(s) {
    const L = [`SCENARIO ${s.seed}: the eight subsets of the kit (the Sea OGRE, ${CF.DEFENDERS} defenders); the empty kit is run B, the full kit run K`];
    for (const r of s.rows) L.push(`  ${r.name.padEnd(26)} ${r.run.outcome.padEnd(9)} score ${f3(r.run.score)}  lost ${r.run.lost}  ${r.repeats ? `repeats run ${r.repeats}` : "a new fight"}  decoyed ${r.decoyed} intercepted ${r.intercepted}  first divergence from none: ${r.divergence ? `tick ${r.divergence.tick} (none: ${r.divergence.base ? r.divergence.base.type : "nothing"}; this: ${r.divergence.kit ? r.divergence.kit.type : "nothing"})` : "none"}  ${r.name === "none" ? "(the reference)" : `${sgn(r.delta)} against none: ${r.delta > 1e-9 ? "ABOVE" : r.delta < -1e-9 ? "BELOW" : "EQUAL"}`}`);
    const below = s.rows.filter((r) => r.name !== "none" && r.delta < -1e-9).map((r) => r.name);
    L.push(`  ${below.length} of the 7 non-empty subsets score BELOW the empty kit${below.length ? ": " + below.join(", ") : ""}`);
    return L;
}

// ---- the report --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The report lines for transcripts of ONE set: `tfs` = [{ name, header, entries }], `pairs` = pairsOf(set). `pipeline` is the seam for the engine checks. Returns { lines, failed }. */
export function reportLines(tfs, pairs, set, pipeline = (seeds) => CF.pipelineChecks(seeds)) {
    const L = [], bad = [], expected = pairs.map((p) => ({ seed: p.seed, prompt: p.prompt }));
    for (const x of pipeline(pairs.map((p) => p.seed))) bad.push("PIPELINE: " + x);
    const per = tfs.map((tf) => {
        const tc = transcriptChecks(tf.header, tf.entries, expected);
        for (const x of tc) bad.push(`TRANSCRIPT (${tf.name}): ${x}`);
        const ents = pairs.filter((p) => tf.entries.some((e) => e.seed === p.seed)).map((p) => ({ seed: p.seed, pair: p.pair, facts: p.facts, reply: tf.entries.find((e) => e.seed === p.seed).reply }));
        return { tf, tc, ents, m: CF.measuresOf(ents) };
    });
    const models = tfs.map((t) => t.header && t.header.model);
    if (new Set(models).size !== models.length) bad.push("TRANSCRIPT: two files are of the same model id (one transcript per model)");
    if (bad.length) { for (const b of bad) L.push("CHECK FAILED -- " + b); L.push("THE PIPELINE IS BROKEN: THE PROPOSALS ARE NOT WEIGHED"); }
    L.push(`THE COUNTERFACTUAL RE-FLIGHTS: ${pairs.length} pairs of the Sea OGRE (${set === "registered" ? "scenarios " + A.SETS.registered.first + " to " + (A.SETS.registered.first + A.SETS.registered.count - 1) : "DEV scenarios " + A.SETS.dev.first + " to " + (A.SETS.dev.first + A.SETS.dev.count - 1) + " -- prompt development, NOT the registered read"}), ${tfs.length} model(s)`);
    L.push(`  checks: PIPELINE ${bad.some((b) => /^PIPELINE/.test(b)) ? "FAILED" : "ok"} (the empty kit repeats run B and the full kit run K on every seed, a re-flight is deterministic, the new facts are numbered on, a request round-trips); TRANSCRIPTS ${per.every((p) => p.tc.length === 0) ? "whole" : "NOT WHOLE"}`);
    for (const p of per) {
        const m = p.m, name = p.tf.header ? p.tf.header.model : p.tf.name, r = m.reasons;
        L.push(`  ${name}: VALID ${f3(m.share)} (${m.valid} of ${m.n})  refused: none ${r.none}, many ${r.many}, json ${r.json}, shape ${r.shape}, seed ${r.seed}, kit ${r.kit}, seedNotShown ${r.seedNotShown}`);
        L.push(`    of the ${m.valid} valid requests: ${m.repeats} repeat a shown run (nothing new), ${m.fresh} end in an outcome neither shown run had; kits asked for: ${Object.keys(m.kits).sort().map((k) => `${k} ${m.kits[k]}`).join(", ") || "none"}`);
        for (const e of p.ents) { const q = CF.readRequest(e.reply, e.seed); if (q.ok) { const a = CF.answerRequest(e.pair, e.facts, q.request); L.push(`      pair ${e.seed}: asked for ${CF.kitName(q.request.kit)} -> ${a.run.outcome}, score ${f3(a.run.score)}, ${a.run.lost} lost${a.repeats ? `, repeats run ${a.repeats}` : ""}`); } }
        L.push(`BOTTOM LINE (${name}): ${CF.readingOf(m, bad.length === 0)}`);
    }
    L.push("Limits, said plainly: VALID is the FORMAT and the seed, not the worth of the question asked; the engine states what the re-flight did and the model's words are neither a fact nor a result.");
    return { lines: L, failed: bad.length > 0 };
}

// ---- the command -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function parseArgs(argv) {
    const [cmd, ...rest] = argv;
    if (!["fly", "subsets", "propose", "report"].includes(cmd)) throw new Error(`the first word must be fly, subsets, propose or report, got ${JSON.stringify(cmd)}`);
    const known = cmd === "fly" ? { seed: Number, kit: String } : cmd === "subsets" ? { seed: Number } : cmd === "propose" ? { base: String, key: String, model: String, set: String, out: String } : { in: String }, given = {}, ins = [];
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known for ${cmd}: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        const v = rest[++i]; if (v == null || v.startsWith("--")) throw new Error(`${a} needs a value`);
        if (k === "in") ins.push(v); else { given[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isInteger(given[k])) throw new Error(`${a} needs a whole number, got ${JSON.stringify(v)}`); }
    }
    if (cmd === "report") { if (!ins.length) throw new Error("report needs --in <transcript file> (once per model)"); if (new Set(ins).size !== ins.length) throw new Error("a transcript file is named twice"); return { cmd, ins }; }
    if (cmd === "fly" || cmd === "subsets") {
        if (given.seed === undefined) throw new Error(`${cmd} needs --seed <whole number>`);
        if (cmd === "subsets") return { cmd, seed: given.seed };
        const names = given.kit === undefined ? [] : given.kit.split(",").map((s) => s.trim());
        if (given.kit !== undefined && names.some((n) => !CF.KIT_NAMES.includes(n))) throw new Error(`--kit takes names from ${CF.KIT_NAMES.join(", ")} separated by commas, got ${JSON.stringify(given.kit)}`);
        if (new Set(names).size !== names.length) throw new Error(`--kit names a countermeasure twice: ${JSON.stringify(given.kit)}`);
        return { cmd, seed: given.seed, kit: CF.KIT_NAMES.filter((k) => names.includes(k)) };
    }
    if (!given.set) throw new Error(`propose needs --set ${SET_NAMES.join("|")}`);
    if (!SET_NAMES.includes(given.set)) throw new Error(`unknown set ${JSON.stringify(given.set)} (${SET_NAMES.join(", ")})`);
    for (const need of ["base", "model", "out"]) if (!given[need]) throw new Error(`propose needs --${need}${need === "base" ? " <host:port>" : need === "model" ? " <model id>" : " <transcript file>"}`);
    if (!normalizeBase(given.base)) throw new Error(`--base ${JSON.stringify(given.base)} is not an address (host:port or http://host:port)`);
    return { cmd, set: given.set, base: given.base, key: given.key || "", model: given.model, out: given.out };
}
/** THE COMMAND as a function. Returns 0, 1 (a refusal, or a reply that did not arrive) or 2 (a bad argument). `io`: { out, err, readFile, appendFile, writeFile, exists, fetch, fly, pipeline }. */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(path.resolve(ENG, f), "utf8")), appendFile = io.appendFile || ((f, t) => fs.appendFileSync(path.resolve(ENG, f), t)), writeFile = io.writeFile || ((f, t) => fs.writeFileSync(path.resolve(ENG, f), t)), exists = io.exists || ((f) => fs.existsSync(path.resolve(ENG, f)));
    let o; try { o = parseArgs(argv); } catch (e) { err("takeCounterfactual: " + e.message); return 2; }
    if (o.cmd === "fly") {
        const pair = (io.fly || A.flyPair)(o.seed), facts = A.factsOf(pair), a = CF.answerRequest(pair, facts, { seed: o.seed, kit: o.kit });
        out(`PAIR ${o.seed}: ${facts.length} facts (F1 to F${facts.length}); RE-FLIGHT with the kit ${CF.kitName(o.kit)}: ${a.facts.length} new facts${a.repeats ? `, a repeat of run ${a.repeats}` : ""}`);
        for (const f of a.facts) out("  " + A.lineOf(f) + (f.salient ? "   [salient]" : ""));
        return 0;
    }
    if (o.cmd === "subsets") { for (const l of subsetLines(subsetsOf(o.seed, io.fly || A.flyPair))) out(l); return 0; }
    if (o.cmd === "report") {
        const tfs = []; let set = null;
        for (const f of o.ins) {
            let tf; try { tf = { name: f, ...readTranscript(readFile(f)) }; } catch (e) { err("takeCounterfactual: " + e.message); return 1; }
            if (!tf.header) { err(`takeCounterfactual: ${f} is empty`); return 1; }
            if (!A.SETS[tf.header.set]) { err(`takeCounterfactual: ${f} names no known set (${SET_NAMES.join(", ")})`); return 1; }
            if (set && tf.header.set !== set) { err("takeCounterfactual: the transcripts are of different sets: one report reads one set"); return 1; }
            set = tf.header.set; tfs.push(tf);
        }
        const r = reportLines(tfs, pairsOf(set, io.fly || A.flyPair), set, io.pipeline); for (const l of r.lines) out(l);
        return 0;
    }
    // propose
    const f = io.fetch || (typeof fetch === "function" ? fetch : null); if (!f) { err("takeCounterfactual: no fetch in this runtime"); return 1; }
    let header = null, entries = [];
    if (exists(o.out)) {
        try { const tf = readTranscript(readFile(o.out)); header = tf.header; entries = tf.entries; } catch (e) { err("takeCounterfactual: " + e.message); return 1; }
        if (!header || header.kind !== TRANSCRIPT_KIND) { err(`takeCounterfactual: ${o.out} is not a counterfactual transcript`); return 1; }
        if (header.set !== o.set) { err(`takeCounterfactual: ${o.out} is a transcript of the ${header.set} set and this run is of the ${o.set} set: it is not mixed -- use another --out`); return 1; }
    }
    const reported = await reportedModel(o.base, o.key, f);
    if (header && reported && reported !== header.model) { err(`takeCounterfactual: the server reports the model ${JSON.stringify(reported)} and ${o.out} is a transcript of ${JSON.stringify(header.model)}: one transcript is one model`); return 1; }
    if (!header) { header = headerOf(reported || o.model, o.set, o.model); writeFile(o.out, JSON.stringify(header) + "\n"); }
    const ps = pairsOf(o.set, io.fly || A.flyPair), have = new Set(entries.map((e) => e.seed)), todo = ps.filter((p) => !have.has(p.seed));
    out(`[takeCounterfactual] model ${header.model} (asked for ${JSON.stringify(o.model)}); ${ps.length} pairs of the ${o.set} set, ${ps.length - todo.length} already in ${o.out}, ${todo.length} to ask; temperature ${A.MODEL_PARAMS.temperature}, ${A.MODEL_PARAMS.max_tokens} tokens, one ask a pair, no retries`);
    for (const p of todo) {
        const r = await askOnce(o.base, o.key, p.prompt, f, { model: o.model });
        if (!r.ok) { err(`takeCounterfactual: pair ${p.seed}: ${r.error} (the replies so far are in ${o.out}; run the same command again to go on)`); return 1; }
        appendFile(o.out, JSON.stringify(A.entryOf(header.model, header.params, p.seed, p.prompt, r.text)) + "\n");
        out(`[takeCounterfactual] pair ${p.seed} answered (${r.text.split(/\s+/).filter(Boolean).length} words)`);
    }
    out(`[takeCounterfactual] the transcript is whole in ${o.out}; read it with: report --in ${o.out}`);
    return 0;
}

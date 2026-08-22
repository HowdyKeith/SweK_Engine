// WebGLEngine/tools/ship/registryOrphans.mjs -- v3585
// ---------------------------------------------------------------------------------------------------------------
// *** THE REGISTRY WAS ONLY EVER CHECKED IN ONE DIRECTION, AND I COMMITTED THE OTHER ONE SEVEN TIMES. ***
//
// Something has always checked that an INSTRUMENT ENTRY POINTS AT A GATE THAT EXISTS. Nothing checked the
// mirror: A GATE THAT SHOULD HAVE AN ENTRY AND HAS NONE. At v3584 seven gates I had written this session turned
// out to be in that state -- they ran when named and were invisible to anything reading INSTRUMENTS -- and they
// were found only because an anchor lookup happened to fail while adding an eighth.
//
// ================================================================================================================
// AND THE FIRST VERSION OF THIS CHECK WAS USELESS, WHICH IS WORTH SAYING BEFORE THE NUMBER
// ================================================================================================================
//
// "A gate with no instrument entry" returns 808 OF 912. *** THAT IS NOT A DEFECT LIST, IT IS THE OBSERVATION
// THAT INSTRUMENTS ARE A CURATED SUBSET OF GATES. *** Most gates are small local checks that were never meant to
// be instruments, and a detector reporting 808 problems reports none: it would be read once, disbelieved, and
// ignored, which is worse than silence because it costs the reader's trust in every other report beside it.
//
// THE NARROW CLASS IS THE ONE WITH A SIGNAL IN IT: a gate whose MODULE FOLLOWS THE v3327 SPLIT -- exports
// reportLines() -- and has no entry. That split is the mark of a module written to be READ as well as checked,
// which is exactly what an instrument is, and it is why the v3581 bench can serve one. TWENTY-TWO OF THEM,
// including physics/info/entropy, a round this session has cited as a landmark four times while it sat outside
// the registry.
//
// The wide count is REPORTED ALONGSIDE, because the narrow number only means something if you can see what it
// was narrowed from.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { INSTRUMENTS } from "../../physics/instruments.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENG = path.resolve(HERE, "..", "..");

const hasSplit = (mod) => {
    try { return /export\s+(async\s+)?function\s+reportLines/.test(fs.readFileSync(path.join(ENG, mod), "utf8")); }
    catch { return false; }
};
// *** v3933 -- A reportLines THAT REQUIRES A RESULT IS A FORMATTER, NOT A READABLE MODULE. ***
//
// hasSplit asks only whether reportLines is EXPORTED, which is right for "does this module follow the v3327
// split". It is NOT enough for "can the bench serve this one": officeManager and composePropose both export
// `reportLines(r)`, which FORMATS a result somebody else computed. Called with nothing they throw -- and a bench
// page pointing at them would render an error where a reader expected a measurement, which is exactly what
// benchBroken exists to prevent, arriving through the other door.
//
// The distinction is in the PARAMETER LIST and is derived rather than a list of two names: a reporter the bench
// can call takes no required argument. A default value still counts as callable, because it is.
const benchServable = (mod) => {
    try {
        const m = fs.readFileSync(path.join(ENG, mod), "utf8")
            .match(/export\s+(?:async\s+)?function\s+reportLines\s*\(([^)]*)\)/);
        if (!m) return false;
        const params = m[1].trim();
        return params === "" || /=/.test(params);        // no parameter, or one with a default
    } catch { return false; }
};

export const moduleFor = (gate) => gate.replace(/-selfcheck\.mjs$/, ".mjs");

export function scan() {
    const K = JSON.parse(fs.readFileSync(path.join(ENG, "knowledge-index.json"), "utf8"));
    const registered = new Set(INSTRUMENTS.map((i) => i.gate).filter(Boolean));
    const wide = [], narrow = [], danglingEntries = [];
    for (const g of K.gates) {
        if (registered.has(g.path)) continue;
        wide.push(g.path);
        const mod = moduleFor(g.path);
        if (fs.existsSync(path.join(ENG, mod)) && hasSplit(mod)) narrow.push({ gate: g.path, module: mod });
    }
    // the direction that WAS already checked, kept here so both live in one place
    for (const i of INSTRUMENTS)
        if (i.gate && !fs.existsSync(path.join(ENG, i.gate))) danglingEntries.push(i.id);
    // *** A SECOND DIRECTION, ADDED AT v3586 BECAUSE THE FIRST ONE MISSED SIX. ***
    // v3585 asked "is there an ENTRY for this gate" and fixed 22. It never asked "does this entry QUALIFY for
    // the bench and lack a page", and SIX INSTRUMENTS WERE IN EXACTLY THAT STATE -- every one of them registered
    // by me, with page: null, in the same round as the check that was supposed to cover this ground. Registered
    // and pageless is a different question from unregistered, and answering one felt like answering both.
    const benchEligible = [], benchBroken = [];
    for (const i of INSTRUMENTS) {
        if (!i.gate) continue;
        const mod = moduleFor(i.gate);
        const canReport = fs.existsSync(path.join(ENG, mod)) && hasSplit(mod);
        if (canReport && benchServable(mod) && !i.page) benchEligible.push({ id: i.id, module: mod });
        // and the reverse: a bench page whose module cannot report would render an error where a reader
        // expected a measurement
        if (i.page === "instrument-bench.html" && !canReport) benchBroken.push({ id: i.id, module: mod });
    }
    // the pageless remainder, split by WHY, because "27 need a page" turned out to be three different jobs
    const pageless = INSTRUMENTS.filter((i) => !i.page).map((i) => {
        const mod = i.gate ? moduleFor(i.gate) : null;
        const exists = mod ? fs.existsSync(path.join(ENG, mod)) : false;
        return { id: i.id, module: mod, exists, split: exists && hasSplit(mod), device: !!i.device };
    });
    return { totalGates: K.gates.length, instruments: INSTRUMENTS.length,
             registeredGates: registered.size, wide, narrow, danglingEntries,
             benchEligible, benchBroken,
             pageless: { total: pageless.length,
                         noModule: pageless.filter((p) => !p.exists).length,
                         noSplit: pageless.filter((p) => p.exists && !p.split).length,
                         qualifies: pageless.filter((p) => p.split).length,
                         rows: pageless } };
}

/**
 * The module's own opening claim, for an entry that must not be invented.
 *
 * *** WRITING A `key` FOR TWENTY-TWO MODULES I HAVE NOT STUDIED WOULD BE FABRICATION. *** The key field is a
 * claim about what an instrument ESTABLISHES, and this lab's whole practice is that such a claim is measured or
 * read, never composed to fill a field. So the text is LIFTED FROM THE MODULE'S OWN HEADER -- the lines it wrote
 * about itself -- and the gate asserts that every registered key is traceable to its source rather than authored
 * in the registry.
 */
export function headerClaim(mod, { maxLines = 14 } = {}) {
    const src = fs.readFileSync(path.join(ENG, mod), "utf8").split("\n");
    const out = [];
    for (let i = 0; i < src.length && out.length < maxLines; i++) {
        const l = src[i];
        if (!l.startsWith("//")) { if (out.length) break; continue; }
        const t = l.replace(/^\/\/ ?/, "").trimEnd();
        if (/^-{10,}$/.test(t)) continue;                    // rule lines carry nothing
        if (/^WebGLEngine\/|^physics\/|^tools\//.test(t)) continue;   // the path banner is not a claim
        if (!t && !out.length) continue;
        out.push(t);
    }
    while (out.length && !out[out.length - 1]) out.pop();
    return out.join(" ").replace(/\s+/g, " ").trim();
}

export function reportLines() {
    const s = scan();
    const L = [];
    L.push("[registryOrphans] gates that should be instruments and are not");
    L.push("");
    L.push("  gates " + s.totalGates + "   instruments " + s.instruments + "   registered gates " + s.registeredGates);
    L.push("  WIDE  (any gate with no entry):        " + s.wide.length +
           "   <- not a defect list: instruments are a CURATED SUBSET");
    L.push("  NARROW (module follows the v3327 split): " + s.narrow.length +
           "   <- written to be READ as well as checked");
    L.push("  dangling entries (the direction already checked): " + s.danglingEntries.length);
    L.push("  BENCH-ELIGIBLE BUT PAGELESS: " + s.benchEligible.length +
           "   <- registered, qualifies, and still has no door");
    L.push("  bench pages whose module cannot report: " + s.benchBroken.length);
    L.push("");
    L.push("  pageless " + s.pageless.total + " = " + s.pageless.noModule + " with NO MODULE (a standalone gate, " +
           "which the bench can never serve) + " + s.pageless.noSplit + " with a module and no split + " +
           s.pageless.qualifies + " that qualify");
    L.push("");
    for (const n of s.narrow.slice(0, 25)) L.push("    " + n.module);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}

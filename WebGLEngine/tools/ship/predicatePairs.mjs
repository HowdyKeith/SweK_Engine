// WebGLEngine/tools/ship/predicatePairs.mjs
//
// v4420 -- *** DISCOVERING THAT TWO FUNCTIONS ANSWER THE SAME QUESTION, WHICH v4419 NAMED AS THE HARDER HALF
// AND WHERE ITS OWN FINDING ACTUALLY LIVED. ***
//
// v4418 found the sixth instance of the session's defect species by comparing world/orrery.mjs's isLicenceFile
// with world/orreryEjecta.mjs's isPaperFile -- two functions classifying the same kind of file and disagreeing
// on two real ones. That comparison was HAND-WRITTEN, and v4419 closed by saying so: "nothing here DISCOVERS
// that two functions are answering the same question."
//
// THE SIGNATURE IS MECHANICAL AND NEEDS NO SEMANTICS. Run every predicate over the same corpus and compare the
// sets they accept:
//   identical   -- the same set. Two implementations of one question; a duplicate, not a defect.
//   containment -- one set inside the other. A DESIGNED HIERARCHY: every licence is paperwork, and more besides.
//   CROSSING    -- each accepts something the other rejects. TWO FUNCTIONS ANSWERING ONE QUESTION AND
//                  DISAGREEING ABOUT IT, which is the shape the sixth instance had, and the fix at v4418
//                  turned it from crossing into containment.
//
// The measure is the OVERLAP COEFFICIENT, |A n B| / min(|A|,|B|), not Jaccard: containment scores 1.0 where
// Jaccard scores 0.35, and containment is exactly the relation a hierarchy has. Raw agreement is useless here
// -- two predicates that reject almost everything agree 92% of the time about nothing.
//
// *** CALLING A FUNCTION TO FIND OUT WHAT IT IS IS A HAZARD, AND THE FIRST DRAFT PROVED IT. *** Calling every
// unary export ran render/passFootprint.mjs's perturbFootprint, which reached for a GPU and threw. Two layers
// guard it now: the module must be QUIET (no top-level statements beyond declarations, no process.exit), and
// the function's body must call NOTHING but string and regex operations or another predicate.
"use strict";

export const PREDNAME = /^(is|has|looks|should|can|needs|counts|reads)[A-Z]/;

const ALLOWED = new Set(["test", "String", "split", "pop", "toLowerCase", "toUpperCase", "includes", "startsWith",
    "endsWith", "replace", "trim", "match", "indexOf", "exec", "Boolean", "charAt", "normalize",
    "some", "every", "filter", "map", "join", "if", "return", "switch", "while", "for"]);
const STRINGY = /String\(|\.split\(|\.toLowerCase\(|startsWith\(|endsWith\(|\.test\(|\.includes\(|typeof /;

/** A module safe to import: nothing runs when you do. */
export function isQuiet(src) {
    const s = String(src || "");
    const top = s.split("\n").filter((l) => /^[a-zA-Z(]/.test(l) &&
        !/^(import|export|const|let|var|function|class|async|await)\b/.test(l));
    return top.length === 0 && !/^\s*process\.exit/m.test(s);
}

/**
 * Exported predicates whose bodies are provably string work.
 *
 * *** THE BODY CAP WAS 700 CHARACTERS AND isPaperFile'S COMMENT IS LONGER THAN THAT, so the function this whole
 * file exists to compare was not extracted at all. *** Comments are stripped BEFORE the purity scan for the
 * same reason: prose about a call is not a call, which is v4412's finding in a fourth place.
 */
export function extractPredicates(src) {
    const out = [];
    const RE = /export\s+(?:function\s+(\w+)\s*\(\s*(\w+)[^)]*\)\s*\{([\s\S]{0,4000}?)\n\}|const\s+(\w+)\s*=\s*\(?\s*(\w+)\s*\)?\s*=>\s*([^;\n]+))/g;
    const CALLS = /\b([A-Za-z_$][\w$]*)\s*\(/g;
    let m;
    while ((m = RE.exec(String(src || "")))) {
        const name = m[1] || m[4];
        let body = m[3] || m[6] || "";
        if (!name || !body || !PREDNAME.test(name)) continue;
        body = body.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
        if (!STRINGY.test(body)) continue;
        let pure = true;
        CALLS.lastIndex = 0;
        let c;
        while ((c = CALLS.exec(body))) {
            if (ALLOWED.has(c[1]) || PREDNAME.test(c[1])) continue;
            pure = false; break;
        }
        if (pure) out.push({ name, body: body.trim() });
    }
    return out;
}

/**
 * The set a predicate accepts, over the whole corpus.
 *
 * *** THE FIRST DRAFT PROBED THE FIRST 400 NAMES AND THE FIRST 400 HOLD NO LICENCE, so isLicenceFile looked
 * like a function that never returns true and was dropped. A sample that misses the positive class is a sample
 * that answers a different question.
 */
export function accepts(fn, corpus) {
    const set = [];
    for (const s of corpus) {
        let r;
        try { r = fn(s); } catch { return null; }
        if (typeof r !== "boolean") return null;
        if (r) set.push(s);
    }
    return set;
}

export function relate(setA, setB) {
    const A = new Set(setA), B = new Set(setB);
    const inter = [...A].filter((x) => B.has(x));
    const onlyA = [...A].filter((x) => !B.has(x));
    const onlyB = [...B].filter((x) => !A.has(x));
    const overlap = Math.min(A.size, B.size) ? inter.length / Math.min(A.size, B.size) : 0;
    const jaccard = (A.size + B.size - inter.length) ? inter.length / (A.size + B.size - inter.length) : 0;
    const shape = onlyA.length && onlyB.length ? "crossing"
                : onlyA.length || onlyB.length ? "containment" : "identical";
    return { overlap, jaccard, shape, inter: inter.length, onlyA, onlyB, sizeA: A.size, sizeB: B.size };
}

export function census(preds, corpus, { floor = 0.5 } = {}) {
    const live = [];
    for (const p of preds) {
        const set = accepts(p.fn, corpus);
        if (!set || set.length === 0 || set.length === corpus.length) continue;   // a constant is not a classifier
        live.push({ ...p, set });
    }
    const rows = [];
    for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
            const r = relate(live[i].set, live[j].set);
            if (r.overlap < floor) continue;
            rows.push({ a: live[i], b: live[j], ...r });
        }
    }
    rows.sort((x, y) => y.overlap - x.overlap);
    return { rows, predicates: live.length, crossing: rows.filter((r) => r.shape === "crossing") };
}

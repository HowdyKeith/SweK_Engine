// WebGLEngine/tools/ship/verifyLicenceTexts.mjs -- v4203
//
// RE-FETCHES EVERY LICENCE world/reachedLicences.mjs CLAIMS TO QUOTE, AND COMPARES BYTE FOR BYTE.
//
// *** THIS IS A SEPARATE TOOL AND NOT A GATE, ON PURPOSE. *** tools/ship/reachedLicences-selfcheck.mjs can
// prove the register is SELF-CONSISTENT -- that each text matches its own recorded digest, word count and
// character count -- and that is worth having, because it catches a later edit. It cannot prove the original
// transcription was right. Nothing local can. The only evidence for that is the source, and reaching the
// source needs a network, which a gate must never need: a hermetic suite that silently passes when offline
// is worse than no check at all.
//
// So the split is: the gate proves the record has not drifted, this tool proves the record was true, and
// `retrieved` in LICENCE_TEXTS records when the two last agreed.
//
// *** WHAT IT IS FOR, MEASURED. *** v4198 recorded 48 words of a 77-word licence and spelled "build" as
// "built". Both survived four versions, a gate, and a round whose stated subject was that licence, because
// every check available compared the record against itself. This tool run once would have caught both.
//
// Run: node tools/ship/verifyLicenceTexts.mjs        (needs a network; exits 2 if it cannot reach GitHub)

import { LICENCE_TEXTS } from "../../world/reachedLicences.mjs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

/**
 * Pull the "## License" section out of a GitHub README, minus the "Read more here" link line.
 *
 * *** THE EXCLUSIONS ARE RECORDED IN LICENCE_TEXTS[].note RATHER THAN BEING SILENT HERE. *** An extractor
 * that quietly drops a line is how a 77-word licence becomes a 48-word one; a reader must be able to see
 * what was left out without reading this function.
 */
export function licenceSection(readme) {
    const lines = readme.split("\n");
    const out = [];
    let inSection = false;
    for (const line of lines) {
        if (/^##\s+License\b/i.test(line)) { inSection = true; continue; }
        if (inSection && /^##\s/.test(line)) break;
        if (!inSection) continue;
        if (!line.trim()) continue;
        if (/^Read more here/i.test(line.trim())) continue;
        out.push(line.replace(/\s+$/, ""));
    }
    return out.join("");
}

const sha = (t) => createHash("sha256").update(t, "utf8").digest("hex");

async function main() {
    let checked = 0, agreed = 0, disagreed = 0, unreachable = 0;
    for (const [id, q] of Object.entries(LICENCE_TEXTS)) {
        console.log(`\n${id}  --  ${q.words} words, ${q.chars} chars, sha256 ${q.sha256.slice(0, 8)}, read ${q.retrieved}`);
        for (const url of q.sourceUrls) {
            checked++;
            let readme;
            try {
                const res = await fetch(url);
                if (!res.ok) { console.log(`  UNREACHABLE  ${res.status}  ${url}`); unreachable++; continue; }
                readme = await res.text();
            } catch (e) { console.log(`  UNREACHABLE  ${e.message}  ${url}`); unreachable++; continue; }

            const found = licenceSection(readme);
            if (found === q.text) { agreed++; console.log(`  AGREES       ${url}`); continue; }
            disagreed++;
            const fw = found.split(/\s+/).filter(Boolean).length;
            console.log(`  DISAGREES    ${url}`);
            console.log(`    recorded: ${q.words} words, ${q.chars} chars, sha ${q.sha256.slice(0, 12)}`);
            console.log(`    fetched : ${fw} words, ${found.length} chars, sha ${sha(found).slice(0, 12)}`);
            // *** SAY WHERE, NOT JUST THAT. *** "the licence changed" sends a reader to diff two paragraphs
            // by eye. The first differing word is the whole report when the fault is one letter, which is
            // exactly the fault this file exists because of.
            const A = q.text.split(/\s+/), B = found.split(/\s+/);
            for (let i = 0; i < Math.max(A.length, B.length); i++) {
                if (A[i] !== B[i]) {
                    console.log(`    first divergence at word ${i}: recorded ${JSON.stringify(A[i])}, source ${JSON.stringify(B[i])}`);
                    break;
                }
            }
            if (found.startsWith(q.text)) {
                console.log(`    the record is a PREFIX of the source -- it is truncated, missing ${fw - q.words} words:`);
                console.log(`      ${JSON.stringify(found.slice(q.text.length).trim())}`);
            }
        }
    }
    console.log(`\nverifyLicenceTexts: ${checked} sources -- ${agreed} agree, ${disagreed} disagree, ${unreachable} unreachable`);
    if (unreachable && !disagreed && !agreed) { console.log("no source was reachable; this proves nothing"); process.exit(2); }
    process.exit(disagreed ? 1 : 0);
}

// *** ONLY WHEN RUN DIRECTLY. *** The gate imports licenceSection() to test the extractor offline, and the
// first draft here called main() at module scope -- so importing the extractor fired five network requests
// and printed a report in the middle of an unrelated test run. An exported helper and a script are two
// different things sharing one file, and the file has to say which it is being.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

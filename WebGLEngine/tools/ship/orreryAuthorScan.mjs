// WebGLEngine/tools/ship/orreryAuthorScan.mjs
//
// Run: node tools/ship/orreryAuthorScan.mjs [--write]
//
// v4414 -- bakes orrery-authors.json: for each vendored body, WHO the bytes on disk say wrote it, and for each
// author, what this tree took from them. The orrery has drawn this repository at the centre since v4185; Keith
// asked for the inversion, and the field it needs did not exist -- orrery.json's fifteen bodies carry
// [name, arrived, sha, bytes] and files, with no owner, url or repo on any of them.
//
// EVIDENCE ONLY, FROM BYTES IN THE TREE. The copyright line in each licence, and an upstream URL where a
// PROVENANCE.md records one. Nothing is inferred from a package name or a directory name, and a body whose
// author cannot be read is carried as unattributed rather than dropped or guessed.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { census, systems } from "../../world/orreryAuthor.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BAKE = "orrery-authors.json";

export function build(root = ENG) {
    const O = JSON.parse(fs.readFileSync(path.join(root, "orrery.json"), "utf8"));
    const read = (rel) => { try { return fs.readFileSync(path.join(root, "vendor", rel), "utf8"); } catch { return null; } };
    const c = census(O.bodies, read);
    const sizeOf = (n) => (O.bodies.find((b) => b.name === n) || {}).bytes || 0;
    const s = systems(c.rows, sizeOf);
    return {
        note: "WHO the bytes say wrote each vendored body, read from the copyright line in its licence and from " +
              "a PROVENANCE.md where one records an upstream. Baked by tools/ship/orreryAuthorScan.mjs. A body " +
              "whose author cannot be read is in `unattributed` -- never dropped, never given a placeholder.",
        built: new Date().toISOString().slice(0, 10),
        bodies: c.rows.map((r) => ({ name: r.name, kind: r.kind, who: r.who, line: r.line,
                                     licenceFile: r.licenceFile, licences: r.licences,
                                     alsoHolders: r.alsoHolders, upstream: r.upstream, bytes: sizeOf(r.name) })),
        systems: s.systems,
        unattributed: s.unattributed.map((r) => ({ name: r.name, kind: r.kind, licenceFile: r.licenceFile })),
        counts: { bodies: c.seen, attributed: c.attributed, authors: s.authors, covered: s.covered,
                  missing: s.missing, withUpstream: c.withUpstream,
                  person: c.person.length, collective: c.collective.length, disclaimed: c.disclaimed.length,
                  prose: c.prose.length, none: c.none.length, unread: c.unread.length },
    };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const payload = build();
    const file = path.join(ENG, BAKE);
    const text = JSON.stringify(payload, null, 1) + "\n";
    const c = payload.counts;
    console.log(`[authors] ${c.bodies} bodies: ${c.person} person, ${c.collective} collective, ${c.disclaimed} disclaimed, ` +
        `${c.prose} prose, ${c.none} none, ${c.unread} unread -> ${c.authors} authors covering ${c.covered}, ${c.missing} unattributed, ` +
        `${c.withUpstream} with an upstream owner`);
    if (process.argv.includes("--write")) { fs.writeFileSync(file, text); console.log(`${BAKE} written: ${text.length} bytes`); }
    else console.log(`${BAKE} not written -- pass --write`);
}

// WebGLEngine/tools/ship/controlDossier.mjs -- v3176
//
// 114 ROUND-TRIP CONTROLS, 2 GUARDED, AND THE QUEUE HAS ASKED FOR A HUMAN DECISION PER SITE SINCE v3113.
//
// That framing is right and it is also too expensive: 114 decisions is a project, and it has therefore been
// made zero times in sixty rounds. But v3113 said WHY each needs a person, and the reason contains the shortcut:
// "A SLIDER, A SELECT AND A PASSWORD FIELD DO NOT FAIL ALIKE."
//
// *** THE DECISION IS PER KIND, NOT PER SITE. *** A range whose load failed shows its midpoint; a checkbox
// shows unchecked; a password shows empty; a select shows its first option. Those are FOUR judgements, and once
// made they cover every site of that kind. A CRUDE COUNT NEAR A HUNDRED IS AN UNASKED QUESTION -- this asks it.
//
// *** AND IT PROPOSES NOTHING. *** It reports what each control IS and what its unguarded failure would write.
// Suggesting a safe value per site would be me guessing 114 times with extra steps, which is exactly what v3113
// declined to do and exactly what "never type a reference value" forbids. The dossier is evidence; the ruling
// is Keith's.

import fs from "node:fs";
import path from "node:path";

/** What a browser leaves in a control whose load never arrived -- the value a naive save would then write. */
export const KIND_DEFAULT = {
    range:    "the slider's midpoint (or its `value` attribute if set) -- a PLAUSIBLE NUMBER, which is the worst kind of wrong",
    checkbox: "unchecked -- reads as a deliberate OFF, and v3040's tunnel checkbox is exactly this failure",
    radio:    "whichever option carries `checked`, or none at all",
    password: "empty -- and an empty password SAVED OVER A GOOD ONE is the most expensive of these",
    text:     "empty or the `value` attribute",
    number:   "empty or the `value` attribute",
    select:   "the first <option>, or the one marked `selected`",
    other:    "unknown -- the element could not be classified, which is itself worth a look",
};

function classify(html, id) {
    // Find the element carrying this id and ask what it IS. Comments stripped first: a commented-out control
    // must not classify a live one, and this file names every type it detects.
    const src = html.replace(/<!--[\s\S]*?-->/g, " ");
    const re = new RegExp('<(input|select|textarea)\\b[^>]*\\bid\\s*=\\s*["\']' + id + '["\'][^>]*>', "i");
    const m = src.match(re);
    if (!m) {
        // ALSO TRY id-FIRST ORDERING, because attribute order is the author's choice and not a fact about the
        // control. Missing a site because the id came before the type would be a silent undercount.
        const re2 = new RegExp('<(input|select|textarea)\\b[^>]*>', "gi");
        for (const tag of src.match(re2) || []) {
            if (new RegExp('\\bid\\s*=\\s*["\']' + id + '["\']').test(tag)) return kindOf(tag);
        }
        return { kind: "other", tag: null, why: "no <input>/<select>/<textarea> carries this id" };
    }
    return kindOf(m[0]);
}

function kindOf(tag) {
    const t = /^<select/i.test(tag) ? "select"
        : /^<textarea/i.test(tag) ? "text"
        : (tag.match(/\btype\s*=\s*["']([a-z]+)["']/i) || [, "text"])[1].toLowerCase();
    const kind = KIND_DEFAULT[t] ? t : "other";
    return {
        kind,
        tag: tag.slice(0, 160),
        // WHAT THE MARKUP ITSELF WOULD LEAVE, which is more specific than the kind's general answer.
        markupValue: (tag.match(/\bvalue\s*=\s*["']([^"']*)["']/i) || [, null])[1],
        checkedByDefault: /\bchecked\b/i.test(tag),
    };
}

/**
 * Every round-trip control, grouped by KIND, with the markup evidence for each site.
 * Takes the census rather than re-deriving it -- one definition of "round-trip control", not two.
 */
export function controlDossier(engRoot, census) {
    const byKind = {};
    for (const f of census.perFile) {
        let html; try { html = fs.readFileSync(path.join(engRoot, f.file), "utf8"); } catch { continue; }
        for (const id of f.ids) {
            const c = classify(html, id);
            (byKind[c.kind] = byKind[c.kind] || []).push({ file: f.file, id, ...c });
        }
    }
    const kinds = Object.keys(byKind).sort((a, b) => byKind[b].length - byKind[a].length);
    return { kinds, byKind, total: kinds.reduce((n, k) => n + byKind[k].length, 0) };
}

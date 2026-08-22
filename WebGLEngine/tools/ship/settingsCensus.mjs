// WebGLEngine/tools/ship/settingsCensus.mjs
// VERSION: v1 -- v3262
//
// WHAT THE SETTINGS SCHEMA COVERS, AND WHO ACTUALLY READS IT.
//
// Keith asked whether all the settings are reachable from the phone links and from server.html, for the four
// surfaces that matter -- box3d, the main render window, the kaiju demo, the ogre demo.
//
// *** THE FIRST ANSWER IS THAT THE REGISTRY ALREADY EXISTS AND I ALMOST BUILT A SECOND ONE. *** ui/settingsHub.js
// is 3,460 lines and its own header states the law: "The SCHEMA is the audit: every controllable feature is
// listed here with a default + a get/set binding. If a feature isn't in this list, it's a gap." EIGHTH TIME THIS
// SESSION the thing I was about to write turned out to be there.
//
// buildSettingsSchema(ctx) IS PURE AND IMPORTS HEADLESSLY -- its header says so and it is true, which is why
// this census can be a gate instead of a browser errand.
//
// *** THE SECOND ANSWER IS THE SHARP ONE: 145 CONTROLS, BUT ONLY 42 ARE VALUES. *** 56 are custom panels and 47
// are buttons -- 103 of 145 ARE NOT SETTINGS AT ALL. "Is every setting reachable from the phone?" cannot be
// answered until that split is made, because a button is an ACTION and a custom panel is a VIEW, and neither has
// a value a JSON document could carry. Counting them together produces a coverage figure that means nothing.

import fs from "node:fs";
import path from "node:path";

const VALUE_TYPES = ["toggle", "select", "slider", "number", "text"];

/**
 * Census the schema.
 *
 * @param {object} schema  the array from buildSettingsSchema()
 * @returns {{ categories, controls, values, actions, views, byKind, byCategory, unbound }}
 *
 * `unbound` is the schema's OWN stated failure: a value-bearing control with no get or no set. Its header calls
 * an absent entry a gap; a PRESENT entry that cannot be read or written is a quieter one.
 */
export function censusSchema(schema) {
    const byKind = {}, byCategory = [];
    let controls = 0, values = 0, actions = 0, views = 0;
    const unbound = [];

    for (const cat of schema || []) {
        const list = cat.controls || [];
        let catValues = 0;
        for (const c of list) {
            controls++;
            const kind = c.type || "?";
            byKind[kind] = (byKind[kind] || 0) + 1;
            if (VALUE_TYPES.includes(kind)) {
                values++; catValues++;
                if (typeof c.get !== "function" || typeof c.set !== "function") {
                    unbound.push({ cat: cat.id, id: c.id, missing: [typeof c.get !== "function" && "get",
                                                                    typeof c.set !== "function" && "set"].filter(Boolean) });
                }
            } else if (kind === "button") actions++;
            else views++;
        }
        byCategory.push({ id: cat.id, label: cat.label || "", controls: list.length, values: catValues });
    }
    return { categories: (schema || []).length, controls, values, actions, views, byKind, byCategory, unbound };
}

/**
 * Which surfaces MOUNT the hub, and which build their own settings UI instead.
 *
 * *** THIS IS THE QUESTION KEITH ACTUALLY ASKED, AND IT IS NOT ABOUT COUNTS. *** A page with its own hand-rolled
 * settings form is not "missing settings" -- it is a SECOND DECLARATION of them, which is this project's most
 * repeated defect. The census reports mounts and non-mounts separately rather than scoring pages out of 145.
 */
export function censusConsumers(root) {
    const readFile = (p) => { try { return fs.readFileSync(path.join(root, p), "utf8"); } catch { return ""; } };
    // *** MY FIRST VERSION SCANNED ONLY ROOT .html AND REPORTED "NOTHING MOUNTS THE HUB". *** main.js imports
    // SettingsHub at line 211 and mounts it at 19245 -- so index.html mounts it THROUGH ITS SCRIPT, which a
    // scan of HTML text alone cannot see. That would have been a false alarm of the worst kind: telling Keith
    // his settings panel was orphaned when it is the main render window's own panel.
    //
    // A PAGE MOUNTS THE HUB IF IT MENTIONS IT *OR* IF ANY SCRIPT IT LOADS DOES. One hop is enough here and the
    // limit is stated rather than silent: a hub reached through two levels of import would still be missed.
    const scriptSrc = (src) => [...src.matchAll(/<script[^>]*src="\.?\/?([^"]+\.js)"/g)].map((m) => m[1])
        .concat([...src.matchAll(/import[^"']*["']\.?\/?([^"']+\.js)["']/g)].map((m) => m[1]));
    const all = fs.readdirSync(root).filter((f) => f.endsWith(".html"));
    const mounts = [], ownForm = [];
    for (const f of all) {
        const src = readFile(f);
        if (!src) continue;
        const viaScript = scriptSrc(src).some((js) => /settingsHub/.test(readFile(js)));
        if (/settingsHub\.js/.test(src) || viaScript) mounts.push(f);
        else if (/<input\b/.test(src) && /(settings|options|preferences)/i.test(src)) ownForm.push(f);
    }
    return { mounts, ownFormCount: ownForm.length, ownForm: ownForm.slice(0, 40) };
}

/** A receipt in this tree's shape. */
export function settingsReceipt(c) {
    return c.controls + " controls in " + c.categories + " categories -- but only " + c.values +
           " carry a VALUE. " + c.actions + " are actions and " + c.views + " are views, so " +
           (c.actions + c.views) + " of " + c.controls + " have nothing a JSON document could set." +
           (c.unbound.length ? "  " + c.unbound.length + " value control(s) missing a get/set binding." : "");
}

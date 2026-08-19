// WebGLEngine/tools/ship/threeImportmap-selfcheck.mjs — v3833
//
// The regression Keith hit: es-box3d-3d.html imported OrbitControls, OrbitControls does `from 'three'`, and the
// page had no import map -- so the browser could not resolve the bare "three" specifier and the whole page died at
// module load. Node syntax-checks never catch this because Node does not resolve browser import maps. This gate
// does what the browser does: any page whose module graph will hit a bare "three" -- because it bare-imports three
// itself, or imports one of the vendored /vendor/three/jsm/ loaders (which all do `from 'three'`) -- MUST declare
// <script type="importmap"> with a "three" key, placed before the module script that triggers resolution.
//
// Run: node tools/ship/threeImportmap-selfcheck.mjs   (exit 0 all-pass, 1 on any offender)

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

// engine root is two levels up from tools/ship/
const ROOT = new URL("../../", import.meta.url).pathname;

function htmlFiles(dir, acc = []) {
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "vendor" || name.startsWith(".")) continue;
        const p = join(dir, name), st = statSync(p);
        if (st.isDirectory()) htmlFiles(p, acc);
        else if (name.endsWith(".html")) acc.push(p);
    }
    return acc;
}

// Does the page's module graph reach a bare "three" specifier? True if it bare-imports three, or imports any
// vendored jsm loader (those files themselves do `from 'three'`).
const BARE_THREE = /\bfrom\s+['"]three['"]/;
const JSM_IMPORT = /['"][^'"]*\/vendor\/three\/jsm\/[^'"]+['"]/;
function needsThree(src) { return BARE_THREE.test(src) || JSM_IMPORT.test(src); }

// Does the page declare an import map that maps "three"? Parse the importmap JSON and look for imports.three.
function hasThreeMap(src) {
    const m = src.match(/<script\s+type=["']importmap["']\s*>([\s\S]*?)<\/script>/i);
    if (!m) return false;
    try {
        const map = JSON.parse(m[1]);
        return !!(map && map.imports && typeof map.imports.three === "string" && map.imports.three.length);
    } catch { return false; }
}

// If the map exists, it must come BEFORE the first module script, or resolution has already failed by the time
// the browser reads it.
function mapBeforeModule(src) {
    const map = src.search(/<script\s+type=["']importmap["']/i);
    const mod = src.search(/<script\s+type=["']module["']/i);
    return map >= 0 && (mod < 0 || map < mod);
}

let pass = 0, fail = 0;
const offenders = [];
for (const file of htmlFiles(ROOT)) {
    const src = readFileSync(file, "utf8");
    if (!needsThree(src)) continue;
    const short = file.slice(ROOT.length);
    if (!hasThreeMap(src)) { fail++; offenders.push(short + "  (no importmap mapping \"three\")"); }
    else if (!mapBeforeModule(src)) { fail++; offenders.push(short + "  (importmap is AFTER the module script)"); }
    else pass++;
}

// SELF-TEST: the detector must actually fire on a broken page and clear on a fixed one -- a gate that cannot fail
// is not a gate. These are synthetic strings, not files.
{
    const broken = `<script type="module">import {OrbitControls} from "/vendor/three/jsm/controls/OrbitControls.js";</script>`;
    const fixed = `<script type="importmap">{"imports":{"three":"/vendor/three/three.module.js"}}</script>\n<script type="module">import {OrbitControls} from "/vendor/three/jsm/controls/OrbitControls.js";</script>`;
    const afterMap = `<script type="module">import * as T from "three";</script>\n<script type="importmap">{"imports":{"three":"/x.js"}}</script>`;
    if (needsThree(broken) && !hasThreeMap(broken)) pass++; else { fail++; offenders.push("SELFTEST: broken page not flagged"); }
    if (needsThree(fixed) && hasThreeMap(fixed) && mapBeforeModule(fixed)) pass++; else { fail++; offenders.push("SELFTEST: fixed page wrongly flagged"); }
    if (needsThree(afterMap) && !mapBeforeModule(afterMap)) pass++; else { fail++; offenders.push("SELFTEST: after-module map not flagged"); }
}

if (offenders.length) { console.error("  pages that will die on a bare \"three\" at module load:"); for (const o of offenders) console.error("  FAIL  " + o); }
console.log(`threeImportmap-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

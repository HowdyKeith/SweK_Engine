// WebGLEngine/tools/ship/tscResolve.mjs -- v4123
//
// ONE PLACE THAT KNOWS WHERE tsc LIVES ON A SANDBOX, mirroring playwrightResolve.mjs's own reasoning: three
// gates guessing three paths is how a working install reads as "not found" on the one box whose layout
// differs. TypeScript is used here as a TYPE CHECKER ONLY -- there is no compile step anywhere in this tree,
// see typecheck-selfcheck.mjs's header -- so tsc is resolved as a BINARY (execFileSync), not an importable
// module, which is the one way this file's shape differs from its playwright sibling.
import fs from "node:fs";

export const TSC_PATHS = [
    "/opt/node22/bin/tsc",
    "/usr/local/bin/tsc",
    "/usr/bin/tsc",
];

/** The first tsc binary that exists on disk, tried in order. Existence only -- not run, not version-checked. */
export function resolveTsc() {
    for (const p of TSC_PATHS) { try { if (fs.existsSync(p)) return { bin: p, from: p }; } catch { /* next */ } }
    return { bin: null, from: "" };
}

export function tscSkipReason(bin) {
    if (bin) return "";
    return "no tsc binary found -- tried: " + TSC_PATHS.join(", ") +
           " (npm i -g typescript, or add a path to TSC_PATHS)";
}

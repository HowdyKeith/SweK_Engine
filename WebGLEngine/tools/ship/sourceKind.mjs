// WebGLEngine/tools/ship/sourceKind.mjs -- v4564
//
// *** WHAT COUNTS AS A SOURCE FILE, AND WHAT KIND OF ONE, IN ONE PLACE. ***
//
// This tree had two answers and both were wrong in the same direction. tools/ship/treeRead.mjs's walk
// matched `.mjs` and `.js`, and ".cjs" matches NEITHER -- the dot is part of the pattern, so ".cjs" is not
// ".js" with a c in front. Six modules in ai-bridge/ are CommonJS, 1,471 lines of them, every one `require`d
// by ai-bridge/server.js at startup, and no census in this tree had counted a line of them. v4556 knew and
// wrote around it: tools/ship/versionMarker.js is ".js RATHER THAN .cjs on purpose", because the first draft
// of that module was invisible to the census. A census you have to know the shape of to file into is a
// census of the people who know.
//
// tools/check.mjs -- the tree's own syntax guard -- was worse and in the other direction. Its walk was
// `extname(p) === ".js"`, so of 4,143 source files it checked 1,527: every .js, and NOT the 2,608 .mjs nor
// the 7 .cjs. Its summary line says "1527 files checked" and reads as coverage. TWO THIRDS OF THE TREE,
// including every module written since this project moved to ES modules, had never been syntax-checked.
//
// AND ITS COMMONJS SPLIT WAS BY DIRECTORY: everything under ai-bridge/ was handed to a script parser. That
// was harmless while the walk could not see .mjs files, and 56 of the files in that directory are .mjs using
// import and export -- so the moment the walk was widened, a directory rule would have started parsing real
// ES modules as scripts. THE EXTENSION SAYS WHAT A FILE IS. The directory rule survives only for .js, where
// there is no other signal.
"use strict";
import path from "node:path";

/** The three extensions that are runtime source in this tree. */
export const SOURCE_EXT = Object.freeze([".js", ".mjs", ".cjs"]);

/** Is this path a runtime source file at all? */
export function isSource(p) { return SOURCE_EXT.includes(path.extname(String(p || ""))); }

/**
 * "module" | "commonjs" | null. `bridge` is the fallback for .js, where the extension cannot say: this tree
 * writes CommonJS under ai-bridge/ and ES modules everywhere else, and that is a fact about this repository
 * rather than about the language.
 */
// *** THE DEFAULT MATCHES A LEADING SEGMENT TOO, WHICH THE FIRST VERSION DID NOT. *** It asked for
// "/ai-bridge/" and a RELATIVE path -- "ai-bridge/server.js", which is how every record in this tree spells
// one -- has no slash in front, so it read as a module. tools/check.mjs happens to pass absolute paths, so
// nothing in the tree would have shown it; the gate's own fixture did, on the second case it tried.
export function kindOf(p, { bridge = (q) => /(^|[\\/])ai-bridge[\\/]/.test(String(q)) } = {}) {
    const ext = path.extname(String(p || ""));
    if (ext === ".mjs") return "module";
    if (ext === ".cjs") return "commonjs";
    if (ext === ".js") return bridge(p) ? "commonjs" : "module";
    return null;
}

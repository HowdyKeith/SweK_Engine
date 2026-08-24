// WebGLEngine/tools/ship/withheld.mjs -- v3964
//
// WHICH FILES ARE DELIBERATELY ABSENT FROM A CLONE, READ FROM .gitignore RATHER THAN LISTED.
//
// *** verify.mjs COULD NEVER PASS ON A FRESH CLONE, AND NOBODY HAD NOTICED BECAUSE NOBODY HAD TRIED. ***
// It hard-requires BACKLOG.md and TODO.md at the project root. Both are in .gitignore -- withheld from the
// public mirror ON PURPOSE, as the .gitignore's own comment says -- so `git ls-files` carries neither, and no
// clone of this repository has ever contained them or ever will. On Keith's rig they are present as untracked
// working files and the check passes; on a clone it fails, permanently, for doing exactly what it was told.
//
// That stayed invisible for as long as verify only ever ran where the files happened to exist. It surfaced the
// moment v3964 wired clone -> verify into one chain: THE FIRST THING THE CHAIN VERIFIED WAS A TREE THAT COULD
// NOT PASS. A check whose environment has only ever been one machine is a check with an untested assumption in
// it, and the assumption here was "the working copy and the repository contain the same files".
//
// *** THE RULE ALREADY EXISTED, IN ONE PLACE, AND THE OTHER PLACE DID NOT KNOW. *** rootLayout-selfcheck.mjs
// has derived this from .gitignore since v3945 and says why: "a second list of what is withheld would go stale
// the first time one of them was published." verify.mjs held the second list -- not as a list of withheld files
// but as an unconditional requirement, which is the same defect wearing the opposite sign. So the derivation
// moves HERE and both read it, which is the fix rootLayout's own comment was asking for.
import fs from "node:fs";
import path from "node:path";

/**
 * Every pattern .gitignore withholds, as bare names.
 *
 * DELIBERATELY NOT A GITIGNORE ENGINE. It does not implement globs, directory semantics or precedence, and it
 * must not start pretending to: callers use it to ask "is this exact top-level filename withheld", which is a
 * question plain lines answer exactly. Negations (`!foo`) are DROPPED rather than processed, because a negation
 * re-includes a file and a caller asking this question wants the conservative answer -- treating a re-included
 * file as withheld would excuse a genuinely missing one.
 */
export function withheldFromMirror(root) {
    const out = new Set();
    try {
        for (const raw of fs.readFileSync(path.join(root, ".gitignore"), "utf8").split(/\r?\n/)) {
            const s = raw.trim();
            if (s && !s.startsWith("#") && !s.startsWith("!")) out.add(s.replace(/^\//, ""));
        }
    } catch { /* no .gitignore: nothing is withheld, so every caller's file must really be present */ }
    return out;
}

/**
 * The files a stranger opens first. Named here so verify.mjs and rootLayout-selfcheck.mjs cannot disagree about
 * what the front door IS while agreeing about how to check it.
 */
export const FRONT_DOOR = ["README.md", "BACKLOG.md", "TODO.md"];

/**
 * *** THE FENCE, AND IT MOVES WITH THE RULE IT FENCES. *** Reading the exemption from .gitignore means one line
 * added there stops a file being required -- right for session notes, wrong for the front page. rootLayout has
 * asserted this since v3945; it is exported alongside the derivation so that a SECOND caller cannot pick up the
 * exemption without also picking up its limit. A helper that hands out a loophole and leaves the guard behind
 * is worse than no helper.
 */
export function neverWithheld(withheld) {
    return !withheld.has("README.md");
}

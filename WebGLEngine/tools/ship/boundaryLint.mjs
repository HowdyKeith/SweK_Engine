// tools/ship/boundaryLint.mjs
//
// v3103 -- A GREEN BUILD IS A SELF-REPORT.
//
// Borrowed from anthony-chaudhary/fak's boundarylint, web-verified this session: "boundary tells" are source
// patterns where the code makes a CLAIM ABOUT THE OUTSIDE WORLD -- the OS, the network, the clock, a peer
// process -- WITHOUT THE CHECK THAT WOULD MAKE THE CLAIM TRUE. Taken as an idea, not a package; fak is a Go
// binary and this is four screens of JavaScript over a tree that already has a scanner.
//
// THIS TREE HAS PAID FOR IT FOUR TIMES IN TWENTY ROUNDS, every one the same shape:
//   v3054  statSync said a file was PRESENT -- it was a 404 HTML body written to disk.
//   v3089  a manifest carried a SHA-256 that nothing ever compared the arriving bytes against.
//   v3096  taskkill reported success and the socket was still held; the launcher believed the report.
//   v3096  a heartbeat file meant "listener alive" when the listener was gone.
// In each, a local observation stood in for a fact about somewhere else.
//
// ONE RULE FAILS, THE REST REPORT. A lint that fails on everything it can see gets switched off in a week, so
// only the tell that is SILENTLY WRONG is a hard failure; the ones that are merely LOUD, or too broad to judge
// from source, are counted and printed with the reason they are not rules.

import { codeOnly, noComments } from "./sourceScan.mjs";

/**
 * Each rule states WHY, in the register ceremony this tree uses everywhere: a tell with no stated reason is a
 * grep somebody will delete the first time it is inconvenient.
 */
export const BOUNDARY_RULES = {
    UNCHECKED_ERROR_BODY: {
        severity: "fail",
        why: "a response body read with .text()/.blob()/.arrayBuffer() WITHOUT consulting .ok RETURNS THE ERROR " +
             "PAGE AS DATA. The fetch resolved, nothing threw, and an HTML 404 is now mesh data or a texture. " +
             "This is v3054's bug with a different filename",
    },
    UNCHECKED_JSON_BODY: {
        severity: "report",
        why: "the same omission with .json(), which THROWS on an HTML error body rather than returning it. " +
             "Loud is a legitimate design -- a caller that treats any failure as 'unavailable' is entitled to " +
             "let the parse throw -- so this is counted, not failed",
    },
    UNEXPANDED_USER_PATH: {
        severity: "fail",
        why: "v3108 -- a '~' handed to a filesystem call. THE SHELL EXPANDS IT; NODE DOES NOT. fs and path treat " +
             "'~' as an ordinary directory name, so mkdir succeeds, the write succeeds, nothing throws, and the " +
             "file is in a folder literally called '~' beside the cwd instead of in the user's home. Silently " +
             "wrong is the whole test for a fail rule: the claim 'I wrote this to your home directory' is a claim " +
             "about the OS with no check behind it. One of the two rules fak names, and a law this tree already " +
             "keeps in its shell scripts, where $HOME is written out",
    },
    UNVERIFIED_EXTERNAL_URL: {
        severity: "fail",
        why: "v3108 -- a page hard-depending on a remote <script src> with NO LOCAL FALLBACK. 'the CDN will be " +
             "there' is a claim about the network, and the check that would make it true is a vendored copy to " +
             "fall back to. THIS TREE HAS ALREADY PAID FOR IT: battleship3d.html carries a v1989 comment reading " +
             "'instead of hard-depending on cdnjs (the game was unloadable on a LAN-only box)', and fixed it by " +
             "importing /vendor/three first with the CDN as the fallback. The failure is silent in exactly the way " +
             "that matters -- the page is perfect on the machine that wrote it and dead on the LAN-only box",
    },
    KILL_DISCARDS_HANDLE: {
        severity: "fail",
        why: "v3107 -- a kill that NULLS THE HANDLE in the same breath and returns ok is UNFALSIFIABLE BY " +
             "CONSTRUCTION. kill() sends a signal; the child may ignore it, take seconds, or become a zombie. " +
             "Dropping the reference destroys the only way to ever find out, and the claim 'stopped' then rests " +
             "on nothing. Keep the handle long enough to attach an exit listener, and say SIGNALLED until it " +
             "actually exits -- 99 kill sites narrowed to THREE by asking that one structural question",
    },
    KILL_NOT_VERIFIED: {
        severity: "report",
        why: "a kill whose effect is never re-checked. v3096 fixed the one that mattered (the port), but from " +
             "source alone a kill that needs verifying is indistinguishable from one whose caller genuinely " +
             "does not care, so this reports rather than rules",
    },
};

// A data: URL is NOT a network boundary -- it cannot 404, and fetch() on one is a local decode. The first run
// of this lint counted two of those as tells; excluding them is the difference between a rule and a nuisance.
const DATA_URL_ARG = /^\s*[`"']?\s*data:/i;
const isLocalDecode = (arg) => DATA_URL_ARG.test(arg) || /dataUrl|dataURI|objectURL/i.test(arg);

/** Scan one file's source. Returns findings, each with its rule id and the argument that decided it. */
export function scanBoundaries(src) {
    const code = codeOnly(src);            // comments AND strings blanked: this file DISCUSSES the idiom it hunts
    // v3107 -- AND A SECOND VIEW, BECAUSE THE TWO QUESTIONS NEED DIFFERENT ONES. Finding a kill is a CODE
    // question, so codeOnly is right. Finding whether a handle has an exit listener means matching the STRING
    // "exit" -- which codeOnly has blanked. The first draft of the rule checked the listener against codeOnly
    // and reported a correctly-listening file as a violation. noComments keeps strings and drops comments,
    // which is precisely the other half of what this needs.
    const withStrings = noComments(src);
    const out = [];
    const RX = /await\s+\(?\s*await\s+fetch\(([\s\S]{0,200}?)\)\s*\)?\s*\.\s*(json|text|arrayBuffer|blob)\s*\(/g;
    for (const m of code.matchAll(RX)) {
        const [, arg, kind] = m;
        if (isLocalDecode(arg)) continue;
        out.push({ rule: kind === "json" ? "UNCHECKED_JSON_BODY" : "UNCHECKED_ERROR_BODY", arg: arg.trim().slice(0, 60), kind });
    }
    for (const m of code.matchAll(/taskkill|Stop-Process|\.kill\s*\(/g)) out.push({ rule: "KILL_NOT_VERIFIED", arg: m[0], kind: "kill" });

    // v3107 -- THE DECIDABLE SUB-RULE INSIDE THE BROAD ONE. KILL_NOT_VERIFIED stays a report because from
    // source alone a kill needing verification looks exactly like one whose caller does not care. But a kill
    // that DISCARDS THE HANDLE and claims ok is different in kind: it is not weakly verified, it is
    // UNVERIFIABLE, and that IS decidable by reading. An exit or close listener anywhere on the same handle
    // means the file does learn the truth eventually -- autoInstall does exactly that, and is correctly not a
    // finding.
    const lines = code.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const m = /([A-Za-z_$][\w$.]*)\.kill\s*\(/.exec(lines[i]);
        if (!m) continue;
        const handle = m[1].split(".")[0], esc = handle.replace(/[$]/g, "\\$");
        const after = lines.slice(i + 1, i + 5).join("\n");
        if (!new RegExp("\\b" + esc + "\\s*=\\s*null").test(after)) continue;
        if (!/return\s*\{[^}]*ok:\s*true/.test(after)) continue;
        if (new RegExp("\\b" + esc + "[\\w$.]*\\.on(ce)?\\s*\\(\\s*[\"'](exit|close)").test(withStrings)) continue;
        out.push({ rule: "KILL_DISCARDS_HANDLE", arg: handle, kind: "kill" });
    }

    // v3108 -- TWO RULES THAT NEED THE STRING-KEEPING VIEW, FOR THE REASON v3107 ALREADY LEARNED HERE.
    // Both of these live INSIDE string literals -- a '~' path and a script src are quoted by definition -- so
    // codeOnly(), which blanks strings, cannot see either. That is the same mistake the kill-listener check made
    // one version ago, caught then and not repeated here.
    for (const m of withStrings.matchAll(/(readFileSync|writeFileSync|mkdirSync|existsSync|statSync|readdirSync|createReadStream|createWriteStream|path\.join|path\.resolve)\s*\(([^)]{0,120})\)/g)) {
        const args = m[2];
        // a leading ~ in a quoted segment: "~/x", '~/x', `~/x`, or a bare "~" element
        if (!/["'`]\s*~(?:[/\\]|\s*["'`])/.test(args)) continue;
        out.push({ rule: "UNEXPANDED_USER_PATH", arg: (m[1] + "(" + args.trim()).slice(0, 60), kind: "path" });
    }

    // Script tags are an HTML question, so this only looks at sources that ARE HTML documents. A .js file
    // DISCUSSING the idiom -- this lint, its gate -- has no doctype and is correctly not a finding, which is the
    // narrow way to dodge the self-reference trap rather than trying to out-regex it.
    if (/<!doctype html|<html[\s>]/i.test(src)) {
        const html = src.replace(/<!--[\s\S]*?-->/g, "");
        const hasLocalFallback = /["'`]\/?vendor\//.test(html) || /import\([^)]*vendor/.test(html);
        for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["'](https?:)?\/\/[^"']+["'][^>]*>/gi)) {
            const tag = m[0];
            if (/\bintegrity\s*=/.test(tag)) continue;       // an SRI hash IS the check; not a finding
            if (hasLocalFallback) continue;                    // the page can survive the CDN being gone
            out.push({ rule: "UNVERIFIED_EXTERNAL_URL", arg: (tag.match(/src\s*=\s*["']([^"']+)/) || [])[1] || tag.slice(0, 60), kind: "script" });
        }
    }
    return out;
}

/** Split findings by the severity their rule declares. */
export function partition(findings) {
    const fail = [], report = [];
    for (const f of findings) ((BOUNDARY_RULES[f.rule] || {}).severity === "fail" ? fail : report).push(f);
    return { fail, report };
}

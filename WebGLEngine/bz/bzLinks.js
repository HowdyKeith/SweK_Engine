// WebGLEngine/bz/bzLinks.js — which teleporter goes where.
//
// Round nine. `link` has been parsed since round one and meant nothing: the arch was solid and the doorway
// sent you nowhere. This is the half of teleporting that is bookkeeping, and it is stranger than the
// geometry.
//
// From src/game/LinkManager.cxx on the 2.4 branch:
//
//   * A teleporter has TWO FACES, numbered `2i` and `2i+1` for the i-th teleporter. Face 0 is the +x side
//     of its own frame, face 1 the -x side.
//   * A link's `from` and `to` are GLOBS, matched against `"<name>:f"` and `"<name>:b"`. So `from *:f`
//     links every front face in the map, and `to gate:b` links one back face. A leading `:` is stripped,
//     for forwards compatibility with links inside group definitions.
//   * Only the LAST character of the glob is case-folded, so `Gate:F` matches and `GATE:F` does not.
//   * An unnamed teleporter is called `/t<index>`. Not `<index>`.
//   * AND A LINK NAME THAT STARTS WITH A DIGIT IS NOT A NAME AT ALL. It is a FACE NUMBER, and `addLink`
//     converts it before `doLinking` ever globs anything: `makeLinkName(n)` gives `"/t" + (n/2)` and then
//     `":f"` if `n` is even, `":b"` if it is odd. So `from 0` is teleporter 0's front face, and `to 2` is
//     teleporter 1's front face.
//   * The last rule in `doLinking` is "fill in the blanks (passthru linkage)": any face with no destination
//     links to THE OPPOSITE FACE OF THE SAME TELEPORTER. An unlinked teleporter is a doorway. That is why
//     `link` could be ignored for eight rounds without anybody noticing.
//
// v2197 -- A CORRECTION, AND IT COST A ROUND OF CONFIDENT PROSE. v2188 asserted that hix.bzw's sixteen
// numeric links match nothing and all fall through to doorways, "and the map plays". That was wrong. It was
// wrong because I read `doLinking` and `findTelesByName` and never read `addLink`, which is where the
// numbers are turned into names. A real bzfs, built from BZFlag's own source, packed hix's links into its
// world database as `/t0:f -> /t1:f`, and there was no arguing with it.

"use strict";

// A tiny glob: `*` any run, `?` one character. BZFlag's bzglob also does `[abc]` character sets; no shipped
// map uses one in a link, and inventing a subset that half-works would be worse than saying so.
function globMatch(pattern, str) {
    const p = String(pattern), s = String(str);
    const memo = new Map();
    const go = (i, j) => {
        const key = i * 4096 + j;
        if (memo.has(key)) return memo.get(key);
        let r;
        if (i === p.length) r = j === s.length;
        else if (p[i] === "*") r = go(i + 1, j) || (j < s.length && go(i, j + 1));
        else if (j < s.length && (p[i] === "?" || p[i] === s[j])) r = go(i + 1, j + 1);
        else r = false;
        memo.set(key, r);
        return r;
    };
    return go(0, 0);
}

// The name a teleporter answers to. BZFlag prefixes a group's depth name; we bake groups into the world
// frame (round three), so there is no depth to prefix and the name is the bare one. A map that relies on
// `group/teleporter` link names would not resolve here, and the drift would be silent -- so `doLinking`
// reports every link it could not resolve, and the world counts them.
function teleName(tele, index) {
    return (tele && tele.name) ? String(tele.name) : "/t" + index;
}

// LinkManager::makeLinkName. Face `n` belongs to teleporter `n/2`, and its front if `n` is even.
function makeLinkName(number) {
    return "/t" + Math.floor(number / 2) + ((number % 2) === 0 ? ":f" : ":b");
}

// LinkManager::addLink. A name that STARTS WITH A DIGIT is a face number, not a name -- and this happens
// before `doLinking` sees anything, so the glob machinery never learns that numbers exist.
function resolveLinkName(name) {
    const s = String(name || "");
    if (s.length && s[0] >= "0" && s[0] <= "9") return makeLinkName(parseInt(s, 10) || 0);
    return s;
}

// findTelesByName: every face whose `"<name>:f"` or `"<name>:b"` the glob matches. Returns face numbers.
function findTelesByName(name, teles) {
    const out = [];
    let glob = String(name || "");
    if (!glob.length) return out;
    if (glob[0] === ":") glob = glob.slice(1);
    // Only the trailing face specification is case-independent. Exactly one character.
    const last = glob.length - 1;
    if (glob[last] === "F" || glob[last] === "B") glob = glob.slice(0, last) + glob[last].toLowerCase();

    for (let i = 0; i < teles.length; i++) {
        const n = teleName(teles[i], i);
        if (globMatch(glob, n + ":f")) out.push(i * 2 + 0);
        if (globMatch(glob, n + ":b")) out.push(i * 2 + 1);
    }
    return out;
}

// doLinking: resolve every `link` into a destination list per face, then fill in the blanks. A link whose
// source or destination matches nothing is BROKEN -- reported, never guessed at -- and its faces fall
// through to the passthru rule like any other.
function doLinking(links, teles) {
    const dsts = [];
    for (let i = 0; i < teles.length * 2; i++) dsts.push([]);
    const broken = [];

    for (const l of links || []) {
        // A leading digit means a face number, and `addLink` has already turned it into a name by the time
        // `doLinking` runs. We do the same here, in the same place, for the same reason.
        const src = findTelesByName(resolveLinkName(l.from), teles);
        const dst = findTelesByName(resolveLinkName(l.to), teles);
        if (!src.length || !dst.length) {
            broken.push({ from: l.from, to: l.to, line: l.line, why: !src.length ? "no source face" : "no destination face" });
            continue;
        }
        for (const s of src) for (const d of dst) if (!dsts[s].includes(d)) dsts[s].push(d);
    }

    // "fill in the blanks (passthru linkage)". A face with nowhere to go goes to the opposite face of its
    // own teleporter -- which is to say, you walk through the doorway.
    const passthru = [];
    for (let i = 0; i < dsts.length; i++) {
        if (dsts[i].length) continue;
        const t = (i - (i % 2));      // this teleporter's face 0
        dsts[i].push(t + (1 - (i % 2)));
        passthru.push(i);
    }
    return { dsts, broken, passthru };
}

// One face's destination. Several destinations means the teleporter picks, and BZFlag picks at random --
// so the rng is injected, and a co-op room seeded from (room, system) sends both pilots the same way.
function getTeleportTarget(linking, face, rnd) {
    const list = linking.dsts[face];
    if (!list || !list.length) return face;      // cannot happen after doLinking, and is not worth a throw
    if (list.length === 1) return list[0];
    return list[Math.min(list.length - 1, Math.floor((rnd || Math.random)() * list.length))];
}

export { globMatch, teleName, findTelesByName, doLinking, getTeleportTarget, makeLinkName, resolveLinkName };
if (typeof module !== "undefined" && module.exports)
    module.exports = { globMatch, teleName, findTelesByName, doLinking, getTeleportTarget, makeLinkName, resolveLinkName };

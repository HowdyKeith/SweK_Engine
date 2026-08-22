// WebGLEngine/ev/controlbits.js — EV Nova control-bit engine. Control bits are
// ~10,000 boolean flags that gate mission availability and branch storylines.
// Missions carry an availability EXPRESSION (e.g. "b100 & !b200") that must be
// true to appear, and SET expressions (OnAccept/OnSuccess/OnFailure/OnAbort, e.g.
// "b100 !b200") that set/clear bits when events fire. The chär (pilot start)
// resource lists the bits set at game start.
//
// Expression grammar (EV "NCB" mini-language), the common subset:
//   bN            test bit N is SET
//   !bN           test bit N is CLEAR
//   E1 & E2       logical AND (also whitespace = AND in set-strings)
//   E1 | E2       logical OR
//   ( E )         grouping
// Set-string grammar (OnAccept etc.): space/`&`-separated tokens, each `bN`
// (set bit N) or `!bN` (clear bit N).

class ControlBits {
    constructor() { this.bits = new Set(); }

    set(n) { this.bits.add(n | 0); }
    clear(n) { this.bits.delete(n | 0); }
    test(n) { return this.bits.has(n | 0); }
    reset() { this.bits.clear(); }
    snapshot() { return [...this.bits]; }
    restore(arr) { this.bits = new Set((arr || []).map((x) => x | 0)); }

    // Initialize from a chär-style set string ("b53 b100 b0 ...") — set those bits.
    initFromString(str) { this.applySet(str); }

    // Apply a set-expression: each token bN sets, !bN clears. Separators: space, &, comma.
    applySet(str) {
        if (!str) return;
        for (const tok of String(str).split(/[\s,&]+/)) {
            const m = /^(!?)b(\d+)$/i.exec(tok.trim());
            if (!m) continue;
            const n = parseInt(m[2], 10);
            if (m[1] === "!") this.clear(n); else this.set(n);
        }
    }

    // Evaluate an availability expression to a boolean. Empty/absent = always true.
    evaluate(expr) {
        if (expr == null) return true;
        const s = String(expr).trim();
        if (!s) return true;
        try {
            const toks = tokenize(s);
            const p = new Parser(toks, this);
            const v = p.parseExpr();
            return p.atEnd() ? !!v : !!v;   // tolerate trailing junk
        } catch (e) {
            // On a parse failure, don't hard-gate content — treat as available.
            return true;
        }
    }
}

// --- tiny recursive-descent evaluator for bN / !bN / & / | / ( ) ---
function tokenize(s) {
    const out = [];
    let i = 0;
    while (i < s.length) {
        const c = s[i];
        if (/\s/.test(c)) { i++; continue; }
        if (c === "(" || c === ")" || c === "&" || c === "|" || c === "!") { out.push(c); i++; continue; }
        const m = /^b(\d+)/i.exec(s.slice(i));
        if (m) { out.push({ bit: parseInt(m[1], 10) }); i += m[0].length; continue; }
        // Unknown char (e.g. a rating/record term we don't model) — skip it as a
        // neutral truthy atom so we don't over-gate.
        const m2 = /^[A-Za-z][A-Za-z0-9]*/.exec(s.slice(i));
        if (m2) { out.push({ unknown: true }); i += m2[0].length; continue; }
        i++;
    }
    return out;
}

class Parser {
    constructor(toks, cb) { this.t = toks; this.i = 0; this.cb = cb; }
    peek() { return this.t[this.i]; }
    next() { return this.t[this.i++]; }
    atEnd() { return this.i >= this.t.length; }
    // OR has lowest precedence, then AND, then unary !, then atoms.
    parseExpr() { return this.parseOr(); }
    parseOr() {
        let v = this.parseAnd();
        while (this.peek() === "|") { this.next(); const r = this.parseAnd(); v = v || r; }
        return v;
    }
    parseAnd() {
        let v = this.parseUnary();
        while (this.peek() === "&") { this.next(); const r = this.parseUnary(); v = v && r; }
        return v;
    }
    parseUnary() {
        if (this.peek() === "!") { this.next(); return !this.parseUnary(); }
        return this.parseAtom();
    }
    parseAtom() {
        const tok = this.peek();
        if (tok === "(") { this.next(); const v = this.parseOr(); if (this.peek() === ")") this.next(); return v; }
        if (tok && typeof tok === "object") {
            this.next();
            if (tok.unknown) return true;          // unmodeled term -> neutral
            return this.cb.test(tok.bit);
        }
        // stray token; consume + treat as true so we don't over-gate
        this.next();
        return true;
    }
}

export { ControlBits };

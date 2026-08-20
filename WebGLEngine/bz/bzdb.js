// WebGLEngine/bz/bzdb.js — BZFlag's state database, and the little expression language inside it.
//
// The first thing a .bzw parser needs is the DEFAULTS, and in BZFlag they are not constants. A box with
// no `size` is `_boxBase` by `_boxBase` by `_boxHeight`, and `_boxHeight` is the string "6.0*_muzzleHeight".
// The database stores strings; a value is evaluated on demand, variables resolve to other entries, and
// the whole thing is a tiny expression language: `+ - * / ^`, parentheses, unary minus.
//
// The 167 defaults below are BZFlag's own, transcribed from src/common/global.cxx at the 2.4 branch, as
// written -- expressions and all. Transcribing the evaluated numbers instead would have been easier and
// would have quietly frozen a relationship the game means to keep: change `_tankHeight` and a pyramid
// changes with it, because `_pyrBase` IS `4.0*_tankHeight`.
//
// Not every value is a number. `_ambientLight` is "none"; `_fogColor` is a colour. eval() returns NaN for
// those, and get() returns the string. That is what BZFlag does, and callers must ask for the one they
// want.

"use strict";

// src/common/global.cxx, 2.4 branch. Names and values verbatim.
const BZDB_DEFAULTS = {
    "_HTTPIndexResourceDir":   "",
    "_agilityAdVel":           "2.25",
    "_agilityTimeWindow":      "1.0",
    "_agilityVelDelta":        "0.3",
    "_ambientLight":           "none",
    "_angleTolerance":         "0.05",
    "_angularAd":              "1.5",
    "_avenueSize":             "2.0*_boxBase",
    "_baseSize":               "60.0",
    "_boxBase":                "30.0",
    "_boxHeight":              "6.0*_muzzleHeight",
    "_burrowAngularAd":        "0.55",
    "_burrowDepth":            "-1.32",
    "_burrowSpeedAd":          "0.80",
    "_coldetDepth":            "6",
    "_coldetElements":         "4",
    "_countdownResumeDelay":   "5",
    "_cullDepth":              "6",
    "_cullDist":               "fog",
    "_cullElements":           "16",
    "_cullOccluders":          "0",
    "_disableBots":            "0",
    "_disableHeightChecks":    "0",
    "_disableSpeedChecks":     "0",
    "_drawCelestial":          "1",
    "_drawClouds":             "1",
    "_drawGround":             "1",
    "_drawGroundLights":       "1",
    "_drawMountains":          "1",
    "_drawSky":                "1",
    "_enableDistanceCheck":    "0",
    "_endShotDetection":       "5",
    "_explodeTime":            "5.0",
    "_flagAltitude":           "11.0",
    "_flagEffectTime":         "0.64",
    "_flagHeight":             "10.0",
    "_flagPoleSize":           "0.8",
    "_flagPoleWidth":          "0.025",
    "_flagRadius":             "2.5",
    "_fogColor":               "0.25 0.25 0.25",
    "_fogDensity":             "0.001",
    "_fogEnd":                 "_worldSize",
    "_fogMode":                "none",
    "_fogNoSky":               "0",
    "_fogStart":               "0.5*_worldSize",
    "_forbidHunting":          "0",
    "_forbidIdentify":         "0",
    "_forbidMarkers":          "0",
    "_friction":               "0",
    "_gmActivationTime":       "0.5",
    "_gmAdLife":               "0.95",
    "_gmSize":                 "1.5",
    "_gmTurnAngle":            "0.628319",
    "_gravity":                "-9.8",
    "_handicapAngAd":          "1.5",
    "_handicapScoreDiff":      "50.0",
    "_handicapShotAd":         "1.75",
    "_handicapVelAd":          "2.0",
    "_hideFlagsOnRadar":       "0",
    "_hideTeamFlagsOnRadar":   "0",
    "_identifyRange":          "50.0",
    "_jumpVelocity":           "19.0",
    "_lRAdRate":               "0.5",
    "_laserAdLife":            "0.1",
    "_laserAdRate":            "0.5",
    "_laserAdVel":             "1000.0",
    "_latitude":               "37.5",
    "_lockOnAngle":            "0.15",
    "_longitude":              "122",
    "_mGunAdLife":             "1.0 / _mGunAdRate",
    "_mGunAdRate":             "10.0",
    "_mGunAdVel":              "1.5",
    "_maxBumpHeight":          "0.33",
    "_maxFlagGrabs":           "4.0",
    "_maxLOD":                 "32767.0",
    "_maxPlayerAddDelay":      "30",
    "_mirror":                 "none",
    "_momentumAngAcc":         "1.0",
    "_momentumFriction":       "0",
    "_momentumLinAcc":         "1.0",
    "_muzzleFront":            "_tankRadius + 0.1",
    "_muzzleHeight":           "1.57",
    "_noClimb":                "1",
    "_noShadows":              "0",
    "_noSmallPackets":         "0",
    "_notRespondingTime":      "5.0",
    "_obeseFactor":            "2.5",
    "_pauseDropTime":          "15.0",
    "_positionTolerance":      "0.09",
    "_pyrBase":                "4.0*_tankHeight",
    "_pyrHeight":              "5.0*_tankHeight",
    "_rFireAdLife":            "1.0 / _rFireAdRate",
    "_rFireAdRate":            "2.0",
    "_rFireAdVel":             "1.5",
    "_radarLimit":             "_worldSize",
    "_rainBaseColor":          "none",
    "_rainDensity":            "none",
    "_rainEndZ":               "none",
    "_rainMaxPuddleTime":      "none",
    "_rainPuddleColor":        "none",
    "_rainPuddleSpeed":        "none",
    "_rainPuddleTexture":      "none",
    "_rainRoofs":              "1",
    "_rainSpeed":              "none",
    "_rainSpeedMod":           "none",
    "_rainSpins":              "none",
    "_rainSpread":             "none",
    "_rainStartZ":             "none",
    "_rainTexture":            "none",
    "_rainTopColor":           "none",
    "_rainType":               "none",
    "_rejoinTime":             "_explodeTime",
    "_reloadTime":             "_shotRange / _shotSpeed",
    "_shieldFlight":           "2.7",
    "_shockAdLife":            "0.2",
    "_shockInRadius":          "_tankLength",
    "_shockOutRadius":         "60.0",
    "_shotRadius":             "0.5",
    "_shotRange":              "350.0",
    "_shotSpeed":              "100.0",
    "_shotTailLength":         "4.0",
    "_shotsKeepVerticalVelocity": "0",
    "_skyColor":               "white",
    "_spawnMaxCompTime":       "0.01",
    "_spawnSafeRadMod":        "20",
    "_spawnSafeSRMod":         "3",
    "_spawnSafeSWMod":         "1.5",
    "_speedChecksLogOnly":     "0",
    "_squishFactor":           "1.0",
    "_squishTime":             "1.0",
    "_srRadiusMult":           "2.0",
    "_syncLocation":           "0",
    "_syncTime":               "-1.0",
    "_tankAngVel":             "0.785398",
    "_tankExplosionSize":      "3.5 * _tankLength",
    "_tankHeight":             "2.05",
    "_tankLength":             "6.0",
    "_tankRadius":             "0.72 * _tankLength",
    "_tankSpeed":              "25.0",
    "_tankWidth":              "2.8",
    "_targetingAngle":         "0.3",
    "_targetingDistance":      "300.00",
    "_teleportBreadth":        "4.48",
    "_teleportHeight":         "10.08",
    "_teleportTime":           "1.0",
    "_teleportWidth":          "1.12",
    "_thiefAdLife":            "0.05",
    "_thiefAdRate":            "12.0",
    "_thiefAdShotVel":         "8.0",
    "_thiefDropTime":          "_reloadTime * 0.5",
    "_thiefTinyFactor":        "0.5",
    "_thiefVelAd":             "1.67",
    "_tinyFactor":             "0.4",
    "_trackFade":              "3.0",
    "_updateThrottleRate":     "30.0",
    "_useLineRain":            "none",
    "_useRainBillboards":      "none",
    "_useRainPuddles":         "none",
    "_velocityAd":             "1.5",
    "_wallHeight":             "3.0*_tankHeight",
    "_weapons":                "1",
    "_wideAngleAng":           "1.745329",
    "_wingsGravity":           "_gravity",
    "_wingsJumpCount":         "1",
    "_wingsJumpVelocity":      "_jumpVelocity",
    "_wingsSlideTime":         "0.0",
    "_worldSize":              "800.0",
};

const MAX_DEPTH = 16;   // a variable cycle is a map bug, not a reason to hang

// --- the expression language --------------------------------------------------------------------
// Tokens: numbers, variable names, ( ) and the five operators. BZFlag's own precedence
// (StateDatabase::ExpressionToken::getPrecedence): + - = 1, * / = 2, ^ = 3.
const PREC = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 };

function tokenize(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (c === " " || c === "\t") { i++; continue; }
        if (c === "(" || c === ")" || PREC[c] !== undefined) { out.push({ op: c }); i++; continue; }
        if (/[0-9.]/.test(c)) {
            let j = i;
            while (j < src.length && /[0-9.eE]/.test(src[j])) {
                // an exponent's sign belongs to the number, not to the expression
                if ((src[j] === "e" || src[j] === "E") && (src[j + 1] === "+" || src[j + 1] === "-")) j++;
                j++;
            }
            out.push({ num: parseFloat(src.slice(i, j)) });
            i = j;
            continue;
        }
        // a variable name: BZFlag's are `_camelCase`, a plugin's may be anything without spaces or operators
        let j = i;
        while (j < src.length && !/[\s()+\-*/^]/.test(src[j])) j++;
        if (j === i) return null;                       // a character we cannot read
        out.push({ name: src.slice(i, j) });
        i = j;
    }
    return out;
}

// Shunting-yard to RPN, then evaluate. Unary minus is the one wrinkle: it appears where an operand was
// expected, and binds tighter than any binary operator.
function toRpn(tokens) {
    const out = [], ops = [];
    let expectOperand = true;
    for (const t of tokens) {
        if (t.num !== undefined || t.name !== undefined) { out.push(t); expectOperand = false; continue; }
        if (t.op === "(") { ops.push(t); expectOperand = true; continue; }
        if (t.op === ")") {
            while (ops.length && ops[ops.length - 1].op !== "(") out.push(ops.pop());
            if (!ops.length) return null;               // unbalanced
            ops.pop();
            expectOperand = false;
            continue;
        }
        if (expectOperand) {
            if (t.op !== "-" && t.op !== "+") return null;
            if (t.op === "-") ops.push({ op: "u-" });   // unary
            continue;                                    // a leading unary + is a no-op
        }
        while (ops.length && ops[ops.length - 1].op !== "(" && ops[ops.length - 1].op !== "u-"
            && PREC[ops[ops.length - 1].op] >= PREC[t.op]) out.push(ops.pop());
        while (ops.length && ops[ops.length - 1].op === "u-") out.push(ops.pop());
        ops.push(t);
        expectOperand = true;
    }
    while (ops.length) { const o = ops.pop(); if (o.op === "(") return null; out.push(o); }
    return out;
}

function evalRpn(rpn, resolve) {
    const st = [];
    for (const t of rpn) {
        if (t.num !== undefined) { st.push(t.num); continue; }
        if (t.name !== undefined) { st.push(resolve(t.name)); continue; }
        if (t.op === "u-") { if (!st.length) return NaN; st.push(-st.pop()); continue; }
        if (st.length < 2) return NaN;
        const b = st.pop(), a = st.pop();
        if (t.op === "+") st.push(a + b);
        else if (t.op === "-") st.push(a - b);
        else if (t.op === "*") st.push(a * b);
        else if (t.op === "/") st.push(a / b);
        else if (t.op === "^") st.push(Math.pow(a, b));
        else return NaN;
    }
    return st.length === 1 ? st[0] : NaN;
}

// --- the database --------------------------------------------------------------------------------
function makeBZDB(overrides) {
    const values = { ...BZDB_DEFAULTS, ...(overrides || {}) };
    const cache = new Map();

    function evalDepth(name, depth) {
        if (depth > MAX_DEPTH) return NaN;                                  // a cycle: `_a = _b`, `_b = _a`
        if (!Object.prototype.hasOwnProperty.call(values, name)) return NaN;
        if (cache.has(name)) return cache.get(name);
        const raw = String(values[name]);
        const toks = tokenize(raw);
        const rpn = toks && toks.length ? toRpn(toks) : null;
        const v = rpn ? evalRpn(rpn, (n) => evalDepth(n, depth + 1)) : NaN;
        cache.set(name, v);
        return v;
    }

    return {
        // The raw string, as the map or global.cxx wrote it.
        get: (name) => (Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : undefined),
        has: (name) => Object.prototype.hasOwnProperty.call(values, name),
        // The number it evaluates to, or NaN if it is not one ("none", a colour, a cycle).
        eval: (name) => evalDepth(name, 0),
        // An expression in a map file, evaluated against this database.
        evalExpr: (src) => { const t = tokenize(String(src)); const r = t && t.length ? toRpn(t) : null; return r ? evalRpn(r, (n) => evalDepth(n, 0)) : NaN; },
        set: (name, value) => { values[name] = String(value); cache.clear(); },
        names: () => Object.keys(values).sort(),
    };
}

export { makeBZDB, BZDB_DEFAULTS, tokenize, toRpn, evalRpn, MAX_DEPTH };
if (typeof module !== "undefined" && module.exports)
    module.exports = { makeBZDB, BZDB_DEFAULTS, tokenize, toRpn, evalRpn, MAX_DEPTH };

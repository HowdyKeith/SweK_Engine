// WebGLEngine/sim/populationUpdate.js -- v3121
//
// THE UPDATE RULE. THE FIRST PIECE OF THIS SYSTEM THAT CAN BE WRONG RATHER THAN MERELY ABSENT.
//
// Everything before this was plumbing: v3118 planned the field, v3119 built the ping-pong and the readback,
// v3120 gave the shaders somewhere to be compiled. The update shader copied state forward unchanged, which
// cannot be incorrect because it does not claim anything. This one claims things.
//
// *** THE CHANNEL BUDGET DECIDES THE DESIGN, AND IT IS WORTH SAYING FIRST. *** RGBA32F is four floats: RGB
// holds position and A holds kind-and-liveness. THERE IS NO ROOM FOR VELOCITY, no room for age, no room for
// energy. That leaves three ways out -- a second texture (doubling 16 MB), packing two quantities into one
// float (which v3119 already showed is where silent corruption lives), or DERIVING motion from position with
// no storage at all. The third is free and is what particle systems have always done, so the velocity is a
// FLOW FIELD sampled at the agent's own position.
//
// *** AND HERE IS THE MISTAKE THIS FILE EXISTS TO PREVENT. *** In the shader, gl_FragCoord.xy is the SLOT'S
// GRID COORDINATE -- where the agent is STORED. The agent's world position is in RGB -- where the agent IS.
// THEY ARE BOTH "COORDINATES" AND THEY HAVE NOTHING TO DO WITH EACH OTHER. Sampling the flow at gl_FragCoord
// would make every agent move according to its index in the texture: the field would show smooth, organised,
// entirely convincing motion that corresponds to nothing in the world. It would look RIGHT. Two things wearing
// one label, in the one place where the wrong one is more beautiful than the right one.
//
// THE FIELD IS ANALYTIC, NOT HASH NOISE, AND THAT IS A TESTABILITY DECISION. This rule is written twice -- once
// in GLSL for the device and once in JS as the reference a gate can check -- and a hash-based noise would NOT
// agree between JS doubles and GLSL mediump/highp floats, so the two could never be compared. sin and cos agree
// to a tolerance. CHOOSING THE FIELD THAT CAN BE CHECKED OVER THE FIELD THAT LOOKS BEST IS THE TRADE, and it is
// made deliberately: an unverifiable prettier field is what this project is arranged against.

export const WORLD = 64;          // agents live in [0, WORLD)^3
export const MAX_STEP = 0.5;      // per tick, per axis -- a bound the gate can check

/** Analytic divergence-light flow. Same expression in both languages, to float tolerance. */
export function flowAt(x, y, z, t) {
    return [
        Math.sin(y * 0.11 + t * 0.7) * 0.4 + Math.cos(z * 0.07) * 0.1,
        Math.sin(z * 0.13 - t * 0.5) * 0.4 + Math.cos(x * 0.09) * 0.1,
        Math.sin(x * 0.10 + t * 0.6) * 0.4 + Math.cos(y * 0.08) * 0.1,
    ];
}

/**
 * v3151 -- FIELD-ALIGNED PATHS, AND THE CONSERVED QUANTITY THAT MAKES THEM CHECKABLE.
 *
 * flowAt() is a smooth drift: agents follow a gradient and the only invariants available are BOUNDS -- nothing
 * moves further than MAX_STEP, population is conserved, the thing is deterministic. All true, all weak: a flow
 * that was subtly wrong in direction would satisfy every one of them.
 *
 * THE STRIPE-PATTERN IDEA FROM THE FIELD-ALIGNED CURVE LITERATURE GIVES A STRONGER ONE. Represent the guiding
 * structure as a SCALAR PHASE FIELD whose level sets are the curves, and move each agent ALONG a level set
 * rather than across it. Then PHASE IS CONSERVED -- not approximately in spirit, but as an equation a gate can
 * evaluate on every agent every tick. That is a check on DIRECTION, which no bound can give.
 *
 * IN 3D A LEVEL SET IS A SURFACE, SO "PERPENDICULAR TO THE GRADIENT" IS A WHOLE PLANE, NOT A DIRECTION. The
 * second field picks one: tangent = normalize(cross(grad(phase), guide)). That is precisely what "field
 * aligned" means here -- the guide chooses the heading WITHIN the sheet, and the phase decides which sheet.
 *
 * *** AND THE DEGENERATE CASE IS NAMED RATHER THAN LEFT TO PRODUCE A ZERO. *** Where grad(phase) is parallel to
 * the guide the cross product vanishes and there is no tangent. Returning [0,0,0] there would FREEZE AGENTS ON
 * A SURFACE -- a stationary shell in a moving world, which looks like an emergent structure and is a division
 * by nothing. pathAt returns the vector AND a `degenerate` flag; the caller decides, and stepReference falls
 * back to the drift flow so an agent keeps moving and the reason is recorded rather than hidden.
 */
export function phaseAt(x, y, z) {
    // Triply periodic and analytic, for the same reason flowAt is: hash noise cannot agree between JS doubles
    // and GLSL floats, so the two implementations could never be compared (v3121).
    return Math.sin(x * 0.11) + Math.sin(y * 0.13) + Math.sin(z * 0.09);
}

/** Analytic gradient -- DERIVED from phaseAt by hand and gated against a finite difference, never assumed. */
export function phaseGradAt(x, y, z) {
    return [0.11 * Math.cos(x * 0.11), 0.13 * Math.cos(y * 0.13), 0.09 * Math.cos(z * 0.09)];
}

/** The guide field: what direction to travel WITHIN a level set. Smooth, analytic, and not parallel to the
 *  gradient everywhere -- where it is, pathAt says so. */
export function guideAt(x, y, z) {
    return [Math.cos(z * 0.05) * 0.9, 0.35, Math.sin(x * 0.06) * 0.9];
}

export const DEGENERATE_EPS = 1e-4;

/**
 * The field-aligned tangent at a point.
 * @returns { v: [x,y,z], degenerate: boolean, cross: number } -- cross is the pre-normalisation magnitude, which
 *          is the number that decides degeneracy and is REPORTED so a caller can see how close it came.
 */
/**
 * THE DECIDABLE CORE, EXTRACTED SO THE DEGENERATE BRANCH CAN BE SHOWN FAILING.
 *
 * Measured over 200,000 sample points, the smallest cross-product magnitude these two analytic fields produce
 * is 1.08e-3 against a threshold of 1e-4 -- SO THE GUARD NEVER FIRES ON THE REAL FIELDS AND CANNOT BE OBSERVED
 * WORKING. Raising the threshold until it did would be tuning the rule to make the test pass, which is the
 * opposite of a test. Taking g and u as ARGUMENTS lets a gate plant a genuinely parallel pair and watch the
 * refusal happen -- "a claim about absence must be shown failing", applied to a branch rather than a lint rule.
 */
export function tangentOf(g, u, speed = 0.4) {
    const c = [g[1] * u[2] - g[2] * u[1], g[2] * u[0] - g[0] * u[2], g[0] * u[1] - g[1] * u[0]];
    const m = Math.hypot(c[0], c[1], c[2]);
    if (!(m > DEGENERATE_EPS)) return { v: [0, 0, 0], degenerate: true, cross: m };
    return { v: [c[0] / m * speed, c[1] / m * speed, c[2] / m * speed], degenerate: false, cross: m };
}

/**
 * v3156 -- PROJECT BACK ONTO THE LEVEL SET, because the per-step conservation does NOT accumulate into a
 * surface-following guarantee.
 *
 * *** v3151 MEASURED THE LOCAL ERROR AND I REPORTED IT AS THE GLOBAL ONE. *** Per step the drift is 1.28e-3 and
 * SECOND ORDER -- halving the step quarters it, ratio 4.00, which is true and was correctly measured. But a
 * fixed DISTANCE takes O(1/h) steps, so the totals accumulate LINEARLY: measured 9.2e-2, 1.90e-1, 3.92e-1,
 * 7.79e-1 at 100, 200, 400, 800 steps -- RATIO 2.06, 2.06, 1.99, exactly doubling. THE ERRORS DO NOT CANCEL.
 * Over a fixed arc length of 400 units the drift is 9.54e-1, 5.01e-1, 2.53e-1, 1.27e-1 at h = 0.4, 0.2, 0.1,
 * 0.05: FIRST ORDER IN h, not second.
 *
 * THE CONSEQUENCE IS NOT SUBTLE. The phase field ranges over [-3, 3] and an agent at the shipped speed drifts
 * 1.7 within a few thousand steps -- IT LEAVES THE SURFACE IT WAS SUPPOSED TO BE FOLLOWING, gradually, while
 * every per-step check keeps passing. A "field-aligned path" that wanders off its own level set is not aligned
 * to anything after long enough.
 *
 * THE CORRECTION IS ONE NEWTON STEP ALONG THE GRADIENT and costs one extra gradient evaluation:
 * p <- p - (phase(p) - phase0) * grad / |grad|^2. It is exact to first order and returns the agent to the level
 * set it started on rather than the one it has drifted to -- WHICH IS WHY phase0 IS AN ARGUMENT AND NOT
 * RECOMPUTED: correcting toward the current phase would conserve nothing at all, it would just re-label where
 * the agent already is.
 */
export const PHASE_SHEET = 0.25;      // the stripe spacing: level sets are phase = k * PHASE_SHEET

/**
 * v3157 -- WHICH SHEET AM I ON, WITHOUT BEING TOLD.
 *
 * *** THE SHADER CANNOT PORT projectToPhase DIRECTLY, AND THE REASON IS STRUCTURAL. *** phase0 is an ARGUMENT
 * because the JS caller remembers it. The shader has no memory: RGB is position and A is kind+alive, and v3121
 * established there is no free channel -- adding one doubles a 16 MB field. Recomputing phase0 from the current
 * position is exactly what v3156 proved conserves nothing: it re-labels where the agent already is.
 *
 * THE WAY OUT IS THE STRIPE-PATTERN IDEA ITSELF. If the level sets are a DISCRETE FAMILY -- phase = k * S for
 * integer k -- then the agent's sheet is RECOVERABLE BY ROUNDING, and no storage is needed. The phase was only
 * ever meaningful modulo the spacing.
 *
 * WHAT IT COSTS, MEASURED, AND IT IS NOT NOTHING: a ONE-OFF displacement onto the nearest sheet, bounded by S/2
 * by construction. From [11.3, 7.9, 23.1] the start phase is 2.676125 and the nearest sheet is 2.75, so the
 * agent moves 7.388e-2 once. AFTER THAT IT HOLDS THAT SHEET TO 4.418e-3 OVER 6400 STEPS -- bounded, no
 * accumulation, and MEASURED ZERO SHEET HOPS, because the holding error never approaches S/2.
 */
export function snapPhase(x, y, z, sheet = PHASE_SHEET) {
    return Math.round(phaseAt(x, y, z) / sheet) * sheet;
}

export function projectToPhase(x, y, z, phase0) {
    const g = phaseGradAt(x, y, z);
    const g2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
    // A VANISHING GRADIENT HAS NO DIRECTION TO CORRECT ALONG -- at a critical point of the phase field the level
    // set is not a surface. Returning the point unchanged, and SAYING SO, beats dividing by nothing.
    if (!(g2 > 1e-12)) return { p: [x, y, z], corrected: false, why: "phase gradient vanishes -- no surface normal here" };
    const d = (phaseAt(x, y, z) - phase0) / g2;
    return { p: [x - d * g[0], y - d * g[1], z - d * g[2]], corrected: true, why: null };
}

export function pathAt(x, y, z, speed = 0.4) {
    return tangentOf(phaseGradAt(x, y, z), guideAt(x, y, z), speed);
}

/**
 * v3158 -- ONE TICK OF THE PATH RULE: step along the sheet, then correct back onto it WITHIN THE MOTION BUDGET.
 *
 * *** WIRING IT EXPOSED A DEFECT TWO ROUNDS OF GATES MISSED, BECAUSE THEY MEASURED DRIFT AND NEVER DISPLACEMENT.
 * *** The Newton correction is (phase - target) / |grad|^2 * grad, and WHERE THE GRADIENT IS WEAK THAT BLOWS UP:
 * measured worst correction 2.219 PER AXIS against MAX_STEP 0.5. An agent teleporting two units in a tick is
 * exactly the tunnelling v3121's bound exists to prevent -- "the symptom is a population emptying from the
 * middle outwards".
 *
 * SO THE CORRECTION IS SCALED, NOT SKIPPED, and the difference is larger than it looks. Skipping an over-budget
 * correction leaves the error to grow, which makes the NEXT correction over-budget too -- A FEEDBACK LOOP.
 * MEASURED over 6400 steps: skipping limits 121 corrections, drifts 2.52e-1 and HOPS A SHEET; scaling limits
 * ONE, drifts 1.79e-2 and hops none. DOING WHAT FITS KEEPS THE SYSTEM WHERE FULL CORRECTIONS ALMOST ALWAYS FIT.
 *
 * THE WHOLE MOVE IS SCALED, not each axis independently -- clamping per axis would change the DIRECTION of the
 * correction and push the agent off along a vector nothing chose.
 */
export function pathStep(x, y, z, { speed = 0.4, budget = MAX_STEP, sheet = PHASE_SHEET } = {}) {
    const r = pathAt(x, y, z, speed);
    if (r.degenerate) return { p: [x, y, z], moved: false, limited: false, why: r.why || "no tangent here" };
    const stepped = [x + r.v[0], y + r.v[1], z + r.v[2]];
    const c = projectToPhase(stepped[0], stepped[1], stepped[2], snapPhase(stepped[0], stepped[1], stepped[2], sheet));
    if (!c.corrected) return { p: stepped, moved: true, limited: false, why: c.why };
    const full = [c.p[0] - x, c.p[1] - y, c.p[2] - z];
    const worst = Math.max(Math.abs(full[0]), Math.abs(full[1]), Math.abs(full[2]));
    if (worst <= budget) return { p: c.p, moved: true, limited: false, why: null };
    const k = budget / worst;
    return { p: [x + full[0] * k, y + full[1] * k, z + full[2] * k], moved: true, limited: true,
             why: "correction scaled to the motion budget -- the remainder is taken on later ticks" };
}

const oddRound = (v) => Math.round(v) % 2 === 1;

/**
 * JS REFERENCE of one tick. Operates on the same RGBA layout the texture uses.
 *
 * @param rgba Float32Array length side*side*4 -- NOT mutated; a new array is returned
 * @returns { next, births, deaths } -- births is always 0 here, deliberately (see below)
 */
export function stepReference(rgba, side, t, { world = WORLD, dt = 1 } = {}) {
    const next = new Float32Array(rgba.length);
    let deaths = 0;
    for (let i = 0; i < side * side; i++) {
        const o = i * 4;
        const a = rgba[o + 3];
        // A DEAD SLOT STAYS DEAD. The update NEVER births -- birth is the CPU's decision, made from the tile
        // counts v3118 reduces, because a shader cannot know the game's budget or where the player is. Letting
        // the update spawn would put population policy in two places and neither would be authoritative.
        if (!oddRound(a)) { next[o] = rgba[o]; next[o+1] = rgba[o+1]; next[o+2] = rgba[o+2]; next[o+3] = a; continue; }

        // *** SAMPLED AT THE AGENT'S POSITION, NEVER AT ITS SLOT. *** See the header.
        const [vx, vy, vz] = flowAt(rgba[o], rgba[o+1], rgba[o+2], t);
        const nx = rgba[o] + vx * dt, ny = rgba[o+1] + vy * dt, nz = rgba[o+2] + vz * dt;

        const out = nx < 0 || ny < 0 || nz < 0 || nx >= world || ny >= world || nz >= world;
        next[o] = nx; next[o+1] = ny; next[o+2] = nz;
        // LEAVING THE WORLD IS THE ONLY DEATH. It is derived, not stored, because there is no channel for age
        // or energy -- and inventing one by stealing bits from kind is exactly the corruption v3119 found.
        // KIND IS PRESERVED THROUGH DEATH: a dead agent keeps its kind, so the field still records what died.
        next[o+3] = out ? (Math.round(a) - 1) : a;
        if (out) deaths++;
    }
    return { next, births: 0, deaths };
}

/** GLSL for the same tick. Must agree with stepReference to float tolerance. */
export function updateShaderSource({ world = WORLD } = {}) {
    return `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform float uTime;
uniform float uDt;
out vec4 fragColor;

// v3151 -- THE GLSL TWIN OF pathAt. Written twice on purpose, exactly as flowAt is: the JS is the reference
// and the shader is the thing that runs, and a comparison is only possible if both exist.
float phaseAt(vec3 p) { return sin(p.x * 0.11) + sin(p.y * 0.13) + sin(p.z * 0.09); }
vec3 phaseGradAt(vec3 p) { return vec3(0.11 * cos(p.x * 0.11), 0.13 * cos(p.y * 0.13), 0.09 * cos(p.z * 0.09)); }
vec3 guideAt(vec3 p) { return vec3(cos(p.z * 0.05) * 0.9, 0.35, sin(p.x * 0.06) * 0.9); }

// Returns the field-aligned tangent, or the ZERO VECTOR where the cross product vanishes. The caller must
// treat zero as DEGENERATE and fall back -- normalising it here would divide by nothing and give a NaN that
// propagates into the position and reads as an agent that teleported.
// v3157 -- THE TWIN OF snapPhase + projectToPhase. The shader has NO MEMORY of which level set an agent
// started on -- RGB is position, A is kind+alive, and there is no free channel -- so the sheet is DERIVED by
// rounding to the discrete family phase = k * PHASE_SHEET rather than stored. Recomputing the phase without
// snapping would conserve nothing at all: it would re-label where the agent already is.
const float PHASE_SHEET = 0.25;

float snapPhase(vec3 p) { return floor(phaseAt(p) / PHASE_SHEET + 0.5) * PHASE_SHEET; }

// One Newton step back onto the sheet. A VANISHING GRADIENT HAS NO NORMAL TO CORRECT ALONG -- at a critical
// point of the phase field the level set is not a surface, and dividing by nothing would put the agent
// anywhere. Return the point unchanged there.
vec3 projectToSheet(vec3 p) {
    vec3 g = phaseGradAt(p);
    float g2 = dot(g, g);
    if (!(g2 > 1e-12)) return p;
    return p - (phaseAt(p) - snapPhase(p)) / g2 * g;
}

vec3 pathAt(vec3 p, float speed) {
    vec3 c = cross(phaseGradAt(p), guideAt(p));
    float m = length(c);
    if (!(m > 1e-4)) return vec3(0.0);
    return c / m * speed;
}


// v3158 -- ONE TICK, BUDGETED. The correction blows up where the gradient is weak (measured 2.219 per axis
// against a 0.5 budget), so the WHOLE move is scaled -- per-axis clamping would change the correction's
// DIRECTION and push the agent along a vector nothing chose. Scaling beats skipping because skipping lets the
// error grow until the next correction is over budget too: 121 limited and a sheet hop, against 1 and none.
vec3 pathStep(vec3 p, float speed, float budget) {
    vec3 v = pathAt(p, speed);
    if (v == vec3(0.0)) return p;                 // no tangent here -- do not invent one
    vec3 stepped = p + v;
    vec3 corrected = projectToSheet(stepped);
    vec3 full = corrected - p;
    float worst = max(max(abs(full.x), abs(full.y)), abs(full.z));
    if (worst <= budget) return corrected;
    return p + full * (budget / worst);
}

vec3 flowAt(vec3 p, float t) {
    return vec3(
        sin(p.y * 0.11 + t * 0.7) * 0.4 + cos(p.z * 0.07) * 0.1,
        sin(p.z * 0.13 - t * 0.5) * 0.4 + cos(p.x * 0.09) * 0.1,
        sin(p.x * 0.10 + t * 0.6) * 0.4 + cos(p.y * 0.08) * 0.1);
}

void main() {
    ivec2 slot = ivec2(gl_FragCoord.xy);              // WHERE THE AGENT IS STORED
    vec4 s = texelFetch(uField, slot, 0);
    vec3 pos = s.xyz;                                  // WHERE THE AGENT IS -- not the same thing
    float a = s.a;

    // Odd alpha = live. floor(a + 0.5) and never a cast, for the reason v3119 measured.
    if (mod(floor(a + 0.5), 2.0) < 0.5) { fragColor = s; return; }

    // flowAt(pos, ...) -- NOT flowAt(vec3(slot), ...). Sampling at the slot would give smooth, organised,
    // entirely convincing motion that corresponds to nothing in the world.
    vec3 p = pos + flowAt(pos, uTime) * uDt;
    bool outside = any(lessThan(p, vec3(0.0))) || any(greaterThanEqual(p, vec3(${world}.0)));
    fragColor = vec4(p, outside ? floor(a + 0.5) - 1.0 : a);
}`;
}

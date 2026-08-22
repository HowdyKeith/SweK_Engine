// tools/catalog/catalog.mjs
//
// A single reviewable index of every deterministic physics subsystem in the engine. It holds only the human part --
// a one-line blurb and the gate that proves each subsystem -- and merges everything else from the two sources of
// truth that already exist: the live hash from computeFingerprint(), and the module files from the ledger's
// SUBSYSTEM_SOURCES. So the catalog cannot drift: its hashes are the fingerprint's, its modules are the ledger's, and
// catalog-selfcheck.mjs proves every subsystem is listed, every module and gate file is on disk, and every hash
// matches the live fingerprint. A table of contents that is checked against the book.

import { computeFingerprint } from "../fingerprint/fingerprint.mjs";
import { SUBSYSTEM_SOURCES } from "../ledger/subsystemSources.mjs";

// name -> { blurb, gate }. The blurb is one line; the gate is the selfcheck that falsifies the subsystem (or "" if it
// is covered by a broader gate). Everything else is merged from the fingerprint and the ledger.
export const CATALOG = {
    "strict-libm":          { blurb: "Deterministic transcendental core -- sin/cos/exp/erf to the last bit, so nothing downstream can diverge on a libm.", gate: "" },
    "md-forcefield":        { blurb: "Molecular-dynamics force field: bonded, angle and non-bonded forces summed in a fixed order.", gate: "" },
    "obb-collision":        { blurb: "Oriented-bounding-box overlap by the separating-axis test, for voxel-body collision.", gate: "" },
    "ewald-electrostatics": { blurb: "Ewald summation splitting the long-range Coulomb sum into real and reciprocal parts.", gate: "" },
    "prime-transport":      { blurb: "Prime-indexed transport hashing for the agent brain's message routing.", gate: "" },
    "astar-pathfinding":    { blurb: "A* search with a tie-break rule fixed so the path is unique, not merely optimal.", gate: "" },
    "xpbd-cloth":           { blurb: "The core XPBD distance solver -- graph-coloured batches, compliance, the constraint every cloth is built on.", gate: "physics/xpbd/xpbd-selfcheck.mjs" },
    "tf-advect":            { blurb: "Semi-Lagrangian advection step for the transport field.", gate: "" },
    "cloth-collision":      { blurb: "Cloth self-collision: spatial-hash broad phase plus a canonical contact order.", gate: "physics/xpbd/cloth-selfcheck.mjs" },
    "xpbd-damped":          { blurb: "XPBD with velocity damping, for cloth that settles instead of ringing.", gate: "physics/xpbd/xpbdDamped-selfcheck.mjs" },
    "cloth-tear":           { blurb: "Tearing: edges past a strain threshold split, topology changing mid-solve deterministically.", gate: "physics/xpbd/tear-selfcheck.mjs" },
    "cloth-pinned":         { blurb: "Attachment constraints pinning cloth nodes to fixed or moving anchors.", gate: "physics/xpbd/attach-selfcheck.mjs" },
    "thermal-cloth":        { blurb: "The modulation spine: a temperature field driving each constraint's rest length and compliance from a base snapshot.", gate: "physics/xpbd/modulate-selfcheck.mjs" },
    "plastic-cloth":        { blurb: "Plasticity: strain past a yield point permanently rewrites the rest length -- the deformation stays.", gate: "physics/xpbd/plastic-selfcheck.mjs" },
    "muscle-actuator":      { blurb: "Contractile fibres: flagged edges shorten on an activation signal, the modulation spine driven by a signal.", gate: "physics/xpbd/muscle-selfcheck.mjs" },
    "fluid-mesh":           { blurb: "Two-way fluid/mesh contact -- both bodies move, coupled through a sorted cross-contact set.", gate: "physics/xpbd/fluid-selfcheck.mjs" },
    "pbf-fluid":            { blurb: "Position-based fluid density solve: polynomial kernels, sorted neighbours, the CFM-regularised constraint.", gate: "physics/xpbd/pbf-selfcheck.mjs" },
    "fluid-pbf":            { blurb: "The PBF density solver wired into the fluid/mesh substep as its fluid-fluid path.", gate: "physics/xpbd/fluid-selfcheck.mjs" },
    "volume-balloon":       { blurb: "A single global volume constraint conserving a closed mesh's enclosed volume -- the one constraint that cannot be coloured.", gate: "physics/xpbd/volume-selfcheck.mjs" },
    "friction-slope":       { blurb: "Coulomb plane friction: a body sticks below the friction angle and slides above it.", gate: "physics/xpbd/friction-selfcheck.mjs" },
    "friction-pile":        { blurb: "Pairwise granular friction -- grains heap into an angle of repose, chaotic yet bit-reproducible.", gate: "physics/xpbd/frictionalContact-selfcheck.mjs" },
    "fluid-drag":           { blurb: "Coulomb friction on the fluid/mesh cross-contacts, a two-way drag between fluid and body.", gate: "physics/xpbd/fluidFriction-selfcheck.mjs" },
    "cloth-anisotropy":     { blurb: "Direction-dependent stiffness -- warp and weft each carry their own compliance; the quietest modulation field.", gate: "physics/xpbd/anisotropy-selfcheck.mjs" },
    "pbf-polish":           { blurb: "The fluid's two finishing terms: s_corr artificial pressure against clumping and weight-normalised XSPH viscosity.", gate: "physics/xpbd/pbfPolish-selfcheck.mjs" },
    "sampled-field":        { blurb: "Trilinear sampling of an external volumetric field driving the particles -- the coupling that reaches outside the engine.", gate: "physics/xpbd/sampledField-selfcheck.mjs" },
    "wind-cloth":           { blurb: "The sampled field driving a constrained body -- a flag that flaps in a wind yet holds together.", gate: "physics/xpbd/windCloth-selfcheck.mjs" },
    "muscle-belly":         { blurb: "A biological actuator composing volume conservation with contractile fibres -- it bulges as it contracts.", gate: "physics/xpbd/muscleVolume-selfcheck.mjs" },
    "thermal-diffusion":    { blurb: "Cross-architecture Brownian motion -- a strict-libm Gaussian (erfinv on the proven strict erf) driving the Blobarium thermal coupling.", gate: "physics/strictGaussian-selfcheck.mjs" },
    "centrifuge":           { blurb: "Rotating-frame sedimentation -- Stokes drag balances centrifugal force, separating a mixture by the Svedberg coefficient s = 2a^2(rho_p-rho_f)/9eta.", gate: "physics/centrifuge-selfcheck.mjs" },
    "gyroscope":            { blurb: "Angular-momentum precession -- gravity torque perpendicular to L turns the spin axis instead of dropping it; faster spin precesses slower (rate = mgl/|L|).", gate: "physics/gyroscope-selfcheck.mjs" },
    "pendulum-wave":        { blurb: "Tuned harmonic oscillators (exact strict-trig rotation) that fan into a travelling wave and re-synchronise every cycle; the strict core keeps the loop pure.", gate: "physics/pendulumWave-selfcheck.mjs" },
    "orbit":                { blurb: "N-body gravity by symplectic velocity-Verlet -- a Kepler ellipse that closes, with energy bounded and angular momentum conserved; T^2 ~ a^3. Only +,-,*,/,sqrt.", gate: "physics/orbit-selfcheck.mjs" },
    "vibrations":           { blurb: "Coupled mass-spring chain whose normal modes are standing waves at omega_j = 2 sqrt(k/m) sin(j pi/2(N+1)); symplectic, mode shapes from the strict-trig core.", gate: "physics/vibrations-selfcheck.mjs" },
    "fft":                  { blurb: "A bit-identical radix-2 FFT -- twiddles from the strict-trig core, pure-arithmetic butterflies -- that recovers the vibration eigenfrequencies. A spectrum you can publish and have recomputed exactly.", gate: "physics/fft-selfcheck.mjs" },
    "zeta":                 { blurb: "The Riemann zeta by Euler-Maclaurin -- zeta(2)=pi^2/6 (Basel) and pi=sqrt(6 zeta(2)) to machine precision, zeta(3)=Apery, all in +,-,*,/. The pi-zeta bridge, bit-identical.", gate: "physics/zeta-selfcheck.mjs" },
    "zeta-critical":        { blurb: "Zeta on the critical line s=1/2+it via the accelerated eta series on a strict log -- locates the nontrivial zeros (14.1347, 21.0220, 25.0109) to machine zero. Locates, does NOT prove RH.", gate: "physics/zetaCritical-selfcheck.mjs" },
    "figure-eight":         { blurb: "The three-body figure-eight choreography (Chenciner-Montgomery): three equal masses chasing each other around one curve, periodic and stable, on the N-body orbit engine.", gate: "physics/figureEight-selfcheck.mjs" },
    "lockstep":             { blurb: "Deterministic lockstep: two peers step the same inputs to byte-identical state; a per-frame checksum localises any desync to the frame. Enables replay, catch-up, and 700x-realtime headless runs.", gate: "physics/lockstep-selfcheck.mjs" },
    "black-hole":           { blurb: "A Paczynski-Wiita pseudo-Newtonian black hole: reproduces the real Schwarzschild horizon (2GM/c2), photon sphere (3), and innermost stable circular orbit (6) in pure arithmetic, with orbits that precess and plunge to capture inside the ISCO. Nothing imaginary; the hidden structure made computable.", gate: "physics/blackHole-selfcheck.mjs" },
    "solar-system":         { blurb: "The real solar system from standard orbital elements (semi-major axis, eccentricity, mass) on the N-body engine: every planet starts on a true Keplerian orbit (energy -1/2a, period 2*pi*a^1.5). Real data, baked not fetched -- deterministic, no internet.", gate: "physics/solarSystem-selfcheck.mjs" },
    "neutron-star":         { blurb: "A canonical 1.4-solar-mass, 11-km neutron star with real documented specs: rs ~4.1 km, compactness ~0.19, an ISCO just outside the surface and a photon sphere inside it, escape velocity ~0.6c. A compact object with a SURFACE -- a plunging orbit impacts it rather than falling through a horizon.", gate: "physics/neutronStar-selfcheck.mjs" },
    "plasma":               { blurb: "A charged particle trapped in a magnetic bottle: the Lorentz force F=qv x B via the Boris pusher, in a divergence-free mirror field. A high-pitch-angle particle mirrors and bounces (trapped); a low-pitch-angle one escapes the loss cone. A magnetic force does no work, so speed is conserved to the last bit. Pure arithmetic -- add/mul/div and cross products, no trig -- so it is cross-architecture bit-identical.", gate: "physics/plasma-selfcheck.mjs" },
    "impact":               { blurb: "An asteroid hitting a planet, real physics and no fireball: gravitational focusing (the planet catches asteroids from a disc wider than itself, slow ones more), an escape-speed floor on the impact velocity, a selective atmosphere (small bodies burn up, large ones punch through, drag going as 1/radius), the one-half m v-squared energy, and empirical cube-root crater scaling. The vacuum approach is sqrt-only and fingerprinted; the exponential atmosphere and crater power law are gated-only.", gate: "physics/impact-selfcheck.mjs" },
    "render":               { blurb: "A deterministic raytracer (a few spheres, Lambert shading, sqrt-only) and the harness that lets peers split a frame: rendering in slices across machines and stacking them is bit-for-bit identical to a solo render, for any number of slices, with no boundary data exchanged -- determinism does the stitching. Any peer can re-render a slice from another and check it, so a corrupted slice is caught. This is the lockstep story cashing out as distributed rendering.", gate: "tools/render/render-selfcheck.mjs" },
    "agent-arena":          { blurb: "A learned agent that provably beats its baselines. A deterministic grid engagement -- an agent, a goal, threats on fixed patrols -- raced by four policies: random, a greedy dash, a reactive reflex, and an epsilon-greedy bandit that picks among tactics (rush/flank/hold) and updates its values from reward. The learner outscores all three over 240 reproducible episodes, improves across the run, and discovers by itself that flanking wins while rushing gets caught. Pure arithmetic, so it is cross-architecture fingerprinted; the flow tactic that calls the GPU brain solver is gated. Freeze the value update and the learning collapses.", gate: "brain/agent/arena-selfcheck.mjs" },
    "agent-pertick":        { blurb: "The agent following the GPU brain flow field re-solved every tick, with the threats treated as walls at their current positions rather than their whole corridor. The raw field uses a hypotenuse in its normalisation, which is not guaranteed bit-identical across architectures, but the tactic discretises to a cardinal move by comparing the two components -- a comparison invariant to that scaling -- so the agent integer path is cross-architecture stable, and the path is what is fingerprinted, not the floats. Per-tick beats the static field, caught less and scoring higher.", gate: "brain/agent/flow-selfcheck.mjs" },
    "fleet-agent":          { blurb: "Orchestration as a learned scheduler. A task stream is routed across brains with heterogeneous per-kind speeds; the goal is the lowest makespan. Round-robin and greedy-load ignore capability and hand slow work to slow brains; the learned scheduler learns each brain speed per kind from observed times and routes to whoever finishes soonest, cutting makespan about 22 percent below greedy and matching the truly-fastest brain per kind 76 percent of the time. Pure arithmetic, cross-architecture. Freeze the speed update and it collapses to load-balancing.", gate: "brain/agent/fleet-selfcheck.mjs" },
    "trace-truth":          { blurb: "SweK as a 4D ground-truth generator -- the inversion of a method like Trace Anything, which must estimate where points went in 3D because it has no truth. SweK knows: it builds a deterministic moving scene, projects the exact 3D tracks through a pinhole camera to the 2D observations an estimator sees, keeps the hidden depth, and grades a recovery against its own answer. The arithmetic-only scene feeds only add, subtract, multiply, divide and sqrt, all correctly rounded, so the emitted tracks, observations and depth are identical to the bit on every box -- a benchmark that is itself part of the cross-architecture guarantee. Blind the grader and a wrong recovery scores zero, which the gate refuses.", gate: "tools/groundtruth/traceField-selfcheck.mjs" },
    "pulsar":               { blurb: "A pulsar as a clock. A neutron star spins and sweeps a beam; each crossing of the line of sight is a pulse. The star spins down, so the period lengthens over time, and the pulse arrival times solve the standard timing model -- phase phi(t)=f0*t+0.5*fdot*t*t, pulse n at phi=n -- with a quadratic that needs only arithmetic and one square root, both correctly rounded. So the pulse train is bit-identical on every architecture: the most precise kind of clock in nature, ticking the same on every box in the fleet. Drop the spin-down term and the phase no longer lands on a whole turn at each pulse -- the timing residual the gate catches, the way astronomers catch a wrong model.", gate: "physics/pulsar/pulsar-selfcheck.mjs" },
    "predict":              { blurb: "Anticipating a threat's next move, and scoring the anticipation against the future that actually happens -- the sim is the ground truth. A quadratic motion predictor reads velocity and acceleration off three past samples and is exact for a threat under constant acceleration, where a linear predictor blind to the turn is off by the distance the acceleration curves it. And a firing lead solves where to aim so the shot and the threat arrive together: a quadratic in the intercept time, one sqrt, correctly rounded, so it is bit-identical across architectures. Leading the threat hits; aiming where it is now misses by roughly the distance it travels in the shot's flight time; and a threat outrunning the projectile correctly returns no solution rather than a fake aim.", gate: "physics/predict/predict-selfcheck.mjs" },
};

// Merge the human catalog with the live fingerprint hash and the ledger's module list. Returns one row per subsystem
// in fingerprint order: { name, hash, modules, gate, blurb }.
export function buildCatalog() {
    const { subsystems, master } = computeFingerprint();
    const rows = subsystems.map((s) => ({
        name: s.name,
        hash: s.hash,
        modules: SUBSYSTEM_SOURCES[s.name] || [],
        gate: (CATALOG[s.name] || {}).gate || "",
        blurb: (CATALOG[s.name] || {}).blurb || "",
    }));
    return { rows, master };
}

// Render the catalog as a Markdown table (used to regenerate CATALOG.md).
export function catalogMarkdown() {
    const { rows, master } = buildCatalog();
    let md = "# SweK Engine -- physics subsystem catalog\n\n";
    md += "Every deterministic physics subsystem folded into the cross-architecture fingerprint, in fingerprint order. ";
    md += "Generated by tools/catalog/catalog.mjs and verified by catalog-selfcheck.mjs: every row's module and gate files exist, and every hash matches the live fingerprint. " + rows.length + " subsystems.\n\n";
    md += "| # | subsystem | what it is | modules | gate | sha-256 |\n|---|---|---|---|---|---|\n";
    rows.forEach((r, i) => {
        md += `| ${i + 1} | \`${r.name}\` | ${r.blurb} | ${r.modules.map((m) => "`" + m + "`").join("<br>")} | ${r.gate ? "`" + r.gate + "`" : "_(broader gate)_"} | \`${r.hash.slice(0, 16)}…\` |\n`;
    });
    md += `\n**MASTER** \`${master}\`\n`;
    return md;
}

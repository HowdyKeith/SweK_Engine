// tools/roundhouse/devices.mjs
//
// v2804 -- the device registry: every lab the roundhouse can point at, by name. New devices register here and become
// reachable from run-device.mjs and from any caller without touching the loop.
//
// The LBM rig keeps its original loop in roundhouse.mjs untouched; the entry here is a thin GENERIC adapter so the
// same claim schema works across all devices: the onset observable is renamed reBracket -> reCriticalBracket (the
// generic `withinBracket` comparator looks for `<observable>Bracket`), and a failed bracket becomes an `error` so the
// numeric verdict refuses instead of mis-reading a partial result.

import { build as lbmBuild } from "./roundhouse.mjs";
import { blackHoleDevice } from "./blackHoleBind.mjs";
import { xenonDevice } from "./xenonBind.mjs";                // xenon-135: the iodine pit, invisible while the reactor runs
import { fragmentRotationDevice } from "./fragmentRotationBind.mjs";  // fracture fragments: the rotated box is the only independent answer
import { structureFactorDevice } from "./structureFactorBind.mjs";    // systematic absences: an answer key that is an exact zero BY LAW
import { powderDevice } from "./powderBind.mjs";                      // Friedel, and the one cell of the 2x2 that can fire
import { renderBounceDevice } from "./renderBounceBind.mjs";          // the same solid angle, blocking and emitting
import { box3dDevice } from "./box3dBind.mjs";
import { blobThermalDevice } from "./blobThermalBind.mjs";
import { meltDevice } from "./meltBind.mjs";                // v3618 - melting, graded against the exact Stefan solution
import { crystallizeDevice } from "./crystallizeBind.mjs";  // v3621 - crystallisation; the Avrami exponent, with the seed spread measured BEFORE the claim
import { vaporizeDevice } from "./vaporizeBind.mjs";        // v3620 - gasification; the trilemma a type-per-voxel grid cannot escape, and where it vanishes
import { freezeDevice } from "./freezeBind.mjs";            // v3619 - freezing; NOT melting backwards, the same equation about different substances
import { blobKelvinDevice } from "./blobKelvinBind.mjs";
import { opticsDevice } from "./opticsBind.mjs";          // v2814 - the graded optics bench (far-field + Fresnel)
import { kerrDevice } from "./kerrBind.mjs";              // v2814 - exact Kerr geometry (distinct from the PW black hole above)
import { ctDevice } from "./tomographyBind.mjs";          // v2814 - CT reconstruction, parallel and fan beam
import { interferometerDevice } from "./interferometerBind.mjs";  // v2816 - phase-shifting metrology
import { fluidDevice } from "./fluidBind.mjs";            // v2816 - wind tunnel: force, and the conservation identity
import { thermalDevice } from "./thermalBind.mjs";        // v2817 - emergent diffusivity + convection onset
import { pipeDevice } from "./pipe3dBind.mjs";            // v2817 - Hagen-Poiseuille; the 3D solver's FIRST answer key
import { geometryDevice } from "./geometryBind.mjs";      // v2818 - marching tets vs the analytic sphere (geometry, not physics)
import { khDevice } from "./khBind.mjs";                  // v2818 - Kelvin-Helmholtz: Michalke's band and peak
import { bornDevice } from "./bornBind.mjs";              // v2818 - where an approximation stops being trustworthy
import { isingDevice } from "./isingBind.mjs";            // v2819 - a PHASE TRANSITION: Onsager, Yang, and a universal exponent
import { spacefillDevice } from "./spacefillBind.mjs";  // v3188 - SLDgen's "one unbroken stroke by design", deterministic, WITH its own load-bearing negative
import { heidlerDevice } from "./heidlerBind.mjs";  // v3193 - the Heidler return-stroke current, and the 5% that belongs to the FORMULA
import { figureEightDevice } from "./figureEightBind.mjs";  // v3196 - Simo/Chenciner-Montgomery choreography; the key is CLOSURE
import { gyroscopeDevice } from "./gyroscopeBind.mjs";  // v3197 - omega_p = tau/L, and the key is the ORDER of the approximation
import { zetaDevice } from "./zetaBind.mjs";  // v3198 - zeta(2)=pi^2/6, and the CONTROL is zeta(3), which has no closed form
import { mdDevice } from "./mdBind.mjs";  // v3199 - FOUR md terms, four separate keys, one device (Madelung is the sharpest)
import { frictionDevice } from "./frictionBind.mjs";  // v3200 - Coulomb friction, whose key is a BIFURCATION at mu
import { plasticDevice } from "./plasticBind.mjs";
import { vibrationsDevice } from "./vibrationsBind.mjs";  // v3336 - spectral moments: the boundary condition hides in the SECOND one  // v3211 - plasticity: BOTH parameters recovered from behaviour (yield by bisection, creep by regression)
import { keplerDevice } from "./keplerBind.mjs";          // v2820 - orbits, and whether the INTEGRATOR drifts
import { twoBodyDevice } from "./twoBodyBind.mjs";        // v2937 - the first genuinely TWO-body scene: barycentric binary
import { inspiralDevice } from "./inspiralBind.mjs";
import { eccentricDevice } from "./eccentricBind.mjs";    // v2975 - stage 3: eccentric inspiral, a(e) invariant      // v2938 - gravitational-wave inspiral, graded vs Peters (1964): the first RADIATIVE scene
import { kuramotoDevice } from "./kuramotoBind.mjs";   // v3287 - synchronization
import { hmcDevice } from "./hmcBind.mjs";             // v3287 - Hamiltonian Monte Carlo
import { landauZenerDevice } from "./landauZenerBind.mjs";  // v3288 - non-adiabatic transitions
import { inferenceDevice } from "./inferenceBind.mjs";      // v3289 - Bayesian parameter recovery
import { langevinDevice } from "./langevinBind.mjs";        // v3290 - stochastic thermodynamics
import { rmtDevice } from "./rmtBind.mjs";                  // v3291 - random matrix theory
import { percolationDevice } from "./percolationBind.mjs";  // v3292 - bond percolation
import { diffusionDevice } from "./diffusionBind.mjs";      // v3293 - self-diffusion, two routes
import { blackbodyDevice } from "./blackbodyBind.mjs";      // v4017 - Wien peaks, the Gamma(s)zeta(s) identity
import { debyeDevice } from "./debyeBind.mjs";              // v4017 - Debye vs Einstein; the low-T slope is blackbody's integral
import { sackurTetrodeDevice } from "./sackurTetrodeBind.mjs";  // v4017 - the classical limit bec and fermi collapse onto; Gibbs paradox
import { fermiDevice } from "./fermiBind.mjs";              // v4017 - degenerate gas; the one-sign mirror of the Bose integral
import { paramagnetDevice } from "./paramagnetBind.mjs";    // v4017 - Brillouin + Schottky; the plant is exact at spin-half
import { chemicalPotentialDevice } from "./chemicalPotentialBind.mjs";  // v4017 - three gases, one constraint; the ordering IS the statistics
import { becDevice } from "./becBind.mjs";                  // v4017 - condensation, and no BEC in 2D because zeta(1) diverges
import { hydrostaticDevice } from "./hydrostaticBind.mjs";  // v3294 - SPH hydrostatic column
import { wolffDevice } from "./wolffBind.mjs";              // v3295 - Wolff cluster algorithm
import { spatialAgreementDevice } from "./spatialAgreementBind.mjs";  // v3296 - five spatial structures
import { fdtdDevice } from "./fdtdBind.mjs";                // v3318 - Maxwell on a grid: the solver that predicts its own error
import { twoFDevice } from "./twoFBind.mjs";                // v3297 - LBM two-frequency shedding
import { adjointDevice } from "./adjointBind.mjs";          // v3768 - the exact Radon adjoint identity
import { fftDevice } from "./fftBind.mjs";                  // v3769 - absolute DFT amplitudes
import { thermostatDevice } from "./thermostatBind.mjs";    // v3773 - Berendsen relaxation law
import { cflDevice } from "./cflBind.mjs";                  // v3774 - the SPH acoustic CFL boundary
import { entropyDevice } from "./entropyBind.mjs";          // v3781 - Shannon source coding
import { voxelizeDevice } from "./voxelizeBind.mjs";        // v3782 - mesh volume convergence
import { stabilityDevice } from "./stabilityBind.mjs";      // v3783 - SPH energy direction
import { mpmTransferDevice } from "./mpmTransferBind.mjs";  // v3789 - MPM APIC transfer
import { mpmGridDevice } from "./mpmGridBind.mjs";          // v3790 - MPM grid impulse identity
import { mpmStressDevice } from "./mpmStressBind.mjs";      // v3791 - MPM neo-Hookean stress
import { mpmPlasticDevice } from "./mpmPlasticBind.mjs";    // v3792 - MPM return mapping
import { mpmForceDevice } from "./mpmForceBind.mjs";        // v3793 - MPM internal forces
import { mpmStepDevice } from "./mpmStepBind.mjs";          // v3794 - MPM step loop, free fall
import { mpmColumnDevice } from "./mpmColumnBind.mjs";      // v3797 - MPM collapsing column, energy
import { mpmMomentumDevice } from "./mpmMomentumBind.mjs";  // v3798 - MPM frictionless floor momentum
import { druckerDevice } from "./mpmDruckerBind.mjs";       // v3799 - Drucker-Prager yield surface
import { pileDevice } from "./mpmPileBind.mjs";             // v3800 - pile width vs friction angle
import { refineDevice } from "./mpmRefineBind.mjs";         // v3802 - self-convergence under refinement
import { coupleDevice } from "./mpmCoupleBind.mjs";         // v3803 - two-material contact
import { mpm3dDevice } from "./mpm3dBind.mjs";              // v3804 - 3D APIC transfer
import { neighbourBenchDevice } from "./neighbourBenchBind.mjs"; // v3805 - BVH vs hashed grid
import { temperingDevice } from "./temperingBind.mjs";     // v3300 - parallel tempering
import { pbcDevice } from "./pbcBind.mjs";                  // v3301 - periodic boundaries
import { blobBodiesDevice } from "./blobBodiesBind.mjs";    // v3302 - blob advection round trip
import { quantumDevice } from "./quantumBind.mjs";        // v2822 - two OPPOSITE exact spectra from one solver
import { multigrid3dDevice } from "./multigrid3dBind.mjs";   // v3723 - grid-independent convergence + the compatibility refusal
import { multigridGPUDevice } from "./multigridGPUBind.mjs";   // v3724 - the gather transfers are an exact transpose pair
import { flip2dDevice } from "./flip2dBind.mjs";       // v3718 - the FLIP fluid's HYDROSTATIC limit, p = rho g d
import { freeSurfaceDevice } from "./freeSurfaceBind.mjs";   // v3728 - communicating vessels: two unequal columns over one floor find ONE level
import { inductionDevice } from "./inductionBind.mjs";            // v3731 - Maxwell in INTEGRAL form: the loop and surface integrals blobInduction never computes
import { kerrLadderDevice } from "./kerrLadderBind.mjs";      // v3730 - Kerr circular orbits: the two radii the module never computes
import { flip3dDevice } from "./flip3dBind.mjs";             // v3729 - the 3D FLIP fluid: the hydrostatic column, and TRANSPOSITION
import { chaosDevice } from "./chaosBind.mjs";            // v2823 - a UNIVERSAL constant from one line of arithmetic
import { splatDevice } from "./splatBind.mjs";            // v2860 - device 20: splat MATH graded on closed forms (not a viewer)
import { discoveryDevice } from "./discoveryBind.mjs";      // v2867 - device 21: the FINDER is the system under test
import { probeDevice } from "./probeBind.mjs";
import { lensDevice } from "./lensBind.mjs";                // v2894 - device 23: the IMAGE as a measurement, and firing photons for real
import { tidalDevice } from "./tidalBind.mjs";              // v2894 - device 24: an extended body torn apart, graded on geodesic deviation              // v2875 - device 22: a probe on a TIMELIKE geodesic (the matter case)
import { fieldNavDevice } from "./fieldNavBind.mjs";        // v3338 - field navigation policy
import { clocksDevice } from "./clocksBind.mjs";
import { reactionDevice } from "./reactionBind.mjs";
import { beamDevice } from "./beamBind.mjs";
import { whiteDwarfDevice } from "./whiteDwarfBind.mjs";
import { centrifugeDevice } from "./centrifugeBind.mjs";
import { freeRotationDevice } from "./freeRotationBind.mjs";   // v3563 -- torque-free rigid rotation
import { invariantsDevice } from "./invariantsBind.mjs";
import { poissonDevice } from "./poissonBind.mjs";
import { refScanDevice } from "./refScanBind.mjs";
import { sdfMarchDevice } from "./sdfMarchBind.mjs";
// v3433 -- LIFTED FROM KEITH'S PATCH RATHER THAN COPIED WITH IT. Its devices.mjs was built before v3430 and
// WOULD HAVE DELETED THE poisson REGISTRATION -- the fifth patch to erase a round and the second in a row.
import { composeDevice } from "./composeBind.mjs";          // v3433 - cross-device comparison   // v3430 - what "symplectic" MEANS: eleven modules claim it, one checked it   // v3425 - four-momentum: s is the same in every frame   // v3423 - sedimentation: the TRAJECTORY, which its own gate never integrates   // v3422 - electron degeneracy: TWO exponents from one formula, in different regimes
import { pulsarDevice } from "./pulsarBind.mjs";            // v3361 - relativistic clocks
import { galaxyDevice } from "./galaxyBind.mjs";            // v3382 - device 58: the cosmic map graded by linear algebra
import { geostatsDevice } from "./geostatsBind.mjs";        // v3382 - device 59: kriging, and the solver prediction overturned
import { nuclearDevice } from "./nuclearBind.mjs";          // v3383 - nuclear decay and binding
import { kineticsDevice } from "./kineticsBind.mjs";        // v3984 - point reactor kinetics: inhour vs RK4, the scram floor
import { bellDevice } from "./bellBind.mjs";              // v3990 - CHSH Bell inequality: two bounds, both proven by search
import { laneEmdenDevice } from "./laneEmdenBind.mjs";    // v3991 - stellar structure: polytropes, and a geometry plant
import { lotkaVolterraDevice } from "./lotkaVolterraBind.mjs"; // v3994 - predator-prey: harvesting both species helps the prey
import { blobVitalsDevice } from "./blobVitalsBind.mjs";   // v4009 - the aquarium's own gauges, graded against its four real deaths
import { cartPoleDevice } from "./cartPoleBind.mjs";       // v3995 - cart-pole LQR: the first device whose subject is a CONTROLLER
import { astroparticleDevice } from "./astroparticleBind.mjs";  // v3501 - astroparticle: neutrino oscillation (cosmology modes follow)
import { csgDevice } from "./csgBind.mjs";                       // v3519 - csg: exact signed-distance primitives and set algebra
import { bonefieldDevice } from "./bonefieldBind.mjs";          // v3522 - bonefield: capsule distance field (soft-body skeleton)
import { seismicDevice } from "./seismicBind.mjs";          // v3384 - seismology
import { acousticsDevice } from "./acousticsBind.mjs";      // v3385 - acoustics as waves
import { emDevice } from "./emBind.mjs";                    // v3387 - electromagnetism
import { xpbdDevice } from "./xpbdBind.mjs";                // v3458 - xpbd compliance
// v3850 -- THE GESTURE LAYER. face/MediaPipeHandTracker.js shipped its pure metric function at round 310
// marked "headless-testable" and nothing ever tested it; barehands' gesture vocabulary is what named the
// invariances worth grading. STATIC IMPORT, for the v3768 reason spelled out in the REGISTRY below.
import { handsDevice } from "./handsBind.mjs";

async function makeLbmDevice() {
    const { makeLBM } = await import("../../simulation/lbm/lbm2d.js");
    return {
        name: "lbm-cylinder-channel",
        observables: ["sheds", "reCritical", "reMeasured", "strouhal"],
        build(hyp, base) {
            const obs = lbmBuild(makeLBM, hyp, base);
            if (obs && obs.kind === "onset") {
                if (obs.reBracket) obs.reCriticalBracket = obs.reBracket;
                if (obs.ok === false && !obs.error) obs.error = obs.reason || "onset-failed";
            }
            return obs;
        },
    };
}

// blackhole / box3d are cheap to import eagerly; lbm is lazy (heavier module graph).
const REGISTRY = {
    friction: () => frictionDevice,
    plastic: () => plasticDevice,
    vibrations: () => vibrationsDevice,
    md: () => mdDevice,
    zeta: () => zetaDevice,
    gyroscope: () => gyroscopeDevice,
    figureeight: () => figureEightDevice,
    heidler: () => heidlerDevice,
    spacefill: () => spacefillDevice,
    blackhole: async () => blackHoleDevice,
    xenon: async () => xenonDevice,
    fragmentRotation: async () => fragmentRotationDevice,
    structureFactor: async () => structureFactorDevice,
    powder: async () => powderDevice,
    renderBounce: async () => renderBounceDevice,
    xpbd: async () => xpbdDevice,
    em: async () => emDevice,
    acoustics: async () => acousticsDevice,
    seismic: async () => seismicDevice,
    nuclear: async () => nuclearDevice,
    kinetics: async () => kineticsDevice,        // v3984 -- point reactor kinetics; beta located by a change in character, never typed in
    bell: () => bellDevice,                      // v3990 -- CHSH: the plant still violates Bell, only Tsirelson catches it
    laneemden: () => laneEmdenDevice,           // v3991 -- the plant is a dimensionality slip that still makes stars
    lotkavolterra: () => lotkaVolterraDevice,   // v3994 -- the plant is the STANDARD textbook refinement of this model
    blobvitals: () => blobVitalsDevice,          // v4009 -- three of the aquarium's four real deaths, reproduced and diagnosed
    cartpole: () => cartPoleDevice,             // v3995 -- the plant passes every self-consistent check and drops the pole
    astroparticle: () => astroparticleDevice,   // v3501 -- opens the astroparticle field with neutrino oscillation
    csg: () => csgDevice,                        // v3519 -- exact SDF primitives, gradients, edge crossings, set algebra
    bonefield: () => bonefieldDevice,            // v3522 -- capsule distance field: segment clamp, union, determinism
    clocks: async () => clocksDevice,
    reaction: () => reactionDevice,
    beam: () => beamDevice,
    whitedwarf: () => whiteDwarfDevice,
    centrifuge: () => centrifugeDevice,
    freerotation: () => freeRotationDevice,
    invariants: () => invariantsDevice,
    poisson: () => poissonDevice,
    refscan: () => refScanDevice,
    sdfmarch: () => sdfMarchDevice,   // v3496 -- the implicit-field ray marcher: a page since v3488, lab reach only now   // v3487 -- the reference region scan: graded furnace patch, and an INDICATOR mode nothing may conclude from
    compose: async () => composeDevice,
    galaxy: async () => galaxyDevice,
    geostats: async () => geostatsDevice,
    pulsar: () => pulsarDevice,   // v3382 -- galaxy + geostats: the last two fields with a module, a gate and no bind   // v3381 -- timing residuals: fit the wrong model, read the spin-down   // v3380 -- cantilever elasticity: exponent, superposition, reciprocity   // v3379 -- Turing pattern selection; the lab's first reaction-diffusion device
    fieldnav: async () => fieldNavDevice,
    optics: async () => opticsDevice,
    kerr: async () => kerrDevice,
    ct: async () => ctDevice,
    interferometer: async () => interferometerDevice,
    windtunnel: async () => fluidDevice,
    thermal: async () => thermalDevice,
    pipe3d: async () => pipeDevice,
    geometry: async () => geometryDevice,
    kh: async () => khDevice,
    born: async () => bornDevice,
    ising: async () => isingDevice,
    kepler: async () => keplerDevice,
    twobody: async () => twoBodyDevice,
    inspiral: async () => inspiralDevice,
    eccentric: async () => eccentricDevice,
    kuramoto: async () => kuramotoDevice,
    hmc: async () => hmcDevice,
    landauzener: async () => landauZenerDevice,
    inference: async () => inferenceDevice,
    langevin: async () => langevinDevice,
    rmt: async () => rmtDevice,
    percolation: async () => percolationDevice,
    diffusion: async () => diffusionDevice,
    blackbody: async () => blackbodyDevice,
    debye: async () => debyeDevice,
    sackurTetrode: async () => sackurTetrodeDevice,
    fermi: async () => fermiDevice,
    paramagnet: async () => paramagnetDevice,
    chemicalPotential: async () => chemicalPotentialDevice,
    bec: async () => becDevice,
    hydrostatic: async () => hydrostaticDevice,
    wolff: async () => wolffDevice,
    spatial: async () => spatialAgreementDevice,
    twof: async () => twoFDevice,
    // *** v3768 -- TIER 2: physics/tomography/adjoint.mjs had an EXACT key (<Ax,y> = <x,A^T y>) and no device
    // reached it, so gradedCoverage counted it among the ungraded.
    // THIS USES THE STATIC IMPORT ABOVE, NOT A DYNAMIC ONE, AND THAT IS NOT A STYLE CHOICE. The first version
    // wrote `async () => (await import("./adjointBind.mjs")).adjointDevice` and deviceInstrumentMap READ 85
    // DEVICES AGAINST A REGISTRY OF 87 -- THE NEW DEVICE WAS INVISIBLE TO THE CENSUS WHILE EVERY GATE PASSED.
    // That is exactly the `lbm` hole this file already carries as a declared exemption: a device whose physics
    // module is reached through a dynamic import cannot be resolved by a tool that reads imports. ***
    adjoint: async () => adjointDevice,
    // v3769 -- TIER 2: physics/fft.js had a selfcheck and no device. STATIC IMPORT, for the reason spelled out
    // one entry above -- a dynamic one made adjoint invisible to deviceInstrumentMap while every gate passed.
    fft: async () => fftDevice,
    // v3773 -- TIER 2: physics/md/thermostat.js was ungraded, and the key the roadmap named for it (the mean
    // temperature) turned out to be a MIRROR. Static import, for the reason two entries above.
    thermostat: async () => thermostatDevice,
    // v3774 -- TIER 2: physics/sph/cfl.js was ungraded, and its obvious key (cflStep -> cflNumber) is a round
    // trip through one formula. The real key is that the BOUNDARY IS REAL and scales with the SOUND speed.
    cfl: async () => cflDevice,
    // v3781 -- TIER 2: physics/info/entropy.mjs was ungraded and holds A THEOREM AS A KEY -- H <= L < H+1,
    // with the two sides computed by code that shares nothing. Static import, for the v3768 reason.
    entropy: async () => entropyDevice,
    // v3782 -- TIER 2: physics/mesh/voxelize.mjs. THE ROADMAP NAMED ONE CONVERGENCE AND THERE ARE TWO -- the
    // tessellation one is SECOND ORDER and gradeable; the voxel one is bounded but NOT monotone.
    voxelize: async () => voxelizeDevice,
    // v3783 -- TIER 2: physics/sph/stability.mjs. THE KEY IS A DIRECTION -- a closed system with no input
    // cannot GAIN mechanical energy -- and the shipped viscosity fails it by 2.7x, re-derived every run.
    stability: async () => stabilityDevice,
    // v3789 -- THE MATERIAL POINT METHOD'S TRANSFER. Three identities: partition of unity, linear momentum,
    // and angular momentum -- which PIC loses and APIC conserves. Static import, for the v3768 reason.
    mpmtransfer: async () => mpmTransferDevice,
    // v3790 -- MPM's GRID STEP. The key is exact: a uniform body force adds EXACTLY M*g*dt of momentum.
    mpmgrid: async () => mpmGridDevice,
    // v3791 -- MPM's CONSTITUTIVE MODEL. Analytic stresses for known deformations, and a plant whose
    // visibility depends entirely on which deformation you test -- dilation cannot see it at all.
    mpmstress: async () => mpmStressDevice,
    // v3792 -- MPM's RETURN MAPPING. The clamp is a verdict; the multiplicative split is an identity, and
    // only the identity can see a missing F_p update.
    mpmplastic: async () => mpmPlasticDevice,
    // v3793 -- MPM's FORCE SCATTER, the piece joining the stress to the grid. Newton's third law is exact and
    // is BLIND to a uniform mis-scaling; the 1/h scaling key is what catches that.
    mpmforce: async () => mpmForceDevice,
    // v3794 -- THE ASSEMBLY. The centre of mass follows the analytic parabola whatever the material does --
    // a property of the COMPOSITION that no single piece can supply.
    mpmstep: async () => mpmStepDevice,
    // v3797 -- THE COLLAPSING COLUMN. No analytic answer, so the key is a DIRECTION: energy can only fall.
    mpmcolumn: async () => mpmColumnDevice,
    // v3798 -- A FRICTIONLESS FLOOR EXERTS NO HORIZONTAL FORCE, so sum(m*vx) is conserved EXACTLY. The plant
    // is a FIXTURE mistake: a floor on the domain edge truncates the stencil and loses 95%.
    mpmmomentum: async () => mpmMomentumDevice,
    // v3799 -- DRUCKER-PRAGER, the model that gives granular material a FRICTION ANGLE. The surface is graded
    // exactly; the PILE ANGLE is not, because box3d does not build here to adjudicate it.
    mpmdrucker: async () => druckerDevice,
    // v3800 -- THE FIRST MPM KEY THAT TESTS PHYSICAL MEANING: a higher friction angle must give a NARROWER
    // pile. Every identity before this one holds for a material that behaves nothing like sand.
    mpmpile: async () => pileDevice,
    // v3802 -- SELF-CONVERGENCE. No analytic answer exists, so the key is that successive refinements AGREE
    // by a shrinking margin -- and the plant proves the ratio CANNOT tell you the fixture stayed the same.
    mpmrefine: async () => refineDevice,
    // v3803 -- TWO-MATERIAL CONTACT, which needs NO contact code: the shared grid excludes. And momentum
    // CANNOT tell contact from ghosting -- two bodies that never interact conserve it perfectly.
    mpmcouple: async () => coupleDevice,
    // v3804 -- THE 3D TRANSFER. The same three identities as 2D, on a 27-node stencil, with angular momentum
    // as a VECTOR. If they lift, the pieces above them port mechanically.
    mpm3d: async () => mpm3dDevice,
    // v3805 -- KEITH'S BVH QUESTION, MEASURED. The hashed grid does 8-9x less work per query, and the
    // correctness check is the ONLY thing that can tell whether both structures answered the same question.
    nbench: async () => neighbourBenchDevice,
    // v3850 -- THE GESTURE LAYER, opened by the barehands question. The keys are geometric identities rather
    // than physics: a rigid motion preserves the distances `folded` compares, so no rotation or translation may
    // change a gesture verdict -- EXACTLY, not approximately. The honest negative is in the same function:
    // `folded` is a RATIO test and scale-invariant, `pinch.active` is an absolute threshold and is NOT, which
    // gives barehands' two most-used gestures a working volume nothing documents. Static import, for the v3768
    // reason spelled out at the `adjoint` entry above -- a device reached through a dynamic import is INVISIBLE
    // to deviceInstrumentMap while every gate passes.
    hands: async () => handsDevice,
    fdtd: async () => fdtdDevice,
    tempering: async () => temperingDevice,
    pbc: async () => pbcDevice,
    blobbodies: async () => blobBodiesDevice,
    quantum: async () => quantumDevice,
    chaos: async () => chaosDevice,
    flip2d: async () => flip2dDevice,
    freesurface: async () => freeSurfaceDevice,
    flip3d: async () => flip3dDevice,
    kerrladder: async () => kerrLadderDevice,
    induction: async () => inductionDevice,
    multigrid3d: async () => multigrid3dDevice,
    multigridgpu: async () => multigridGPUDevice,
    splat: async () => splatDevice,
    discovery: async () => discoveryDevice,
    probe: async () => probeDevice,
    lens: async () => lensDevice,
    tidal: async () => tidalDevice,
    box3d: async () => box3dDevice,
    blobthermal: async () => blobThermalDevice,
    melt: async () => meltDevice,
    freeze: async () => freezeDevice,
    vaporize: async () => vaporizeDevice,
    crystallize: async () => crystallizeDevice,
    blobkelvin: async () => blobKelvinDevice,
    lbm: makeLbmDevice,
};

export const DEVICE_NAMES = Object.keys(REGISTRY);

export async function getDevice(name) {
    const f = REGISTRY[name];
    if (!f) throw new Error("unknown device '" + name + "' -- known: " + DEVICE_NAMES.join(", "));
    const d = await f();
    // v3130 -- STAMP THE REGISTRY NAME. A device's own .name is its physics identity ("schwarzschild-lens"),
    // and the REGISTRY key is what everything else is filed under -- LAB_ASSUMPTIONS is written as "lens.deflect".
    // Using .name to look those up produced "schwarzschild-lens.deflect", which matches nothing, so EVERY
    // device reported "undeclared" INCLUDING THE ONES THAT HAVE DECLARATIONS: the check would have existed and
    // never fired. Two names for one thing, and the wrong one was the obvious one.
    try { if (d && !d.registryName) d.registryName = name; } catch { /* frozen descriptor: caller falls back */ }
    return d;
}

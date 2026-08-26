// tools/roundhouse/exactZeroRegister.mjs
//
// v2912 -- ONE REGISTER, IMPORTABLE.
//
// This table was a local `const` inside census-selfcheck.mjs, which meant nothing but that selfcheck could ask
// whether a given exact zero was legitimate. v2910 hit the identical shape with the MODES table and the cost was
// three censuses silently skipping lens.map. Extracted before the same thing happens twice.
//
// EXACT-BY-CONSTRUCTION REGISTER. Every entry is a zero that is legitimate, WITH the reason stated -- the entire
// ceremony the guard exists to force. An entry cannot be added without writing the sentence.

export const EXACT_OK = {
    // *** v3916 -- NINE OF THE TEN v3211 BACKLOG ENTRIES, EXAMINED AT LAST. *** That backlog was created by the
    // first real run of census-selfcheck and eight of its ten said only "NOT EXAMINED". They have been debt for
    // seven hundred versions because census could not finish to keep asking.
    //
    // SPACEFILL IS SEVEN OF THE NINE, AND EXAMINING THEM FOUND A MISTAKE OF MINE. coverageErrFrac and
    // breakErrAbs are zero in ALL THREE modes because every path this device builds covers its grid exactly and
    // hits its analytic break key exactly -- a Hilbert curve has 0 breaks and a raster has n-1, and both keys
    // are DERIVED rather than observed. That is why breakErrAbs is zero even in `raster` where breaks reads 63:
    // 63 IS the key at order 6. Which means the `raster` mode I declared a plant at v3902 is not one -- see
    // spacefillBind's plantRefused, written this round.
    "spacefill.stroke.coverageErrFrac": "the Hilbert path visits every one of the n*n cells exactly once, so distinct == cells to the bit; the bijectionMismatches observable beside it is the independent statement of the same fact and would move first if the curve stopped covering",
    "spacefill.stroke.breakErrAbs": "a Hilbert curve is continuous by construction, so breaks == 0 and the analytic key is 0; the raster mode carries key n-1 = 63 and hits it exactly, which is what shows the key is DERIVED per mode rather than a constant zero",
    "spacefill.raster.coverageErrFrac": "a raster covers every cell exactly once too -- coverage and continuity are separate observables here precisely because a raster has perfect coverage and no continuity",
    "spacefill.raster.breakErrAbs": "the raster's key is n-1 breaks, one per row end, DERIVED not observed; at order 6 that is 63 and the path has exactly 63. THE DEVICE IS CORRECT IN THIS MODE, which is why this stayed zero while `breaks` moved 0 -> 63",
    "spacefill.order.coverageErrFrac": "the order mode re-measures the Hilbert path at the base order, so coverage is exact for the same reason as stroke",
    "spacefill.order.breakErrAbs": "as stroke -- continuity of the Hilbert curve at the base order",
    "spacefill.order.orderRatio": "the SUM of Hilbert breaks across four orders spanning a sixteenfold size range. Zero across every order, not an average: one break at one size would be a broken curve, and its sibling rasterTracksN sums |rasterBreaks - (n-1)| over the same four orders as the paired positive statement",

    // HEIDLER -- the v3211 note guessed this and never checked; the guess was right.
    "heidler.exact.peakErrFrac": "the exact mode normalises the waveform by its own true peak, so the key is exactly 1 and the fraction exactly 0 -- dividing a function by its own maximum cannot give anything else, as the bind says in place. The controls are in the neighbouring modes: `peak` finds the peak by scan and reads 6.6688e-2, and the `noroot` plant reads 4.9575",

    // MD -- the inverse square, read as a ratio so no constant is being graded.
    "md.coulomb.coulombErrFrac": "two unit charges at separations 1 and 2 give a force ratio of exactly 4, bit-exact because both separations are exactly representable and the law is 1/d^2; measured 4 with |r-4| = 0. THE SAME EXPRESSION RETURNS 9 AT SEPARATIONS 1 AND 3, so it tracks the exponent rather than returning a constant -- an absolute magnitude would have graded the choice of constants instead of the inverse square",
    // *** v3915 -- THE REMAINING TWENTY, EACH MEASURED, EACH WITH THE CONTROL THAT PROVES IT IS NOT VACUOUS. ***
    // v3914 did the two clusters and named these twenty rather than registering them, because a sentence
    // written without the measurement is what empties this register of meaning. Every entry below carries a
    // number I took, and for every one there is a case where THE SAME EXPRESSION IS NOT ZERO -- a sibling
    // observable, another mode, a plant, or a perturbed input. That pairing is the whole standard here.

    // FREEROTATION -- the control is the `stability` mode, where the SAME observable reads 1.3875e-5.
    "freerotation.conserve.sigmaRelErr": "the conserve fixture integrates a torque-free body whose sigma is constant by construction, so the spread over the run is bit-zero; the stability mode reads 1.3875e-5 from the same expression, which is the control that it can move",
    "freerotation.flip.sigmaRelErr": "as conserve -- the flip fixture changes WHICH axis the body tumbles about, not whether sigma is conserved, so the residual stays exactly zero while stability shows the same key going non-zero",
    "freerotation.attitude.sigmaRelErr": "as conserve; attitude grades orientation rather than the invariant, and leaves sigma exactly conserved",

    // CLOCKS -- an exact GR identity, verified at four independent (M, r) pairs.
    "clocks.rates.crossoverResidual": "|orbitingDilation(M,r) - staticDilation(M, r/1.5)| is the identity sqrt(1-3M/r) = sqrt(1-2M/(2r/3)), algebraically exact; measured bit-zero at (M,r) = (1,12), (0.3,7.7), (2,50) and (0.05,4), while the sibling clockEffectErrFrac reads 5.65e-15 so the arithmetic is genuinely floating point",
    "clocks.rates.crossoverErrOrder": "the ORDER of the naive composition's error, which its own comment states reads 2.000000000000 under the planted error and 0 without it -- this is the honest arm of a declared plant, not an unexamined zero",

    // GEOSTATS -- the control is the plant mode.
    "geostats.nugget.valueErr": "kriging with a nugget reproduces the observation at a data location exactly -- the estimator is an exact interpolator there; the noconstraint plant mode reads 3.25e-1 on the same key",
    "geostats.nugget.varianceErr": "the kriging variance at a data location is exactly zero for the same reason; the plant mode reads 3.33e-2, so the comparison is live",

    // FDTD -- the magic time step, and the controls are computed in the same mode.
    "fdtd.magic.magicErr": "|1 - vp/c| at Courant number S = 1.0, the magic time step at which the Yee scheme is exactly non-dispersive; the same at() function is evaluated at S = 0.9 and S = 0.5 IN THE SAME MODE and returns non-zero, which is the point the mode exists to make -- a smaller step is worse, not better",
    "fdtd.lightspeed.cErrFrac": "cMeasured equals cExact to the bit at the magic step, the same exactness as magicErr seen through the recovered speed rather than the dispersion",

    // PROBE
    "probe.place.tourWorstErr": "the place fixture puts the probe at the tour waypoints rather than integrating to them, so the worst waypoint error is zero by construction; the tour mode integrates and reads 1.0862e-12",
    "probe.transfer.periErr": "the transfer's PERIHELION is the departure radius, which the fixture sets, so it is exact by construction; its sibling apoErr in the same mode is 7.9353e-10 because the APHELION is integrated to -- one exact end and one measured end, side by side",

    // XPBD -- a symmetry identity whose own gate asserts === 0.
    "xpbd.weave.isotropicResidual": "iso and isoOther are stretchAlong(stiff, stiff, axis) at axis 0 and axis 2 -- equal compliances, so the cloth is isotropic and the two axes agree to the bit; the same function returns anisotropyRatio 14.03 when the compliances differ, so the machinery is direction-sensitive and the zero is the symmetry",

    // SEISMIC -- an algebraic identity that is NOT always bit-exact, which is what makes it a real subtraction.
    "seismic.interface.energyResidual": "R^2 + (Z1/Z2) T^2 = 1 is energy conservation at a plane interface, algebraically exact; it is bit-zero at the fixture's impedances but reads 1.11e-16 at Z1=1.5 Z2=7.3, and scaling R by one percent moves it to 8.73e-3 -- so this is exact arithmetic at these values, not an identity the code cannot fail",

    // NUCLEAR
    "nuclear.chain.conservationResidual": "A + B + C = N0 for the closed Bateman chain, exact by construction since the three populations partition a fixed nucleon count; bit-zero at the fixture's rates and 1.1369e-13 at l1=1e-4 l2=7 t=0.2, so the sum is genuinely recomputed rather than asserted",

    // BEAM -- the most interesting of the twenty: a REAL error that the observable is deliberately blind to.
    "beam.exponent.exponentError": "the recovered log-log slope is exactly 3 even though measureTipDeflection is a real finite-difference solve carrying genuine discretisation error -- 5.21e-7 at L=0.5 rising to 2.67e-4 at L=4. THE RATIO numeric/closed IS IDENTICAL AT EVERY L (1.0000125031215), so a constant relative error moves the INTERCEPT of the fit and never its SLOPE. The zero is not the absence of error; it is an exponent being immune to the error that is present, which is what a scaling check should be",

    // CENTRIFUGE -- a bisection that lands exactly only because the target is the exact bracket midpoint.
    "centrifuge.neutral.neutralRelErr": "the neutral density is recovered by BISECTION on the drift sign, and at rhoF = 1 it converges on 1 exactly; at rhoF = 1.3 it lands 1.71e-16 off and at 0.7777 1.43e-16 off, so the search is a real numerical one and the exactness belongs to the value, not to the method",

    // GALAXY -- the control is the plant.
    "galaxy.traces.triangleErr": "the trace identity over the adjacency triple is integer-exact on this fixture; the unorderedtri plant mode reads 1.38e+3 on the same key",

    // MPMSTRESS -- the blind partner, named by its own mode.
    "mpmstress.blindfixtures.dilationPlantDelta": "blindfixtures is the mode of fixtures BLIND to the plant, and the dilation fixture is the blind one -- the transposed plant leaves it untouched by design; its sighted partner shearPlantDelta sits beside it in the same mode at 1.5385e+1",

    // HANDS -- an equivalence between two spellings of the same operation.
    "hands.mirror.mirrorMaxDelta": "computeHandMetrics with mirror:true must agree with the same pose flipped by x -> 1-x and mirror:false; the max is taken over five quantities across four poses and every one agrees to the bit, which is the equivalence the mode exists to assert rather than a check with nothing in it",

    // KERRLADDER
    "kerrladder.photon.photonErr": "at spin 0 the photon sphere sits at exactly 3M, a small integer landed on exactly; the sibling photonWorstErr over ten spin rows reads 1.2434e-14, so the non-zero spins in the same mode are what show the comparison working",
    // *** v3914 -- TWELVE OF THE THIRTY-TWO CENSUS HAD BEEN UNABLE TO REPORT. *** census-selfcheck was timing
    // out at 180s, so its exact-zero ledger went unenforced and the fresh list grew to 32 across 16 devices. It
    // completes at 717s now (v3913 gave it a budget), and these twelve are the two clusters, EXAMINED rather
    // than waved through -- MOVING AN ENTRY HERE MEANS SOMEBODY LOOKED, and both clusters have a control that
    // proves the comparison is live rather than vacuous.
    //
    // THE VIBRATIONS SUM RULES. sumW2ErrRel and sumW4ErrRel compare the moments of the eigenvalues lambda = w^2,
    // summed over the module's own frequencies, against closed forms in N: sum(lambda) = 2N(k/m) and
    // sum(lambda^2) = (6N-2)(k/m)^2. The naming is offset by one on purpose -- "first moment" is the moment of
    // LAMBDA, so it lands on sumW2 -- and I checked that before assuming a bug, because key4 being computed by
    // a function called secondMomentKey reads exactly like one.
    // *** AT N=12 THE TWO SUMS ARE 24 AND 70 -- SMALL INTEGERS, EXACTLY REPRESENTABLE -- so the summation lands
    // bit-exactly on the closed form. THE CONTROL IS ring AT N=32: there sum(lambda^2) comes out
    // 189.99999999999997 against 190, a residual of -2.84e-14, WHICH IS WHY ring.sumW4ErrRel IS NOT ON THIS LIST.
    // The same expression produces a non-zero when the arithmetic stops being exact, so the zeros at N=12 are a
    // property of the numbers and not of a dead check.
    "vibrations.moments.sumW2ErrRel": "sum(lambda) over the chain's own frequencies lands bit-exactly on 2N(k/m) = 24 at N=12, a small integer; ring at N=32 shows the same comparison going non-zero, so this is exact arithmetic and not a dead check",
    "vibrations.moments.sumW4ErrRel": "sum(lambda^2) lands bit-exactly on (6N-2)(k/m)^2 = 70 at N=12; the ring mode's 2.84e-14 residual at N=32 is the control that the expression can miss",
    "vibrations.trace.sumW2ErrRel": "same chain and same sum rule as moments -- the trace mode probes a different route to the second moment and leaves these two untouched, so the exactness carries across unchanged",
    "vibrations.trace.sumW4ErrRel": "same as moments.sumW4ErrRel: 70 at N=12 is exactly representable and the sum reaches it to the bit",
    "vibrations.ring.sumW2ErrRel": "sum(lambda) = 64 at N=32 is exactly representable and the sum lands on it; ITS SIBLING sumW4ErrRel IS NOT ZERO at the same N, which is what makes this a fact about the number rather than about the check",
    "vibrations.sixNplus6.sumW2ErrRel": "the sixNplus6 plant replaces the FOURTH moment's key only (6N-2 -> 6N+6), so the second-moment comparison is bit-identical to the honest arm and stays exactly zero -- it is the plant's blind partner",
    //
    // THE FFT ABSOLUTE KEYS, WHICH ARE EXACT BY CONSTRUCTION AND WHOSE OWN GATE SAYS SO. A constant c gives
    // |X[0]| = c*N and a sinusoid c*sin gives |X[k]| = c*N/2, both exactly; fftBind-selfcheck asserts
    // `honest.sinusoidErrFrac === 0` and states "NOT TOLERANCED -- EXACTLY ZERO" in the same breath. Nothing in
    // fft.js is told either number.
    // *** THE CONTROL IS THE halfscale PLANT: the same two observables read 0.875 there. *** A check that could
    // only ever return zero would read zero in that mode too, so these are exact AND demonstrably live -- which
    // is the pair of properties this register exists to record, and the reason they are not merely tolerated.
    "fft.absolute.sinusoidErrFrac": "a sinusoid c*sin gives |X[k]| = c*N/2 exactly and fft.js is never told the number; fftBind-selfcheck asserts === 0 deliberately, and the halfscale plant moves it to 0.875",
    "fft.absolute.mixedToneErrFrac": "same absolute key over two summed tones, exact for the same reason; halfscale moves it to 0.875, so the zero is live rather than unreachable",
    "fft.parseval.sinusoidErrFrac": "the parseval mode changes WHICH identity is graded, not the absolute keys, so this stays exactly zero alongside its own energy residual",
    "fft.parseval.mixedToneErrFrac": "as above -- the mixed-tone absolute key is untouched by the parseval route and remains exact",
    "fft.roundtrip.sinusoidErrFrac": "the roundtrip mode grades inverse-then-forward; the absolute key is computed on the forward pass and is unaffected, so it stays bit-zero",
    "fft.roundtrip.mixedToneErrFrac": "as above -- roundtrip leaves the absolute keys alone, and halfscale is where these two are shown to move",
    // v3533 -- THE GRAINS STICK ZERO. Below the Coulomb cone (tangential motion < mu*depth) a contact STICKS: the
    // solve resists the entire tangential motion since the previous step, so the applied correction equals that
    // motion exactly and the residual is zero to the bit. It is the sticking half of the friction law (the coneErr
    // key is the slipping half, a tolerance value at the cone). Removing the cone clamp -- the mode's plant --
    // leaves this case untouched, because a slow pair was already within the cone; it is the blind partner.
    "xpbd.grains.stickErr": "below the Coulomb cone a contact sticks, resisting the whole tangential motion since prev, so applied correction equals that motion and the residual is exactly zero; the mode's no-clamp plant does not touch this case because the pair was already within the cone",
    // v3523 -- THE de SITTER HUBBLE-CONSTANT ZERO. In a universe with only a cosmological constant, the Friedmann
    // factor E(a) = sqrt(Or/a^4 + Om/a^3 + Ok/a^2 + OL) reduces to sqrt(OL) = sqrt(1) = 1 for EVERY a, exactly to
    // the bit, so the Hubble rate H = H0 E is constant and the scale factor grows as exp(H0 t). It is the defining
    // property of Lambda domination, and a Lambda that diluted with expansion (the plant makes it go as a^-3)
    // would move E off 1 immediately. Blind partner: the closure identity Om+Or+Ok+OL=1, definitional.
    "astroparticle.desitter.closureErr": "Om + Or + Ok + OL = 1 by definition (Ok is the remainder), exact to the bit for any inputs; reused here as the blind control -- it does not move when Lambda is made to dilute, while hubbleConstantErr does",
    "astroparticle.desitter.hubbleConstantErr": "with only a cosmological constant E(a) = sqrt(OL) = sqrt(1) = 1 for every a to the bit, so H is constant and expansion is exponential; a Lambda that diluted with a (the plant uses a^-3) moves E off 1, and this is the defining property of de Sitter",
    // v3519 -- THE CSG IDEMPOTENCE ZERO. union(A, A) has f = min(A.f, A.f), and min(x, x) = x to the bit for every
    // finite x, so the self-union equals the operand exactly at every sample point -- the set identity A OR A = A,
    // exact by construction. A union built from max, or one that perturbed an operand, would move it off zero.
    "csg.tree.idempotenceErr": "union(A,A).f = min(A.f, A.f) and min(x,x) = x to the bit, so the self-union equals the operand exactly; the set identity A OR A = A is exact by construction and a corrupted union operation would move it off zero",
    // v3518 -- THE HALO FLAT-CURVE ZERO. For a singular isothermal sphere M(r) = v0^2 r / G, so the circular speed
    // vCirc(M(r), r) = sqrt(G * (v0^2 r / G) / r) is v0 at EVERY radius: the G and the r cancel to the bit and the
    // flat rotation curve is what the isothermal halo IS, identically, not an approximation. It is the exact
    // control the module built to validate the numerical enclosed-mass integrator on profiles with no closed form
    // -- a mis-powered mass law (v0^2 r^2 / G) would tilt the curve and move this off zero.
    "astroparticle.halo.flatErr": "for the isothermal sphere M(r) = v0^2 r / G, vCirc = sqrt(G*(v0^2 r/G)/r) cancels G and r to the bit and returns v0 at every radius, so the flat curve is exact by construction; a wrong power in the mass law tilts the curve and moves it off zero",
    // v3516 -- THE LENSING RADIUS ZERO. The module's Einstein radius is sqrt(4GM/c^2 * dLS/(dL dS)); the reference
    // computes it via the Schwarzschild radius R_s = 2GM/c^2 as sqrt(2 R_s * ...), and 2*(2GM/c^2) = 4GM/c^2 to
    // the bit (multiplication by 2 is exact), so the two routes agree exactly and radiusErr is 0. It is the
    // NOT-BLIND key: the plant's wrong 2GM/c^2 factor moves it to sqrt(1/2), and moves the peak magnification a
    // telescope records, while the magnification invariant mu_+ - mu_- = 1 -- a function of u alone -- cannot see it.
    "astroparticle.lensing.radiusErr": "the module's 4GM/c^2 equals the reference's 2*(2GM/c^2) to the bit because multiplication by 2 is exact, so the Einstein radius from two routes agrees exactly; a wrong constant factor (the plant uses 2GM/c^2) moves it off zero, and it is the key the blind mu_+ - mu_- = 1 invariant cannot provide",
    // v3502 -- THE FRIEDMANN CLOSURE ZERO. Om + Or + Ok + OL = 1 EXACTLY at the present day, because Ok is DEFINED
    // as 1 - Om - Or - OL (curvature is whatever is left). So the sum is checking the arithmetic of a definition,
    // not the cosmology, and it is exactly 1 to the bit for any inputs. It is deliberately BLIND to a wrong
    // dilution exponent -- the third example, after oscillation's unitarity and lensing's invariant, of a true
    // identity that a serious physics error cannot touch; the flat matter-only age (2/3) is the key that is not
    // blind. The zero still has power over a real bug: a closure that computed Ok some other way, or summed the
    // wrong terms, would move it off zero.
    "astroparticle.friedmann.closureErr": "Ok is defined as 1 - Om - Or - OL, so Om + Or + Ok + OL telescopes to exactly 1 to the bit for any density parameters; it is an arithmetic identity blind to any dilution error, and a closure that summed different terms would move it off zero",
    // v3501 -- THE OSCILLATION UNITARITY ZERO. survive + transition = 1 exactly, with transition computed
    // INDEPENDENTLY rather than as 1 - survive, so the sum is a genuine test and not an algebraic tautology. It is
    // sin^2 + cos^2 in physics notation: survival = 1 - s2^2 sin^2(phase) and transition = s2^2 sin^2(phase) with
    // the SAME s2 and phase, so their sum is exactly 1 to the bit at every energy, baseline, angle and mass
    // splitting. The zero has power over a real bug -- a transition probability computed with a different sign,
    // factor or phase would break it -- and it is deliberately BLIND to the oscillation constant, which is the
    // device's whole lesson: only the derived-coefficient key sees a dropped 1.267.
    "astroparticle.oscillation.unitarityErr": "survival = 1 - s2^2 sin^2(phase) and transition = s2^2 sin^2(phase) share the same s2 and phase, so their independent sum is exactly 1 to the bit; a wrong sign or factor in transition would move it off zero, and it is blind to the oscillation constant by construction",
    // v3479 -- THE clothLoop KEYS. The GPU buffer-pass loop has two exact zeros: (a) one frame of a free particle
    // lands at pos = g*dt^2 with vel = g*dt, because predict does vel += g*dt then pos += vel*dt and finalize
    // reads vel back as (pred-prev)/dt -- the semi-implicit Euler closed form, exact from a zero start; (b) the
    // decomposed loop reproduces the monolithic clothSubstep byte-for-byte across a sweep of iterations and grid
    // sizes, so the worst position difference is exactly 0. Both have power over a real bug: a mis-integrated
    // predict moves the free-fall off g*dt^2, and any pass that breaks the ping-pong handoff moves the
    // equivalence off zero -- the plant that drops -aTilde*lambda diverges at positive compliance while agreeing
    // at compliance 0, which is why the equivalence sweep runs the compliance knobs live.
    "xpbd.clothloop.freeFallErr": "predict integrates vel += g*dt then pos += vel*dt from a zero start, and finalize recovers vel as (pred-prev)/dt, so one frame gives pos = g*dt^2 and vel = g*dt to the bit; a mis-ordered or dropped integration term moves it off zero",
    "xpbd.clothloop.equivErr": "the decomposed predict/solve/finalize loop is algebraically the monolithic clothSubstep, so byte-for-byte agreement across the swept configs is exact; a broken pass handoff or a dropped feedback term moves it off zero -- a comparison of two solvers, not a mirror",
    // v3478 -- THE ATTACHMENT IDENTITIES. attach.js pins a particle to a world point (C = |x - target|, rest 0).
    // Two of its keys are exact by construction: with compliance 0 the single-step correction is w*s*(x-target)
    // with w*s = -1, so the particle lands ON the anchor to the bit; and because each attachment touches a
    // distinct particle and its own lambda slot, forward and reversed visit order agree exactly. The soft-spring
    // key (positive compliance keeps aTilde/(w+aTilde) of the offset) is NOT here, because it is real arithmetic
    // at ~1.7e-16. Both zeros have power over a real bug -- a wrong mass factor breaks the snap, a shared-state
    // write breaks the order freedom -- and the plant (ignore compliance, always snap) agrees at compliance 0.
    "xpbd.attach.snapErr": "with compliance 0 the correction is w*s*(x-target) and w*s is exactly -1 on a dyadic mass, so pred += -(x-target) and the particle IS the anchor to the bit; a dropped or wrong mass factor would move it off zero",
    "xpbd.attach.orderErr": "each attachment touches a distinct particle and its own lambda slot, so nothing one writes is read by another and forward vs reversed visit order agree exactly; a shared-state accumulation bug would break it",
    // v3463 -- THE SAMPLED-FIELD IDENTITIES. sampledField.js reads a world-supplied vector grid trilinearly. Two
    // of its keys are exact by construction and one is not, which is the whole reason the affine key is NOT here:
    // the affine-reproduction error is real arithmetic at ~2.7e-15 (a multilinear blend against the closed form
    // a.x+b), so it is nonzero and graded by tolerance. These two ARE exact, because an INTEGER grid makes the
    // fractional coordinate exactly 0 at a node: (a) sampling AT a node gives the corner a weight of exactly 1,
    // so the stored value returns to the bit; (b) sampling OUTSIDE clamps the coordinate to an integer edge, so
    // the same weight-1 collapse returns the edge node exactly. Both have power over a real bug -- a wrong index,
    // a botched fraction, or a read past the array would move either off zero, and the nearest-neighbour plant
    // agrees with trilinear at exactly these node points while parting by 8.1e-1 between them.
    "xpbd.sampled.nodeErr": "on an integer grid the fractional coordinate at a node is exactly 0, so the trilinear corner weight is exactly 1 and the stored value returns to the bit; a wrong index or fraction would break it, so the zero has power over a real bug",
    "xpbd.sampled.clampErr": "an out-of-range coordinate clamps to an integer edge index, giving the same weight-1 collapse as a node, so the edge value returns exactly; the failure it refuses is a read past the array or onto the wrong edge, both of which move it off zero",
    // v3462 -- THE MODULATION SPINE'S THREE KEYS ARE INVARIANCES, WHICH IS WHY THEY ARE EXACTLY ZERO AND NOT
    // TAUTOLOGIES. modulate.js recomputes each constraint's rest/compliance from a stored BASE every frame, so:
    // (a) a zero field is the identity -- rest0*(1+expansion*0) is an exact multiply-by-one, so heating then
    // zeroing returns every parameter to base to the bit; (b) applying a FIXED field once or a hundred times
    // gives the same parameter, because reading the base makes N applications equal to one -- a spread of two
    // runs, not a value against its own formula; (c) the map is a pure per-constraint function of the snapshot,
    // so forward and reversed visit orders agree exactly. Each has real power over the historically-real bug the
    // header names: a spine that read the LIVE value instead of the base breaks all three, compounding as
    // (1+expansion*T)^N -- measured, and agreeing with the correct spine at exactly one application.
    "xpbd.modulate.zeroFieldErr": "the map recomputes from the stored base, so a zero field is rest0*(1+0)=rest0, an exact multiply-by-one; a live-reading spine could not walk an accumulated dent back to base, so this zero has power over the real bug",
    "xpbd.modulate.compoundErr": "reading the base each frame makes N applications of a fixed field equal to one, so rest@1 and rest@100 are the same float; the planted live-read compounds as (1+expansion*T)^N and this becomes large -- a spread of two runs, not a mirror of a formula",
    "xpbd.modulate.orderErr": "modulation is a pure per-constraint function of the field snapshot, so scrambling the visit order changes nothing; forward and reversed agree to the bit because neither reads a value the other wrote",
    // v3211, AND THE CEREMONY WORKED ON ME. plastic's cap mode clamps to restOrig * (1 + maxStrain) and then
    // reports (newRest0 - restOrig) / restOrig with restOrig exactly 1 -- so the observable is (1 + maxStrain) - 1.
    // THE CLAMP ASSIGNS THE TARGET RATHER THAN CONVERGING ON IT, so when maxStrain is exactly representable and
    // 1 + maxStrain is exact the subtraction gives it back to the bit. MEASURED, not asserted: maxStrain 0.25,
    // 0.5 and 0.75 all return exactly 0; 0.3 returns 0.30000000000000004 and 0.1 returns 0.10000000000000009,
    // errors 5.6e-17 and 8.3e-17. Same mechanism as splat.integral.isoRollDeviation above, arrived at from the
    // other end. *** AND GOING TO WRITE THIS SENTENCE IS WHAT EXPOSED A REAL BUG: the cap sweep was a hardcoded
    // [0.25, 0.5, 1.0] and capAttained returned the 0.5 run, so config.maxStrain MOVED NOTHING. A knob that does
    // not change the answer is a mode in name only, and it would have made lab-export's config column a lie. ***
    "plastic.cap.capErrAbs": "the cap clamps to restOrig*(1+maxStrain) and reports (1+maxStrain)-1 with restOrig exactly 1, so an exactly-representable cap comes back to the bit -- 0.25/0.5/0.75 give exactly 0 while 0.3 and 0.1 give 5.6e-17 and 8.3e-17",
    // v3001, FOUND BY A RIG RUN. The eccentric inspiral (stage three) evaluates its OWN rate function at e=0 --
    // dadt(a0, 0, Mc) -- and compares it against the circular Peters closed form (stage two), written out
    // separately as -PETERS_A * Mc / a0^3. Two independently authored expressions.
    //
    // WHY IT IS EXACTLY ZERO RATHER THAN MERELY TINY, verified term by term rather than asserted: dadt carries
    // the factor (1 + 73e^2/24 + 37e^4/96) / (1-e^2)^3.5. At e = 0 every term containing e is multiplied by
    // zero, so the numerator is 1 + 0 + 0 === 1 EXACTLY, and Math.pow(1 - 0, 3.5) === 1 EXACTLY. The eccentric
    // rate is then the circular rate times 1 divided by 1, and both are exact IEEE operations. MEASURED: the two
    // expressions return the identical double, error exactly 0.
    //
    // I FIRST WROTE THIS UP ATTRIBUTING THE FACTOR TO gOfE() AND IT WAS THE WRONG FUNCTION. gOfE is the TIME-FREE
    // INVARIANT's factor -- e^(12/19)/(1-e^2) * [1+121e^2/304]^(870/2299) -- and it is 0 at e=0, not 1. The
    // mechanism was right and the citation was wrong, which is the same shape as every mis-stated key this
    // project has caught: plausible, adjacent, and false. Checked against the source before this sentence stood.
    //
    // THIS IS NOT A TAUTOLOGY AND THE DISTINCTION MATTERS. A tautology would be grading a quantity against the
    // expression that produced it. Here stage three's g(e) machinery must REDUCE correctly, and if either scene
    // had the constant or the exponent wrong the two would disagree at e=0 and this zero would become nonzero.
    // The check has real power over a wrong implementation; it has none over a wrong SPECIFICATION, which is the
    // same honest limit the iOS black-hole checks were re-read as carrying at v2971.
    "eccentric.invariant.circularLimitErrFrac": "Peters' g(e) is exactly 1.0 at e=0, and multiplying by 1.0 is exact in IEEE -- stage three reducing to stage two is bit-identical by arithmetic, not by mirroring",
    "eccentric.limit.circularLimitErrFrac": "same reduction, reported from the dedicated limit mode: dadt(a0, 0, Mc) against the separately written -PETERS_A*Mc/a0^3",

    // box3d's impulse bookkeeping: j/m is computed in the engine and in the check by the same exact arithmetic on
    // exactly-representable values (j=5, m=1), so agreement to the bit is arithmetic, not a mirror.
    "box3d.impulse.momentumErrFrac": "j/m on exactly-representable values; momentum accounting has no discretisation",
    // splat's alpha compositing is exact rational arithmetic on dyadic values.
    "splat.compose.alphaErr": "over-compositing is exact rational arithmetic on dyadic alphas",
    // Wyvill same-colour ordering is a permutation of identical terms: exact by commutativity of equal addends.
    "splat.compose.sameColourOrderDelta": "a permutation of identical terms; commutativity makes this exactly zero",
    // v2912, FOUND BY THE RANGE SWEEP AND NOT BY THE DEFAULT CENSUS. For an isotropic covariance sigma^2 * I,
    // rotating gives sigma^2 * R * R^T, and when sigma^2 is a power of two that scaling is EXACT -- an exponent
    // shift with no mantissa rounding -- so the rotated entries equal the unrotated ones bit for bit. Measured:
    // sigma 0.125, 0.25, 0.5, 1, 2 all give exactly 0; sigma 0.1, 0.3, 0.7 give 1.1e-14, 4.5e-13, 1.8e-12.
    // The invariance is real at every sigma; whether it READS as exactly zero depends on whether sigma is dyadic.
    // Note the direction: the DEFAULT sigma of 0.1 is the one value that hides this, the opposite of the airy
    // case where the default hid a zero that appears at the clamp.
    "splat.integral.isoRollDeviation": "isotropic covariance scaled by a dyadic sigma^2; rotation is an exact exponent shift, so the deviation is exactly zero for power-of-two sigma",
    // Kepler's exponent is fitted to data generated from the same power law with exactly-representable exponents.
    "discovery.kepler.exponentErr": "regression on data generated from the exact law recovers the exponent exactly",
    "discovery.visviva.coeffErr": "linear solve on an exactly-determined system",

    // --- v2898: the thirteen the first registry-wide sweep turned up. Each was examined, not rubber-stamped. ---
    // Kerr's horizon identities are ALGEBRAIC: r+ + r- = 2M and r+ * r- = a^2 hold term-for-term, and with M=1 and
    // the spins used here every intermediate is exactly representable, so the sum and product are exact additions
    // and multiplications rather than two approximations meeting.
    "kerr.spin.horizonSumErr": "r+ + r- = 2M is an algebraic identity; exactly-representable operands make the float sum exact",
    "kerr.limit.horizonSumErr": "r+ + r- = 2M is an algebraic identity; exactly-representable operands make the float sum exact",
    "kerr.extremal.horizonSumErr": "at a=M the roots coincide at r=M; the sum is exact addition of representable values",
    "kerr.limit.horizonProductErr": "r+ * r- = a^2 is an algebraic identity, exact on representable operands",
    "kerr.extremal.horizonProductErr": "at a=M both roots equal M, so the product is M^2 exactly",
    // At a=0 the Kerr expressions REDUCE algebraically to the Schwarzschild ones -- sqrt(M^2-0)=M etc. -- so with
    // M=1 the reduction is exact arithmetic, not two numerical methods agreeing. The genuinely independent version
    // of this claim is section 2 below, which checks kerr.js against SEPARATELY WRITTEN modules.
    "kerr.limit.schwarzHorizonErr": "at a=0 the Kerr horizon formula reduces algebraically to 2M; with M=1 the reduction is exact arithmetic",
    "kerr.limit.schwarzPhotonErr": "at a=0 the prograde/retrograde photon radii collapse algebraically to 3M, exactly",
    "kerr.limit.schwarzShadowErr": "at a=0 the shadow asymmetry vanishes identically -- a difference of two equal expressions",
    // The logistic fixed point is ATTRACTING for the r used here, so 20000 iterations of r x (1-x) converge onto the
    // exact representable fixed point. Crucially the iteration never evaluates 1 - 1/r, so this is a dynamical
    // convergence result, not a measurement compared against its own formula.
    "chaos.fixed.fixedPointErr": "an attracting fixed point iterated 20000 times lands on the exact representable value; the map never computes 1-1/r, so this is convergence rather than a mirror",
    // Splat: a permutation of identical addends, a fit on exactly-generated power-law data, and a term that
    // vanishes by symmetry on the axis.
    "splat.compose.alphaOrderDelta": "a permutation of identical alpha terms; commutativity of equal addends makes this exactly zero",
    "splat.perspective.areaSlopeErr": "the fit runs on data generated from the exact inverse-square law, so it recovers the exponent exactly",
    "splat.shear.onAxisShearDelta": "on the axis the shear term vanishes identically by symmetry -- a difference of two equal expressions",
    // blobKelvin's two conversions are exact linear inverses of one another, which the blobKelvin selfcheck already
    // asserts deliberately ("inverse functions, not approximate ones").
    "blobkelvin.convert.roundTripErrFrac": "kelvinOfWarmth and warmthOfKelvin are exact linear inverses; the round trip returns the same float by construction",

    // --- v4023/v4025: the two the crystal and fracture rounds brought in. Both examined against the number.
    // The rotated box: an orthogonal similarity preserves the diagonal sum, and MEASURED, both sides land on
    // the same float -- sum(eigenvalues) = 15.000000000000004 and tr(I) = 15.000000000000004, bit for bit --
    // so the residual is exactly zero rather than at 1e-15. It is NOT a mirror: tred2 + tql never sees tr(I) as
    // a target, and the same invariance measured over real fracture fragments (censusWorstTraceResidual) comes
    // back at 3.193e-16, which is what the check reads when the two floats are merely close. What makes THIS
    // one exact is that a single conjugation of a diagonal by one rotation accumulates the same rounding twice.
    "fragmentRotation.fragments.traceResidual": "an orthogonal similarity preserves the diagonal sum; on this one tensor sum(eigs) and tr(I) land on the identical float (15.000000000000004), so the invariance reads exactly zero. The eigensolver never targets the trace, and the same check over real fragments reads 3.193e-16",
    // The cubic cell is the degenerate case of the reciprocal identities BY CONSTRUCTION: b_i = 2 pi (a_j x a_k)/V
    // on the identity basis gives cross products and a volume made only of 0s and 1s, so every b_i is exactly
    // (2 pi, 0, 0) and its permutations and every a_i . b_j is 2 pi or 0 with no rounding to make. That is why
    // the bind carries the TRICLINIC cell beside it, which reads 8.882e-16 and is the one that can fail: a
    // cubic-only check would pass an implementation that simply handed back its input scaled.
    "structureFactor.absences.reciprocalResidualCubic": "the identity basis makes every cross product and the cell volume exact on 0/1 operands, so a_i . b_j is 2 pi or 0 with no rounding available. The triclinic cell beside it reads 8.882e-16 and is the one carrying the check",
    // The MIS balance heuristic is w_i = p_i / (p_light + p_bsdf). The two weights are p/(p+q) and q/(p+q) over
    // the SAME denominator, so their sum is (p+q)/(p+q) -- one division of one sum, exact for any finite
    // positive p and q with no cancellation available. It is the only line in that device with no sampling in
    // it, and it is carried precisely BECAUSE it is exact: it is the reason combining two estimators does not
    // double-count, and an approximate version would be a silent bias rather than a visible error.
    "renderBounce.series.misWeightSumErr": "p/(p+q) + q/(p+q) is one division of one sum, exact for any finite positive p and q. An invariance rather than an estimate -- the only part of the device with no sampling in it, and the reason MIS does not double-count",
};

/**
 * v2930 -- GRADED_BY_COMMENT, folded in from v2913 where it was lost in the v2926/v2927 merge.
 *
 * v2913 found that the zero census selects fields by /err|error|residual|delta|deviation/i, and several graded
 * optics observables carry their answer key in a trailing COMMENT rather than in a field name that matches --
 * so the census has never inspected them. This makes that machine-readable. The gates edgeFresnel-selfcheck and
 * slitQuantisation-selfcheck import it; when the merge dropped this export, those two gates silently stopped
 * running (they threw on import, which a discovery runner counts as absent, not failed). Restoring the export
 * restores the gates -- which is how this round found the gap: adopting the edge check ran the edge gate, and
 * the edge gate would not load.
 */
export const GRADED_BY_COMMENT = {
    "optics.slit.slitFirstMinFactor": { key: 1, why: "single-slit first minimum is at sin(theta) = lambda/a, so the factor is exactly 1" },
    "optics.airy.rayleighFactor": { key: 1.2196698912665045, why: "j(1,1)/pi; opticsBind compares against the rounded 1.22 (see v2911)" },
    "optics.edge.edgeShadowIntensity": { key: 0.25, why: "knife-edge intensity at the geometric shadow boundary, from C(0)=S(0)=0. v2914: EXACT BY CONSTRUCTION -- verifies nothing. v2930 added edgeFirstFringeErrFrac as the real graded field" },
};

/**
 * v3211 -- THE BACKLOG THE MODES REPAIR UNCOVERED, AND WHY IT IS A LIST RATHER THAN A LICENCE.
 *
 * census-selfcheck crashed on import for as long as MODES has been a broken name. The FIRST RUN after the repair
 * flagged ELEVEN unexplained exact zeros. One of them was mine and is registered above WITH A MEASUREMENT. The
 * rest are pre-existing and NOT MINE TO EXPLAIN: writing a reason I have not verified onto a register whose whole
 * ceremony is the reason would be fabricating provenance, and v3195 established that a stale suppression is an
 * ACTIVE BLIND SPOT -- worse than no entry, because nobody audits a list they believe is working.
 *
 * *** SO THIS IS A DEBT, NOT AN APPROVAL, AND THE RATCHET RUNS ONE WAY: THE LIST MUST NOT GROW. *** Moving an
 * entry from here to EXACT_OK means someone examined it and wrote the sentence. WHEN AN ENTRY STOPS FIRING, IT
 * IS DELETED FROM THIS LIST, NOT LEFT IN PLACE -- an entry whose reason has expired is a ratchet holding nothing.
 *
 * plastic.creep.creepErrAbs IS HERE RATHER THAN ON THE REGISTER ON PURPOSE, and the reason is worth keeping: I
 * had a clean story -- "exact for dyadic creep" -- and TESTING IT KILLED IT. creep 0.125 is dyadic and gives
 * 1.1e-16; creep 0.4 is not and gives exactly 0. The permanent set is fl(1 + fl(creep*excess)) - 1, so every
 * point carries up to one ULP of 1, and whether the least-squares slope lands on the declared value exactly is a
 * cancellation, not a construction. A PLAUSIBLE, ADJACENT, FALSE REASON is the exact failure the eccentric entry
 * at the top of this file warns about, and it was one edit away from being written.
 */
export const EXACT_ZERO_BACKLOG = {
    "plastic.creep.creepErrAbs": "MINE, v3211. Exact at creep 0.4 and 0.5, 1.1e-16 at 0.125, 4.4e-16 at 0.3 -- a rounding cancellation rather than an exact construction, so it does NOT belong on the register above",
};

# Physics in the library that could drive a shader with a key

Written at v4315, from a sweep of physics/, world/, render/, fx/, brain/ and tools/ for models that already
exist as code and could be given the swk_lyapunov treatment: per-pixel arithmetic, a WGSL twin beside a GLSL
one, a pipeline on gfx/device.js, and a gate that reads an EXACT ANSWER back off the GPU -- an answer the
shader is never handed. Two are done this round (render/lyapunovWgsl.mjs, render/heidlerWgsl.mjs); the rest
are ranked by how cleanly they would become one.

## Done at v4315

- **swk_lyapunov** (physics/chaos/logistic.js): the Lyapunov exponent of the logistic map, ln 2 at r = 4.
  Compute probe, full-screen key on both backends, and the Chaos race's look.
- **The lightning** (physics/discharge/heidler.mjs): the Heidler return-stroke current, a closed form of t.
  Keys: peak over i0 is exactly 1 at the shape's true peak, and 1.0667 at the published eta (the reference
  formula's own approximation, the module's finding). Compute probe; both numbers read off the GPU.

## Done at v4318

- **Blackbody** (physics/thermal/blackbody.mjs -> render/blackbodyWgsl.mjs): Planck's dimensionless shape
  x^n / (e^x - 1) and Wien's root x = n(1 - e^-x) by Newton IN THE SHADER (24 steps from x = n). Keys the
  device is never handed: x_lambda = 4.965114231744276 and x_nu = 2.8214393721220787, read off the WebGPU
  probe to 2e-6 with residual 0; the peak of the shape over the root (21.2014, 1.42144) to 1e-4; and on
  BOTH backends the full-screen key's brightest column on the n = 5 row is x_lambda to within a column.
  The sabotage log records two sabotages the gate cannot see (a wrong derivative sign and 2 Newton steps
  both still land on the root) and one it can (a start at x = 1 finds the trivial root x = 0).
  v4319: the same functions as TSL nodes (render/blackbodyTsl.mjs), the key read off both of three's backends.

## Per-pixel and closed-form: the next ones (a fragment can be a coordinate)

1. ~~**Blackbody**~~ -- done at v4318, above. The temperature-to-colour ramp (a pixel as (T, lambda)) is not
   built; the key pipeline draws x across and n down.
2. **Diffraction** (physics/optics/diffraction.js): single slit, double slit, circular aperture. Keys:
   sinc squared, the Airy first minimum at 1.22 lambda / D. A pixel is sin(theta). A hologram race that
   diffracts.
3. **Fresnel** (physics/optics/fresnel.js): Fresnel integrals, the Cornu spiral, the knife edge. Keys:
   C(inf) = S(inf) = 1/2; intensity at the geometric shadow edge exactly 1/4.
4. **Gravitational lensing** (physics/astroparticle/lensing.js): Einstein radius, image positions,
   magnification. Key: total magnification at u = 1 is exactly 3 / sqrt 5. Very cheap per pixel; a lens over
   the orrery's bodies.
5. **A current loop** (physics/em/currentLoop.mjs): Biot-Savart field with elliptic integrals per pixel.
   Keys: the on-axis field and the centre field mu0 I / 2a in closed form; div B = 0 and Ampere's
   circulation as identities at any point.
6. **Random-matrix level spacing** (physics/quantum/rmt.js): per-pixel eigensolves of seeded matrices.
   Keys: R_POISSON = 2 ln 2 - 1 and R_GOE = 4 - 2 sqrt 3. Heavy per pixel, embarrassingly parallel.
7. **The infinite well and the oscillator** (physics/quantum/schrodinger1d.js): bisection per pixel.
   Keys: n^2 pi^2 / 2 m L^2 and (n + 1/2) omega.
8. **Symplectic defect** (physics/mechanics/poisson.mjs): one phase-space point per pixel. Key: the defect
   is exactly 0 for Verlet and semi-implicit Euler, nonzero for Euler and RK4 -- a binary picture.
9. **Kepler** (physics/orbits/kepler.js): one orbit per pixel, integrated. Keys: T = 2 pi sqrt(a^3 / mu),
   vis-viva, zero apsidal precession, and the integrators' convergence orders 1/1/2/4 as a second key.
10. **Entropy** (physics/info/entropy.mjs): H(1/2) = 1 bit, log2 n, the Kraft sum = 1. Trivial per pixel;
    a warm-up gate.

## Needs neighbours or time steps: compute passes, not fragments

11. **Ising** (physics/statmech/ising.js, wolff.js): Onsager's T_c = 2 / ln(1 + sqrt 2), Yang's
    magnetisation, beta = 1/8. A checkerboard compute shader.
12. **Brusselator / Gray-Scott / FitzHugh-Nagumo** (physics/reaction/brusselator.js, demos_code/): the
    Turing growth rate from the Jacobian, with the LATTICE dispersion so the measured growth matches theory
    exactly on the grid. The classic ping-pong pass.
13. **Kuramoto** (physics/sync/kuramoto.js): the exact mean-field order parameter and K_c in closed form.
    All-to-all coupling: a reduction per step.
14. **Bond percolation** (physics/percolation/percolation.js): P(crossing) = 1/2 at p = 1/2 for EVERY L
    (Kesten's self-duality); nu = 4/3. Union-find is awkward in a fragment; a compute pass with atomics.
15. **Yee's Maxwell** (physics/em/maxwell.mjs): c = 1 / sqrt(mu0 eps0), the CFL limit, the magic timestep
    exactly dispersionless in 1D.
16. **Langevin ensembles** (physics/langevin/langevin.js): equipartition, Jarzynski, Crooks. One
    trajectory per thread.

## Already shaders, graded against their own twins only

- physics/render/pathTracerWgsl.mjs (the furnace test: a white furnace returns exactly 1.0 -- an exact key).
- physics/octree/svo-raymarch.glsl, physics/xpbd/*.wgsl, physics/mpm/gpuKernel.mjs.

## What is NOT in the tree

No dielectric-breakdown, DLA or Lichtenberg-figure model: physics/mechanics/poisson.mjs is Hamiltonian
Poisson brackets, not the Poisson equation, so a Niemeyer-Pietronero breakdown would need a Laplace solve
built from scratch. The Heidler current is the lightning physics the library has, and its closed form plus
its exact key make it the better shader target anyway. The visual-only bolts (simulation/Thunderstorm.js,
render/BeamRibbonRenderer.js, world/kaijuAttackFx.js) are geometry, not a model.

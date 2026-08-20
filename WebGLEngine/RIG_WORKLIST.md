# Rig worklist -- 27 open claims, by the machine that settles them

These are not stalled; each is falsifiable only on hardware the sandbox lacks. Run these and report back.

## Galaxina (GTX 1070/1080) (6)

_How: open /brain-bench.html (or the brain panel on /server.html) and read the GPU-vs-CPU verdict._

- [ ] **A page hash is a lie** [v2598]  -- settles when: Galaxina: run render QA twice. The second should skip everything unchanged and take seconds. Touch one module and only its dependents should re-run. --all force
- [ ] **The buffer you never upload** [v2584]  -- settles when: Galaxina: it compiles and draws terrain, or it does not. THE GLSL IS A STRING AND A STRING IS NOT A SHADER -- the arithmetic is proven, the shader is prose, exa
- [ ] **The brain's handicap is memory, not sensors** [v2557]  -- settles when: Race the CONTEXTUAL brain -- brain.js's policy MLP, which takes state -- against the mold in freeSpaceWorld on the rig, where Deno runs. If context closes the g
- [ ] **The GPU brain can be marked against a wall that does not move** [v2547]  -- settles when: Run the brain on INSTANCES.easy and INSTANCES.hard. If its regret is indistinguishable from uniform random, the claim that this measures anything about the brai
- [ ] **The CPU flow field beats the GPU one** [v2156, restated v2506]  -- settles when: If brain-bench on the 1070/1080 shows the GPU faster AND agreeing (meanCos > 0.99), the default is WRONG and flowfieldAuto should be picking the GPU.
- [ ] **The sinogram shader's error was its own sin/cos** [v2490]  -- settles when: If it still reads ~1e-4 on the 1070, the sin/cos was NOT the cause and the real one is still in there.

## the arm64 Mac (mother's M-series) (5)

_How: run the box3d fingerprint / SPH cross-arch check on the Mac and diff its hash against Galaxina._

- [ ] **A cross-arch determinism fingerprint, ready for the Mac that is not here yet** [v2620]  -- settles when: The gate also guards against SILENT physics drift on x86: change substeps 4->8 -> DIVERGE from the reference -> fail; inject a NaN -> fail. A CHANGE TO THE PHYS
- [ ] **A reason that expired is a habit** [v2570]  -- settles when: Different `state=` on x86_64 and arm64. First suspects IN ORDER: (1) THE TWO MACHINES RAN DIFFERENT BYTES -- the Mac PULLS the wasm from Galaxina over the fleet
- [ ] **Two peers' brain traces can be diffed at the same moment** [v2549]  -- settles when: Run two peers on the same seeded room with BRAIN_TRACE=1 and align by tick. If records at the same tick describe visibly different worlds, the tick is not a sha
- [ ] **The SPH flesh will agree bit-for-bit across arm64 and x86_64** [v2546]  -- settles when: Run the same seeded flesh 400 ticks on Stellar Atlas (Intel) and on the M-series Mac (arm64) and diff the state hash. If they differ, this dies -- and the first
- [ ] **Box3D is deterministic across architectures** [v2500]  -- settles when: One mismatched hash and the cross-arch claim is dead -- which would be a genuine upstream finding, worth an issue with the recording attached.

## all three machines (1)

_How: run node tools/mathProbe.mjs on Galaxina, Stellar Atlas and the Mac, then diff the outputs._

- [ ] **It is not the platform, it is the function** [v2599]  -- settles when: Run node tools/mathProbe.mjs on all three machines and diff. THE LINES THAT DIFFER ARE THE FUNCTIONS THAT COST THE BYTES -- no guessing which five numbers moved

## Galaxina (box3d, real WASM) (1)

_How: run the box3d cross-thread determinism harness in the browser (box3d.wasm does not load headless)._

- [ ] **Thread count does not change the physics** [v2508]  -- settles when: Any divergence, and Box3D's determinism is thread-count-dependent. INCONCLUSIVE is not a pass -- if every count clamps to 1, nothing was re-partitioned and the 

## any browser (Galaxina) (10)

_How: load the named page in the browser and confirm it draws and matches the gate's numbers._

- [ ] **A sphere is where one lump ends. The skin is where seven lumps agree.** [v2606]  -- settles when: I SHIPPED A DECORATION INTO THE GATE BUILT TO CATCH EXACTLY THIS MISTAKE. The check first read `x extent > 0.7`; I sabotaged the emitter back to my own first in
- [ ] **He cannot starve. Every way he has ever died was a bug I shipped.** [v2605]  -- settles when: EVERY GAUGE IS TESTED BY REPLAYING THE ACTUAL BUG IT WOULD HAVE CAUGHT, WITH THE REAL NUMBERS FROM THE RECORD -- not a hypothetical failure I invented to have s
- [ ] **So we have a blobarium?** [v2597]  -- settles when: Galaxina: open /blobarium.html and press run. Either seven lumps fall as a blob or they fly apart. THE PAGE HAS NO FALLBACK ON PURPOSE: if box3d is missing it s
- [ ] **The answer next to the guess** [v2593]  -- settles when: Galaxina: drag the depth slider. Either the inside rises and falls, or it does not. THE TILT AT 0deg IS THE z-SLICE THE PHANTOM HAS SUPPORTED SINCE IT WAS WRITT
- [ ] **The turn is the keepsake** [v2591]  -- settles when: Galaxina: press it and either a GIF lands and turns, or it does not. THE PER-FRAME NORMALISE IS THE ONE TO WATCH: the projection through a blob is THICKER at so
- [ ] **A moment with no shutter is not a memory** [v2585]  -- settles when: Galaxina: press it and either a PNG lands or it does not, and either the x-ray is in it or it is not. The renderer does NOT set preserveDrawingBuffer, so the ca
- [ ] **The one failure mode here is the one that looks like success** [v2581]  -- settles when: Keith loads flesh.html in a fluid mode and the CFL field is missing, or reads NaN, or stays green while the flesh visibly explodes. The panel is also gated to S
- [ ] **A measurement with no front door is invisible** [v2580]  -- settles when: Keith loads it and the canvas does not draw, or the numbers differ from the gate's. The page also states its own limit where a visitor reads it -- 'One peak, on
- [ ] **A flag that lies is worse than no flag** [v2579]  -- settles when: Keith loads ?mesher=greedy and the model renders wrong, or renders identically to the default (which would mean the flag never took effect). Both are visible in
- [ ] **An uncertainty map belongs beside every reconstruction** [v2543]  -- settles when: Show a limited-angle reconstruction where the uncertainty map is flat -- i.e. the wedge constrains every pixel equally. Or show that a reader given map+image dr

## the rig (4)

_How: reproduce the kill condition on the rig._

- [ ] **A prior buys accuracy by spending auditability** [v2544]  -- settles when: Find any setup where a prior lowers RMS while ALSO lowering the error's shadow. That would be a prior buying accuracy for free, and this claim dies.
- [ ] **A Born-gated splat fit is a thing nobody has built** [v2534]  -- settles when: A single paper doing Born/Rytov-regime diffraction tomography with Gaussian primitives kills the novelty half outright. And even if novel, it dies if a Born-gat
- [ ] **Warp map: the shot noise was mine, not the universe's** [v2490]  -- settles when: If it still reads ~1.0 at the corrected density, the clustering is not doing what the gate claims.
- [ ] **The launcher race is closed** [v2514]  -- settles when: If an update still ends in code -1, the freshness window is wrong or something else is eating the flag.

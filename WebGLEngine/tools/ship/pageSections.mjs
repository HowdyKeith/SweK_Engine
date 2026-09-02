// WebGLEngine/tools/ship/pageSections.mjs
//
// v3227 -- WHICH PAGES LIVE BEHIND WHICH CHIP, IN ONE PLACE.
//
// *** MEASURED, NOT ASSUMED: ARRIVING PAGES HELD 96 OF THE TREE'S 315 PAGES. *** Its own comment calls it "a
// curated front for recent work, not a second directory" and says "when a page stops being recent it drops off
// here" -- and nothing ever had. A flat row of 96 is the pile v2513 built the section to prevent, arriving from
// the other side: not an inbox nobody fills, an inbox nobody empties.
//
// THE MECHANISM WAS ALREADY GENERIC AND NOBODY HAD USED IT FOR THIS. server.html pairs any
// `<button class="gtab" data-tab="X">` in #gaugeTabBar with `<div class="gpanel" data-panel="X">` and toggles
// the pair, so a chip that opens a drawer of related pages needs NO new JavaScript -- only a registry saying
// which pages belong to which chip, and a slot to put them in.
//
// *** THE RENDERER MOVES THE EXISTING ANCHOR, IT DOES NOT REBUILD IT. *** Every page here already has an <a> in
// the Arriving row carrying its label and its hand-written title. Recreating those from this file would put the
// text in two places and guarantee they drift -- the defect this session has found in nine files (MODES), three
// (the gate-file walk) and four (a mesher's liveness). Moving the node means ONE ASSIGNMENT, TWO CONSEQUENCES,
// AND NO SECOND EDIT: it appears in the panel because it left Arriving, not because somebody deleted a line.
//
// TEN PER PANEL IS KEITH'S LIMIT AND pageSections-selfcheck ENFORCES IT. A drawer of 25 is the flat row again
// with a lid on it.

export const SECTIONS = [
    // --- THE BIG PLAYERS. Keith: "roundhouse is part of the Physics Lab Roundhouse AI, a major component of the
    // main physics lab link, so they would be on the same panel together." One subject, one drawer.
    { id: "physicslab", tab: "physicslab", label: "Physics Lab", note: "the lab and the Roundhouse AI that drives it",
      // v3672 -- instrument-bench.html JOINS, and it is one of the THREE PAGES pageReach HAS NAMED AS INVISIBLE
      // FOR DOZENS OF ROUNDS. It belongs here by MECHANISM and not by name: it fetches /instruments/list and
      // /instruments/report, which is instruments.html's own pair, and it exists because 34 of 104 instruments
      // carried page: null -- runnable only by typing a selfcheck path. A FRONT DOOR THAT WAS ITSELF UNREACHABLE.
      // v4031 -- reactor.html JOINS, on the SAME PRECEDENT this section already records for
      // statistical-mechanics.html: an arc's FRONT DOOR belongs with the lab rather than in a drawer of its own.
      // Point reactor kinetics (reactivity, delayed precursors, xenon, scram) is the door onto the nuclear
      // modules, exactly as crystal-diffraction.html is the door onto the diffraction ones. cartpole.html joins
      // on the same reading: LQR/Riccati control, the door onto physics/control/cartPole.mjs, and NOT the GPU
      // Brain drawer the name suggests -- the page mentions no policy, no brain and no /ai/ route at all.
      pages: ["reactor.html", "cartpole.html",
              "physics-lab.html", "roundhouse.html", "device.html", "models.html", "gates.html",
              "instruments.html", "instrument-bench.html", "catalog.html", "lab-export.html",
              "run-inspector.html", "frugon.html",
              // v3818 -- THE STATISTICAL-MECHANICS DOOR BELONGS WITH THE LAB, not in a thermal drawer of its
              // own. It exists because seven graded modules had no way in at all, which is a LAB problem
              // rather than a physics-topic problem -- the same reasoning that put instrument-bench.html here.
              "statistical-mechanics.html",
              // v3818's reasoning, arriving a second time. structureFactor.mjs and powder.mjs were graded and
              // reachable only by typing a selfcheck path -- A LAB PROBLEM rather than a physics-topic problem,
              // so the door goes with the lab and not into a crystallography drawer of one.
              "crystal-diffraction.html"] },
    // v3328 -- SAMPLING & METHODS, named by Keith. Eleven instruments that are ABOUT HOW YOU MEASURE rather
    // than about a physical system -- samplers, Langevin, HMC benches, consistency, Binder budgets. They filled
    // cosmic, matter and systools to their ten-page cap at v3324 and sat in Arriving with a reason recorded,
    // because A PANEL IS ABOUT SOMETHING and cramming them into "matter" would have made that label a lie.
    //
    // *** IT IS ALSO A SUB-MENU OF THE PHYSICS LAB, WHICH IS THE PART THAT MATTERS. *** Keith: "they would want
    // to be also a sub menu in the physics lab main pane." A method instrument is not a sibling of the lab, it
    // is a VIEW OF THE LAB'S OWN MACHINERY -- so the section declares parentTab, and the lab pane shows it as a
    // drawer within itself rather than a fourteenth panel competing beside it.
    // v3329 -- NO tab OF ITS OWN. v3328 gave this a top-level chip and panel and that was the thing Keith was
    // asking to avoid: a THIRTEENTH BUTTON on a row already carrying twelve, to hold pages that belong to the
    // lab. The section still exists so the mover knows where these pages go -- but its SLOT lives inside the
    // physicslab panel, so the links appear as a group WITHIN the lab and each still opens its own page.
    { id: "sampling", tab: null, parentTab: "physicslab", label: "Sampling & Methods",
      note: "how you measure, rather than what you measure -- samplers, estimators and their answer keys",
      // v3674 -- live-panel.html JOINS, and this drawer's own note is why: "how you measure, rather than what you
      // measure -- samplers, estimators and their ANSWER KEYS". Both panels on that page are estimators carrying a
      // key the estimator is never told -- an FFT peak against the chain's ANALYTIC mode frequency, and dips in
      // |zeta(1/2+it)| against the PUBLISHED zeros. It is not filed under the physics it happens to draw
      // (vibrations, zeta) because what the page is FOR is showing that a panel reads the real computation.
      pages: ["samplers.html", "langevin.html", "diffusion.html", "kuramoto.html",
              "bayes-fit.html", "binder-budget.html", "consistency.html", "floor-atlas.html",
              // v3689 -- external-linalg.html is filed HERE, not under Mac System: this drawer is "how you
              // measure ... and their ANSWER KEYS", and an outside LAPACK reference is exactly an answer key.
              // Mac System lists it too, as a view -- the ownership claim is the one that decides the anchor.
              // v3693 -- ssim-compare.html joins Sampling & Methods for the same reason external-linalg did:
              // this drawer is "how you measure ... and their ANSWER KEYS", and the page's whole subject is that
              // TWO WHOLE-IMAGE NUMBERS CANNOT SEE A LOCAL DEFECT while the map can.
              // v3705 -- curriculum.html joins Sampling & Methods: the drawer is "how you measure ... and their
              // ANSWER KEYS", and this page's entire content is subjects paired with the gate that would decide
              // each one.
              "live-panel.html", "external-linalg.html", "ssim-compare.html", "curriculum.html"] },

    // --- the instruments, split three ways because 25 in one drawer is the flat row with a lid on it
    { id: "optics", tab: "optics", label: "PL: Optics & Imaging", note: "diffraction, interferometry, tomography, reconstruction",
      pages: ["fresnel.html", "fresnel-join.html", "diffraction.html", "interferometer.html", "ct.html", "fanbeam.html",
              "tomography.html", "sinogram-gpu.html", "kriging.html", "spatial-agreement.html", "splat-lab.html"] },
    { id: "cosmic", tab: "cosmic", label: "PL: Cosmic & Relativity", note: "black holes, orbits, lensing, special functions",
      // v4031 -- lensing.html and stellar.html JOIN, both by SUBJECT rather than by name. Gravitational
      // MICROLENSING is general relativity, so it sits with kerr/geodesic/pulsar and NOT with optics, whose
      // fresnel/diffraction/tomography pages are wave and imaging optics -- a page called "lensing" filed by its
      // name would have landed in exactly the wrong drawer. Lane-Emden POLYTROPES are stellar structure, the
      // same arc as kepler and pulsar.
      pages: ["lensing.html", "stellar.html",
              "kerr.html", "geodesic.html", "cosmic-map.html", "warp-map.html", "pulsar.html",
              "kepler.html", "meijer-g.html", "elliptic.html", "rmt.html", "landau-zener.html", "hmc.html"] },
    // v3633: THE 15-PAGE RATCHET FIRED AND IT WAS RIGHT. Five electromagnetism pages had been filed under
    // "Cosmic & Relativity" one round at a time -- each defensible on its own, and the drawer reached 16 while
    // its own note still said "black holes, orbits, lensing, special functions". THE COUNT WAS REPORTING A
    // TAXONOMY DRIFT, not a shortage of room, and widening the cap would have hidden exactly that. They have
    // their own drawer now; cosmic falls to 11 and reads like its note again.
    { id: "em", tab: "em", label: "PL: Electromagnetism", note: "fields, grids, boundaries, and what discretising them costs",
      pages: ["current-loop.html", "fdtd.html", "skin-depth.html", "grid-refinement.html", "regrid-cost.html"] },
    // v3644: THE 15-PAGE RATCHET FIRED AGAIN, AND AGAIN IT WAS REPORTING A TAXONOMY DRIFT RATHER THAN A SHORTAGE
    // OF ROOM -- the same thing it caught at v3633. Eleven pages about REMAPS, LIMITERS, GRADIENTS and MESH RANK
    // had accumulated in the Electromagnetism drawer one round at a time, each defensible because the arc started
    // in EM, while its own note still said "fields, grids, boundaries". NONE OF THEM IS ABOUT ELECTROMAGNETISM.
    // They have their own drawer; em falls to 5 and reads like its note again. SECOND TIME THIS RATCHET HAS
    // CAUGHT THE SAME DRIFT IN ELEVEN ROUNDS, WHICH IS THE ARGUMENT FOR KEEPING IT AT 15.
    { id: "discretise", tab: "discretise", label: "PL: Discretisation & Meshes", note: "remaps, limiters, and the gradients a mesh gives you",
      pages: ["remap-order.html", "remap-2d.html", "limiter-seam.html", "tri-limiter.html",
              "gradient-join.html", "node-gradient.html"] },
    // v3649: THE 15-PAGE RATCHET, THIRD TIME (v3633 EM out of Cosmic, v3644 meshes out of EM, now this). The
    // drawer reached sixteen and the split is a real subject boundary rather than a shelf being tidied: the six
    // above are about MOVING AND LIMITING DATA ON A MESH, and the ten below are about WHAT A BOUNDARY CAN AND
    // CANNOT TELL YOU -- rank, repairs, wall conditions, reconstruction order. THREE FIRES IN SEVENTEEN ROUNDS,
    // EACH ONE A DRIFT RATHER THAN A SHORTAGE OF ROOM, WHICH IS THE ARGUMENT FOR KEEPING THE CAP AT 15.
    { id: "boundaries", tab: "boundaries", label: "PL: Boundaries & Reconstruction", note: "what a boundary can and cannot determine, and what a row is worth",
      pages: ["boundary-rank.html", "tet-rank.html", "rank-repair.html", "rank-repair-3d.html",
              "discontinuity.html", "wall-condition.html", "curved-wall.html", "quadratic-recon.html",
              "quadratic-wall.html", "row-weight.html", "weight-scaling.html"] },
    // v3670 -- *** NEW SECTION, KEITH'S ASK: "anything ha/home assistant that is unsorted belongs under smart
    // home." MEMBERSHIP IS DERIVED BY MECHANISM, NOT BY NAME. *** A filename test would have taken ac.html and
    // wall.html (which never say "ha") and left out nothing useful; a STRING test for "homeassistant" took 28
    // pages including credits.html and ev.html, which merely LINK to one -- v3448's defect exactly, a prose
    // mention counting as a consumer. The test that holds is: DOES THE PAGE CALL A HOUSE ENDPOINT
    // (/ha, /doorbell, /arrival, /presence, /alexa, /shield, /nest, /solar). That is 25 unclaimed pages.
    //
    // THE SECOND CUT IS THE ONE THAT NEEDED JUDGEMENT AND IT IS REPORTED RATHER THAN HIDDEN: of those 25, the
    // share of each page's endpoints that are house endpoints separates them. phone.html reads 9 house
    // endpoints OUT OF 60 -- it is a dashboard that happens to show the house, not a house page -- and
    // index.html (2/5), hub.html (1/2), board.html (2/3), pipboy-models.html (3/28), clients.html, connect.html
    // and avatar-push.html are the same shape: they call /shield/exec or read a sensor while being about
    // something else. THOSE EIGHT ARE DELIBERATELY LEFT UNCLAIMED and the reason is here rather than in a
    // changelog nobody re-reads. The seventeen below are pages whose SUBJECT is the house.
    //
    // *** I TRIED TO SHIP THIS AT 17 OVER A CAP OF 15 AND THE GATE REFUSED, CORRECTLY, AND I HAD THE CAP WRONG.
    // *** I had it filed as a REVIEW TRIGGER that reports -- true of the over-cap CHIP on server.html, false of
    // this gate, which FAILS. Two things wearing one label, in my own notes. The seventeen came down to fifteen
    // by SUBJECT and not by convenience: shield-apps.html and shield-display.html are about the Nvidia Shield
    // as a DEVICE (install an APK, set a display) and are not Home Assistant, which is what Keith actually
    // asked for; they belong in System Tools if anywhere. THE CUT LANDING EXACTLY ON THE CAP IS WORTH
    // DISTRUSTING and is flagged rather than presented as a tidy result -- if the honest set is really 16, the
    // answer is a split or a raised cap WITH A MEASUREMENT, not a page quietly dropped to make this go green.
    //
    // AND THE DRAWER IS NOW FULL ON ITS FIRST DAY, so the next house page is a real decision rather than an
    // append. v3633/v3644/v3649 each found this cap reporting a SUBJECT DRIFT; this is the first time it has
    // reported a subject that is simply large.
    // v3689 -- *** "Mac System" IS A VIEW, NOT A SECOND CLAIM, AND THAT DISTINCTION IS THE WHOLE DESIGN. ***
    // Keith: a consolidated panel a Mac can go to, WITHOUT removing anything from where it already lives. Those
    // are different operations. The static `pages` list is an OWNERSHIP claim -- pageSections-selfcheck demands
    // an ANCHOR for the drawer to move, and an anchor can only be moved to one place, so listing raycast.html
    // here as well as in System Tools would fight over one element and one of the two drawers would lose it.
    // The placement layer supports topics[] as an ARRAY and would render a second copy happily, but every page
    // below is ALREADY claimed by a static section, which is the layer that moves.
    //
    // SO THIS DRAWER CARRIES NO pages AT ALL. It is rendered from macPages() into its own slot, building its own
    // anchors the way the Unsorted drawer does -- nothing is moved, nothing is un-claimed, and the pages keep
    // their existing homes exactly as asked.
    //
    // MEMBERSHIP IS BY WHAT A PAGE CALLS, NOT BY WHAT IT MENTIONS. A text scan for "mac|macos|Apple Silicon"
    // returned TEN pages including server.html and predictions.html, which merely DISCUSS a Mac -- v3448's
    // prose-mention defect, and the third time this session a name test has been wrong. The list is pages that
    // drive a Mac-side route or a .command launcher IN THEIR OWN SCRIPT, plus external-linalg.html, which is
    // Mac-only by construction (it needs clang and Accelerate).
    { id: "macsystem", tab: "macsystem", label: "Mac System",
      note: "everything that needs a Mac: the .command launchers, the Raycast peer, the tunnel, and the LAPACK key",
      pages: [] },

    { id: "smarthome", tab: "smarthome", label: "Smart Home", note: "Home Assistant, the Android TV Device, announcements and the house sensors",
      pages: ["home.html", "ha-switches.html", "ha-capabilities.html", "ha-diagram.html", "presence.html",
              "arrival.html", "doorbell.html", "alexa.html", "echo-show.html", "agenda.html",
              "air-quality.html", "nest-protect.html", "solar.html", "ac.html", "wall.html"] },
    // v4127 -- label renamed with the gtab in server.html, at Keith's ask, so the two declarations of this
    // section's NAME cannot disagree. The id and tab are untouched: they are the wiring, not the wording.
    { id: "matter", tab: "matter", label: "PL: Matter & Chaos", note: "statistical mechanics, quantum, dynamics",
      // v3669 -- phase-change.html joins "matter": melting, freezing, gasification and crystallisation are
      // statistical/thermal physics and this drawer's own note already says so. Matter goes to 14 of 15 --
      // AT THE CAP'S EDGE, and the next arrival here should be read as the ratchet asking whether a
      // "Phase & Thermal" drawer has arrived rather than as a shortage of room (v3633, v3644, v3649).
      // v4031 -- ecology.html JOINS: Lotka-Volterra is the DIRECT SIBLING of logistic.html already in this
      // drawer, both being the nonlinear-dynamics half of "Matter & Chaos".
      // cartpole.html was placed here FIRST and moved to physicslab when the 15-page drawer cap caught it at
      // 16 -- and the cap was right about more than the count. Rereading it against reactor.html, both are an
      // ARC'S FRONT DOOR (physics/control/cartPole.mjs, physics/nuclear/reactorControl.mjs) and both carry an
      // instruments.mjs row, which is the statistical-mechanics precedent rather than a mechanics page.
      pages: ["ecology.html",
              "phase-change.html", "angle-of-repose.html", "ising.html", "schrodinger.html", "logistic.html", "md-demo.html", "probe-lab.html",
              "discovery-lab.html", "kinematic.html", "physics-showcase.html", "percolation.html",
              "gravity-waves.html", "normal-modes.html", "torsion-modes.html"] },

    // --- Keith: "rig is a SweK System Tool. i am pretty sure that tests like 400 things." Not a verify page.
    { id: "systools", tab: "systools", label: "System Tools", note: "the rig, the ship ritual, the record",
      // v3823 -- raycast.html AND ascii-video.html LEAVE THIS DRAWER, back to Unsorted, at Keith's request:
      // "Ascii video, and raycast need to be moved out of System Tools and moved to swek engine unsorted."
      // They were filed here by what they drive (v3672 raycast: Detect/Install/Run over a Mac peer; v3775
      // ascii-video: a player-and-validator, not a renderer) -- kept in this note so the reasoning is not lost
      // -- but the ask overrides the taxonomy. Dropping them from `pages` un-claims them, and the Unsorted
      // drawer builds its own anchors from every unclaimed page, so they land there with no other change. Their
      // hover-link <a>s already exist in server.html for the mover to find.
      // v4031 -- webgpu-llm.html JOINS. It is NOT a physics page despite living beside them: it asks whether
      // THIS MACHINE can run a generative model in the browser (WebGPU adapter, storage quota, persistent-storage
      // permission), which is a question about the box rather than about the world -- the same kind rig.html and
      // settings.html answer. Filed by what it MEASURES, not by what it is about.
      // v4115 -- voxtral.html JOINS, filed by the same rule that put webgpu-llm.html here: it answers "what can
      // THIS BOX do" rather than showing a phenomenon. It is the opt-in front door to a 2.5 GB third-party
      // speech model running as WASM + WebGPU in the tab, and like its neighbour it is built so the expensive
      // facts land BEFORE the decision -- it downloads nothing on load, and says the 14x-slower-than-real-time
      // cost on screen before any button works.
      // v4118 -- webrtx.html JOINS, same rule again: it answers what THIS BOX can do (is there a secure origin,
      // is there WebGPU, will an acceleration structure build) rather than showing a phenomenon.
      // v4124 -- galaxy-profile.html JOINS, filed beside webrtx.html and voxtral.html for the same reason: it is
      // an opt-in front door to somebody else's work (vinimlo/galaxy-profile, GPL-3.0), installed and run on
      // this machine rather than vendored into the tree, with the licence and attribution surfaced on the page.
      // v4125 -- ntfs-mounter.html JOINS, same rule again: an opt-in install button for zavierferodova/Mac-NTFS-
      // Mounter (no licence file at all). It ALSO appears in the Mac System view (pagePlacements.mjs's
      // macPages()) because diskutil/MacFUSE make it Mac-only by construction -- that is a VIEW, not a second
      // home, so this is still the one place it is actually filed.
      // v4138 -- grdpwasm.html JOINS the same shelf: an opt-in install button for nakagami/grdpwasm (GPL-3.0),
      // an in-browser RDP client. Filed here for the same reason as its three neighbours -- somebody else's
      // work, installed and run on this machine rather than vendored, with licence and attribution on the page.
      // Its page carries one thing the others do not: WHY it is started on loopback, because upstream's proxy
      // binds all interfaces, accepts any origin and dials any host:port a caller names.
      // v4143 -- vpi.html JOINS: an opt-in install button for schildep/verified-polygon-intersection (MIT), a
      // Lean4-formally-verified multipolygon intersection demo compiled to WASM. Lowest-risk of the shelf --
      // four static files fetched and served, no build, no subprocess, no port of its own, so its page carries
      // no bind-address warning; what it carries instead is why the WASM works without upstream's service
      // worker (this server sets the real COOP/COEP headers GitHub Pages can't).
      // *** v4138 -- FIVE OF THESE MOVED OUT, INTO THE SUB-DRAWER BELOW, AND THE COMMENTS ABOVE ARE WHY. ***
      // v4115, v4118, v4124 and v4125 each wrote "JOINS, same rule again" about a page that is an opt-in front
      // door to SOMEBODY ELSE'S work. Four notes saying one sentence is a category the file kept documenting
      // without ever creating. Adding grdpwasm made this drawer 17 -- but it was ALREADY 16 against its own cap
      // of 15 before that, so this is not a cap bent to fit a new page: it is a pre-existing overflow with an
      // obvious seam through it. webgpu-llm.html STAYS -- it asks what THIS BOX can do, which is rig.html's
      // question, not "shall I install somebody's repo".
      pages: ["webgpu-llm.html",
              "rig.html", "tools.html", "ship.html", "changelog.html", "module-history.html",
              "page-index.html", "case-study.html", "gate-plan.html", "method-lab.html",
              // v3813 -- settings.html JOINS, closing an issue open since v3809. Keith: "we need to add this
              // page to the sort list ... most of the settings are connected to other things." It had a TOOLBAR
              // link only -- above the Arriving header, so the mover could not take it and the drawer would have
              // rendered empty (the page-index.html toolbar trap this gate already records). An Arriving anchor
              // was added in server.html so there is an <a> to move. FILED BY WHAT IT DRIVES: its controls POST to
              // the engine, cloud, tunnel, brain and hosting subsystems -- operating the rig, which is this
              // drawer's note, not a physical subject of its own.
              "settings.html",
              // v3967 -- node-bun.html JOINS. Keith: "In System Tools on Server.html lets have a page called
              // 'Node / Bun' with the assessment." FILED BY WHAT IT DRIVES, which is this drawer's rule: it
              // reads /runtime, writes the use_bun.flag preference, and spawns tools/ship/bunSurface.mjs under
              // each runtime -- operating the rig, not a physical subject. runtimes.html stays where it is and
              // this page links to it; that one is the FLEET picker (every service, every box), this one is the
              // assessment of the two runtimes on THIS box, and merging them would make one page answer two
              // questions.
              "node-bun.html"] },

    // v3229 -- sphere-impostor and raymarch-live MOVED HERE OUT OF THE RENDER QA DRAWER. They are not QA
    // TOOLING, they are two of the 315 SUBJECTS render-qa opens, and filing them beside the QA control surface
    // implied they were special when they were only the two I happened to be looking at. They belong beside
    // ray-march-demo and raymarch-gl-demo, which were already here.
    // codemap and wallpaper came OUT to make room: a code-city visualisation and a desktop wallpaper engine are
    // the weakest fits in a voxel/render PIPELINE drawer, and ten is the limit.
    // v4138 -- THE CATEGORY systools KEPT WRITING NOTES ABOUT. Every page here is a front door to a repo this
    // engine did not write, installed and run on the user's own machine rather than vendored into the tree --
    // which is a licensing position (voxtral Apache-2.0, galaxy-profile and grdpwasm GPL-3.0, Mac-NTFS-Mounter
    // no licence file at all) as much as a taxonomy. Grouping them puts the attribution in one place instead of
    // four, and takes System Tools back under the cap it had already outgrown.
    //
    // A SUB-DRAWER, NOT A TOP-LEVEL CHIP: these ARE System Tools, and a chip of their own would claim they are
    // a peer of the rig and the ship ritual. It also needs ONE data-panel-pages slot rather than a gtab, a
    // gpanel and a slot -- and v4127 is on record that gtab wiring is where this row breaks.
    { id: "thirdparty", tab: null, parentTab: "systools", label: "Opt-in: somebody else's work",
      note: "install buttons for repos this engine did not write -- cloned and run on your machine, never vendored",
      pages: ["voxtral.html", "webrtx.html", "galaxy-profile.html", "ntfs-mounter.html", "grdpwasm.html", "vpi.html",
              // v4144 -- ws-scrcpy.html JOINS: an opt-in install button for NetrisTV/ws-scrcpy (MIT), browser-
              // based Android screen mirroring and control. Filed here for the same reason as its neighbours.
              // *** IT IS THE ONE ON THIS SHELF WHOSE EXPOSURE CANNOT BE NARROWED FROM OUTSIDE: *** grdpwasm's
              // proxy took a -listen flag this engine could point at loopback using upstream's own mechanism;
              // ws-scrcpy calls server.listen(port, cb) with no host argument and ships no auth at all, so the
              // page states the exposure and confirms before every start instead of running a patched fork.
              "ws-scrcpy.html"] },

    // *** v4321 -- "Voxel & Render" IS TWO DRAWERS WEARING ONE NAME, AND THE AMPERSAND WAS THE TELL. ***
    // Keith: "let's separate Voxel & Render into a Voxels button and a Renders button." A label with an "&" in
    // it is a drawer that could not decide, and this one had been at 14 of 15 for rounds WHILE NINE PAGES
    // WAITED FOR A RENDER PANEL -- the last slot could place one of nine, chosen arbitrarily, which is why
    // nothing ever took it. Naming the panel is what places them.
    //
    // *** SPLIT BY MACHINERY READ FROM THE IMPORTS, NOT BY THE WORD IN THE FILENAME. *** All fourteen were
    // opened and their module imports listed before a single page was moved:
    //
    //   voxels   voxel-viewer (mesh/voxelMeshGreedy), rle-mesh-demo (voxel/rleMesh + rleRenderMesh +
    //            rleWorldBridge), ray-march-demo (voxel/voxelDDA), raymarch-live (voxel/rleRegionVolume +
    //            rleVolumeCache + rleWorldBridge), volume-cache (voxel/rleBrickMap + rleVolumeCache +
    //            rleWorldBridge + voxelRLE), raymarch-gl-demo (render/voxelRaymarchPass)
    //   renders  path-tracer (render/microfacetShader), pom-demo (render/parallaxOcclusion), krbn
    //            (render/gifRecorder + vendor/krbn), amplified-diff (tools/render-qa), sphere-impostor and
    //            backend-dom (no module imports -- an impostor technique and a DOM-vs-WebGL2 comparison)
    //
    // *** raymarch-gl-demo IS THE ONE THAT HAD TO BE ARGUED RATHER THAN READ. *** Its only import is a RENDER
    // pass -- and that pass is render/voxelRaymarchPass, whose entire subject is voxel data, shared with
    // raymarch-live and volume-cache which are voxel-heavy beyond doubt. Filed with the volume it marches
    // THROUGH rather than the technique it marches BY, and the reason is written down because the next reader
    // will wonder and would otherwise re-litigate it.
    { id: "voxels", tab: "voxels", label: "Voxels", note: "the DATA: storage, meshing and traversal of voxel volumes",
      pages: ["voxel-viewer.html", "rle-mesh-demo.html", "ray-march-demo.html",
              "raymarch-gl-demo.html", "raymarch-live.html", "volume-cache.html"] },
    // *** AND THE POINT OF THE SPLIT IS THE SEVEN PAGES THIS DRAWER CAN NOW HOLD. *** Six render/fx pages have
    // been UNPLACED since v4314 with the reason "Voxel & Render is at 14 of 15, so ONE could go in and five
    // could not, and picking which one would be arbitrary". That sentence is spent: they are in.
    { id: "renders", tab: "renders", label: "Renders", note: "the TECHNIQUE: passes, effects, and how a frame is made",
      pages: ["path-tracer.html", "pom-demo.html", "sphere-impostor.html", "krbn.html", "amplified-diff.html",
              "backend-dom.html",
              // the six that were waiting -- every one render/* or fx/* by import, see UNPLACED's v4314 note
              "aquarelle.html", "camera-effects.html", "doom-fire.html", "mesh-line.html",
              "primitive-paint.html", "proc-brush.html",
              // and v4313's shader page, which is a render pass over a Krbn drawing
              "krbn-lyapunov.html"] },
    // v3252 -- amplified-diff joins the render drawer and krbn-compare moves to Arriving: TEN IS THE LIMIT and
    // a comparison tool belongs beside the things it compares. krbn-compare is a SUBJECT comparison; this is the
    // instrument, and Keith can swap them back in one line if that reads wrong on the rig.

    // --- Keith: "ragdoll is box3d rigged character integration."
    { id: "box3d", tab: "box3d", label: "Box3D & Cross-Arch", note: "deterministic simulation, replay, and reproducing it on other machines",
      // v3434 -- Cross-Arch merges in at SEVEN. Both panels were about ONE question -- does the same input give
      // the same answer -- and they differed only in whether the second run is a replay or a different CPU.
      // Keith can split them again in one line if that reads wrong on the rig (v3252's precedent).
      // v3672 -- box3d-contacts.html JOINS, the third and last of pageReach's named invisible pages. It imports
      // physics/box3d/box3dLoader.js, so it is a box3d surface by MECHANISM; its own title says what it is for
      // ("the overlay, and what it may claim"), which is this drawer's question about a solver's own output.
      pages: ["box3d-replay.html", "box3d-info.html", "box3d-contacts.html", "ragdoll.html",
              "magmap-android.html", "fingerprint.html", "benchmarks.html", "fleet-bench.html"] },

    { id: "blobs", tab: "blobs", label: "Blobs", note: "the authoring surface and the aquarium",
      pages: ["blob-studio.html", "blobarium.html", "blobulator.html"] },

    { id: "face", tab: "face", label: "Face & Population", note: "landmarks, the mirror, the GPU population field",
      // v4110 -- cat-reactions.html joins the drawer that already holds face-mirror.html. It is the front door
      // for ui/faceExpressionSet.js (the named-expression classifier), and the mirror is the OTHER consumer of
      // the same camera and the same blendshapes -- filing it anywhere else would put two readings of one face
      // behind different chips.
      // v4111 -- gesture-vfx.html joins the same drawer. It reads the HAND tracker rather than the face one,
      // but MediaPipeHandTracker.js is explicitly "the hand sibling of MediaPipeFaceTracker" and mirrors its
      // API exactly -- so this is the landmark-tracking drawer, and filing the hand reading away from the face
      // readings would split one subject across two chips for no reason a reader would guess.
      pages: ["face-mirror.html", "population.html", "cat-reactions.html", "gesture-vfx.html"] },

    // v3230 -- PetFBI: a real project inside the engine with three pages and no drawer. It is also the example
    // Keith reached for when describing a TAILORED FRONT DOOR -- "a PetFBI person who posts lost pets on
    // Facebook would go to their server.html and only see the petfbi options".
    { id: "petfbi", tab: "petfbi", label: "PetFBI", note: "lost-pet boards, setup, and the posting flow",
      pages: ["petfbi.html", "petfbi-board.html", "petfbi-setup.html"] },

    // --- appended to panels that ALREADY EXIST. Keith offered to rename a chip if appending were impossible;
    // it is not impossible, so the live gauges and the related pages share one drawer instead of two chips that
    // both mean the same thing.
    { id: "brain", tab: "brain", label: "GPU Brain", note: "appended to the existing panel",
      pages: ["panel-brain.html", "brain-bench.html", "brain-replay.html", "agent-arena.html", "fleet-arena.html",
              "policy-mass.html",
              // v4314 -- drive-brain.html, and it is the ONLY one of the twelve born-invisible pages placed in
              // a drawer, because it is the only one MACHINERY settles without a judgement: it imports
              // brain/rl/dockPolicy.js and brain/rl/driveEnv.js and nothing else. This drawer is now at
              // MAX_PER_PANEL, which is why primitive-paint.html is NOT here -- its commit was titled "the GPU
              // Brain paints" and it imports fx/primitiveFit.mjs and no brain module at all. THE TITLE WOULD
              // HAVE PUT IT IN THIS DRAWER AND THE IMPORTS SAY OTHERWISE, which is this file's own rule
              // (group by machinery, not by subject -- "the keyword probe that has misled this project three
              // times") arriving as a live case rather than as a warning.
              "drive-brain.html",
              // *** v3927 -- EIGHT BRAIN PAGES WERE LINKED FROM server.html AND FILED NOWHERE. ***
              // registerResidue has been red since before v3904, saying 52 pages are linked but appear in
              // neither a section nor UNPLACED -- and nobody saw it, because that gate had never been timed and
              // so nothing ran it. UNPLACED's own rule is that "an unplaced page and a page nobody has got to
              // look identical, and the second one gets placed by a guess", so these were CHECKED BY TITLE
              // rather than by filename: "AI Brain (VBA bridge)", "GPU Brain 3D", "GPU Brain Fleet - Training
              // Pool", "Brain Lab", "Brain Maze (the GPU Brain solves an obstacle room)", "Brain Quadrants (one
              // GPU pass, many regions)", "Brain Room - a clean 3D test world", "GPU Brain: Learn to Dock".
              // Every one is the GPU Brain doing something; none needed a guess. Six plus eight is fourteen,
              // inside MAX_PER_PANEL.
              "aibrain.html", "brain-3d.html", "brain-fleet.html", "brain-lab.html", "brain-maze.html",
              "brain-quadrants.html", "brain-room.html", "dock-brain.html"] },
    // v3434 -- "Policy Mass" was one page and RL policy work IS brain work; it joins GPU Brain at six.
    // Keith: "celltrack is a big button item, it is it's own very large science project." NOTHING ELSE IN HERE.
    { id: "celltrack", tab: "celltrack", label: "Cell Tracking", note: "appended -- its own project, on purpose",
      pages: ["celltrack.html"] },
    // v4127 -- renamed with its gtab, same reason as "matter" above.
    { id: "fluidgpu", tab: "fluidgpu", label: "PL: Fluids", note: "appended",
      // v3927 -- three more lattice-Boltzmann pages join, same round and same reason as the brain eight:
      // "Lattice Boltzmann", "Duct" and "GPU adjudicator". lbm3d-gpu.html was ALREADY here and
      // lbm3d-gpu-check.html is the *-gpu-check pattern this drawer already holds twice (euler, mpm), so the
      // subject is not in doubt. Nine plus three is twelve, inside MAX_PER_PANEL.
      pages: ["lbm-fluid.html", "lbm3d-flow.html", "lbm3d-gpu-check.html",
              "lbm3d-gpu.html", "euler-gpu-check.html", "fluid-selfie.html", "wind-tunnel.html",
              "multigrid.html", "couple.html",
              // v3795 -- mpm.html JOINS. Filed with the other solvers rather than in a physics-lab drawer
              // because it is A SOLVER RUNNING, not an instrument reporting: it draws the same loop
              // physics/mpm/step.mjs runs and the gates grade, and re-implements none of it.
              "mpm.html",
              // v3809 -- THE GPU PAIR JOINS THE SAME DRAWER AS THE CPU PAGE, not a GPU drawer of its own.
              // mpm-gpu.html runs the SAME graded loop mpm.html runs, and mpm-gpu-check.html is to it what
              // euler-gpu-check.html (already here) is to its kernel. Filing the kernel away from the loop it
              // reimplements would put the two halves of one claim behind different chips.
              "mpm-gpu.html", "mpm-gpu-check.html"] },
    // v3434 -- "Cross-Arch" merged into Box3D above.
    // v4109 -- label renamed to "File Transfer Utils" (id/tab stay "nearshare" -- see server.html's tab button
    // for why). Keith: "NearShare is an app, that button could rename to File Transfer Utils, and both could
    // be in there" -- referring to pairlane.html, added to pages[] below in the same round.
    // v4211 -- RENAMED "Peer 2 Peer", and the two torrent pages JOIN. Keith: "I think we have a file transfer
    // button, and that would be better served as a 'Peer 2 Peer' button and we can put the p2p options in that
    // panel. nearshare maybe. We have a torrent re-skin app with voxels i think." He is right that it exists:
    // torrents.html is "Torrents -- Voxel View" ("each tower is a download, lit cubes are progress, color is
    // state, glow is speed"), driven by ai-bridge/biglybtBridge.js, and webtorrent.html is its browser-side
    // sibling on ai-bridge/webtorrentBridge.js.
    // *** BOTH WERE IN NO PANEL AT ALL. *** Measured: every other page named here resolves to this section,
    // and those two resolved to none -- present in the GENERATED indexes (launch-index.json, page-index.json)
    // and so not "orphans" by orphanScan's definition, but absent from the console's own grouping, which is
    // how a person actually finds a page. That is the v3011 defect one level up ("shipping a module nobody can
    // reach") in its subtler form: reachable by URL, unreachable by browsing.
    // The label is the honest one now. v4109 already conceded "this one's own header text is narrower than its
    // real membership" and deferred the regroup as "a bigger reorg ... that nobody has asked for yet"; the ask
    // has arrived, so the deferral ends. THE id AND tab STAY "nearshare" -- see server.html's tab button.
    { id: "nearshare", tab: "nearshare", label: "Peer 2 Peer", note: "appended",
      // v4109 -- pairlane.html JOINS. Keith: "pairlane should also show up under a File Transfer panel. or a
      // more general panel too, but i dont know which." There is no dedicated File Transfer panel -- this one's
      // own header text is narrower than its real membership (Quick Share / Nearby Sharing specifically), but
      // its PAGES are already the LAN-peer/transfer cluster (android-invite, remote-desktop, lan, sync-probe),
      // which is the closer match than any topic drawer. A dedicated panel is a bigger reorg (regrouping
      // webtorrent/copyparty/the trusted-peer transfer too) that nobody has asked for yet; this is the minimal,
      // honest placement today.
      pages: ["android-invite.html", "remote-desktop.html", "lan.html", "sync-probe.html", "pairlane.html",
              // v4211 -- the two BitTorrent front doors, which belonged to no panel before this round.
              "torrents.html", "webtorrent.html"] },
    // v3434 -- the one-page "Terrain WASM" panel is GONE and biome-map-demo.html joined Voxel & Render.
    // Procedural terrain generation is meshing and rendering; a panel holding ONE page was a heading, not a group.

    // v4039 -- THREE MORE "appended to panels that ALREADY EXIST" entries, all from one round of Keith sorting
    // the alphabetical holding panels into real homes. "endlesssky" and "ev" are the SAME data-tab ids CHIP_GROUPS
    // already lifts into the Game Theory panel below -- exactly the systools/brain precedent above ("the systools
    // chip already exists and already holds the system-tool PAGES, so the group and the drawer are the same
    // chip"), applied to the two game-engine chips instead of one system-tool chip.
    { id: "endlesssky", tab: "endlesssky", label: "Game: Endless Sky", note: "appended to the existing chip -- renamed \"Game: Endless Sky\" per Keith's ask",
      pages: ["endless-sky.html", "es-away-mission.html", "es-box3d-3d.html", "es-box3d-fly3d.html", "es-box3d.html", "flight-gpu.html"] },
    { id: "ev", tab: "ev", label: "Game: Escape Velocity", note: "appended to the existing chip -- renamed \"Game: Escape Velocity\" per Keith's ask",
      pages: ["es-hull-combat.html", "ev-admin.html", "ev-loader.html", "ev-mission-creator.html", "ev-sprites.html", "ev.html"] },
    // Keith: "this W item on server.html should be in Game Theory" (the alphabetical holding panel these eleven
    // pages had fallen into) -- eleven pages that ARE game-adjacent (a game engine's companion tools, three
    // arcade demos, three Pip-Boy/Fallout surfaces, an EVE page, and the FPS bridge pair) but have no chip of
    // their own to be lifted by CHIP_GROUPS. Game Theory's own gpanel already carries BOTH a chip row
    // (data-group-chips) and, now, a plain page-mover row (data-panel-pages) for exactly this case -- pages that
    // belong under the subject without being a whole second panel each.
    { id: "gametheory", tab: "gametheory", label: "Game Theory", note: "appended -- pages with no chip of their own",
      pages: ["wadmap.html", "uvtt.html", "skyrim.html", "slotmachine.html", "pachinko.html", "pipboy-models.html",
              "fallout.html", "flight.html", "fpscontrol.html", "fpsmirror.html", "eve.html"] },
];

/** Keith's rule. A drawer of 25 is the flat row again with a lid on it. */
// v3434 -- KEITH'S RULE, RAISED FROM TEN: "allow the panel to grow past 10, but when it reaches the 15th item,
// that is when we need to consider a new panel." TEN WAS TOO TIGHT AND THE EVIDENCE WAS EIGHTEEN PANELS, FIVE OF
// THEM HOLDING THREE PAGES OR FEWER -- a cap that forces a new drawer per stray page trades one flat row for a
// flat row of drawers. Fifteen is the point at which a panel stops being readable at a glance, and the rule is
// RETROACTIVE: panels that fit under another heading and stay at or under fourteen when merged should merge.
export const MAX_PER_PANEL = 15;

/**
 * Pages DELIBERATELY LEFT IN ARRIVING, with the reason -- because an unplaced page and a page nobody has got to
 * look identical, and the second one gets placed by a guess.
 */
export const UNPLACED = new Map([
    // *** v4314 -- ELEVEN OF THE TWELVE PAGES pageReach CALLED BORN-INVISIBLE, PLUS ONE OF MY OWN. ***
    //
    // They are linked from server.html now, which is what pageReach was asking for. They are ALSO here,
    // because registerResidue asks a second question pageReach does not: a page that is linked but in neither
    // a section nor this map is RESIDUE -- "an unplaced page and a page nobody got to look identical, and the
    // second one gets placed by a guess". Linking twelve pages and filing none would have moved that gate from
    // 46 to 58 while turning pageReach green, which is trading one register against another.
    //
    // *** THEY DO NOT LACK A HOME BECAUSE NOBODY LOOKED. THEY LACK A DRAWER THAT EXISTS. *** Read by
    // machinery rather than by title, the twelve fall into four groups:
    //
    //     render / fx passes   6   *** PLACED AT v4321 INTO THE NEW "Renders" DRAWER. *** This entry read
    //                          "Voxel & Render holds 14 of 15, so ONE could go in and five could not, and
    //                          picking which one would be arbitrary." That was true, and it was a description
    //                          of a MISSING PANEL rather than of six awkward pages. Splitting the drawer
    //                          placed all six at once.
    //     audio                sfx, spellbook -- audio/sfxModel.mjs and audio/sfxPlay.js. THERE IS NO AUDIO
    //                          DRAWER. This tree has 24 sections and not one of them is about sound.
    //     ui                   odometer -- ui/odometer.js. No UI drawer either.
    //     geometry / scene     destructible (physics/mesh/meshCSG.mjs), scene-view (three GLTFLoader)
    //
    // Naming a drawer decides what a panel is ABOUT rather than merely where things go, and this file already
    // records that as Keith's call ("THE RATCHET IS SUPPOSED TO GO DOWN AGAIN when a new section is named --
    // and naming it is Keith's call"). So the twelve are linked, findable, and each says what it is waiting
    // for, which is a different state from unexamined.
    ["sfx.html", "audio/sfxModel.mjs -- THERE IS NO AUDIO DRAWER IN THIS TREE. Twenty-four sections and none of them is about sound, which is a gap a placement cannot close"],
    ["spellbook.html", "world/spellBook.mjs over physics/voxel/fracture.js and audio/sfxPlay.js -- it spans world, physics and audio, so any single drawer would be a third of the answer"],
    ["odometer.html", "ui/odometer.js -- a DOM/CSS widget, not a canvas page. There is no UI drawer, and it is the only page of its kind so far, which is not yet a panel"],
    ["destructible.html", "physics/mesh/meshCSG.mjs. csg.html sits in Voxel & Render and this would join it, but that drawer is at 14 of 15 and five other v4314 pages have an equal claim on the last slot"],
    ["scene-view.html", "three's GLTFLoader and OrbitControls -- a scene VIEWER rather than a render technique. Voxel & Render is the near fit and it has one slot; see the note above about why nothing took it"],
    // *** AND ONE THAT IS MINE. *** krbn-lyapunov.html was linked at v4313 and filed nowhere, so it entered
    // registerResidue's list in the same round it left pageReach's. THE GATE THAT WOULD HAVE CAUGHT IT WAS
    // ALREADY RED, which is how a red gate stops being a gate: nothing distinguishes 45 from 46.
    // *** v4321 -- TWO PAGES CAME OUT OF THE SPLIT DRAWER, AND SAYING WHY IS THE POINT OF SAYING ANYTHING. ***
    // csg and biome-map-demo were in "Voxel & Render" and are neither: csg imports physics/mesh (BSP mesh
    // booleans) and biome-map-demo imports world/worleyBiomes (procedural world generation). THE AMPERSAND WAS
    // CARRYING THEM -- a label broad enough to hold anything hides what it is holding -- and splitting the
    // drawer is what exposed them. Filing them into whichever half had room would have been the same evasion
    // in a narrower drawer, and the drawer count would have looked better for it.
    //
    // *** AND csg IS NOT ALONE: destructible.html HAS BEEN WAITING SINCE v4314 ON THE IDENTICAL IMPORT. ***
    // Two pages, one machinery (physics/mesh/meshCSG.mjs), no drawer -- which is now a costed argument for a
    // Geometry panel rather than a shrug, exactly as the render group's six were before this round.
    ["csg.html", "BSP mesh booleans (physics/mesh) -- came OUT of Voxel & Render at the v4321 split because it is neither half. destructible.html waits on the SAME import: two pages, one machinery, and the drawer that would hold both does not exist"],
    ["biome-map-demo.html", "world/worleyBiomes -- procedural world generation, not a voxel format and not a render technique. Came OUT of Voxel & Render at the v4321 split rather than being filed in whichever half happened to have room"],
    // *** v4315 -- THREE MORE FROM main's v4299-v4300, AND THEY MAKE THE RENDER-PANEL CASE CONCRETE. ***
    // All three import render/gpuDriven.mjs and gfx/device.js: they are the GPU-driven rendering path, one
    // coherent group of work. Voxel & Render still holds 14 of 15, so ONE of the three could go in and two
    // could not -- the identical arithmetic that left v4314's six render/fx pages here.
    //
    // WHICH IS NOW A NUMBER RATHER THAN A COMPLAINT: 6 render/fx + 3 GPU-driven = NINE PAGES waiting on one
    // decision. Naming a render panel would place nine; the last slot in Voxel & Render places one, chosen
    // arbitrarily from nine. That is the whole argument, and it is Keith's call because naming a drawer
    // decides what a panel is ABOUT.
    //
    // orrery-gpu is the one that would tempt a subject-based filing -- PL: Cosmic & Relativity has room for
    // two. ITS MACHINERY IS THE COMPUTE PASS, NOT THE ASTRONOMY: it is in the tree to show orbits placed by
    // three dispatches, and its own title says "on the GPU". Filed by machinery, like primitive-paint.
    ["gpu-rig-check.html", "the GPU-driven path's own instrument: which backend and route this box got, the cull/LOD/draw counts, and a readback against the offscreen twin. Part of the nine-page render group with no drawer"],
    ["orrery-gpu.html", "render/gpuOrbits.mjs -- orbital elements to instance records in a compute pass. Cosmic & Relativity has room and would be a SUBJECT filing; the machinery is gpuDriven, so it waits with the render group"],
    ["universe-gpu.html", "render/gpuHaul.mjs over 694 systems and 300 haulers -- a flight integrated on the GPU because a still world makes position a function of the clock alone. Same render group, same missing drawer"],

    // *** v3358 -- PARKED IN ARRIVING DELIBERATELY, BECAUSE THEY OWE A MEASUREMENT NOBODY BUT KEITH CAN GIVE. ***
    // These four were filed in drawers, which is where a page goes when it is FINISHED. They are not finished:
    // each exists to produce a report from real hardware and none ever has (deviceOwed.mjs: received kinds NONE).
    // A drawer is where a page goes to be found once; Arriving is where it stays until somebody acts on it, and
    // that is the correct shelf for a page holding an open obligation. Each moves to a drawer the day its verdict
    // lands, and `node tools/render-qa/deviceOwed.mjs` prints which are still outstanding.
    ["hmc-bench.html", "OWES A DEVICE VERDICT (swek-hmc-bench): the WGSL leapfrog kernel graded against the CPU mirror at a measured f32 floor. Needs one real-GPU run; no verdict has ever arrived"],
    ["ising-bench.html", "OWES A DEVICE VERDICT (swek-ising-bench): the Philox checkerboard kernel at ZERO tolerance -- bit-exact or rejected, no margin to interpret. Needs one real-GPU run"],
    ["magmap-bench.html", "OWES A DEVICE VERDICT (swek-magmap-bench): the magnetostatics kernel against its float-gap floor. Needs one real-GPU run"],
    ["consistency-fleet.html", "OWES A DEVICE VERDICT (swek-consistency-route): one side of a consistency-board pair, run on a peer. The board cannot assemble a cross-machine pair until at least one arrives"],

    ["predict.html", "Keith: 'i assume predictions are physics labs items, if we are not sure they can stay in Arriving Pages and I will move those later.' NOT SURE -- these read as project-record pages rather than instruments"],
    ["predictions.html", "same: an open-predictions record, which is a different kind of thing from a lab device"],
    ["mc-flesh.html", "pulled OUT of celltrack: Keith says celltrack is its own large project and nothing else belongs in it. Grouping by subject rather than by machinery would have been a guess"],
    ["flesh.html", "pulled out of celltrack for the same reason -- Keith: 'i forget the other too right now', so placing it would be my guess and not his"],
    ["paramecium.html", "pulled out of celltrack for the same reason: a single-celled organism is celltrack's SUBJECT, not its machinery, and the gate rejected 'same' as a reason because a one-word note is how a decision becomes a shrug"],
    ["economy.html", "the spaceprojectsim economy probe: it belongs with a simulator that is not part of this tree"],
    ["join.html", "the fleet invite page -- it is a DOOR for somebody else, not a page of this project's own"],
    ["panel-gauge.html", "a panel fragment rather than a destination"],
    ["krbn-compare.html", "displaced from Voxel & Render at v3252 to keep that drawer at ten when amplified-diff.html joined it -- a subject comparison rather than an instrument, and Keith can swap them back in one line"],
    ["verify.html", "Keith: 'i am betting those last 3 pages are probably physics... i will look at those visually'. I had filed it under Rig Verify by NAME, and rig.html -- the system tool that runs about four hundred tests -- is in System Tools, so the chip and the page were never the same subject"],
    ["trace-truth.html", "same trio: probably a physics page rather than a rig-verification surface, and Keith will judge it on sight now that moving one is a one-line edit"],
    ["physics-verified.html", "same trio -- and the name says physics louder than it says verify"],
    ["codemap.html", "came OUT of Voxel & Render to make room: a code-city visualisation is not part of a voxel/render pipeline, and ten is the limit"],
    ["wallpaper.html", "came OUT of Voxel & Render for the same reason: a desktop wallpaper engine shares a renderer with that drawer and not a subject"],
]);

/** Every page claimed by a section, flat. Arriving keeps what is NOT in here. */
export function claimedPages() {
    const out = new Set();
    for (const s of SECTIONS) for (const p of s.pages) out.add(p);
    return out;
}

/** The shape an export hands back: flat, readable, and editable by a person in a text box. */
export function toJSON() {
    return { version: 1, maxPerPanel: MAX_PER_PANEL,
             sections: SECTIONS.map((s) => ({ id: s.id, tab: s.tab, label: s.label, note: s.note, pages: s.pages.slice() })) };
}

/**
 * v3230 -- PROFILES: A TAILORED FRONT DOOR.
 *
 * Keith: "we shipped a version that only showed a certain set... a PetFBI person who posts lost pets on
 * Facebook would go to their server.html and only see the petfbi options. we have all the rest of the pages
 * complete and their functions already in the SweK Engine."
 *
 * A profile NAMES SECTIONS. It does not copy them, and it does not carry pages of its own -- a profile that
 * listed pages would be a third declaration of which page lives where, after the drawers and the page index,
 * and this session has watched that go wrong in nine files, three, four, and 59 of 82.
 *
 * *** A PROFILE IS A FILTER, NOT A PERMISSION, AND SAYING SO IS LOAD-BEARING. *** Hiding a chip does not remove
 * the page from the build, unlink the route, or stop anybody typing the URL. Every page still ships and still
 * works. If somebody ever needs a front door that genuinely WITHHOLDS something, that is a different mechanism
 * with a different name -- and the moment this one is mistaken for it is the moment it becomes dangerous.
 *
 * THE DEFAULT IS EVERY SECTION. An absent or unknown profile shows the whole engine, because a typo in a config
 * file must not silently hide two thirds of the front door.
 */
export const PROFILES = new Map([
    ["petfbi", { label: "PetFBI", sections: ["petfbi", "systools"],
                 note: "the lost-pet workflow plus the system tools needed to run the box it lives on" }],
    ["physics", { label: "Physics", sections: ["physicslab", "optics", "cosmic", "matter", "fluidgpu", "box3d"],
                  note: "the lab, the instruments and the solvers -- nothing about peers, ships or desktops" }],
    ["fleet", { label: "Fleet", sections: ["box3d", "nearshare", "systools", "brain"],
                note: "the machines and what runs on them" }],
]);

/** The sections a profile shows. An unknown or absent profile shows EVERYTHING, deliberately. */
export function sectionsFor(profile) {
    const p = PROFILES.get(String(profile || ""));
    if (!p) return SECTIONS.slice();
    return SECTIONS.filter((s) => p.sections.includes(s.id));
}

/**
 * v3231 -- CHIP GROUPS: THE SAME IDEA ONE LEVEL UP.
 *
 * The drawers fixed a row of 96 PAGE links. The CHIP row then had 32 buttons of its own, which is the same
 * problem wearing the mechanism that solved it. Keith named the first two groupings: the four game chips belong
 * together under "Game Theory", and "Rig Verify" is part of "System Tools".
 *
 * *** THE MEMBER CHIP IS MOVED INTO THE GROUP'S PANEL, NOT RECREATED THERE. *** Each of those buttons already
 * carries a click listener wired at load, a live status span the bridges write into, and a data-tab that pairs
 * it with its own panel. Rebuilding one would mean re-registering all three, and the status span would go quiet
 * in a way nobody would notice until they wanted it. appendChild MOVES the node with its listener attached --
 * the same move the page drawers use, for the same reason.
 *
 * THE MEMBER'S OWN PANEL IS UNTOUCHED and still opens where it always did. A group is a place to FIND the chip,
 * not a new home for what the chip does.
 */
/**
 * v3960 -- CHIP_PINNED: THE CHIPS THAT KEEP A HAND-SET ORDER. EVERY OTHER CHIP IS SORTED BY NAME.
 *
 * Keith, reading the topic row: "I know that the first items in SweK Engine Topics are defined to show in
 * order, but the rest of the category topics should be alphabetized if not set to show in order."
 *
 * *** THEY WERE NOT DEFINED TO SHOW IN ORDER. THERE WAS NO ORDER AT ALL. *** The row is static markup and the
 * chips sit in the sequence they were WRITTEN IN, one round at a time over nine hundred versions -- Email rules
 * and Asset Pipeline at the front because they are the oldest, Rocket League at the back because it is the
 * newest. It reads as deliberate from the front (the operational drawers really are first) and as nothing from
 * the middle onward, which is exactly how an accident looks when its first few entries happen to be right.
 *
 * SO THE INTENT IS WRITTEN DOWN RATHER THAN INFERRED FROM A FILE'S HISTORY. These are the SERVICE drawers --
 * the ones with live state you check rather than subjects you browse: is the mail rule armed, is the pipeline
 * draining, is RustDesk configured, how far has render-qa got. They are worth a fixed place because you look
 * for them by position, and a row that reshuffles them when somebody adds a topic is a row you have to re-read.
 *
 * EVERYTHING NOT NAMED HERE IS ALPHABETISED, which means a new subject drawer needs no edit to this list and
 * lands where its name says it should. That is the whole point: the default is the rule, not the exception.
 * (The pin list is by data-tab, not by label, so renaming a chip -- as v3960 renames three -- cannot silently
 * unpin it.)
 */
// v4039 -- "cloud" REMOVED, at Keith's request: "this button on the right of server.html needs to be
// completely removed." Its gtab/gpanel is gone (see server.html's own v4039 note), so a pin naming it would be
// exactly the "config line that does nothing" chipOrder-selfcheck.mjs already checks for on every OTHER pin.
// v4127 -- SEVEN PINS DROPPED, AND FOR TWO DIFFERENT REASONS. Keith: "these items do not get their own button
// on Server.html and can go in the alphabetized section" (roundhouse, terrain, crossarch, policymass) -- they
// keep their chip, they just stop being PINNED, which is exactly what this list is for: unpinning is how a chip
// joins the alphabetised run. Nothing is hidden and no panel is touched.
// The other three LEAVE the row entirely, into a group slot: renderqa and rigjob to System Tools ("this goes in
// System Tools") and brew to Mac System ("'Homebrew formula' goes in Mac System") -- see CHIP_GROUPS below.
// A chip that CHIP_GROUPS lifts out of the row must not also be pinned in it: the pin would be a config line
// that does nothing, which is the exact fault chipOrder-selfcheck.mjs checks for and v4039 removed "cloud" for.
export const CHIP_PINNED = [
    "rules", "render", "github", "rustdesk", "crossdesk", "nearshare", "celltrack",
];

export const CHIP_GROUPS = [
    { id: "gametheory", tab: "gametheory", label: "Game Theory",
      note: "the agents that play games, and the games they play",
      chips: ["endlesssky", "bzflag", "rocketleague", "ev"] },
    // Keith: "'Rig Verify' should be part of System Tools on Server.html". The systools chip already exists and
    // already holds the system-tool PAGES, so the group and the drawer are the same chip -- which is right:
    // rig.html and the Rig Verify surface are the same subject seen from two sides.
    // v4127 -- renderqa and rigjob JOIN, at Keith's ask ("this goes in System Tools"), by the same reasoning
    // that put "verify" here: they are rig surfaces seen from another side. Both are pure service panels that
    // claim no page in SECTIONS, so this moves a chip and strands nothing.
    { id: "systools", tab: "systools", label: "System Tools",
      note: "the rig, the ship ritual, the record -- and the live verify surface",
      chips: ["verify", "renderqa", "rigjob"] },
    // v4127 -- Keith: "'Homebrew formula' goes in Mac System". `brew install swek-engine` is macOS-only by
    // construction, so it belongs with the other things that need a Mac rather than in the top row. The slot
    // it moves into is added to the macsystem gpanel in server.html the same round -- a group with no slot is
    // reported by the mover's own "NO SLOT" line rather than failing silently.
    { id: "macsystem", tab: "macsystem", label: "Mac System",
      note: "the Homebrew formula, filed with everything else that needs a Mac",
      chips: ["brew"] },
];

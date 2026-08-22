# SweK Engine patches — apply over EngineProject_v1988

Drop these 5 files over the same paths in your install, then restart the bridge.

## Peer auto-update (check-on-connect) — server.js, sysadminBridge.js

1. **Check-on-connect wired.** New `_requestPeerPull()` hook (debounced 15s) is called from
   both peer-connect entry points — `assetDiscovery.onPeer` (UDP beacon) and `POST /net/introduce` —
   so the version check + auto-pull runs ~3s after a peer connects instead of waiting for the
   5-minute interval. Fires even for already-known peers reconnecting (they may have updated).
2. **/update/offer + /update/zip added to AUTH_PUBLIC.** On a passworded box, mesh peers
   (NetBird/Tailscale 100.x — not matched by `_isLan`) got a 401 JSON, which `pullFrom` misread
   as "peer has no update to offer". Same trust level as the already-public /package/info.
3. **Offer no longer depends on the Downloads zip alone.** `updateOffer()`/`updateZipPath()` now
   also scan the engine PARENT dir for `EngineProject_vNNNN.zip`. Previously a box that updated
   via Drive/incremental package advertised a newer version on /package/info but had nothing to
   offer — the puller failed every cycle with "peer has no update to offer".
4. **Success was invisible.** The autoPull log checked `r.pulled`, a field `pullFrom` never set —
   successful pulls logged nothing. `pullFrom` now returns `pulled:true`, and the tick logs
   success / skip-reason / failure explicitly.

## Camera integrations — cameraDiscoverBridge.js, go2rtcBridge.js, cameraVisionBridge.js

5. **ONVIF media-URL fallback was dead code.** The fallback loop `return`ed on its first
   iteration, so only `/onvif/media_service` was ever tried and never verified. Now all
   candidates (capabilities-derived + 3 common paths + device URL) are tried until GetProfiles
   answers. Error message also mentions camera clock skew (WS-Security digest is time-sensitive).
6. **ONVIF discovery is now per-interface.** One probe socket per IPv4 NIC, bound to it and
   pinned with `setMulticastInterface`. The old single unbound socket sent the multicast probe
   out the default-route NIC only — on multi-homed boxes cameras appeared/disappeared between
   scans depending on routing.
7. **RTSP scan defaults relaxed.** 450ms/48-concurrency storm missed WiFi cameras (ARP alone can
   eat that). Now 900ms / concurrency 24.
8. **go2rtc crash visibility + auto-restart.** Was stdio:"ignore" + exit handler that nulled the
   child: a crash was invisible and permanent. Now stderr tail is captured (shown in status),
   exits are logged with code + stderr, unexpected exits auto-restart with exponential backoff
   (max 5; budget resets after 10 min stable), instant exits (<3s — port conflict / bad yaml) are
   flagged and NOT restarted, and deliberate stop() never triggers a restart.
9. **Vision frame grab retries once.** First grab on an idle stream spins up the RTSP/ffmpeg
   consumer and routinely blew the 8s timeout ("first describe fails, second works"). One retry
   after 2.5s rides the warm stream.

## Avatar diorama scene cropping — face/avatarStage.js

10. **Camera now frames the actual scene content.** The diorama (and studio) camera framed a
    hardcoded box around the DEFAULT gauge row only. Three things it contains were never included:
    free-placed gauges (v1361 pos overrides), props/grabbables (the composition places them at
    x=1.6+i*0.5 — past the row edge; hiding a gauge via the visibility mask shrank the frame and
    cropped every prop), and the llama's roam/bury range (±1.4). New `_contentSpanX()` spans every
    actor at its real x, every registered prop, and the pet range; diorama, studio, and the compact
    dock all use it. A carried dial pans the frame smoothly (uses _drawX).

NOTE (not a bug): avatarstage.html defaults to scene "focus" — a single-avatar portrait with NO
gauges or props by design. The full scene (gauges + avatar + llama + props) is scene "diorama":
open with ?fidget=1 or ?scene=diorama, or save "diorama" as the composition's scene. The docked
3D panel also passes no props — props only appear in the avatarstage/phone diorama hosts.

## AI pipeline upgrades (items 1-9) — ai/PipelineManager.js, ai/AssetAcquisitionService.js, ai/CameraPropPipeline.js (new), ai-bridge/server.js

11. **(1) OBJ→PNG albedo fallback.** New `_objSnapshot()` software-renders the installed OBJ
    (parse v/f, 3/4-view rotate, painter-sort, lambert fill — no WebGL needed) to a 512px PNG.
    Every 3D rung (Trellis/HiTem3D/Kaggle) now falls back to it when the diffuser is down —
    the Round 166 "texture failed → no albedo → all 3D blocked" cascade is gone.
12. **(2) Per-rung circuit breakers with failure classes.** trellis/hitem3d/kaggle each get their
    own breaker (infra failures trip it; "node not found" is cached 10 min; per-prompt failures
    trip nothing). Four Trellis failures no longer pause HiTem3D and Kaggle. status() exposes
    per-rung breaker state; resume3D() clears all.
13. **(3) PipelineManager hardening.** Per-attempt AbortSignal (stage.run(job, attempt, signal))
    + stage.timeoutMs so a hung ComfyUI job can't hold a concurrency-1 semaphore for 20 min;
    exponential backoff + jitter between retries (stage.retryDelayMs, default 1500ms);
    cancel(jobId) settles jobs as "cancelled"; settled-job eviction (maxSettledJobs=300) fixes
    the unbounded jobs Map; run() now actually awaits submissions made during run().
14. **(4) Priority queue + cancellation in acquisition.** request(kind, {priority, isAlive}) —
    higher priority runs first (stable FIFO within a tier); isAlive() is checked between rungs so
    despawned entities stop consuming GPU. New cancel(kind) and prioritize(kind, n).
15. **(5) Persistent ladder ledger.** localStorage voxelengine.acquireLedger records the rung each
    kind reached ("obj"|"3d"). Next session: "3d" kinds skip entirely; "obj" kinds with a mesh
    present run UPGRADE-ONLY (texture+3D, no OBJ regen). QC-rejected OBJs are captured to
    FailedOBJStore with the rejection reason. forget(kind) clears the ledger entry too.
16. **(6) Peer-distributed 3D generation.** Bridge: GET /comfy/peers probes every known peer's
    ComfyUI (:8188) and /comfy/via/<host>/<path> is a same-origin streaming proxy (LAN/mesh hosts
    only). Browser: the acquisition service builds ComfyUIClient instances over the proxy and the
    3D rungs fail over local → peers — boxes without GPUs get real meshes from fleet GPUs.
17. **(7) meshQcAnalyzer as a gate.** The obj rung QC-checks geometry BEFORE install (worker-pool
    analyzeMesh + gradeQc); "bad" grades throw, consuming a retry (fresh generation) and logging
    to FailedOBJStore. Analyzer errors never block install.
18. **(8) Stats-driven rung ordering.** Per-stage/per-model success+timing stats persist to
    localStorage voxelengine.pipelineStats; the two local 3D rungs are ordered by observed
    expected value (successRate/avgMs, 15% hysteresis, trellis-first until 3+ samples).
    acquisition.stats() dumps the table.
19. **(9) Camera→prop pipeline.** New ai/CameraPropPipeline.js: /cam/snapshot frame grab →
    square center-crop → requestFromImage(kind, dataUrl), which runs an image-first ladder
    (skips OBJ+texture — the photo IS the albedo). window.cameraProp.propFromCamera("prop_x",
    "cam_src") from the console; propFromImage() for uploads. Local bg-removal rung is the
    natural follow-up (Kaggle Hunyuan already does removeBackground:true).

## ABYSS 3D Battleship fixes — battleship3d.html

20. **Orbit drag no longer fires.** The click event after a pointerdown/up pair fired a shot at
    wherever an orbit drag ended. Drags >6px now suppress the shot.
21. **Enemy fleet no longer leaks via shadows.** Hidden (opacity-0) enemy hulls still had
    castShadow=true — their shadows fell on the seabed, readable through the translucent water.
    Shadows are off while hidden and restored per-segment on reveal and on sink.
22. **Torpedoes run past wrecks.** The lane scan took the first ship CELL including already-hit/
    sunk segments; resolveStrike's "already" branch then did nothing (no peg, no log, no shot
    recorded), making every torpedo in a column with a wreck a silent wasted turn. The scan now
    finds the first INTACT segment (logic-tested).
23. **Air-strike bonus hits/misses are recorded.** Bonus bombs dropped pegs but never entered the
    shot sets, so a later shot on that cell was silently eaten. Keys are always recorded now, hits
    log "(air strike)", and the previously-silent already-struck path logs feedback.
24. **AI hunt queue clears when its target sinks** — no more poking around a dead ship's wreck.
25. **Offline-first:** loads the engine's vendored /vendor/three/three.module.js (CDN fallback
    only if missing), with useLegacyLights/outputColorSpace guards so newer three renders with
    the original r128 look. The game previously could not load on a LAN-only box.
26. **Torpedo lane preview:** hovering with the torpedo selected highlights the full lane it will
    run instead of a single cell, since it can detonate short of the clicked square.

## Chess demos coolified — demos_code/dejarik.js, demos_code/tridchess.js

27. **DEJARIK (Star Wars holochess):** 8 distinct voxel monster sculpts (hulking Savrip,
    serpentine K'lor'slug, tiny Houjix...) replace the stat-sized boxes; holographic shimmer
    (cyan tint + per-frame brightness flicker with random signal dropouts + idle bob); animated
    turns — monsters SLIDE between cells facing their travel, attackers LUNGE, wounded flash red,
    the dead dissolve like a cut feed (no more full board respawn per action); selection/move/
    attack GLOW TILES on the 3D board; holo-projector pedestal under the table. Also fixed:
    side A now actually spawns red as the legend always claimed (A_CI was green).
28. **TRI-D CHESS (Star Trek):** recognizable piece silhouettes (rook crenellations, knight's
    jutting muzzle, bishop mitre, gold-crowned queen, cross-finial king); the iconic pedestal —
    central tapering pylon, arms reaching to each main board, posts under the attack boards;
    black side is genuinely dark (colorMul-dimmed navy; the 8-color palette has no black);
    animated moves with a real vertical lift arc on level changes + landing settle; captures
    flash red and sink through their board; pulsing 3D legal-target glow tiles.
    Diff-pairing engine soak-tested against the real sims: 7,600 dejarik actions + 14,592 tri-d
    moves with zero entity-map mismatches (caught + fixed a double-capture map corruption on
    occupied-square captures during testing).

## llama.cpp + Box3D-derived + lazydocker-inspired upgrades

29. **GBNF-constrained OBJ generation (llama.cpp).** New ai/grammars/obj.gbnf makes malformed
    OBJ impossible at the DECODER level. OllamaClient.generateOBJ() routes through llama-server's
    native /completion with the grammar when voxelengine.llamaServerUrl is set (e.g.
    http://127.0.0.1:8080), with graceful fallback to the Ollama path when unreachable. Skipped
    for C3D-style models (they emit Blender Python by design). Grammar guarantees format, not
    geometry — the QC gate still runs.
30. **llama-server + lazydocker catalog entries** in bgServicesBridge: llama-server with the
    why-run-it-beside-Ollama notes (grammars, -np parallel slots, speculative decoding, KV-cache
    quant / partial offload) and start commands; lazydocker as the Docker-ops companion.
31. **Dynamic AABB tree broadphase** (core/ecs/aabbTree.js) — Erin Catto's b2DynamicTree adapted
    to JS: fat AABBs, surface-area-heuristic insertion, balancing, O(log n) query + slab-test
    raycast + pair enumeration. Fuzz-tested 40,000 random insert/move/remove ops with zero
    invariant violations; near-optimal height (15 for 9,056 leaves); measured 13.7x over brute-
    force queries at 5,000 boxes. (Fixed during testing: stale-height balancing + unbalanced
    demoted subtrees degraded the tree — the fix took queries from 1.5x to 13.7x.)
32. **Physics systems rebuilt on Box3D's techniques** (core/ecs/systems/physics.js +
    physics_engine_v2.js, API-compatible): FIXED TIMESTEP + accumulator (frame-rate-independent;
    spiral-of-death guard), 4x SUB-STEPPING (contacts act at 240 Hz internally; the v2 voxel-
    collision hook now runs per substep so fast movers can't tunnel), opt-in AABB-tree sphere
    separation with a deterministic coincident-spawn fallback, and stepN(n) — the LOCKSTEP entry
    point. Verified: stepN(120) == stepN(60)+stepN(60) == 60 frame-driven ticks, bit-exact.
33. **Box3D WASM scaffold** (physics/box3d/): build-box3d-wasm.sh (emsdk one-shot: clone, emcmake
    with -msimd128, link the thin C shim, output /vendor/box3d/), box3d_shim.c (flat API: world/
    box bodies/step/transform readback/FNV state hash for lockstep desync detection), and
    box3dLoader.js (clean ready:false until built; world API; selfTest() prints a 600-tick state
    hash — run on two boxes, equal hashes prove cross-platform determinism for input-only sync).
    NOTE: could not compile here (sandbox has no network) — run the script on any emsdk box.
34. **Services Dashboard** (servicesdash.html + GET /svc/overview) — lazydocker-inspired single
    glance for ollama / llama-server / ComfyUI / diffuser / go2rtc: up/down + latency sparklines
    (red segments = downtime), go2rtc managed detail (pid, restart count, stderr tail, one-click
    restart), host CPU load + memory, per-service start hints.

## Peer file send — browser file/folder picker (server.html + server.js)

35. **Send-to-peer now uses real browser pickers**, not a typed host path. The peer row's
    "Send" button opens a dialog with "Pick files", "Pick a folder" (structure preserved via
    webkitRelativePath), and a "Host path" fallback (the old behavior — send a path that lives
    on the box hosting the page). A checkbox toggles the destination between the selected peer
    and "this box". Per-file upload progress; runs through the existing debug log too.
36. **New POST /peer/upload?peer=<base|self>&path=<rel>** streams browser-picked bytes to a
    target's Downloads. Two-hop streaming (no buffering, no practical size cap): body → this
    bridge → peer's /peer/dl/put, or written directly when peer=self. Trusted-gated; peer targets
    validated as LAN/mesh addresses (not an open relay). Because the bytes come from the VISITOR'S
    machine (not the host's disk), a remote visitor on a hosted seek page CAN send their own
    files/folders — which /peer/send (host-disk paths) could not do.

## Box3D WASM — setup/test/configure buttons (servicesdash.html + server.js)

37. **One-button Box3D pipeline.** New bridge endpoints: GET /box3d/status (prereq detection —
    bash/git/emcc with emsdk install hints per-platform; artifact presence + size/mtime; build
    state), POST /box3d/build (spawns build-box3d-wasm.sh with an optional tag pin, one at a
    time, 32KB rolling log), GET /box3d/log. The Services Dashboard gains a Box3D card:
    prereq checklist, tag input + "build now" with live log tail, "run selfTest" (loads the WASM
    in-browser, steps 41 bodies 600 ticks, shows the determinism hash + copy button — compare
    across boxes before trusting lockstep), and a "use Box3D in the engine" toggle
    (voxelengine.box3dEnabled; sims consult box3d.enabled() + ready). Also fixed a build-script
    bug caught by live-testing the endpoint: the vendor/ output path was resolved by cd'ing into
    it before it existed.
38. **Box3D card is self-documenting**: a collapsible "full setup guide" in servicesdash.html
    covers the whole lifecycle in order — emsdk install (incl. restarting the bridge from the
    emsdk shell so emcc is on PATH, and the Windows WSL/Git-Bash note), what "build now" does and
    the alpha/tag-pin + shim-update caveat, the two-box selfTest hash-comparison procedure and
    what equal/different hashes mean for lockstep, the per-browser localStorage scope of the
    enable toggle, and the console API + fleet rollout order.

## push2run integrations reviewed + GitHub auto-install (server.js, bgServicesBridge.js, githubInstall.js NEW, push2run.html)

39. **GitHub Releases auto-installer (new ai-bridge/githubInstall.js).** Fills the gap: bgServices
    install was winget-only (Windows), so the catalog's GitHub-native tools (lazydocker, netbird,
    llama-server) had no one-click install on Mac/Linux. Now installs directly from a repo's
    latest release: picks the right asset for this OS+arch (platform/arch token scoring, avoids
    MSIs/installers in favor of archives/bare binaries; explicit per-platform ghAsset override),
    downloads (redirect-following, GitHub-token-aware to beat the 60/hr anon limit), extracts
    zip/tar.gz, locates the binary, chmods it, and records the path so resolveBin() finds it in
    ~/.swek/tools/<id>. Asset-picker heuristic-tested against real lazydocker/netbird/llama.cpp
    manifests. Endpoints: POST /bgsvc/install-github, POST /bgsvc/install-smart (auto-routes
    winget on Windows / GitHub elsewhere, with cross-fallback). Both trusted-gated.
40. **Push2Run reviewed and extended.** Finding: Push2Run was runtime-remote-control ONLY — it
    could drive a running engine (demos, perf, console) but could NOT install anything, and had
    no service control. Added ops verbs to /push2run/exec: install:smart <id>, install:github
    <id>, svc:start/svc:stop/svc:status <id>. Ops verbs require trusted access (they run
    software) — a bare untrusted LAN GET is refused for these while the existing demo/perf verbs
    stay open. push2run.html documents the new verbs with copy buttons. So the answer to "can
    Push2Run auto-install from GitHub" is now YES: a Push2Run rule firing
    `swek-cmd.bat install:github llamaserver` (or curl to /push2run/exec) installs it.
41. **llama-server ghAsset matcher** added (llama.cpp release assets are named bin-win/bin-macos/
    bin-ubuntu, which the generic heuristic wouldn't match).

## Unlock Controls button — idle-expiring page unlock (server.js + server.html)

42. **"Unlock Controls" button on server.html.** A remote SweK peer viewing the hosted page can
    enter the engine password and gain FULL permission on the page's buttons/demos, via an IDLE
    session that auto-expires after inactivity. New server-side machinery: sliding-window idle
    sessions (newIdleSession, _touchIdle) separate from the fixed 12h login sessions; reqAuthed
    also honors a ve_idle cookie and slides its window on every authed request; endpoints
    /auth/unlock (password + chosen idle minutes 1-60, default 10), /auth/ping (keep-alive +
    remaining time), /auth/lock (drop it now), all in AUTH_PUBLIC; /auth/status reports
    idleUnlocked + idleExpiresInMs. The button only appears when the engine HAS a password AND
    the client isn't already trusted (host / LAN-exempt / logged-in users see full controls
    already). While unlocked it shows a live countdown, pings to stay alive, survives page
    reloads, auto-relocks on idle timeout, and offers a one-click manual lock. Verified with 15
    unit tests (bounds clamping, sliding window, expiry self-cleanup, session independence) and
    a 7-step live HTTP wire test (gated→unlock→gated allowed→ping→lock→gated blocked).

## PetFBI — one-click "Post to Facebook" for volunteers (petfbiBridge.js + server.js + petfbi.html)

43. **"Post to Facebook" button on every report card.** Reviewed the volunteer posting flow: it
    ended at a "Copy" button for the caption plus separate links to the pet photo and map, so a
    volunteer still had to hunt/download the photo, screenshot the map, open Facebook, paste, and
    re-attach both images by hand (~7 steps). New one-click flow: the button copies the caption
    to the clipboard, saves BOTH the pet photo and the map to the volunteer's Downloads as
    ready-to-attach files (named from the pet, e.g. Buddy-photo.jpg + last-seen-map.jpg), opens
    the first routed group's composer, and lists the remaining groups as one-click links — so the
    volunteer's job becomes: paste (Ctrl+V) → drag the two saved images in → Post. New bridge
    function petfbiBridge.fbKit(id) (reuses the email kit's _downloadImage to fetch pet photo +
    map, returns them as data URLs alongside caption + group links) and the /petfbi fbkit action.
    Degrades gracefully when the photo or map is missing (map-only, or caption-only). Tested
    end-to-end against a live image server: both images bundle as valid data URLs, pet-name
    filenames, group pass-through, and the missing-image fallback all verified.

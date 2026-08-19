---
type: doc
title: "First video: box3D in SweK Engine — capture + release kit"
tags: ["swek-engine", "round-doc"]
---

# First video: box3D in SweK Engine — capture + release kit

## The shot (my pick)
Lead with **box3d-blobs.html** — the physics-driven lava metaballs. Rigid bodies you can *feel*, wrapped
in a GPU metaball surface, is the most eye-catching thing to open on. Keep the whole clip 45–70s. If you
want a second beat, cut to **es-box3d.html** (flight on the same physics) for ~10s to show it's not a
one-trick page.

## Capture recipe (one URL, title card baked in)
1. Open `http://<rig>:8787/box3d-blobs.html?reel`
2. Let it run ~5s so the lava settles into motion.
3. Click **Record tab** (top-right) → pick *this tab* in the browser prompt.
4. The intro title card + lower-third captions are on screen, so they land in the recording.
5. Stop after ~45–60s (or it auto-stops if you passed `?reel` with a seconds option). A `.webm`
   downloads automatically.

- Want a **clean canvas-only** clip with no overlay? Use `window.swekRecord.start(60)` in the console
  instead — that captures just the canvas pixels.
- Record at your display's native res; 1080p60 uploads great. YouTube re-encodes webm fine, but if you
  want mp4, one pass through Handbrake or `ffmpeg -i swek-box3d-blobs.webm swek-box3d.mp4`.

## Title options
- SweK Engine — box3D Physics Running in a Browser (from scratch)
- I Built a Multi-Runtime Game Engine. Here's box3D Physics.
- box3D Rigid-Body Lava — SweK Engine devlog #1

## Description (paste-ready)
```
SweK Engine is a game engine I'm building from scratch — no Unity, no Unreal, no license. It runs the
same code across three runtimes: WebGL2 and WebGPU in the browser, and Node.js headless on a LAN.

This first clip shows box3D rigid-body physics driving a field of metaball "lava" blobs, GPU-shaded and
simulated in real time in a browser tab. The same physics backend runs the engine's flight model and its
deterministic LAN co-op, so a fight can play out identically on every machine in the house.

More devlogs coming: GPU-brain AI pilots, an Endless Sky-compatible space port, and LAN skirmishes where
a squad of AI bots muster into a room and jump into the fight.

Built by one person. Feedback welcome.

#gamedev #webgpu #webgl #physics #indiedev #javascript
```

## Tags
gamedev, game engine, webgpu, webgl2, box3d, physics engine, rigid body, metaballs, indie dev,
javascript, from scratch, devlog, LAN co-op, endless sky

## 60–90s spoken script (with on-screen beats)
- [0:00, title card up] "This is SweK Engine. I'm building it from scratch — no Unity, no Unreal."
- [0:06, lava in motion] "What you're looking at is box3D rigid-body physics, running in a browser tab."
- [0:14, blobs colliding] "Every blob is a real body — collisions, momentum, stacking. The lava look is a
  GPU metaball surface over the physics."
- [0:28, mention runtimes] "The same engine runs three ways: WebGL2, WebGPU, and headless in Node on my LAN."
- [0:40, cut to es-box3d flight] "That means the physics that shakes these blobs also flies the ships — and
  because it's deterministic, a co-op fight runs identically on every machine."
- [0:55, back to lava / title] "One person, from scratch. Devlog one. More coming — AI pilots, a space
  sim, LAN skirmishes. Thanks for watching."

## Thumbnail
A frozen frame of the lava mid-collision (bright amber blobs on near-black), with "box3D PHYSICS" in the
LCARS amber and a small "SweK Engine" tag. High contrast reads well at small sizes.

## Honest note
box3D itself only renders on your rig (browser + built WASM) — I can't preview the visual here, so eyeball
the first capture and re-shoot if the framing's off. The overlay, captions, and recorder are plain DOM and
work on any of the box3d pages via `?reel`.

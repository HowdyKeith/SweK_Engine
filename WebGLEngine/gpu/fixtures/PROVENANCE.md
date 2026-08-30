# gpu/fixtures — where these bytes came from, and what they are not

## What is here

Two files, both derived from **A Beautiful Game** in the Khronos glTF-Sample-Assets repository:

| file | derived from |
|---|---|
| `ABeautifulGame-draco.header.glb`  | `Models/ABeautifulGame/glTF-Binary-KTX-ETC1S-Draco/ABeautifulGame.glb` |
| `ABeautifulGame-plain.header.glb`  | `Models/ABeautifulGame/glTF-Binary/ABeautifulGame.glb` |

## What they ARE NOT: models

Neither file is loadable, and that is on purpose. Each is the original GLB's **12-byte header and its
genuine JSON chunk, with the BIN chunk removed** — 22 KB and 32 KB instead of 12 MB and 43 MB. The JSON
still declares buffers whose bytes are not present, so any real loader will and should refuse them.

They exist for `gpu/glbLoad.js`, which decides *which loader a file needs* by reading the JSON chunk and
nothing else. A fixture carrying the real JSON chunk therefore exercises the routing code path exactly as
the full file would, offline, with no network and no 55 MB in the repository.

## What they prove, and the limit

They prove **routing** against a real file's real declarations: that a genuinely Draco-compressed GLB, with
`KHR_draco_mesh_compression` in `extensionsRequired` and 15 of 15 primitives compressed, routes to the Draco
path — and that the *same model's* plain variant, with the same 15 primitives, routes to the plain parser.
Until v4175 the dracoWeld gate had to state that no such file existed in this tree to check against.

They do **not** prove decoding. That still needs the full 12 MB and a browser, and the gate says so rather
than letting a routing pass read as a decode pass.

## Licence

**A Beautiful Game is CC-BY-4.0**, which permits redistribution *and requires attribution*, so the credit
travels with the bytes:

> A Beautiful Game — original model by the **MaterialX Project** (owner: ASWF, 2020); conversion to glTF by
> **Ed Mackey** (2022). Licensed CC-BY-4.0: https://creativecommons.org/licenses/by/4.0/legalcode
> Source: https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/ABeautifulGame

Verified by reading `Models/ABeautifulGame/LICENSE.md` and `metadata.json`, not assumed from the fact that
Khronos published it. That assumption is false for other models in the same repository — `BrainStem` is
under a Poser EULA and `Duck` under Sony's SCEA Shared Source License — which is why
`gpu/khronosSamples.mjs` records postures per model and its `mayVendor()` fails closed.

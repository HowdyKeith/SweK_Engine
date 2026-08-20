# BZFlag in SweK / Stellar Atlas  (v2202 — flags)

## Shot flags (v2211)

`bz/net/bzFlags.js` implements the eight flags that change the tank. `bz/bzShotFlags.js` implements the five
that change the **bullet** — and four of them turn out not to be code at all, but three numbers each, from
which BZFlag's own descriptions fall straight out:

| flag | vel | life | reload | range | what BZFlag says |
|------|----:|-----:|-------:|------:|------------------|
| Rapid Fire (F)  | ×1.5 | ×0.5 | ×0.5 | 263 m | "faster but not as far" |
| Machine Gun (MG)| ×1.5 | ×0.1 | ×0.1 |  53 m | "very short range" |
| Laser (L)       | ×1000| ×0.1 | ×2.0 | 35 km | "infinite speed and range, long reload" |
| Thief (TH)      | ×8.0 | ×0.05| —    | 140 m | fast and short |

**`_mGunAdLife` is *defined as* `1.0 / _mGunAdRate`** — the lifetime is derived from the rate. A gun that
fires ten times as often fires shots that live a tenth as long, and that is the whole reason a machine gun is
short-range. And a laser's "infinite" is a number: **thirty-five kilometres.**

The two that are real physics:

- **Ricochet (R)** — reflects off a wall instead of dying on it. `hitObstacle` returns no normal, so the
  normal is *found*: step each axis alone and see which was blocked; a corner reflects both.
- **Super Bullet (SB)** — passes through **buildings**. Not through the world's walls, not through the
  ground, not through the sky. "Shoots through buildings" is not "shoots forever," and the test fires one
  straight up to prove it dies when its life runs out.

Neither needed a real `bzfs`: the constants are the constants, and the physics is `bzTank.js`'s own
`stepShot`, not a second copy. `bz-shotflags-selfcheck` 42/42.

**And two notes I had wrong, written from the abbreviation and corrected from `src/common/Flag.cxx`:** `BY`
(Bouncy) is *"Tank can't stop bouncing"* — nothing to do with shots. `TR` (Trigger Happy) is *"Tank can't
stop firing"* — nothing to do with reload. Both are still unimplemented, now for the right reason.

Thirteen flags implemented, thirty-three named — every one in exactly one list.



A port of [BZFlag](https://github.com/BZFlag-Dev/bzflag)'s world format into the SweK engine, built the way the
Endless Sky port was: read the source, write our own, and keep an instrument that says out loud what we have not
done yet.

Verified against the **2.4 branch** of `BZFlag-Dev/bzflag`. Nothing here is copied from it; the grammar and the
constants were read from `src/bzfs` and `src/common/global.cxx` and re-implemented. BZFlag's own maps are **not
vendored** into this tree — see `bz/maps/README.md`.

## Flags (v2202)

A flag has been *named, not implemented* since round nine. This round draws the line where it actually is.

**The wire is complete.** All **forty-six** flag types, `Flag::pack`'s fifty-five bytes, `MsgFlagUpdate`,
`MsgGrabFlag`, `MsgDropFlag`, `MsgCaptureFlag`. A client that reads these knows where every flag is, who is carrying
what, and when somebody scores. Nothing is guessed.

**The effects are not, and the list says so.** Eight of the forty-six change a tank this engine already simulates —
High Speed, Quick Turn, Tiny, Obesity, Narrow, Thief, Shield, Jumping — implemented from BZDB's own constants. The
other **thirty-eight are named, with a reason each.**

And the assertion that matters is not any of them. It is this:

> **Every flag is in exactly one of those two lists, and never in both.**

A flag missing from both is a flag whose effect nobody decided about, and that is how a port starts lying.

### Two asymmetries, which are the shape of the protocol

- **A client's `MsgGrabFlag` is two bytes** — an index. **The server's is fifty-eight** — a player, an index, and the
  whole flag. *You ask; the server tells everybody what happened.* Asking is not having, and nothing in the session
  sets `carried` until the answer comes back.
- **A client's `MsgDropFlag` is a position and nothing else.** Not even which flag — **you can only be carrying one.**

### A Shield eats the hit. The flag goes; you do not.

Because `bzfs` does no hit detection, a shield is not something the server can grant you — it is something *you*
decline to die from. When a shot lands and you are carrying `SH`, you send `MsgDropFlag` instead of `MsgKilled`, and
the server broadcasts the drop back, and *that* is where the shield really goes. The next hit kills you as it always
did. Proved over a real socket, and again in `bz-session-selfcheck.mjs`.

Dying clears the flag without waiting to be told, because **a dead tank with a Velocity flag's speed is a tank that
respawns wrong.**

### And I got three of them wrong from memory

There is no flag called `Rico`. `RC` is **ReverseControls**. Obesity is `O`. The table comes from
`src/common/Flag.cxx` now, which is the only way anything in this port has ever been right.

`bz-flags-selfcheck.mjs`: 64 checks. `bz-session-selfcheck.mjs`: 41 → 59.

## The browser plays (v2201)

`/bzflag.html?bzfs=host:5154` now **drives**. Add `&observe` to watch instead.

Over TCP alone, because a browser cannot open the UDP fast lane. That is **laggier, not broken** — `bzfsClient`
sends the hot messages down the TCP stream when there is no datagram channel, which is the server's own fallback
path. It is a decision about the proxy, not a limitation of it.

### One set of rules, obeyed by both

`bz/net/bzfsPlay.js`. `brain/bzfsPilot.mjs` learned these rules the hard way against a real `bzfs`; a second copy for
the browser would be a second set of bugs. So the pilot keeps the **mind** and the session keeps the **body**, and
the only difference between a GPU Brain playing and a person playing is where `input` comes from.

The rule that organises everything else: **`bzfs` does no hit detection.** You decide you were hit, you send
`MsgKilled` naming your own killer, and the server takes your word for it because it has no way of forming its own
opinion. So every frame: fly *other players'* shots against your own hull; if one lands, say so; when you respawn,
**throw the incoming shots away — a shot fired at where you used to be was not fired at you.**

### Three bugs, and the tests found all three

- **A fresh session waited out a respawn timer it never earned.** `diedAt` started at `0`; in the pilot that was
  hidden by `Date.now()` being a large number. A session handed a clock that starts at zero would have sat there
  forever. It is `-Infinity` now.
- **Two clocks.** `step()` took an injected `now` and `killed()` read `Date.now()`. And the respawn timer restarted
  on the server's *confirmation* of a death we had already reported — pushing every respawn back by a round trip.
  It only restarts on the **transition** now.
- **`MsgAddPlayer` arrives before `MsgGetWorld`.** Building the session when the world lands means it never learns
  who is in the game — and a pilot with no targets never fires. `bzfs-loopback-probe` caught it: *48 player updates
  arrived, 0 shots.* The session exists from the first byte and `attach()`es the world when it comes.

`bz/tools/bz-session-selfcheck.mjs`: 41 checks with a hand-written client stub that records what it was told to say.
Nothing mocked that matters — the physics is `bzTank.js`, the hull is `bzCombat.js`'s, the world is `arena.bzw`. It
also caught its own fixture: a shot aimed at a tank standing at `(0,-140)` dies in the meshbox `arena.bzw` puts
there.

## The browser meets a real bzfs (v2200)

A browser cannot open a TCP socket. `bzfs` speaks nothing but TCP. So the viewer reaches a real BZFlag server the
only way it can: a **WebSocket-to-TCP proxy** on the bridge.

    ws://<engine>/bz/ws?host=<server>&port=5154
    /bzflag.html?bzfs=host:5154

The proxy copies bytes both ways, unchanged. It adds nothing, interprets nothing, and re-frames nothing — the BZFlag
framing already says where every message ends, and a proxy that re-framed it would be a second opinion nobody asked
for.

### It is an outbound TCP proxy, and every guard is load-bearing

- **Trusted requests only** — the same `_isTrustedReq` the rest of the bridge uses, **handed in, not imported**, so
  this file cannot decide for itself who is trusted.
- **`169.254.*` is refused by name.** That is where a cloud instance keeps its credentials, and a proxy that will
  dial it for you is a credential leak wearing a game's clothes. So are `0.0.0.0` and the IPv6 wildcards.
- An optional `BZ_PROXY_ALLOW=host:port,...` allowlist, a connection cap, an idle timeout, and byte counters. *A
  proxy nobody is watching is a proxy nobody notices.*

### The frame codec is written here, not taken from `ws`

`ws` is already a dependency of this bridge, and reusing it would be less code — but it is **not installed in the
environment these tests run in**, so a proxy built on it would ship unproved. So `ai-bridge/bzWsFrame.js` is RFC 6455
by hand, and it is checked against **Node's own built-in `WebSocket` client** — a completely independent
implementation of the other half. Two implementations, one format: the same discipline as the pack/unpack
transcriptions in `bz/net`.

Things the spec insists on and nothing tells you twice: **every frame a client sends is masked**, not for secrecy —
the key is right there in the frame — but so a hostile page cannot make a browser emit bytes a transparent proxy
would mistake for an HTTP request. A server that masks its own frames is violating the spec and every client hangs
up on it. And the accept-key GUID is a *constant*, chosen so a cache replaying an old response cannot accidentally
complete a handshake.

### The client did not change

`bz/net/bzfsClient.mjs` grew a **transport**: `{ write(bytes), close() }`. TCP for node, WebSocket for the browser,
and the state machine cannot tell which it holds. **The browser gets the exact code a real `bzfs` already accepted
over TCP, one transport swap away.** `bzflag.html?bzfs=host:port` downloads the server's own binary world, verifies
its MD5, walks its ten sections, adapts it, draws it, and shows the tanks the server reports.

`bz-proxy-selfcheck.mjs`: 51 checks — the RFC's own example accept key, exact frame bytes, the mask refusal, the
4 GiB refusal, the guards; then **Node's WebSocket client through the proxy to a `bzfs` built from BZFlag's source**,
134 obstacles over a browser transport.

### And the page harness caught a crash

`PROXY_URL` read `location.origin`, which is not guaranteed. `bz-page-selfcheck.mjs` boots the page twice now — once
solo, once with `?bzfs=` and a stub `WebSocket` — and the second boot found it before any browser did.

## The database ends (v2199)

`worldWeapons` and `entryZones` — the last two of the ten. **A world database now walks from its first byte to its
last, and the walk ends by *arriving* rather than by stopping.**

    if (r.left !== 0) throw new Stop("end", `${r.left} bytes left over after the last section`);

That line is the point of the round. `bytesRead === database.length` is the only assertion that says nothing above
it misread a byte — a walk that "succeeds" with bytes left over is a walk through somebody else's memory. A database
with one extra byte is **refused**, not shrugged at.

**A world weapon** is a turret: a flag abbreviation (two bytes, zero-padded), an origin, a direction, an initial
delay, and the cycle of delays it repeats. Read, kept, not fired.

**An entry zone** is a `WorldFileLocation` and then **three counts, together, before any of their three lists** —
flags, teams, safety. Read one count and then its list, and everything after it is garbage.

### And a tank now respawns where the server says its team comes back

`hix.bzw` has neither record, so it cannot say whether we read them right. The probe writes a map that has both, runs
a **second real `bzfs`** on it, and checks: two weapons with their flags and delay cycles; three zones with their
teams and safety lists; both matching our own `.bzw` parse of the same file, field for field. Then it adapts the
downloaded world and takes **twenty respawns for team 1 — all twenty inside the zone the server named**, from a map
this client never read from disk.

Before this, `brain/bzfsPilot.mjs` respawned anywhere it fitted, on a map whose spawn zones it had downloaded and
thrown away.

## Group instances (v2198)

The record I spent three rounds calling a smuggling route. It is one, and it is eleven lines.

`GroupInstance::pack` has no field for its material map, so it hides one **inside the instance's name**.
`nboPackStdString` writes a `uint32` length and then that many bytes; the packer appends `1 + 4 + 8·count` — a NUL,
an `int32` count, and `count` pairs of `int32` — and lets the length prefix carry them. The reader notices the C
string ends before the field does, and reads the tail. Upstream turns error checking *off* for exactly that read.

With it, group definitions and instances are read, and `bz/net/bzWorldAdapt.js` expands them into world space: a
definition's obstacles through the instance's transform, recursively, with rigid motions baked into
`pos`/`rotation`/`size` and anything else kept as a matrix and flagged `approx` — exactly as `bzwWorld.js` does for
the text form. An instance naming no definition is **reported, not invented**; a group that instantiates itself
stops and says so.

**Every section a map needs now parses.** What is left is `worldWeapons` and `entryZones`, past the water level,
which nothing needs.

## The brain learns on a real bzfs (v2198)

Three GPU Brain processes join a `bzfs` built from BZFlag's own source, **with no `.bzw` between them**. They
download the world, verify its MD5, inflate it, walk its ten sections, adapt it, drive it, kill each other, post
what they learned — and a fourth pilot, started afterwards, is born knowing.

    (hand:    {"wNear":1,    "wAhead":0.6,  "wExposed":0.4, "wAirborne":-0.3})
    (learned: {"wNear":0.954,"wAhead":0.726,"wExposed":0.4, "wAirborne":-0.3})
    (8 decisions on disk, 4 kills and 4 deaths)

### Three things a real server had to teach us

**1. `bzfs` does no hit detection.** BZFlag is client-authoritative for death: the **victim** decides it was hit and
sends `MsgKilled` naming its own killer. A pilot that only shoots is a pilot nobody can kill and who never dies. The
message the client sends does **not** carry the victim — the server knows who sent it, and prepends it when it
rebroadcasts, which is why `readKilled` reads one field more than `killed()` writes.

**2. A shot's id is not a counter.** `bzfs` reads it as `slot | (salt << 8)` and **silently** drops any slot past
`maxShots - 1`. Our client numbered its shots 1, 2, 3… so every one asked for a slot the server did not have, and
every one vanished without a word. Three brains fired eighty rounds at each other and not one of them existed.
`maxShots` comes from `MsgGameSettings`, which is the answer to `MsgWantSettings`, and it is that message's fifth
field.

**3. And it takes three pilots, not two.** A decision with no counterfactual carries no gradient, and
`outcomeForDeath` returns null rather than inventing one. With two pilots each sees exactly one target, there is no
runner-up, and **nothing is ever posted**. The bridge stays on the hand policy forever and nobody would know why.
`bz/tools/bzfs-learn-probe.mjs` asserts that too, because it is the sort of thing that looks like a broken bridge
for a week.

The probe runs the server with `-density 0`: an empty world, on purpose. `hix.bzw` has 118 boxes and pyramids and
`bz/bzPilot.js` will not fire through one, so three pilots on hix take about a shot a minute between them. That is
correct behaviour and a hopeless place to measure learning. **The map was wrong for the test, not the pilot.**

## A map it has never seen (v2197)

The whole world-database stack, used for the thing it was built for.

`bz/net/bzWorldAdapt.js` turns a walked world database into the same world object `bz/bzwWorld.js` builds from a
`.bzw`, so everything downstream — collision, geometry, the policy — works unchanged. `brain/bzfsPilot.mjs` no
longer needs `--map`: it joins, downloads the world, verifies its MD5, inflates it, walks its ten sections, adapts
it, and drives.

    [bzfsPilot] world downloaded: 761 bytes -> 4350 inflated, md5 verified (map file); 134 obstacles read
    [bzfsPilot] collision from the server's own world database: 130 obstacles, 800 units across

Against a real `bzfs`: **130 obstacles, 800 units, 16 links, none broken — identical to our `.bzw` parse of the same
file. 120 seconds of driving: never inside an obstacle, never below the floor, never outside the walls.** No `.bzw`
is read to do it.

`--map` is an override now, not a requirement. If the database stops at a record BZFlag's source has not been
transcribed for — a group instance, today — the walk says which, and the pilot falls back to **observing** rather
than guessing at a world it cannot see.

Two things the wire has that a file does not: **the walls** (`bzfs::makeWalls` adds four at load, so the world's
size falls out of them — a wall's `size[1]` is half the world) and **teleporter names** (`makeTeleName` gives every
one a `/t<index>` before packing). Two things a file has that the wire does not: a name and a `flagHeight`. The
adapter returns `null` for those rather than inventing them.

### A correction, and it cost a round of confident prose

**v2188 said hix.bzw's sixteen numeric links match nothing and all fall through to doorways. That was wrong.**

`LinkManager::addLink` — which I never read — converts a link name that **starts with a digit** into a face number
before `doLinking` ever globs anything. Face `n` belongs to teleporter `n/2`, front if `n` is even. So `from 0` is
`/t0:f` and `to 2` is `/t1:f`.

A real `bzfs` packed hix's links into its world database as `/t0:f -> /t1:f`, and there was no arguing with it. Our
parser now resolves all sixteen, none broken, none on passthru — and the real probe asserts that the link our text
parser resolves is the link the C++ server packed.

I read `doLinking` and `findTelesByName` and stopped there. That is the shape of the mistake: not a wrong
transcription, an incomplete one, asserted with a number and a map name attached.

And one more thing only a real server says: **`MsgReject 6: Callsigns must be at least 2 characters.`** The client
refuses a shorter one before the socket now.

## A real bzfs (v2195)

Every round of this port ended with the same sentence: *nobody has pointed any of this at a real `bzfs`.* This is the
round that did — without touching the network. `bzfs` is in BZFlag's own source, it builds server-only in about a
minute, and it answers.

    ./configure --disable-client --disable-bzadmin --disable-plugins --disable-robots && make -j
    BZFS_BIN=$PWD/src/bzfs/bzfs BZFS_MAP=$PWD/misc/maps/hix.bzw node bz/tools/bzfs-real-probe.mjs

**36 checks against a server that has never read a line of this port.** The connect header, the nine unframed bytes,
`BZFS0221`, our 247-byte `MsgEnter`, `MsgAccept`, `MsgWantWHash`, `MsgGetWorld`, the UDP fast lane — all of it.

### The assertion this whole port was built for

The server sends its world as a binary database. We verify its MD5, inflate it, walk its ten sections, and read
**134 obstacles**. Then we parse the *same map file* with our own `.bzw` text parser and compare:

    from the wire:  4 wall, 58 box, 60 pyramid, 4 base, 8 teleporter
    from the .bzw:          58 box, 60 pyramid, 4 base, 8 teleporter

**A C++ packer and a JavaScript text parser, meeting in the middle.** The four walls are the one difference, and the
reason is round two's: `bzfs::makeWalls` adds them at load time and they are not in the file — which is exactly what
`bz/bzGeom.js`'s `makeWalls` does, for exactly that reason.

### And it found a bug that no amount of reading would have

**An observer is a `TankPlayer` on the `ObserverTeam`.** `JAFOPlayer` is *bzadmin's* type, and a real `bzfs` answers
`MsgReject 5: This game is full` to it — whatever the slot counts say. This client used `JAFOPlayer` for four
rounds, and every loopback test passed, because the loopback server was ours and it did not care.

It also refused to load **our own map**. `options` lines are handed to `bzfs`'s argument parser one word at a time,
so `-srvmsg Welcome to the arena.` becomes four arguments and the server stops on `to`. `arena.bzw` loads now.

`bz/tools/bzfs-real-probe.mjs` **skips loudly** when it cannot find a `bzfs`, and prints the four commands that build
one. It is the only thing in this tree that has spoken to a real server, and it will not pretend to have done so.

## Materials, and the last four obstacles (v2194)

Section three is no longer a wall, and neither is the arc. **A database with no group instances now parses all the
way to its links and its water level.** That is a whole map.

**`dynamicColors`** — a name, then four channels, each with a min, a max, and three variable-length lists of three
floats. **The trap is the sequence:** its `period` and `offset` sit inside `if (count > 0)` on *both* sides, so a
channel with no sequence is **eight bytes shorter** than one with an empty-looking one. Get that wrong and every
material and every obstacle after it is shifted.

**`materials`** — a name, a mode byte of seven flags, a dynamic-colour index, four RGBA quads, shininess, alpha
threshold, and then **two `UBYTE` counts, not `uint32`s**: a texture list and a shader list.

**The last four obstacles.** `arc`, `cone`, `sphere` and `tetra` arrive as **parameters, not meshes** — which is the
good news, because `bz/bzShapes.js` and `bz/bzMesh.js` already generate those shapes from exactly these numbers.
Each begins with an embedded `MeshTransform` (a name, a count, its ops) and ends with a run of material indices
**whose length depends on the shape**: an arc has six faces to paint, a cone four, a sphere two, a tetra one per
face. Get that count wrong and the state byte lands on a material index.

Three things that would have been silent:

- **A sphere's bit 4 is `hemisphere`. On a cone, bit 4 is `ricochet`.** Reading a sphere with a cone's bit table
  turns every dome into a ricochet surface, and nothing complains.
- **A cone has no `ratio`.** It is the one field an arc has and a cone does not.
- **A tetra packs its state byte *first*, before the transform.** It is the only obstacle that does.

The proof that the material counts are right is not any single assertion: it is that **everything after them still
lines up** — the links, the water level, and `bytesRead === database.length`.

82 checks. Still two transcriptions of one format: the decoder from BZFlag's `unpack`, the encoder from its `pack`,
written separately.

**What is left:** `groupInstances`, whose `pack` **encodes a material map inside a fake string whose bytes are read
back as integers** — that is not a format, it is a smuggling route, and it will be read carefully or not at all; and
`worldWeapons` and `entryZones`, which sit after the water level and which nothing needs.

## Remote rooms, and the buttons for them (v2194)

`Start room` has always hosted for the LAN — the rendezvous binds every interface, and since v2192 the panel prints
the LAN URLs. What there was **no** button for was a rendezvous *somewhere else*.

Now there is. The BZFlag tab takes a **remote room URL and its token**, and:

- **Check it** — asks whether it is there, whether it wants a token, whether this token is accepted, and how long it
  takes to answer. *Reached-and-refused is a result.* So is *reached-and-open*, and the panel colours that warning.
- **Launch brains** points at that URL when one is given, carrying the token typed for it. So a GPU Brain on this box
  can join a room on another box, a tunnel, or the Cloud Run deployment `cloud/swek-rendezvous` was written for.

The token is never echoed back, and it is never a field in `/bz/status`.

## The ten sections (v2193)

`bz/net/bzWorldSections.js`. And the honest headline first: **it stops at section three on almost every real map,
and it says so.**

Every other round of this port could check itself against a `.bzw` on disk. This one cannot. A world database
arrives from a server we do not have, in a format with **no length prefixes, no section markers, no checksum inside
and no way to resynchronise**. Misread one item by one byte and everything after it is *plausible garbage*.

So the walker does the only safe thing: it reads what has been **transcribed from BZFlag's own packers**, and where
it reaches a record it has not been transcribed for, it **stops and names it**. It does not skip. **It cannot skip:
a record whose layout you do not know has no length you can compute.** The temptation to "just advance past the
materials" is exactly how a parser starts returning obstacles that look almost right, and there is no test in this
tree or any other that would catch it.

**Transcribed and read:** texture matrices; physics drivers; transforms (a `spin` is the one op with a fourth
float, and an `index` op has no vector at all); the world group's **wall, box, pyramid, base, teleporter and mesh**;
links; the water level. A base packs its **team first** and then a whole box. A teleporter's name is the first thing
in its record. A mesh face's **state byte decides whether normals and texcoords follow its vertex indices** — which
is precisely why a mesh cannot be skipped without being read.

**The wall, named:** `dynamicColors` (four channels, each with three nested variable-length arrays);
**`materials`** — section *three*, and so almost every real map stops here, because almost every real map has one;
`groupInstances`, whose `pack` **encodes a material map inside a fake string whose bytes are read back as integers**
— that is not a format, it is a smuggling route, and it will be read carefully or not at all; `arc`, `cone`,
`sphere` and `tetra`, which are packed as **parameters, not meshes** (good news: `bz/bzShapes.js` already generates
those shapes); `worldWeapons`; `entryZones`.

That list *is* the gap. It is a to-do, not a mystery.

### How it is tested, when there is nothing to test against

`bz/net/bzWorldSections.js` is transcribed from BZFlag's **`unpack`** functions. The encoder inside
`bz/tools/bz-sections-selfcheck.mjs` is transcribed, separately and from scratch, from its **`pack`** functions.
**Two independent transcriptions of one format** — and if they disagree, one of them is wrong. That is a real check.
A parser round-tripped through its own writer is not: two mistakes that agree are still two mistakes.

54 checks, and they agreed on the first run.

## The world's envelope (v2192)

`MsgGetWorld` does not deliver a `.bzw`. It delivers BZFlag's binary world database, and there are **three layers**
before you reach a single obstacle. Two can be proved. The third is named, and not pretended to.

**Layer 1 — the envelope.** The same two-ASCII-letter habit as every message code: `"he"` and `"ed"`, head and end.

    uint16 WorldCodeHeaderSize = 10      uint16 WorldCodeHeader = 0x6865 "he"
    uint16 mapVersion = 1                uint32 uncompressedSize      uint32 compressedSize
    ...compressedSize bytes...
    uint16 WorldCodeEndSize = 0          uint16 WorldCodeEnd = 0x6564 "ed"

**Layer 2 — the payload is zlib-deflated, and nothing in the message says so.** `bzfs` calls `compress2` at level 9
and the client calls `uncompress`. You cannot read a byte of the world without inflating it, and the frame that
carries it is an ordinary frame.

**Layer 3 — ten manager sections back to back**: dynamic colours, texture matrices, materials, physics drivers,
transforms, **obstacles**, links, water level, world weapons, entry zones. The obstacles are the **sixth**, and there
is no way to reach them but to walk the five before. **Not parsed. Not skipped. Named**, so the gap has a shape.
That is the next round, and it is a real one: ten sub-formats, several with embedded strings, and no length prefix
to skip by.

**And the hash makes the first two checkable.** `MsgWantWHash` answers with one character — `'t'` for a random map,
`'p'` for a map file — followed by the **MD5 of the whole envelope**, header and footer included. So a client can
prove it downloaded exactly what the server sent *before* it tries to understand any of it. That is worth having on
its own: **a bad parse of good bytes is a bug, and a good parse of bad bytes is a mystery.**

## Hosting: LAN, the internet, and brains on different boxes (v2192)

Yes to all three, and here is what had to be fixed to make the answer honest.

- **The panel was handing out `127.0.0.1`** — the one address that is right for exactly one machine. `/bz/status`
  now reports `lanUrls`, and the panel prints them.
- **No BZFlag client had ever sent a token.** The rendezvous server has had `SWEK_TOKEN` since it was written, and
  `ev/presence.js` has carried a token since it was written, and `brain/bzPilot.mjs` and `bzflag.html` had never
  passed one. A room on the open internet without a token is a room anybody can drive into. Both send one now
  (`SWEK_BZ_TOKEN`, `?token=`), on presence **and** on the event ring, which had no token support at all.
- **Start room** takes a token. A room without one reports `open: true`, and the panel colours the warning.

Measured, with two brains on a token-gated room and a third without: the two with the token see each other
(`peers=1`) and kill each other; **the one without sees `peers=0`.**

For the internet, expose the rendezvous — a Cloudflare tunnel, or the `cloud/swek-rendezvous` VM/Cloud Run deployment
it was written for — and give everyone the token. Each remote GPU Brain is one process:

    SWEK_BZ_URL=https://rendezvous.example SWEK_BZ_ROOM=arena SWEK_BZ_TOKEN=<t> node brain/bzPilot.mjs

The token appears in exactly one place the panel shows: the **host's own** viewer link, because the panel is host-only
and that link opens in this browser. The link meant to be handed to somebody else shows a placeholder.

## The token, the fast lane, and playing (v2191)

The two things v2189 named as the likeliest reasons a real server would refuse us. Both are here now, and the brain
plays.

### The token

A `bzfs` running `-requireidentify` — which most public ones do — will not take a `MsgEnter` from a **registered**
callsign without a token. The token does not come from the game server: it comes from the **list server**, over
HTTPS, and the game server then asks the list server whether the token is real.

    GET https://my.bzflag.org/db/?action=LOGIN&callsign=<c>&password=<p>
    -> TOKEN: 0123456789abcdef        or        NOTOK: <reason>

An **unregistered** callsign needs no token, and passing an empty one is correct rather than lazy. A server that
requires identification will refuse and say so; `MsgReject` carries the reason.

Three things `bz/net/bzToken.mjs` is careful about. A password is never logged, never stored, never cached to disk —
a token in a file is a credential in a file. It is percent-encoded into one request and then it is gone. And the only
printable summary, `describe()`, **never sees a password**: it prints the token's *length*, not the token.

### The fast lane

BZFlag runs two channels to the same host and the same port number: a TCP stream for everything that must arrive, and
a UDP datagram channel for the six messages that must arrive **soon**. Positions, shots and gun-guided updates go down
the fast lane; everything else, including the fact that you exist, goes down the slow one.

The dance is stranger than it looks. The client sends `MsgUDPLinkRequest` — which *always* goes by UDP, even before the
link is up, because it **is** the link coming up. The server echoes it back. And the client, on receiving **any**
datagram from the server, decides the link is up and replies `MsgUDPLinkEstablished`. The source's own comment calls
this *"really a hack"*: it does not wait to be told, it infers it from a packet arriving.

**And the cap.** `MaxUDPPacketLen` is 68 bytes, header and all — a `MsgPlayerUpdate` is 47 and fits, a `MsgShotBegin`
is 47 and fits. But **nothing in BZFlag checks**, so a message that grew past 68 would be sent as an oversized
datagram and silently dropped by a server that reads 68 bytes. `bz/net/bzUdp.js` checks, and sends anything too large
down the TCP stream instead. That is not what BZFlag does. It is what BZFlag would do if it had ever been bitten, and
a client that quietly loses its own shots is worse than a laggier one.

### Playing

`brain/bzfsPilot.mjs` is the same mind — `bz/bzPilot.js`, unchanged — with different eyes and a different mouth. We
tell the server where we are and what we fired; **it** decides whether we are alive, whether the shot hit, and what
the score is.

**The one thing it cannot do, and says so.** The server's world arrives over `MsgGetWorld` as BZFlag's *binary world
database*, which is a different format from `.bzw` and a different job. This client keeps those bytes and **does not
parse them**. So collision needs a `.bzw` **you** supply — the same map the server is running — and if it is not the
same map, the tank drives into walls that are not there and through walls that are. That is not a bug to be
discovered later; it is the deal, and `--map` is required to play. Without one it enters as an **observer**: it
watches, it reports who is there and who killed whom, and it never sends a position.

    node brain/bzfsPilot.mjs --host <server> --port 5154 --callsign brain --map bz/maps/arena.bzw
    node brain/bzfsPilot.mjs --host <server> --observe

`bz/tools/bzfs-loopback-probe.mjs` now runs that real process against a TCP **and UDP** server on the same port: it
enters, spawns, opens the fast lane, confirms it on TCP, drives, and shoots — and never loses a message to the cap.
`server.html` has a **Play** button beside the probe, and it clears the password box after sending it.

**Nobody has pointed any of this at a public server.** A local HTTP server stood in for `my.bzflag.org` and a local
UDP socket stood in for `bzfs`. The token flow and the UDP dance are right; whether a real `bzfs` agrees is a question
only a real `bzfs` can answer.

## The buttons (v2190)

Everything BZFlag could do, it could only do from a terminal. You could open the viewer and download the map; you
could not start a rendezvous room, launch the GPU Brain, watch it fight, or point the protocol client at a real
`bzfs` — not without three shells and a memory of the environment variables. The panel had three links and **zero
buttons**.

`ai-bridge/bzBridge.js` owns six routes and `server.html`'s BZFlag tab has a button for each:

| | |
|---|---|
| **Start room** | spawns `cloud/swek-rendezvous/server.js` on a port |
| **Launch brains** | spawns *N* `brain/bzPilot.mjs` into it — capped at six, because a room is a room and not a datacentre |
| **Stop all** | and it stops what it started, including on engine exit |
| **Drive it** | fills itself in: `?url=…&room=arena`, so the room is never typed twice |
| **Probe (observer)** | connects `bz/net/bzfsClient.mjs` to a real `bzfs`, says hello, and reports what the server said |

The pilots' stdout is **parsed rather than plumbed**: `bzPilot.mjs` already prints
`peers=1 kills=3 losses=2 shots=9 policy=learned` every ten seconds, and reading the line it already writes is better
than teaching it a second way to say the same thing.

**These routes spawn processes.** Every one is behind the server's own `_isTrustedReq` — host, authenticated session,
or a LAN peer the operator has exempted — and the bridge is handed that check rather than importing it, because a
bridge must not be able to decide for itself who is trusted. An untrusted request gets 403 before the body is read.

The probe is the one route that reaches the outside world, and it does nothing but talk: it connects as an
**observer**, never spawns a tank, never sends a position. It reports three outcomes and distinguishes them:
*accepted*, *reached and refused*, *no answer*. **Reached-and-refused is a result, not a failure** — it means the
handshake works and the server said no.

`bz/tools/bz-bridge-selfcheck.mjs` tests it the way it will be used: over real HTTP, spawning real processes, then
made to prove it stops them again. And it checks the panel against the bridge in both directions — every `/bz/` path
the HTML names is a route the bridge owns, and **every route the bridge owns has a button**. A panel that calls
`/bz/brains/start` renders perfectly and does nothing, and nothing in a browser tells you.

## Round eleven: the wire

The only round where nothing we already had helped. Every previous round could be checked against a `.bzw` file
sitting on disk. **A protocol cannot: it is checked against a server that is not here.**

So the discipline changed, and it is stated up front rather than discovered later.

- The **fifty-six message codes** are transcribed from `include/Protocol.h`, and they are not arbitrary: each is two
  ASCII characters. `MsgEnter` is `0x656e`, which is `"en"`. `MsgKilled` is `"kl"`, `MsgShotBegin` is `"sb"`,
  `MsgUDPLinkRequest` is `"of"`. The selfcheck asserts that for all fifty-six — a property the enum cannot fail
  silently — and names the three exceptions.
- The **framing, byte order, field widths and fixed-point encoding** are transcribed from `src/net/Pack.cxx`,
  `src/bzflag/ServerLink.cxx` and `src/common/PlayerState.cxx`, and the selfcheck asserts **exact bytes** for
  everything the client sends. Numbers worked out by hand from the source, written down, and checked against.
  A codec that round-trips against itself proves nothing: **two mistakes that agree are still two mistakes.**
- `bz/tools/bzfs-loopback-probe.mjs` runs the real client against a real TCP server over a real socket, through the
  handshake, the framing, the state machine, and every negative path: a version mismatch, a full server, a ban, a
  `MsgReject`, a `MsgSuperKill`, a hangup mid-handshake.

**Nobody has pointed this at a real `bzfs`.** There is no `bzfs` in this tree to point it at. A protocol client that
claims interop it has not observed is worse than one that says it has not.

### The handshake

    ->  "BZFLAG

"                        10 bytes, unframed
    <-  "BZFS0221" + one byte playerId          9 bytes, unframed; 0xff means the server is full
    ->  MsgEnter                                framed; 247 bytes of payload
    <-  MsgAccept, or MsgReject, or MsgSuperKill

The hello is **not framed**, and reading it with the frame parser would see a length of `0x425a` — `"BZ"` — and wait
forever for seventeen kilobytes that are not coming. And `"REFUSED:"` where the version should be means you are
banned.

`sendEnter` sizes its buffer with `PlayerIdPLen` and **then never writes it**: the payload is 247 bytes, of which the
last is a zero nobody put there. Reproduced, because a server that checks the length would reject 246 and there is no
way to know which without asking one.

### The finding: C does this in `float`, not `double`

A player's position travels as `int16`, scaled:

    smallScale     = 32766.0f
    smallMaxDist   = 0.02f  * smallScale
    posShort       = (int16_t)((pos * smallScale) / smallMaxDist)

In exact arithmetic the scale **cancels**: that is `pos / 0.02`, which is `pos * 50`. Velocities are `× 100`, angular
velocity `× 1000`, and only the azimuth keeps the 32766, because it is scaled by π rather than by a round number. The
constant that looks like the point of the encoding is arithmetically absent from three of its four fields.

**Except that `0.02f * 32766.0f` is not 655.32.** It is `655.3200073242188`, because `0.02` has no exact float.
Divide 32766 by it and you get `49.99999…` in double and `50.00000…` in float — and `(int16_t)` truncates toward
zero. **One metre packs to 49 if you compute in double and 50 if you compute in float.** BZFlag computes in float.
Meanwhile one radian per second, whose scale "cancels to 1000", lands at `999.99997` and packs to **999**.

Nothing about that is visible from a round trip. Only bytes asserted against the source could show it, and they did:
`0x0032`, `0x0064`, `0x03e7`.

### What is not here

**UDP.** `MsgUDPLinkRequest` is written and never sent. BZFlag moves player updates onto a UDP channel once the
server answers `MsgUDPLinkEstablished`, and a client that opened it without handling the reordering, the 68-byte cap
and the dual-path dispatch would be pretending. TCP-only is a laggier client, not a broken one, and it is what the
server's own fallback path exists for.

## Round nine: the doorway goes somewhere

`link` has been parsed since round one and meant nothing: the arch was solid and the doorway sent you nowhere. The
bookkeeping under it is stranger than the geometry, and the strangest rule is the one that let it go unnoticed for
eight rounds. From `LinkManager::doLinking`:

> **"fill in the blanks (passthru linkage)"**

**Any teleporter face with no destination links to the opposite face of the same teleporter.** An unlinked teleporter
is a doorway. That is why `link` could be ignored for eight rounds without anybody noticing.

And a link's `from`/`to` are **globs**, matched against `"<name>:f"` and `"<name>:b"` — so `from *:f` links every
front face in the map. Only the *last character* of the glob is case-folded, so `gate:F` matches and `GATE:f` does
not. An unnamed teleporter is called **`/t<index>`**, not `<index>`.

Which means a link that says `from 0` **matches nothing** — and `hix.bzw`, BZFlag's own shipped map, has sixteen of
them. **All sixteen are broken.** The map plays perfectly, because every face falls through to a doorway. The
selfcheck asserts that, against the real file.

The transfer itself (`getPointWRT`) throws the **x coordinate away** and replaces it with the destination's own
half-thickness on the far side. You do not arrive "where you were relative to the door"; you arrive *at* the far door,
on its far side, at the same height and offset across it. A wide teleporter linked to a narrow one **squeezes** you —
that is `dimsScale`, and it is deliberate. Entering one face and leaving the other preserves your heading exactly,
because the two 180° spins cancel. Entering and leaving the *same-numbered* face spins you 180°, and that falls out of
the formula rather than being a special case.

### A roof above you is a ceiling

Driving through the doorway teleported the tank **onto the lintel**, twenty metres up. `groundHeightAt` had consulted
every roof and taken the tallest, since round three — which never bit, because a box's roof is the only surface a box
has, and a tank driving at a box is stopped by its wall long before it reaches the top. A teleporter's lintel is
twenty metres up with nothing underneath it. Three rounds of physics tests never noticed, because no test drove
through a doorway.

### Zones

A `zone` with a `team` list is where those teams come back; `findSpawn` samples inside a matching one, in its own
rotated frame. A team with no zone spawns anywhere, which is what a map without zones means.

**Flags are named, and not implemented.** `flagZones()` returns where they would land, and that is all the map says.
What a flag *does* is sixty game rules, not a map feature. Naming that boundary is better than pretending to a flag
system.

## Rounds seven and eight: the format is finished

**Every object keyword in a `.bzw` is now read.** `arc`, `cone` and `sphere` are the last three, and upstream they
are not obstacles either — `ArcObstacle`, `ConeObstacle` and `SphereObstacle` each build a `MeshObstacle` and hand
it over. So do these. Round four built the pipeline; this is what pours into it.

**The vertices are BZFlag's, exactly. The triangulation is ours, and equivalent.** Upstream lays out its
`8·divisions²` sphere faces with a page of index arithmetic; the surface it describes is the surface these vertices
describe, and a mesh collides and contains by its surface. So the faces are generated rather than transcribed, and
what is proved is what *matters* rather than what was typed:

| shape | exactly |
|---|---|
| `sphere divisions 1` | an **octahedron**, enclosing `(4/3)·a·b·c` |
| `sphere hemi divisions 1` | a pyramid on a square base, `(2/3)·a·b·c` |
| an N-sided cone | `(1/3) · (½·N·sin(2π/N)) · a·b · h` |
| an N-sided full pie | a cylinder: `(½·N·sin(2π/N)) · a·b · h` |
| an N-sided ring | the difference of two of those |
| any sphere | `8·divisions²` faces, BZFlag's own count |

To nine decimal places, not "about". And the volume rises monotonically toward `(4/3)·π·a·b·c` as `divisions` grows,
which is the only sense in which a polyhedron is a sphere.

Three rules that look like mistakes and are not: **`ratio` is not an inner radius** — the inner radius is
`size[0]·(1−ratio)`, so the default of `1.0` is a solid pie. A cone or arc that does not sweep a full circle puts
its **check point off-centre**. And a `sphere` with `divisions 1` really is an octahedron.

### The material family, and a third word in the coverage report

`material` is read, and `matref` resolves — including a material that inherits another and then overrides it.
`transform` is genuinely *handled*, because a named transform **is** the transform stack round one already applies;
it only needed somewhere to look the name up. Per-face `matref` means a mesh's colours are per-vertex, not per-part.

`textureMatrix`, `dynamicColor`, `physics` and `weapon` are **recorded**. Parsed, kept by name, inspectable — and
nothing animates, and nothing shoots. Calling them *handled* would be the report lying in the direction that flatters
us; calling them *ignored* would be lying in the other. So the coverage report grew a third category and prints two
percentages: **100% read, and how much of it is simulated.** That distinction is the entire reason for having a
coverage instrument.

    == bz/maps/arena.bzw
    objects: 37/37 read (100.0%), of which 2 recorded and not simulated

### Three bugs, and one of them was mine twice

- **A ring's check point was landing in its hole.** `containsPoint` casts a ray from the query point *at* a check
  point and calls the query point inside if the ray crosses no face — so a check point outside the solid makes the
  **entire world** inside it. A quarter-ring's hole is not even enclosed, so every tank in `arena.bzw` was inside an
  arch. Nothing about this is visible: the shape draws perfectly. `bz-shapes-selfcheck` now asserts, for all ten
  shape variants, that each contains its own check point and does not contain a point two hundred metres away.
- **A quarter ring's end caps were wound backwards.** Their winding is forced by the faces they share an edge with,
  and `manifoldCheck` called it a doubled directed edge.
- **Mesh collision had no broad phase**, and it is not an optimisation — it is the difference between a game and a
  hang. Round four walked every face of every mesh every frame; a tetrahedron has four and nobody noticed. A
  128-face dome stopped the pilot selfcheck finishing. A mesh knows its own bounding box.

And `material`, `transform`, `physics` and `weapon` are not obstacles — the emitter was filing all five under
*ignored*, so the world reported five things it had read as five things it had not. Precisely the direction a
coverage instrument must never lie.

## Round ten: the brain learns

`bz/bzPilot.js` always kept the counterfactual — the target it *would* have shot. Round ten gives it somewhere to
send it.

There are two policies now. Endless Sky's scores a hostile ship; BZFlag's scores an enemy tank. They share **every
line of the maths** (`brain/linearPolicy.js`) and **not one feature**. Copying the learner would have been two files
that drift. Sharing the *features* would have poisoned a trained model with numbers that are not about anything —
and the corruption would be invisible, because the weights would still be finite, still in band, still served.

So the maths moved into `linearPolicy.js` and each game brings a **schema**: weight names, feature names, a hand
policy, bounds, a score. `isFeat` is the wall, and `bz/tools/bz-tactics-selfcheck.mjs` tries it from both sides over
real HTTP: a ship's sample posted to `/ai/brain/bz/tactics` is **rejected**, not clipped, not averaged in with a zero.

The tank's four features, and why they are the ones:

| feature | meaning |
|---|---|
| `near` | 1 at zero range, 0 at `_shotRange`. The only one a hand policy could get right alone. |
| `ahead` | 1 dead ahead. A tank turns at 45°/s; a target behind you is two seconds you spend not shooting. |
| `exposed` | 1 if the muzzle has a clear line. A pilot that scores this low is a pilot staring at a wall. |
| `airborne` | 1 if the target is jumping. Hard target, or helpless one? The hand weight says *avoid*, and **it may well be wrong.** That is exactly the sort of thing a policy should learn rather than a person guess. |

`ai-bridge/bzTacticsBridge.js` owns `/ai/brain/bz/tactics`, its own file on disk, its own buffer. The three honesty
rules are the ES bridge's, unchanged: **an untrained policy is not served** (`source: "hand"`, weights `null`, and
the pilot keeps its own defaults); a decision with no counterfactual is rejected, not absorbed; the buffer is capped
and persisted, so training is reproducible from disk. And the gradient is **averaged, not summed** — the lesson the
ES policy learned the hard way, where eighty identical samples drove one weight straight into its clamp.

    node WebGLEngine/brain/bzPilot.mjs --dry-run                     # policy: hand
    SWEK_BZ_BRIDGE=http://127.0.0.1:8787 node .../bzPilot.mjs --dry-run
    # policy: learned from 12 decisions -- {"wBias":0,"wNear":1,"wAhead":0.6,"wExposed":2.4,...}

The pilot checks what it is handed — finite, in band, all five weights present — because a pilot that drives on
numbers it cannot check is a pilot with no floor under it.

## Two bugs that no headless test could have caught, and now can (v2186)

Both were reported by driving the thing, which is the only way they could have been. Both are now checked.

- **The tank spawned sixty metres in the air.** It fell for three and a half seconds before anything you pressed did
  anything. Nothing in the physics suite noticed, because nothing in the physics suite ever chose the spawn.
- **The chase camera framed the whole map** — 360 metres back from a six-metre tank in a four-hundred-metre world.
  Every key worked and nothing appeared to move, because a tank crossing 25 m/s is a pixel a second at that range.

`bz/tools/bz-page-selfcheck.mjs` now **boots `bzflag.html`'s own module script** under a stub DOM and a stub WebGL2
context, holds W down for a second, and checks the tank moved. It cannot tell you the shading is wrong. It can tell
you the page booted, the map loaded, the keyboard is wired to the physics, the gun goes cold when you fire, and the
tank starts on the ground. Every round before this one ended with "RIG-ONLY: driving it." That was true of the pixels
and it was never true of the code.

## Round six: the browser joins the room

`bz/bzNet.js`, and it is small, because none of the hard parts are BZFlag's. `ev/presence.js` carries the tank;
`ev/esAuthority.js` carries the damage. Both were written for a game about spaceships and **neither had to change**.

A tank's id is `<peerId>:0` — a private wing of one — so `ownerOf` hands it straight back to its pilot without a
hash. When your shot lands on somebody else's tank you do not kill it. You **report the hit, addressed to them**,
and they decide what it did. The damage amount is `1`, because one shot kills and the amount is meaningless; `9999`
is what tripped `validateDamage`'s 2000 cap in round five and killed nobody for sixteen straight hits.

Point the viewer at a room and you drive against the brain:

    node cloud/swek-rendezvous/server.js                                  # PORT=8788
    SWEK_BZ_URL=http://127.0.0.1:8788 SWEK_BZ_ROOM=arena node WebGLEngine/brain/bzPilot.mjs
    open bzflag.html?url=http://127.0.0.1:8788&room=arena

Bots are tinted, so you can tell the GPU Brain from a person.

**And `bz/bzNet.js` is pure**, which is why `bz-live-probe.mjs` can play the browser's part with no browser: a
headless peer that sees a real `brain/bzPilot.mjs` process, walks a shot into its hull, reports the hit through
exactly the code `bzflag.html` runs, and watches the pilot die of it — then refuses that same event itself, because
it is not its tank. Twenty-five checks against two live brain processes.

One detail worth naming: a peer's `heading` comes back in degrees and its box must be turned by it. A shot two
metres off a tank's flank misses (it is 2.8 m wide) and one 2.9 m along its length hits (it is 6 m long). Drawing the
ghost right and colliding with it wrong is the kind of bug nobody sees.

## Round five: the GPU Brain drives

**When could the brain start driving?** As soon as a shot could hit a tank. Everything else already existed, and this
round is mostly a proof of that:

- `bz/bzTank.js` was already pure and headless. It does not know what a canvas is.
- `bz/bzPilot.js` decides — the same shape as `ev/esTactics.js`: a weighted score over features, a chosen target, and
  the runner-up it was chosen over. Keeping that counterfactual is what makes an outcome teachable; a decision with
  no alternative carries no gradient.
- `ev/presence.js` carries the tank. A ship never needed a `z`; a tank jumps, so presence grew one — and an Endless
  Sky packet is byte-identical to what it was.
- `ev/esAuthority.js` carries the damage. `damageEvent`, `validateDamage`, `noteAccepted`, `wingId` — **none of it
  ever knew it was about spaceships.** A tank is an npc with a name.

The rule those files encode, and the reason none of it needed rewriting: *a peer may shoot anything, and may only
apply damage to what it owns.* `brain/bzPilot.mjs` owns one tank. When its shot lands on somebody else's, it reports
the hit, addressed to them, and lets them decide what it did.

`bz/tools/bz-live-probe.mjs` boots the real rendezvous server, runs **two real `brain/bzPilot.mjs` processes**, joins
as a third peer, and watches them find and kill each other. Seventeen checks: both tanks reach the room, red accepts
a hit on red's tank and blue does not though blue fired it, the observer accepts nothing, the killer is named, and the
killer learns of its kill by watching the victim's `hp` reach zero — a pilot who merely *leaves* is not a kill.

### What the pilot taught me

Three of its own bugs, each found by a test rather than by watching:

- **A fixed aim tolerance is wrong at both ends.** A target's *angular* size decides whether a shot hits it: a tank
  is 2.8 m wide, subtending 0.14 rad at twenty metres and 0.009 at three hundred. The first draft used 0.045 for
  both and fired **twice in twenty seconds**. It now uses `atan2(halfWidth, dist)`.
- **A pilot that charges its target is never lined up when the gun is ready.** Reload is 3.5 s and a tank drives at
  25 m/s, so it crosses eighty-seven metres between shots. It fired once, aimed beautifully at nothing for three and
  a half seconds, and overshot. It stands off now, at 25–60 m.
- **An evasion must commit.** Re-deciding which way to turn every frame produces an oscillation — reverse, see clear
  ground, drive back in, repeat — and the unstick detector *fed* it, flipping the direction every 0.6 s and producing
  the very stillness it was watching for. Twenty seconds in a corner and it moved four metres. Direction *and*
  throttle are chosen once and held. It now escapes 237 metres.

And one the safety rails caught: the shooter sent a damage amount of `9999` to mean "definitely fatal".
`validateDamage` caps damage at 2000, so sixteen hits landed on the ring and **nobody ever died**. One shot kills;
the amount is meaningless, and it is 1 now. The rail was right.

Measured: in an empty world two of these pilots fire **115 shots and land 93** — an 81% hit rate. On `arena.bzw` the
same pilots fire **three times in five minutes**, because they will not shoot through a box and `arena.bzw` is full of
boxes.

**Not here, and not pretended:** the policy is a *hand* policy. It records the feature vector it chose and the one it
beat, and it computes the ±1 outcomes a learner would want, but there is no tank-shaped policy on the bridge yet, so
it posts them only when `SWEK_BZ_BRIDGE` is set. Feeding a tank's features to Endless Sky's tactics policy would
poison a working model with numbers that mean nothing to it. That is round seven.

## Round four: the mesh family

`bz/bzMesh.js`. The largest thing left in the format, and the one everything else in it turns into. `mesh`, `tetra`,
`meshbox` and `meshpyr` are read; `arc`, `cone` and `sphere` are procedural generators *into* this same pipeline and
are round five.

A `face` is closed by `endface`, not by `end`, so faces are reassembled from the flat parameter lines a
line-oriented format gives you. A mesh's vertices go into **world space at build time** — its own transform stack and
its group's are applied to them — so a mesh, unlike round three's box, **never needs the `approx` flag**. A sheared
mesh is exactly a sheared mesh.

### Two facts about mesh collision that nobody would guess

Both reproduced, not improved upon. A port that quietly fixes its source is a port you cannot trust about anything
else.

- **`MeshObstacle::inBox` ignores the tank's box.** It tests the tank's *midpoint* and nothing else — the `dx`, `dy`
  and `angle` it is handed are marked `UNUSED` in BZFlag's own source. What actually stops a tank is each `MeshFace`,
  which is registered as an obstacle in its own right. So mesh collision here is: the midpoint against
  `containsPoint`, **or** any face against the tank's oriented box (a separating-axis test over the box's three axes,
  the face's normal, and the nine cross products between their edges).
- **`containsPoint` needs an `inside` or an `outside` point to answer at all.** With neither, `checkCount <= 0` and
  it returns `false` for *every point in the universe*. A mesh that forgets to declare one is a mesh whose volume
  contains nothing — you can drive through the middle of it, though its walls still stop you. That is upstream
  behaviour, and the selfcheck asserts it.

The rule itself: from the query point, cast a ray at each `inside` point; if it crosses no face, the point is inside.
From each `outside` point, cast a ray at the query point; if it crosses no face, the point is outside. If nothing
decided, the answer is `return hasOutsides`.

### What the mesh found

- **A face's `drivethrough` leaked to the whole mesh.** `drivethrough` is a legal word at both mesh level and face
  level, and they arrive in one flat list. Reading it without watching for `face`/`endface` made one open face open
  all six. `arena.bzw` now has a bunker whose north face alone is drive-through, and it is asserted from both sides.
- **`restingHeight`'s 5 cm search was too coarse.** A tank landed five centimetres above a mesh roof, which nothing
  notices until something measures it. It now bisects after the coarse climb.

Proved, as everything else is: a mesh cube encloses 3,200 cubic units and is a closed, outward-wound solid; a
tetrahedron is a sixth of the box that contains it, whatever order its vertices arrived in; a `meshbox` encloses what
a `box` of the same size would; 100 seconds of driving around `arena.bzw` — mesh, tetra, meshbox, meshpyr and all —
never leaves the tank inside anything.

## Round three: something that drives around inside it

`bz/bzTank.js` and `bz/bzCollide.js`. Physics is the *other* thing you can settle headlessly, so it is settled:
a jump reaches `v²/2g` and no higher; a tank driving at a box stops at the box's face minus half its own length and
two more seconds of pushing does not move it a millimetre; a shot travels `_shotRange` and dies. None of that needs
an eye. **27,000 frames of driving, turning and jumping across BZFlag's own maps, and the tank is never inside an
obstacle, never outside the walls, never below the floor.**

Every number comes out of the state database, because in BZFlag every number does. `_tankRadius` is the string
`"0.72 * _tankLength"`; `_reloadTime` is `"_shotRange / _shotSpeed"`, which is **3.5 seconds and is written nowhere**.
Round one built the expression evaluator for the sake of a box's default size. This is what it was really for.

The collision predicate is `Obstacle::inBox` — two oriented rectangles in the plane plus a z overlap. A pyramid is
the same test against a rectangle that **shrinks with height**, which is a neat trick: a solid nobody has to
triangulate. Two honest departures, both named in the source and both tested:

- Where BZFlag's `testOrigRectRect` classifies corners into nine regions, we use the **separating axis theorem**.
  Same predicate for convex rectangles, four lines instead of forty. Rather than transcribe BZFlag's algorithm to
  compare against — which would test a copy against its original — it is checked against an **independent oracle**:
  two convex polygons overlap iff a vertex of one is inside the other, or two edges cross. Ten thousand random
  pairs, and they agree on every one.
- BZFlag's `inBox` uses a strict `<` on the top and a `>=` on the bottom, so a tank standing exactly on a roof is
  **not inside the building**. That asymmetry is load-bearing — reverse it and you cannot stand on anything — and it
  is reproduced exactly.

The collision *response* is ours and is labelled as such: try the whole move, then each axis alone, then stop. It
slides along a wall and never tunnels. It is not BZFlag's normal-and-bounce.

### Three bugs the tank found

- **Grouped obstacles collided at their local position.** Round one stored a group's transform alongside the
  obstacle and left `pos` in the group's frame. Geometry coped, because it applies the transform. Collision did not,
  because it reads `pos`. A tank drove straight through every corridor in `arena.bzw`. A rigid transform — a
  position, a z-rotation, a uniform scale — is now **baked** into `pos`/`rotation`/`size`, so every reader sees one
  representation. A shear or a non-uniform scale cannot be, so it is kept, the obstacle is flagged `approx`, and the
  world counts them.
- **Falling ignored obstacles.** `groundHeightAt` finds the tallest *flat* roof, which is enough for a box and
  useless for a pyramid — a pyramid has no roof, it has a slope. The tank dropped to the floor, and the floor was
  inside the pyramid: **4,031 frames out of 6,000** in `arena.bzw` had the tank standing in something.
  `restingHeight` climbs from the flat answer until the tank is free, which is how a tank ends up perched on one.
- **A turn can collide.** A tank's footprint is 6 by 2.8, so rotating it sweeps a wider box than it occupied. The
  first draft let turns through unchecked and a tank pressed against a wall rotated its own corners into it — and
  not one of those 4,031 frames was a *translation*. `LocalPlayer::doUpdateMotion` tests the new position **and the
  new angle together** and expels the tank; we refuse the turn.

Drive it with `bzflag.html`: W/S, A/D, space to jump, F to fire, C for chase or free camera. `bzflag-info.html` is
the page, and there's a mini-tab in `server.html`. Both compute their numbers in the browser from the map itself —
there is no `/bz/status` endpoint to go stale, and no number typed into the HTML by hand.

## Round two: geometry you can prove

`bz/bzGeom.js` turns the world into triangles, and `bz/tools/bzw-geom-selfcheck.mjs` proves them **without a GPU**.
Geometry is one of the few things you can settle headlessly, so it is settled rather than looked at:

- A closed solid has every undirected edge shared by **exactly two** triangles and every **directed** edge used
  exactly once — which is what "consistently wound" means.
- If that winding is outward, the divergence theorem gives a positive signed volume equal to the volume you can
  work out on paper: a box is `4·sx·sy·sz`, a pyramid is a third of that.

So the tests do not check that a box *looks* right. They check that it encloses exactly 240 cubic units, that no
triangle faces inward, that no edge is missing, and that reversing one triangle makes the check fail. Across
BZFlag's own maps: **all 128 boxes and pyramids are closed, outward-wound solids**, and the mesh's extent agrees
with the world model's, computed two independent ways, to the micrometre.

The things that are **not** solids say so. A wall is a one-sided plane in BZFlag (`WallObstacle`), a flat base
(`size 30 30 0`) is a pad, the ground is a quad — and **a teleporter is three boxes glued face to face**, so its
union is not a manifold. `teleporterMesh` hands back the three solids as well as the union: a renderer wants the
union, a proof wants the parts. Calling that union "closed" would be exactly the kind of lie this file exists to
prevent.

Two things the geometry caught in round one's world model:

- **A teleporter under-reported its own extent by a border.** `Teleporter::finalize` grows the obstacle: a
  vertical teleporter's real breadth is `size[1] + border` and its real height is `size[2] + border`. `size` is
  the *hole*. There is now an `outerSize`, and `boundsOf` uses it.
- **The walls have to face inward**, or back-face culling makes the arena invisible from the only place anyone
  stands in it. Four walls, four rotations, four normals pointing at the origin — asserted.

Normals are transformed by the **inverse transpose**, not the matrix, because a `.bzw` transform stack may
contain a non-uniform `scale` or a `shear`, and transforming a normal like a point is wrong the moment it does.

`bzflag.html` is the viewer: WebGL2, orbit camera, drop a `.bzw` on it. It puts the coverage report **on screen**,
because a viewer that hides what it did not read is a viewer that lets you believe the map is complete.

## Round one: the world file

| file | what it is |
|---|---|
| `bz/bzwParse.js` | the `.bzw` grammar |
| `bz/bzdb.js` | BZFlag's state database, and the expression language inside it |
| `bz/bzwWorld.js` | blocks → a world: obstacles, links, zones, groups, transforms |
| `bz/bzCoverage.js` | what the adapter consumes, and what it does not |
| `bz/bzw-build.mjs` | bake a map to JSON, coverage report included |
| `bz/tools/bzw-selfcheck.mjs` | 100 checks; 109 against a real BZFlag checkout |
| `bz/bzGeom.js` | obstacles → triangles, and the proofs a test can run on them |
| `bz/tools/bzw-geom-selfcheck.mjs` | 66 checks; 68 against a real BZFlag checkout |
| `bz/tools/bzw-coverage.mjs` | the report, and its drift guard |
| `bz/net/bzWorldDb.js` | the world's envelope, its MD5, and its deflate |
| `bz/net/bzWorldSections.js` | the ten sections, walked as far as they can be trusted |
| `bz/net/bzWorldAdapt.js` | a server's world, in the shape the engine speaks |
| `bz/tools/bzfs-real-probe.mjs` | 54 checks against a `bzfs` built from BZFlag's source |
| `bz/tools/bz-sections-selfcheck.mjs` | 54 checks, against a separately-transcribed encoder |
| `bz/tools/bz-world-selfcheck.mjs` | 40 checks, and the ten sections named |
| `bz/net/bzToken.mjs` | a token from the list server, and never a password in a log |
| `bz/net/bzUdp.js` | the fast lane, and the 68-byte cap BZFlag does not check |
| `brain/bzfsPilot.mjs` | the GPU Brain, on somebody else's server |
| `bz/tools/bz-play-selfcheck.mjs` | 66 checks: the token, the routing, the shot |
| `ai-bridge/bzBridge.js` | `/bz/*` — the room, the brains, the probe, the play |
| `bz/tools/bz-bridge-selfcheck.mjs` | 51 checks: real HTTP, real processes, and the panel's contract |
| `bz/net/bzPack.js` | BZFlag's network byte order, one integer at a time |
| `bz/net/bzProtocol.js` | the fifty-six codes, the framing, the messages |
| `bz/net/bzPlayerState.js` | the fixed point, in `float` and not `double` |
| `bz/net/bzfsClient.mjs` | connect to a real BZFlag server |
| `bz/tools/bz-protocol-selfcheck.mjs` | 90 checks; exact bytes, by hand, from the source |
| `bz/tools/bzfs-loopback-probe.mjs` | 21 checks over a real socket |
| `bz/bzLinks.js` | globs, face numbers, and the passthru rule |
| `bz/bzTeleport.js` | crossing, and where you come out |
| `bz/tools/bz-teleport-selfcheck.mjs` | 82 checks; 88 against a real BZFlag checkout |
| `bz/bzShapes.js` | arc, cone, sphere — vertices from BZFlag, triangles from us |
| `bz/bzMaterial.js` | materials, named transforms, and four things recorded but not simulated |
| `bz/tools/bz-shapes-selfcheck.mjs` | 111 checks; 113 against a real BZFlag checkout |
| `brain/linearPolicy.js` | one contrastive learner, many schemas |
| `brain/bzTacticsPolicy.js` | the tank's schema: four features, none of them a ship's |
| `ai-bridge/bzTacticsBridge.js` | `/ai/brain/bz/tactics` — serve, learn, refuse |
| `bz/tools/bz-tactics-selfcheck.mjs` | 65 checks, incl. the wall over real HTTP |
| `bz/tools/bz-page-selfcheck.mjs` | 22 checks: boots the page and presses W |
| `bz/bzNet.js` | a tank on the wire: presence, owner-addressed hits |
| `bz/tools/bz-net-selfcheck.mjs` | 45 checks |
| `bz/bzCombat.js` | shots that hit tanks; one shot kills; respawn |
| `bz/bzPilot.js` | what a tank decides to do. Pure. |
| `brain/bzPilot.mjs` | the GPU Brain, driving one |
| `bz/tools/bz-pilot-selfcheck.mjs` | 72 checks |
| `bz/tools/bz-live-probe.mjs` | 25 checks, against two real brain processes |
| `bz/bzMesh.js` | the mesh family: faces, check points, `containsPoint` |
| `bz/tools/bz-mesh-selfcheck.mjs` | 84 checks; 86 against a real BZFlag checkout |
| `bz/bzCollide.js` | `inBox`, by way of the separating axis theorem |
| `bz/bzTank.js` | the tank: BZDB constants, motion, sliding, shots |
| `bz/tools/bz-tank-selfcheck.mjs` | 81 checks; 84 against a real BZFlag checkout |
| `bzflag.html` | drive it: WebGL2, W/S/A/D, space, F, C |
| `bzflag-info.html` | the page: links, downloads, live coverage |
| `bz/maps/arena.bzw` | an original map exercising every rule the adapter claims |

## The grammar is not what I expected

Coming from Endless Sky's indentation tree, I assumed another one. A `.bzw` is strictly **line-oriented**
(`src/bzfs/BZWReader.cxx`):

- The **first token of a line is the keyword**; everything after it is that keyword's parameters, and everything
  the keyword did not consume is **discarded** — the reader ends every iteration with "discard remainder of line".
  So `name HiX 2.0` names the world `HiX`, because `input >> name` reads one token.
- Keywords are **case-insensitive** (`strcasecmp` throughout). Their values are not.
- `#` starts a comment **only as the first character of the first token on a line**. Nothing else in the file
  treats it specially — `size 1 2 3 # tall` parses fine, because the three numbers are read and the rest is thrown
  away, and `size # 1 2 3` reads nothing at all.
- An object keyword opens a block; `end` closes it; blocks do not nest. `define`/`enddef` name a group; `group`
  instantiates one, with a location and a transform stack of its own.
- `include` exists and is undocumented upstream. We record it and do not follow it: a parser that reads the
  filesystem is a parser that cannot be tested.

## The defaults are an expression language

The first thing a parser needs is the defaults, and in BZFlag they are not constants. A box with no `size` is
`_boxBase` × `_boxBase` × `_boxHeight`, and `_boxHeight` is the **string** `"6.0*_muzzleHeight"`. The database
stores strings and evaluates on demand: `+ - * / ^`, parentheses, unary minus, variables resolving to other
entries. All 167 defaults are transcribed from `src/common/global.cxx` **as written**. Transcribing the evaluated
numbers would have been easier and would have quietly frozen a relationship the game means to keep — change
`_tankHeight` and every pyramid changes with it, because `_pyrBase` *is* `4.0*_tankHeight`.

## Rules that will rot if nobody watches them

Each is pinned in the selfcheck:

- **`world { size 400 }` is an 800-unit world.** `CustomWorld::read` multiplies by two before it stores.
- **`size` is a half-extent in x and y, and a full height in z.** A 30×30 box is 60 units wide.
- `rot` / `rotation` is degrees in the file and radians everywhere after.
- `passable` is exactly `drivethrough` + `shootthrough`.
- A pyramid with a **negative z size** hangs from its apex, the same as the `flipz` flag.
- A teleporter's default size comes from three separate BZDB values with three different multipliers, and its
  default border is twice its x size.
- A base's `color` outside 1–4 is **recorded as invalid, not clamped** into somebody else's team.

## What it does with a real map

`hix.bzw`, BZFlag's experimental world: 147 objects, all handled, no warnings. It names itself `HiX` (not
`HiX 2.0`), says `size 400` and is therefore 800 units across, sets `flagHeight` to zero and means it, has four
bases and sixteen teleporter links — and reaches exactly `30·√2 = 42.4` units *past* its own wall, because eight
30×30 boxes are set into that wall at 45°. That last number is the one that proved the rotation and the
half-extent were both right: it is the map, not the parser.

## Coverage, and the guard on it

`bz/tools/bzw-coverage.mjs --selfcheck` checks the coverage tables against the adapter source **in both
directions** — a declared keyword the builder never quotes is over-claiming; a keyword reported as ignored that
the builder plainly reads is under-claiming. This is the first thing built, not the last, because the Endless Sky
adapter learned it expensively: its table drifted both ways at once and its selfcheck could not see either.

The guard fired on its first run and taught me something: `bzwParse.js` names *every* object keyword, including
`mesh` and `sphere`, because a parser has to know where a block ends before it can know whether it understands it.
Quoting a keyword there means "I can find its `end`", not "I read it". So the reverse guard reads only the world
builder.

## Not read yet, and counted as such

- Nothing. Every object keyword is read; four of them are recorded and not simulated, and the report says which.
- The **material family**: `material`, `textureMatrix`, `dynamicColor`, `physics`, `transform` (as a named,
  reusable definition — the inline `shift`/`scale`/`spin`/`shear` stack *is* read).
- `weapon` — the 9 in `fountains.bzw` are the only ones in any shipped map.
- `zone` is parsed but is a server concept: flags, spawns and safeties are recorded, not simulated.
- `options` is kept verbatim, for a server that does not exist yet.
## The rounds left, in order

| round | what | why it is where it is |
|---|---|---|
| ~~7~~ | ~~`arc`, `cone`, `sphere`~~ | **done, v2187.** |
| ~~8~~ | ~~the material family~~ | **done, v2187.** |
| ~~9~~ | ~~teleporters, `zone` spawns~~ | **done, v2188.** Flags are named, not implemented: sixty game rules, not a map feature. |
| ~~10~~ | ~~a tank-shaped tactics policy~~ | **done, v2186.** |
| ~~11~~ | ~~the real `bzfs` wire protocol~~ | **done, v2189** — TCP, bytes asserted against the source, and nobody has pointed it at a real server. |

**Nothing in the `.bzw` format is ignored any more, the doorway goes somewhere, and the client speaks the wire.**

What remains is not a round, it is an experiment: point it at a real `bzfs` and find out what is wrong. The token and
UDP were the two named unknowns and both are now built and tested against stand-ins. ## The rounds still open

| | |
|---|---|
| **`groupInstances`** | `GroupInstance::pack` encodes a material map inside a **fake string whose bytes are read back as integers**. The last record in the obstacle path. A map with `define`/`group` stops the walk today, by name. |
| **`worldWeapons`, `entryZones`** | sections nine and ten, past the water level. Nothing needs them; they are the difference between "a whole map" and "the whole database". |
| **flags** | sixty game rules, not a map feature. `flagZones()` says where they land and that is all the map says. |
| **a tank-shaped policy trained on a real server** | the bridge and the learner exist; nobody has left two brains fighting on a `bzfs` long enough to teach one. |
| **a public server** | and the real list-server token. Needs a network this machine does not have. |
| **the browser against a `bzfs`** | a browser cannot open a TCP socket, so this wants a WebSocket proxy. Named, not started. |

`hix.bzw` has no group instances. `arena.bzw` does not either. A map that does will say so.

    node brain/bzfsPilot.mjs --host <server> --port 5154 --callsign brain --map <the server's .bzw>
- A mesh face is assumed **convex**. BZFlag requires planar and does not require convex; a concave face's collision
  would be too generous. Counted as an assumption, not a claim.
- Flags are named, not implemented. `options` is still kept verbatim for a server that does not exist.

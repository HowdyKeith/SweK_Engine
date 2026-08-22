// WebGLEngine/ev/esMuster.mjs -- convene a SQUAD of brain bots into a LAN room for a skirmish.
//
// The bots already exist: ev/evBot.mjs (a pirate that joins the presence room real pilots use, hunts the nearest
// player, and -- since v2321 -- leads its target so its shots actually land) and brain/esPilot.mjs (the GPU Brain
// client that takes the system's hostiles and flies them with the learned tactics policy). Both are headless, join
// the SAME http presence relay, and rely on esAuthority's rendezvous hashing to split ownership with NO coordinator:
// add a bot and it instantly gets a fair share; drop one and only its ships migrate.
//
// What was missing was the CONVENE step -- a lobby-side plan that says "muster N bots into room R over system S",
// checks the ownership split is complete + fair + stable before anything launches, and hands back the exact
// commands to bring them up. This is that. It touches no network: it plans and verifies against esAuthority, the
// same pure logic the live bots use, so the lobby can preview a skirmish and only then spawn the processes.
"use strict";

import { ownerOf, weight } from "./esAuthority.js";

// assign each npc in the system to exactly one bot in the squad (rendezvous hashing). Private wings ("<id>:<n>")
// stay with their spawner. Returns the ownership map + per-bot counts.
function assign(botIds, npcIds) {
    const owners = {}, counts = {}; for (const b of botIds) counts[b] = 0;
    for (const n of npcIds) { const o = ownerOf(n, botIds); owners[n] = o; if (o in counts) counts[o]++; else counts[o] = (counts[o] || 0) + 1; }
    return { owners, counts };
}

// plan a muster: convene `botIds` over a system holding `npcIds`, and verify the split is safe to fly.
//   complete  -- every npc owned by exactly one bot in the squad (no orphans, no double-sim)
//   fair      -- no bot carries more than 2x its even share (rendezvous hashing balances by hash)
//   viable    -- every bot has at least one ship to fly (nobody idles in a skirmish)
function planMuster(botIds, npcIds, opts = {}) {
    botIds = botIds.slice().filter(Boolean); npcIds = npcIds.slice().map(String);
    const { owners, counts } = assign(botIds, npcIds);
    const complete = npcIds.every(n => botIds.includes(owners[n]));
    const share = npcIds.length / Math.max(1, botIds.length), maxOwned = Math.max(0, ...botIds.map(b => counts[b]));
    const fair = maxOwned <= Math.ceil(share) * 2;
    const viable = botIds.every(b => counts[b] > 0);
    const room = opts.room || "default", system = opts.system != null ? opts.system : 128;
    // the exact commands the lobby would run to bring the squad up (esPilot for brain-flown hostiles)
    const launch = botIds.map(b => `SWEK_PILOT_URL=${opts.url || "http://192.168.10.40:9999"} SWEK_PILOT_ROOM=${room} SWEK_PILOT_SYSTEM=${system} SWEK_PILOT_ID=${b} node brain/esPilot.mjs`);
    return { room, system, squad: botIds, npcCount: npcIds.length, counts, owners, complete, fair, viable, ok: complete && fair && viable, launch };
}

// when a bot leaves mid-skirmish, only ITS ships should change hands (the HRW stability property). Returns the
// fraction of npcs that migrate -- should be about one bot's share, never the whole field.
function churnOnDeparture(botIds, npcIds, leaver) {
    const before = assign(botIds, npcIds).owners;
    const after = assign(botIds.filter(b => b !== leaver), npcIds).owners;
    let moved = 0; for (const n of npcIds.map(String)) if (String(before[n]) !== String(after[n])) moved++;
    return { moved, frac: moved / Math.max(1, npcIds.length) };
}

export { planMuster, assign, churnOnDeparture };
if (typeof module !== "undefined" && module.exports) module.exports = { planMuster, assign, churnOnDeparture };

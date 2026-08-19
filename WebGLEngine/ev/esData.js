// WebGLEngine/ev/esData.js — Endless Sky -> Stellar Atlas universe adapter. Consumes the node tree
// from esParse.js and emits the SAME universe graph shape that ev/evData.js buildUniverse() returns,
// so galaxyMap.js / systemView.js / flightView.js / combat.js can fly an Endless Sky galaxy without
// changes. Endless Sky is GPLv3 and its data is freely redistributable; this file ships no content,
// it only transforms files the user fetched from the ES repo.
//
//   import { parseESFiles } from "./esParse.js";
//   import { buildUniverseFromES } from "./esData.js";
//   const uni = buildUniverseFromES(parseESFiles(arrayOfFileTexts));
//   uni.systems / uni.spobs / uni.systemById / uni.ships / uni.govts / uni.outfits / uni.weapons ...
//
// Mapping notes (ES concept -> EV field):
//   system.pos            -> system.x, system.y
//   system.link "Name"    -> system.links = [systemId,...]   (resolved by name in pass 2)
//   system.government     -> system.govt  (govt id)
//   system.object{}       -> system.spobs = [spob,...]  (orbit distance+offset -> local x,y)
//   planet{}              -> enriches the matching named object (govt, techLevel, landing text)
//   ship.attributes       -> shield(=shields) armor(=hull) + motion derived from engine outfits
//   outfit with weapon{}  -> also registered in uni.weapons
//   government.attitude    -> per-govt allies/enemies (each govt is its own "class")

"use strict";

import { buildPhrases, buildSentence } from "./esPhrase.js";   // v2175 -- the phrase grammar
import { buildSubstitutions } from "./esSubs.js";              // v2177 -- <token> text substitutions
import { buildFilter } from "./esLocation.js";                 // v2179 -- one LocationFilter

const DEG = Math.PI / 180;

// ---- id allocation: EV resource ids start at 128; keep ES names -> stable ints per type ----
function makeIdAllocator(start = 128) {
    const map = new Map();
    let next = start;
    return {
        id(name) {
            const k = String(name);
            if (!map.has(k)) map.set(k, next++);
            return map.get(k);
        },
        has(name) { return map.has(String(name)); },
        get(name) { return map.get(String(name)); },
        map,
    };
}

function num(node, idx, dflt = 0) {
    if (!node) return dflt;
    const v = parseFloat(node.tokens[idx]);
    return Number.isFinite(v) ? v : dflt;
}

// Sum a numeric leaf attribute across a node's children by key (e.g. attributes -> "thrust").
function attrNum(attrNode, key, dflt = 0) {
    if (!attrNode) return dflt;
    const c = attrNode.get(key);
    return c ? num(c, 1, dflt) : dflt;
}

// Flatten an ES `attributes {}` block (and its nested weapon block is handled separately) into a
// plain { key: number|string } map. Repeated keys keep the last value; that is fine for stats.
function flattenAttributes(attrNode) {
    const out = {};
    if (!attrNode) return out;
    for (const c of attrNode.children) {
        if (c.tokens.length >= 2) {
            const v = parseFloat(c.tokens[1]);
            out[c.tokens[0]] = Number.isFinite(v) ? v : c.tokens[1];
        } else {
            out[c.tokens[0]] = true;
        }
    }
    return out;
}

function spriteKind(spritePath) {
    const s = String(spritePath || "");
    if (s.startsWith("star/")) return "star";
    if (s.startsWith("planet/")) return "planet";
    if (s.startsWith("station")) return "station";
    return "planet";
}

function buildUniverseFromES(root) {
    const sysIds = makeIdAllocator(128);
    const spobIds = makeIdAllocator(1000);   // separate range so spob ids never collide with syst ids
    const shipIds = makeIdAllocator(128);
    const outfitIds = makeIdAllocator(128);
    const weapIds = makeIdAllocator(128);
    const govtIds = makeIdAllocator(128);

    // ---------- pass 0: index planet definitions by name ----------
    const planetDefs = {};
    for (const node of root.children) {
        if (node.tokens[0] !== "planet") continue;
        const name = node.tokens[1];
        if (name == null) continue;
        const govtNode = node.get("government");
        const hasTrade = !!(node.get("outfitter") || node.get("shipyard"));
        const descNode = node.all("description")[0];
        const landNode = node.get("landscape");
        const attrNode2 = node.get("attributes");
        const shipyardGroups = node.all("shipyard").map((n) => n.tokens[1]).filter(Boolean);
        const outfitterGroups = node.all("outfitter").map((n) => n.tokens[1]).filter(Boolean);
        const hasSpaceport = !!(node.get("spaceport") || node.get("description") || govtNode);
        const whNode = node.get("wormhole");              // v2172 -- `planet X { wormhole "Name" }`
        planetDefs[name] = {
            name,
            wormhole: whNode ? whNode.tokens[1] : null,
            govt: govtNode ? govtNode.tokens[1] : null,   // govt NAME, resolved later
            techLevel: hasTrade ? 6 : 0,                  // "has a market" proxy; refine later
            landDesc: descNode ? descNode.tokens[1] : "",
            landscape: landNode ? landNode.tokens[1] : "",   // ES landscape sprite path, e.g. land/mountain46
            attributes: attrNode2 ? attrNode2.tokens.slice(1) : [],   // for mission source/destination filters
            shipyardGroups, outfitterGroups, hasSpaceport,
            isStation: !!(node.get("attributes") && /station|spaceport/i.test((node.get("attributes").tokens || []).join(" "))),
        };
    }

    // ---------- pass 0b: index/parse outfits (ES weapons are outfits with a weapon{} child) ----------
    const outfits = {};
    const weapons = {};
    for (const node of root.children) {
        if (node.tokens[0] !== "outfit") continue;
        const name = node.tokens[1];
        if (name == null) continue;
        const id = outfitIds.id(name);
        const flat = {};
        for (const c of node.children) {
            if (c.tokens[0] === "weapon") continue;
            if (c.tokens.length >= 2) {
                const v = parseFloat(c.tokens[1]);
                flat[c.tokens[0]] = Number.isFinite(v) ? v : c.tokens[1];
            }
        }
        outfits[id] = Object.assign({ id, name }, flat);
        const w = node.get("weapon");
        if (w) {
            const wid = weapIds.id(name);
            weapons[wid] = {
                id: wid, name,
                reload: attrNum(w, "reload", 1),
                massDmg: attrNum(w, "hull damage", 0),
                energyDmg: attrNum(w, "shield damage", 0),
                speed: attrNum(w, "velocity", 0),
                guidance: w.get("homing") ? 1 : 0,
                lifetime: attrNum(w, "lifetime", 0),
                outfitId: id,
            };
        }
    }

    // ---------- pass 1a: governments (relations resolved in pass 2) ----------
    const govtsRaw = [];
    for (const node of root.children) {
        if (node.tokens[0] !== "government") continue;
        const name = node.tokens[1];
        if (name == null) continue;
        const id = govtIds.id(name);
        const color = node.get("color");
        const att = node.get("attitude toward");
        const likes = [], dislikes = [];
        if (att) for (const c of att.children) {
            const w = parseFloat(c.tokens[1]);
            if (!Number.isFinite(w) || w === 0) continue;
            (w > 0 ? likes : dislikes).push(c.tokens[0]);   // govt NAMES
        }
        // v2175 -- the four hails a government gives you. These are PHRASE NAMES, resolved at hail time
        // against uni.phrases. ES picks by whether the ship likes you and whether it is disabled.
        const hailName = (k) => { const n = node.get(k); return n && n.tokens[1] ? n.tokens[1] : null; };
        govtsRaw.push({
            id, name,
            color: color ? [num(color, 1, 0.6), num(color, 2, 0.6), num(color, 3, 0.6)] : [0.6, 0.6, 0.6],
            playerRep: num(node.get("player reputation"), 1, 0),
            defaultAttitude: num(node.get("default attitude"), 1, 0),
            likeNames: likes,
            dislikeNames: dislikes,
            hails: {
                friendly: hailName("friendly hail"), hostile: hailName("hostile hail"),
                friendlyDisabled: hailName("friendly disabled hail"), hostileDisabled: hailName("hostile disabled hail"),
            },
        });
    }

    // ---------- pass 0c: wormholes ----------
    // ES: `wormhole "Name" { mappable / link <from system> <to system> / color ... }`, and a planet in the
    // origin system claims it with `wormhole "Name"`. Links are DIRECTED -- the two-way ones in the base
    // game simply declare both directions -- so we keep the map as written and never infer a return trip.
    // Verified against endless-sky/source/Wormhole.cpp and data/map planets.txt (15 wormholes) at master.
    const wormholeDefs = {};
    for (const node of root.children) {
        if (node.tokens[0] !== "wormhole") continue;
        const name = node.tokens[1];
        if (name == null) continue;
        const links = {};
        for (const c of node.all("link")) if (c.tokens.length >= 3) links[c.tokens[1]] = c.tokens[2];
        wormholeDefs[name] = { name, mappable: !!node.get("mappable"), links };
    }

    // ---------- pass 0d: news ----------
    // ES: `news "name" { location <filter> / name <sentence> / message <sentence> / to show <cond> }`.
    // `name` and `message` are inline phrase bodies, and a news item may carry several `message` blocks
    // (219 items, 235 messages) -- one is chosen at random, exactly as a phrase picks among its sentences.
    //
    // `location` is a LocationFilter over PLANETS. We honour the four keys the base game uses -- planet,
    // system, government, attributes -- and `not`, which nests (there are 5 `not { not { ... } }`).
    // `neighbor` (1 item) we cannot evaluate, so that item is DROPPED and counted, never quietly matched.
    // 867 root `phrase` nodes -> 641 names (a name may be spread across files, and each block appends a
    // sentence). Plain data, so it bakes straight into es-universe.json.
    const phrases = buildPhrases(root);
    const newsOut = [];
    let newsDropped = 0;
    // v2179 -- one LocationFilter. This used to parse a subset of the grammar and DROP any news item it
    // could not evaluate; the one `neighbor` item in the base game was thrown away, and the attribute
    // rule was backwards (it required all of them where ES requires any).
    for (const node of root.children) {
        if (node.tokens[0] !== "news" || node.tokens[1] == null) continue;
        const loc = node.get("location");
        const filter = buildFilter(loc);
        const names = node.all("name").map(buildSentence).filter((x) => x.length);
        const messages = node.all("message").map(buildSentence).filter((x) => x.length);
        if (!names.length || !messages.length) { newsDropped++; continue; }
        // `to show` is TWO tokens; node.get() matches the first only, which would have made every gated
        // story ungated. The same shape of bug the coverage table had with `to offer`.
        const toShow = (node.children || []).find((c) => c.tokens[0] === "to" && c.tokens[1] === "show");
        newsOut.push({ id: node.tokens[1], filter, names, messages, toShow: toShow ? serializeNode(toShow, 0) : null });
    }

    // ---------- pass 0e: starts ----------
    // ES: `start "id" { name / description / thumbnail / date <d> <m> <y> / system / planet /
    // conversation <name> / account { credits / score / mortgage <name> { principal / interest / term } } /
    // <anything else> -> a condition assignment }` (StartConditions::Load: the fallthrough really is
    // `conditions.Add(child)`, which is how `set "license: Pilot's"` gets applied).
    //
    // `to unlock` / `to reveal` / `to display` and the `on display` / `on reveal` text belong to the start
    // PICKER, which shows locked scenarios as "???". We record whether a start is locked and skip the
    // rest: a start you cannot choose has nothing to tell the engine.
    const starts = [];
    for (const node of root.children) {
        if (node.tokens[0] !== "start" || node.tokens[1] == null) continue;
        const dn = node.get("date");
        const acc = node.get("account");
        const mortgages = [];
        let credits = 0, score = 400;
        if (acc) for (const c of acc.children) {
            if (c.tokens[0] === "credits") credits = num(c, 1, 0);
            else if (c.tokens[0] === "score") score = num(c, 1, 400);
            else if (c.tokens[0] === "mortgage") {
                const m = { name: c.tokens[1] || "Mortgage", principal: 0, interest: 0, term: 0 };
                for (const g of (c.children || [])) {
                    if (g.tokens[0] === "principal") m.principal = num(g, 1, 0);
                    else if (g.tokens[0] === "interest") m.interest = num(g, 1, 0);
                    else if (g.tokens[0] === "term") m.term = num(g, 1, 0);
                }
                if (m.principal > 0) mortgages.push(m);
            }
        }
        // Everything ES does not recognise becomes a condition assignment. Serialized whole so the same
        // esConditions.applyActions that runs a mission's `on offer` runs a start's opening state.
        const KNOWN = new Set(["name", "description", "thumbnail", "date", "system", "planet", "conversation", "account", "ship", "ships", "to", "on", "add", "remove"]);
        const conditions = (node.children || []).filter((c) => !KNOWN.has(c.tokens[0])).map((c) => serializeNode(c, 0));
        starts.push({
            id: node.tokens[1],
            name: node.get("name") ? node.get("name").tokens[1] : node.tokens[1],
            description: node.all("description").map((d) => d.tokens[1]).filter(Boolean).join("\n"),
            thumbnail: node.get("thumbnail") ? node.get("thumbnail").tokens[1] : null,
            date: dn && dn.tokens.length >= 4 ? { day: +dn.tokens[1], month: +dn.tokens[2], year: +dn.tokens[3] } : null,
            systemName: node.get("system") ? node.get("system").tokens[1] : null,
            planetName: node.get("planet") ? node.get("planet").tokens[1] : null,
            conversation: node.get("conversation") ? node.get("conversation").tokens[1] : null,
            account: { credits, score, mortgages },
            conditions,
            locked: (node.children || []).some((c) => c.tokens[0] === "to" && c.tokens[1] === "unlock"),
            system: null, planet: null,   // resolved in pass 2
        });
    }

    // ---------- pass 0f: conversations + substitutions ----------
    // 46 root conversations, and 1,623 more written INLINE inside missions and starts -- those ride along
    // in the serialized mission/start nodes and are built on demand. Root ones are serialized whole rather
    // than pre-built, because ev/esConversation.js is what knows the grammar and it is not this file's job.
    const conversations = {};
    for (const node of root.children) {
        if (node.tokens[0] !== "conversation" || node.tokens[1] == null || !node.children || !node.children.length) continue;
        conversations[node.tokens[1]] = serializeNode(node, 0);
    }
    const substitutions = buildSubstitutions(root);

    // ---------- pass 1b: ships (base/variant inheritance; motion from installed engine outfits) ----------
    function parseShipNode(node) {
        const spriteNode = node.get("sprite");
        const thumbNode = node.get("thumbnail");
        const outfitsNode = node.get("outfits");
        const outfitList = [];
        if (outfitsNode) for (const c of outfitsNode.children) {
            const qty = c.tokens.length >= 2 && Number.isFinite(+c.tokens[1]) ? +c.tokens[1] : 1;
            outfitList.push({ name: c.tokens[0], qty });
        }
        return {
            sprite: spriteNode ? spriteNode.tokens[1] : "",
            thumbnail: thumbNode ? thumbNode.tokens[1] : "",
            attr: flattenAttributes(node.get("attributes")),
            outfitList,
        };
    }
    // base table: first definition of each name (2-token `ship "Name"`); variants (3 tokens) inherit it.
    const shipBase = {};
    for (const node of root.children) {
        if (node.tokens[0] !== "ship") continue;
        const baseName = node.tokens[1];
        if (baseName == null) continue;
        if (node.tokens.length === 2 && !shipBase[baseName]) shipBase[baseName] = parseShipNode(node);
    }
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const ships = [];
    const seenShip = new Set();
    // v2172 -- one class builder, two callers. Persons carry INLINE ship definitions that inherit from a
    // root ship exactly the way a variant does (`ship "Marauder Fury" "Mad Quest"` with no children is a
    // stock Fury; Zahniser's `ship Kestrel Kestrel` overrides 33 of them). Copying the derivation would
    // have let the two drift, and a person flying at the wrong speed is a bug nobody reports.
    // `idKey` names the id slot; `dispName` is what the ship calls itself.
    function buildShipClass(node, idKey, dispName, baseParsed) {
        const self = parseShipNode(node);
        const base = baseParsed || null;
        const attr = base ? Object.assign({}, base.attr, self.attr) : self.attr;
        const outfitList = self.outfitList.length ? self.outfitList : (base ? base.outfitList : []);
        const sprite = self.sprite || (base ? base.sprite : "");
        const thumbnail = self.thumbnail || (base ? base.thumbnail : "");

        const id = shipIds.id(idKey);
        const hullMass = +attr.mass || 0;
        let thrust = 0, turn = 0, drag = +attr.drag || 1, extraMass = 0, shieldGen = 0;
        for (const it of outfitList) {
            const oid = outfitIds.get(it.name);
            const o = oid != null ? outfits[oid] : null;
            if (!o) continue;
            thrust += (+o.thrust || +o["afterburner thrust"] || 0) * it.qty;
            turn += (+o.turn || 0) * it.qty;
            drag += (+o.drag || 0) * it.qty;
            extraMass += (+o.mass || 0) * it.qty;
            shieldGen += (+o["shield generation"] || 0) * it.qty;
        }
        const mass = Math.max(10, hullMass + extraMass);   // floor guards against variant-with-no-hull blowups
        drag = Math.max(0.5, drag);
        // ES steady-state top speed ~ thrust/drag; accel ~ thrust/mass; turn rate ~ turn/mass.
        // Scaled into EV's flightModel ranges (Maneuver*3 = deg/s), then clamped so no ship is absurd.
        return ({
            id, name: dispName,
            sprite, thumbnail,
            shield: +attr.shields || 0,
            armor: +attr.hull || 0,
            shieldRech: shieldGen,
            holds: +attr["cargo space"] || 0,
            freeMass: +attr["outfit space"] || 0,
            fuel: +attr["fuel capacity"] || 0,
            mass,
            speed: clamp(Math.round((thrust / drag) * 6), 40, 900),
            accel: clamp(Math.round((thrust / mass) * 60), 2, 60),
            maneuver: clamp(Math.round((turn / mass) * 12), 3, 60),
            cost: +attr.cost || 0,
            crew: +attr["required crew"] || 0, bunks: +attr.bunks || 0,   // v2320 -- for crew salaries
            category: attr.category || "",
            hull: { mass: hullMass, drag: (+attr.drag || 1), cargoSpace: +attr["cargo space"] || 0, outfitSpace: +attr["outfit space"] || 0, shields: +attr.shields || 0, hullPts: +attr.hull || 0 },
            defaultOutfits: outfitList.map((o) => ({ name: it_name(o), qty: it_qty(o) })),
        });
    }
    function it_name(o) { return o.name; }
    function it_qty(o) { return o.qty; }

    // Every ship's MERGED definition, by the name it answers to. `shipBase` only holds two-token roots, so
    // a person inheriting from a VARIANT ("Finch (MZ)", declared as `ship Finch "Finch (MZ)"`) found nothing
    // there and was built with no hull at all -- Zahniser lost both of his escorts to that, silently.
    const parsedByName = {};
    for (const node of root.children) {
        if (node.tokens[0] !== "ship") continue;
        const isVariant = node.tokens.length >= 3;
        const dispName = node.tokens[node.tokens.length - 1];   // variant name if present, else base name
        if (dispName == null || seenShip.has(dispName)) continue;
        seenShip.add(dispName);
        const base = isVariant ? shipBase[node.tokens[1]] : null;
        const self = parseShipNode(node);
        parsedByName[dispName] = {
            attr: base ? Object.assign({}, base.attr, self.attr) : self.attr,
            outfitList: self.outfitList.length ? self.outfitList : (base ? base.outfitList : []),
            sprite: self.sprite || (base ? base.sprite : ""),
            thumbnail: self.thumbnail || (base ? base.thumbnail : ""),
        };
        ships.push(buildShipClass(node, dispName, dispName, base));
    }

    // ---------- pass 1b2: persons -- the unique captains who hunt you across the galaxy ----------
    // ES: `person "Name" { government G / frequency N / personality ... / phrase ... / system <filter> /
    // ship <Model> [<Given Name>] { overrides } }`. The first ship is the flagship and takes the person's
    // name; the rest keep their given names. Verified against endless-sky/source/Person.cpp at master.
    //
    // Not modelled: `personality` traits (we use the government's stance, as every other ship does) and
    // `phrase` (the hail is text we have nowhere to show yet). Both are recorded, neither is invented.
    const PERSON_MAX_SHIPS = 12;   // Zitchas brings 38 Terns. That is a joke, not a frame budget.
    const persons = [];
    for (const node of root.children) {
        if (node.tokens[0] !== "person") continue;
        const name = node.tokens[1];
        if (name == null) continue;
        const shipNodes = node.all("ship").slice(0, PERSON_MAX_SHIPS);
        const classes = [];
        for (let i = 0; i < shipNodes.length; i++) {
            const sn = shipNodes[i];
            const model = sn.tokens[1];
            if (model == null) continue;
            const given = sn.tokens.length >= 3 ? sn.tokens[2] : null;
            const disp = i === 0 ? name : (given || model);
            const cls = buildShipClass(sn, "person:" + name + ":" + i, disp, parsedByName[model] || shipBase[model] || null);
            if (cls.armor > 0 || cls.shield > 0) classes.push(cls);   // a hull we cannot fly is not a person
        }
        if (!classes.length) continue;
        // v2179 -- `system` is a LocationFilter, and now it is THE LocationFilter. This used to honour
        // only a government list and an attribute list, and drop any person whose filter was richer. It
        // also required every attribute where ES requires any of them.
        const sysNode = node.get("system");
        const filter = sysNode ? buildFilter(sysNode) : null;
        const filterUnsupported = null;
        persons.push({
            name,
            // v2175 -- a person's `phrase` is an INLINE sentence, not a name. 15 of the 16 have one.
            hail: node.get("phrase") ? buildSentence(node.get("phrase")) : null,
            govtName: node.get("government") ? node.get("government").tokens[1] : null,
            govt: -1,                                                     // resolved in pass 2
            frequency: num(node.get("frequency"), 1, 100),                // ES default (Person.h)
            classes, filter, filterUnsupported,
            shipCount: node.all("ship").length,                           // what ES would have brought
        });
    }
    for (const p of persons) for (const c of p.classes) ships.push(c);
    const shipById = {}; for (const s of ships) shipById[s.id] = s;

    // ---------- pass 1c: systems + their stellar objects ----------
    const systems = [];
    const spobs = {};

    function collectObjects(node, parentX, parentY, sysGovtName, out) {
        for (const obj of node.all("object")) {
            const named = obj.tokens.length >= 2 ? obj.tokens[1] : null;
            const dist = num(obj.get("distance"), 1, 0);
            const off = num(obj.get("offset"), 1, 0) * DEG;
            const x = parentX + dist * Math.cos(off);
            const y = parentY + dist * Math.sin(off);
            const spriteNode = obj.get("sprite");
            const sprite = spriteNode ? spriteNode.tokens[1] : "";
            const kind = spriteKind(sprite);
            const pdef = named && planetDefs[named] ? planetDefs[named] : null;
            const id = spobIds.id(named || (sprite + "@" + x.toFixed(1) + "," + y.toFixed(1)));
            const spob = {
                id,
                name: named || "",
                x, y,
                type: kind === "star" ? 1 : 0,
                kind, sprite,
                isStar: kind === "star",
                isStation: kind === "station" || (pdef ? !!pdef.isStation : false),
                govt: (pdef && pdef.govt) ? pdef.govt : sysGovtName,   // planet govt, else system's; resolved pass 2
                techLevel: pdef ? pdef.techLevel : 0,
                landDesc: pdef ? pdef.landDesc : "",
                landscape: pdef ? pdef.landscape : "",  // ES landscape PNG/JPG shown on landing
                attributes: pdef ? pdef.attributes : [], // planet attributes (mission filters)
                landable: !!pdef,
                canLand: !!pdef,                        // systemView reads canLand
                wormholeName: pdef ? pdef.wormhole : null,   // v2172 -- resolved to wormholeTo in pass 2
                hasBar: pdef ? pdef.hasSpaceport : false,
                hasCommodity: pdef ? pdef.hasSpaceport : false,   // any inhabited spaceport trades goods
                canOutfit: pdef ? pdef.outfitterGroups.length > 0 : false,
                canBuyShips: pdef ? pdef.shipyardGroups.length > 0 : false,
                shipyardGroups: pdef ? pdef.shipyardGroups : [],
                outfitterGroups: pdef ? pdef.outfitterGroups : [],
                flags: 0,
            };
            spobs[id] = spob;
            out.push(spob);
            // nested moons/stations orbit this object
            collectObjects(obj, x, y, sysGovtName, out);
        }
    }

    for (const node of root.children) {
        if (node.tokens[0] !== "system") continue;
        const name = node.tokens[1];
        if (name == null) continue;
        const id = sysIds.id(name);
        const pos = node.get("pos");
        const govtNode = node.get("government");
        const sysGovtName = govtNode ? govtNode.tokens[1] : null;
        const sysSpobs = [];
        collectObjects(node, 0, 0, sysGovtName, sysSpobs);
        for (const sp of sysSpobs) { sp._systemId = id; sp._systemName = name; }
        const sysTrade = {};
        for (const t of node.all("trade")) if (t.tokens[1] != null && t.tokens[2] != null) sysTrade[t.tokens[1]] = +t.tokens[2] || 0;
        systems.push({
            id, name,
            x: num(pos, 1, 0), y: num(pos, 2, 0),
            linkNames: node.all("link").map((l) => l.tokens[1]),   // resolved in pass 2
            links: [],
            nav: sysSpobs.map((s) => s.id),
            govtName: sysGovtName,
            govt: 0,
            spobs: sysSpobs,
            trade: sysTrade,
            avgShips: node.all("fleet").length,
            // ambient traffic: each `fleet "Name" <period>` spawns that fleet on a timer (smaller period = more often).
            fleets: node.all("fleet").map((f) => ({ name: f.tokens[1], period: +f.tokens[2] || 0 })).filter((f) => f.name),
            // v2172 -- persons filter on these ("attributes ember waste"). Kept as written, lowercased on compare.
            attributes: node.get("attributes") ? node.get("attributes").tokens.slice(1) : [],
        });
    }
    const systemById = {}; for (const s of systems) systemById[s.id] = s;

    // ---------- pass 2: resolve name references to ids ----------
    for (const s of systems) {
        s.links = s.linkNames.map((n) => sysIds.get(n)).filter((v) => v != null);
        s.govt = s.govtName != null && govtIds.has(s.govtName) ? govtIds.get(s.govtName) : 0;
        delete s.linkNames; delete s.govtName;
    }
    for (const idk in spobs) {
        const sp = spobs[idk];
        sp.govt = sp.govt != null && govtIds.has(sp.govt) ? govtIds.get(sp.govt) : 0;
        // v2172 -- a wormhole planet knows where IT goes, which depends on the system it sits in: the
        // definition is a directed map keyed by origin. A link to a system that does not exist (a plugin
        // half-installed, a typo) leaves wormholeTo null and the planet stays an ordinary rock.
        if (sp.wormholeName && wormholeDefs[sp.wormholeName]) {
            const wh = wormholeDefs[sp.wormholeName];
            const toName = wh.links[sp._systemName];
            const to = toName != null ? sysIds.get(toName) : null;
            if (to != null) { sp.wormholeTo = to; sp.isWormhole = true; sp.wormholeMappable = wh.mappable; }
        }
    }
    // The map's view of the same thing: one segment per declared link, both endpoints resolved. Only
    // `mappable` wormholes are drawn -- the rest are meant to be found by flying into them.
    const wormholes = [];
    for (const name in wormholeDefs) {
        const wh = wormholeDefs[name];
        const links = [];
        for (const from in wh.links) {
            const a = sysIds.get(from), b = sysIds.get(wh.links[from]);
            if (a != null && b != null) links.push({ from: a, to: b });
        }
        if (links.length) wormholes.push({ name, mappable: wh.mappable, links });
    }
    // Starts: resolve where the pilot wakes up. A start pointing at a system or planet that does not
    // exist is dropped -- there is nowhere to put the player, and guessing would be worse.
    const startsOut = [];
    for (const st of starts) {
        st.system = st.systemName != null ? sysIds.get(st.systemName) : null;
        const sp = st.planetName != null ? Object.values(spobs).find((x) => x.name === st.planetName) : null;
        st.planet = sp ? sp.id : null;
        if (st.system == null || st.planet == null) continue;
        startsOut.push(st);
    }

    // Persons: resolve the government they fly under; drop any whose system filter we cannot honour.
    const personsOut = [];
    for (const p of persons) {
        if (p.filterUnsupported) continue;   // recorded in counts.personsDropped, never silently "matches all"
        p.govt = p.govtName != null && govtIds.has(p.govtName) ? govtIds.get(p.govtName) : -1;
        personsOut.push(p);
    }
    const govts = {};
    const GOVT_FLAGS = { alwaysAttack: 0x0004, neverAttack: 0x0040, xenophobic: 0x0001 };
    for (const g of govtsRaw) {
        const allies = g.likeNames.map((n) => govtIds.get(n)).filter((v) => v != null);
        const enemies = g.dislikeNames.map((n) => govtIds.get(n)).filter((v) => v != null);
        let flags = 0;
        if (g.defaultAttitude < 0 || g.playerRep <= -100) flags |= GOVT_FLAGS.alwaysAttack;
        if (g.playerRep >= 100) flags |= GOVT_FLAGS.neverAttack;
        govts[g.id] = {
            id: g.id, name: g.name, color: g.color,
            flags, flags2: 0,
            classes: [g.id],   // each govt is its own class, so allies/enemies (govt ids) match via classMatch
            allies, enemies,
            playerRep: g.playerRep,
            hails: g.hails,
        };
    }

    // ---------- pass 2b: commodities + shipyard/outfitter sale groups ----------
    // Commodities live under a top-level `trade { commodity "Name" low high … }` node (commodities.txt).
    const commodities = {};
    for (const node of root.children) {
        if (node.tokens[0] !== "trade") continue;
        for (const c of node.children) {
            if (c.tokens[0] !== "commodity" || c.tokens[1] == null) continue;
            const name = c.tokens[1], low = +c.tokens[2] || 0, high = +c.tokens[3] || 0;
            commodities[name] = { id: name, name, low, high, basePrice: Math.round((low + high) / 2) };
        }
    }
    // shipyard "Group" { "Ship"… } and outfitter "Group" { "Outfit"… }; events can extend, so merge by name.
    const shipyards = {}, outfitters = {};
    for (const node of root.children) {
        if (node.tokens[0] === "shipyard" && node.tokens[1] != null) {
            const g = shipyards[node.tokens[1]] || (shipyards[node.tokens[1]] = []);
            for (const c of node.children) if (c.tokens[0] && c.tokens[0] !== "add") g.push(c.tokens[0]);
        } else if (node.tokens[0] === "outfitter" && node.tokens[1] != null) {
            const g = outfitters[node.tokens[1]] || (outfitters[node.tokens[1]] = []);
            for (const c of node.children) if (c.tokens[0] && c.tokens[0] !== "add") g.push(c.tokens[0]);
        }
    }

    // ---------- pass 3: mission + event trees for the runner (esMissions.js) ----------
    // Serialize the raw nodes as plain {tokens, children} trees (esConditions/esMissions walk these
    // directly). Long prose tokens are truncated so the baked es-universe.json stays reasonable; the
    // runner only needs structure plus a short brief, not full mission text.
    // v2177 -- this used to truncate every token longer than 200 characters. It was bounding the size of
    // es-universe.json, and it was cutting the prose of the game in half: mission descriptions, every
    // `dialog`, and all 1,623 conversations written inline inside missions. The banker's paragraph in the
    // default intro is 706 characters long, so nobody ever heard him say what the mortgage would cost.
    // The whole of the game's text costs about 1.5 MB. That is what a story weighs.
    function serializeNode(node, depth) {
        return { tokens: node.tokens.slice(), children: node.children.map((c) => serializeNode(c, depth + 1)) };
    }
    const esMissions = [], esEvents = [];
    for (const node of root.children) {
        if (node.tokens[0] === "mission" && node.tokens[1] != null) esMissions.push(serializeNode(node, 0));
        else if (node.tokens[0] === "event" && node.tokens[1] != null) esEvents.push(serializeNode(node, 0));
    }

    // ---------- pass 3b: fleet definitions (ambient traffic + mission NPC `fleet "Name"`) ----------
    // ES `fleet "Name" { government … names … personality {…} variant [<w>] { "Ship" [n] … } }`.
    // Serialized whole so ev/esFleets.js can pick a variant and expand its ship list at spawn time.
    const esFleets = {};
    for (const node of root.children) {
        if (node.tokens[0] === "fleet" && node.tokens[1] != null && node.children.length) esFleets[node.tokens[1]] = serializeNode(node, 0);
    }

    const outfitByName = {}; for (const id in outfits) outfitByName[outfits[id].name] = outfits[id];
    const shipByName = {}; for (const s of ships) shipByName[s.name] = s;
    const govtByName = {}; for (const id in govts) govtByName[govts[id].name] = govts[id];

    const counts = {
        systems: systems.length, spobs: Object.keys(spobs).length, ships: ships.length,
        weapons: Object.keys(weapons).length, govts: Object.keys(govts).length,
        outfits: Object.keys(outfits).length, missions: esMissions.length, events: esEvents.length,
        commodities: Object.keys(commodities).length, fleets: Object.keys(esFleets).length,
        persons: personsOut.length, personsDropped: persons.length - personsOut.length,
        wormholes: wormholes.length,
        phrases: Object.keys(phrases).length, news: newsOut.length, newsDropped,
        starts: startsOut.length, startsDropped: starts.length - startsOut.length,
        conversations: Object.keys(conversations).length, substitutions: substitutions.length,
    };

    return {
        systems, spobs, systemById, ships, shipById, weapons, govts, govtByName,
        outfits, dudes: {}, fleets: {}, missions: {}, commodities,
        shipyards, outfitters, outfitByName, shipByName,
        esMissions, esEvents, esFleets, persons: personsOut, wormholes, phrases, news: newsOut, starts: startsOut,
        conversations, substitutions,
        source: "endless-sky", counts,
    };
}

if (typeof module !== "undefined" && module.exports) module.exports = { buildUniverseFromES };
export { buildUniverseFromES };

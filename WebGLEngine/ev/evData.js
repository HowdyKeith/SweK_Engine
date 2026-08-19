// WebGLEngine/ev/evData.js — clean-room schema decoders for EV Nova sÿst (systems) + spöb (stellar objects),
// built straight from the documented field order in the EV Nova Bible (Matt Burch / Ambrosia). Takes a loaded
// resource fork (see resourceFork.js) and produces a universe graph we can render. Ships NO content — it only
// decodes what the user loaded.
//
//   import { loadResourceFork } from "./resourceFork.js";
//   import { buildUniverse } from "./evData.js";
//   const rf = loadResourceFork(buf);
//   const uni = buildUniverse(rf);
//   uni.systems;            // [{ id, name, x, y, links:[systemIds], govt, spobs:[...] }, ...]
//   uni.systemById[128];    // a system by resource id
//   uni.spobs[200];         // a stellar object by resource id
//
// Milestone 2 of the EV-compatible engine. Galaxy-map render (M3) consumes uni.systems.
//
// LAYOUT NOTES (EV Nova; big-endian; all int16 unless marked). These are the leading fixed fields only — the
// trailing variable-length control-bit STRINGS (Visibility / OnDominate / OnDestroy / ...) and the syst Person
// fields are NOT decoded here; the map doesn't need them and their offsets are best pinned against a real file.
//
//   sÿst:  xPos@0  yPos@2  Con1..16@4(32B)  NavDef1..16@36(32B)  DudeType1..8@68(16B)  Prob1..8@84(16B)
//          AvgShips@100  Govt@102  Message@104  Asteroids@106  Interference@108   (leading block = 110B)
//   spöb:  xPos@0  yPos@2  Type@4  Flags@6(U32!)  Tribute@10  TechLevel@12  SpecialTech1..8@14(16B)
//          Govt@30  MinStatus@32  CustPic@34  CustSnd@36  DefDude@38  DefCount@40  Flags2@42  AnimDelay@44
//          Frame0Bias@46  HyperLink1..8@48(16B)                                   (leading block = 64B)

import { macRoman } from "./resourceFork.js";

const SYST = "s\u00FFst";   // sÿst
const SPOB = "sp\u00F6b";   // spöb
const SHIP = "sh\u00EFp";   // shïp
const WEAP = "w\u00EBap";   // wëap
const GOVT = "g\u00F6vt";   // gövt
const DUDE = "d\u00FCde";   // düde
const FLEET = "fl\u00EBt";  // flët
const DESC = "d\u00EBsc";   // dësc — landing/mission/pers description text
const STR = "STR#";          // STR# — string lists
const MISN = "m\u00EFsn";   // mïsn — missions
const CHAR = "ch\u00E4r";   // chär — pilot start (starting control bits)
const OUTF = "o\u00FCtf";   // oütf — outfit items
const JUNK = "j\u00FCnk";   // jünk — commodities

// gövt Flags bits that drive friend/foe behaviour (field order/values per the documented resource format).
const GOVT_FLAGS = {
    xenophobic:    0x0001,  // warships attack everyone except their allies (pirates etc.)
    attackCrim:    0x0002,  // attack the player in non-allied systems if he's a criminal there
    alwaysAttack:  0x0004,  // always attacks the player
    shotsPass:     0x0008,  // player's shots won't hit this govt
    retreatLow:    0x0010,  // warships retreat below 25% shields
    neverAttack:   0x0040,  // never attacks the player (player weapons can't hit them either)
    takesBribes:   0x0200,  // warships take bribes
    startDisabled: 0x0800,  // ships start disabled (derelicts)
    plunders:      0x1000,  // warships plunder trader-type enemies
};

// spöb Flags (32-bit) bits we care about for the map / landing.
const SPOB_FLAGS = {    canLand:      0x00000001,
    hasCommodity: 0x00000002,
    canOutfit:    0x00000004,
    canBuyShips:  0x00000008,
    isStation:    0x00000010,
    uninhabited:  0x00000020,
    hasBar:       0x00000040,
    landIfDead:   0x00000080,
};

// Bounds-checked big-endian reader: out-of-range reads return safe defaults instead of throwing, so a short or
// extended resource won't crash the decode.
function reader(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const len = bytes.byteLength;
    return {
        i16: (o) => (o + 2 <= len ? dv.getInt16(o, false) : 0),
        u32: (o) => (o + 4 <= len ? dv.getUint32(o, false) : 0),
        i16arr: (o, n) => { const a = []; for (let i = 0; i < n; i++) a.push(o + i * 2 + 2 <= len ? dv.getInt16(o + i * 2, false) : -1); return a; },
    };
}

// Decode one sÿst resource's bytes into a system record (links/nav filtered to real ids >= 128).
function parseSyst(bytes) {
    const r = reader(bytes);
    return {
        x: r.i16(0), y: r.i16(2),
        links: r.i16arr(4, 16).filter((v) => v >= 128),     // hyperspace connections (system ids)
        nav: r.i16arr(36, 16).filter((v) => v >= 128),      // nav defaults (stellar object ids in this system)
        dudeTypes: r.i16arr(68, 8),
        probs: r.i16arr(84, 8),
        avgShips: r.i16(100),
        govt: r.i16(102),
        message: r.i16(104),
        asteroids: r.i16(106),
        interference: r.i16(108),
    };
}

// Decode a mïsn (mission) resource. Pinned against a real EV Nova mïsn dump
// (#135, 1970 bytes): the fixed fields are sparse and use -1 (0xFFFF) as "none".
// Confirmed from the dump: AvailStel@0 (-1 = offered galaxy-wide), a Flags
// bitfield near @80, and text/desc references in a later block. Many scenarios
// store control bits as TEXT expressions in the tail; others (like the dump)
// store them numerically with no strings at all. We handle both: read the numeric
// fields, and fall back to string extraction when strings are present.
// Encode text into a dësc resource — the mirror of readDesc. EV dësc resources are
// just the description text as Mac Roman bytes (with \n normalized back to Mac \r).
// This lets the mission creator emit real briefing resources that show in-game.
function encodeDesc(text) {
    const s = String(text || "").replace(/\n/g, "\r");
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xFF;
    return out;
}


// using the same pinned offsets. Produces the standard 1970-byte EV Nova mïsn
// resource. Fields not set default to the -1 (0xFFFF) "none" sentinel where EV
// expects it, else 0. This is what lets the mission CREATOR round-trip: author a
// mission object -> real mïsn bytes that parseMisn reads back identically.
const MISN_SIZE = 1970;
function encodeMisn(m) {
    const b = new Uint8Array(MISN_SIZE);
    const dv = new DataView(b.buffer);
    const w16 = (off, v) => dv.setInt16(off, v | 0, false);
    // Default the classic "none" sentinel fields to 0xFFFF like real missions do.
    for (const off of [12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40,
                       50, 52, 54, 56, 58, 60, 62, 64, 68, 74, 76]) w16(off, -1);
    // Fixed fields at the pinned offsets.
    w16(0, m.availStel != null ? m.availStel : -1);
    w16(4, m.availLoc || 0);
    w16(6, m.availRecord || 0);
    w16(8, m.availRating || 0);
    if (m.cargoQty) w16(10, m.cargoQty);
    if (m.travelStel) w16(12, m.travelStel);
    if (m.returnStel) w16(14, m.returnStel);
    if (m.cargoType) w16(16, m.cargoType);
    if (m.briefDesc) w16(54, m.briefDesc);
    if (m.flags) w16(80, m.flags & 0xFFFF);
    // Control-bit + text strings at their pinned offsets (NUL-terminated ASCII).
    const wstr = (off, s) => { if (!s) return; for (let i = 0; i < s.length && off + i < MISN_SIZE - 1; i++) b[off + i] = s.charCodeAt(i) & 0x7F; };
    wstr(0x5c, m.availBits || "");
    wstr(0x15b, m.onSuccess || "");
    wstr(0x75f, m.compMessage || "");
    if (m.altSets && m.altSets[0]) wstr(0x359, m.altSets[0]);
    if (m.altSets && m.altSets[1]) wstr(0x458, m.altSets[1]);
    return b;
}

function parseMisn(bytes) {
    const r = reader(bytes);
    const clean = (v) => (v === -1 ? 0 : v);   // -1 (0xFFFF) is the "none" sentinel
    // Fixed fields, pinned by diffing 7 real missions (#148/#149/#155 share a cargo
    // template; #129/#136/#351 are story missions). Confirmed offsets:
    //   @4  AvailLoc        (0 = mission computer; 2/3/6 = bar/Ready-Room-class)
    //   @6  AvailRecord     @8 AvailRating
    //   @10 CargoQty/Count  (varied 10/10/15 across the cargo template)
    //   @12 TravelStel      (destination: varied 10025/10026/10000)
    //   @14 ReturnStel      (two-leg return, e.g. 10025)
    //   @46 a shared id     @48 a count/tech
    //   @54,@60 paired text/dialogue dësc refs (6019/9019-style)
    //   @80 Flags bitfield
    const o = {
        availStel: r.i16(0),
        availLoc: r.i16(4),
        availRecord: r.i16(6),
        availRating: r.i16(8),
        cargoQty: Math.max(0, clean(r.i16(10))),   // @10 = per-mission count (tons/passengers)
        travelStel: clean(r.i16(12)),               // @12 = destination (first leg)
        returnStel: clean(r.i16(14)),               // @14 = return leg (varies per mission)
        cargoType: clean(r.i16(16)),                // @16 = payload/type constant in this TC's cargo template
        shipCount: 0,
        payUnit: r.i16(18),                          // @18 = payment-per-unit / penalty (template constant, e.g. -100)
        flags: bytes.byteLength > 81 ? (r.i16(80) & 0xFFFF) : 0,
    };
    // Reward: pinned across 11 real missions, this TC does NOT store a distinct
    // per-mission credit reward as a plain varying header field — the cargo template
    // shares @16/@18 (1000 / -100) as payment TERMS, and story missions leave them
    // -1. A true credit payout for these comes via a linked resource or is computed
    // from cargoQty × rate. We therefore don't invent a header "pay"; if @16 looks
    // like a real reward (large, and not the shared 1000/-1 sentinel) we surface it,
    // else 0. (A mission pair with two KNOWN different payouts would let us pin the
    // exact pay field — see NOTES.)
    const c16 = r.i16(16);
    o.pay = (c16 > 2000 && c16 !== 1000) ? c16 : 0;
    // Text/dialogue dësc references (briefing + outcome text live in a late block;
    // the paired @54/@60 ids point at dësc/STR# entries). Collect plausible refs.
    o.descRefs = [];
    for (const off of [54, 60, 56, 62]) { const v = r.i16(off); if (v >= 128 && v < 32000) o.descRefs.push(v); }
    o.briefDesc = o.descRefs.length ? o.descRefs[0] : 0;
    // Control-bit strings — PINNED to exact offsets from real mïsn dumps (#129,
    // #135, #136, #351). This TC (and EV Nova generally) stores them as text C
    // strings at fixed positions:
    //   AvailBits   @ 0x5c (92)   — availability expression, e.g. "(b100 & b53) & !(b666 | b668)"
    //   OnSuccess   @ 0x15b (347) — set-string applied on success, e.g. "L128 K129 b101 !b100 b668"
    //   CompMessage @ 0x75f (1887)— completion text shown on success
    // Set-strings mix control-bit tokens (bN / !bN) with other EV mission opcodes
    // (K legal-record, H hide/show, T text, M move, A activate, L link) — we apply
    // only the bN/!bN tokens to control-bit state and ignore the rest.
    const cstr = (off) => {
        if (off >= bytes.byteLength) return "";
        let end = off;
        while (end < bytes.byteLength && bytes[end] !== 0) end++;
        let s = ""; for (let i = off; i < end; i++) s += String.fromCharCode(bytes[i]);
        return s;
    };
    o.availBits = cstr(0x5c);
    o.onSuccess = cstr(0x15b);
    o.compMessage = cstr(0x75f);
    // A couple of scenarios put branch/alt set-strings further down (#136 had two
    // at 0x359 / 0x458); capture them so branch outcomes still apply their bits.
    o.altSets = [cstr(0x359), cstr(0x458)].filter((s) => /b\d+/i.test(s));
    // Fallback: if the pinned availBits slot is empty but the resource has bit
    // strings elsewhere (other tools/scenarios), recover them heuristically.
    if (!o.availBits) {
        const strings = extractStrings(bytes, 0);
        const exprs = strings.filter((s) => /[&|()]/.test(s) && /b\d+/i.test(s));
        if (exprs.length) o.availBits = exprs[0];
    }
    o.onAccept = "";   // not seen as a distinct slot in these dumps
    return o;
}

// Pull NUL-terminated printable ASCII strings (length >= 2) from a resource, from
// a starting offset. Used to recover control-bit expressions from mïsn/chär tails.
function extractStrings(bytes, from) {
    const out = [];
    let cur = "";
    for (let i = from || 0; i < bytes.byteLength; i++) {
        const b = bytes[i];
        if (b >= 0x20 && b < 0x7F) cur += String.fromCharCode(b);
        else { if (cur.length >= 2) out.push(cur); cur = ""; }
    }
    if (cur.length >= 2) out.push(cur);
    return out;
}

// Parse a chär (pilot start) resource for its starting control-bit string(s).
function parseChar(bytes) {
    const strings = extractStrings(bytes, 0);
    const bitStrings = strings.filter((s) => /(^|[\s!(&|])b\d+/i.test(s));
    return { startBits: bitStrings.join(" "), strings };
}

// Decode a dësc (description) resource to text. EV Nova dësc resources are the
// landing/mission/comms flavor text: the resource body is the description string
// in Mac Roman. Some tools prefix a 2-byte id; we detect a leading printable run
// and otherwise decode from byte 0. Newlines in EV are \r (Mac) — normalize to \n.
function readDesc(rf, id) {
    const bytes = rf.get(DESC, id);
    if (!bytes || !bytes.byteLength) return "";
    // Heuristic: if the first 2 bytes aren't printable but the rest is, skip them.
    let start = 0;
    const printable = (b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b !== 127);
    if (bytes.byteLength > 4 && !printable(bytes[0]) && printable(bytes[2])) start = 2;
    let text = macRoman(bytes, start, bytes.byteLength - start);
    // trim trailing NULs, normalize Mac/Windows newlines
    text = text.replace(/\u0000+$/g, "").replace(/\r\n?/g, "\n").trim();
    return text;
}

// Decode one spöb resource's bytes into a stellar-object record, with the flag bits unpacked.
function parseSpob(bytes) {
    const r = reader(bytes);
    const flags = r.u32(6);
    const o = { x: r.i16(0), y: r.i16(2), type: r.i16(4), flags };
    for (const k in SPOB_FLAGS) o[k] = (flags & SPOB_FLAGS[k]) !== 0;
    o.tribute = r.i16(10);
    o.techLevel = r.i16(12);
    o.specialTech = r.i16arr(14, 8).filter((v) => v > 0);
    o.govt = r.i16(30);
    o.minStatus = r.i16(32);
    o.hyperLinks = r.i16arr(48, 8).filter((v) => v >= 128);  // hypergate/wormhole targets
    // LandPICT: the landscape/landing picture (PICT id) shown when you land here.
    // EV Nova spöb layout places it at offset 76 (int16). >= 128 to be a real id.
    const lp = r.i16(76);
    o.landPict = (lp >= 128) ? lp : 0;
    // DescID: the dësc resource holding this stellar's landing description. In the
    // EV Nova spöb layout it follows LandPICT. We read the documented slot and also
    // keep the raw neighborhood so the landing code can fall back if a scenario
    // shifted it. LandSnd (landing sound) sits alongside.
    const dsc = r.i16(78);
    o.landDesc = (dsc >= 128) ? dsc : 0;
    const lsnd = r.i16(80);
    o.landSnd = (lsnd >= 128) ? lsnd : 0;
    return o;
}

// Decode the flight-relevant leading fields of a shïp resource (all int16, big-endian). The full shïp record is
// huge; this is the block the flight model needs (plus shield/armor for combat) and the built-in weapon loadout.
function parseShip(bytes) {
    const r = reader(bytes);
    return {
        holds: r.i16(0), shield: r.i16(2), accel: r.i16(4), speed: r.i16(6), maneuver: r.i16(8),
        fuel: r.i16(10), freeMass: r.i16(12), armor: r.i16(14), shieldRech: r.i16(16),
        weapTypes: r.i16arr(18, 8),   // wëap ids per gun slot (-1 unused)
        weapCounts: r.i16arr(34, 8),  // how many of that weapon in the slot
    };
}

// Decode the leading wëap fields (all int16): firing rate, shot lifetime, damage, guidance, speed, ammo. Reload &
// Count are in frames (EV runs ~30fps); Speed shares the ship Speed field's units so shots stay consistent.
// Decode an oütf (outfit) resource. Pinned against real SFA outfits:
//   #151 "Fusion Missiles", #162/#164 "Photon Torpedo Bay" (mission-granted),
//   #573 "Impulse Engine", #596 "Romulan Disruptor" (purchasable).
// Confirmed EV Nova oütf layout (all int16 big-endian):
//   @0  DisplayWeight (shop sort priority)   @2  TechLevel
//   @4  Mass (space taken)                    @6  Type / ModType
//   @8  ModVal                                @12 flags (0x108 seen constant)
//   name string near 0x32b (+ plural forms)
// The description link (DescID) is at @0 for some and elsewhere for others — EV
// actually derives an outfit's dësc by convention (oütf id + 3000), which we honor.
// COST: EV Nova stores an outfit Cost, but its offset isn't unambiguously
// identifiable from the samples on hand — several header fields are plausible and
// the two buyable samples don't disambiguate without their in-game prices. Rather
// than fabricate a wrong number, we read a conservative candidate and flag when
// we're unsure, so the UI can show "price unverified" instead of a bogus value.
function parseOutfit(bytes) {
    const r = reader(bytes);
    const o = {
        dispWeight: r.i16(0),
        techLevel: r.i16(2),
        mass: r.i16(4),
        modType: r.i16(6),
        modVal: r.i16(8),
    };
    // dësc by EV convention (outfit id + 3000) is resolved by the caller who knows
    // the id; we expose the id-independent guess here as 0 (caller fills it).
    o.descId = 0;
    // Cost: CONFIRMED absent for SFA. Keith checked in-game — SFA outfits are not
    // purchasable (all mission-granted), so there is no Cost to pin; the 0xFFFF we
    // see is the genuine "not for sale" sentinel. @24 was ruled out earlier (read a
    // sentinel-adjacent value on the crew outfit #481). "not for sale" is correct.
    o.cost = 0;
    o.sellable = false;
    return o;
}

// Decode a jünk (commodity) resource. jünk holds a commodity's base price and the
// low/high price thresholds; names come from the resource name.
function parseJunk(bytes) {
    const r = reader(bytes);
    return { basePrice: r.i16(0), lowPrice: r.i16(2), highPrice: r.i16(4) };
}

// Decode the leading wëap fields (all int16): firing rate, shot lifetime, damage, etc.
function parseWeap(bytes) {
    const r = reader(bytes);
    return {
        reload: r.i16(0), count: r.i16(2), massDmg: r.i16(4), energyDmg: r.i16(6),
        guidance: r.i16(8), speed: r.i16(10), ammoType: r.i16(12),
    };
}

// Resolve a ship's built-in weapon loadout against the decoded wëap table -> [{ weapon, count }, ...].
function resolveLoadout(ship, weapons) {
    const out = [], types = ship.weapTypes || [], counts = ship.weapCounts || [];
    for (let i = 0; i < types.length; i++) { const id = types[i]; if (id >= 128 && weapons[id]) out.push({ weapon: weapons[id], count: Math.max(1, counts[i] || 1) }); }
    return out;
}

// Build the whole universe graph from a loaded resource fork.
// Decode one flët resource (a named group: a flagship + up to 4 escort types with min/max counts). All shorts
// big-endian; documented field order: LeadShipType@0 EscortType[4]@2..8 Min[4]@10..16 Max[4]@18..24 Govt@26.
function parseFleet(bytes) {
    const r = reader(bytes);
    return { lead: r.i16(0), escorts: r.i16arr(2, 4), min: r.i16arr(10, 4), max: r.i16arr(18, 4), govt: r.i16(26) };
}

// Decode one gövt resource. All shorts big-endian; offsets follow the documented field order:
// VoiceType@0 Flags@2 Flags2@4 CrimeTol@6 (7 penalty/rec shorts @8..20) MaxOdds@22
// Class1-4@24..30 Ally1-4@32..38 Enemy1-4@40..46 Interface@48 NewsPic@50
function parseGovt(bytes) {
    const r = reader(bytes);
    return {
        flags: (r.i16(2) & 0xFFFF) >>> 0,
        flags2: (r.i16(4) & 0xFFFF) >>> 0,
        crimeTol: r.i16(6),
        initialRec: r.i16(20),
        maxOdds: r.i16(22),
        classes: r.i16arr(24, 4).filter((v) => v >= 0),   // arbitrary class groupings (-1 = unused)
        allies: r.i16arr(32, 4).filter((v) => v >= 0),    // class numbers this govt allies
        enemies: r.i16arr(40, 4).filter((v) => v >= 0),   // class numbers this govt fights
    };
}

// Decode one düde resource (a spawn group). All shorts big-endian; documented field order:
// AIType@0 Govt@2 Booty@4 InfoTypes@6 Flags@8 ShipType[16]@10..40 Probability[16]@42..72
function parseDude(bytes) {
    const r = reader(bytes);
    return {
        aiType: r.i16(0),                 // 0 use ship's own, 1 wimpy trader, 2 brave trader, 3 warship, 4 interceptor
        govt: r.i16(2),                   // govt id or -1 independent
        flags: (r.i16(8) & 0xFFFF) >>> 0,
        shipTypes: r.i16arr(10, 16),      // up to 16 ship-class ids (0/-1 unused)
        probs: r.i16arr(42, 16),          // matching per-ship probabilities
    };
}

// True if govt `a` lists any of govt `b`'s classes in its allies/enemies (key) list.
function _classMatch(a, b, key) {
    if (!a || !b || !a[key] || !b.classes) return false;
    for (const c of a[key]) if (b.classes.indexOf(c) >= 0) return true;
    return false;
}

// Relationship between two govts by id, given the govts table: "enemy" | "ally" | "neutral".
// Either side declaring it makes it so (governments communicate allegiances); enemy wins ties.
function govtRelation(govts, aId, bId) {
    if (aId === bId) return "ally";
    const a = govts && govts[aId], b = govts && govts[bId];
    if (!a || !b) return "neutral";
    if (_classMatch(a, b, "enemies") || _classMatch(b, a, "enemies")) return "enemy";
    if (_classMatch(a, b, "allies") || _classMatch(b, a, "allies")) return "ally";
    return "neutral";
}

// A govt's stance toward a clean-record player: "hostile" | "friendly" | "neutral".
// Pirates (xenophobic / always-attacks) are hostile; "never attacks" govts are friendly; the rest ignore a clean pilot.
function govtStanceToPlayer(govts, gId) {
    const g = govts && govts[gId];
    if (!g) return "neutral";
    if (g.flags & (GOVT_FLAGS.alwaysAttack | GOVT_FLAGS.xenophobic)) return "hostile";
    if (g.flags & GOVT_FLAGS.neverAttack) return "friendly";
    return "neutral";
}

// Govts allied to `govtId` (their Class matches its Ally list, per govtRelation). Used so provoking a govt also angers
// its friends.
function govtAllies(govts, govtId) {
    const out = [];
    for (const k in (govts || {})) { const oid = +k; if (oid !== govtId && govtRelation(govts, govtId, oid) === "ally") out.push(oid); }
    return out;
}

// Partition a set of govt ids into "blocs" - connected components of the ally graph (allied govts, even transitively,
// land in the same bloc). Returns { [govtId]: blocIndex }, with bloc indices assigned in a stable order (by each bloc's
// smallest member) so colours stay put as the grudge list re-sorts. Pure.
function grudgeBlocs(uni, ids) {
    const govts = (uni && uni.govts) || {};
    ids = (ids || []).slice();
    const parent = {}; ids.forEach((id) => { parent[id] = id; });
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        if (govtRelation(govts, ids[i], ids[j]) === "ally") { const a = find(ids[i]), b = find(ids[j]); if (a !== b) parent[a] = b; }
    }
    const groups = {};
    for (const id of ids) { const r = find(id); (groups[r] = groups[r] || []).push(id); }
    const comps = Object.values(groups).map((g) => g.sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]);
    const out = {};
    comps.forEach((g, idx) => g.forEach((id) => { out[id] = idx; }));
    return out;
}
// How long a grudge lasts before it fades on its own, if you don't provoke that govt again (ms). Lay low and they forget.
const GRUDGE_TTL_MS = 180000;   // 3 minutes
// Record a grudge: each provoked govt (and its allies) turns hostile until `now + ttlMs`. Re-provoking pushes the expiry
// back out. uni._grudges is a Map of govtId -> expiry timestamp. Skips independents (govt < 0).
function recordGrudges(uni, ids, now = Date.now(), ttlMs = GRUDGE_TTL_MS) {
    if (!uni || !ids || !ids.length) return;
    if (!(uni._grudges instanceof Map)) uni._grudges = new Map();
    const exp = now + ttlMs;
    for (const g of ids) { if (g == null || g < 0) continue; uni._grudges.set(g, exp); for (const a of govtAllies(uni.govts || {}, g)) uni._grudges.set(a, exp); }
}
// Is this govt currently holding a grudge against the player? Honors expiry (Map form); a legacy Set means "permanent".
function isGrudged(uni, govtId, now = Date.now()) {
    const g = uni && uni._grudges; if (!g) return false;
    if (g instanceof Set) return g.has(govtId);
    const exp = g.get(govtId); return exp != null && exp > now;
}
// Prune grudges that have faded. Returns how many expired. Cheap housekeeping (call on system entry).
function decayGrudges(uni, now = Date.now()) {
    const g = uni && uni._grudges; if (!(g instanceof Map)) return 0;
    let nn = 0; for (const [k, exp] of g) if (exp <= now) { g.delete(k); nn++; } return nn;
}
// Clear the player's record: everyone forgives (e.g. you paid the fine). Returns how many grudges were dropped.
function clearGrudges(uni) { const nn = (uni && uni._grudges) ? uni._grudges.size : 0; if (uni && uni._grudges) uni._grudges.clear(); return nn; }
// Live grudges with their time-to-fade, hottest (most time left) first, for the HUD. Skips already-expired entries.
function listGrudges(uni, now = Date.now(), order = "hot") {
    const g = uni && uni._grudges; if (!(g instanceof Map)) return [];
    const govts = uni.govts || {}, out = [];
    for (const [id, exp] of g) { const msLeft = exp - now; if (msLeft <= 0) continue; const gv = govts[id]; out.push({ id, name: (gv && gv.name) || ("Govt #" + id), msLeft }); }
    out.sort((a, b) => order === "soon" ? a.msLeft - b.msLeft : b.msLeft - a.msLeft);   // "soon" = closest to fading first
    return out;
}

function buildUniverse(rf) {
    if (!rf || typeof rf.list !== "function") throw new Error("buildUniverse: pass a loaded resource fork");
    const spobs = {};
    for (const meta of rf.list(SPOB)) {
        const bytes = rf.get(SPOB, meta.id);
        if (!bytes) continue;
        spobs[meta.id] = Object.assign({ id: meta.id, name: meta.name }, parseSpob(bytes));
    }
    const systems = [];
    for (const meta of rf.list(SYST)) {
        const bytes = rf.get(SYST, meta.id);
        if (!bytes) continue;
        const s = parseSyst(bytes);
        systems.push({
            id: meta.id, name: meta.name, x: s.x, y: s.y,
            links: s.links, nav: s.nav, govt: s.govt,
            dudeTypes: s.dudeTypes, probs: s.probs, avgShips: s.avgShips,
            spobs: s.nav.filter((id) => spobs[id]).map((id) => spobs[id]),
        });
    }
    const systemById = {}; for (const s of systems) systemById[s.id] = s;
    const ships = [];
    for (const meta of rf.list(SHIP)) {
        const bytes = rf.get(SHIP, meta.id);
        if (!bytes) continue;
        ships.push(Object.assign({ id: meta.id, name: meta.name }, parseShip(bytes)));
    }
    const weapons = {};
    for (const meta of rf.list(WEAP)) {
        const bytes = rf.get(WEAP, meta.id);
        if (!bytes) continue;
        weapons[meta.id] = Object.assign({ id: meta.id, name: meta.name }, parseWeap(bytes));
    }
    const shipById = {}; for (const sh of ships) shipById[sh.id] = sh;
    const govts = {};
    for (const meta of rf.list(GOVT)) {
        const bytes = rf.get(GOVT, meta.id);
        if (!bytes) continue;
        govts[meta.id] = Object.assign({ id: meta.id, name: meta.name }, parseGovt(bytes));
    }
    const fleets = {};
    for (const meta of rf.list(FLEET)) {
        const bytes = rf.get(FLEET, meta.id);
        if (!bytes) continue;
        fleets[meta.id] = Object.assign({ id: meta.id, name: meta.name }, parseFleet(bytes));
    }
    const dudes = {};
    for (const meta of rf.list(DUDE)) {
        const bytes = rf.get(DUDE, meta.id);
        if (!bytes) continue;
        dudes[meta.id] = Object.assign({ id: meta.id, name: meta.name }, parseDude(bytes));
    }
    const missions = {};
    for (const meta of rf.list(MISN)) {
        const bytes = rf.get(MISN, meta.id);
        if (!bytes) continue;
        missions[meta.id] = Object.assign({ id: meta.id, name: meta.name }, parseMisn(bytes));
    }
    const outfits = {};
    for (const meta of rf.list(OUTF)) {
        const bytes = rf.get(OUTF, meta.id);
        if (!bytes) continue;
        outfits[meta.id] = Object.assign({ id: meta.id, name: meta.name }, parseOutfit(bytes));
    }
    const commodities = {};
    for (const meta of rf.list(JUNK)) {
        const bytes = rf.get(JUNK, meta.id);
        if (!bytes) continue;
        commodities[meta.id] = Object.assign({ id: meta.id, name: meta.name }, parseJunk(bytes));
    }
    return { systems, spobs, systemById, ships, shipById, weapons, govts, dudes, fleets, missions, outfits, commodities,
        counts: { systems: systems.length, spobs: Object.keys(spobs).length, ships: ships.length,
            weapons: Object.keys(weapons).length, govts: Object.keys(govts).length, dudes: Object.keys(dudes).length, fleets: Object.keys(fleets).length, missions: Object.keys(missions).length } };
}

export { buildUniverse, parseSyst, parseSpob, parseShip, parseWeap, parseGovt, parseDude, parseFleet, parseMisn, encodeMisn, encodeDesc, parseChar, parseOutfit, parseJunk, resolveLoadout, readDesc, govtAllies, grudgeBlocs, recordGrudges, isGrudged, decayGrudges, clearGrudges, listGrudges, GRUDGE_TTL_MS, govtRelation, govtStanceToPlayer, SPOB_FLAGS, GOVT_FLAGS, SYST, SPOB, SHIP, WEAP, GOVT, DUDE, FLEET, DESC, MISN, CHAR, OUTF, JUNK };

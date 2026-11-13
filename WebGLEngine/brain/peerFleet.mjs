// WebGLEngine/brain/peerFleet.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE PEERS' BRAINS, TAKEN IN AND SET TO A FLEET ACTION. Keith, when this work began: "The other SweK Engine peers have their own brains already configured to contribute to fleet actions." brain/peerBrain.mjs is the file a peer exports (swek-brain-v1) and brain/battleshipDuel.mjs can seat such files
// (sideFromBrains); nothing took a FOLDER of what peers sent -- some of it not JSON, some for another game, two with the same weights -- and said, file by file, what happened to it. This is that, as arithmetic: the command (tools/ship/takePeerFleet.mjs) reads the folders and a page hands in what was dropped on it.
//
//   intake(entries)   entries are [{ name, text }] -- a file's name and its text AS IT ARRIVED. Returns { accepted: [{ name, policy, role, by, score, weightCount, hash, blob }], refused: [{ name, reason }] }, in the order given. NOTHING HERE THROWS ON WHAT A PEER SENT: text that is not JSON, JSON that is not a
//                     brain, a policy this fight does not seat (a driver's, a submarine pilot's), a weight count that is not the policy's, a weight that is not a finite float32 -- each is refused with a reason a person can act on. A file whose weights are the weights of one already accepted for the same
//                     policy is refused as a duplicate, naming the first (the same brain twice would otherwise take two turns at the seats).
//   fleet(id, entries, base)   intake, then battleshipDuel.sideFromBrains on what was accepted: { side, accepted, refused, seated: [{ name, policy, role, by, where }], roles: { seat, helm, pilot } }. `where` is what the brain works: seat ids, "helm", or which escorts. A second helm is refused there (a side
//                     has one) and joins `refused`. With no seat brain the seats are the hand gunner's, with no helm brain the helm is `base`'s rule alone -- a fleet of nothing accepted is the hand rule's side, and says so (`roles` all 0).
//   action(A, B, opts)   the two fleets against each other over `kinds` x `seeds` (default the four kinds, seeds 1-5: 20 pairs), each geometry from both seats: { pairs: [{ kind, seed, lead, winner }], lead: { mean, se, z }, won, lost, drawn, word, brains: { seated: [A, B], peak }, fights }. `word` is LEADS / TRAILS /
//                     CANNOT BE TOLD for A at z 2 -- and WITH TWENTY PAIRS IT WILL USUALLY BE "CANNOT BE TOLD": a pair's lead has a standard deviation of about 0.8 (tools/ship/takeTurretAudit.mjs), so 20 pairs see only a lead of 0.35 or more. The report says the number of pairs beside the word.
//   reportLines(result)   the action in lines a person reads.
//
// WHAT IS NOT HERE: the network (a peer's file reaches this as text somebody already has), any ranking of PEERS (a fleet is a side: its gunners, its helm and its escorts' pilots earn the result together, and one action cannot say which of them did), and training. Pure: no I/O, no clock, no random.
"use strict";
import * as D from "./battleshipDuel.mjs";
import * as PB from "./peerBrain.mjs";
import { weightsHash } from "./drivePolicy.mjs";

export const DEFAULT_SEEDS = Object.freeze([1, 2, 3, 4, 5]);
const short = (v) => { const s = typeof v === "string" ? v : JSON.stringify(v); return s === undefined ? String(v) : s.length > 40 ? s.slice(0, 40) + "..." : s; };

/** See the header. */
export function intake(entries) {
    if (!Array.isArray(entries)) throw new Error(`peerFleet.intake: the entries are an array of { name, text } (got ${typeof entries})`);
    const accepted = [], refused = [], seen = new Map();
    entries.forEach((e, i) => {
        const name = e && typeof e.name === "string" && e.name ? e.name : `entry ${i + 1}`, no = (reason) => refused.push({ name, reason });
        if (!e || typeof e.text !== "string") return no("no text to read");
        let blob; try { blob = JSON.parse(e.text); } catch (err) { return no(`not JSON (${String(err && err.message).slice(0, 60)})`); }
        if (!blob || typeof blob !== "object" || Array.isArray(blob)) return no(`JSON, but not a brain export (${Array.isArray(blob) ? "an array" : blob === null ? "null" : typeof blob})`);
        if (blob.format !== PB.FORMAT) return no(`not a ${PB.FORMAT} file (format ${short(blob.format)})`);
        const kind = typeof blob.policy === "string" && Object.hasOwn(D.PEER_POLICIES, blob.policy) ? D.PEER_POLICIES[blob.policy] : null;
        if (!kind) return no(`a brain for ${short(blob.policy)}, which a fleet action does not seat (it seats ${Object.keys(D.PEER_POLICIES).join(", ")})`);
        const r = PB.importBrain(PB.describePolicy(blob.policy, kind.mod), blob);
        if (!r.ok) return no(r.reason);
        const hash = weightsHash(r.weights), key = blob.policy + "|" + hash + "|" + r.weights.length;
        if (seen.has(key) && seen.get(key).weights.every((v, k) => v === r.weights[k])) return no(`the same weights as ${seen.get(key).name} (hash ${hash}): a duplicate`);
        if (!seen.has(key)) seen.set(key, { name, weights: r.weights });
        accepted.push({ name, policy: blob.policy, role: kind.role, by: typeof r.meta.by === "string" ? r.meta.by : null, score: typeof r.meta.score === "number" ? r.meta.score : null, weightCount: r.weights.length, hash, blob });
    });
    return { accepted, refused };
}

/** See the header. `base` is battleshipDuel.makeSide's options for what no brain decides (gunners, helmRule, cannon). */
export function fleet(id, entries, base = {}) {
    const t = intake(entries), s = D.sideFromBrains(id, t.accepted.map((a) => a.blob), base), refused = t.refused.slice();
    for (const r of s.refused) refused.push({ name: t.accepted[r.index].name, reason: r.reason });
    const seated = s.seated.map((row) => ({ name: t.accepted[row.index].name, policy: row.policy, role: row.role, by: t.accepted[row.index].by, where: row.where.slice() }));
    const roles = { seat: seated.filter((x) => x.role === "seat").length, helm: seated.filter((x) => x.role === "helm").length, pilot: seated.filter((x) => x.role === "pilot").length };
    return { id, side: s.side, accepted: t.accepted.filter((a) => seated.some((x) => x.name === a.name)), refused, seated, roles };
}

const stat = (xs) => { const n = xs.length, mean = xs.reduce((a, b) => a + b, 0) / n, se = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) / n) : 0; return { n, mean, se, z: se > 0 ? mean / se : 0 }; };
/** See the header. A and B are fleet() results (or anything with a `side`). Options: kinds, seeds, ships, escorts, seconds. `fly(sideA, sideB, seed, kind, opts)` -> a battleshipDuel.pair result is replaceable (the command hands the pool's). */
export function action(A, B, { kinds = D.KINDS, seeds = DEFAULT_SEEDS, ships = 1, escorts = 0, seconds = D.SECONDS, fly = D.pair } = {}) {
    for (const k of kinds) if (!D.KINDS.includes(k)) throw new Error(`peerFleet.action: no kind "${k}" (${D.KINDS.join(", ")})`);
    if (!seeds.length || !kinds.length) throw new Error("peerFleet.action: at least one kind and one seed");
    const pairs = []; let peak = 0;
    for (const kind of kinds) for (const seed of seeds) { const p = fly(A.side, B.side, seed, kind, { ships, escorts, seconds }); peak = Math.max(peak, p.first.brains.peak, p.second.brains.peak); pairs.push({ kind, seed, lead: p.lead, winner: p.lead > D.DECISIVE ? "A" : p.lead < -D.DECISIVE ? "B" : "draw" }); }
    const lead = stat(pairs.map((p) => p.lead));
    return { pairs, lead, won: pairs.filter((p) => p.winner === "A").length, lost: pairs.filter((p) => p.winner === "B").length, drawn: pairs.filter((p) => p.winner === "draw").length, word: lead.z >= 2 ? "LEADS" : lead.z <= -2 ? "TRAILS" : "CANNOT BE TOLD",
        brains: { seated: [D.seatedBrains(A.side, { ships, escorts }).total, D.seatedBrains(B.side, { ships, escorts }).total], peak }, fights: pairs.length * 2, ships, escorts };
}

const where = (w) => (w.length > 4 ? `${w.length} seats (${w.slice(0, 3).join(", ")}, ...)` : w.join(", "));
/** What a fleet is, in lines: each brain seated and what it works, each file refused and why. */
export function fleetLines(F) {
    const out = [`fleet ${F.id}: ${F.seated.length} brains seated (${F.roles.seat} in the gun seats, ${F.roles.helm} at the helm, ${F.roles.pilot} flying escorts), ${F.refused.length} files refused${F.seated.length ? "" : " -- NOTHING OF A PEER'S IS IN THIS FLEET: it is the hand rules' side"}`];
    for (const s of F.seated) out.push(`  SEATED   ${s.name}: ${s.policy}, ${s.role} -- ${where(s.where)}${s.by ? ` -- by: ${s.by.length > 90 ? s.by.slice(0, 90) + "..." : s.by}` : ""}`);
    for (const r of F.refused) out.push(`  REFUSED  ${r.name}: ${r.reason}`);
    return out;
}
/** The action in lines. */
export function reportLines(A, B, R) {
    return [...fleetLines(A), ...fleetLines(B),
        `the action: ${R.pairs.length} pairs (${R.fights} fights; ${R.ships} ship${R.ships > 1 ? "s" : ""} and ${R.escorts} escort${R.escorts === 1 ? "" : "s"} a side), each geometry from both seats`,
        `  ${A.id} against ${B.id}: mean lead ${R.lead.mean >= 0 ? "+" : ""}${R.lead.mean.toFixed(3)} (se ${R.lead.se.toFixed(3)}, z ${R.lead.z.toFixed(2)}); pairs won ${R.won}, lost ${R.lost}, drawn ${R.drawn}: ${A.id} ${R.word}${R.word === "CANNOT BE TOLD" ? ` on ${R.pairs.length} pairs (a pair's lead varies by about 0.8: ${R.pairs.length} pairs see a lead of ${(2 * 0.8 / Math.sqrt(R.pairs.length)).toFixed(2)} or more)` : ""}`,
        `  live brains: ${R.brains.seated[0]} seated in ${A.id}, ${R.brains.seated[1]} in ${B.id}; the most asked in one tick ${R.brains.peak}`];
}

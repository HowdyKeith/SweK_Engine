// FILE: /simulation/KingPack.js
// VERSION: v1 — round 287
//
// King kaiju as cross-kind pack leaders. The existing round-36 king
// aura already boosts attack speed of nearby kaiju. This adds the
// LEADERSHIP layer: kings track which kaiju they're currently buffing,
// and when a king dies, all its pack members get a DEMORALIZED status
// for 20 seconds.
//
// Demoralized = 0.55× attack speed (slower than even baseline) +
// occasional retreat impulses. This makes king assassination strategy-
// ically valuable — drop the king first, the pack collapses.
//
// API:
//   const kp = makeKingPack();
//   kp.markBuffed(kingId, memberId)         // call during king aura tick
//   kp.onKingDeath(kingId, kingObj, all)    // on king state→dying
//   kp.tickDemoralized(allKaiju, dt)        // call once per frame
//   kp.isDemoralized(k) → boolean
//   kp.status() → { activePacks, demoralizedCount }
//
// Storage:
//   _packs:        kingId → Set<memberId>     (refreshed each tick)
//   _demoralized: memberId → expiresAtMs

const DEMORALIZE_DURATION_MS = 20_000;
const DEMORALIZE_ATTACK_MULT = 0.55;

export function makeKingPack() {
    const _packs = new Map();           // kingId → Set<memberId>
    const _demoralized = new Map();     // memberId → expiresAt

    function markBuffed(kingId, memberId) {
        if (kingId == null || memberId == null || kingId === memberId) return;
        let set = _packs.get(kingId);
        if (!set) { set = new Set(); _packs.set(kingId, set); }
        set.add(memberId);
    }

    function clearPack(kingId) {
        _packs.delete(kingId);
    }

    // Apply demoralization to all members of the dying king's pack.
    // Members might already be dead — that's fine, we still mark them
    // and tickDemoralized cleans up. Logs a one-line summary.
    function onKingDeath(kingId, kingObj, allKaiju) {
        const pack = _packs.get(kingId);
        if (!pack || pack.size === 0) {
            _packs.delete(kingId);
            return { dispersed: 0 };
        }
        const now = performance.now();
        let dispersed = 0;
        for (const memberId of pack) {
            // Don't demoralize the dead king itself or other kings —
            // they should be able to step up as new leaders.
            if (memberId === kingId) continue;
            // Look up member to skip already-dead ones
            const member = Array.isArray(allKaiju)
                ? allKaiju.find(k => k.id === memberId)
                : null;
            if (member && (member.state === "dying" || !member.isAlive?.())) continue;
            if (member?._isKing) continue;
            _demoralized.set(memberId, now + DEMORALIZE_DURATION_MS);
            if (member) {
                member._demoralized = true;
                // Round 287 — temporarily flag energy attribute that the
                // attack-cadence code can multiply by. Reset elsewhere
                // when status expires.
                member._packLeaderDeadAt = now;
            }
            dispersed++;
        }
        _packs.delete(kingId);
        console.log(`[KingPack] king ${kingObj?.name ?? kingId} fell — pack of ${dispersed} demoralized for ${DEMORALIZE_DURATION_MS / 1000}s`);
        return { dispersed };
    }

    // Per-frame cleanup: expire demoralized statuses + clear flags.
    function tickDemoralized(allKaiju, dt) {
        if (_demoralized.size === 0) return;
        const now = performance.now();
        for (const [memberId, expiresAt] of _demoralized.entries()) {
            if (now > expiresAt) {
                _demoralized.delete(memberId);
                if (Array.isArray(allKaiju)) {
                    const member = allKaiju.find(k => k.id === memberId);
                    if (member) {
                        delete member._demoralized;
                        delete member._packLeaderDeadAt;
                    }
                }
            }
        }
    }

    function isDemoralized(k) {
        if (!k) return false;
        if (k._demoralized) return true;
        return _demoralized.has(k.id);
    }

    // Attack-speed multiplier for cadence code. 0.55 when demoralized,
    // 1.0 otherwise. Plug into _resolveCadence in KaijuManager.
    function attackSpeedMult(k) {
        return isDemoralized(k) ? DEMORALIZE_ATTACK_MULT : 1.0;
    }

    // PATCH-B12b -- per-king pack size for the GPU brain snapshot (the
    // coordination policy weighs "order a pack of 6" differently from
    // "order a pack of 1").
    function packSizeOf(kingId) {
        return _packs.get(kingId)?.size ?? 0;
    }

    function status() {
        let activeMembers = 0;
        for (const set of _packs.values()) activeMembers += set.size;
        return {
            activePacks: _packs.size,
            activeMembers,
            demoralizedCount: _demoralized.size,
        };
    }

    function clear() {
        _packs.clear();
        _demoralized.clear();
    }

    return {
        markBuffed, clearPack, onKingDeath, tickDemoralized,
        isDemoralized, attackSpeedMult, status, clear,
        packSizeOf,                                    // PATCH-B12b
    };
}

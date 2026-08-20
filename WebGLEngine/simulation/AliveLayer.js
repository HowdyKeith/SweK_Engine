// AliveLayer.js — v1392
// Give rigged world GLBs the avatar's "alive" liveliness. Both the avatar and
// each rigged world asset run the SAME SkeletalAnimator (clips + crossfade +
// localR + an onPose hook), so the avatar's idle-life channels port directly:
// attach an onPose to a rigged asset's animator that layers small, named per-bone
// sine nudges (breathe / sway / headbob / earwig / tailwag) over whatever clip is
// playing, plus a talk-driven jaw — exactly like avatarStage._applyFx/_applyJaw.
// A shared MOOD bus scales it all (calm / excited / talking / dancing), so the
// world can emote in sync. Channels resolve to bones by name, per animator.

export function makeAliveLayer(opts = {}) {
    const TWO_PI = Math.PI * 2;
    const mood = { intensity: 1.0, talk: 0, set: "calm" };

    // named ambient channels (mirror the avatar's _fx). axis/amp/freq are first
    // guesses, tunable live; per-channel axis can be corrected like the avatar's.
    const channels = {
        breathe: { match: /spine|chest|breast|torso|body/i, axis: [1, 0, 0], amp: 0.035, freq: 0.40 },
        sway:    { match: /hips?|pelvis|root/i,              axis: [0, 0, 1], amp: 0.050, freq: 0.33 },
        headbob: { match: /head|neck/i,                      axis: [1, 0, 0], amp: 0.050, freq: 0.55 },
        earwig:  { match: /ear/i,                             axis: [0, 0, 1], amp: 0.160, freq: 1.30 },
        tailwag: { match: /tail/i,                            axis: [0, 1, 0], amp: 0.300, freq: 1.90 },
    };
    const jaw = { match: /jaw|lowerjaw|chin|mouth/i, axis: [1, 0, 0], amp: 0.5 };
    const presets = {
        calm:    { intensity: 0.8 },
        excited: { intensity: 1.8 },
        talking: { intensity: 1.0 },
        dancing: { intensity: 2.2 },
    };

    function _qmul(a, b, o) {
        const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
        o[0] = aw * bx + ax * bw + ay * bz - az * by;
        o[1] = aw * by - ax * bz + ay * bw + az * bx;
        o[2] = aw * bz + ax * by - ay * bx + az * bw;
        o[3] = aw * bw - ax * bx - ay * by - az * bz;
        return o;
    }

    function _resolve(animator) {
        const nodes = animator.nodes || [];
        const map = {};
        for (const k in channels) {
            const ch = channels[k], idxs = [];
            for (let i = 0; i < nodes.length && idxs.length < 4; i++) { const n = nodes[i]; if (n && ch.match.test(n.name || "")) idxs.push(i); }
            map[k] = idxs;
        }
        let jawIdx = -1;
        for (let i = 0; i < nodes.length; i++) { const n = nodes[i]; if (n && jaw.match.test(n.name || "")) { jawIdx = i; break; } }
        return { map, jawIdx };
    }

    function _apply(animator) {
        if (!animator || !animator.localR) return;
        let res = animator._aliveRes; if (!res) { res = _resolve(animator); animator._aliveRes = res; }
        const t = performance.now() * 0.001, I = mood.intensity;
        for (const k in channels) {
            const ch = channels[k], idxs = res.map[k]; if (!idxs || !idxs.length) continue;
            for (let j = 0; j < idxs.length; j++) {
                const lr = animator.localR[idxs[j]]; if (!lr) continue;
                const ang = ch.amp * I * Math.sin(t * ch.freq * TWO_PI + j * 0.9), s = Math.sin(ang / 2), c = Math.cos(ang / 2);
                _qmul(lr, [ch.axis[0] * s, ch.axis[1] * s, ch.axis[2] * s, c], lr);
            }
        }
        if (res.jawIdx >= 0 && mood.talk > 0.002) {
            const lr = animator.localR[res.jawIdx];
            if (lr) { const ang = mood.talk * jaw.amp, s = Math.sin(ang / 2), c = Math.cos(ang / 2); _qmul(lr, [jaw.axis[0] * s, jaw.axis[1] * s, jaw.axis[2] * s, c], lr); }
        }
    }

    function attach(animator) {
        if (!animator || animator._aliveAttached) return false;
        animator._alivePrevOnPose = animator.onPose || null;   // chain, don't clobber (e.g. Ragdoll)
        animator.onPose = (a) => { try { if (a._alivePrevOnPose) a._alivePrevOnPose(a); } catch (e) {} try { _apply(a); } catch (e) {} };
        animator._aliveAttached = true; animator._aliveRes = null;
        return true;
    }
    function detach(animator) {
        if (!animator || !animator._aliveAttached) return false;
        animator.onPose = animator._alivePrevOnPose || null;
        animator._aliveAttached = false; animator._aliveRes = null;
        return true;
    }

    function setMood(m) {
        if (typeof m === "string") { const p = presets[m]; if (p) Object.assign(mood, p, { set: m }); }
        else if (m && typeof m === "object") Object.assign(mood, m);
        return { ...mood };
    }
    function setTalk(v) { mood.talk = (typeof v === "number" && v >= 0) ? Math.min(1, v) : 0; return mood.talk; }
    function setChannel(id, o = {}) {
        const ch = channels[id]; if (!ch) return false;
        if (Array.isArray(o.axis) && o.axis.length === 3) ch.axis = o.axis.slice();
        if (typeof o.amp === "number") ch.amp = o.amp;
        if (typeof o.freq === "number") ch.freq = o.freq;
        return { id, ...ch };
    }

    return { attach, detach, setMood, setTalk, setChannel, channels, mood, presets, _apply };
}

// FILE: render/cameraTexture.js -- v4188
//
// A LIVE CAMERA FRAME AS A GL TEXTURE. This is the small piece the tree was missing, and it is a multiplier
// rather than an effect: getUserMedia appears in twelve files here and video-as-a-texture appeared in NONE of
// them -- only inside vendored three.js. So the engine's whole shader chain (bad-TV v4182, aquarelle v4177,
// the DOOM fire v4178, phosphor, swiftShader) had never been pointed at a webcam. Thirty lines of
// texImage2D-per-frame makes every one of them a live effect without writing a new effect.
//
// The pure functions at the top take no DOM and are what the gate reads; the class below is the wiring.
"use strict";

/**
 * UV transform to fit a source of one aspect into a target of another WITHOUT distortion.
 *
 * *** COVER, NOT STRETCH, AND THE DIFFERENCE IS A FACE. *** A 4:3 camera stretched into a 16:9 canvas makes
 * everyone look wide, which on a webcam effect is the first thing a viewer notices and the last thing they
 * can name. This returns the scale and offset to apply to UVs so the frame fills the target and the overflow
 * is cropped instead.
 *
 * @returns { sx, sy, ox, oy } -- sample at (uv * s + o)
 */
export function coverUV(srcW, srcH, dstW, dstH) {
    const sa = (srcW > 0 && srcH > 0) ? srcW / srcH : 1;
    const da = (dstW > 0 && dstH > 0) ? dstW / dstH : 1;
    if (!Number.isFinite(sa) || !Number.isFinite(da) || sa <= 0 || da <= 0) return { sx: 1, sy: 1, ox: 0, oy: 0 };
    if (sa > da) {                       // source is wider: crop its sides
        const sx = da / sa;
        return { sx, sy: 1, ox: (1 - sx) / 2, oy: 0 };
    }
    const sy = sa / da;                  // source is taller: crop top and bottom
    return { sx: 1, sy, ox: 0, oy: (1 - sy) / 2 };
}

/** Mirror horizontally, which is what a viewer expects of their own camera and never of anyone else's. */
export function mirrorUV(t) { return { sx: -t.sx, sy: t.sy, ox: t.ox + t.sx, oy: t.oy }; }

/**
 * *** A CAMERA THAT HAS NOT PRODUCED A NEW FRAME IS NOT A REASON TO REDRAW. *** engine/frameDirty.js (v4174)
 * skips a frame when nothing moved, and its rule is that clean is PROVEN rather than assumed: a source that
 * cannot say stays dirty. A webcam is a genuine source of quiet -- a 30fps camera on a 60fps display has
 * nothing new to say every other frame -- so this reports honestly. `seen` is the count of frames actually
 * uploaded, so the probe is "did the number change", never "is the camera on".
 */
export function frameProbe(cam) {
    let last = -1;
    return () => { const n = cam ? cam.frames : 0; const moved = n !== last; last = n; return moved; };
}

/** Live camera into a WebGL2 texture. */
export class CameraTexture {
    constructor(gl, opts = {}) {
        this.gl = gl;
        this.opts = opts;
        this.texture = null;
        this.video = null;
        this.stream = null;
        this.frames = 0;          // frames UPLOADED, which is what frameProbe watches
        this.width = 0;
        this.height = 0;
        this.error = null;
        this._pending = false;
        this._vfc = null;
        this.presentedFrames = -1;   // v4260 -- the compositor's count, straight off rVFC metadata
        this.mediaTime = NaN;        // v4260 -- the presented frame's own timestamp
        this.dropped = 0;            // v4260 -- frames the compositor presented that we never uploaded
    }

    async start(constraints) {
        const gl = this.gl;
        if (typeof navigator === "undefined" || !navigator.mediaDevices) { this.error = "no mediaDevices"; return false; }
        try {
            this.stream = await navigator.mediaDevices.getUserMedia(constraints || { video: { width: 1280, height: 720 }, audio: false });
        } catch (e) { this.error = String(e && e.message || e); return false; }
        const v = document.createElement("video");
        v.autoplay = true; v.muted = true; v.playsInline = true;   // playsInline or iOS opens a fullscreen player
        v.srcObject = this.stream;
        await v.play().catch(() => {});
        this.video = v;

        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        // *** NPOT RULES: CLAMP AND NO MIPMAPS. *** A camera is 1280x720, which is not a power of two. Asking
        // for a mipmap or a REPEAT wrap on it yields an incomplete texture that samples BLACK, with no error.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        // requestVideoFrameCallback fires once per DECODED frame, which is the only honest way to know a new
        // one exists. Without it we fall back to uploading every tick and the frameProbe simply always reads
        // dirty -- worse, but never WRONG, which is the direction that rule has to fail in.
        // v4260 -- *** THE SECOND ARGUMENT IS THE ANSWER TO "WHICH FRAME", AND THIS CALL USED TO THROW IT
        // *** AWAY. *** rVFC hands the callback (now, metadata), and metadata.presentedFrames is the
        // compositor's own count. Keeping it costs one field and buys the one thing a boolean cannot say:
        // whether frames went past UNSEEN. render/videoFrames.mjs (v4260) turns the same metadata into a
        // frame INDEX for a file, where mediaTime is meaningful; for a live camera there is no index to
        // have, so only the count and the drops are recorded here.
        if (typeof v.requestVideoFrameCallback === "function") {
            const tick = (now, md) => {
                this._pending = true;
                if (md && Number.isFinite(md.presentedFrames)) {
                    if (this.presentedFrames >= 0) this.dropped += Math.max(0, md.presentedFrames - this.presentedFrames - 1);
                    this.presentedFrames = md.presentedFrames;
                    this.mediaTime = Number(md.mediaTime);
                }
                this._vfc = v.requestVideoFrameCallback(tick);
            };
            this._vfc = v.requestVideoFrameCallback(tick);
        } else { this._pending = true; this._always = true; }
        return true;
    }

    /** Upload the current frame if there is a new one. Returns true when the texture changed. */
    update() {
        const gl = this.gl, v = this.video;
        if (!v || !this.texture) return false;
        if (!this._pending && !this._always) return false;
        if (v.readyState < 2 || !v.videoWidth) return false;      // nothing decoded yet: not an error, just early
        this.width = v.videoWidth; this.height = v.videoHeight;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);             // video origin is top-left, GL's is bottom-left
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);            // leave the global state as we found it
        this._pending = false;
        this.frames++;
        return true;
    }

    /**
     * *** STOPPING THE TRACKS IS THE WHOLE POINT OF HAVING A STOP. *** Dropping the reference leaves the
     * camera light on: the browser keeps the device open until every track is stopped, and a page that
     * silently holds a camera after the user closed the effect is the one bug here that is not cosmetic.
     */
    stop() {
        try { if (this._vfc && this.video && this.video.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(this._vfc); } catch {}
        try { for (const t of (this.stream ? this.stream.getTracks() : [])) t.stop(); } catch {}
        try { if (this.video) { this.video.pause(); this.video.srcObject = null; } } catch {}
        try { if (this.texture && this.gl) this.gl.deleteTexture(this.texture); } catch {}
        this.stream = null; this.video = null; this.texture = null; this._vfc = null; this._pending = false;
        this.presentedFrames = -1; this.mediaTime = NaN; this.dropped = 0;   // v4260 -- a restart must not report the old run's drops
    }
}

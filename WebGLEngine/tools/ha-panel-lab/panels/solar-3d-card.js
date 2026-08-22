// =============================================================================
// solar-3d-card.js — a Home Assistant custom Lovelace card that renders your
// solar telemetry as a live 3D scene.
//
// Reads three entities and draws them into an atmospheric sky-dome scene:
//   • a battery entity   → a glowing vertical charge column
//   • sun.sun            → a sun that sits at the real azimuth + elevation,
//                          driving the sky color from day → dusk → night
//   • a weather entity   → cloud cover (puffs drift in proportionally)
//
// First-pass scope: read-only visualization, auto-orbit camera + drag to look,
// no config editor (configure via YAML). Three.js is loaded from a CDN at
// runtime (see README for the offline-bundling note).
//
// The scene builder is exported separately (buildSolarScene) so the same code
// can run in the standalone preview page without Home Assistant.
// =============================================================================

const THREE_CDN   = "https://esm.sh/three@0.160.0";
const THREE_LOCAL = "./three.module.js";  // vendored sibling (offline installs)
// Try the locally-vendored Three.js first (works on an internet-isolated HA
// frontend); fall back to the CDN if no local copy sits beside this file.
async function loadThree() {
    try { return await import(THREE_LOCAL); }
    catch (e) { return await import(THREE_CDN); }
}

// -----------------------------------------------------------------------------
// Scene builder. Takes the THREE module as an argument (so the card and the
// preview page can each supply their own import) and returns a controller:
//   { mount(container), update(state), resize(), dispose() }
// state = { batteryLevel 0..100, sunElevation deg, sunAzimuth deg, cloudCoverage 0..100 }
// -----------------------------------------------------------------------------
export function buildSolarScene(THREE) {
    const DOME_R = 120;

    let renderer, scene, camera, raf = 0;
    let sun, sunGlow, sunLight, ambient, skyMat;
    let panels = [];
    let batteryFill, batteryLabelSprite, batteryLabelCanvas, batteryLabelCtx;
    let clouds = [];
    let stars;
    let container = null;

    // Camera orbit state (custom drag-orbit; no OrbitControls dependency)
    let camYaw = -0.6, camPitch = 0.32, camDist = 78;
    let autoRotate = true;
    let dragging = false, lastX = 0, lastY = 0;

    // Current + target state, so data changes ease in rather than snap.
    const cur = { batteryLevel: 50, sunElevation: 30, sunAzimuth: 140, cloudCoverage: 20, gen: 0.5 };
    const tgt = { ...cur };

    // ---- sky color keyframes by sun elevation (degrees) --------------------
    // Each entry: elevation, zenith, horizon, sun tint, ambient, light intensity.
    const C = (hex) => new THREE.Color(hex);
    const SKY_KEYS = [
        { el: -18, zen: C(0x05060d), hor: C(0x0a1024), sun: C(0x223055), amb: C(0x0a0e1a), light: 0.02 },
        { el:  -6, zen: C(0x0b1430), hor: C(0x3a2740), sun: C(0x8a5a7a), amb: C(0x18203a), light: 0.10 },
        { el:   0, zen: C(0x244472), hor: C(0xd98a52), sun: C(0xffb066), amb: C(0x35405e), light: 0.55 },
        { el:   8, zen: C(0x2f6fb5), hor: C(0xe9c08a), sun: C(0xfff0c8), amb: C(0x6a7895), light: 0.95 },
        { el:  30, zen: C(0x2a78c4), hor: C(0xbcd8ef), sun: C(0xffffff), amb: C(0x8aa0bd), light: 1.25 },
        { el:  90, zen: C(0x1f6fd0), hor: C(0xcfe6f7), sun: C(0xffffff), amb: C(0x9fb4cf), light: 1.4 },
    ];
    function skyAt(el) {
        let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
        for (let i = 0; i < SKY_KEYS.length - 1; i++) {
            if (el >= SKY_KEYS[i].el && el <= SKY_KEYS[i + 1].el) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; break; }
        }
        if (el < SKY_KEYS[0].el) { a = b = SKY_KEYS[0]; }
        if (el > SKY_KEYS[SKY_KEYS.length - 1].el) { a = b = SKY_KEYS[SKY_KEYS.length - 1]; }
        const t = a === b ? 0 : (el - a.el) / (b.el - a.el);
        return {
            zen:  a.zen.clone().lerp(b.zen, t),
            hor:  a.hor.clone().lerp(b.hor, t),
            sun:  a.sun.clone().lerp(b.sun, t),
            amb:  a.amb.clone().lerp(b.amb, t),
            light: a.light + (b.light - a.light) * t,
        };
    }

    // ---- helpers -----------------------------------------------------------
    function radialTexture(inner, outer) {
        const s = 128, cv = document.createElement("canvas");
        cv.width = cv.height = s;
        const g = cv.getContext("2d").createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
        g.addColorStop(0, inner); g.addColorStop(1, outer);
        const ctx = cv.getContext("2d");
        ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
        const tex = new THREE.CanvasTexture(cv);
        return tex;
    }
    function panelTexture() {
        const s = 256, cv = document.createElement("canvas");
        cv.width = cv.height = s;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#0b2545"; ctx.fillRect(0, 0, s, s);
        ctx.strokeStyle = "#163a66"; ctx.lineWidth = 3;
        const n = 6, step = s / n;
        for (let i = 0; i <= n; i++) {
            ctx.beginPath(); ctx.moveTo(i*step, 0); ctx.lineTo(i*step, s); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, i*step); ctx.lineTo(s, i*step); ctx.stroke();
        }
        // subtle cell sheen
        ctx.fillStyle = "rgba(90,150,220,0.06)";
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
            if ((x + y) % 2 === 0) ctx.fillRect(x*step+3, y*step+3, step-6, step-6);
        return new THREE.CanvasTexture(cv);
    }

    function sunPosition(elDeg, azDeg) {
        const el = THREE.MathUtils.degToRad(elDeg);
        const az = THREE.MathUtils.degToRad(azDeg);
        // az 0=North(+Z), 90=East(+X), 180=South(-Z); el 0=horizon, 90=up
        return new THREE.Vector3(
            DOME_R * Math.cos(el) * Math.sin(az),
            DOME_R * Math.sin(el),
            DOME_R * Math.cos(el) * Math.cos(az),
        );
    }

    // ---- build -------------------------------------------------------------
    function mount(el) {
        container = el;
        const w = el.clientWidth || 480, h = el.clientHeight || 320;

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        el.appendChild(renderer.domElement);
        renderer.domElement.style.display = "block";
        renderer.domElement.style.cursor = "grab";

        scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0x0a1024, DOME_R * 0.9, DOME_R * 2.2);

        camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);

        // Sky dome — gradient shader sphere, colors set per-frame from sun el.
        skyMat = new THREE.ShaderMaterial({
            side: THREE.BackSide, depthWrite: false,
            uniforms: { topColor: { value: C(0x2a78c4) }, bottomColor: { value: C(0xbcd8ef) } },
            vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
            fragmentShader: `varying vec3 vP; uniform vec3 topColor; uniform vec3 bottomColor;
                void main(){ float h = clamp((normalize(vP).y*0.5+0.5),0.0,1.0); gl_FragColor = vec4(mix(bottomColor, topColor, pow(h,0.8)),1.0);} `,
        });
        scene.add(new THREE.Mesh(new THREE.SphereGeometry(DOME_R * 1.6, 32, 16), skyMat));

        // Ground
        const ground = new THREE.Mesh(
            new THREE.CircleGeometry(DOME_R * 1.4, 64),
            new THREE.MeshStandardMaterial({ color: 0x14202c, roughness: 0.95, metalness: 0.0 }),
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        // Lights
        ambient = new THREE.AmbientLight(0x8aa0bd, 0.7);
        scene.add(ambient);
        sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.set(1024, 1024);
        sunLight.shadow.camera.near = 1; sunLight.shadow.camera.far = DOME_R * 2;
        sunLight.shadow.camera.left = -40; sunLight.shadow.camera.right = 40;
        sunLight.shadow.camera.top = 40; sunLight.shadow.camera.bottom = -40;
        scene.add(sunLight);
        scene.add(sunLight.target);

        // Sun: bright core + additive glow sprite
        sun = new THREE.Mesh(
            new THREE.SphereGeometry(4.2, 24, 24),
            new THREE.MeshBasicMaterial({ color: 0xfff3d0 }),
        );
        scene.add(sun);
        sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: radialTexture("rgba(255,240,200,0.95)", "rgba(255,200,120,0.0)"),
            blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
        }));
        sunGlow.scale.set(40, 40, 1);
        scene.add(sunGlow);

        // Solar panels — three south-facing tilted boards on short posts.
        const ptex = panelTexture();
        for (let i = -1; i <= 1; i++) {
            const grp = new THREE.Group();
            const board = new THREE.Mesh(
                new THREE.BoxGeometry(11, 0.4, 7),
                new THREE.MeshStandardMaterial({
                    map: ptex, roughness: 0.35, metalness: 0.5,
                    emissive: 0x183b6b, emissiveIntensity: 0.0,
                }),
            );
            board.castShadow = true;
            board.rotation.x = THREE.MathUtils.degToRad(-32);   // tilt up toward sky
            board.position.y = 4;
            grp.add(board);
            const post = new THREE.Mesh(
                new THREE.CylinderGeometry(0.4, 0.4, 4, 8),
                new THREE.MeshStandardMaterial({ color: 0x2a3340, roughness: 0.8 }),
            );
            post.position.y = 2; post.castShadow = true;
            grp.add(post);
            grp.position.set(i * 13, 0, 6);
            grp.rotation.y = Math.PI;       // face south (-Z)
            scene.add(grp);
            panels.push(board);
        }

        // Battery — dark track + emissive fill column + floating % label.
        const bx = -26, bz = -4;
        const track = new THREE.Mesh(
            new THREE.CylinderGeometry(2.4, 2.4, 20, 24, 1, true),
            new THREE.MeshStandardMaterial({ color: 0x10161f, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide, transparent: true, opacity: 0.5 }),
        );
        track.position.set(bx, 10, bz);
        scene.add(track);
        batteryFill = new THREE.Mesh(
            new THREE.CylinderGeometry(2.2, 2.2, 20, 24),
            new THREE.MeshStandardMaterial({ color: 0x22dd77, emissive: 0x22dd77, emissiveIntensity: 0.8, roughness: 0.3 }),
        );
        batteryFill.position.set(bx, 0, bz);
        scene.add(batteryFill);
        // label sprite
        batteryLabelCanvas = document.createElement("canvas");
        batteryLabelCanvas.width = 256; batteryLabelCanvas.height = 128;
        batteryLabelCtx = batteryLabelCanvas.getContext("2d");
        const labelTex = new THREE.CanvasTexture(batteryLabelCanvas);
        batteryLabelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthWrite: false }));
        batteryLabelSprite.scale.set(16, 8, 1);
        batteryLabelSprite.position.set(bx, 23, bz);
        batteryLabelSprite.userData.tex = labelTex;
        scene.add(batteryLabelSprite);

        // Clouds — a pool of soft puffs; opacity/visibility scale with cover.
        const cloudTex = radialTexture("rgba(255,255,255,0.9)", "rgba(255,255,255,0.0)");
        for (let i = 0; i < 14; i++) {
            const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0, depthWrite: false }));
            const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 55;
            s.position.set(Math.cos(a) * r, 34 + Math.random() * 26, Math.sin(a) * r);
            const sc = 22 + Math.random() * 26;
            s.scale.set(sc, sc * 0.62, 1);
            s.userData = { a, r, speed: 0.02 + Math.random() * 0.04, baseY: s.position.y };
            scene.add(s);
            clouds.push(s);
        }

        // Stars — points on a high shell; faded in at night.
        const sg = new THREE.BufferGeometry();
        const N = 600, pos = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
            const u = Math.random(), v = Math.random();
            const th = u * Math.PI * 2, ph = Math.acos(2 * v - 1);
            const r = DOME_R * 1.45;
            pos[i*3]   = r * Math.sin(ph) * Math.cos(th);
            pos[i*3+1] = Math.abs(r * Math.cos(ph));   // upper hemisphere
            pos[i*3+2] = r * Math.sin(ph) * Math.sin(th);
        }
        sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, transparent: true, opacity: 0, depthWrite: false }));
        scene.add(stars);

        _bindPointer();
        update(cur);                 // initial paint
        _loop();
    }

    // ---- per-frame ---------------------------------------------------------
    function _loop() {
        raf = requestAnimationFrame(_loop);
        const ease = 0.08;
        for (const k of ["batteryLevel", "sunElevation", "sunAzimuth", "cloudCoverage", "gen"])
            cur[k] += (tgt[k] - cur[k]) * ease;

        // Sky + sun
        const sky = skyAt(cur.sunElevation);
        skyMat.uniforms.topColor.value.copy(sky.zen);
        skyMat.uniforms.bottomColor.value.copy(sky.hor);
        scene.fog.color.copy(sky.hor).multiplyScalar(0.6);
        ambient.color.copy(sky.amb); ambient.intensity = 0.45 + sky.light * 0.35;
        const sp = sunPosition(cur.sunElevation, cur.sunAzimuth);
        sun.position.copy(sp); sunGlow.position.copy(sp);
        sun.material.color.copy(sky.sun); sunGlow.material.color.copy(sky.sun);
        const up = cur.sunElevation > -2;
        sun.visible = sunGlow.visible = up;
        sunLight.position.copy(sp); sunLight.intensity = sky.light;
        sunLight.color.copy(sky.sun);

        // Panels glow with "generation" = sun up × clear sky
        const pe = Math.max(0, cur.gen);
        for (const b of panels) b.material.emissiveIntensity = 0.05 + pe * 0.9;

        // Battery fill height + color (red→amber→green) + label
        const lvl = THREE.MathUtils.clamp(cur.batteryLevel, 0, 100) / 100;
        const fh = Math.max(0.02, lvl) * 20;
        batteryFill.scale.y = fh / 20;
        batteryFill.position.y = fh / 2;
        const col = new THREE.Color().setHSL(0.0 + lvl * 0.33, 0.75, 0.5);   // 0=red .33=green
        batteryFill.material.color.copy(col);
        batteryFill.material.emissive.copy(col);
        batteryFill.material.emissiveIntensity = 0.6 + 0.25 * Math.sin(performance.now() * 0.004);
        _drawBatteryLabel(Math.round(cur.batteryLevel));

        // Clouds drift + opacity from cover
        const cover = cur.cloudCoverage / 100;
        for (const c of clouds) {
            c.userData.a += c.userData.speed * 0.016;
            c.position.x = Math.cos(c.userData.a) * c.userData.r;
            c.position.z = Math.sin(c.userData.a) * c.userData.r;
            const targetOp = Math.max(0, Math.min(1, (cover - clouds.indexOf(c) / clouds.length) * 2)) * 0.85;
            c.material.opacity += (targetOp - c.material.opacity) * 0.05;
        }

        // Stars fade in below the horizon
        const night = THREE.MathUtils.clamp((-cur.sunElevation - 2) / 10, 0, 1);
        stars.material.opacity = night * 0.9;

        // Camera orbit
        if (autoRotate && !dragging) camYaw += 0.0016;
        const cp = Math.max(0.05, Math.min(1.3, camPitch));
        camera.position.set(
            Math.cos(camYaw) * Math.cos(cp) * camDist,
            Math.sin(cp) * camDist + 6,
            Math.sin(camYaw) * Math.cos(cp) * camDist,
        );
        camera.lookAt(-4, 8, 0);

        renderer.render(scene, camera);
    }

    function _drawBatteryLabel(pct) {
        const ctx = batteryLabelCtx;
        ctx.clearRect(0, 0, 256, 128);
        ctx.font = "bold 64px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillText(pct + "%", 130, 66);
        ctx.fillStyle = "#eafff2"; ctx.fillText(pct + "%", 128, 64);
        batteryLabelSprite.userData.tex.needsUpdate = true;
    }

    // ---- public update -----------------------------------------------------
    function update(state) {
        if (state.batteryLevel != null) tgt.batteryLevel = state.batteryLevel;
        if (state.sunElevation != null) tgt.sunElevation = state.sunElevation;
        if (state.sunAzimuth   != null) tgt.sunAzimuth   = state.sunAzimuth;
        if (state.cloudCoverage != null) tgt.cloudCoverage = state.cloudCoverage;
        // generation estimate: sun above horizon × clear-sky fraction
        const elFactor = Math.max(0, Math.sin(THREE.MathUtils.degToRad(tgt.sunElevation)));
        tgt.gen = elFactor * (1 - tgt.cloudCoverage / 100 * 0.8);
    }

    function resize() {
        if (!renderer || !container) return;
        const w = container.clientWidth || 480, h = container.clientHeight || 320;
        renderer.setSize(w, h);
        camera.aspect = w / h; camera.updateProjectionMatrix();
    }

    function _bindPointer() {
        const dom = renderer.domElement;
        const down = (x, y) => { dragging = true; lastX = x; lastY = y; dom.style.cursor = "grabbing"; };
        const move = (x, y) => {
            if (!dragging) return;
            camYaw   -= (x - lastX) * 0.006;
            camPitch += (y - lastY) * 0.006;
            lastX = x; lastY = y;
        };
        const upE = () => { dragging = false; dom.style.cursor = "grab"; };
        dom.addEventListener("mousedown", e => down(e.clientX, e.clientY));
        window.addEventListener("mousemove", e => move(e.clientX, e.clientY));
        window.addEventListener("mouseup", upE);
        dom.addEventListener("touchstart", e => { const t = e.touches[0]; down(t.clientX, t.clientY); }, { passive: true });
        dom.addEventListener("touchmove", e => { const t = e.touches[0]; move(t.clientX, t.clientY); }, { passive: true });
        dom.addEventListener("touchend", upE);
        dom.addEventListener("wheel", e => { camDist = Math.max(40, Math.min(140, camDist + e.deltaY * 0.05)); e.preventDefault(); }, { passive: false });
    }

    function dispose() {
        cancelAnimationFrame(raf);
        if (renderer) { renderer.dispose(); renderer.domElement.remove(); }
        scene = camera = renderer = null;
        panels = []; clouds = [];
    }

    function setAutoRotate(v) { autoRotate = !!v; }

    return { mount, update, resize, dispose, setAutoRotate };
}

// -----------------------------------------------------------------------------
// The Home Assistant custom card element.
// -----------------------------------------------------------------------------
class Solar3DCard extends HTMLElement {
    setConfig(config) {
        this._config = {
            battery_entity: config.battery_entity || "sensor.solar_battery_level",
            sun_entity:     config.sun_entity     || "sun.sun",
            weather_entity: config.weather_entity || null,
            height:         config.height         || 320,
            title:          config.title          || null,
            ...config,
        };
        if (!this.shadowRoot) this.attachShadow({ mode: "open" });
        this.shadowRoot.innerHTML = `
            <style>
                ha-card { overflow: hidden; }
                .wrap { position: relative; width: 100%; }
                .scene { width: 100%; display: block; }
                .title { position: absolute; top: 10px; left: 14px; z-index: 2;
                    font: 600 14px/1.2 ui-sans-serif, system-ui, sans-serif;
                    color: #eafff2; text-shadow: 0 1px 4px rgba(0,0,0,0.6); letter-spacing: 0.02em; }
                .err { padding: 16px; color: var(--error-color, #c33); font-family: monospace; }
            </style>
            <ha-card>
                <div class="wrap">
                    ${this._config.title ? `<div class="title">${this._config.title}</div>` : ""}
                    <div class="scene" style="height:${this._config.height}px"></div>
                </div>
            </ha-card>`;
        this._sceneEl = this.shadowRoot.querySelector(".scene");
        this._initScene();
    }

    async _initScene() {
        if (this._scene || this._initing) return;
        this._initing = true;
        try {
            const THREE = await loadThree();
            this._scene = buildSolarScene(THREE);
            this._scene.mount(this._sceneEl);
            this._ro = new ResizeObserver(() => this._scene && this._scene.resize());
            this._ro.observe(this._sceneEl);
            if (this._lastHass) this._applyHass(this._lastHass);
        } catch (e) {
            this._sceneEl.innerHTML = `<div class="err">3D scene failed to load Three.js from CDN.<br>${e.message}</div>`;
            console.error("[solar-3d-card]", e);
        } finally {
            this._initing = false;
        }
    }

    set hass(hass) {
        this._lastHass = hass;
        if (this._scene) this._applyHass(hass);
    }

    _applyHass(hass) {
        const cfg = this._config;
        const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

        const batt = hass.states[cfg.battery_entity];
        const sun  = hass.states[cfg.sun_entity];
        const wx   = cfg.weather_entity ? hass.states[cfg.weather_entity] : null;

        let cloud = 20;
        if (wx) {
            if (wx.attributes && wx.attributes.cloud_coverage != null) cloud = num(wx.attributes.cloud_coverage, 20);
            else cloud = ({ "sunny": 0, "clear-night": 0, "partlycloudy": 40, "cloudy": 85,
                            "rainy": 90, "pouring": 95, "snowy": 90, "fog": 100,
                            "lightning": 80, "windy": 30 })[wx.state] ?? 20;
        }

        this._scene.update({
            batteryLevel: batt ? num(batt.state, 50) : 50,
            sunElevation: sun ? num(sun.attributes?.elevation, 30) : 30,
            sunAzimuth:   sun ? num(sun.attributes?.azimuth, 140) : 140,
            cloudCoverage: cloud,
        });
    }

    getCardSize() { return Math.ceil((this._config?.height || 320) / 50); }

    disconnectedCallback() {
        if (this._ro) this._ro.disconnect();
        if (this._scene) { this._scene.dispose(); this._scene = null; }
    }

    static getStubConfig() {
        return { battery_entity: "sensor.solar_battery_level", sun_entity: "sun.sun", weather_entity: "weather.home" };
    }
}

if (!customElements.get("solar-3d-card")) {
    customElements.define("solar-3d-card", Solar3DCard);
}

// Register in the HA card picker.
window.customCards = window.customCards || [];
window.customCards.push({
    type: "solar-3d-card",
    name: "Solar 3D Card",
    description: "A live 3D scene of your solar battery, sun position, and cloud cover.",
    preview: false,
});

console.info("%c SOLAR-3D-CARD %c first pass ", "background:#22dd77;color:#062;font-weight:700;border-radius:3px 0 0 3px;padding:2px 6px", "background:#0b2545;color:#cfe6f7;border-radius:0 3px 3px 0;padding:2px 6px");

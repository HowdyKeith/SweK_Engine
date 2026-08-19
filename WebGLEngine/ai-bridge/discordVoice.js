// discordVoice.js — Discord voice for the engine.
//
// A webhook can only post text; to be HEARD in a voice channel you need a real
// bot holding a voice-gateway connection. This module logs a bot in, joins a
// voice channel, and can SAY (engine TTS) or PLAY audio into it.
//
// One-time setup (the user does this):
//   1. Create an application + bot at https://discord.com/developers/applications
//      and copy the BOT TOKEN.
//   2. Invite the bot to your server with the Connect + Speak permissions
//      (OAuth2 URL generator: scopes bot, perms Connect + Speak).
//   3. Run `npm install` in ai-bridge so the voice deps land (see below).
//
// Deps (added to package.json; pure-JS opus + encryption so no build tools are
// needed on the rig): discord.js, @discordjs/voice, opusscript,
// libsodium-wrappers, @noble/ciphers, ffmpeg-static. They're required lazily so
// the bridge still boots if they're not installed yet.

let DJS = null, Voice = null, depError = null;
function _load() {
    if (DJS && Voice) return true;
    try {
        DJS = require("discord.js");
        Voice = require("@discordjs/voice");
        try { const ff = require("ffmpeg-static"); if (ff && !process.env.FFMPEG_PATH) process.env.FFMPEG_PATH = ff; } catch {}
        return true;
    } catch (e) { depError = e.message; return false; }
}

class DiscordVoice {
    constructor() {
        this.client = null; this.ready = false;
        this.connection = null; this.player = null;
        this.guildId = null; this.channelId = null; this.channelName = null;
        this.last = null;
    }

    async login(token) {
        if (!_load()) return { ok: false, error: "voice deps not installed — run `npm install` in ai-bridge. (" + (depError || "") + ")" };
        token = String(token || "").trim();
        if (!token) return { ok: false, error: "bot token required" };
        if (this.client && this.ready) return { ok: true, already: true, user: this.client.user && this.client.user.tag };
        const { Client, GatewayIntentBits } = DJS;
        try { this.client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] }); }
        catch (e) { return { ok: false, error: String(e && e.message || e) }; }
        return new Promise((resolve) => {
            let settled = false;
            const done = (v) => { if (!settled) { settled = true; resolve(v); } };
            this.client.once("ready", () => { this.ready = true; done({ ok: true, user: this.client.user && this.client.user.tag }); });
            this.client.on("error", (e) => done({ ok: false, error: String(e && e.message || e) }));
            this.client.login(token).catch((e) => done({ ok: false, error: "login failed: " + (e && e.message || e) }));
            setTimeout(() => done({ ok: false, error: "login timed out — check the bot token" }), 15000);
        });
    }

    async join(opts = {}) {
        if (!this.ready || !this.client) return { ok: false, error: "not logged in" };
        const guildId = String(opts.guildId || "").trim(), channelId = String(opts.channelId || "").trim();
        if (!guildId || !channelId) return { ok: false, error: "guildId and channelId required" };
        try {
            const { joinVoiceChannel, createAudioPlayer, VoiceConnectionStatus, entersState } = Voice;
            const guild = await this.client.guilds.fetch(guildId);
            const channel = await guild.channels.fetch(channelId);
            if (!channel || typeof channel.isVoiceBased !== "function" || !channel.isVoiceBased()) return { ok: false, error: "that channel id is not a voice channel" };
            this.connection = joinVoiceChannel({ channelId, guildId, adapterCreator: guild.voiceAdapterCreator, selfDeaf: false, selfMute: false });
            this.player = createAudioPlayer();
            this.connection.subscribe(this.player);
            await entersState(this.connection, VoiceConnectionStatus.Ready, 15000);
            this.guildId = guildId; this.channelId = channelId; this.channelName = channel.name;
            return { ok: true, channel: channel.name };
        } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    }

    async play(filePath) {
        if (!this.player || !this.connection) return { ok: false, error: "not in a voice channel — connect first" };
        try {
            const { createAudioResource } = Voice;
            const resource = createAudioResource(filePath);
            this.player.play(resource);
            this.last = { file: filePath, at: Date.now() };
            return { ok: true };
        } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    }

    leave() {
        try { if (this.connection) this.connection.destroy(); } catch {}
        this.connection = null; this.player = null;
        this.guildId = null; this.channelId = null; this.channelName = null;
        return { ok: true };
    }

    status() {
        let deps = null;
        try { if (_load() && Voice && Voice.generateDependencyReport) deps = Voice.generateDependencyReport(); } catch {}
        return {
            ok: true,
            depsInstalled: _load(),
            depError,
            loggedIn: !!this.ready,
            user: (this.client && this.client.user && this.client.user.tag) || null,
            joined: !!this.connection,
            guildId: this.guildId, channelId: this.channelId, channelName: this.channelName,
            deps,
        };
    }

    // v1075 — deep self-test for runtime (esp. Bun) verification. Beyond "does it
    // require", this parses @discordjs/voice's dependency report into a structured
    // opus/encryption/ffmpeg verdict AND actually instantiates an AudioPlayer, so
    // it exercises the audio runtime that's the real risk under Bun.
    selftest() {
        const runtime = (typeof Bun !== "undefined" || (process.versions && process.versions.bun)) ? "bun" : "node";
        const loaded = _load();
        if (!loaded) return { ok: false, loaded: false, runtime, error: depError || "voice deps not installed", hint: "run `npm install` (or `bun install`) in ai-bridge" };
        let report = "";
        try { report = (Voice && Voice.generateDependencyReport) ? Voice.generateDependencyReport() : "(no report)"; } catch (e) { report = "(report failed: " + e.message + ")"; }
        const libOk = (names) => {
            for (const n of names) {
                const m = report.match(new RegExp("-\\s*" + n.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + ":\\s*([^\\n]+)", "i"));
                if (m && !/not found|error|n\/a/i.test(m[1])) return (n + " " + m[1].trim()).trim();
            }
            return null;
        };
        const opus = libOk(["@discordjs/opus", "mediaplex", "opusscript"]);
        const encryption = libOk(["sodium-native", "sodium", "libsodium-wrappers", "tweetnacl", "@noble/ciphers"]);
        let ffmpeg = null;
        const fm = report.match(/ffmpeg[\s\S]*?-\s*version:\s*([^\n]+)/i);
        if (fm && !/not found|error/i.test(fm[1])) ffmpeg = fm[1].trim();
        let playerOk = false, playerErr = null;
        try { const p = Voice.createAudioPlayer(); playerOk = !!p; try { p.stop(); } catch {} } catch (e) { playerErr = e.message; }
        const ready = !!(opus && encryption && playerOk);
        const missing = [!opus ? "no opus library" : null, !encryption ? "no encryption library" : null, !playerOk ? "audio player failed" : null].filter(Boolean);
        return {
            ok: true, loaded: true, runtime, opus, encryption, ffmpeg, playerOk, playerErr, ready,
            verdict: ready
                ? ("Discord voice should work under " + runtime + (ffmpeg ? "" : " (ffmpeg not found — needed to play WAV/TTS; install ffmpeg-static or set FFMPEG_PATH)"))
                : ("Discord voice NOT ready under " + runtime + " — " + missing.join("; ") + (runtime === "bun" ? ". Run the bridge under Node for voice." : ".")),
            report,
        };
    }
}

module.exports = { DiscordVoice };

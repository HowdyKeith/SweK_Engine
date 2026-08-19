// WebGLEngine/tools/roundhouse/taskerStages.mjs -- v3008
//
// THE ANDROID PEER CHAIN, AS STAGES TASKER CAN DRIVE -- AND WHAT PROVES EACH ONE HAPPENED.
//
// Keith runs Tasker on a Shield TV, already wired into this engine. The question was whether it can close the
// gaps between install, run, submit and update. It can, through Termux:Tasker -- the purpose-built plugin that
// lets Tasker execute a script INSIDE Termux. That is the designed seam, not a workaround, and this tree already
// uses its sibling Termux:Boot for start-on-boot since v2935.
//
// ONE STAGE IS DELIBERATELY NOT AUTOMATED, AND THAT IS A DESIGN DECISION RATHER THAN A MISSING FEATURE.
// Installing an APK requires a human tap on stock Android, and Keith's instruction was explicit: the user makes
// that decision when prompted. So `install` is declared human:true and carries no automation. A chain that
// pretended to close that gap would either be describing a rooted device or quietly asking for device-owner
// rights nobody agreed to. THE PROMPT IS THE POINT.
//
// AND THE RULE THE REST OF IT TURNS ON: A TASK THAT FIRED IS NOT A TASK THAT WORKED. Tasker will happily report
// success for a script that ran, found nothing, and exited 0 -- on a device you are not sitting at. So every
// automatable stage names an ARTEFACT the desktop can confirm independently, with a timestamp, and a stale
// artefact is NOT a pass. That is the same discipline as v3006's verified Home Assistant call: the verdict is
// about what the world shows, not about whether the request was accepted.
"use strict";

export const STAGES = [
    {
        id: "install",
        human: true,
        label: "Install Termux, Termux:Tasker and Termux:Boot",
        why: "Android requires a human tap to install an APK, and that is the correct place for a person to decide. Tasker can FETCH the apk from the LAN and open the installer, which turns a download-find-tap-permission dance into one tap -- but the tap stays.",
        source: "F-Droid, not the Play Store: the Play build of Termux is deprecated and its package installs are broken.",
        command: null,
        evidence: null,
        evidenceWhy: "nothing here can confirm an install, and claiming otherwise would be the phantom success this whole surface exists to refuse",
    },
    {
        id: "fetch",
        human: false,
        label: "Pull the newest build and unpack it",
        why: "the step that has failed on real hardware more than any other -- a bare glob that could not see Chrome's '(1)' duplicates, and a storage-permission dialog that a script RACED instead of waiting for.",
        command: "bash ~/swek/termux_peer.sh --fetch-only",
        evidence: null,
        evidenceWhy: "an unpacked tree is not reported by /android/status, so this stage is driveable but NOT independently confirmable from here -- stated rather than papered over",
    },
    {
        id: "run",
        human: false,
        label: "Run the peer suite",
        why: "fifteen to twenty-five minutes that nobody should have to sit through, and the reason a scheduled trigger is worth more here than anywhere else in the chain.",
        command: "bash ~/swek/termux_peer.sh",
        evidence: "phone",
        evidenceWhy: "a ballot lands in Downloads as android-phone.json and /android/status reports its presence AND its timestamp -- so a run that produced nothing is visible as an absent or stale artefact rather than a green Tasker task",
    },
    {
        id: "submit",
        human: false,
        label: "Send the ballot to the hub",
        why: "the outbox already retries and already knows the hub address; Tasker only has to fire it when the network returns.",
        command: "bash ~/swek/swek_outbox.sh",
        evidence: "phone",
        evidenceWhy: "the hub sees the ballot arrive; until it does, the phone has measured something nobody can read",
    },
    {
        id: "update",
        human: false,
        label: "Check whether this phone is behind",
        why: "the policy already defaults to NOTIFY rather than auto-download, because a build is ~21MB of possibly-metered data and Termux cannot tell whether the connection is metered. Tasker can ACT on the notice, which is the part a phone could not do for itself.",
        command: "node ~/swek/tools/roundhouse/androidUpdate.mjs",
        evidence: null,
        evidenceWhy: "the phone's own version is reported by /android/update on the phone side; this hub can only confirm what a ballot tells it",
    },
];

/** Freshness window: an artefact older than this is not evidence that a stage just ran. */
export const FRESH_MS = 6 * 60 * 60 * 1000;

/**
 * Did a stage actually happen? Reads the hub's own /android/status shape.
 * @param {string} id
 * @param {object} status  the object androidPeerBridge.status() returns
 */
export function verifyStage(id, status, now = Date.now()) {
    const st = STAGES.find((s) => s.id === id);
    if (!st) return { id, verdict: "unknown-stage" };
    if (st.human) return { id, verdict: "human", why: st.why };
    if (!st.evidence) return { id, verdict: "unconfirmable", why: st.evidenceWhy };

    const art = status && status[st.evidence];
    if (!art || !art.present) {
        return { id, verdict: "not-done", evidence: st.evidence,
                 why: "no " + st.evidence + " artefact exists. Tasker may have run and produced nothing, which is exactly the case a fired task reports as success." };
    }
    const at = Date.parse(art.at || "");
    if (!Number.isFinite(at)) return { id, verdict: "done-undated", evidence: st.evidence, why: "the artefact exists but carries no timestamp, so it cannot be told from an old one" };
    const ageMs = now - at;
    if (ageMs > FRESH_MS) {
        return { id, verdict: "stale", evidence: st.evidence, ageMs,
                 why: "the artefact is " + Math.round(ageMs / 3600000) + "h old. A STALE ARTEFACT IS NOT A PASS -- it is the previous run being mistaken for this one." };
    }
    return { id, verdict: "done", evidence: st.evidence, at: art.at, ageMs };
}

/** The whole chain, with the human step named as human rather than missing. */
export function chain(status, now = Date.now()) {
    const rows = STAGES.map((s) => ({ ...verifyStage(s.id, status, now), label: s.label, command: s.command, human: !!s.human }));
    return {
        rows,
        automatable: STAGES.filter((s) => !s.human).length,
        humanSteps: STAGES.filter((s) => s.human).map((s) => s.id),
        confirmable: STAGES.filter((s) => !s.human && s.evidence).length,
        note: "Termux:Tasker executes these inside Termux. Only the stages carrying an EVIDENCE artefact can be confirmed from the hub; the rest are driveable and are reported as unconfirmable rather than assumed.",
    };
}

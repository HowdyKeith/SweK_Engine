// net/bridgeBase.mjs
//
// Where the bridge lives, from the page's own location. On the LAN it is http://host:8787. Behind the Public tunnel
// (https://*.trycloudflare.com) the page origin IS the bridge: there is no :8787 on that host, and an http:// or ws:// URL
// from an https page is blocked as mixed content. Same-origin whenever the page is https.
// PURE: `loc` is an argument. brains/bridgeClient.js is a classic script and carries an inline copy of this rule.
export function bridgeBase(loc = {}, port = 8787) {
    const host = loc.hostname || "localhost";
    if (loc.protocol === "https:") return { http: loc.origin || "https://" + (loc.host || host), ws: "wss://" + (loc.host || host) };
    return { http: "http://" + host + ":" + port, ws: "ws://" + host + ":" + port };
}

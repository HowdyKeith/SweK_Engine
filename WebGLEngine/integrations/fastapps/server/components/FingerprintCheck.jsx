import React from "react";
import { useWidgetProps } from "fastapps";

// Renders the SweK fleet fingerprint report: the master, whether the fleet agrees,
// and a per-peer match/divergence list.
export default function FingerprintCheck() {
  const props = useWidgetProps();
  const master = (props.master || "").slice(0, 16);
  const ok = props.allMatch;
  return (
    <div style={{ fontFamily: "ui-monospace, monospace", background: "#06140c", color: "#cfe8d8", padding: 16, borderRadius: 10 }}>
      <div style={{ fontSize: 13, letterSpacing: ".05em", color: "#ffcc66", textTransform: "uppercase" }}>
        SweK Fleet Fingerprint
      </div>
      <div style={{ marginTop: 8, fontSize: 12 }}>
        master <code style={{ color: "#33ccff" }}>{master}&hellip;</code>
      </div>
      <div style={{ marginTop: 8, fontSize: 15, color: ok ? "#9fe6c0" : "#e8736a" }}>
        {ok ? "\u2714 all peers agree" : "\u2716 mismatch"}
        <span style={{ color: "#6a8a78", fontSize: 12, marginLeft: 8 }}>
          {props.reached}/{props.checked} reached
        </span>
      </div>
      <ul style={{ marginTop: 10, listStyle: "none", padding: 0, fontSize: 12 }}>
        {(props.peers || []).map((p, i) => (
          <li key={i} style={{ color: p.match ? "#9fe6c0" : p.reachable ? "#e8736a" : "#6a8a78" }}>
            {p.match ? "\u2714" : p.reachable ? "\u2716 divergent" : "\u2014 unreachable"} &nbsp;{p.id}
          </li>
        ))}
      </ul>
      {props.summary ? <div style={{ marginTop: 8, fontSize: 11, color: "#6a8a78" }}>{props.summary}</div> : null}
    </div>
  );
}

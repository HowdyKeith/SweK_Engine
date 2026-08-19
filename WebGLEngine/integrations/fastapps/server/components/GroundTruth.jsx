import React from "react";
import { useWidgetProps } from "fastapps";

// Renders the SweK 4D ground-truth summary: scene size, visible fraction, and the
// end-point error of a cheat estimator (given true depth ~ 0) versus honest guesses.
export default function GroundTruth() {
  const props = useWidgetProps();
  const pct = Math.round((props.visibleFrac || 0) * 100);
  const row = (label, val, color) => (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
      <span style={{ color: "#6a8a78" }}>{label}</span>
      <b style={{ color }}>{val}</b>
    </div>
  );
  return (
    <div style={{ fontFamily: "ui-monospace, monospace", background: "#06140c", color: "#cfe8d8", padding: 16, borderRadius: 10 }}>
      <div style={{ fontSize: 13, letterSpacing: ".05em", color: "#ffcc66", textTransform: "uppercase" }}>
        SweK 4D Ground Truth &nbsp;<span style={{ color: "#6a8a78", fontSize: 11 }}>seed {props.seed}</span>
      </div>
      <div style={{ marginTop: 10 }}>
        {row("points \u00d7 frames", (props.nPoints || 0) + " \u00d7 " + (props.nFrames || 0), "#cfe8d8")}
        {row("visible", pct + "%", "#33ccff")}
        {row("cheat estimator (true depth) EPE", Number(props.cheatEpe || 0).toExponential(1), "#9fe6c0")}
        {row("assume mid-depth EPE", Number(props.midEpe || 0).toFixed(3), "#ffcc66")}
        {row("assume near-plane EPE", Number(props.nearEpe || 0).toFixed(3), "#e8736a")}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: "#6a8a78" }}>
        The cheat estimator scores ~0 because the pipeline is exact; honest estimators must guess the depth the observation threw away, and pay for it.
      </div>
    </div>
  );
}

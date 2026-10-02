import { ImageResponse } from "next/og";

export const alt = "WildNetwork: a live, open map of wildlife movement";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "linear-gradient(135deg, #020617 0%, #0b2a3a 100%)", color: "#f1f5f9" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 14, background: "#7fd320" }} />
          <div style={{ fontSize: 34, color: "#22d3ee", letterSpacing: 2 }}>LIVE · OPEN DATA · OPEN SOURCE</div>
        </div>
        <div style={{ fontSize: 120, fontWeight: 700, marginTop: 30, letterSpacing: -3 }}>WildNetwork</div>
        <div style={{ fontSize: 44, marginTop: 20, color: "#cbd5e1", lineHeight: 1.3 }}>Where birds, bats and other animals are now, and where they are going.</div>
        <div style={{ fontSize: 30, marginTop: 50, color: "#64748b" }}>wildnetwork.arunrajiah.com</div>
      </div>
    ),
    size,
  );
}

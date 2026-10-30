import { ImageResponse } from "next/og";

export const alt = "The Data Foundry — Data Engineering practice";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function SocialPreview() {
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: 72, background: "#0b1220", color: "#f8fafc" }}>
      <div style={{ display: "flex", color: "#99f6e4", fontSize: 30, letterSpacing: 5 }}>THE DATA FOUNDRY</div>
      <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.1 }}>Practice Data Engineering like real work.</div>
      <div style={{ display: "flex", fontSize: 28, color: "#cbd5e1" }}>SQL · Python · PySpark · Production debugging</div>
    </div>,
    size
  );
}

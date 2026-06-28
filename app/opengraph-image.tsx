import { ImageResponse } from "next/og";

export const alt = "Bar Moshe — I want to build the next thing at HoneyBook.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Shareable link preview card (WhatsApp / Slack / email). Brand yellow + ink. */
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "#FFFA56",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, fontWeight: 700, color: "#142127" }}>
          <span>Bar Moshe</span>
          <span style={{ opacity: 0.6 }}>For the HoneyBook team</span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 88,
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.02,
            color: "#142127",
            maxWidth: 980,
          }}
        >
          I want to build the next thing at HoneyBook.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 600, color: "#142127" }}>
          <div style={{ display: "flex", width: 18, height: 18, borderRadius: 9, background: "#142127" }} />
          AI-native builder · ships in hours, not quarters
        </div>
      </div>
    ),
    { ...size },
  );
}

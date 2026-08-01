import { ImageResponse } from "next/og";

export const alt = "Smart files, built for real. Choose, sign, pay.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * This route gets its own preview card. The site-wide one is addressed to a
 * company by name, which is exactly what should not appear when this link is
 * pasted into a chat.
 */
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
          background: "#FFFDF7",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 28,
            fontWeight: 700,
            color: "#142127",
          }}
        >
          <span>Smart files</span>
          <span style={{ opacity: 0.55 }}>A working demo</span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 82,
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.03,
            color: "#142127",
            maxWidth: 960,
          }}
        >
          A proposal, a contract and an invoice in one link.
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 28,
            fontWeight: 600,
            color: "#142127",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 18,
              height: 18,
              borderRadius: 9,
              background: "#FFFA56",
              border: "3px solid #142127",
            }}
          />
          Choose, sign, pay &middot; built in two days with Claude Code
        </div>
      </div>
    ),
    { ...size },
  );
}

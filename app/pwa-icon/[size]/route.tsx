import { ImageResponse } from "next/og";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ size: string }> }
) {
  const { size } = await params;
  const s = size === "512" ? 512 : size === "180" ? 180 : 192;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#059669",
          color: "white",
          fontSize: s * 0.55,
          fontWeight: 700,
        }}
      >
        ¥
      </div>
    ),
    { width: s, height: s }
  );
}

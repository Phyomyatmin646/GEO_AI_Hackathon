import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY ?? "";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const params = new URLSearchParams();

  const source = searchParams.get("source");
  const region = searchParams.get("region");
  const limit = searchParams.get("limit");
  const offset = searchParams.get("offset");

  if (source) params.set("source", source);
  if (region) params.set("region", region);
  if (limit) params.set("limit", limit);
  if (offset) params.set("offset", offset);

  const qs = params.toString();
  const url = `${BACKEND_URL}/api/v1/market-prices/commodities/latest${qs ? `?${qs}` : ""}`;

  try {
    const res = await fetch(url, {
      headers: { "x-api-key": BACKEND_API_KEY },
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Market price data unavailable", status: res.status },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to connect to market price service" },
      { status: 503 },
    );
  }
}

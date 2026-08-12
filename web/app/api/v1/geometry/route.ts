import { NextResponse } from "next/server";
import { loadPilotBundle, resolvePilotRegion, PilotRegionError } from "@/app/lib/pilot-data";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawRegion = url.searchParams.get("region") ?? "ayeyawaddy";

  try {
    const region = resolvePilotRegion(rawRegion);
    const bundle = await loadPilotBundle(region);
    
    // Extract only geometry
    const geometry = bundle.cells.map(cell => ({
      id: cell.id,
      polygon: cell.polygon
    }));

    return NextResponse.json(
      { region, geometry },
      {
        headers: {
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-API-Version": "1",
        },
      },
    );
  } catch (error) {
    if (error instanceof PilotRegionError) {
      return NextResponse.json(
        { error: { code: "UNKNOWN_REGION", message: "Region is not supported." } },
        { status: 400, headers: { "Cache-Control": "public, max-age=3600" } },
      );
    }
    return NextResponse.json(
      { error: { code: "GEOMETRY_UNAVAILABLE", message: "Geometry is unavailable." } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

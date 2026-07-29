import { NextResponse } from "next/server";
import climateSnapshot from "../../../../data/official/climate_ayeyawaddy.json";

export async function GET() {
  return NextResponse.json(climateSnapshot, {
    headers: {
      "Cache-Control": "no-store",
      "X-Data-Contract": climateSnapshot.dataContract,
      "X-Data-Verification": "qa-passed-source-backed",
    },
  });
}

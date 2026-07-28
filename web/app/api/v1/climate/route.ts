import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    let disasterData = [];
    
    try {
      disasterData = (await import("../../../../../data/macro/climate_disasters.json", { with: { type: "json" } })).default;
    } catch (e) {
      console.error("Missing climate_disasters.json");
    }

    return NextResponse.json({
      climate: disasterData
    });
  } catch (error) {
    console.error("Climate API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

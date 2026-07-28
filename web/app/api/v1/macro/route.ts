import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(request: Request) {
  try {
    const macroPath = path.join(process.cwd(), "data", "macro", "macro_forecast.json");
    const phenologyPath = path.join(process.cwd(), "data", "macro", "phenology.json");
    
    let macroData = [];
    let phenologyData = [];
    
    if (fs.existsSync(macroPath)) {
      macroData = JSON.parse(fs.readFileSync(macroPath, "utf-8"));
    }
    if (fs.existsSync(phenologyPath)) {
      phenologyData = JSON.parse(fs.readFileSync(phenologyPath, "utf-8"));
    }

    return NextResponse.json({
      macro: macroData,
      phenology: phenologyData
    });
  } catch (error) {
    console.error("Macro API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

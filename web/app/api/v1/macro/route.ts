import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(request: Request) {
  try {
    let macroData = [];
    let climateData = {};
    let tradeData = {};
    let cropCalendar = {};
    
    try {
      macroData = (await import("../../../../../data/macro/macro_forecast.json", { with: { type: "json" } })).default;
    } catch (e) {
      console.error("Missing macro_forecast.json");
    }

    try {
      climateData = (await import("../../../../../data/macro/climate_disasters.json", { with: { type: "json" } })).default;
    } catch (e) {
      console.error("Missing climate_disasters.json");
    }

    try {
      tradeData = (await import("../../../../../data/macro/trade_data.json", { with: { type: "json" } })).default;
    } catch (e) {
      console.error("Missing trade_data.json");
    }

    try {
      cropCalendar = (await import("../../../../../data/macro/crop_calendar.json", { with: { type: "json" } })).default;
    } catch (e) {
      console.error("Missing crop_calendar.json");
    }

    return NextResponse.json({
      macro: macroData,
      climate: climateData,
      trade: tradeData,
      crop_calendar: cropCalendar
    });
  } catch (error) {
    console.error("Macro API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

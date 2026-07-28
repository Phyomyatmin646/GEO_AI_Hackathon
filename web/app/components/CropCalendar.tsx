"use client";

import { CROP_COLORS } from "../lib/colors";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function CropCalendar({ calendarData, t }: { calendarData: any, t: any }) {
  if (!calendarData || !calendarData.calendar || !t) return null;

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-100/50 mb-8">
      <h2 className="text-xl font-semibold mb-6 text-slate-700">{t.cropCalendarTitle}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="pb-3 font-semibold text-slate-500 w-48">{t.crop}</th>
              <th className="pb-3 font-semibold text-slate-500 w-32 hidden md:table-cell">{t.suitableRegions}</th>
              {MONTHS.map((m: string) => (
                <th key={m} className="pb-3 font-semibold text-slate-500 text-center w-12">{m.slice(0, 3)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calendarData.calendar.map((crop: any, idx: number) => {
              // We'll use a fallback color if not in CROP_COLORS
              const color = CROP_COLORS[crop.crop] || CROP_COLORS[crop.crop.split(" ")[0]] || "#0ea5e9";
              return (
                <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition">
                  <td className="py-3 font-medium text-slate-700">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }}></span>
                      <div className="flex flex-col">
                        <span>{crop.crop}</span>
                        <span className="text-xs text-slate-400 font-normal">{crop.type}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 hidden md:table-cell text-xs text-slate-500">
                    {crop.regions.join(", ")}
                  </td>
                  {MONTHS.map((m: string, i: number) => {
                    const isSowing = crop.sowing_months.includes(m);
                    const isHarvesting = crop.harvesting_months.includes(m);
                    
                    return (
                      <td key={i} className="py-3 text-center px-1">
                        <div className="flex flex-col gap-1 items-center justify-center">
                          {isSowing && <span className="inline-block w-full py-1 bg-amber-100 text-amber-700 rounded text-[10px] sm:text-xs font-medium leading-none" title="Sowing">{t.sow}</span>}
                          {isHarvesting && <span className="inline-block w-full py-1 bg-emerald-100 text-emerald-700 rounded text-[10px] sm:text-xs font-medium leading-none" title="Harvesting">{t.harv}</span>}
                          {!isSowing && !isHarvesting && <span className="inline-block w-full py-1 text-slate-300">-</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

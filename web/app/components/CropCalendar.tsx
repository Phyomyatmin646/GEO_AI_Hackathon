"use client";

import DataStatusCard from "./DataStatusCard";

type Language = "en" | "my";

type CropCalendarProps = {
  calendarData?: unknown;
  t?: unknown;
  language?: Language;
};

export default function CropCalendar({ language = "en" }: CropCalendarProps) {
  const isMyanmar = language === "my";

  return (
    <DataStatusCard
      title={isMyanmar ? "သီးနှံစိုက်ပျိုးပြက္ခဒိန်" : "Crop calendar"}
      status={isMyanmar ? "ရင်းမြစ် စစ်ဆေးအတည်ပြုမှု စောင့်ဆိုင်းနေသည်" : "Source verification pending"}
      description={isMyanmar
        ? "ဒေသအလိုက် သီးနှံစိုက်ပျိုးနှင့် ရိတ်သိမ်းချိန် အချက်အလက်များကို ရင်းမြစ် စစ်ဆေးအတည်ပြုပြီးမှသာ ဖော်ပြမည်ဖြစ်ပါသည်။"
        : "Regional crop planting and harvest timing is withheld until its source is verified."}
    />
  );
}

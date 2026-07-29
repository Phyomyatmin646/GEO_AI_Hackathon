"use client";

import DataStatusCard from "./DataStatusCard";

type Language = "en" | "my";

type ClimateDisasterChartProps = {
  climateData?: unknown;
  t?: unknown;
  language?: Language;
};

export default function ClimateDisasterChart({ language = "en" }: ClimateDisasterChartProps) {
  const isMyanmar = language === "my";

  return (
    <DataStatusCard
      title={isMyanmar ? "ရာသီဥတုနှင့် သဘာဝဘေး အချက်အလက်" : "Climate and disaster data"}
      status={isMyanmar ? "မထုတ်ဝေရသေးပါ" : "Not published"}
      description={isMyanmar
        ? "ရာသီဥတုပြောင်းလဲမှု trend၊ သဘာဝဘေးသက်ရောက်မှုနှင့် အန္တရာယ်ခန့်မှန်းချက်များကို စစ်ဆေးအတည်ပြုထားသော နည်းလမ်းနှင့် ရင်းမြစ်များ မရရှိသေးသဖြင့် မဖော်ပြထားပါ။"
        : "Climate-change trends, disaster impacts, and risk forecasts are withheld until verified methods and sources are available."}
    />
  );
}

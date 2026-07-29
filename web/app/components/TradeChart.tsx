"use client";

import DataStatusCard from "./DataStatusCard";

type Language = "en" | "my";

type TradeChartProps = {
  tradeData?: unknown;
  t?: unknown;
  language?: Language;
};

export default function TradeChart({ language = "en" }: TradeChartProps) {
  const isMyanmar = language === "my";

  return (
    <DataStatusCard
      title={isMyanmar ? "ကုန်သွယ်မှု အချက်အလက်" : "Trade data"}
      status={isMyanmar ? "ရင်းမြစ် စစ်ဆေးအတည်ပြုမှု စောင့်ဆိုင်းနေသည်" : "Source verification pending"}
      description={isMyanmar
        ? "ကုန်သွယ်မှု ကိန်းဂဏန်း၊ trend နှင့် chart များကို ရင်းမြစ်နှင့် နည်းလမ်း စစ်ဆေးအတည်ပြုပြီးမှသာ ဖော်ပြမည်ဖြစ်ပါသည်။"
        : "Trade values, trends, and charts are withheld until their sources and methods are verified."}
    />
  );
}

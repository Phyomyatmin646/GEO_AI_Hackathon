import { NextResponse } from "next/server";

const macroStatus = {
  apiVersion: "v1",
  dataContract: "macro_trade_source_verification_pending",
  title: {
    en: "Macro & trade data status",
    my: "စီးပွားရေးနှင့် ကုန်သွယ်မှု အချက်အလက် အခြေအနေ",
  },
  subtitle: {
    en: "Macro-economic and trade data are pending source verification. This release does not publish numeric series, estimates, or forecasts for them.",
    my: "စီးပွားရေးနှင့် ကုန်သွယ်မှု အချက်အလက်များသည် ရင်းမြစ် စစ်ဆေးအတည်ပြုမှု စောင့်ဆိုင်းနေပါသည်။ ဤ release တွင် ၎င်းတို့အတွက် ကိန်းဂဏန်းအတန်း၊ ခန့်မှန်းတန်ဖိုး သို့မဟုတ် forecast များကို မထုတ်ဝေပါ။",
  },
  macroTrade: {
    status: {
      en: "Source verification pending",
      my: "ရင်းမြစ် စစ်ဆေးအတည်ပြုမှု စောင့်ဆိုင်းနေသည်",
    },
    description: {
      en: "The application withholds macro and trade values until the originating source, coverage, date, units, and transformation method have been verified.",
      my: "မူရင်းရင်းမြစ်၊ လွှမ်းခြုံမှု၊ ရက်စွဲ၊ ယူနစ်နှင့် ပြောင်းလဲတွက်ချက်နည်းကို စစ်ဆေးအတည်ပြုပြီးမှသာ စီးပွားရေးနှင့် ကုန်သွယ်မှုတန်ဖိုးများကို ထုတ်ဝေမည်ဖြစ်ပါသည်။",
    },
    withheld: [
      {
        en: "GDP and agriculture-share series",
        my: "GDP နှင့် စိုက်ပျိုးရေးကဏ္ဍ ပါဝင်မှုအချိုး အချက်အလက်များ",
      },
      {
        en: "Import, export, and trade-balance series",
        my: "သွင်းကုန်၊ ပို့ကုန်နှင့် ကုန်သွယ်မှုလက်ကျန် အချက်အလက်များ",
      },
      {
        en: "Crop-calendar data and all estimates or forecasts",
        my: "သီးနှံပြက္ခဒိန် အချက်အလက်နှင့် ခန့်မှန်းတန်ဖိုး/forecast အားလုံး",
      },
    ],
  },
  publicationRule: {
    title: {
      en: "What will be published later",
      my: "နောက်ပိုင်း ထုတ်ဝေမည့် အချက်အလက်များ",
    },
    description: {
      en: "A future release may publish verified records with source citations, coverage dates, units, and method notes. Until then, no chart should be read as measured data or an AI forecast.",
      my: "အနာဂတ် release တွင် ရင်းမြစ်ကိုးကားချက်၊ လွှမ်းခြုံသည့် ရက်စွဲ၊ ယူနစ်နှင့် နည်းလမ်းမှတ်ချက်ပါသော စစ်ဆေးပြီး record များကို ထုတ်ဝေနိုင်ပါသည်။ ထိုအချိန်မတိုင်မီ chart များကို တိုင်းတာထားသော data သို့မဟုတ် AI forecast အဖြစ် မယူဆသင့်ပါ။",
    },
  },
} as const;

export async function GET() {
  return NextResponse.json(macroStatus, {
    headers: {
      "Cache-Control": "no-store",
      "X-Data-Contract": macroStatus.dataContract,
    },
  });
}

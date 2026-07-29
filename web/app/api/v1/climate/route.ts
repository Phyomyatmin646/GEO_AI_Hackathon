import { NextResponse } from "next/server";

const climateStatus = {
  apiVersion: "v1",
  dataContract: "climate_evidence_status_only",
  title: {
    en: "Climate evidence status",
    my: "ရာသီဥတု အထောက်အထား အခြေအနေ",
  },
  subtitle: {
    en: "Only evidence available in this regional release is described here. Unpublished analyses and unverified event figures are intentionally withheld.",
    my: "ဤဒေသအလိုက် release တွင် ရရှိနိုင်သော အထောက်အထားကိုသာ ဖော်ပြထားပါသည်။ မထုတ်ဝေရသေးသော ခွဲခြမ်းစိတ်ဖြာချက်များနှင့် မစစ်ဆေးရသေးသော ဖြစ်ရပ်ကိန်းဂဏန်းများကို ရည်ရွယ်ချက်ရှိရှိ မဖော်ပြထားပါ။",
  },
  weatherEvidence: {
    status: {
      en: "Available in the regional release",
      my: "ဒေသအလိုက် release တွင် ရရှိနိုင်သည်",
    },
    description: {
      en: "Weather evidence is available as regional source data. This status does not publish a national climate-change baseline, anomaly, trend, or forecast.",
      my: "ရာသီဥတု အထောက်အထားကို ဒေသအလိုက် source data အဖြစ် ရရှိနိုင်ပါသည်။ ဤအခြေအနေသည် နိုင်ငံအဆင့် ရာသီဥတုပြောင်းလဲမှု baseline၊ anomaly၊ trend သို့မဟုတ် ခန့်မှန်းချက်ကို မထုတ်ဝေပါ။",
    },
    sources: [
      {
        en: "CHIRPS v3: precipitation",
        my: "CHIRPS v3: မိုးရေချိန်",
      },
      {
        en: "ERA5-Land: temperature, solar radiation, and soil moisture",
        my: "ERA5-Land: အပူချိန်၊ နေရောင်ခြည်စွမ်းအင်နှင့် မြေဆီလွှာအစိုဓာတ်",
      },
    ],
  },
  climateChange: {
    status: {
      en: "Not yet published",
      my: "မထုတ်ဝေရသေးပါ",
    },
    description: {
      en: "Climate-change baselines, anomalies, trends, and scenarios have not been published for this release. No values or conclusions should be inferred from this page.",
      my: "ဤ release အတွက် ရာသီဥတုပြောင်းလဲမှု baseline၊ anomaly၊ trend နှင့် scenario များကို မထုတ်ဝေရသေးပါ။ ဤစာမျက်နှာမှ ကိန်းဂဏန်း သို့မဟုတ် ကောက်ချက်ကို မယူဆသင့်ပါ။",
    },
    withheld: [
      {
        en: "Climate normals and baselines",
        my: "ရာသီဥတုပုံမှန်တန်ဖိုးနှင့် baseline များ",
      },
      {
        en: "Anomalies and long-term trends",
        my: "anomaly နှင့် ရေရှည် trend များ",
      },
      {
        en: "Future climate scenarios or forecasts",
        my: "အနာဂတ် ရာသီဥတု scenario သို့မဟုတ် ခန့်မှန်းချက်များ",
      },
    ],
  },
  disasterHistory: {
    status: {
      en: "Source verification pending",
      my: "ရင်းမြစ် စစ်ဆေးအတည်ပြုမှု စောင့်ဆိုင်းနေသည်",
    },
    description: {
      en: "Event lists, severity labels, affected-area figures, and financial-loss figures are not published until their sources and methods are verified.",
      my: "ဖြစ်ရပ်စာရင်း၊ ပြင်းထန်မှုအဆင့်၊ ထိခိုက်ဧရိယာနှင့် ငွေကြေးဆုံးရှုံးမှု ကိန်းဂဏန်းများကို ရင်းမြစ်နှင့် နည်းလမ်း စစ်ဆေးအတည်ပြုပြီးမှသာ ထုတ်ဝေမည်ဖြစ်ပါသည်။",
    },
  },
} as const;

export async function GET() {
  return NextResponse.json(climateStatus, {
    headers: {
      "Cache-Control": "no-store",
      "X-Data-Contract": climateStatus.dataContract,
    },
  });
}

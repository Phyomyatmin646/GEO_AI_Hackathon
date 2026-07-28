export type Dictionary = {
  loading: {
    title: string;
    description: string;
  };
  error: {
    title: string;
    description: string;
    retry: string;
  };
  header: {
    title: string;
    description: string;
  };
  cell: {
    missing: string;
    notPublished: string;
    abstainedStatus: string;
    abstainedDesc: string;
    scoredStatus: string;
    features: {
      title: string;
      weatherEvidencetitle: string;
      climateTrendTitle: string;
      terrainAndSoilTitle: string;
      pendingClimateData: string;
    };
    macro: {
      title: string;
      subtitle: string;
      gdpTrend: string;
      tradeBalance: string;
      agriShare: string;
      phenology: string;
      forecastInfo: string;
      export: string;
    };
  };
  faq: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    noResults: string;
    categoryAll: string;
    categoryGeneral: string;
  };
};

export const en: Dictionary = {
  loading: {
    title: "Loading real pilot data...",
    description: "Reading QA-approved Ayeyawaddy 5 km cells from API..."
  },
  error: {
    title: "Cannot load pilot data",
    description: "API returned no pilot cells.",
    retry: "Retry"
  },
  header: {
    title: "မြေသိ | Myanmar Crop Intelligence",
    description: "Explainable crop screening using real satellite, climate, and soil evidence."
  },
  cell: {
    missing: "Missing",
    notPublished: "Not published",
    abstainedStatus: "Insufficient Evidence",
    abstainedDesc: "Abstained from recommendation due to missing features.",
    scoredStatus: "Scored",
    features: {
      title: "Environmental Features",
      weatherEvidencetitle: "Weather Evidence (CHIRPS/ERA5)",
      climateTrendTitle: "Climate Trend (30-year normal/anomaly)",
      terrainAndSoilTitle: "Terrain & Soil",
      pendingClimateData: "Pending full GEE extraction..."
    },
    macro: {
      title: "National Macro-Economics",
      subtitle: "Economic & Trade Impact of Agriculture",
      gdpTrend: "Agricultural GDP Trend",
      tradeBalance: "Export Balance",
      agriShare: "Agriculture % of GDP",
      phenology: "Crop Calendar (Phenology)",
      forecastInfo: "Dotted lines indicate AI forecasting for the next 5 years based on historical trends.",
      export: "Exports (USD)"
    }
  },
  faq: {
    title: "Frequently Asked Questions",
    subtitle: "Search verified answers and recommendations",
    searchPlaceholder: "Search questions...",
    noResults: "No answers found.",
    categoryAll: "All Categories",
    categoryGeneral: "General"
  }
};

export const my: Dictionary = {
  loading: {
    title: "Real pilot data တင်နေသည်...",
    description: "QA-approved Ayeyawaddy 5 km cells ကို API မှ ဖတ်နေပါသည်..."
  },
  error: {
    title: "Pilot data မတင်နိုင်ပါ",
    description: "API မှ cell များ မရရှိပါ။",
    retry: "ပြန်စမ်းမည်"
  },
  header: {
    title: "မြေသိ | Myanmar Crop Intelligence",
    description: "ဂြိုဟ်တု၊ ရာသီဥတု၊ မြေဆီလွှာ အထောက်အထားများဖြင့် သီးနှံဖြစ်ထွန်းနိုင်ခြေကို တွက်ချက်ပြသခြင်း"
  },
  cell: {
    missing: "မရှိ / missing",
    notPublished: "not published",
    abstainedStatus: "အထောက်အထား မလုံလောက်ပါ",
    abstainedDesc: "အချက်အလက်မပြည့်စုံသဖြင့် အကြံပြုချက်မပေးနိုင်ပါ။",
    scoredStatus: "တွက်ချက်ထားသည်",
    features: {
      title: "ပတ်ဝန်းကျင် အချက်အလက်များ",
      weatherEvidencetitle: "လက်ရှိ ရာသီဥတု အခြေအနေ (CHIRPS/ERA5)",
      climateTrendTitle: "ရာသီဥတု ပြောင်းလဲမှုပုံစံ (နှစ် ၃၀ ပျမ်းမျှ)",
      terrainAndSoilTitle: "မြေမျက်နှာသွင်ပြင် နှင့် မြေဆီလွှာ",
      pendingClimateData: "GEE အချက်အလက် အပြည့်အစုံ ရယူနေဆဲ..."
    },
    macro: {
      title: "နိုင်ငံတော် စီးပွားရေး အချက်အလက်",
      subtitle: "စိုက်ပျိုးရေးကဏ္ဍ၏ စီးပွားရေးနှင့် ကုန်သွယ်မှု အကျိုးသက်ရောက်မှု",
      gdpTrend: "စိုက်ပျိုးရေး GDP တိုးတက်မှု",
      tradeBalance: "ပို့ကုန် ပမာဏ",
      agriShare: "စိုက်ပျိုးရေးကဏ္ဍ ပါဝင်မှုရာခိုင်နှုန်း",
      phenology: "သီးနှံ စိုက်ပျိုး/ရိတ်သိမ်းချိန် ပြက္ခဒိန်",
      forecastInfo: "အစက်ချမျဉ်းများမှာ ယခင်နှစ်များ၏ အချက်အလက်များပေါ်မူတည်၍ လာမည့် ၅ နှစ်အတွက် AI မှ ခန့်မှန်းထားချက်များ ဖြစ်ပါသည်။",
      export: "ပို့ကုန် (အမေရိကန်ဒေါ်လာ)"
    }
  },
  faq: {
    title: "အမေးများသော မေးခွန်းများ",
    subtitle: "စိုက်ပျိုးရေးနှင့် ပတ်သက်သော အမေးအဖြေများကို ရှာဖွေနိုင်ပါသည်",
    searchPlaceholder: "မေးခွန်းများကို ရှာဖွေပါ...",
    noResults: "ရှာဖွေမှု ရလဒ် မတွေ့ရှိပါ။",
    categoryAll: "ကဏ္ဍအားလုံး",
    categoryGeneral: "အထွေထွေ"
  }
};

export const dictionaries = { en, my };
export type Language = keyof typeof dictionaries;

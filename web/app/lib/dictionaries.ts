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
    macroNew: {
      detailedExports: string;
      historicalTradeTrend: string;
      totalExports: string;
      totalImports: string;
      exportValue: string;
      cropCalendarTitle: string;
      crop: string;
      suitableRegions: string;
      sow: string;
      harv: string;
      climateTrendsTitle: string;
      avgTemp: string;
      historicalDisastersTitle: string;
      affectedArea: string;
      totalImpact: string;
      financialImpact: string;
      futureRisksTitle: string;
      disasterNote: string;
    };
  };
  dashboard: {
    heroTitlePre: string;
    heroTitleEm: string;
    heroNoteTitle: string;
    heroNoteDesc: string;
    metricCells: string;
    metricScored: string;
    metricAbstained: string;
    metricLabels: string;
    mapToolbar: string;
    missingUnknown: string;
    reviewTitle: string;
    reviewQuestion: string;
    reviewPlaceholder: string;
    saveReview: string;
    reviewSaved: string;
    reviewDisclaimer: string;
    reviewAbstained: string;
    limitationsTitle: string;
    footerDisclaimer: string;
    mapLoading: string;
    abstentionTitle: string;
    abstentionDesc: string;
    topShortlist: string;
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
    },
    macroNew: {
      detailedExports: "Detailed Agricultural Exports (Values in Million USD)",
      historicalTradeTrend: "Historical Total Agricultural Trade Trend",
      totalExports: "Total Exports",
      totalImports: "Total Imports",
      exportValue: "Export Value",
      cropCalendarTitle: "Myanmar Crop Calendar & Harvesting Timeline",
      crop: "Crop",
      suitableRegions: "Suitable Regions",
      sow: "Sow",
      harv: "Harv",
      climateTrendsTitle: "Climate Change: Temperature Trends",
      avgTemp: "Average Temperature (°C)",
      historicalDisastersTitle: "Historical Disasters Impact on Agriculture",
      affectedArea: "Affected Area (Hectares)",
      totalImpact: "Total Impact (USD)",
      financialImpact: "Financial Impact",
      futureRisksTitle: "Future Climate Risks for Agriculture",
      disasterNote: "Data reflects major cyclone and flood impacts on agricultural areas."
    }
  },
  dashboard: {
    heroTitlePre: "For each plot of land, ",
    heroTitleEm: "what should you grow?",
    heroNoteTitle: "Real environmental data · rule baseline",
    heroNoteDesc: "The features in this release are QA-verified real source data. Crop scores are based strictly on agronomic rule-based screening and are NOT trained AI predictions or field-observed labels. If evidence is insufficient, the system abstains from making a recommendation.",
    metricCells: "Real 5 km pilot cells",
    metricScored: "Rule-screened cells",
    metricAbstained: "Insufficient-evidence abstentions",
    metricLabels: "Observed crop labels loaded",
    mapToolbar: "km real grid · Click on a cell",
    missingUnknown: "Missing/Unknown",
    reviewTitle: "Agronomist / user review",
    reviewQuestion: "recommendation match the local conditions?",
    reviewPlaceholder: "Notes on field conditions, water, planting season...",
    saveReview: "Save Pilot review",
    reviewSaved: "Saved to device",
    reviewDisclaimer: "Device-local feedback only — not auto-merged as training label.",
    reviewAbstained: "Crop review is disabled because the system abstained on this cell. Check back when missing evidence is provided.",
    limitationsTitle: "What this pilot is not",
    footerDisclaimer: "Decision-support only · Farmer choice and local agronomist review remain final.",
    mapLoading: "Preparing map...",
    abstentionTitle: "Cannot provide recommendation yet",
    abstentionDesc: "This cell has insufficient source features for rule scoring. Missing values have not been artificially imputed.",
    topShortlist: "Top rule-based shortlist"
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
    },
    macroNew: {
      detailedExports: "အသေးစိတ် စိုက်ပျိုးရေးပို့ကုန် (အမေရိကန်ဒေါ်လာ သန်းချီဖြင့်)",
      historicalTradeTrend: "စိုက်ပျိုးရေး သွင်းကုန်/ပို့ကုန် သမိုင်းကြောင်း (စုစုပေါင်း)",
      totalExports: "ပို့ကုန် စုစုပေါင်း",
      totalImports: "သွင်းကုန် စုစုပေါင်း",
      exportValue: "ပို့ကုန် တန်ဖိုး",
      cropCalendarTitle: "မြန်မာနိုင်ငံ သီးနှံစိုက်ပျိုးချိန်နှင့် ရိတ်သိမ်းချိန် ပြက္ခဒိန်",
      crop: "သီးနှံ",
      suitableRegions: "သင့်တော်သော ဒေသများ",
      sow: "စိုက်",
      harv: "ရိတ်",
      climateTrendsTitle: "ရာသီဥတု ပြောင်းလဲမှု: အပူချိန် အတက်အကျ",
      avgTemp: "ပျမ်းမျှ အပူချိန် (°C)",
      historicalDisastersTitle: "စိုက်ပျိုးရေးကဏ္ဍအပေါ် သဘာဝဘေးအန္တရာယ် သက်ရောက်မှု (သမိုင်းကြောင်း)",
      affectedArea: "ထိခိုက်မှုဧရိယာ (ဟက်တာ)",
      totalImpact: "ဆုံးရှုံးမှုတန်ဖိုး (USD)",
      financialImpact: "ဆုံးရှုံးမှုတန်ဖိုး",
      futureRisksTitle: "စိုက်ပျိုးရေးအတွက် အနာဂတ် ရာသီဥတု အန္တရာယ်များ",
      disasterNote: "အချက်အလက်များသည် စိုက်ပျိုးရေး ဧရိယာများအပေါ် ဆိုက်ကလုန်းနှင့် ရေကြီးမှု အဓိက သက်ရောက်မှုများကို ဖော်ပြထားခြင်းဖြစ်သည်။"
    }
  },
  dashboard: {
    heroTitlePre: "မြေတစ်ကွက်ချင်းစီအတွက် ",
    heroTitleEm: "ဘာစိုက်သင့်သလဲ?",
    heroNoteTitle: "Real environmental data · rule baseline",
    heroNoteDesc: "ဒီ release ထဲက feature များသည် QA စစ်ပြီးသော real source data ဖြစ်သည်။ Crop score များမှာ agronomic rule-based screening သာဖြစ်ပြီး trained AI prediction သို့မဟုတ် field-observed label မဟုတ်ပါ။ Evidence မလုံလောက်ပါက system က recommendation မပေးဘဲ abstain လုပ်သည်။",
    metricCells: "Real 5 km pilot cells",
    metricScored: "Rule-screened cells",
    metricAbstained: "Insufficient-evidence abstentions",
    metricLabels: "Observed crop labels loaded",
    mapToolbar: "km real grid · cell တစ်ကွက်ကို နှိပ်ပါ",
    missingUnknown: "Missing/Unknown",
    reviewTitle: "Agronomist / user review",
    reviewQuestion: "recommendation ကို ဒေသအခြေအနေနဲ့ ကိုက်ညီတယ်လို့ မြင်ပါသလား?",
    reviewPlaceholder: "မြေပြင်အခြေအနေ၊ ရေ၊ စိုက်ပျိုးရာသီ မှတ်ချက်…",
    saveReview: "Pilot review သိမ်းမည်",
    reviewSaved: "Device တွင်သိမ်းပြီးပါပြီ",
    reviewDisclaimer: "Device-local feedback only — training label အဖြစ် auto-merge မလုပ်ပါ။",
    reviewAbstained: "System abstain လုပ်ထားသော cell ဖြစ်သဖြင့် crop review ကို မဖွင့်ထားပါ။ Missing evidence ဖြည့်ပြီးမှ ပြန်စစ်ပါ။",
    limitationsTitle: "ဒီ pilot က ဘာမဟုတ်သလဲ",
    footerDisclaimer: "Decision-support only · Farmer choice and local agronomist review remain final.",
    mapLoading: "မြေပုံ ပြင်ဆင်နေသည်…",
    abstentionTitle: "Recommendation မပေးနိုင်သေးပါ",
    abstentionDesc: "ဒီ cell မှာ rule scoring အတွက် လိုအပ်သော source features မလုံလောက်ပါ။ Missing values ကို အတုမဖြည့်ထားပါ။",
    topShortlist: "Top rule-based shortlist"
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

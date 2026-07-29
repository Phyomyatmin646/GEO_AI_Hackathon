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
  };
  dashboard: {
    languageSwitchToEnglish: string;
    languageSwitchToMyanmar: string;
    pilotApiStatus: string;
    qaPassed: string;
    qaFailed: string;
    geoAiPilot: string;
    realPilot: string;
    regionAyeyawaddy: string;
    regionSagaing: string;
    regionMandalay: string;
    regionBago: string;
    regionMagway: string;
    macroLink: string;
    climateLink: string;
    faqLink: string;
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
    summaryAria: string;
    workspaceAria: string;
    mapLegendAria: string;
    missingPercent: string;
    uncertainty: string;
    pilotCell: string;
    ruleConfidence: string;
    notModelAccuracy: string;
    whyThisCrop: string;
    evidenceStatus: string;
    labelSource: string;
    observedLabels: string;
    trainingEligibility: string;
    qaUsableFeatureRow: string;
    excludedByQa: string;
    downloadCsv: string;
    climateBaseline: string;
    releaseEvidence: string;
    dataQa: string;
    regionalRows: string;
    qaGate: string;
    warningsErrors: string;
    qaUsableRows: string;
    pass: string;
    fail: string;
    sourceCsvHash: string;
    qaReportHash: string;
    sourceManifestHash: string;
    traceableInputs: string;
    sourceProvenance: string;
    period: string;
    release: string;
    agree: string;
    uncertain: string;
    disagree: string;
    responsibleUseBoundary: string;
    syntheticRowsExcluded: string;
    contract: string;
    tooltipInsufficient: string;
    tooltipTopCrop: string;
    tooltipMissing: string;
    mapAria: string;
    regionFilterAria: string;
    uncertaintyLow: string;
    uncertaintyMedium: string;
    uncertaintyHigh: string;
    statusScored: string;
    statusInsufficient: string;
    labelSourceRuleBased: string;
    splitPolicy: string;
    sourceRoles: Record<string, string>;
    limitations: string[];
  };
  faq: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    noResults: string;
    categoryAll: string;
    categoryGeneral: string;
    loading: string;
    backToDashboard: string;
    source: string;
    reviewed: string;
    englishPendingTitle: string;
    englishPendingDescription: string;
    loadError: string;
    recordTimestamp: string;
  };
};

export const en: Dictionary = {
  loading: {
    title: "Loading real pilot data...",
    description: "Reading QA-approved regional 5 km cells from the API..."
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
      pendingClimateData: "Not in this regional release — climate-context re-export required"
    }
  },
  dashboard: {
    languageSwitchToEnglish: "Switch to English",
    languageSwitchToMyanmar: "Switch to Myanmar",
    pilotApiStatus: "Real pilot API · QA",
    qaPassed: "passed",
    qaFailed: "failed",
    geoAiPilot: "Explainable GeoAI",
    realPilot: "real pilot",
    regionAyeyawaddy: "Ayeyawaddy",
    regionSagaing: "Sagaing",
    regionMandalay: "Mandalay",
    regionBago: "Bago",
    regionMagway: "Magway",
    macroLink: "National macro-economics",
    climateLink: "Climate & disasters",
    faqLink: "Agriculture FAQ",
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
    topShortlist: "Top rule-based shortlist",
    summaryAria: "Real pilot summary",
    workspaceAria: "Interactive crop screening workspace",
    mapLegendAria: "Map legend",
    missingPercent: "missing",
    uncertainty: "uncertainty",
    pilotCell: "pilot cell",
    ruleConfidence: "Rule confidence",
    notModelAccuracy: "not model accuracy",
    whyThisCrop: "Why this crop?",
    evidenceStatus: "Evidence status",
    labelSource: "Label source",
    observedLabels: "Observed labels",
    trainingEligibility: "Training eligibility",
    qaUsableFeatureRow: "QA-usable feature row",
    excludedByQa: "excluded by QA",
    downloadCsv: "CSV ↓",
    climateBaseline: "ERA5 / CHIRPS baseline",
    releaseEvidence: "Release evidence",
    dataQa: "Data QA",
    regionalRows: "Regional CSV rows",
    qaGate: "QA gate",
    warningsErrors: "Warnings / errors",
    qaUsableRows: "QA-usable rows",
    pass: "PASS",
    fail: "FAIL",
    sourceCsvHash: "Source CSV SHA-256",
    qaReportHash: "QA report SHA-256",
    sourceManifestHash: "Source manifest SHA-256",
    traceableInputs: "Traceable inputs",
    sourceProvenance: "Source provenance",
    period: "Period",
    release: "Release",
    agree: "Agree",
    uncertain: "Uncertain",
    disagree: "Disagree",
    responsibleUseBoundary: "Responsible-use boundary",
    syntheticRowsExcluded: "Synthetic rows excluded",
    contract: "Contract",
    tooltipInsufficient: "Insufficient evidence — no recommendation",
    tooltipTopCrop: "Top crop",
    tooltipMissing: "Missing",
    mapAria: "Real 5 kilometre equal-area pilot grid map",
    regionFilterAria: "Select pilot region",
    uncertaintyLow: "low uncertainty",
    uncertaintyMedium: "medium uncertainty",
    uncertaintyHigh: "high uncertainty",
    statusScored: "rule-screened",
    statusInsufficient: "insufficient evidence",
    labelSourceRuleBased: "agronomic rule baseline",
    splitPolicy: "Deterministic 0.5-degree spatial folds for 2018–2024; locked 2025 temporal holdout",
    sourceRoles: {
      chirps: "monthly and trailing-12-month rainfall",
      chirps_gee_staging: "Earth Engine rainfall-export staging only",
      era5_land: "temperature, solar radiation and near-surface soil water",
      fao_gaul: "Myanmar boundary and administrative context",
      jrc_surface_water: "surface-water occurrence and static water-access proxy",
      sentinel1: "radar evidence during optical cloud gaps",
      sentinel2: "surface reflectance and vegetation/moisture indices",
      soilgrids: "0–30 cm soil properties",
      srtm: "elevation, slope and aspect",
      derived_water_availability: "transparent derived water-availability screening proxy",
    },
    limitations: [
      "This release contains every QA-approved cell in the selected region.",
      "Recommendations are provisional agronomic rules, not trained-model predictions or observed crop outcomes.",
      "Observed crop labels are not loaded yet; field and agronomist validation are still required.",
      "January 2018 has no trailing 12-month rainfall value, so scoring uses only sufficiently covered factors.",
      "A 5 km cell is a screening unit, not a farm boundary or yield promise.",
    ],
  },
  faq: {
    title: "Frequently Asked Questions",
    subtitle: "Search imported Myanmar seed Q&A; English translation and expert review are still pending",
    searchPlaceholder: "Search questions...",
    noResults: "No answers found.",
    categoryAll: "All Categories",
    categoryGeneral: "General",
    loading: "Loading...",
    backToDashboard: "Back to Dashboard",
    source: "Source",
    reviewed: "Reviewed",
    englishPendingTitle: "English translation pending — Myanmar source shown / အင်္ဂလိပ်ဘာသာပြန် မပြီးသေးပါ — မြန်မာမူရင်းကို ပြသထားသည်",
    englishPendingDescription: "This FAQ has not yet been translated into English; the original Myanmar question and answer are shown below.",
    loadError: "FAQ data could not be loaded. Please try again.",
    recordTimestamp: "Dataset timestamp (not agronomist review)"
  }
};

export const my: Dictionary = {
  loading: {
    title: "Real pilot data တင်နေသည်...",
    description: "QA စစ်ပြီးသော ဒေသအလိုက် ၅ ကီလိုမီတာ cell များကို API မှ ဖတ်နေပါသည်…"
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
    missing: "မရှိပါ",
    notPublished: "မထုတ်ပြန်ရသေးပါ",
    abstainedStatus: "အထောက်အထား မလုံလောက်ပါ",
    abstainedDesc: "အချက်အလက်မပြည့်စုံသဖြင့် အကြံပြုချက်မပေးနိုင်ပါ။",
    scoredStatus: "တွက်ချက်ထားသည်",
    features: {
      title: "ပတ်ဝန်းကျင် အချက်အလက်များ",
      weatherEvidencetitle: "လက်ရှိ ရာသီဥတု အခြေအနေ (CHIRPS/ERA5)",
      climateTrendTitle: "ရာသီဥတု ပြောင်းလဲမှုပုံစံ (နှစ် ၃၀ ပျမ်းမျှ)",
      terrainAndSoilTitle: "မြေမျက်နှာသွင်ပြင် နှင့် မြေဆီလွှာ",
      pendingClimateData: "ဤဒေသအလိုက် release တွင် မပါသေးပါ — climate-context re-export လိုအပ်သည်"
    }
  },
  dashboard: {
    languageSwitchToEnglish: "English သို့ ပြောင်းမည်",
    languageSwitchToMyanmar: "မြန်မာဘာသာသို့ ပြောင်းမည်",
    pilotApiStatus: "Real pilot API · QA",
    qaPassed: "အောင်မြင်",
    qaFailed: "မအောင်မြင်",
    geoAiPilot: "ရှင်းလင်းဖော်ပြနိုင်သော GeoAI",
    realPilot: "အမှန်တကယ် pilot",
    regionAyeyawaddy: "ဧရာဝတီ",
    regionSagaing: "စစ်ကိုင်း",
    regionMandalay: "မန္တလေး",
    regionBago: "ပဲခူး",
    regionMagway: "မကွေး",
    macroLink: "နိုင်ငံတော် စီးပွားရေးအချက်အလက်",
    climateLink: "ရာသီဥတုနှင့် သဘာဝဘေး",
    faqLink: "စိုက်ပျိုးရေး အမေးအဖြေ",
    heroTitlePre: "မြေတစ်ကွက်ချင်းစီအတွက် ",
    heroTitleEm: "ဘာစိုက်သင့်သလဲ?",
    heroNoteTitle: "ပတ်ဝန်းကျင်ဒေတာအစစ် · စည်းမျဉ်းအခြေခံ မူလစံ",
    heroNoteDesc: "ဤ release ထဲက feature များသည် QA စစ်ပြီးသော အရင်းအမြစ်ဒေတာအစစ်များ ဖြစ်သည်။ သီးနှံအမှတ်များသည် စိုက်ပျိုးရေးစည်းမျဉ်းအခြေခံ စိစစ်ချက်သာဖြစ်ပြီး လေ့ကျင့်ထားသော AI ခန့်မှန်းချက် သို့မဟုတ် မြေပြင်တွင် တွေ့ရှိထားသော label မဟုတ်ပါ။ အထောက်အထား မလုံလောက်ပါက အကြံပြုချက် မပေးပါ။",
    metricCells: "၅ ကီလိုမီတာ pilot cell အစစ်များ",
    metricScored: "စည်းမျဉ်းဖြင့် စိစစ်ထားသော cell များ",
    metricAbstained: "အထောက်အထား မလုံလောက်သည့် cell များ",
    metricLabels: "ထည့်သွင်းထားသော မြေပြင်သီးနှံ label များ",
    mapToolbar: "ကီလိုမီတာ grid အစစ် · cell တစ်ကွက်ကို နှိပ်ပါ",
    missingUnknown: "မရှိ / မသိ",
    reviewTitle: "စိုက်ပျိုးရေးပညာရှင် / အသုံးပြုသူ သုံးသပ်ချက်",
    reviewQuestion: "အကြံပြုချက်သည် ဒေသအခြေအနေနှင့် ကိုက်ညီပါသလား?",
    reviewPlaceholder: "မြေပြင်အခြေအနေ၊ ရေ၊ စိုက်ပျိုးရာသီ မှတ်ချက်…",
    saveReview: "Pilot review သိမ်းမည်",
    reviewSaved: "Device တွင်သိမ်းပြီးပါပြီ",
    reviewDisclaimer: "ဤသုံးသပ်ချက်ကို စက်ထဲတွင်သာ သိမ်းထားပြီး လေ့ကျင့်ရေး label အဖြစ် အလိုအလျောက် မထည့်ပါ။",
    reviewAbstained: "ဤ cell အတွက် အထောက်အထား မလုံလောက်သဖြင့် သီးနှံသုံးသပ်ချက်ကို ပိတ်ထားပါသည်။ လိုအပ်သော အထောက်အထား ဖြည့်ပြီးမှ ပြန်စစ်ပါ။",
    limitationsTitle: "ဒီ pilot က ဘာမဟုတ်သလဲ",
    footerDisclaimer: "ဆုံးဖြတ်ချက်အထောက်အကူပြုစနစ်သာ ဖြစ်သည် · တောင်သူ၏ရွေးချယ်မှုနှင့် ဒေသခံ စိုက်ပျိုးရေးပညာရှင်၏ သုံးသပ်ချက်သည် အဆုံးအဖြတ်ဖြစ်သည်။",
    mapLoading: "မြေပုံ ပြင်ဆင်နေသည်…",
    abstentionTitle: "Recommendation မပေးနိုင်သေးပါ",
    abstentionDesc: "ဒီ cell မှာ rule scoring အတွက် လိုအပ်သော source features မလုံလောက်ပါ။ Missing values ကို အတုမဖြည့်ထားပါ။",
    topShortlist: "စည်းမျဉ်းအခြေပြု ထိပ်တန်းစာရင်း",
    summaryAria: "အမှန်တကယ် pilot အနှစ်ချုပ်",
    workspaceAria: "သီးနှံစိစစ်ရန် အပြန်အလှန် အသုံးပြုနိုင်သောနေရာ",
    mapLegendAria: "မြေပုံအညွှန်း",
    missingPercent: "မရှိသော အချက်အလက်",
    uncertainty: "မသေချာမှု",
    pilotCell: "pilot cell",
    ruleConfidence: "စည်းမျဉ်းအပေါ် ယုံကြည်မှု",
    notModelAccuracy: "model တိကျမှု မဟုတ်ပါ",
    whyThisCrop: "ဤသီးနှံကို ဘာကြောင့်ရွေးသနည်း?",
    evidenceStatus: "အထောက်အထား အခြေအနေ",
    labelSource: "Label အရင်းအမြစ်",
    observedLabels: "တွေ့ရှိထားသော label များ",
    trainingEligibility: "Training အသုံးပြုနိုင်မှု",
    qaUsableFeatureRow: "QA အသုံးပြုနိုင်သော feature row",
    excludedByQa: "QA ဖြင့် ဖယ်ရှားထားသည်",
    downloadCsv: "CSV ↓",
    climateBaseline: "ERA5 / CHIRPS အခြေခံစံ",
    releaseEvidence: "Release အထောက်အထား",
    dataQa: "ဒေတာ QA",
    regionalRows: "ဒေသအလိုက် CSV row များ",
    qaGate: "QA စစ်ဆေးချက်",
    warningsErrors: "သတိပေးချက် / အမှားများ",
    qaUsableRows: "QA အသုံးပြုနိုင်သော row များ",
    pass: "အောင်မြင်",
    fail: "မအောင်မြင်",
    sourceCsvHash: "Source CSV SHA-256",
    qaReportHash: "QA report SHA-256",
    sourceManifestHash: "Source manifest SHA-256",
    traceableInputs: "ခြေရာခံနိုင်သော input များ",
    sourceProvenance: "အရင်းအမြစ် မှတ်တမ်း",
    period: "ကာလ",
    release: "Release",
    agree: "ကိုက်ညီသည်",
    uncertain: "မသေချာပါ",
    disagree: "မကိုက်ညီပါ",
    responsibleUseBoundary: "တာဝန်ရှိစွာ အသုံးပြုရန် ကန့်သတ်ချက်",
    syntheticRowsExcluded: "Synthetic row များ ဖယ်ရှားထားသည်",
    contract: "Contract",
    tooltipInsufficient: "အထောက်အထား မလုံလောက်ပါ — အကြံပြုချက်မရှိပါ",
    tooltipTopCrop: "ထိပ်တန်းသီးနှံ",
    tooltipMissing: "မရှိသော အချက်အလက်",
    mapAria: "အမှန်တကယ် ၅ ကီလိုမီတာ ဧရိယာညီမျှ pilot grid မြေပုံ",
    regionFilterAria: "Pilot ဒေသ ရွေးချယ်ရန်",
    uncertaintyLow: "မသေချာမှု နည်း",
    uncertaintyMedium: "မသေချာမှု အလယ်အလတ်",
    uncertaintyHigh: "မသေချာမှု များ",
    statusScored: "စည်းမျဉ်းဖြင့် စိစစ်ထားသည်",
    statusInsufficient: "အထောက်အထား မလုံလောက်ပါ",
    labelSourceRuleBased: "စိုက်ပျိုးရေးစည်းမျဉ်း အခြေခံမူ",
    splitPolicy: "၂၀၁၈–၂၀၂၄ အတွက် ၀.၅ ဒီဂရီ အခြေပြု သတ်မှတ်ထားသော spatial fold များ၊ ၂၀၂၅ ကို သီးခြား temporal holdout အဖြစ် ပိတ်ထားသည်",
    sourceRoles: {
      chirps: "လစဉ်မိုးရေချိန်နှင့် နောက်ဆုံး ၁၂ လ မိုးရေချိန်",
      chirps_gee_staging: "Earth Engine မိုးရေဒေတာ ထုတ်ယူရန်သာ",
      era5_land: "အပူချိန်၊ နေရောင်ခြည်စွမ်းအင်နှင့် မြေမျက်နှာပြင်အနီး ရေဓာတ်",
      fao_gaul: "မြန်မာနိုင်ငံနယ်နိမိတ်နှင့် အုပ်ချုပ်ရေးနယ်မြေ အချက်အလက်",
      jrc_surface_water: "ရေမျက်နှာပြင်တည်ရှိမှုနှင့် ရေရရှိနိုင်မှု အစားထိုးညွှန်းကိန်း",
      sentinel1: "တိမ်ဖုံးနေချိန်အတွက် ရေဒါအထောက်အထား",
      sentinel2: "မြေမျက်နှာပြင် ရောင်ပြန်ဟပ်မှုနှင့် အပင်/အစိုဓာတ်ညွှန်းကိန်း",
      soilgrids: "မြေမျက်နှာပြင်အောက် ၀–၃၀ စင်တီမီတာ မြေဆီလွှာဂုဏ်သတ္တိ",
      srtm: "အမြင့်၊ မြေစောင်းနှင့် မျက်နှာမူရာအရပ်",
      derived_water_availability: "ပွင့်လင်းမြင်သာစွာ ဆင်းသက်တွက်ချက်ထားသော ရေရရှိနိုင်မှု စိစစ်ညွှန်းကိန်း",
    },
    limitations: [
      "ဤ release တွင် ရွေးချယ်ထားသော ဒေသ၏ QA အောင်မြင်သည့် cell အားလုံး ပါဝင်သည်။",
      "အကြံပြုချက်များသည် ယာယီ စိုက်ပျိုးရေးစည်းမျဉ်းများသာဖြစ်ပြီး လေ့ကျင့်ထားသော model ခန့်မှန်းချက် သို့မဟုတ် မြေပြင်သီးနှံရလဒ် မဟုတ်ပါ။",
      "မြေပြင်တွင် တွေ့ရှိထားသော သီးနှံ label များ မထည့်ရသေးသဖြင့် လယ်ကွင်းနှင့် စိုက်ပျိုးရေးပညာရှင် စစ်ဆေးမှု လိုအပ်နေဆဲဖြစ်သည်။",
      "၂၀၁၈ ဇန်နဝါရီအတွက် နောက်ဆုံး ၁၂ လ မိုးရေချိန်တန်ဖိုး မရှိသဖြင့် လုံလောက်သော အချက်များကိုသာ အသုံးပြု၍ အမှတ်တွက်ထားသည်။",
      "၅ ကီလိုမီတာ cell သည် စိစစ်ရေးယူနစ်သာဖြစ်ပြီး လယ်နယ်နိမိတ် သို့မဟုတ် အထွက်နှုန်းအာမခံချက် မဟုတ်ပါ။",
    ],
  },
  faq: {
    title: "အမေးများသော မေးခွန်းများ",
    subtitle: "ထည့်သွင်းထားသော မြန်မာ စိုက်ပျိုးရေးအမေးအဖြေများကို ရှာနိုင်ပါသည် — ကျွမ်းကျင်သူစစ်ဆေးမှုနှင့် အင်္ဂလိပ်ဘာသာပြန်ဆိုမှု မပြီးသေးပါ",
    searchPlaceholder: "မေးခွန်းများကို ရှာဖွေပါ...",
    noResults: "ရှာဖွေမှု ရလဒ် မတွေ့ရှိပါ။",
    categoryAll: "ကဏ္ဍအားလုံး",
    categoryGeneral: "အထွေထွေ",
    loading: "တင်နေသည်…",
    backToDashboard: "Dashboard သို့ ပြန်သွားရန်",
    source: "အရင်းအမြစ်",
    reviewed: "ပြန်လည်စစ်ဆေးသည့်ရက်",
    englishPendingTitle: "အင်္ဂလိပ်ဘာသာပြန် မပြီးသေးပါ — မြန်မာမူရင်းကို ပြသထားသည် / English translation pending — Myanmar source shown",
    englishPendingDescription: "ဤ FAQ ကို အင်္ဂလိပ်ဘာသာသို့ မပြန်ဆိုရသေးပါ။ မူရင်း မြန်မာမေးခွန်းနှင့် အဖြေကို အောက်တွင် ဖော်ပြထားပါသည်။",
    loadError: "FAQ ဒေတာကို မတင်နိုင်ပါ။ ပြန်စမ်းပါ။",
    recordTimestamp: "ဒေတာမှတ်တမ်းအချိန် (စိုက်ပျိုးရေးပညာရှင် သုံးသပ်သည့်ရက် မဟုတ်ပါ)"
  }
};

export const dictionaries = { en, my };
export type Language = keyof typeof dictionaries;

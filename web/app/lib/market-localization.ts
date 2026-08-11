import type { Language } from "./dictionaries";

type MarketDictionarySection =
  | "commodities"
  | "locations"
  | "marketplaces"
  | "currencies"
  | "units";

const MARKET_MYANMAR_DICTIONARY: Record<MarketDictionarySection, Record<string, string>> = {
  commodities: {
    Avocado: "ထောပတ်သီး",
    "Banana (PheGyan)": "ဖီးကြမ်းငှက်ပျော",
    "Bell Pepper": "ငရုတ်ပွ",
    "Black Gram(New)": "မတ်ပဲ (အသစ်)",
    "Black Sesame": "နှမ်းနက်",
    "Black Sesame (New)": "နှမ်းနက် (အသစ်)",
    "Black Sesame (Samone)": "စမုံနက်နှမ်း",
    "Black Sesame (Samone) (New)": "စမုံနက်နှမ်း (အသစ်)",
    "Black Sesame (Winter)": "ဆောင်းနှမ်းနက်",
    Blackgram: "မတ်ပဲ",
    "Blackgram (New)": "မတ်ပဲ (အသစ်)",
    "Blackgram (SQ, RC) (2023)": "မတ်ပဲ (SQ၊ RC) (၂၀၂၃)",
    "Blue Cow Pea": "စွန်တာပြာ",
    "Blue Cow Pea (New)": "စွန်တာပြာ (အသစ်)",
    "Blue Sesame (Thant) (New)": "နှမ်းပြာ (သန့်) (အသစ်)",
    Bocate: "ဘိုကိတ်ပဲ",
    "Brown Sesame (New)": "နှမ်းညို (အသစ်)",
    "Brown Sesame (Old)": "နှမ်းညို (အဟောင်း)",
    "Butter Bean": "ထောပတ်ပဲ",
    "Butter Bean (Gyi)": "ထောပတ်ပဲ (အကြီး)",
    "Butter Bean (Lat)": "ထောပတ်ပဲ (အလတ်)",
    "Butter Bean (Small)": "ထောပတ်ပဲ (အသေး)",
    "CP Corn": "စီပီပြောင်း",
    "CP Corn (Hsipaw)": "စီပီပြောင်း (သီပေါ)",
    "CP Corn (Kyautme)": "စီပီပြောင်း (ကျောက်မဲ)",
    "CP Corn (Muse)": "စီပီပြောင်း (မူဆယ်)",
    "CP Corn (Naunghkio)": "စီပီပြောင်း (နောင်ချို)",
    Capsicum: "ငရုတ်ပွ",
    Carrot: "မုန်လာဥနီ",
    Chayote: "ဂေါ်ရခါးသီး",
    "Chick Pea (929)": "ကုလားပဲ (၉၂၉)",
    "Chick Pea (929) (New)": "ကုလားပဲ (၉၂၉) (အသစ်)",
    "Chick Pea (929) (New, Old)": "ကုလားပဲ (၉၂၉) (အသစ်၊ အဟောင်း)",
    "Chick Pea (Holland)": "ကုလားပဲ (ဟော်လန်)",
    "Chick Pea (Holland) (New)": "ကုလားပဲ (ဟော်လန်) (အသစ်)",
    "Chick Pea (Phyu Lone Gyi)": "ကုလားပဲ (ဖြူလုံးကြီး)",
    "Chick Pea (Phyu Lone)": "ကုလားပဲ (ဖြူလုံး)",
    "Chick Pea (Small)": "ကုလားပဲ (လုံးသေး)",
    "Chick Pea (Taiwan) (New)": "ကုလားပဲ (ထိုင်ဝမ်) (အသစ်)",
    "Chick Pea (V2)) (New)": "ကုလားပဲ (V2) (အသစ်)",
    "Chick pea (v2)": "ကုလားပဲ (V2)",
    "Chili (Moe Htaung) (Myint Wa)": "ငရုတ်သီး (မိုးထောင်) (မြင့်ဝါ)",
    "Chili (Pwa) (MyintWaKyunPaw)": "ငရုတ်သီးပွ (မြင့်ဝါကျွန်းပေါ်)",
    "Chili (Pwa) (Sin Phyu Kyun)": "ငရုတ်သီးပွ (ဆင်ဖြူကျွန်း)",
    "Chili (Shay) (India)": "ငရုတ်သီးရှည် (အိန္ဒိယ)",
    "Chili (Shay) (Pantanaw)": "ငရုတ်သီးရှည် (ပန်းတနော်)",
    Corn: "ပြောင်းဖူး",
    Custard: "ဩဇာသီး",
    Eggplant: "ခရမ်းသီး",
    "Garden Pea": "စားတော်ပဲ",
    "Garlic (Htoo 4.5)": "ကြက်သွန်ဖြူ (ထူး ၄.၅)",
    "Garlic (Kyu gote)": "ကြက်သွန်ဖြူ (ကြူကုတ်)",
    "Green pea": "ပဲစိမ်း",
    "Groundnut Pea (Red)": "မြေပဲနီ",
    "Half Chickpea": "ကုလားပဲခြမ်း",
    "Lablab Bean": "ပဲကြီး",
    "Lablab Bean (Ka)": "ပဲကြီး (က)",
    "Lablab Bean (Kone)": "ပဲကြီး (ကုန်း)",
    "Lablab Bean (La)": "ပဲကြီး (လ)",
    "Lablab Bean (Lat Chaw)": "ပဲကြီး (လတ်ချော)",
    "Lablab Bean (Shwe Kyun)": "ပဲကြီး (ရွှေကျွန်း)",
    "Lablab Bean (Ta)": "ပဲကြီး (တ)",
    Lentil: "ပဲနီလေး",
    "Mung Bean": "ပဲတီစိမ်း",
    "Mung Bean (Khayan Shwe Wah)": "ပဲတီစိမ်း (ခရမ်းရွှေဝါ)",
    "Mung Bean (Wakema)": "ပဲတီစိမ်း (ဝါးခယ်မ)",
    "Mung Bean(Bego Shwe Wah)": "ပဲတီစိမ်း (ပဲခူးရွှေဝါ)",
    "Niger Flower (New)": "ပန်းနှမ်း (အသစ်)",
    Onion: "ကြက်သွန်နီ",
    "Onion (Aung Pan Htoo 2)": "ကြက်သွန်နီ (အောင်ပန်း ထူး ၂)",
    "Onion (Aung Pan Htoo 3)": "ကြက်သွန်နီ (အောင်ပန်း ထူး ၃)",
    "Onion (Aung Pan Htoo 4)": "ကြက်သွန်နီ (အောင်ပန်း ထူး ၄)",
    "Onion (Aung Pan Htoo 5)": "ကြက်သွန်နီ (အောင်ပန်း ထူး ၅)",
    "Onion (Monywa Lat Chaw)": "ကြက်သွန်နီ (မုံရွာ လတ်ချော)",
    "Onion (Monywa Lat Gyi)": "ကြက်သွန်နီ (မုံရွာ လတ်ကြီး)",
    "Onion (Monywa Lat Thant)": "ကြက်သွန်နီ (မုံရွာ လတ်သန့်)",
    "Onion (Monywa Shal) (New)": "ကြက်သွန်နီ (မုံရွာ ရှယ်) (အသစ်)",
    "Onion (New) (John Gyi)": "ကြက်သွန်နီ (အသစ်) (ဂျွန်ကြီး)",
    "Onion (New) (John Lat)": "ကြက်သွန်နီ (အသစ်) (ဂျွန်လတ်)",
    "Onion (Sake Phyu Lat Chaw)": "ကြက်သွန်နီ (ဆိပ်ဖြူ လတ်ချော)",
    "Onion (Sake Phyu Lat Gyi)": "ကြက်သွန်နီ (ဆိပ်ဖြူ လတ်ကြီး)",
    "Onion (Sake Phyu Lat Thant)": "ကြက်သွန်နီ (ဆိပ်ဖြူ လတ်သန့်)",
    "Onion (Sake Phyu Shal)": "ကြက်သွန်နီ (ဆိပ်ဖြူ ရှယ်)",
    "Paddy (Emata) (Rainy 2022)": "ဧည့်မထစပါး (မိုး ၂၀၂၂)",
    "Paddy (Emata) (Rainy 2022)(Ma Naw Thu Kha)": "ဧည့်မထစပါး (မနောသုခ၊ မိုး ၂၀၂၂)",
    "Paddy (Paw San) (Rainy 2022)": "ပေါ်ဆန်းစပါး (မိုး ၂၀၂၂)",
    "Pigeon Pea (New)": "ပဲစင်းငုံ (အသစ်)",
    "Pigeon Pea (RC) (2021)": "ပဲစင်းငုံ (RC) (၂၀၂၁)",
    Pomelo: "ကျွဲကောသီး",
    "Potato (OK) (Aung Pan)": "အာလူး (OK) (အောင်ပန်း)",
    "Potato (OK) (Heho)": "အာလူး (OK) (ဟဲဟိုး)",
    "Potato (S1,2) (Aung Pan)": "အာလူး (S1၊ S2) (အောင်ပန်း)",
    "Potato (S3) (Aung Pan)": "အာလူး (S3) (အောင်ပန်း)",
    Pumpkin: "ရွှေဖရုံသီး",
    Radish: "မုန်လာဥ",
    "Rakhaine Banana": "ရခိုင်ငှက်ပျော",
    "Red Pigeon Pea (New)": "ပဲစင်းငုံနီ (အသစ်)",
    "Red Sesame": "နှမ်းနီ",
    "Rice (90 Day Thit Shal)": "ရက် ၉၀ သစ်ရှယ်ဆန်",
    "Rice (Emata 25%)": "ဧည့်မထဆန် (၂၅%)",
    "Rice (Emata) (Rainy 2022)": "ဧည့်မထဆန် (မိုး ၂၀၂၂)",
    "Rice (Emata) (Rainy 2022)(Ma Naw Thu Kha)": "ဧည့်မထဆန် (မနောသုခ၊ မိုး ၂၀၂၂)",
    "Rice (Inn Lal)": "အင်းလယ်ဆန်",
    "Rice (Inn Lal) (New) (Dry)": "အင်းလယ်ဆန် (အသစ်၊ နွေ)",
    "Rice (MyaungMya Pathein Paw San) (New)": "မြောင်းမြ/ပုသိမ် ပေါ်ဆန်းဆန် (အသစ်)",
    "Rice (Nga Sein) (New)": "ငစိန်ဆန် (အသစ်)",
    "Rice (Ngwe Toe) (Old)": "ငွေတိုးဆန် (အဟောင်း)",
    "Rice (Paw San Nae Sone) (New)": "ပေါ်ဆန်းနယ်စုံဆန် (အသစ်)",
    "Rice (Paw San) (Rainy 2022)": "ပေါ်ဆန်းဆန် (မိုး ၂၀၂၂)",
    "Rice (Pyapon Paw San) (New)": "ဖျာပုံပေါ်ဆန်းဆန် (အသစ်)",
    "Rice (Shwebo Paw San)": "ရွှေဘိုပေါ်ဆန်းဆန်",
    "Rice (Taung Pyan) (Old)": "တောင်ပြန်ဆန် (အဟောင်း)",
    "Rice (Thee Htet Shal)": "သီးထပ်ရှယ်ဆန်",
    "Rice (Yadanar Toe) (20%)": "ရတနာတိုးဆန် (၂၀%)",
    "Shwe Banana": "ရွှေငှက်ပျော",
    "Snake Gourd": "ပဲလင်းမြွေသီး",
    "Soya Bean (Delta)": "ပဲပုပ် (မြစ်ဝကျွန်းပေါ်)",
    "Soya Bean (Delta) (High Yield)": "ပဲပုပ် (မြစ်ဝကျွန်းပေါ်၊ အထွက်တိုး)",
    "Soya Bean (Shan)": "ပဲပုပ် (ရှမ်း)",
    Stawberry: "စတော်ဘယ်ရီ",
    "Sultani Sultapya": "စွန်တာနီ/စွန်တာပြာ",
    "Tamarind (Darzinn) (New)": "မန်ကျည်း (ဒါးဇင်း) (အသစ်)",
    "Tamarind (Kyaukpadaung)": "မန်ကျည်း (ကျောက်ပန်းတောင်း)",
    "Tamarind (Pwintkat) (New)": "မန်ကျည်း (ပွင့်ကပ်) (အသစ်)",
    "Taung Pyan (Old)": "တောင်ပြန်ဆန် (အဟောင်း)",
    "Thuka (New)": "သုခဆန် (အသစ်)",
    Tomato: "ခရမ်းချဉ်သီး",
    "Wheat (Kalay) (New)": "ဂျုံ (ကလေး) (အသစ်)",
    "Wheat (Monywa) (New)": "ဂျုံ (မုံရွာ) (အသစ်)",
    "Wheat (Myinmu, Myaung) (New)": "ဂျုံ (မြင်းမူ၊ မြောင်) (အသစ်)",
    "Wheat (Sadaung, Butalin) (New)": "ဂျုံ (ဆားတောင်၊ ဘုတလင်) (အသစ်)",
    "Wheat (Shan)": "ဂျုံ (ရှမ်း)",
    "White Chick Pea (V2) (New)": "ကုလားပဲဖြူ (V2) (အသစ်)",
    "White Chick Pea (V7) (New)": "ကုလားပဲဖြူ (V7) (အသစ်)",
    "White Cow Pea (New)": "စွန်တာဖြူ (အသစ်)",
    "White Sesame (Japan)": "နှမ်းဖြူ (ဂျပန်)",
    "White Sesame (New) (1,2,3)": "နှမ်းဖြူ (အသစ်) (၁၊ ၂၊ ၃)",
    "Yadanar Toe (Na) (85%)": "ရတနာတိုးဆန် (န) (၈၅%)",
    "Yard Long Bean": "ပဲတောင့်ရှည်",
  },
  locations: {
    Bago: "ပဲခူး",
    MON: "မွန်ပြည်နယ်",
    Magway: "မကွေး",
    Mandalay: "မန္တလေး",
    Pathein: "ပုသိမ်",
    Sagaing: "စစ်ကိုင်း",
    Shan: "ရှမ်းပြည်နယ်",
    Yangon: "ရန်ကုန်",
  },
  marketplaces: {
    "105mile": "၁၀၅ မိုင်ကုန်သွယ်ရေးဇုန်",
    Aunglan: "အောင်လံ",
    Aungpan: "အောင်ပန်း",
    "Bayint Naung": "ဘုရင့်နောင်ကုန်စည်ဒိုင်",
    Lashio: "လားရှိုး",
    Magway: "မကွေး",
    Mandalay: "မန္တလေးကုန်စည်ဒိုင်",
    Mawlamyine: "မော်လမြိုင်",
    Monywa: "မုံရွာကုန်စည်ဒိုင်",
    Myaungmya: "မြောင်းမြ",
    Myingyan: "မြင်းခြံ",
    Nattalin: "နတ်တလင်း",
    Pakokku: "ပခုက္ကူ",
    Pathein: "ပုသိမ်",
    Paungde: "ပေါင်းတည်",
    Pyay: "ပြည်",
    Sinphyukyun: "ဆင်ဖြူကျွန်း",
    "Thiri Mingalar Zay": "သီရိမင်္ဂလာဈေး",
    "War Tan": "ဝါးတန်းကုန်စည်ဒိုင်",
  },
  currencies: {
    MMK: "ကျပ်",
    USD: "အမေရိကန်ဒေါ်လာ",
  },
  units: {
    bag: "အိတ်",
    basket: "တင်း",
    box: "သေတ္တာ",
    bundle: "စည်း",
    pc: "ခု",
    ton: "တန်",
    viss: "ပိဿာ",
  },
};

const MYANMAR_MONTHS = [
  "ဇန်နဝါရီ",
  "ဖေဖော်ဝါရီ",
  "မတ်",
  "ဧပြီ",
  "မေ",
  "ဇွန်",
  "ဇူလိုင်",
  "ဩဂုတ်",
  "စက်တင်ဘာ",
  "အောက်တိုဘာ",
  "နိုဝင်ဘာ",
  "ဒီဇင်ဘာ",
] as const;

const MYANMAR_DIGITS: Record<string, string> = {
  "0": "၀",
  "1": "၁",
  "2": "၂",
  "3": "၃",
  "4": "၄",
  "5": "၅",
  "6": "၆",
  "7": "၇",
  "8": "၈",
  "9": "၉",
};

export function localizeMarketValue(
  section: MarketDictionarySection,
  value: string | null,
  lang: Language,
): string | null {
  if (value === null || lang === "en") return value;
  return MARKET_MYANMAR_DICTIONARY[section][value] ?? value;
}

export function formatMarketNumber(value: number, lang: Language): string {
  const formatted = value.toLocaleString("en-US");
  return lang === "my" ? toMyanmarDigits(formatted) : formatted;
}

export function formatMarketDate(value: string, lang: Language): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (lang === "en") {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  }
  const month = MYANMAR_MONTHS[date.getUTCMonth()];
  return `${toMyanmarDigits(String(date.getUTCFullYear()))} ခုနှစ် ${month}လ ${toMyanmarDigits(
    String(date.getUTCDate()),
  )} ရက်`;
}

export function marketMyanmarDictionaryCounts(): Record<MarketDictionarySection, number> {
  return {
    commodities: Object.keys(MARKET_MYANMAR_DICTIONARY.commodities).length,
    locations: Object.keys(MARKET_MYANMAR_DICTIONARY.locations).length,
    marketplaces: Object.keys(MARKET_MYANMAR_DICTIONARY.marketplaces).length,
    currencies: Object.keys(MARKET_MYANMAR_DICTIONARY.currencies).length,
    units: Object.keys(MARKET_MYANMAR_DICTIONARY.units).length,
  };
}

function toMyanmarDigits(value: string): string {
  return value.replace(/\d/g, (digit) => MYANMAR_DIGITS[digit] ?? digit);
}

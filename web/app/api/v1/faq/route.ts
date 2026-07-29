import { NextResponse } from "next/server";
import faqData from "../../../../data/faq_processed.json";

type FAQRecord = {
  faq_id: string;
  category: string;
  question_en: string;
  question_mm: string;
  answer_en: string;
  answer_mm: string;
  source_title: string;
  source_reference: string;
  last_reviewed_at: string;
  version: number;
  status: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim().toLowerCase() || "";
  const category = searchParams.get("category");
  const requestedLanguage = searchParams.get("language");
  const language =
    requestedLanguage === "en" || requestedLanguage === "my"
      ? requestedLanguage
      : null;

  let filtered: FAQRecord[] = faqData;

  if (category) {
    filtered = filtered.filter((f) => f.category === category);
  }

  if (search) {
    filtered = filtered.filter((f) => {
      if (language === "en") {
        return (
          f.question_en.toLowerCase().includes(search) ||
          f.answer_en.toLowerCase().includes(search)
        );
      }
      if (language === "my") {
        return f.question_mm.includes(search) || f.answer_mm.includes(search);
      }
      return (
        f.question_en.toLowerCase().includes(search) ||
        f.question_mm.includes(search) ||
        f.answer_en.toLowerCase().includes(search) ||
        f.answer_mm.includes(search)
      );
    });
  }

  return NextResponse.json(
    {
      schemaVersion: "1.1.0",
      meta: {
        totalCount: faqData.length,
        returnedCount: filtered.length,
        language: language ?? "all",
        translation: {
          method: "AI-assisted",
          reviewStatus: "professional review pending",
          sourceLanguage: "my",
        },
        timestamp: new Date().toISOString(),
      },
      data: filtered,
    },
    {
      headers: {
        "X-Data-Contract": "bilingual_faq_v1",
        "X-FAQ-Languages": "my,en",
        "X-Translation-Review": "professional-review-pending",
      },
    },
  );
}

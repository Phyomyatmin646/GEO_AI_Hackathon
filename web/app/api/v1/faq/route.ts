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
  const search = searchParams.get("search")?.toLowerCase() || "";
  const category = searchParams.get("category");

  let filtered: FAQRecord[] = faqData;

  if (category) {
    filtered = filtered.filter((f) => f.category === category);
  }

  if (search) {
    filtered = filtered.filter(
      (f) =>
        (f.question_en && f.question_en.toLowerCase().includes(search)) ||
        (f.question_mm && f.question_mm.includes(search)) ||
        (f.answer_en && f.answer_en.toLowerCase().includes(search)) ||
        (f.answer_mm && f.answer_mm.includes(search))
    );
  }

  return NextResponse.json({
    schemaVersion: "1.0.0",
    meta: {
      totalCount: faqData.length,
      returnedCount: filtered.length,
      timestamp: new Date().toISOString(),
    },
    data: filtered,
  });
}

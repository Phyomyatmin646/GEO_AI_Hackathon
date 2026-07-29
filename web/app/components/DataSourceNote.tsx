type DataSourceNoteProps = {
  organization: string;
  dataset: string;
  indicator: string;
  years: string;
  unit: string;
  citationUrl: string;
  updated?: string | null;
  detail?: string;
  language?: "en" | "my";
};

export default function DataSourceNote({
  organization,
  dataset,
  indicator,
  years,
  unit,
  citationUrl,
  updated,
  detail,
  language = "en",
}: DataSourceNoteProps) {
  const labels = language === "my"
    ? {
        source: "ရင်းမြစ်",
        indicator: "အညွှန်း",
        years: "ကာလ",
        unit: "ယူနစ်",
        updated: "နောက်ဆုံးပြင်ဆင်သည့်ရက်",
        citation: "မူရင်း dataset ကိုဖွင့်မည် ↗",
      }
    : {
        source: "Source",
        indicator: "Indicator",
        years: "Coverage",
        unit: "Unit",
        updated: "Source updated",
        citation: "Open official dataset ↗",
      };

  return (
    <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-xs leading-5 text-slate-600">
      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <div>
          <dt className="inline font-semibold text-slate-700">{labels.source}: </dt>
          <dd className="inline">{organization} · {dataset}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-700">{labels.indicator}: </dt>
          <dd className="inline">{indicator}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-700">{labels.years}: </dt>
          <dd className="inline">{years}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-700">{labels.unit}: </dt>
          <dd className="inline">{unit}</dd>
        </div>
        {updated && (
          <div>
            <dt className="inline font-semibold text-slate-700">{labels.updated}: </dt>
            <dd className="inline">{updated}</dd>
          </div>
        )}
      </dl>
      {detail && <p className="mt-2 text-slate-500">{detail}</p>}
      <a
        href={citationUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-600"
      >
        {labels.citation}
      </a>
    </div>
  );
}

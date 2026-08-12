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
    <div className="chart-source-note">
      <dl className="chart-source-note__grid">
        <div>
          <dt>{labels.source}: </dt>
          <dd>{organization} · {dataset}</dd>
        </div>
        <div>
          <dt>{labels.indicator}: </dt>
          <dd>{indicator}</dd>
        </div>
        <div>
          <dt>{labels.years}: </dt>
          <dd>{years}</dd>
        </div>
        <div>
          <dt>{labels.unit}: </dt>
          <dd>{unit}</dd>
        </div>
        {updated && (
          <div>
            <dt>{labels.updated}: </dt>
            <dd>{updated}</dd>
          </div>
        )}
      </dl>
      {detail && <p className="chart-source-note__detail">{detail}</p>}
      <a
        href={citationUrl}
        target="_blank"
        rel="noreferrer"
        className="chart-source-note__link"
      >
        {labels.citation}
      </a>
    </div>
  );
}

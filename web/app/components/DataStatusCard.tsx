type DataStatusCardProps = {
  title: string;
  status: string;
  description: string;
  items?: string[];
  tone?: "available" | "pending";
};

export default function DataStatusCard({
  title,
  status,
  description,
  items = [],
  tone = "pending",
}: DataStatusCardProps) {
  const statusClasses =
    tone === "available"
      ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
      : "bg-amber-100 text-amber-900 ring-amber-200";

  return (
    <section className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-100/50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-800">{title}</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusClasses}`}>
          {status}
        </span>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">{description}</p>
      {items.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm text-slate-700">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-emerald-700" aria-hidden="true">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

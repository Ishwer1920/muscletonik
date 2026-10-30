import { Link } from "react-router-dom";

export function ModuleCard({
  to,
  title,
  description,
  icon,
  accent,
}: {
  to: string;
  title: string;
  description: string;
  icon: string;
  accent: string;
}) {
  return (
    <Link
      to={to}
      className="card group flex flex-col gap-3 p-5 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div
        className={`grid h-12 w-12 place-items-center rounded-xl text-2xl ${accent}`}
        aria-hidden
      >
        {icon}
      </div>
      <div>
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
        Start practice
        <span className="transition group-hover:translate-x-0.5">→</span>
      </span>
    </Link>
  );
}

import { NavLink, Link } from "react-router-dom";
import type { ReactNode } from "react";

const nav = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/speaking", label: "Speaking" },
  { to: "/writing", label: "Writing" },
  { to: "/reading", label: "Reading" },
  { to: "/listening", label: "Listening" },
  { to: "/progress", label: "Progress" },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-extrabold text-slate-900">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
              IE
            </span>
            <span className="hidden sm:inline">IELTS Practice Studio</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-600 hover:bg-slate-100"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 pt-4 text-center text-xs text-slate-400">
        Practice tool for IELTS. All passages, questions and audio are AI-generated and original —
        not official IELTS material. Band scores are estimates for practice only.
      </footer>
    </div>
  );
}

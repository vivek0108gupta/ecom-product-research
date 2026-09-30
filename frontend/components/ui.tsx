import Link from 'next/link';
import { ReactNode } from 'react';
import type { DatasetStatus, ScoreStatus } from '@/lib/api';

/**
 * Missing data is rendered as an explicit "Data unavailable" marker everywhere.
 * It must never render as 0, "-", or an empty cell — those read as real values.
 */
export function Value({ value, suffix = '', prefix = '' }: { value: number | string | null | undefined; suffix?: string; prefix?: string }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-slate-400 italic text-xs">Data unavailable</span>;
  }
  return (
    <span>
      {prefix}
      {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
      {suffix}
    </span>
  );
}

export const Inr = ({ value }: { value: number | null | undefined }) => <Value value={value} prefix="₹" />;

export function ScoreBadge({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) {
    return <Value value={null} />;
  }
  // invert=true for risk, where a high number is bad.
  const effective = invert ? 100 - value : value;
  const tone =
    effective >= 70 ? 'bg-emerald-100 text-emerald-800' : effective >= 45 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800';

  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold tabular-nums ${tone}`}>{value.toFixed(1)}</span>;
}

export function ClassificationBadge({ value }: { value: string | null }) {
  if (!value) {
    return <Value value={null} />;
  }
  const map: Record<string, { tone: string; label: string }> = {
    A: { tone: 'bg-emerald-600 text-white', label: 'A · Strong' },
    B: { tone: 'bg-amber-500 text-white', label: 'B · Validate' },
    C: { tone: 'bg-slate-400 text-white', label: 'C · Weak' },
  };
  const entry = map[value] ?? { tone: 'bg-slate-200 text-slate-700', label: value };
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${entry.tone}`}>{entry.label}</span>;
}

export function Card({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
      {footer ? <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">{footer}</div> : null}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
}

/**
 * Dataset trust level. SAMPLE is styled as a warning rather than a neutral tag because
 * mistaking demo data for a real opportunity is the costliest error this UI can cause.
 */
export function DatasetStatusBadge({ value }: { value: DatasetStatus }) {
  const map: Record<DatasetStatus, { tone: string; label: string; title: string }> = {
    SAMPLE: {
      tone: 'bg-amber-500 text-white',
      label: 'SAMPLE',
      title: 'Demo data — describes no real listing. Not a validated, profitable or recommended product.',
    },
    UNVERIFIED: {
      tone: 'bg-sky-100 text-sky-800 border border-sky-300',
      label: 'UNVERIFIED',
      title: 'Real researched data, not independently re-checked. Confirm before acting.',
    },
    VERIFIED: {
      tone: 'bg-emerald-600 text-white',
      label: 'VERIFIED',
      title: 'Confirmed against the live listing and a supplier quote.',
    },
  };
  const entry = map[value] ?? map.UNVERIFIED;
  return (
    <span title={entry.title} className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${entry.tone}`}>
      {entry.label}
    </span>
  );
}

export function ScoreStatusBadge({ value, missing }: { value: ScoreStatus | null; missing?: string[] }) {
  if (value === 'INCOMPLETE') {
    return (
      <span
        title={missing && missing.length > 0 ? `Missing: ${missing.join(', ')}` : undefined}
        className="inline-block rounded border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700"
      >
        INCOMPLETE
      </span>
    );
  }
  if (value === 'COMPLETE') {
    return <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">COMPLETE</span>;
  }
  return <Value value={null} />;
}

/** Rendered wherever a Final Score would otherwise go on an INCOMPLETE product. */
export function NoFinalScore({ missing }: { missing: string[] }) {
  return (
    <span
      title={missing.length > 0 ? `Missing critical inputs: ${missing.join(', ')}` : undefined}
      className="text-[11px] font-semibold text-rose-600"
    >
      No score
    </span>
  );
}

export function Disclaimer({ text, datasetStatus }: { text: string; datasetStatus: DatasetStatus }) {
  const tone =
    datasetStatus === 'SAMPLE'
      ? 'border-amber-300 bg-amber-50 text-amber-900'
      : 'border-slate-200 bg-slate-50 text-slate-600';
  return <p className={`rounded border px-2 py-1 text-xs ${tone}`}>{text}</p>;
}

export function DatasetStatusBanner({ counts }: { counts: Record<DatasetStatus, number> }) {
  if (counts.SAMPLE === 0) {
    return null;
  }
  return (
    <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <strong>{counts.SAMPLE} product(s) in this database are SAMPLE (demo) data</strong> seeded to exercise the pipeline. They
      describe no real listing, are not validated, profitable or recommended products, and must not be used as market evidence.
      Import your own researched CSV, then use the <em>Verified Opportunities</em> view.
    </div>
  );
}

/**
 * Requirement 14: when no permitted automated collector is wired up, say so plainly
 * rather than rendering an empty dashboard that looks like a failure.
 */
export function NoDataSourceBanner({
  report,
}: {
  report: { state: string; message: string; researchedAt: string; sources: Array<{ label: string; automated: boolean; blockedReason: string | null }> };
}) {
  if (report.state !== 'NO_REAL_DATA_SOURCE_CONFIGURED') {
    return null;
  }
  const blocked = report.sources.filter((source) => source.automated);

  return (
    <div className="mb-4 rounded-md border-2 border-slate-800 bg-slate-50 px-4 py-3">
      <p className="text-sm font-bold tracking-wide text-slate-900">NO REAL DATA SOURCE CONFIGURED</p>
      <p className="mt-1 text-sm text-slate-700">{report.message}</p>
      {blocked.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-slate-600">
            Candidate automated sources ({blocked.length}) — researched {report.researchedAt}
          </summary>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
            {blocked.map((source) => (
              <li key={source.label}>
                <span className="font-medium">{source.label}</span> — {source.blockedReason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export function Nav() {
  const links = [
    { href: '/', label: 'Dashboard' },
    { href: '/verified', label: 'Verified Opportunities' },
    { href: '/discovery', label: 'Product Discovery' },
    { href: '/compare', label: 'Compare' },
  ];
  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
        <span className="text-sm font-bold">Product Research</span>
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="text-sm text-slate-600 hover:text-slate-900">
            {link.label}
          </Link>
        ))}
        <span className="ml-auto text-xs text-slate-400">India · INR</span>
      </div>
    </nav>
  );
}

export function DataFreshness({ collectedAt, computedAt }: { collectedAt: string; computedAt: string | null }) {
  const fmt = (value: string | null) => (value ? new Date(value).toLocaleString('en-IN') : 'Data unavailable');
  return (
    <span className="text-xs text-slate-500">
      Collected {fmt(collectedAt)} · Scored {fmt(computedAt)}
    </span>
  );
}

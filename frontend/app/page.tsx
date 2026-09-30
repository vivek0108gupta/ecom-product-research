import Link from 'next/link';
import { getDataSources, getSummary, getTopOpportunities } from '@/lib/api';
import {
  Card,
  ClassificationBadge,
  DataFreshness,
  DatasetStatusBadge,
  DatasetStatusBanner,
  NoDataSourceBanner,
  Disclaimer,
  Inr,
  NoFinalScore,
  ScoreBadge,
  ScoreStatusBadge,
  Stat,
  Value,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [summary, opportunities, sources] = await Promise.all([getSummary(), getTopOpportunities(20), getDataSources()]);

  return (
    <div className="space-y-6">
      <NoDataSourceBanner report={sources} />
      <DatasetStatusBanner counts={summary.datasetStatusCounts} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Products analyzed" value={summary.totalProductsAnalyzed} hint={`${summary.productsUnscored} not yet scorable`} />
        <Stat label="Score > 70" value={summary.productsAboveScore70} />
        <Stat
          label="Average margin"
          value={<Value value={summary.averageMarginPercentage} suffix="%" />}
          hint={`${Math.round(summary.marginDataCoverage * 100)}% of products have cost data`}
        />
        <Stat
          label="Real verified products"
          value={summary.realVerifiedProducts}
          hint="Passed the verification gate: real traceable source + full evidence"
        />
        <Stat
          label="Incomplete scores"
          value={summary.scoreStatusCounts.INCOMPLETE}
          hint="Critical inputs missing — no Final Score issued"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Dataset status"
          footer="VERIFIED requires a real, traceable source and full price, cost and demand/competition evidence. Seed and placeholder-sourced data can never reach it."
        >
          <ul className="space-y-2 text-sm">
            {(['SAMPLE', 'UNVERIFIED', 'VERIFIED'] as const).map((status) => (
              <li key={status} className="flex items-center justify-between">
                <DatasetStatusBadge value={status} />
                <span className="text-lg font-semibold tabular-nums">{summary.datasetStatusCounts[status]}</span>
              </li>
            ))}
            <li className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
              <span>Verified opportunities (non-SAMPLE + COMPLETE)</span>
              <span className="tabular-nums">{summary.verifiedOpportunityCount}</span>
            </li>
            {summary.downgradedVerificationClaims > 0 ? (
              <li className="flex items-center justify-between text-xs text-rose-700">
                <span>VERIFIED claims refused</span>
                <span className="tabular-nums">{summary.downgradedVerificationClaims}</span>
              </li>
            ) : null}
            <li className="flex items-center justify-between border-t border-slate-100 pt-2">
              <ScoreStatusBadge value="INCOMPLETE" />
              <span className="tabular-nums">{summary.scoreStatusCounts.INCOMPLETE}</span>
            </li>
          </ul>
        </Card>

        <Card title="Classification">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between"><ClassificationBadge value="A" /> <span className="tabular-nums">{summary.classificationCounts.A}</span></li>
            <li className="flex justify-between"><ClassificationBadge value="B" /> <span className="tabular-nums">{summary.classificationCounts.B}</span></li>
            <li className="flex justify-between"><ClassificationBadge value="C" /> <span className="tabular-nums">{summary.classificationCounts.C}</span></li>
            <li className="flex justify-between text-slate-500"><span>Unclassified</span> <span className="tabular-nums">{summary.classificationCounts.unclassified}</span></li>
          </ul>
        </Card>

        <Card title="Top categories by average score">
          <ul className="space-y-1 text-sm">
            {summary.topCategories.slice(0, 8).map((row) => (
              <li key={row.category} className="flex items-center justify-between gap-2">
                <span className="truncate">{row.category}</span>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{row.productCount}×</span>
                  <ScoreBadge value={row.averageScore} />
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Export" footer="Exports respect the same filters as Product Discovery.">
          <div className="space-y-2 text-sm">
            <a className="block rounded bg-slate-900 px-3 py-2 text-center text-white hover:bg-slate-700" href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'}/export/csv`}>
              Download CSV
            </a>
            <Link className="block rounded border border-slate-300 px-3 py-2 text-center hover:bg-slate-100" href="/discovery">
              Filter products first
            </Link>
          </div>
        </Card>
      </div>

      <Card
        title={`Ranked entries (${opportunities.length}) — not recommendations`}
        footer="Ranked by the configured weighted score across all dataset statuses. Every figure is computed from collected data; each entry states what its data actually is. For entries backed by real, complete data only, use Verified Opportunities."
      >
        <div className="space-y-4">
          {opportunities.map((item) => (
            <article key={item.productId} className="rounded-md border border-slate-200 p-4">
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">
                  <span className="mr-2 text-slate-400">#{item.rank}</span>
                  <Link className="hover:underline" href={`/products/${item.productId}`}>{item.productName}</Link>
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <DatasetStatusBadge value={item.datasetStatus} />
                  <ScoreStatusBadge value={item.scoreStatus} missing={item.missingCriticalFields} />
                  <ClassificationBadge value={item.classification} />
                  <span className="text-slate-500">Score</span>
                  {item.finalScore === null ? <NoFinalScore missing={item.missingCriticalFields} /> : <ScoreBadge value={item.finalScore} />}
                  <span className="text-slate-500">Risk</span>
                  <ScoreBadge value={item.riskScore} invert />
                </div>
              </header>

              <div className="mt-2">
                <Disclaimer text={item.disclaimer} datasetStatus={item.datasetStatus} />
              </div>

              {item.missingCriticalFields.length > 0 ? (
                <p className="mt-2 text-xs text-rose-700">
                  <strong>Missing critical inputs:</strong> {item.missingCriticalFields.join(', ')}
                </p>
              ) : null}

              <div className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><span className="text-slate-500">Price </span><Inr value={item.currentPrice} /></div>
                <div><span className="text-slate-500">Supplier cost </span><Inr value={item.estimatedSupplierCost} /></div>
                <div><span className="text-slate-500">Landed cost </span><Inr value={item.estimatedLandedCost} /></div>
                <div><span className="text-slate-500">Profit/unit </span><Inr value={item.profitPerUnit} /> <Value value={item.profitMarginPercentage === null ? null : ` (${item.profitMarginPercentage}%)`} /></div>
              </div>

              <dl className="mt-3 space-y-1 text-sm text-slate-700">
                <div><dt className="inline font-medium">Demand: </dt><dd className="inline">{item.why.demandEvidence}</dd></div>
                <div><dt className="inline font-medium">Competition: </dt><dd className="inline">{item.why.competitionEvidence}</dd></div>
                <div><dt className="inline font-medium">Economics: </dt><dd className="inline">{item.why.economicsEvidence}</dd></div>
                <div><dt className="inline font-medium">Customer pain: </dt><dd className="inline">{item.why.customerPainEvidence}</dd></div>
                <div><dt className="inline font-medium">Differentiation: </dt><dd className="inline">{item.why.differentiationEvidence}</dd></div>
                <div><dt className="inline font-medium">Risks: </dt><dd className="inline">{item.why.risks.join('; ')}</dd></div>
              </dl>

              <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
                <p className="text-xs text-slate-600">{item.suggestedValidationStep}</p>
                <DataFreshness collectedAt={item.dataFreshness.collectedAt} computedAt={item.dataFreshness.scoreComputedAt} />
              </footer>
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
}

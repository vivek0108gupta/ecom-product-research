import Link from 'next/link';
import { API_URL, getSummary, getVerifiedOpportunities } from '@/lib/api';
import { Card, ClassificationBadge, DataFreshness, DatasetStatusBadge, Disclaimer, Inr, ScoreBadge, Value } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * The only view whose entries are backed by real, complete data: SAMPLE rows are excluded
 * outright, and so is anything whose score is INCOMPLETE. When it is empty that is the
 * correct and informative answer — it is never padded with weaker rows to look populated.
 */
export default async function VerifiedOpportunitiesPage() {
  const [summary, opportunities] = await Promise.all([getSummary(), getVerifiedOpportunities(20)]);

  return (
    <div className="space-y-4">
      <Card
        title="Verified opportunities"
        footer="Shows only products whose dataset status is UNVERIFIED or VERIFIED and whose score is COMPLETE (every critical input present). Demo data and incomplete records are excluded by construction."
      >
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span>
            <strong className="text-2xl tabular-nums">{summary.verifiedOpportunityCount}</strong> qualifying product(s)
          </span>
          <span className="text-slate-500">
            {summary.datasetStatusCounts.SAMPLE} SAMPLE and {summary.scoreStatusCounts.INCOMPLETE} INCOMPLETE record(s) excluded
          </span>
          <a
            className="ml-auto rounded bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-700"
            href={`${API_URL}/export/csv?verifiedOnly=true`}
          >
            Export CSV
          </a>
        </div>
      </Card>

      {opportunities.length === 0 ? (
        <Card title="Nothing qualifies yet">
          <p className="text-sm text-slate-700">
            No product currently has both real (non-SAMPLE) data and a COMPLETE score.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            To populate this view, import researched data with <code className="rounded bg-slate-100 px-1">dataset_status</code> set to{' '}
            <code className="rounded bg-slate-100 px-1">UNVERIFIED</code> or <code className="rounded bg-slate-100 px-1">VERIFIED</code>,
            including all seven critical fields: selling price, product cost, marketplace, demand signal (review count and rating),
            competition signal (comparable listing count), source, and collected-at timestamp.
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Check{' '}
            <Link href="/discovery?scoreStatus=INCOMPLETE" className="text-blue-600 hover:underline">
              incomplete records
            </Link>{' '}
            to see exactly which fields each product is missing.
          </p>
        </Card>
      ) : (
        <Card title={`${opportunities.length} qualifying product(s)`}>
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
                    <ClassificationBadge value={item.classification} />
                    <span className="text-slate-500">Score</span>
                    <ScoreBadge value={item.finalScore} />
                    <span className="text-slate-500">Risk</span>
                    <ScoreBadge value={item.riskScore} invert />
                  </div>
                </header>

                <div className="mt-2">
                  <Disclaimer text={item.disclaimer} datasetStatus={item.datasetStatus} />
                </div>

                <div className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div><span className="text-slate-500">Price </span><Inr value={item.currentPrice} /></div>
                  <div><span className="text-slate-500">Supplier cost </span><Inr value={item.estimatedSupplierCost} /></div>
                  <div><span className="text-slate-500">Landed cost </span><Inr value={item.estimatedLandedCost} /></div>
                  <div>
                    <span className="text-slate-500">Profit/unit </span>
                    <Inr value={item.profitPerUnit} />{' '}
                    <Value value={item.profitMarginPercentage === null ? null : `(${item.profitMarginPercentage}%)`} />
                  </div>
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
      )}
    </div>
  );
}

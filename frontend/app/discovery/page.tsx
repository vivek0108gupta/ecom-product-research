import Link from 'next/link';
import { Filters } from '@/components/filters';
import { API_URL, getCategories, getMarketplaces, getProducts } from '@/lib/api';
import { Card, ClassificationBadge, DatasetStatusBadge, Inr, NoFinalScore, ScoreBadge, ScoreStatusBadge, Value } from '@/components/ui';

export const dynamic = 'force-dynamic';

const COLUMNS = [
  '#', 'Product', 'Dataset', 'Marketplace', 'Price', 'Est. cost', 'Profit', 'Margin',
  'Demand', 'Competition', 'Differentiation', 'Shipping', 'Pain', 'Expansion', 'Risk', 'Score', 'Class', 'Data',
];

export default async function DiscoveryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value !== '') {
      query.append(key, value);
    }
  }
  if (!query.has('limit')) {
    query.set('limit', '100');
  }

  const [categories, marketplaces, result] = await Promise.all([getCategories(), getMarketplaces(), getProducts(query.toString())]);

  return (
    <div className="space-y-4">
      <Filters categories={categories} marketplaces={marketplaces} />

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {result.total} product(s) match. Showing {result.rows.length}.
        </p>
        <a className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700" href={`${API_URL}/export/csv?${query.toString()}`}>
          Export CSV
        </a>
      </div>

      <Card
        title="Ranked products"
        footer="Blank metrics show as 'Data unavailable' and are excluded from the weighted score, never counted as zero. A product missing any critical input is marked INCOMPLETE and gets no Final Score — its sub-scores are still shown. SAMPLE rows are demo data, not recommendations."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1400px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                {COLUMNS.map((column) => (
                  <th key={column} className="px-2 py-2 font-medium">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.productId} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-2 py-2 text-slate-400 tabular-nums">{row.rank}</td>
                  <td className="px-2 py-2">
                    <Link href={`/products/${row.productId}`} className="font-medium hover:underline">{row.name}</Link>
                    <div className="text-xs text-slate-500">{row.category}</div>
                    {row.missingCriticalFields.length > 0 ? (
                      <div className="text-[11px] text-rose-600">Missing: {row.missingCriticalFields.join(', ')}</div>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-1">
                      <DatasetStatusBadge value={row.datasetStatus} />
                      <ScoreStatusBadge value={row.scoreStatus} missing={row.missingCriticalFields} />
                    </div>
                  </td>
                  <td className="px-2 py-2 text-xs">{row.marketplace}</td>
                  <td className="px-2 py-2 tabular-nums"><Inr value={row.sellingPrice} /></td>
                  <td className="px-2 py-2 tabular-nums"><Inr value={row.estimatedLandedCost} /></td>
                  <td className="px-2 py-2 tabular-nums"><Inr value={row.profitPerUnit} /></td>
                  <td className="px-2 py-2 tabular-nums"><Value value={row.profitMarginPercentage} suffix="%" /></td>
                  <td className="px-2 py-2"><ScoreBadge value={row.demandScore} /></td>
                  <td className="px-2 py-2"><ScoreBadge value={row.competitionOpportunityScore} /></td>
                  <td className="px-2 py-2"><ScoreBadge value={row.differentiationScore} /></td>
                  <td className="px-2 py-2"><ScoreBadge value={row.shippingSimplicityScore} /></td>
                  <td className="px-2 py-2"><ScoreBadge value={row.customerPainOpportunityScore} /></td>
                  <td className="px-2 py-2"><ScoreBadge value={row.bundleExpansionScore} /></td>
                  <td className="px-2 py-2"><ScoreBadge value={row.riskScore} invert /></td>
                  <td className="px-2 py-2">
                    {row.finalScore === null ? <NoFinalScore missing={row.missingCriticalFields} /> : <ScoreBadge value={row.finalScore} />}
                  </td>
                  <td className="px-2 py-2"><ClassificationBadge value={row.classification} /></td>
                  <td className="px-2 py-2 text-xs text-slate-500 tabular-nums">
                    <Value value={row.dataCompleteness === null ? null : Math.round(row.dataCompleteness * 100)} suffix="%" />
                  </td>
                </tr>
              ))}
              {result.rows.length === 0 ? (
                <tr><td colSpan={COLUMNS.length} className="px-2 py-6 text-center text-slate-500">No products match these filters.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

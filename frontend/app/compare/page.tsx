import Link from 'next/link';
import { compareProducts, getProducts, ProductDetail } from '@/lib/api';
import { Card, ClassificationBadge, Inr, ScoreBadge, Value } from '@/components/ui';

export const dynamic = 'force-dynamic';

const ROWS: Array<{ label: string; render: (detail: ProductDetail) => React.ReactNode }> = [
  { label: 'Marketplace', render: (d) => d.product.marketplace.name },
  { label: 'Category', render: (d) => d.product.category },
  { label: 'Price', render: (d) => <Inr value={d.priceHistory[0]?.sellingPrice ?? null} /> },
  { label: 'Landed cost', render: (d) => <Inr value={d.profitability?.estimatedLandedCost ?? null} /> },
  { label: 'Profit / unit', render: (d) => <Inr value={d.profitability?.isReliable ? d.profitability.profitPerUnit : null} /> },
  { label: 'Margin', render: (d) => <Value value={d.profitability?.isReliable ? d.profitability.profitMarginPercentage : null} suffix="%" /> },
  { label: 'Demand', render: (d) => <ScoreBadge value={d.score?.demandScore ?? null} /> },
  { label: 'Competition opportunity', render: (d) => <ScoreBadge value={d.score?.competitionOpportunityScore ?? null} /> },
  { label: 'Differentiation', render: (d) => <ScoreBadge value={d.score?.differentiationScore ?? null} /> },
  { label: 'Shipping simplicity', render: (d) => <ScoreBadge value={d.score?.shippingSimplicityScore ?? null} /> },
  { label: 'Bundle / expansion', render: (d) => <ScoreBadge value={d.score?.bundleExpansionScore ?? null} /> },
  { label: 'Risk', render: (d) => <ScoreBadge value={d.score?.riskScore ?? null} invert /> },
  { label: 'Final score', render: (d) => <ScoreBadge value={d.score?.finalScore ?? null} /> },
  { label: 'Classification', render: (d) => <ClassificationBadge value={d.score?.classification ?? null} /> },
  { label: 'Data completeness', render: (d) => <Value value={d.score?.dataCompleteness ? Math.round(d.score.dataCompleteness * 100) : null} suffix="%" /> },
  { label: 'Top complaint', render: (d) => <Value value={d.painPoints.find((p) => p.type === 'complaint')?.theme ?? null} /> },
  { label: 'Risk reasons', render: (d) => <span className="text-xs">{d.score?.riskReasons.join('; ') || '—'}</span> },
];

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids: rawIds } = await searchParams;
  const ids = (rawIds ?? '').split(',').map((id) => id.trim()).filter(Boolean).slice(0, 5);
  const details = ids.length > 0 ? await compareProducts(ids) : [];
  const { rows: candidates } = await getProducts('limit=20&sortBy=finalScore&sortDirection=DESC');

  return (
    <div className="space-y-4">
      <Card title="Pick up to 5 products to compare" footer="Add ?ids=<id>,<id> to the URL, or click products below.">
        <div className="flex flex-wrap gap-2">
          {candidates.map((candidate) => {
            const selected = ids.includes(candidate.productId);
            const next = selected ? ids.filter((id) => id !== candidate.productId) : [...ids, candidate.productId].slice(0, 5);
            return (
              <Link
                key={candidate.productId}
                href={`/compare?ids=${next.join(',')}`}
                className={`rounded border px-2 py-1 text-xs ${selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 hover:bg-slate-100'}`}
              >
                {candidate.name}
              </Link>
            );
          })}
        </div>
      </Card>

      {details.length > 0 ? (
        <Card title={`Comparing ${details.length} product(s)`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="px-2 py-2 text-xs uppercase text-slate-500">Metric</th>
                  {details.map((detail) => (
                    <th key={detail.product.id} className="px-2 py-2">
                      <Link href={`/products/${detail.product.id}`} className="hover:underline">{detail.product.name}</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-slate-100">
                    <td className="px-2 py-2 text-slate-500">{row.label}</td>
                    {details.map((detail) => (
                      <td key={detail.product.id} className="px-2 py-2">{row.render(detail)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <p className="text-sm text-slate-500">Select products above to compare them side by side.</p>
      )}
    </div>
  );
}

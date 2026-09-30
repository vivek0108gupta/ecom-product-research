import { getProductDetail } from '@/lib/api';
import { Card, ClassificationBadge, DatasetStatusBadge, Inr, NoFinalScore, ScoreBadge, ScoreStatusBadge, Value } from '@/components/ui';

export const dynamic = 'force-dynamic';

const SUB_SCORE_LABELS: Record<string, string> = {
  demand: 'Demand',
  profitability: 'Profitability',
  competitionOpportunity: 'Competition opportunity',
  differentiation: 'Differentiation',
  shippingSimplicity: 'Shipping simplicity',
  customerPainOpportunity: 'Customer pain opportunity',
  bundleExpansion: 'Bundle / expansion',
};

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getProductDetail(id);
  const { product, provenance, profitability, score } = detail;
  const metrics = detail.metricsHistory[0] ?? null;
  const complaints = detail.painPoints.filter((point) => point.type === 'complaint');
  const positives = detail.painPoints.filter((point) => point.type === 'positive');
  const opportunities = detail.painPoints.filter((point) => point.type === 'opportunity');

  return (
    <div className="space-y-4">
      <header className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{product.name}</h1>
            <p className="text-sm text-slate-500">
              {product.marketplace.name} · {product.category}
              {product.brand ? ` · ${product.brand}` : ''}
              <span className="ml-2 inline-block align-middle"><DatasetStatusBadge value={product.datasetStatus} /></span>
            </p>
            <a href={product.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
              {product.url}
            </a>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="text-right">
              <div className="text-xs text-slate-500">Final score</div>
              {score?.finalScore === null || score === null ? (
                <NoFinalScore missing={score?.missingCriticalFields ?? []} />
              ) : (
                <ScoreBadge value={score.finalScore} />
              )}
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Score status</div>
              <ScoreStatusBadge value={score?.scoreStatus ?? null} missing={score?.missingCriticalFields} />
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Risk</div>
              <ScoreBadge value={score?.riskScore ?? null} invert />
            </div>
            <ClassificationBadge value={score?.classification ?? null} />
          </div>
        </div>
      </header>

      {product.verificationNotes && product.verificationNotes.length > 0 ? (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <strong>A VERIFIED claim on this record was refused.</strong> It is stored as {product.datasetStatus} because:
          <ul className="mt-1 list-inside list-disc">
            {product.verificationNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Product information">
          <dl className="space-y-1 text-sm">
            <Row label="Marketplace ID" value={product.externalId} />
            <Row label="Subcategory" value={product.subcategory} />
            <Row label="Weight" value={product.weightKg === null ? null : `${product.weightKg} kg`} />
            <Row
              label="Dimensions"
              value={product.dimensions ? `${product.dimensions.lengthCm} × ${product.dimensions.widthCm} × ${product.dimensions.heightCm} cm` : null}
            />
            <Row label="Colors" value={product.colors?.join(', ') ?? null} />
            <Row label="Sizes" value={product.sizes?.join(', ') ?? null} />
            <Row label="Fragile" value={product.fragile === null ? null : product.fragile ? 'Yes' : 'No'} />
            <Row label="Return risk" value={product.returnRisk} />
            <Row label="Regulatory complexity" value={product.regulatoryComplexity} />
            <Row label="Brand/IP risk" value={product.brandIpRisk === null ? null : product.brandIpRisk ? 'Yes' : 'No'} />
            <Row label="Established brand dominance" value={product.establishedBrandDominance === null ? null : product.establishedBrandDominance ? 'Yes' : 'No'} />
          </dl>
        </Card>

        <Card title="Demand & competition signals" footer="Review count is an indirect popularity signal, not a sales figure.">
          <dl className="space-y-1 text-sm">
            <Row label="Reviews" value={metrics?.reviewCount ?? null} />
            <Row label="Average rating" value={metrics?.averageRating ?? null} />
            <Row label="Competing listings" value={metrics?.competitorCount ?? null} />
            <Row label="Sellers" value={metrics?.sellerCount ?? null} />
            <Row label="Search term" value={metrics?.searchTerm ?? null} />
            <Row label="Observed" value={metrics ? new Date(metrics.collectedAt).toLocaleString('en-IN') : null} />
          </dl>
        </Card>

        <Card title="Provenance" footer={provenance.complianceNotes ?? undefined}>
          <dl className="space-y-1 text-sm">
            <Row label="Source" value={provenance.source} />
            <Row label="Source type" value={provenance.dataSourceType} />
            <Row label="Collected at" value={new Date(provenance.collectedAt).toLocaleString('en-IN')} />
            <Row label="Confidence" value={product.confidenceScore} />
            <Row label="Score computed" value={score ? new Date(score.computedAt).toLocaleString('en-IN') : null} />
          </dl>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Profit calculator"
          footer={profitability?.reliabilityNotes.join(' ') ?? 'No selling price on record.'}
        >
          {profitability ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Selling price" value={<Inr value={profitability.sellingPrice} />} />
                <Metric label="Total cost" value={<Inr value={profitability.totalCost} />} />
                <Metric label="Landed cost" value={<Inr value={profitability.estimatedLandedCost} />} />
                <Metric label="Profit / unit" value={profitability.isReliable ? <Inr value={profitability.profitPerUnit} /> : <Value value={null} />} />
                <Metric label="Margin" value={profitability.isReliable ? <Value value={profitability.profitMarginPercentage} suffix="%" /> : <Value value={null} />} />
                <Metric label="ROI on landed cost" value={profitability.isReliable ? <Value value={profitability.roiPercentage} suffix="%" /> : <Value value={null} />} />
              </div>

              <table className="w-full text-xs">
                <tbody>
                  {Object.entries(profitability.costBreakdown).map(([key, value]) => (
                    <tr key={key} className="border-b border-slate-100">
                      <td className="py-1 capitalize text-slate-600">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}</td>
                      <td className="py-1 text-right tabular-nums">
                        {profitability.missingCostFields.includes(key) ? <Value value={null} /> : <Inr value={value} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {profitability.appliedFees.length > 0 ? (
                <div>
                  <h3 className="text-xs font-semibold uppercase text-slate-500">Fee schedule applied</h3>
                  <ul className="mt-1 space-y-1 text-xs text-slate-600">
                    {profitability.appliedFees.map((fee) => (
                      <li key={fee.feeType}>
                        {fee.feeType}: {fee.percentage !== null ? `${fee.percentage}%` : 'fixed'} = ₹{fee.amountInr} · {fee.source} (effective {fee.effectiveDate})
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <Value value={null} />
          )}
        </Card>

        <Card title="Score breakdown" footer={score ? `Weights in force: ${JSON.stringify(score.weightsSnapshot)}` : undefined}>
          {score && score.missingCriticalFields.length > 0 ? (
            <p className="mb-3 rounded border border-rose-200 bg-rose-50 px-2 py-2 text-xs text-rose-800">
              <strong>No Final Score issued.</strong> These critical inputs are missing: {score.missingCriticalFields.join(', ')}.
              Sub-scores below are still computed from what was collected, but they are not combined into a headline number.
            </p>
          ) : null}
          {score ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="py-1">Component</th><th className="py-1">Score</th><th className="py-1">Weight used</th><th className="py-1">Contribution</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(SUB_SCORE_LABELS).map(([key, label]) => {
                  const sub = score.scoreBreakdown.subScores?.[key];
                  return (
                    <tr key={key} className="border-b border-slate-100 align-top">
                      <td className="py-1">
                        {label}
                        {sub?.unavailableReason ? <div className="text-xs text-slate-400">{sub.unavailableReason}</div> : null}
                      </td>
                      <td className="py-1"><ScoreBadge value={sub?.value ?? null} /></td>
                      <td className="py-1 text-xs tabular-nums">
                        <Value value={score.scoreBreakdown.effectiveWeights?.[key] === undefined ? null : `${Math.round(score.scoreBreakdown.effectiveWeights[key] * 100)}%`} />
                      </td>
                      <td className="py-1 text-xs tabular-nums"><Value value={score.scoreBreakdown.contributions?.[key] ?? null} /></td>
                    </tr>
                  );
                })}
                <tr className="font-semibold">
                  <td className="py-1">Final</td>
                  <td className="py-1">
                    {score.finalScore === null ? <NoFinalScore missing={score.missingCriticalFields} /> : <ScoreBadge value={score.finalScore} />}
                  </td>
                  <td className="py-1 text-xs">completeness <Value value={score.dataCompleteness === null ? null : `${Math.round(score.dataCompleteness * 100)}%`} /></td>
                  <td />
                </tr>
              </tbody>
            </table>
          ) : (
            <Value value={null} />
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={`Customer complaints (${complaints.length})`} footer="Recorded by the researcher from listing reviews. Each entry links to the listing it was read from.">
          <PainList items={complaints} />
        </Card>
        <Card title={`Positive feedback (${positives.length})`}>
          <PainList items={positives} />
        </Card>
        <Card title={`Differentiation opportunities (${opportunities.length})`}>
          <PainList items={opportunities} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Risk analysis">
          {score ? (
            <div className="text-sm">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-slate-500">Risk score</span>
                <ScoreBadge value={score.riskScore} invert />
              </div>
              <ul className="list-inside list-disc text-slate-700">
                {score.riskReasons.length > 0 ? score.riskReasons.map((reason) => <li key={reason}>{reason}</li>) : <li>No risk penalties triggered by the data on file.</li>}
              </ul>
            </div>
          ) : (
            <Value value={null} />
          )}
        </Card>

        <Card
          title="Data sources"
          footer="Every externally sourced value on this product, with where it came from, when it was collected and how much it is trusted."
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="py-1">Field</th><th>Source</th><th>Collected</th><th>Confidence</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {detail.dataSources.map((entry) => (
                <tr key={entry.field} className="border-b border-slate-100">
                  <td className="py-1">{entry.field}</td>
                  <td className="text-xs">
                    {entry.sourceUrl ? (
                      <a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                        {entry.sourceName}
                      </a>
                    ) : (
                      entry.sourceName
                    )}
                  </td>
                  <td className="text-xs">{new Date(entry.collectedAt).toLocaleDateString('en-IN')}</td>
                  <td className="text-xs tabular-nums"><Value value={entry.confidenceScore} /></td>
                  <td><DatasetStatusBadge value={entry.datasetStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Price history" footer="Every row is an observation actually collected — nothing is back-filled or estimated.">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500"><th className="py-1">Collected</th><th>Price</th><th>MRP</th><th>Discount</th><th>Source</th></tr>
            </thead>
            <tbody>
              {detail.priceHistory.map((price, index) => (
                <tr key={index} className="border-b border-slate-100">
                  <td className="py-1 text-xs">{new Date(price.collectedAt).toLocaleDateString('en-IN')}</td>
                  <td className="tabular-nums"><Inr value={price.sellingPrice} /></td>
                  <td className="tabular-nums"><Inr value={price.mrp} /></td>
                  <td className="tabular-nums"><Value value={price.discountPercentage} suffix="%" /></td>
                  <td className="text-xs text-slate-500">{price.sourceName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right"><Value value={value} /></dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded border border-slate-100 bg-slate-50 p-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function PainList({ items }: { items: Array<{ theme: string; mentionCount: number | null; sourceUrl: string }> }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-400 italic">None recorded.</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {items.map((item) => (
        <li key={item.theme} className="flex items-baseline justify-between gap-2">
          <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">{item.theme}</a>
          <span className="text-xs text-slate-500">{item.mentionCount === null ? '' : `${item.mentionCount} mentions`}</span>
        </li>
      ))}
    </ul>
  );
}

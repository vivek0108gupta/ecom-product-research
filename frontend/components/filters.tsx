'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useCallback } from 'react';

interface Props {
  categories: Array<{ slug: string; label: string }>;
  marketplaces: Array<{ slug: string; name: string }>;
}

const NUMERIC_FILTERS = [
  { name: 'priceMin', label: 'Min price (₹)' },
  { name: 'priceMax', label: 'Max price (₹)' },
  { name: 'marginMin', label: 'Min margin %' },
  { name: 'demandMin', label: 'Min demand' },
  { name: 'competitionOpportunityMin', label: 'Min competition opp.' },
  { name: 'differentiationMin', label: 'Min differentiation' },
  { name: 'riskMax', label: 'Max risk' },
  { name: 'scoreMin', label: 'Min score' },
];

export function Filters({ categories, marketplaces }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const next = new URLSearchParams();

      for (const [key, value] of data.entries()) {
        const stringValue = String(value).trim();
        if (stringValue !== '') {
          next.append(key, stringValue);
        }
      }
      router.push(`/discovery?${next.toString()}`);
    },
    [router],
  );

  const current = (key: string) => params.get(key) ?? '';

  return (
    <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <label className="text-xs text-slate-600">
          Search
          <input name="search" defaultValue={current('search')} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" placeholder="name or brand" />
        </label>

        <label className="text-xs text-slate-600">
          Category
          <select name="category" defaultValue={current('category')} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
            <option value="">All</option>
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>{category.label}</option>
            ))}
          </select>
        </label>

        <label className="text-xs text-slate-600">
          Marketplace
          <select name="marketplace" defaultValue={current('marketplace')} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
            <option value="">All</option>
            {marketplaces.map((marketplace) => (
              <option key={marketplace.slug} value={marketplace.slug}>{marketplace.name}</option>
            ))}
          </select>
        </label>

        <label className="text-xs text-slate-600">
          Dataset status
          <select name="datasetStatus" defaultValue={current('datasetStatus')} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
            <option value="">All</option>
            <option value="VERIFIED">VERIFIED only</option>
            <option value="UNVERIFIED">UNVERIFIED only</option>
            <option value="SAMPLE">SAMPLE (demo) only</option>
            <option value="VERIFIED,UNVERIFIED">Real data (VERIFIED + UNVERIFIED)</option>
          </select>
        </label>

        <label className="text-xs text-slate-600">
          Score status
          <select name="scoreStatus" defaultValue={current('scoreStatus')} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
            <option value="">All</option>
            <option value="COMPLETE">COMPLETE only</option>
            <option value="INCOMPLETE">INCOMPLETE only</option>
          </select>
        </label>

        <label className="text-xs text-slate-600">
          Classification
          <select name="classification" defaultValue={current('classification')} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
            <option value="">All</option>
            <option value="A">A · Strong</option>
            <option value="B">B · Needs validation</option>
            <option value="C">C · Weak</option>
          </select>
        </label>

        <label className="text-xs text-slate-600">
          Sort by
          <select name="sortBy" defaultValue={current('sortBy') || 'finalScore'} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
            <option value="finalScore">Final score</option>
            <option value="profitMarginPercentage">Margin</option>
            <option value="demandScore">Demand</option>
            <option value="riskScore">Risk</option>
            <option value="sellingPrice">Price</option>
          </select>
        </label>

        {NUMERIC_FILTERS.map((filter) => (
          <label key={filter.name} className="text-xs text-slate-600">
            {filter.label}
            <input
              type="number"
              step="any"
              name={filter.name}
              defaultValue={current(filter.name)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-4">
        <button type="submit" className="rounded bg-slate-900 px-4 py-1.5 text-sm text-white hover:bg-slate-700">
          Apply filters
        </button>
        <button type="button" onClick={() => router.push('/discovery')} className="text-sm text-slate-500 hover:text-slate-800">
          Reset
        </button>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" name="excludeSampleData" value="true" defaultChecked={current('excludeSampleData') === 'true'} />
          Hide SAMPLE (demo) data
        </label>
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" name="verifiedOnly" value="true" defaultChecked={current('verifiedOnly') === 'true'} />
          Verified opportunities only
        </label>
      </div>
    </form>
  );
}

# E-commerce Product Research & Discovery System — Phase 1 MVP

Ranks potential products to sell in India (INR) using transparent, configurable, data-driven scoring.
It produces a **ranked list with the evidence behind every number**, not raw scraped data.

> **Phase 1 scope.** Product database, source-adapter interface, one permitted data source, normalization,
> profit calculator, scoring engine, PostgreSQL persistence, dashboard, CSV export. Supplier module,
> AI/NLP review analysis, additional marketplace adapters and Excel export are deliberately **not** built yet.

---

## 1. Read this first: where the data comes from

Amazon India, Flipkart and Meesho all prohibit automated collection in their Terms of Service, and none
exposes an open product-search API. Amazon's Product Advertising API requires an approved Associates account;
Flipkart's affiliate API requires separate approval.

So Phase 1 ships exactly one source: **`ManualCsvAdapter`** — data a person looks up and records by hand
(or exports from a source they are licensed to use), fed through the same pipeline a future API-backed adapter
would use. **No component of this system sends a request to any marketplace.**

To add a real automated source later, implement `ProductSourceAdapter` against a permitted API and register it.
Nothing downstream changes. Do not add an adapter that scrapes a site whose terms forbid it, and never implement
CAPTCHA bypassing, anti-bot evasion or access-control circumvention — the adapter interface documents this contract.

**The seeded products are demo data.** 24 rows carrying `dataset_status = SAMPLE`, with `example.com` URLs, invented
so the pipeline can be run end to end before real research exists. They describe no real listing, are **never**
described as validated, profitable, best or recommended anywhere in the system, and are excluded from the Verified
Opportunities view by construction. Filter them out with `excludeSampleData=true`, or delete them once you have real data.

---

## 1a. Dataset status and score status

Two independent axes govern how much any row can be trusted.

**`dataset_status`** — how much trust the *data* has earned:

| Value | Meaning |
| --- | --- |
| `SAMPLE` | Demo/seed data. Describes no real listing. Never presented as a validated, profitable, best or recommended product. |
| `PROVISIONAL` | Real researched data that has not been independently re-checked. **Default for any import.** |
| `VERIFIED` | Confirmed against the live listing and a supplier quote. Requested by the researcher, then **granted only if it passes the verification gate** below. |

**`score_status`** — whether a Final Score could honestly be produced:

| Value | Meaning |
| --- | --- |
| `COMPLETE` | Every critical input present. A Final Score and A/B/C classification are issued. |
| `INCOMPLETE` | At least one critical input missing. **No Final Score, no classification.** Sub-scores are still computed and shown, and the missing fields are named on the record. |

The seven critical inputs: **selling price, product cost, marketplace, demand signal (review count *and* rating),
competition signal (comparable listing count), source (name + URL), collected-at timestamp**.

Why withhold the Final Score rather than compute a partial one: the renormalization that keeps partial scores fair
also makes them flattering. A product with no cost data and no competition data can score well on whatever signals
happen to exist — a false positive wearing a confident number. Transparency is not withheld, only the single figure
that reads as a verdict.

Every row also carries a `disclaimer` string generated in one place (`disclaimerFor()`) so the dashboard, the API and
the CSV export all state the same caveat. Its wording is asserted by tests.

### The verification gate

`VERIFIED` is the only status that asserts something about the real world, so it is not taken on trust. Every import
runs through `assessVerification()` (in `modules/scraping/verification.ts`), applied centrally at ingestion so no
current or future adapter can assert `VERIFIED` on its own say-so. A claim is granted only if **all** of these hold:

- product URL and `source_url` are real and traceable — `is_placeholder_url()` rejects reserved domains
  (`example.com`, `example-research.com`, `*.test`, `*.invalid`, `localhost`), demo/sample/staging hosts, and
  `/demo/`-style paths
- `source_name` attributes the record to a real origin — `seed_demo_data`, `manual_csv` (the adapter's own name),
  `demo assumption`, `unknown` and similar are all rejected
- `collected_at` is present and parseable
- at least one concrete product attribute (brand, description, weight, dimensions or features)
- an actual observed selling price
- where a product cost is claimed, an attributable supplier/quote behind it
- both demand evidence (review count *and* rating) and competition evidence (comparable listing count)

A failed claim is **downgraded to `PROVISIONAL`**, never rejected outright — the research is still useful, it just
stops claiming to have been verified. The reasons are stored on `products.verificationNotes`, reported in the import
run's `verificationDowngrades`, and shown on the product page.

`SAMPLE` is never promoted or demoted by the gate: demo data stays demo data.

**Known boundary:** placeholder tokens are matched per hyphen/dot-delimited label, so `fakeshop.com` reads as an
ordinary domain. Substring matching would wrongly reject `demolition.com` or `testament.in`. This is acceptable
because the URL is only one of seven checks — see `placeholder-url.spec.ts`, which documents it explicitly.

---

## 2. Architecture

```
┌──────────────┐   CSV upload    ┌─────────────┐   BullMQ job   ┌──────────────────┐
│  Researcher  │ ──────────────► │  NestJS API │ ─────────────► │ Ingestion worker │
└──────────────┘                 └─────────────┘   (Redis)      └────────┬─────────┘
                                        ▲                                │
                                        │                    parse → validate → dedupe
┌──────────────┐    REST/JSON           │                                │
│  Next.js UI  │ ───────────────────────┘                                ▼
└──────────────┘                                              ┌────────────────────┐
                                                              │    PostgreSQL      │
                                                              └─────────┬──────────┘
                                                                        │
                                            profitability ── scoring ───┘
                                          (fees from DB)   (weights from config/)
```

Data collection never runs inside an HTTP request — the API enqueues a job and returns a `runId` to poll.

### Folder structure

```
config/                          operator-editable, no code changes needed
  categories.json                add product categories here
  scoring-weights.json           every weight, threshold and penalty
  marketplace-fees.seed.json     fee assumptions with source + effective date
backend/
  src/
    common/interfaces/           ProductSourceAdapter, NormalizedProduct, enums
    config/                      config loading + validation
    database/
      entities/                  10 tables
      migrations/                generated TypeORM migrations
      seeds/                     demo data + seed runner
    modules/
      products/                  ranked list, detail, compare
      marketplaces/              marketplaces + fee schedules
      profitability/             pure calculator + fee resolution
      scoring/                   pure scoring functions + orchestration
      scraping/                  adapters, normalization, validation, ingestion queue
      analytics/                 dashboard summary + top opportunities with evidence
      export/                    CSV / JSON
frontend/
  app/                           dashboard, discovery, product detail, compare
  components/                    shared UI (incl. the "Data unavailable" renderer)
  lib/api.ts                     typed API client
```

---

## 3. Setup

**Prerequisites:** Node 20+, Docker (for PostgreSQL + Redis).

```bash
cp .env.example .env
docker compose up -d postgres redis
```

```bash
cd backend && npm install && npm run migration:run && npm run seed
```

```bash
cd backend && npm run start:dev
```

```bash
cd frontend && npm install && npm run dev
```

Dashboard: http://localhost:3000 — API: http://localhost:3001/api

Everything in Docker instead:

```bash
docker compose up --build
```

### Commands

```bash
cd backend && npm test          # 92 unit tests
cd backend && npm run typecheck && npm run lint
cd backend && npm run seed      # re-seed demo data (idempotent — re-running updates, never duplicates)
cd frontend && npm run build
```

---

## 3a. Data sources — what is actually accessible

Researched 2026-09-29. **Re-verify before relying on any of it**; availability and pricing move.

| Source | Provides | Access | Cost | Verdict |
| --- | --- | --- | --- | --- |
| **Amazon Creators API** (replaces PA-API) | product, price, images | Associates account + **10 qualifying sales/30 days**, OAuth2 | free | blocked unless you run an affiliate business |
| **Amazon SP-API** | catalog, competitive pricing, **real fee estimates** | Amazon.in **seller** account | free | best fit if you already sell on Amazon.in |
| **Keepa** | product + **price history**, offers, Buy Box; **amazon.in = domain 10** | paid signup, no sales gate | from €49/mo | most practical unblocked option |
| **Flipkart Affiliate API** | product search, prices | affiliate account + token | free | public sign-ups discontinued; several endpoints deprecating |
| **ONDC** | open catalog search across Indian sellers | Network Participant registration (GSTIN, KYC, bank) | free | genuinely open, India-specific, heavy onboarding |
| **Rainforest / Oxylabs / SerpApi** | Amazon product/search | card | $18–$83/mo | third-party collectors — **left unimplemented on purpose**, see below |
| **data.gov.in** | mandi prices, WPI | free key | free | no e-commerce product data |

**PA-API 5.0 is deprecated 2026-04-30 and retired 2026-05-15.** Do not build against it.

There is no free, open, permitted API for bulk Indian marketplace product research. The realistic routes are
**Keepa** (paid, unblocked) or **SP-API** (free, seller-only).

`config/data-sources.json` holds all of this as data. `npm run research:sources` prints it.

### Why third-party collectors are not implemented

Rainforest, Oxylabs and similar obtain marketplace data by automated collection. A contract with the provider
does not by itself make that collection permitted under the marketplace's own terms, and the resulting risk sits
with the operator. The entry exists in config with `adapter: null` and a note, so the choice is visible and
deliberate rather than accidental. **No CAPTCHA, login, robots, rate-limit or anti-bot control is circumvented
anywhere in this codebase.**

### Adding a source later

1. Add an entry to `config/data-sources.json` (or flip `enabled`).
2. Implement `ProductSourceAdapter` — `searchProducts`, `getProductDetails`, `getPricing`, `getReviews`,
   `getCategories`. Methods the source does not support must throw `UnsupportedOperationError`, never return
   fabricated or empty data.
3. Register the class name in `SourceRegistryService.implementedAdapters`.

Nothing in normalization, validation, profitability, demand, competition or scoring changes.

### When nothing is configured

`GET /api/data-sources` returns `state: NO_REAL_DATA_SOURCE_CONFIGURED` with the reason each candidate is
blocked. The dashboard and the CLI both render that banner rather than an empty screen.

---

## 3a-bis. Keepa integration (dry-run)

The Keepa adapter is implemented and **inert until a key exists**. With `KEEPA_API_KEY` unset it
makes no network request of any kind — the guarantee is the absence of the key, not a flag.

```bash
npm run research:keepa:status   # configured? key? adapter? DB? freshness? counts?
npm run research:keepa:test     # fixture -> map -> validate -> gate -> profitability, offline
```

### Activating Keepa later

1. **Subscribe** at keepa.com (Starter was €49/mo as of 2026-09-29) and copy the API key.
2. **Set the key** in `.env`:
   ```
   KEEPA_API_KEY=your_key_here
   ```
   Note the spelling — Latin `A`, not Cyrillic `А`.
3. **Enable the source** in `config/data-sources.json`: set `"enabled": true` on the `keepa` entry.
   A key alone is not enough; both switches are deliberate.
4. **Register the adapter** — add `'KeepaProductSourceAdapter'` to `implementedAdapters` in
   `source-registry.service.ts`.
5. **Confirm**: `npm run research:keepa:status` should report `CONFIGURED` and the source registry
   should leave `NO_REAL_DATA_SOURCE_CONFIGURED`.
6. **Wire a collection command.** `getProductDetails(asin)` works once configured; `searchProducts`
   is deliberately unimplemented because query strategy determines token spend and that is a budget
   decision, not a code decision.

### What Keepa can and cannot give you

| Field | Source | Origin |
| --- | --- | --- |
| ASIN, title, brand, images, categories | product object | OBSERVED |
| Buy Box / Amazon / marketplace New price | `stats.buyBoxPrice`, `stats.current[0]`, `[1]` | OBSERVED |
| MRP | `stats.current[4]` LISTPRICE | OBSERVED |
| rating, review count | `csv[16]` (0-50 scale), `csv[17]` | OBSERVED |
| sales rank + rank drops | `csv[3]`, `stats.salesRankDrops*` | OBSERVED |
| offer counts | `stats.current[11]`, `[12]` | OBSERVED |
| availability | `availabilityAmazon` code table | OBSERVED |
| weight, dimensions | `packageWeight` (g→kg), `package*` (mm→cm) | OBSERVED |
| price + rank history | `csv[0]`, `csv[3]` pairs | OBSERVED |
| `observed_price`, `discount_percentage` | chosen/derived from the above | CALCULATED |
| **supplier cost** | **not available — Keepa reports selling price only** | — |
| **units sold** | **not derived from rank; no documented model** | — |
| review text | not provided by Keepa | — |

**Consequence:** Keepa products arrive with `costs: null`, so profitability and the Final Score stay
withheld (`INCOMPLETE`) until a real supplier quote is supplied separately through the manual pipeline.
That is intended — an Amazon selling price is not a supplier cost.

**A Keepa product can never be VERIFIED.** `assessVerification()` refuses any record whose source is a
registered automated collector: a successful download is not a human checking a listing.

### Pilot mode

A controlled first run, so activation cannot turn into an unbudgeted spend.

```bash
npm run research:keepa:pilot                                    # estimate only, zero requests
npm run research:keepa:pilot -- --confirm-cost --asins=B0XXXXXXXX,B0YYYYYYYY
npm run research:keepa:pilot -- --confirm-cost --asin-file=./asins.txt --max=25
```

Two independent brakes:

1. **Preflight** — the key must exist, the `keepa` source must be enabled, and the adapter must be
   registered. All three, or nothing runs. Every blocker is reported, not just the first.
2. **`--confirm-cost`** — checked before any ASIN reaches the client. Without it the estimate prints
   and the run returns. Tests assert zero network calls on every path that lacks it.

`MAX_PRODUCTS` defaults to **10**, is read from the environment or `--max=`, and is **hard-capped at
100** in pilot mode. A value below 1 is raised to 1 rather than requesting nothing.

Before any request it prints products requested, estimated token cost, tokens available, and estimated
execution time. Afterwards: requested / received / rejected / duplicates / missing fields / tokens
consumed / tokens remaining / elapsed time.

Collected products are stored with `source_name=keepa`, the collection timestamp, and
`datasetStatus=UNVERIFIED`. Only OBSERVED values enter the provenance ledger — calculated figures are
reproducible from them and must not look like things Keepa reported.

### Token budget

Documented costs: 1 token per ASIN, +2 per product for Buy Box, 10 per search result page;
refill is per-minute and unused tokens expire after 60 minutes.

| Products | Plain | With Buy Box | Time at 20 tok/min (Starter) |
| ---: | ---: | ---: | --- |
| 100 | 100 | 300 | ~15 min |
| 500 | 500 | 1,500 | ~75 min |

A Starter bucket holds at most 1,200 tokens (20 × 60), so a 500-product pull **with Buy Box exceeds
one full bucket** and must be spread across roughly 75 minutes. The client budgets each request
against the bucket and waits rather than being throttled.

---

## 3b. CLI

```bash
npm run research:sources                                  # source registry + access facts
npm run research:validate -- --file=../my-research.csv    # dry run, writes nothing
npm run research:import   -- --file=../my-research.csv    # import + rescore
npm run research:import   -- --file=./data.json --source="indiamart quote" --no-rescore
```

Both report: records discovered / accepted / rejected / duplicates / missing critical fields / source /
collection timestamp, plus every rejection with its code and reason. Non-zero exit on any rejection, so it can
gate a pipeline.

---

## 3c. Real data ingestion

Real research goes through a **separate, stricter pipeline** from the demo seed. Its job is to keep
sample-shaped data out of the real dataset.

```bash
curl -X POST "http://localhost:3001/api/real-data/import?rescore=true" -F "file=@my-research.csv"
curl -X POST "http://localhost:3001/api/real-data/import?format=json" -H "Content-Type: application/json" -d @my-research.json
curl "http://localhost:3001/api/real-data/runs/<runId>"     # the import report
```

Dry run first — parses and validates, writes nothing:

```bash
curl -X POST http://localhost:3001/api/real-data/validate -F "file=@my-research.csv"
```

`GET /api/real-data/schema` returns the live contract.

### Required on every real record

`product_name`, `marketplace`, `product_url`, `observed_price`, `observed_at`, `source_url`, `source_name`.

### Accepted when available

`product_id`, `category`, `brand`, `description`, `rating`, `review_count`, `supplier_cost`, `shipping_cost`,
`packaging_cost`, `marketplace_fee`, `payment_fee`, `advertising_cost`, `return_allowance`, `other_costs`,
`cost_source_name`, `cost_source_url`, `product_weight`, `product_dimensions`, `demand_signal`,
`competition_signal`, `seller_count`, `best_seller_rank`, `search_term`, `mrp`, `currency`, `confidence_score`,
the risk flags, and `complaints` / `positives` / `opportunities`.

CSV and JSON are both accepted; JSON may be a bare array or `{ "records": [...] }`, and camelCase keys are
normalized. `product_dimensions` accepts `30x20x25`, `30 × 20 × 25 cm`, or `{lengthCm,widthCm,heightCm}`.

### What is rejected outright

| Code | Cause |
| --- | --- |
| `MISSING_REQUIRED_FIELD` | one of the seven required fields is absent |
| `PLACEHOLDER_URL` | `example.com`, `example-research.com`, `*.test`, `localhost`, demo/sample hosts or `/demo/` paths |
| `SEED_DATA_SOURCE` | `source_name` is `seed_demo_data`, or otherwise non-attributable (`manual_csv`, `demo assumption`, …) |
| `SAMPLE_STATUS_NOT_ALLOWED` | `dataset_status: SAMPLE` — reserved for seed data |
| `INVALID_VALUE` | non-positive price, non-INR currency, rating outside 0-5, future `observed_at`, … |
| `UNKNOWN_MARKETPLACE` / `UNKNOWN_CATEGORY` | not configured |
| `DUPLICATE_IN_FILE` | another record in the same submission describes the same product |
| `MALFORMED_RECORD` | a supplied value could not be parsed (never silently coerced) |

**Import never confers VERIFIED.** Records land as `UNVERIFIED`. A record may *request* VERIFIED
(`verification_requested: true`), and the existing verification gate then decides; a refused request is
reported in `verificationDowngrades` with its reasons.

### Seed isolation

Two mechanisms, both tested:
1. the validator rejects seed-sourced and SAMPLE-status submissions before they reach the database;
2. deduplication in the real pipeline **excludes SAMPLE rows from every lookup**, so a real record can never
   merge into a demo product — or overwrite one — even when the marketplace and normalized name match.

### Per-field provenance

`product_field_observations` is an append-only ledger: one row per supplied field per observation, storing the
raw value, the parsed numeric form, `source_name`, `source_url`, `observed_at`, confidence, and the import run.
It records the source and timestamp of fields that live as plain columns on `products` (weight, dimensions,
brand) and therefore have nowhere else to carry their own provenance.

### The import report

Returned by the import and stored on the run:

```
submitted, imported, created, updated, rejected,
duplicatesInFile, duplicatesMergedIntoExisting,
recordsMissingCriticalFields[],   // accepted, but no Final Score will be issued
rejections[],                     // { record, identifier, code, errors[] }
warnings[], verificationDowngrades[], startedAt, finishedAt
```

---

## 4. Importing demo/seed data

Export a CSV with the columns below and upload it. The seeded file
`backend/src/modules/scraping/fixtures/sample-products.demo.csv` is a working template.

```bash
curl -X POST "http://localhost:3001/api/scraping/import?rescore=true" -F "file=@my-research.csv"
# => { "runId": "...", "status": "pending" }
curl "http://localhost:3001/api/scraping/runs/<runId>"
```

Dry-run validation without writing anything:

```bash
curl -X POST http://localhost:3001/api/scraping/validate -F "file=@my-research.csv"
```

### CSV columns

Required: `name`, `url`, `marketplace`, `category`, `selling_price`, `source_url`.
Everything else is optional — **leave a cell blank when you did not collect it.** A blank becomes `NULL` and
is reported as "Data unavailable"; it is never silently treated as `0` or `false`.

| Column | Notes |
| --- | --- |
| `name`, `url`, `source_url` | `url` is normalized (lowercased host, tracking params stripped) for deduplication |
| `marketplace` | `amazon_in` \| `flipkart` \| `meesho` \| `own_store` (must exist in `marketplaces`) |
| `external_id` | ASIN/FSN/SKU where publicly shown — preferred dedupe key |
| `category` | slug from `config/categories.json`; an unknown slug is **rejected**, not invented |
| `selling_price`, `mrp` | `₹1,299` / `Rs. 899` / `1299` all parse; discount % is derived |
| `weight_kg`, `length_cm`, `width_cm`, `height_cm` | all three dimensions needed for the volumetric penalty |
| `review_count`, `average_rating`, `competitor_count`, `seller_count`, `best_seller_rank`, `search_term` | demand/competition signals |
| `product_cost`, `shipping_cost`, `packaging_cost`, `payment_fee`, `advertising_cost`, `return_allowance`, `other_costs` | INR per unit |
| `marketplace_fee_override` | absolute INR; overrides the fee table for this product |
| `cost_source`, `cost_source_url` | where the supplier quote came from |
| `fragile`, `brand_ip_risk`, `seasonal_demand`, `established_brand_dominance` | `yes`/`no`; **blank = not assessed**, which is not the same as `no` |
| `return_risk`, `regulatory_complexity` | `none` \| `low` \| `medium` \| `high` |
| `bundle_potential_score` | 0-100 manual override; falls back to the category baseline |
| `complaints`, `positives`, `opportunities` | pipe-separated, optional `:mentionCount` — e.g. `zipper breaks:150\|mesh tears` |
| `collected_at` | ISO timestamp of when you looked at the listing |
| `confidence_score` | 0-1, how much you trust the row |
| `dataset_status` | `SAMPLE` \| `PROVISIONAL` \| `VERIFIED`. Omitted → `PROVISIONAL` (legacy `is_sample_data=true` → `SAMPLE`) |
| `source_name` | **Required.** Who supplied this record, e.g. `manual_research_vivek`. Stored per value, not just per product |

**Deduplication** checks three keys in order, all scoped to one marketplace:
1. `external_id` (ASIN/FSN/SKU) — a published ID is authoritative
2. normalized URL — tracking params, fragment, `www.` and trailing slash removed
3. normalized name — lowercased, punctuation stripped, whitespace collapsed

Name matching is last and marketplace-scoped on purpose: two sellers on different marketplaces legitimately list the
same product name, and those must stay separate so cross-marketplace price comparison still works.
Re-importing an unchanged file updates products in place and adds **no** new price/metrics rows — history only
grows when an observed value actually changed.

---

## 5. Scoring — how every number is produced

All weights, thresholds and penalties live in `config/scoring-weights.json`. Edit that file and either restart
or `POST /api/scoring/config/reload`, then `POST /api/scoring/rescore`.

### Final score (0-100)

| Component | Weight | Formula |
| --- | ---: | --- |
| Demand | 25% | `0.7 × normalized(ln(reviews+1))` within the category cohort `+ 0.3 × (rating/5×100)` |
| Profitability | 20% | margin % scaled linearly from 0% (→0) to 50% (→100), clamped |
| Competition opportunity | 15% | `100 − normalized(competitor_count) − established_brand_penalty` |
| Differentiation | 15% | `min(opportunities_recorded × 20, 100)` |
| Shipping simplicity | 10% | `100 − weight_penalty − volumetric_penalty − fragile_penalty` |
| Customer pain opportunity | 5% | `min(complaints_recorded × 15, 100)` |
| Bundle / expansion | 10% | manual override, else configured category baseline |

**Competition direction is consistent everywhere: `competition_opportunity_score` of 100 = an attractive,
uncontested environment; 0 = extremely difficult.** There is deliberately no second "competition_score" that
would invert the meaning.

**Missing signals are excluded, not zeroed.** If a product has no cost data, the profitability component is
dropped and the remaining weights are renormalized to sum to 1. `data_completeness` reports how much of the
intended weight was actually backed by data — a 78 built on 55% of the signals is shown as such in the UI and
in every export.

**Cohort normalization:** products are ranked relative to others in their category. A category with fewer than
3 products falls back to the whole dataset, since a 1-2 product cohort carries no relative information. Where a
cohort has no spread at all, the value sits at the neutral midpoint (50) rather than 0 or 100.

### Risk score (0-100, higher = riskier)

Deliberately **not** blended into the final score, so a high-opportunity/high-risk product stays visible instead
of being averaged into the middle. Penalties: fragile, heavy/bulky, low margin, high competition, established
brands, return risk, regulatory complexity, brand/IP risk, seasonal demand. Every penalty applied is named in
`risk_reasons`.

### Classification

- **A — strong candidate:** final ≥ 70 **and** risk ≤ 40
- **B — needs validation:** final ≥ 50
- **C — weak:** final < 50, **or** risk ≥ 70 regardless of score

### Profitability

```
profit_per_unit = selling_price − (product + shipping + packaging + marketplace_fee
                                   + payment_fee + advertising + return_allowance + other)
profit_margin_% = profit_per_unit / selling_price × 100
roi_%           = profit_per_unit / estimated_landed_cost × 100
```

Marketplace fees are **never hardcoded**. They are resolved per marketplace + category from the `marketplace_fees`
table (latest `effective_date` not in the future; a category-specific row beats the `default` row), and each
applied fee is returned with its `source` and `effective_date`. Seeded values in
`config/marketplace-fees.seed.json` are **placeholders** — verify them against the marketplaces' current published
fee schedules before trusting any profit figure.

A result with no supplier cost is marked `isReliable: false` and surfaces as "Data unavailable" rather than as a
profit number.

---

## 6. API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/products` | ranked list; filters below |
| GET | `/api/products/:id` | full detail incl. score evidence and fee breakdown |
| GET | `/api/products/compare?ids=a,b,c` | up to 5 products |
| GET | `/api/products/categories` | configured categories |
| GET | `/api/analytics/summary` | dashboard headline numbers |
| GET | `/api/analytics/top-opportunities?limit=20` | ranked list with evidence-based "why" (all statuses, each carrying its disclaimer) |
| GET | `/api/analytics/verified-opportunities?limit=20` | **only** non-SAMPLE products with a COMPLETE score |
| GET | `/api/export/csv` · `/api/export/json` | export (same filters) |
| GET | `/api/marketplaces` · `/api/marketplaces/fees` | marketplaces and fee schedules in force |
| POST | `/api/scraping/import` | queue a CSV import |
| POST | `/api/scraping/validate` | validate a CSV without writing |
| GET | `/api/scraping/runs` · `/api/scraping/runs/:id` | run history, incl. per-row rejections |
| GET | `/api/scraping/sources` | what each source is permitted to do |
| GET | `/api/real-data/schema` | the real-data import contract |
| POST | `/api/real-data/import` | queue a real CSV/JSON submission |
| POST | `/api/real-data/validate` | dry run — parse and validate, write nothing |
| GET | `/api/real-data/runs/:id` | the import report |
| GET | `/api/scoring/config` | the weights currently in force |
| POST | `/api/scoring/config/reload` · `/api/scoring/rescore` | reload config / recompute scores |

Filters: `category`, `marketplace`, `priceMin/Max`, `marginMin`, `demandMin`, `competitionOpportunityMin`,
`differentiationMin`, `riskMax`, `scoreMin`, `classification`, `search`, `excludeSampleData`, `datasetStatus`
(comma-separated), `scoreStatus`, `verifiedOnly`, `sortBy`, `sortDirection`, `limit`, `offset`.

---

## 7. Data quality rules

Enforced in `validation.service.ts`; a failing row is **rejected and recorded** in the run's `rejections` list
with its line number — never silently repaired or dropped.

- price must be numeric and > 0; currency must be INR
- `source_name` required — every externally sourced value must name its source
- `dataset_status` must be one of SAMPLE / PROVISIONAL / VERIFIED
- product URL and source URL must be valid `http(s)`
- category must exist in `config/categories.json`
- `collected_at` required, must parse, must not be in the future
- rating within 0-5, review count non-negative, confidence within 0-1
- every review-derived observation must carry the URL it was read from
- duplicates collapse on the dedupe key rather than creating a second product

Warnings (accepted but logged): missing cost data, missing review data, missing competitor count, selling price
above MRP, and a row claiming `VERIFIED` on a confidence score below 0.8.

Separately from validation, the **critical-field check** decides `score_status` — a record can be perfectly valid
and still be INCOMPLETE, which is the normal case for partially-researched products.

---

## 8. What is deliberately not here

- **No AI/LLM anywhere in Phase 1.** Complaints, positives and differentiation opportunities are recorded by the
  person who read the reviews. The "why this product" text on the dashboard is assembled from stored values by
  string templating — no model writes it, so nothing can be invented.
- No supplier/B2B module, no competitor table, no raw review storage, no Excel export, no scheduled jobs.
  The queue and adapter interface are in place for these; the modules are not.
- No price history beyond what has actually been imported. Historical prices are never back-filled.

## 9. Dashboard views

| Page | What it shows |
| --- | --- |
| `/` Dashboard | **REAL VERIFIED PRODUCTS** metric, explicit SAMPLE / PROVISIONAL / VERIFIED counts, refused-claim count, plus ranked entries across **all** statuses — each labelled with its own disclaimer. Explicitly titled "not recommendations". |
| `/verified` **Verified Opportunities** | Only non-SAMPLE products with a COMPLETE score. Empty is a valid, informative answer — it is never padded. |
| `/discovery` | Full ranked table with dataset/score status filters. INCOMPLETE rows show "No score" and name their missing fields. |
| `/products/[id]` | Full evidence: score breakdown, profit calculator with the fee schedule applied, review observations, risk reasons, and a **Data Sources** table listing every externally sourced value with its source, timestamp and confidence. |
| `/compare` | Up to 5 products side by side. |

---

## 10. Honest limits

- Review count is an indirect popularity signal. It is **not** a sales figure and must not be read as one.
- Scores rank *opportunity given the signals collected*. They are not a prediction of profit. A high score means
  "worth validating with a small test order", never "this will make money".
- Scores are relative to what is in your database. Ten products in a category produce a different normalization
  than a hundred.
- Seeded fee rates are placeholders. Verify them before acting on any margin figure.

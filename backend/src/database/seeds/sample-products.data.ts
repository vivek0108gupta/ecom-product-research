/**
 * DEMO DATA — NOT REAL MARKET DATA.
 *
 * These rows exist so the pipeline (ingest → validate → score → rank → export) can be
 * run and tested end to end before any real research is entered. Every value here is
 * invented for that purpose, every URL points at example.com, and every row carries
 * dataset_status=SAMPLE so it is filterable and can never be mistaken for a real listing.
 *
 * Replace it: research real listings yourself and import them with the same CSV shape
 * (POST /api/scraping/import). Do not cite anything below as evidence about any market.
 *
 * Rows deliberately vary in completeness — some have no cost data, some no reviews —
 * to exercise the "Data unavailable" paths rather than only the happy case.
 */
export interface SampleRow {
  name: string;
  url: string;
  marketplace: string;
  external_id: string;
  brand: string;
  category: string;
  subcategory: string;
  description: string;
  features: string;
  variants: string;
  sizes: string;
  colors: string;
  image_urls: string;
  weight_kg: string;
  length_cm: string;
  width_cm: string;
  height_cm: string;
  selling_price: string;
  mrp: string;
  currency: string;
  review_count: string;
  average_rating: string;
  competitor_count: string;
  seller_count: string;
  best_seller_rank: string;
  search_term: string;
  product_cost: string;
  shipping_cost: string;
  packaging_cost: string;
  marketplace_fee_override: string;
  payment_fee: string;
  advertising_cost: string;
  return_allowance: string;
  other_costs: string;
  cost_source: string;
  cost_source_url: string;
  fragile: string;
  return_risk: string;
  regulatory_complexity: string;
  brand_ip_risk: string;
  seasonal_demand: string;
  established_brand_dominance: string;
  bundle_potential_score: string;
  complaints: string;
  positives: string;
  opportunities: string;
  source_url: string;
  collected_at: string;
  confidence_score: string;
  source_name: string;
  dataset_status: string;
  is_sample_data: string;
}

export const SAMPLE_CSV_COLUMNS: Array<keyof SampleRow> = [
  'name', 'url', 'marketplace', 'external_id', 'brand', 'category', 'subcategory', 'description',
  'features', 'variants', 'sizes', 'colors', 'image_urls', 'weight_kg', 'length_cm', 'width_cm',
  'height_cm', 'selling_price', 'mrp', 'currency', 'review_count', 'average_rating', 'competitor_count',
  'seller_count', 'best_seller_rank', 'search_term', 'product_cost', 'shipping_cost', 'packaging_cost',
  'marketplace_fee_override', 'payment_fee', 'advertising_cost', 'return_allowance', 'other_costs',
  'cost_source', 'cost_source_url', 'fragile', 'return_risk', 'regulatory_complexity', 'brand_ip_risk',
  'seasonal_demand', 'established_brand_dominance', 'bundle_potential_score', 'complaints', 'positives',
  'opportunities', 'source_url', 'collected_at', 'confidence_score', 'source_name', 'dataset_status',
  'is_sample_data',
];

const COLLECTED = '2026-09-20T10:00:00+05:30';

type PartialSampleRow = Partial<SampleRow> & Pick<SampleRow, 'name' | 'url' | 'marketplace' | 'category' | 'selling_price'>;

const row = (data: PartialSampleRow): SampleRow => {
  const base = Object.fromEntries(SAMPLE_CSV_COLUMNS.map((column) => [column, ''])) as unknown as SampleRow;
  return {
    ...base,
    currency: 'INR',
    cost_source: 'demo assumption',
    collected_at: COLLECTED,
    confidence_score: '0.5',
    source_name: 'seed_demo_data',
    // Every seeded row is SAMPLE. This is the mechanism that keeps demo rows out of the
    // Verified Opportunities view and forces the demo disclaimer everywhere they appear.
    dataset_status: 'SAMPLE',
    is_sample_data: 'true',
    ...data,
  };
};

export const SAMPLE_ROWS: SampleRow[] = [
  row({
    name: 'Collapsible Car Boot Organizer (3 Compartment)',
    url: 'https://example.com/demo/car-boot-organizer',
    marketplace: 'amazon_in', external_id: 'DEMOASIN001', brand: 'DemoBrand',
    category: 'car-accessories', subcategory: 'boot storage',
    description: 'Demo listing. Foldable boot organizer with three compartments.',
    features: 'Foldable|Non-slip base|Carry handles', colors: 'black|grey',
    weight_kg: '1.1', length_cm: '60', width_cm: '35', height_cm: '30',
    selling_price: '899', mrp: '1799', review_count: '2140', average_rating: '4.2',
    competitor_count: '48', seller_count: '6', best_seller_rank: '210', search_term: 'car boot organizer',
    product_cost: '320', shipping_cost: '70', packaging_cost: '25', advertising_cost: '90', return_allowance: '45',
    fragile: 'no', return_risk: 'low', regulatory_complexity: 'none', brand_ip_risk: 'no',
    seasonal_demand: 'no', established_brand_dominance: 'no',
    complaints: 'flimsy velcro:63|base collapses when loaded:41|smaller than expected:28',
    positives: 'good value:180|keeps boot tidy:140',
    opportunities: 'Use reinforced base board|Add clearer size diagram|Offer larger 4-compartment variant',
    source_url: 'https://example.com/demo/car-boot-organizer',
  }),
  row({
    name: 'Magnetic Car Phone Holder (Dashboard Mount)',
    url: 'https://example.com/demo/magnetic-phone-holder',
    marketplace: 'amazon_in', external_id: 'DEMOASIN002', brand: 'DemoTech',
    category: 'car-accessories', subcategory: 'phone mounts',
    description: 'Demo listing. Magnetic dashboard phone mount.',
    features: 'N52 magnets|360 rotation', colors: 'black',
    weight_kg: '0.12', length_cm: '10', width_cm: '8', height_cm: '6',
    selling_price: '499', mrp: '1299', review_count: '8600', average_rating: '3.9',
    competitor_count: '190', seller_count: '22', search_term: 'car phone holder magnetic',
    product_cost: '150', shipping_cost: '45', packaging_cost: '15', advertising_cost: '110', return_allowance: '35',
    fragile: 'no', return_risk: 'medium', regulatory_complexity: 'none', brand_ip_risk: 'no',
    seasonal_demand: 'no', established_brand_dominance: 'yes',
    complaints: 'magnet too weak:210|adhesive fails in heat:180|scratches dashboard:60',
    positives: 'compact:90|easy to fit:75',
    opportunities: 'Use heat-resistant adhesive pad',
    source_url: 'https://example.com/demo/magnetic-phone-holder',
  }),
  row({
    name: 'Bike Handlebar Phone Mount with Shock Pad',
    url: 'https://example.com/demo/bike-phone-mount',
    marketplace: 'flipkart', external_id: 'DEMOFSN003', brand: 'DemoRide',
    category: 'bike-accessories', subcategory: 'mounts',
    description: 'Demo listing. Handlebar mount with silicone shock absorber.',
    features: 'Shock pad|Tool-free fit', colors: 'black|red',
    weight_kg: '0.18', length_cm: '12', width_cm: '9', height_cm: '7',
    selling_price: '749', mrp: '1499', review_count: '930', average_rating: '4.0',
    competitor_count: '64', seller_count: '4', search_term: 'bike phone holder',
    product_cost: '230', shipping_cost: '55', packaging_cost: '18', advertising_cost: '85', return_allowance: '40',
    fragile: 'no', return_risk: 'medium', regulatory_complexity: 'none', brand_ip_risk: 'no',
    seasonal_demand: 'no', established_brand_dominance: 'no',
    complaints: 'clamp cracks over time:44|vibration blurs camera:31',
    positives: 'secure grip:70|fits thick bars:35',
    opportunities: 'Switch clamp to glass-filled nylon|Bundle with rain cover',
    source_url: 'https://example.com/demo/bike-phone-mount',
  }),
  row({
    name: 'Packing Cubes Set of 6 (Travel Organizer)',
    url: 'https://example.com/demo/packing-cubes',
    marketplace: 'amazon_in', external_id: 'DEMOASIN004', brand: 'DemoTravel',
    category: 'travel-accessories', subcategory: 'packing organizers',
    description: 'Demo listing. Six-piece packing cube set with mesh tops.',
    features: 'Set of 6|Mesh panels|Double zip', sizes: 'S|M|L', colors: 'navy|grey|maroon',
    weight_kg: '0.55', length_cm: '40', width_cm: '30', height_cm: '12',
    selling_price: '1099', mrp: '2499', review_count: '4300', average_rating: '4.3',
    competitor_count: '88', seller_count: '9', search_term: 'packing cubes',
    product_cost: '310', shipping_cost: '60', packaging_cost: '22', advertising_cost: '120', return_allowance: '50',
    fragile: 'no', return_risk: 'low', regulatory_complexity: 'none', brand_ip_risk: 'no',
    seasonal_demand: 'yes', established_brand_dominance: 'no',
    complaints: 'zipper pulls break:150|mesh tears:95|fabric thin:80',
    positives: 'light:200|good sizing:130|value pack:110',
    opportunities: 'Upgrade to metal zip pulls|Offer compression variant|Add laundry pouch to set',
    source_url: 'https://example.com/demo/packing-cubes',
  }),
  row({
    name: 'Hanging Toiletry Bag (Water Resistant)',
    url: 'https://example.com/demo/toiletry-bag',
    marketplace: 'meesho', external_id: 'DEMOMSH005', brand: 'DemoTravel',
    category: 'travel-accessories', subcategory: 'toiletry bags',
    description: 'Demo listing. Hanging toiletry organizer.',
    features: 'Hook hanger|Wipe-clean lining', colors: 'black|olive',
    weight_kg: '0.35', length_cm: '28', width_cm: '20', height_cm: '10',
    selling_price: '649', mrp: '1299', review_count: '760', average_rating: '3.8',
    competitor_count: '120', seller_count: '15', search_term: 'hanging toiletry bag',
    product_cost: '210', shipping_cost: '55', packaging_cost: '18', advertising_cost: '70', return_allowance: '35',
    fragile: 'no', return_risk: 'medium', regulatory_complexity: 'none', brand_ip_risk: 'no',
    seasonal_demand: 'no', established_brand_dominance: 'no',
    complaints: 'hook snaps:58|not actually waterproof:49|smell on arrival:22',
    positives: 'roomy:60|folds flat:40',
    opportunities: 'Use metal swivel hook|State water-resistant not waterproof',
    source_url: 'https://example.com/demo/toiletry-bag',
  }),
  row({
    name: 'Under-Sink Pull Out Storage Rack (2 Tier)',
    url: 'https://example.com/demo/under-sink-rack',
    marketplace: 'amazon_in', external_id: 'DEMOASIN006', brand: 'DemoHome',
    category: 'kitchen-organization', subcategory: 'sink storage',
    description: 'Demo listing. Two-tier sliding rack for under-sink cabinets.',
    features: '2 tier|Sliding drawers|Rust coated',
    weight_kg: '2.4', length_cm: '45', width_cm: '32', height_cm: '35',
    selling_price: '1499', mrp: '2999', review_count: '1580', average_rating: '4.1',
    competitor_count: '52', seller_count: '5', search_term: 'under sink organizer',
    product_cost: '560', shipping_cost: '130', packaging_cost: '35', advertising_cost: '140', return_allowance: '75',
    fragile: 'no', return_risk: 'medium', regulatory_complexity: 'none', brand_ip_risk: 'no',
    seasonal_demand: 'no', established_brand_dominance: 'no',
    complaints: 'rusts within months:90|assembly instructions unclear:70|does not fit around pipes:55',
    positives: 'sturdy:85|doubles usable space:60',
    opportunities: 'Use powder-coated steel|Ship a pictorial assembly guide|Offer adjustable pipe cutout',
    source_url: 'https://example.com/demo/under-sink-rack',
  }),
  row({
    name: 'Stackable Fridge Storage Bins (Set of 4)',
    url: 'https://example.com/demo/fridge-bins',
    marketplace: 'flipkart', external_id: 'DEMOFSN007', brand: 'DemoHome',
    category: 'kitchen-organization', subcategory: 'fridge storage',
    description: 'Demo listing. Clear stackable fridge bins.',
    features: 'Stackable|BPA-free|Set of 4', colors: 'clear',
    weight_kg: '0.9', length_cm: '32', width_cm: '16', height_cm: '10',
    selling_price: '799', mrp: '1599', review_count: '640', average_rating: '4.0',
    competitor_count: '75', seller_count: '8', search_term: 'fridge organizer bins',
    product_cost: '260', shipping_cost: '80', packaging_cost: '25', advertising_cost: '80', return_allowance: '40',
    fragile: 'yes', return_risk: 'medium', regulatory_complexity: 'low', brand_ip_risk: 'no',
    seasonal_demand: 'no', established_brand_dominance: 'no',
    complaints: 'cracks in cold:62|arrives broken:48',
    positives: 'clear view:55|easy clean:40',
    opportunities: 'Switch to PET with cold rating|Improve corner packaging',
    source_url: 'https://example.com/demo/fridge-bins',
  }),
  row({
    name: 'Over-Door Hanging Closet Organizer (8 Pocket)',
    url: 'https://example.com/demo/closet-organizer',
    marketplace: 'amazon_in', external_id: 'DEMOASIN008', brand: 'DemoHome',
    category: 'home-organization', subcategory: 'closet storage',
    description: 'Demo listing. Eight-pocket over-door organizer.',
    features: '8 pockets|Over-door hooks', colors: 'grey|beige',
    weight_kg: '0.7', length_cm: '30', width_cm: '25', height_cm: '8',
    selling_price: '699', mrp: '1499', review_count: '1120', average_rating: '4.2',
    competitor_count: '95', seller_count: '11', search_term: 'hanging closet organizer',
    product_cost: '240', shipping_cost: '60', packaging_cost: '20', advertising_cost: '75', return_allowance: '35',
    fragile: 'no', return_risk: 'low', regulatory_complexity: 'none', brand_ip_risk: 'no',
    seasonal_demand: 'no', established_brand_dominance: 'no',
    complaints: 'stitching comes loose:70|hooks bend:45|sags when full:38',
    positives: 'saves space:95|good fabric:50',
    opportunities: 'Double-stitch pocket seams|Supply steel hooks',
    source_url: 'https://example.com/demo/closet-organizer',
  }),
  row({
    name: 'Vacuum Storage Bags (Set of 8 with Pump)',
    url: 'https://example.com/demo/vacuum-bags',
    marketplace: 'amazon_in', external_id: 'DEMOASIN009', brand: 'DemoStore',
    category: 'storage-products', subcategory: 'vacuum bags',
    description: 'Demo listing. Vacuum compression bags with hand pump.',
    features: 'Set of 8|Hand pump included', sizes: 'M|L|XL',
    weight_kg: '1.2', length_cm: '35', width_cm: '25', height_cm: '10',
    selling_price: '999', mrp: '2499', review_count: '3200', average_rating: '3.7',
    competitor_count: '140', seller_count: '18', search_term: 'vacuum storage bags',
    product_cost: '330', shipping_cost: '75', packaging_cost: '25', advertising_cost: '130', return_allowance: '70',
    fragile: 'no', return_risk: 'high', regulatory_complexity: 'none', brand_ip_risk: 'no',
    seasonal_demand: 'no', established_brand_dominance: 'no',
    complaints: 'loses seal in days:280|valve leaks:190|pump breaks:120|bags tear:85',
    positives: 'huge space saving:140',
    opportunities: 'Use double-zip seal|Include spare valves|Ship an electric pump variant',
    source_url: 'https://example.com/demo/vacuum-bags',
  }),
  row({
    name: 'Desk Cable Management Tray (Under-Desk Clamp)',
    url: 'https://example.com/demo/cable-tray',
    marketplace: 'amazon_in', external_id: 'DEMOASIN010', brand: 'DemoDesk',
    category: 'desk-office-organization', subcategory: 'cable management',
    description: 'Demo listing. Under-desk cable tray, clamp fit, no drilling.',
    features: 'No drilling|Steel mesh', colors: 'black|white',
    weight_kg: '1.6', length_cm: '42', width_cm: '12', height_cm: '10',
    selling_price: '1299', mrp: '2299', review_count: '410', average_rating: '4.5',
    competitor_count: '22', seller_count: '3', search_term: 'under desk cable tray',
    product_cost: '430', shipping_cost: '95', packaging_cost: '28', advertising_cost: '95', return_allowance: '50',
    fragile: 'no', return_risk: 'low', regulatory_complexity: 'none', brand_ip_risk: 'no',
    seasonal_demand: 'no', established_brand_dominance: 'no',
    complaints: 'clamp marks the desk:26|too short for wide desks:19',
    positives: 'solid build:60|genuinely no drilling:45|tidy result:38',
    opportunities: 'Include felt clamp pads|Offer 60cm long variant|Bundle with velcro ties',
    source_url: 'https://example.com/demo/cable-tray',
  }),
  row({
    name: 'Monitor Stand Riser with Drawer',
    url: 'https://example.com/demo/monitor-riser',
    marketplace: 'flipkart', external_id: 'DEMOFSN011', brand: 'DemoDesk',
    category: 'desk-office-organization', subcategory: 'monitor stands',
    description: 'Demo listing. Wooden monitor riser with storage drawer.',
    features: 'Drawer|Anti-slip pads',
    weight_kg: '3.2', length_cm: '52', width_cm: '24', height_cm: '12',
    selling_price: '1899', mrp: '3499', review_count: '280', average_rating: '4.1',
    competitor_count: '40', seller_count: '6', search_term: 'monitor stand riser',
    product_cost: '780', shipping_cost: '180', packaging_cost: '45', advertising_cost: '120', return_allowance: '95',
    fragile: 'yes', return_risk: 'high', regulatory_complexity: 'none', brand_ip_risk: 'no',
    seasonal_demand: 'no', established_brand_dominance: 'no',
    complaints: 'arrives chipped:40|drawer sticks:25|wobbles:18',
    positives: 'looks premium:35',
    opportunities: 'Add corner protectors to packaging|Use soft-close drawer rails',
    source_url: 'https://example.com/demo/monitor-riser',
  }),
  row({
    name: 'Laptop Stand Adjustable Aluminium',
    url: 'https://example.com/demo/laptop-stand',
    marketplace: 'amazon_in', external_id: 'DEMOASIN012', brand: 'DemoTech',
    category: 'laptop-accessories', subcategory: 'stands',
    description: 'Demo listing. Adjustable aluminium laptop stand.',
    features: 'Aluminium|6 height levels|Foldable', colors: 'silver|space grey',
    weight_kg: '0.85', length_cm: '26', width_cm: '22', height_cm: '4',
    selling_price: '1599', mrp: '2999', review_count: '5200', average_rating: '4.4',
    competitor_count: '165', seller_count: '20', search_term: 'laptop stand',
    product_cost: '620', shipping_cost: '85', packaging_cost: '30', advertising_cost: '160', return_allowance: '60',
    fragile: 'no', return_risk: 'low', regulatory_complexity: 'none', brand_ip_risk: 'yes',
    seasonal_demand: 'no', established_brand_dominance: 'yes',
    complaints: 'hinge loosens:120|scratches laptop base:75',
    positives: 'sturdy:210|good cooling:120|premium finish:90',
    opportunities: 'Add silicone contact pads',
    source_url: 'https://example.com/demo/laptop-stand',
  }),
  row({
    name: 'Laptop Sleeve 14 inch Water Resistant',
    url: 'https://example.com/demo/laptop-sleeve',
    marketplace: 'meesho', external_id: 'DEMOMSH013', brand: 'DemoCarry',
    category: 'laptop-accessories', subcategory: 'sleeves',
    description: 'Demo listing. Padded 14-inch laptop sleeve.',
    features: 'Padded|Water resistant', sizes: '13|14|15.6', colors: 'black|grey|blue',
    weight_kg: '0.3', length_cm: '36', width_cm: '26', height_cm: '3',
    selling_price: '449', mrp: '999', review_count: '1850', average_rating: '3.9',
    competitor_count: '210', seller_count: '35', search_term: 'laptop sleeve 14 inch',
    product_cost: '180', shipping_cost: '50', packaging_cost: '15', advertising_cost: '65', return_allowance: '30',
    fragile: 'no', return_risk: 'medium', regulatory_complexity: 'none', brand_ip_risk: 'no',
    seasonal_demand: 'no', established_brand_dominance: 'yes',
    complaints: 'thin padding:140|zip jams:90|sizing runs small:70',
    positives: 'cheap:120|looks fine:60',
    opportunities: 'Thicker foam layer|Publish exact internal dimensions',
    source_url: 'https://example.com/demo/laptop-sleeve',
  }),
  row({
    name: 'Resistance Bands Set (5 Levels with Door Anchor)',
    url: 'https://example.com/demo/resistance-bands',
    marketplace: 'amazon_in', external_id: 'DEMOASIN014', brand: 'DemoFit',
    category: 'fitness-accessories', subcategory: 'resistance training',
    description: 'Demo listing. Five-level resistance band set.',
    features: '5 levels|Door anchor|Carry bag', colors: 'multi',
    weight_kg: '0.65', length_cm: '25', width_cm: '18', height_cm: '9',
    selling_price: '899', mrp: '1999', review_count: '6100', average_rating: '4.1',
    competitor_count: '230', seller_count: '28', search_term: 'resistance bands set',
    product_cost: '270', shipping_cost: '60', packaging_cost: '20', advertising_cost: '150', return_allowance: '55',
    fragile: 'no', return_risk: 'medium', regulatory_complexity: 'none', brand_ip_risk: 'no',
    seasonal_demand: 'yes', established_brand_dominance: 'yes',
    complaints: 'band snapped during use:260|latex smell:130|handles tear:95',
    positives: 'good range:180|compact:110',
    opportunities: 'Move to layered latex with safety sleeve|Add printed workout guide',
    source_url: 'https://example.com/demo/resistance-bands',
  }),
  row({
    name: 'Yoga Mat 6mm Anti-Slip with Strap',
    url: 'https://example.com/demo/yoga-mat',
    marketplace: 'flipkart', external_id: 'DEMOFSN015', brand: 'DemoFit',
    category: 'fitness-accessories', subcategory: 'mats',
    description: 'Demo listing. 6mm TPE yoga mat with carry strap.',
    features: '6mm|Anti-slip|Carry strap', colors: 'purple|teal|black',
    weight_kg: '1.4', length_cm: '61', width_cm: '15', height_cm: '15',
    selling_price: '1199', mrp: '2299', review_count: '2900', average_rating: '4.0',
    competitor_count: '180', seller_count: '24', search_term: 'yoga mat 6mm',
    product_cost: '430', shipping_cost: '110', packaging_cost: '30', advertising_cost: '130', return_allowance: '65',
    fragile: 'no', return_risk: 'medium', regulatory_complexity: 'none', brand_ip_risk: 'no',
    seasonal_demand: 'yes', established_brand_dominance: 'yes',
    complaints: 'slips on tile:150|flakes after weeks:110|strong odour:90',
    positives: 'good cushioning:140',
    opportunities: 'Use textured TPE surface|Pre-air mats before packing',
    source_url: 'https://example.com/demo/yoga-mat',
  }),
  row({
    name: 'Pet Grooming Glove (Deshedding, Pair)',
    url: 'https://example.com/demo/pet-grooming-glove',
    marketplace: 'amazon_in', external_id: 'DEMOASIN016', brand: 'DemoPet',
    category: 'pet-accessories', subcategory: 'grooming',
    description: 'Demo listing. Deshedding grooming gloves, pair.',
    features: 'Pair|Silicone tips|Washable', colors: 'blue',
    weight_kg: '0.22', length_cm: '24', width_cm: '18', height_cm: '4',
    selling_price: '549', mrp: '1199', review_count: '1420', average_rating: '4.0',
    competitor_count: '70', seller_count: '9', search_term: 'pet grooming glove',
    product_cost: '165', shipping_cost: '50', packaging_cost: '16', advertising_cost: '70', return_allowance: '30',
    fragile: 'no', return_risk: 'low', regulatory_complexity: 'none', brand_ip_risk: 'no',
    seasonal_demand: 'no', established_brand_dominance: 'no',
    complaints: 'tips fall off:75|too large for small hands:50|hair sticks to glove:44',
    positives: 'pets tolerate it:95|easy cleanup:55',
    opportunities: 'Offer S/M/L sizing|Moulded one-piece tips|Bundle with hair roller',
    source_url: 'https://example.com/demo/pet-grooming-glove',
  }),
  row({
    name: 'Microfibre Cleaning Cloth Pack of 12',
    url: 'https://example.com/demo/microfibre-cloths',
    marketplace: 'meesho', external_id: 'DEMOMSH017', brand: 'DemoClean',
    category: 'cleaning-products', subcategory: 'cloths',
    description: 'Demo listing. Twelve-pack microfibre cloths.',
    features: 'Pack of 12|Lint free', colors: 'assorted',
    weight_kg: '0.4', length_cm: '25', width_cm: '20', height_cm: '8',
    selling_price: '399', mrp: '899', review_count: '2600', average_rating: '4.2',
    competitor_count: '260', seller_count: '40', search_term: 'microfibre cloth pack',
    product_cost: '140', shipping_cost: '45', packaging_cost: '14', advertising_cost: '55', return_allowance: '20',
    fragile: 'no', return_risk: 'low', regulatory_complexity: 'none', brand_ip_risk: 'no',
    seasonal_demand: 'no', established_brand_dominance: 'yes',
    complaints: 'thin after washing:130|leaves lint:95|colour bleeds:60',
    positives: 'cheap:170|absorbent:100',
    opportunities: 'Higher GSM cloth|Colour-fast dye',
    source_url: 'https://example.com/demo/microfibre-cloths',
  }),
  row({
    name: 'Spray Mop with Refillable Bottle',
    url: 'https://example.com/demo/spray-mop',
    marketplace: 'amazon_in', external_id: 'DEMOASIN018', brand: 'DemoClean',
    category: 'cleaning-products', subcategory: 'mops',
    description: 'Demo listing. Spray mop with refillable reservoir.',
    features: 'Refillable|Washable pad|360 swivel',
    weight_kg: '1.3', length_cm: '120', width_cm: '14', height_cm: '10',
    selling_price: '1399', mrp: '2699', review_count: '870', average_rating: '3.8',
    competitor_count: '85', seller_count: '12', search_term: 'spray mop',
    product_cost: '520', shipping_cost: '150', packaging_cost: '35', advertising_cost: '110', return_allowance: '80',
    fragile: 'no', return_risk: 'high', regulatory_complexity: 'none', brand_ip_risk: 'no',
    seasonal_demand: 'no', established_brand_dominance: 'no',
    complaints: 'trigger stops spraying:140|handle joint snaps:85|leaks at bottle:60',
    positives: 'convenient:70',
    opportunities: 'Upgrade pump mechanism|Metal reinforced handle joint|Sell replacement pads',
    source_url: 'https://example.com/demo/spray-mop',
  }),
  row({
    name: 'Garden Hose Nozzle 8 Pattern Metal',
    url: 'https://example.com/demo/hose-nozzle',
    marketplace: 'amazon_in', external_id: 'DEMOASIN019', brand: 'DemoGarden',
    category: 'gardening-accessories', subcategory: 'watering',
    description: 'Demo listing. Eight-pattern metal hose nozzle.',
    features: '8 patterns|Zinc alloy body',
    weight_kg: '0.38', length_cm: '18', width_cm: '9', height_cm: '6',
    selling_price: '749', mrp: '1499', review_count: '520', average_rating: '4.3',
    competitor_count: '45', seller_count: '7', search_term: 'garden hose nozzle',
    product_cost: '250', shipping_cost: '60', packaging_cost: '18', advertising_cost: '70', return_allowance: '35',
    fragile: 'no', return_risk: 'low', regulatory_complexity: 'none', brand_ip_risk: 'no',
    seasonal_demand: 'yes', established_brand_dominance: 'no',
    complaints: 'leaks at connector:48|stiff trigger:30',
    positives: 'solid metal:70|good spray range:45',
    opportunities: 'Include spare washers|Bundle with quick-connect set',
    source_url: 'https://example.com/demo/hose-nozzle',
  }),
  row({
    name: 'Baby Wardrobe Drawer Dividers (Set of 6)',
    url: 'https://example.com/demo/baby-drawer-dividers',
    marketplace: 'flipkart', external_id: 'DEMOFSN020', brand: 'DemoBaby',
    category: 'baby-organization', subcategory: 'drawer organizers',
    description: 'Demo listing. Six fabric drawer dividers for baby clothes.',
    features: 'Set of 6|Foldable|Washable', colors: 'grey|pink',
    weight_kg: '0.6', length_cm: '30', width_cm: '22', height_cm: '10',
    selling_price: '849', mrp: '1699', review_count: '340', average_rating: '4.4',
    competitor_count: '38', seller_count: '5', search_term: 'baby drawer organizer',
    product_cost: '280', shipping_cost: '65', packaging_cost: '20', advertising_cost: '75', return_allowance: '35',
    fragile: 'no', return_risk: 'low', regulatory_complexity: 'low', brand_ip_risk: 'no',
    seasonal_demand: 'no', established_brand_dominance: 'no',
    complaints: 'collapses without support board:30|sizes do not fit standard drawers:22',
    positives: 'soft fabric:45|neat finish:30',
    opportunities: 'Include rigid insert boards|Publish drawer fit guide|Offer nursery bundle',
    source_url: 'https://example.com/demo/baby-drawer-dividers',
  }),
  row({
    name: 'Corrugated Shipping Boxes 8x6x4 (Pack of 50)',
    url: 'https://example.com/demo/shipping-boxes',
    marketplace: 'amazon_in', external_id: 'DEMOASIN021', brand: 'DemoPack',
    category: 'sb-packaging', subcategory: 'boxes',
    description: 'Demo listing. Fifty-pack of 3-ply corrugated boxes.',
    features: '3 ply|Pack of 50', sizes: '8x6x4',
    weight_kg: '4.5', length_cm: '45', width_cm: '32', height_cm: '28',
    selling_price: '1249', mrp: '1999', review_count: '980', average_rating: '4.2',
    competitor_count: '110', seller_count: '16', search_term: 'corrugated boxes pack',
    product_cost: '640', shipping_cost: '220', packaging_cost: '20', advertising_cost: '90', return_allowance: '40',
    fragile: 'no', return_risk: 'low', regulatory_complexity: 'none', brand_ip_risk: 'no',
    seasonal_demand: 'no', established_brand_dominance: 'no',
    complaints: 'boxes arrive crushed:85|thinner ply than stated:60',
    positives: 'good price per box:90|right size:55',
    opportunities: 'Strap and edge-protect the bundle|Print actual GSM on listing',
    source_url: 'https://example.com/demo/shipping-boxes',
  }),
  row({
    name: 'Bubble Wrap Roll 1m x 50m',
    url: 'https://example.com/demo/bubble-wrap',
    marketplace: 'flipkart', external_id: 'DEMOFSN022', brand: 'DemoPack',
    category: 'sb-packaging', subcategory: 'protective wrap',
    description: 'Demo listing. Large bubble wrap roll.',
    features: '1m wide|50m long',
    weight_kg: '6.8', length_cm: '100', width_cm: '35', height_cm: '35',
    selling_price: '1899', mrp: '2999', review_count: '410', average_rating: '4.0',
    competitor_count: '60', seller_count: '9', search_term: 'bubble wrap roll',
    product_cost: '980', shipping_cost: '380', packaging_cost: '25', advertising_cost: '80', return_allowance: '60',
    fragile: 'no', return_risk: 'medium', regulatory_complexity: 'none', brand_ip_risk: 'no',
    seasonal_demand: 'no', established_brand_dominance: 'no',
    complaints: 'bubbles already burst:70|roll shorter than stated:45',
    positives: 'good coverage:50',
    opportunities: 'Ship in protective outer sleeve|Independently verify roll length',
    source_url: 'https://example.com/demo/bubble-wrap',
  }),
  // --- Deliberately incomplete rows: these exercise the "Data unavailable" paths. ---
  row({
    name: 'Mobile Ring Holder Stand (Metal)',
    url: 'https://example.com/demo/ring-holder',
    marketplace: 'meesho', external_id: 'DEMOMSH023', brand: 'DemoTech',
    category: 'mobile-accessories', subcategory: 'holders',
    description: 'Demo listing with no cost data recorded yet.',
    weight_kg: '0.04', length_cm: '6', width_cm: '4', height_cm: '1',
    selling_price: '199', mrp: '499', review_count: '3100', average_rating: '3.6',
    competitor_count: '320', seller_count: '55', search_term: 'mobile ring holder',
    fragile: 'no', return_risk: 'low', regulatory_complexity: 'none', brand_ip_risk: 'no',
    seasonal_demand: 'no', established_brand_dominance: 'yes',
    complaints: 'adhesive fails:200|ring stiff:80',
    positives: 'cheap:90',
    opportunities: 'Use 3M-grade adhesive',
    source_url: 'https://example.com/demo/ring-holder',
  }),
  row({
    name: 'Bike Chain Lock Heavy Duty',
    url: 'https://example.com/demo/bike-chain-lock',
    marketplace: 'amazon_in', external_id: 'DEMOASIN024', brand: 'DemoRide',
    category: 'bike-accessories', subcategory: 'locks',
    description: 'Demo listing with no review data recorded yet.',
    weight_kg: '1.9', length_cm: '90', width_cm: '10', height_cm: '6',
    selling_price: '1099', mrp: '1899',
    competitor_count: '55', seller_count: '8', search_term: 'bike chain lock',
    product_cost: '430', shipping_cost: '120', packaging_cost: '25', advertising_cost: '85', return_allowance: '45',
    fragile: 'no', return_risk: 'low', regulatory_complexity: 'none', brand_ip_risk: 'no',
    seasonal_demand: 'no', established_brand_dominance: 'no',
    source_url: 'https://example.com/demo/bike-chain-lock',
  }),
];

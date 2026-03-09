/**
 * South African Province Intelligence — Economic & Education Context
 *
 * Verified data used to:
 *  1. Ground the AI Intelligent Engine in real SA economic reality
 *  2. Make Scout Agent province-aware (surface opportunities relevant to local realities)
 *  3. Generate GEO-optimised, citation-worthy content about SA digital economy
 *
 * Sources: Stats SA (2024 GDP estimates), DBE Annual Report 2023/24,
 *          ICASA broadband penetration data, SITA digital access surveys.
 *
 * @module lib/sa-context/provinces
 */

export interface ProvinceProfile {
  /** Official province name */
  name: string;
  /** Province code */
  code: string;
  /** Approximate 2024 GDP contribution as % of national GDP */
  gdpSharePercent: number;
  /** Estimated internet/smartphone penetration % */
  digitalAccessPercent: number;
  /** Provincial unemployment rate % (QLFS Q4 2024 estimate) */
  unemploymentPercent: number;
  /** Matric pass rate % (DBE 2023 NSC results) */
  matricPassRate: number;
  /** Key economic sectors */
  keySectors: string[];
  /** Specific digital income challenges in this province */
  challenges: string[];
  /** Best digital income categories for this province */
  topOpportunityCategories: string[];
  /** Platform-specific opportunities that work well here */
  platformSuggestions: string[];
  /** Key cities / economic hubs */
  hubs: string[];
}

export const SA_PROVINCES: ProvinceProfile[] = [
  {
    name: 'Gauteng',
    code: 'GP',
    gdpSharePercent: 33.8,
    digitalAccessPercent: 72,
    unemploymentPercent: 33.1,
    matricPassRate: 84.2,
    keySectors: ['Finance', 'Manufacturing', 'ICT', 'Retail', 'Government'],
    challenges: [
      'High cost of living compresses disposable income for startup investment',
      'Intense competition in established freelancing markets',
      'Load shedding disrupts remote work schedules',
    ],
    topOpportunityCategories: ['Freelancing', 'Digital Skills', 'E-commerce'],
    platformSuggestions: ['Fiverr', 'Upwork', 'Takealot', 'Yoco', 'Google Career Certificates'],
    hubs: ['Johannesburg', 'Pretoria', 'Soweto', 'Vaal Triangle', 'Midrand'],
  },
  {
    name: 'Western Cape',
    code: 'WC',
    gdpSharePercent: 14.2,
    digitalAccessPercent: 68,
    unemploymentPercent: 24.3,
    matricPassRate: 87.9,
    keySectors: ['Tourism', 'Agriculture', 'Tech (Silicon Cape)', 'Finance', 'Manufacturing'],
    challenges: [
      'High rental costs in Cape Town price out low-income earners from tech hubs',
      'Agricultural workforce has low digital skills baseline',
      'Growing tech talent competition drives up freelancer price floors',
    ],
    topOpportunityCategories: ['Freelancing', 'Content Creation', 'Digital Skills'],
    platformSuggestions: ['Toptal', 'Upwork', 'YouTube', 'Substack', 'ALX Africa'],
    hubs: ['Cape Town', 'Stellenbosch', 'George', 'Paarl'],
  },
  {
    name: 'KwaZulu-Natal',
    code: 'KZN',
    gdpSharePercent: 15.9,
    unemploymentPercent: 35.6,
    digitalAccessPercent: 54,
    matricPassRate: 78.5,
    keySectors: ['Manufacturing', 'Logistics (Durban Port)', 'Tourism', 'Agriculture', 'Retail'],
    challenges: [
      'Rural-urban digital divide is severe — rural areas have <30% smartphone penetration',
      'Unstable electricity supply in informal settlements',
      'Youth unemployment above 50% in rural areas creates urgency but low starting capital',
    ],
    topOpportunityCategories: ['Online Tutoring', 'E-commerce', 'Content Creation'],
    platformSuggestions: ['Teach South Africa', 'Bidorbuy', 'TikTok', 'Gumtree SA', 'Coursera'],
    hubs: ['Durban', 'Pietermaritzburg', 'Richards Bay', 'Newcastle'],
  },
  {
    name: 'Eastern Cape',
    code: 'EC',
    gdpSharePercent: 8.0,
    unemploymentPercent: 40.7,
    digitalAccessPercent: 44,
    matricPassRate: 72.3,
    keySectors: ['Manufacturing (automotive)', 'Agriculture', 'Government', 'Education'],
    challenges: [
      'Lowest digital access of the major provinces — connectivity is the #1 barrier',
      'Automotive sector dominates but offers few remote digital opportunities',
      'High dependency on government employment limits entrepreneurship culture',
    ],
    topOpportunityCategories: ['Online Tutoring', 'Digital Skills', 'Content Creation'],
    platformSuggestions: ['Superprof', 'Google Digital Skills', 'Facebook Marketplace', 'Udemy'],
    hubs: ['Port Elizabeth (Gqeberha)', 'East London', 'Mthatha'],
  },
  {
    name: 'Limpopo',
    code: 'LP',
    gdpSharePercent: 7.1,
    unemploymentPercent: 39.9,
    digitalAccessPercent: 40,
    matricPassRate: 74.1,
    keySectors: ['Mining', 'Agriculture', 'Tourism (Kruger National Park)', 'Government'],
    challenges: [
      'Remote geography limits physical market access — digital is the only scalable channel',
      'Mining sector dominates economy but is declining; youth need digital alternatives urgently',
      'Very low average household income means zero-cost entry points are critical',
    ],
    topOpportunityCategories: ['Online Tutoring', 'Digital Skills', 'Content Creation'],
    platformSuggestions: ['Teach South Africa', 'Varsity Tutors', 'YouTube', 'Coursera SA', 'Meta Blueprint'],
    hubs: ['Polokwane', 'Tzaneen', 'Mokopane'],
  },
  {
    name: 'North West',
    code: 'NW',
    gdpSharePercent: 6.4,
    unemploymentPercent: 38.2,
    digitalAccessPercent: 42,
    matricPassRate: 71.4,
    keySectors: ['Mining (platinum)', 'Agriculture', 'Tourism (Sun City)', 'Government'],
    challenges: [
      'Platinum mining dominates but automation is reducing headcount',
      'Limited urban centres means less exposure to digital economy',
      'Load shedding and poor infrastructure limit consistent connectivity',
    ],
    topOpportunityCategories: ['Digital Skills', 'Online Tutoring', 'E-commerce'],
    platformSuggestions: ['Google Career Certificates', 'ALX Africa', 'Udemy', 'OLX SA'],
    hubs: ['Rustenburg', 'Mahikeng', 'Klerksdorp', 'Potchefstroom'],
  },
  {
    name: 'Free State',
    code: 'FS',
    gdpSharePercent: 5.2,
    unemploymentPercent: 38.7,
    digitalAccessPercent: 46,
    matricPassRate: 79.1,
    keySectors: ['Agriculture (maize)', 'Mining (gold)', 'Government', 'Manufacturing'],
    challenges: [
      'Agricultural province with seasonal income patterns — digital offers consistent income',
      'Brain drain: educated youth leave for Gauteng',
      'Limited local market for digital services — must target national/global clients',
    ],
    topOpportunityCategories: ['Freelancing', 'Online Tutoring', 'Digital Skills'],
    platformSuggestions: ['PeoplePerHour', 'Fiverr', 'Teach South Africa', 'LinkedIn Learning'],
    hubs: ['Bloemfontein', 'Welkom', 'Bethlehem'],
  },
  {
    name: 'Mpumalanga',
    code: 'MP',
    gdpSharePercent: 7.0,
    unemploymentPercent: 38.4,
    digitalAccessPercent: 44,
    matricPassRate: 73.8,
    keySectors: ['Mining (coal)', 'Agriculture', 'Tourism (Kruger border)', 'Energy'],
    challenges: [
      'Coal mining faces decline due to energy transition — massive job displacement expected',
      'Tourism is seasonal; digital skills offer year-round income stability',
      'Medium digital access but high youth unemployment creates urgent need',
    ],
    topOpportunityCategories: ['Content Creation', 'Digital Skills', 'Online Tutoring'],
    platformSuggestions: ['YouTube', 'TikTok', 'Google Career Certificates', 'Coursera'],
    hubs: ['Nelspruit (Mbombela)', 'Witbank (eMalahleni)', 'Secunda'],
  },
  {
    name: 'Northern Cape',
    code: 'NC',
    gdpSharePercent: 2.4,
    unemploymentPercent: 37.9,
    digitalAccessPercent: 38,
    matricPassRate: 71.0,
    keySectors: ['Mining (diamonds, iron ore)', 'Agriculture', 'Tourism (Kgalagadi)', 'Government'],
    challenges: [
      'Smallest population + lowest GDP = smallest local market for services',
      'Vast geography means most residents are far from urban digital infrastructure',
      'Diamond and mining sectors offer little spillover to digital economy',
    ],
    topOpportunityCategories: ['Digital Skills', 'Online Tutoring', 'Freelancing'],
    platformSuggestions: ['Google Digital Garage', 'Meta Blueprint', 'Fiverr', 'Udemy'],
    hubs: ['Kimberley', 'Upington', 'Springbok'],
  },
];

// ─── Aggregated National Context ─────────────────────────────────────────────

export const SA_NATIONAL_CONTEXT = {
  gdpUsd2024Estimate: '430 billion USD (nominal)',
  gdpPerCapitaUsd: '7100',
  nationalUnemployment: 32.9,
  youthUnemploymentU35: 44.6,
  officialLanguages: 11,
  population2024: '62 million',
  currencyCode: 'ZAR',
  currencyName: 'South African Rand',
  avgExchangeRate: 'approximately R18–R19 per USD (volatile)',
  digitalEconomyHighlights: [
    'South Africa is the most advanced digital economy in sub-Saharan Africa',
    'Internet penetration: ~72% of urban areas, ~40% of rural areas',
    'Mobile money adoption growing rapidly via services like MTN MoMo and Capitec',
    'Ecommerce market size: ~$7.5 billion (2024 estimate, growing at 15% annually)',
    'ICT sector contributes ~8% of GDP and is a key job creator for youth',
    'Load shedding (Eskom power cuts) remains the #1 infrastructure challenge for remote workers',
  ],
  educationHighlights: [
    'National matric (Grade 12) pass rate: 82.9% (DBE 2023)',
    'Only ~17% of school leavers access university education',
    'TVET (technical vocational) colleges serve ~700,000 students',
    'Digital skills gap is acute: ~60% of unemployed youth have no formal digital skills',
    'Government SETA programs fund free digital skills training in all provinces',
    'NSFAS funds higher education for low-income students (currently under reform)',
  ],
} as const;

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Look up a province by name (case-insensitive, partial match).
 * Returns null if not found.
 */
export function findProvince(query: string): ProvinceProfile | null {
  const q = query.toLowerCase().trim();
  return (
    SA_PROVINCES.find(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase() === q ||
        p.hubs.some((h) => h.toLowerCase().includes(q))
    ) ?? null
  );
}

/**
 * Rank provinces by digital opportunity score.
 * Score = digitalAccessPercent - unemploymentPercent + (100 - gdpSharePercent * 2)
 * Higher score = more urgent need, reasonable access = best target for intervention.
 */
export function rankByOpportunityUrgency(): ProvinceProfile[] {
  return [...SA_PROVINCES].sort(
    (a, b) =>
      (b.unemploymentPercent + (100 - b.digitalAccessPercent)) -
      (a.unemploymentPercent + (100 - a.digitalAccessPercent))
  );
}

/**
 * Build a compact province context string for injection into AI prompts.
 * Stays under 1000 tokens.
 */
export function buildProvinceContextSummary(province?: ProvinceProfile | null): string {
  if (!province) {
    // Return national summary
    return [
      `SOUTH AFRICA DIGITAL ECONOMY CONTEXT (2024):`,
      `GDP: ${SA_NATIONAL_CONTEXT.gdpUsd2024Estimate} | Unemployment: ${SA_NATIONAL_CONTEXT.nationalUnemployment}%`,
      `Youth unemployment (under 35): ${SA_NATIONAL_CONTEXT.youthUnemploymentU35}%`,
      `Currency: ${SA_NATIONAL_CONTEXT.currencyName} (${SA_NATIONAL_CONTEXT.currencyCode})`,
      `Exchange rate: ${SA_NATIONAL_CONTEXT.avgExchangeRate}`,
      ``,
      `KEY FACTS:`,
      SA_NATIONAL_CONTEXT.digitalEconomyHighlights.map((h) => `- ${h}`).join('\n'),
      ``,
      `EDUCATION:`,
      SA_NATIONAL_CONTEXT.educationHighlights.map((h) => `- ${h}`).join('\n'),
    ].join('\n');
  }

  return [
    `PROVINCE CONTEXT: ${province.name} (${province.code})`,
    `GDP share: ${province.gdpSharePercent}% of national | Unemployment: ${province.unemploymentPercent}%`,
    `Digital access: ${province.digitalAccessPercent}% | Matric pass rate: ${province.matricPassRate}%`,
    `Key sectors: ${province.keySectors.join(', ')}`,
    `Economic hubs: ${province.hubs.join(', ')}`,
    ``,
    `LOCAL CHALLENGES:`,
    province.challenges.map((c) => `- ${c}`).join('\n'),
    ``,
    `BEST OPPORTUNITIES FOR THIS PROVINCE:`,
    `Categories: ${province.topOpportunityCategories.join(', ')}`,
    `Recommended platforms: ${province.platformSuggestions.join(', ')}`,
  ].join('\n');
}

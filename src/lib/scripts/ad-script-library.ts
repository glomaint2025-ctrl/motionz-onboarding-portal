/**
 * Motionz ad script library (self-filmed ads).
 *
 * Source of truth: the Google Doc "Motionz AI | Ad Scripts". The wording below is copied from that
 * document unchanged; only the placeholders were converted to template tokens:
 *   [Company Name] / [Company] / (company name) -> {{company_name}}
 *   [Name]                                      -> {{client_name}}
 *   [TESTIMONIAL]                               -> {{testimonial_name}}
 *
 * This file seeds the in-memory mock store and is mirrored by
 * supabase/migrations/20261004000001_ad_script_library.sql (a test keeps the two in sync).
 */

export type ScriptCategory = 'ai_video' | 'pain_point' | 'testimonials' | 'trustworthy' | 'bonus';

/** Self-filmed ad categories, in the order the client sees them. */
export type AdScriptCategory = Exclude<ScriptCategory, 'ai_video'>;

export const SELF_FILMED_CATEGORIES: AdScriptCategory[] = ['pain_point', 'testimonials', 'trustworthy', 'bonus'];

/** Every category. `ai_video` holds the educational scripts Motionz turns into AI videos. */
export const SCRIPT_CATEGORIES: ScriptCategory[] = ['ai_video', ...SELF_FILMED_CATEGORIES];

/** Categories the client must pick one script from when self-filming. Bonus is optional. */
export const REQUIRED_SCRIPT_CATEGORIES: AdScriptCategory[] = ['pain_point', 'testimonials', 'trustworthy'];

export const SCRIPT_CATEGORY_LABELS: Record<ScriptCategory, string> = {
  ai_video: 'AI Video (educational)',
  pain_point: 'Pain Point',
  testimonials: 'Testimonials',
  trustworthy: 'Trustworthy',
  bonus: 'Bonus',
};

export function isScriptCategory(value: unknown): value is ScriptCategory {
  return typeof value === 'string' && (SCRIPT_CATEGORIES as string[]).includes(value);
}

export function isAdScriptCategory(value: unknown): value is AdScriptCategory {
  return typeof value === 'string' && (SELF_FILMED_CATEGORIES as string[]).includes(value);
}

/** Rows with a missing or unknown category are treated as Bonus (the column default). */
export function normalizeScriptCategory(value: unknown): ScriptCategory {
  return isScriptCategory(value) ? value : 'bonus';
}

/** The client's chosen self-filmed scripts: one script id per category. */
export type SelectedScripts = Partial<Record<AdScriptCategory, string>>;

/**
 * Keeps only picks that still point at an existing script of the matching category, so a script
 * deleted or re-categorised by an admin never shows up as a stale choice.
 */
export function sanitizeSelectedScripts(
  raw: unknown,
  templates: { id: string; category?: string | null }[]
): SelectedScripts {
  const result: SelectedScripts = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const category of SELF_FILMED_CATEGORIES) {
    const id = (raw as Record<string, unknown>)[category];
    if (typeof id !== 'string') continue;
    if (templates.some((t) => t.id === id && normalizeScriptCategory(t.category) === category)) {
      result[category] = id;
    }
  }
  return result;
}

export interface AdScriptSeed {
  id: string;
  title: string;
  category: AdScriptCategory;
  sort_order: number;
  script_content: string;
}

/**
 * The 3 educational scripts seeded by migration 20260922000003. They stay in the library as the
 * `ai_video` category (migration 20261004000001 only sets their category).
 */
export const EDUCATIONAL_SCRIPT_IDS = [
  'c0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000002',
  'c0000000-0000-0000-0000-000000000003',
];

export const EDUCATIONAL_SCRIPT_TITLES = [
  'Script 1: Introduction and Brand Story',
  'Script 2: Service Offer and Customer Value',
  'Script 3: Call to Action and Inspection Booking',
];

const CATEGORY_NUMBER: Record<AdScriptCategory, number> = { pain_point: 1, testimonials: 2, trustworthy: 3, bonus: 4 };

function seed(category: AdScriptCategory, n: number, script_content: string): AdScriptSeed {
  const c = CATEGORY_NUMBER[category];
  return {
    // Deterministic UUID ending in CNN (C = category number, NN = script number).
    id: `ad5c0000-0000-4000-8000-000000000${c}${String(n).padStart(2, '0')}`,
    title: `${SCRIPT_CATEGORY_LABELS[category]} #${n}`,
    category,
    sort_order: c * 100 + n,
    script_content,
  };
}

export const AD_SCRIPT_LIBRARY: AdScriptSeed[] = [
  // ---------------------------------------------------------------- Pain Point
  seed(
    'pain_point',
    1,
    `Do you really need a new roof?
Or were you just scared into buying one?

The reality is: your roof may still be in good condition. The shingles aren’t necessarily worn out; they've just lost their protection.

When your roof is no longer protected, rain starts to infiltrate, the sun dries out the shingles, and over time, microcracks begin to form.

That’s the real problem.

With {{company_name}}, we don’t replace roofs — we protect them before it’s too late.

We apply a nano-protection treatment that creates a shield over your shingles, blocks water infiltration, and can extend the life of your roof by up to 15 years — all for a fraction of the cost of a full roof replacement.

If you want to protect your roof before it’s too late, submit the form below and we’ll contact you.`
  ),
  seed(
    'pain_point',
    2,
    `Over time, your asphalt shingles become porous. That means water starts to infiltrate, the sun dries out your shingles directly, and and weather cycles make your roof age up to 3x faster.

Nano Protection is a treatment applied directly to your roof. It penetrates the shingles and creates a protective barrier against the elements.

The results:
• Water beads off the surface
• UV rays are blocked
• Your roof stops aging prematurely

This can add 10 to 15 extra years of life to your roof — without replacing it.

And it costs only a fraction of the price of a brand-new roof.

If you want to protect your roof without overpaying, fill out the form below and our team will contact you.`
  ),
  seed(
    'pain_point',
    3,
    `There’s a big problem with your roof… you can’t actually see the damage.

There are no visible leaks, no lifted shingles, and everything looks fine — so you assume your roof is still in good condition.

Meanwhile, water is slowly penetrating your shingles millimeter by millimeter. Freeze-thaw cycles start doing their damage, mold begins forming in your attic, and one morning you wake up to a $10,000 to $20,000 roof replacement bill.

That’s why protecting your roof before it’s too late matters.

With Nano Protection, we apply a sealing treatment that protects your roof against rain, UV rays, and freeze-thaw cycles.

That’s exactly what we do at {{company_name}}.

Our treatment can add 10 to 15 extra years of life to your roof — guaranteed.

If you want to avoid invisible damage and save thousands of dollars, fill out the form below and our team will contact you.`
  ),
  seed(
    'pain_point',
    4,
    `The biggest problem with your roof is the damage you can’t see.

Most homeowners think their roof is fine because there are no leaks, no missing shingles, and nothing looks wrong from the ground.

But underneath the surface, your shingles could already be losing their protection. Every winter, freeze-thaw cycles expand and contract your roof materials, while the sun slowly breaks them down year after year.

The scary part? By the time the damage becomes obvious, you may already be facing an expensive repair or full roof replacement.

That’s why proactive roof protection matters.

Our Nano Protection treatment helps restore and protect aging shingles by creating a protective barrier against moisture, UV rays, and harsh weather conditions.

Instead of waiting for a problem to appear, protect your roof before the damage becomes costly.

If you want to find out if your roof qualifies for Nano Protection, fill out the form below and our team will reach out.`
  ),
  seed(
    'pain_point',
    5,
    `Most homeowners don’t realize their roof can be deteriorating before they ever notice a problem.

From the outside, everything can look perfect. No leaks, no missing shingles, and no obvious signs of damage.

But every day, your roof is exposed to harsh conditions. Rain, UV rays, temperature changes, and freeze-thaw cycles slowly weaken your shingles and reduce their ability to protect your home.

The worst part? Most homeowners only take action once the damage is already expensive.

Instead of waiting for leaks or a full roof replacement, protecting your roof early can help extend its lifespan and preserve your investment.

Our Nano Protection treatment helps strengthen and protect aging shingles by adding a protective barrier against moisture, UV damage, and everyday weather exposure.

Don’t wait until the problem is impossible to ignore.

Fill out the form below to see if your roof qualifies for Nano Protection, and our team will contact you.`
  ),

  // -------------------------------------------------------------- Testimonials
  seed(
    'testimonials',
    1,
    `Hey, this is {{client_name}} from {{company_name}}.

We’re currently at a client’s home who received a $16,000 quote to completely replace their shingle roof.

Instead of replacing everything, we were able to restore and rejuvenate the roof for nearly 4x less — while extending the life of the roof 2 to 3 times longer depending on the condition and aging of the shingles.

Our goal is simple: help homeowners save money by protecting their roof before it’s too late.

If you want to avoid invisible damage and save thousands of dollars, fill out the form below and our team will contact you.`
  ),
  seed(
    'testimonials',
    2,
    `Have you ever been quoted $10,000 or even $15,000 for a roof replacement just because someone said your shingles needed to be torn off?

The reality is: your roof may still be in good condition. The shingles aren’t necessarily worn out — they’ve just lost their protection.

When your roof is no longer protected, rain starts to infiltrate, the sun dries out the shingles, and over time, microcracks begin to form.

That’s the real problem.

With {{company_name}}, we don’t replace roofs — we protect them before it’s too late.

We apply a nano-protection treatment that creates a shield over your shingles, blocks water infiltration, and can extend the life of your roof by up to 15 years — all for a fraction of the cost of a full roof replacement.

If you want to protect your roof before it’s too late, submit the form below and we’ll contact you.`
  ),
  seed(
    'testimonials',
    3,
    `The first sign that your roof is starting to age is when you notice granules collecting in your gutters. Another sign we often see with our customers is that the shingles start to dry out.

When shingles dry out, they become less resistant to the elements. The wind can start lifting the shingles, they lose their water-repellent properties, and problems begin to develop.

So, if you want your roof to last for the next 15 years, make sure you protect it by applying nano technology with {{company_name}}.`
  ),
  seed(
    'testimonials',
    4,
    `I never thought my roof was aging until I started noticing the warning signs.

At first, everything looked normal. There were no leaks, no major damage, and no reason to think there was a problem.

But after years of exposure to sun, rain, and changing temperatures, the shingles started losing their strength. They became dry, less protective, and more vulnerable to the elements.

That’s when we decided to take action and protect the roof before bigger problems appeared.

With Nano Protection from {{company_name}}, we help restore and protect aging shingles by adding a protective barrier against moisture, UV rays, and harsh weather.

Instead of waiting until a roof replacement is needed, protect your roof while it still has life left.

If you want to see if your roof qualifies for Nano Protection, fill out the form below and our team will contact you.`
  ),
  seed(
    'testimonials',
    5,
    `I didn’t realize my roof was aging until I started seeing the early warning signs.

From the outside, everything seemed fine. No leaks, no visible damage, and no reason to believe my roof had any issues.

But over time, years of sun exposure, rain, snow, and temperature changes slowly started wearing down the shingles. They became more fragile and less effective at protecting my home.

That’s when I realized waiting for a major problem wasn’t the right approach.

With Nano Protection from {{company_name}}, we help homeowners protect their existing roof by adding an extra layer of defense against moisture, UV rays, and harsh weather conditions.

Instead of replacing a roof that still has years of life left, protect it before the damage gets worse.

Want to know if your roof qualifies for Nano Protection? Fill out the form below and our team will reach out.`
  ),

  // --------------------------------------------------------------- Trustworthy
  seed(
    'trustworthy',
    1,
    `We are the only company in the roofing industry that has received 6 offers from Dragons. What we do is install a protection system that protects your roof. It is made from bio-oil technology.

What we do is restore your roof to a like-new condition by cleaning it and rehydrating it, making it resistant to all weather conditions we experience here: freezing and thawing cycles, rain, wind, and all the elements that could end up costing you $20,000.

So, if you also want to avoid a costly roofing bill, call us today.`
  ),
  seed(
    'trustworthy',
    2,
    `Your asphalt shingles are porous, which means water can penetrate into them. The freeze-thaw cycles create micro-cracks, and the sun dries them out over time.

The best way to know if your roof is starting to age is by checking your gutters. If you find granules collecting in them, it’s a sign that your shingles are wearing down. Once those protective granules are gone, there is less protection for the asphalt underneath, and your roof starts aging much faster.

That’s why our customers trust us to protect their roofs with nano protection. You can add 10 to 15 years of life to your roof without replacing it.

The treatment helps repel water and protect against UV rays, which slows down the aging process of your roof.

So, if you want to protect your roof, click the link below.`
  ),
  seed(
    'trustworthy',
    3,
    `Most homeowners don’t realize their roof is aging long before they see a leak.

Over time, asphalt shingles lose their ability to protect your home because weather conditions slowly break them down. Rain, snow, freezing temperatures, and UV exposure all contribute to the deterioration process.

One simple thing to check is your gutters. If you notice a buildup of shingle granules, it could be a sign that your roof is losing its protective layer.

Instead of waiting until a full roof replacement is needed, many homeowners are choosing nano protection to help extend the life of their existing roof.

Our treatment helps create a protective barrier that improves water resistance and helps defend against UV damage — helping preserve your roof for years to come.

That’s why homeowners trust us to help protect one of their biggest investments.

Click the link below to see if your roof qualifies for nano protection.`
  ),
  seed(
    'trustworthy',
    4,
    `Your roof doesn’t fail overnight — it slowly loses its protection year after year.

Most homeowners wait until they notice a problem, but by then the damage has already started. Sun exposure, changing temperatures, rain, and harsh weather conditions can weaken your shingles and reduce the lifespan of your roof.

The good news? Replacing your roof isn’t always the only option.

Our nano protection treatment is designed to help preserve aging shingles by adding an extra layer of defense against moisture and UV exposure.

Thousands of dollars can be saved by protecting your roof before replacement becomes necessary.

We focus on giving homeowners a smarter way to maintain their roof and protect their investment for years to come.

Click below to find out if your roof is a good candidate for nano protection.`
  ),
  seed(
    'trustworthy',
    5,
    `Your roof doesn't suddenly fail it slowly loses its ability to protect your home over time.

The problem is most homeowners don't think about their roof until there's a visible issue. A leak appears, shingles start failing, or a costly replacement becomes the only option.

But long before that happens, your roof is already fighting against years of sun exposure, rain, snow, and extreme temperature changes that slowly break down the shingles.

The good news? A full roof replacement isn't always the first solution.

Our Nano Protection treatment is designed to help extend the life of aging shingles by adding an additional protective barrier against moisture, UV rays, and harsh weather conditions.

BONUS: Book this month and get a free full-roof inspection ($150 value) so you know exactly what your roof needs before you spend a dollar.

Click below to see if your roof is a good candidate for Nano Protection.`
  ),

  // --------------------------------------------------------------------- Bonus
  seed(
    'bonus',
    1,
    `Most homeowners don't notice their roof aging — until the day water shows up on the ceiling.

It's not one storm. It's thousands of small ones: a hot summer, a heavy snow load, years of UV exposure nobody thinks twice about. None of it looks urgent — until suddenly it does.

By the time a leak or missing shingles show up, the damage underneath has usually been building for years.

Here's what most people get wrong: they wait for a "big enough" problem to act, then panic and jump straight to a full tear-off and replacement — the most expensive option on the table.

Our Nano Protection treatment works with the shingles you already have — before you're stuck choosing between "ignore it" and "replace the whole roof."

BONUS: The first 15 homeowners who book this month get a free gutter and flashing check-up added to their appointment, at no extra cost.

Click below to check your roof's candidacy.`
  ),
  seed(
    'bonus',
    2,
    `There's a reason some 20-year-old roofs still look brand new, while some 8-year-old roofs are already failing — and it's usually not the shingle brand.

It's not always about how much homeowners spend. It's that somewhere along the way, they caught the wear while it was still reversible — instead of waiting until a contractor told them a full replacement was their only option.

Roofs don't fail all at once. There's an early-warning stage most homeowners never learn to recognize, let alone act on.

Our Nano Protection treatment is built specifically for that window — reinforcing your shingles' ability to resist moisture and UV damage before more invasive (and expensive) options become the only ones left.

BONUS: Every candidacy check includes a free roof-lifespan report — a breakdown of how many more years your current roof likely has left, treated vs. untreated.

Curious if your roof is still in the window? Click below to find out.`
  ),
  seed(
    'bonus',
    3,
    `I thought I'd have to replace the whole thing." That's what we hear most, right before a homeowner tries Nano Protection for the first time.

Most of our customers aren't dealing with a disaster. They're people who noticed a few curling shingles or a small stain on the ceiling — and assumed a full, expensive roof replacement was the only real fix.

They were wrong. Hundreds of homeowners in this area found that out the same way: by treating the early wear, instead of waiting until it became a full-blown emergency.

Our Nano Protection treatment has helped homeowners extend the life of their roof — without a tear-off, without a five-figure invoice, without the stress of a "last resort" fix.

BONUS: Mention this ad and we'll show you before-and-after results from a roof closest to your home's age and shingle type.

See why so many homeowners started here first. Click below.`
  ),
  seed(
    'bonus',
    4,
    `Here's something most roofing companies won't tell you: not every roof qualifies for early-intervention treatment — and that window doesn't stay open forever.

Once shingle wear passes a certain point, protective treatments like Nano Protection stop being effective, and a full, costly replacement becomes the only option left.

That's the part nobody warns you about. The earlier the wear is caught, the more options — and the less you'll pay — to protect it.

Right now, we're offering free roof assessments to determine whether your roof can still benefit from Nano Protection before that window closes.

BONUS: Everyone who completes an assessment this month locks in today's treatment pricing for a full 12 months, even if you decide to wait before starting.

This isn't a forever offer, and not every roof will qualify. Click below to find out if yours still does.`
  ),
  seed(
    'bonus',
    5,
    `We’ve seen it too often: homeowners get quoted $20,000 for a new roof and then wonder if they’re getting ripped off.

The reality? You might not need a new roof at all.

Since roof rejuvenation was introduced, homeowners like {{testimonial_name}} have saved up to $14,000 by rejuvenating their existing roof instead of replacing it.

Want to find out if your roof could qualify?

Click below, fill out the form, and our team will get in touch with you.`
  ),
];

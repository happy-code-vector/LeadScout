import "dotenv/config";
import { PrismaClient, Channel } from "@prisma/client";
import { DEFAULT_WEIGHTS } from "../lib/scoring/weights";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Categories — textQuery is what we send to Places Text Search; includedType
// must exist in Google's Places API (New) place types table (null = no exact
// type match, text search alone still works).
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { slug: "plumber", name: "Plumber", textQuery: "plumber", includedType: "plumber", propensity: 9 },
  { slug: "electrician", name: "Electrician", textQuery: "electrician", includedType: "electrician", propensity: 9 },
  { slug: "hvac-contractor", name: "HVAC contractor", textQuery: "HVAC contractor", includedType: "hvac_contractor", propensity: 9 },
  { slug: "roofing-contractor", name: "Roofing contractor", textQuery: "roofing contractor", includedType: "roofing_contractor", propensity: 9 },
  { slug: "general-contractor", name: "General contractor", textQuery: "general contractor", includedType: "general_contractor", propensity: 8 },
  { slug: "painter", name: "Painter", textQuery: "painter", includedType: "painter", propensity: 8 },
  { slug: "locksmith", name: "Locksmith", textQuery: "locksmith", includedType: "locksmith", propensity: 8 },
  // No exact Google place type for landscapers; text query carries it.
  { slug: "landscaper", name: "Landscaper", textQuery: "landscaper", includedType: null, propensity: 8 },
  // No exact Google place type for cleaning services.
  { slug: "cleaning-service", name: "Cleaning service", textQuery: "cleaning service", includedType: null, propensity: 8 },
  { slug: "auto-repair", name: "Auto repair", textQuery: "auto repair", includedType: "car_repair", propensity: 8 },
  { slug: "moving-company", name: "Moving company", textQuery: "moving company", includedType: "moving_company", propensity: 7 },
  { slug: "hair-salon-barber", name: "Hair salon / barber", textQuery: "hair salon barber", includedType: "hair_salon", propensity: 6 },
  { slug: "nail-salon", name: "Nail salon", textQuery: "nail salon", includedType: "nail_salon", propensity: 6 },
  { slug: "florist", name: "Florist", textQuery: "florist", includedType: "florist", propensity: 6 },
  { slug: "restaurant", name: "Restaurant", textQuery: "restaurant", includedType: "restaurant", propensity: 5 },
] as const;

// ---------------------------------------------------------------------------
// Areas — the five NYC boroughs (approximate bounding boxes).
// ---------------------------------------------------------------------------

const AREAS = [
  { name: "Manhattan", city: "New York", state: "NY", south: 40.6795, west: -74.0193, north: 40.8820, east: -73.9070 },
  { name: "Brooklyn", city: "New York", state: "NY", south: 40.5505, west: -74.0419, north: 40.7394, east: -73.8330 },
  { name: "Queens", city: "New York", state: "NY", south: 40.5418, west: -73.9626, north: 40.8007, east: -73.7003 },
  { name: "The Bronx", city: "New York", state: "NY", south: 40.7855, west: -73.9338, north: 40.9152, east: -73.7657 },
  { name: "Staten Island", city: "New York", state: "NY", south: 40.4774, west: -74.2591, north: 40.6516, east: -74.0520 },
] as const;

// ---------------------------------------------------------------------------
// Templates. Handlebars variables per spec:
// businessName, category, neighborhood, reviewCount, rating, topFinding,
// senderName, unsubscribeUrl, senderPostalAddress.
// Every email body carries the CAN-SPAM footer (sender + postal address +
// one-click unsubscribe).
// ---------------------------------------------------------------------------

const FOOTER = `
---
{{senderName}}
{{senderPostalAddress}}

Don't want these emails? Unsubscribe: {{unsubscribeUrl}}`;

type TemplateSeed = {
  key: string;
  name: string;
  channel: Channel;
  subject: string | null;
  body: string;
  variant: string | null;
};

const TEMPLATES: TemplateSeed[] = [
  {
    key: "no-website-1",
    name: "No website — intro",
    channel: "EMAIL",
    subject: "Website for {{businessName}}?",
    variant: "no-website",
    body: `Hi {{businessName}} team,

I'm {{senderName}}, a web designer based in New York. I noticed you don't seem to have a website — which surprises me for a business with {{reviewCount}} Google reviews.

Most people look you up online before they call. A simple site would give them your services, a few photos, and a click-to-call button.

Would you be open to a quick 15-minute call this week? I'll show you what I'd build for {{businessName}} and what it costs — no pressure either way.

Best,
{{senderName}}${FOOTER}`,
  },
  {
    key: "no-website-2",
    name: "No website — follow-up",
    channel: "EMAIL",
    subject: "Re: Website for {{businessName}}?",
    variant: "no-website",
    body: `Hi again,

Following up on my note from earlier this week. I build simple, fast websites for local {{category}} businesses — the kind that turn Google searches into phone calls.

If a website isn't a priority for {{businessName}} right now, no problem — a one-line reply saying so and I won't follow up again.

{{senderName}}${FOOTER}`,
  },
  {
    key: "no-website-3",
    name: "No website — final",
    channel: "EMAIL",
    subject: "Last note about a website for {{businessName}}",
    variant: "no-website",
    body: `Hi,

Last note from me, I promise. If you'd like a website for {{businessName}} — or even just a second opinion on what it would take — reply to this email and we'll set up 15 minutes.

Either way, good luck with the season ahead.

{{senderName}}${FOOTER}`,
  },
  {
    key: "outdated-1",
    name: "Outdated website — intro",
    channel: "EMAIL",
    subject: "Quick note about {{businessName}}'s website",
    variant: "outdated",
    body: `Hi {{businessName}} team,

I'm {{senderName}}, a web designer in New York. I was looking at your website and noticed {{topFinding}} — and since most customers now browse on their phones, that's likely costing you calls.

A modern rebuild usually pays for itself fast: quicker load, mobile-friendly layout, and a clear click-to-call button.

Want me to send over a quick mockup of what a refresh for {{businessName}} could look like? Reply and I'll put one together — free, no strings.

Best,
{{senderName}}${FOOTER}`,
  },
  {
    key: "outdated-2",
    name: "Outdated website — follow-up",
    channel: "EMAIL",
    subject: "Re: Quick note about {{businessName}}'s website",
    variant: "outdated",
    body: `Hi again,

Just bumping this in case it got buried. I'd love to show {{businessName}} what a refreshed website could look like — I can have a mockup to you in a couple of days.

If now's not the time, a one-line "not interested" works too and I'll close the file.

{{senderName}}${FOOTER}`,
  },
  {
    key: "outdated-3",
    name: "Outdated website — final",
    channel: "EMAIL",
    subject: "Closing the file on {{businessName}}'s website?",
    variant: "outdated",
    body: `Hi,

I'll assume a website refresh isn't a priority right now — closing the file for now. If that changes, this email will still reach me.

Good luck with the {{category}} work in {{neighborhood}}.

{{senderName}}${FOOTER}`,
  },
  {
    key: "postcard-default",
    name: "Postcard — default",
    channel: "POSTAL",
    subject: null,
    variant: "default",
    body: `FRONT:

{{businessName}} —
your customers are searching online.
{{topFinding}}

BACK:

Hi {{businessName}},

I'm {{senderName}}, a web designer in New York. I build simple, fast websites for {{category}} businesses in {{neighborhood}} — the kind that turn searches into calls.

It costs less than you'd think, and I do all the work myself.

Call or text me for a free 15-minute chat.

{{senderName}}
{{senderPostalAddress}}`,
  },
  {
    key: "call-script-none",
    name: "Call script — no website",
    channel: "PHONE",
    subject: null,
    variant: "none",
    body: `OPENER
"Hi, is this the owner of {{businessName}}? My name's {{senderName}} — I'm a local web designer. Do you have 30 seconds?"

REASON FOR THE CALL
"You don't seem to have a website, and I build simple sites for {{category}} businesses. With {{reviewCount}} Google reviews, you're clearly good at what you do — a website would catch the people who Google you before calling."

DISCOVERY QUESTIONS
1. "Where do most of your new customers come from these days?"
2. "Have you ever had a website, or thought about getting one?"
3. "If you had one, what would you want it to do — more calls, bookings, just credibility?"

CLOSE
"I'd love to show you what I mean. I do a free 15-minute call and I'll bring two or three ideas specific to {{businessName}}. Would tomorrow around 10 work?"

OBJECTIONS
- "Too expensive" — "Most of my sites for local businesses run a few hundred dollars plus a small monthly for hosting — usually less than one job's profit. I'll quote it flat before we start."
- "I get enough work from referrals" — "Referrals are great — a website makes them stronger. When someone's referred to you, they Google you first. A good site is what closes them."
- "Send me info" — "Happy to — what's the best email? I'll send a one-pager and a couple of example sites."`,
  },
  {
    key: "call-script-outdated",
    name: "Call script — outdated website",
    channel: "PHONE",
    subject: null,
    variant: "outdated",
    body: `OPENER
"Hi, is this the owner of {{businessName}}? My name's {{senderName}} — I'm a local web designer. Do you have 30 seconds?"

REASON FOR THE CALL
"I was looking at your website and noticed {{topFinding}}. I build modern sites for {{category}} businesses, and that's an easy fix — usually the difference between people bouncing and people calling."

DISCOVERY QUESTIONS
1. "When was the last time the site was updated?"
2. "Do you know how many people visit it, or call because of it?"
3. "If it were redesigned, what would you want it to do better?"

CLOSE
"I'd love to show you what I mean. I do a free 15-minute call and I'll bring two or three ideas specific to {{businessName}}. Would tomorrow around 10 work?"

OBJECTIONS
- "Too expensive" — "Most of my sites for local businesses run a few hundred dollars plus a small monthly for hosting — usually less than one job's profit. I'll quote it flat before we start."
- "I get enough work from referrals" — "Referrals are great — the website just backs them up. When someone's referred to you, they Google you first. A good site is what closes them."
- "Send me info" — "Happy to — what's the best email? I'll send a one-pager and a couple of example sites."`,
  },
];

// ---------------------------------------------------------------------------
// Sequences
// ---------------------------------------------------------------------------

const SEQUENCES = [
  {
    name: "No website — 3-step email",
    steps: [
      { order: 1, channel: "EMAIL" as Channel, delayDays: 0, templateKey: "no-website-1" },
      { order: 2, channel: "EMAIL" as Channel, delayDays: 4, templateKey: "no-website-2" },
      { order: 3, channel: "EMAIL" as Channel, delayDays: 9, templateKey: "no-website-3" },
    ],
  },
  {
    name: "Outdated website — 3-step email",
    steps: [
      { order: 1, channel: "EMAIL" as Channel, delayDays: 0, templateKey: "outdated-1" },
      { order: 2, channel: "EMAIL" as Channel, delayDays: 4, templateKey: "outdated-2" },
      { order: 3, channel: "EMAIL" as Channel, delayDays: 9, templateKey: "outdated-3" },
    ],
  },
];

async function main() {
  // Categories
  for (const c of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: {
        name: c.name,
        textQuery: c.textQuery,
        includedType: c.includedType,
        propensity: c.propensity,
      },
      create: { ...c },
    });
  }

  // Areas (no natural unique key; match on name+city+state)
  for (const a of AREAS) {
    const existing = await prisma.area.findFirst({
      where: { name: a.name, city: a.city, state: a.state },
    });
    if (!existing) {
      await prisma.area.create({ data: { ...a } });
    }
  }

  // Templates (match on name; body/subject refresh on re-seed)
  const templateIds = new Map<string, string>();
  for (const t of TEMPLATES) {
    const existing = await prisma.template.findFirst({ where: { name: t.name } });
    const data = {
      name: t.name,
      channel: t.channel,
      subject: t.subject,
      body: t.body,
      variant: t.variant,
    };
    const saved = existing
      ? await prisma.template.update({ where: { id: existing.id }, data })
      : await prisma.template.create({ data });
    templateIds.set(t.key, saved.id);
  }

  // Sequences with steps
  for (const s of SEQUENCES) {
    const existing = await prisma.sequence.findFirst({ where: { name: s.name } });
    const sequence = existing
      ? await prisma.sequence.update({ where: { id: existing.id }, data: { name: s.name } })
      : await prisma.sequence.create({ data: { name: s.name } });
    await prisma.sequenceStep.deleteMany({ where: { sequenceId: sequence.id } });
    for (const step of s.steps) {
      await prisma.sequenceStep.create({
        data: {
          sequenceId: sequence.id,
          order: step.order,
          channel: step.channel,
          delayDays: step.delayDays,
          templateId: templateIds.get(step.templateKey)!,
        },
      });
    }
  }

  // Settings singleton
  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      scoringWeights: DEFAULT_WEIGHTS,
      placesMonthlyRequestCap: 1000,
      auditConcurrency: 8,
    },
  });

  const [cats, areas, templates, sequences, settings] = await Promise.all([
    prisma.category.count(),
    prisma.area.count(),
    prisma.template.count(),
    prisma.sequence.count(),
    prisma.settings.count(),
  ]);
  console.log(
    `Seeded: ${cats} categories, ${areas} areas, ${templates} templates, ${sequences} sequences, ${settings} settings row.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/** All long-form public-site copy in one file. Brand facts come from Settings. */
export const CONTENT = {
  hero: {
    headline: "Your customers are searching. Is your website answering?",
    sub: "We build fast, modern websites for local businesses — the kind that turn a Google search into a phone call. Free site check below: see exactly what your current site is telling customers.",
    primaryCta: { label: "Check my site — free", href: "/audit" },
    secondaryCta: { label: "See the work", href: "/results" },
  },
  services: [
    { title: "New websites", body: "No site, or one you're embarrassed by? We design and build a complete site — your services, photos, and a click-to-call button — owned by you, not a platform.", bullets: ["Design, build, launch — one person, no handoffs", "Works perfectly on phones", "You own the domain and the site"] },
    { title: "Website rebuilds", body: "If your site is outdated, slow, or invisible on mobile, we rebuild it on a modern stack without losing what already works.", bullets: ["Modern, fast, mobile-first", "Keep your content and rankings", "Fixed price, quoted up front"] },
    { title: "Care & maintenance", body: "Sites that stay healthy: updates, backups, and small changes handled, so you can run your business.", bullets: ["Monthly updates and backups", "Small edits included", "One flat monthly rate"] },
  ],
  steps: [
    { title: "1 · Check", body: "Run the free site check. In about fifteen seconds you'll see what your site does well and what it's quietly getting wrong." },
    { title: "2 · Talk", body: "A free 15-minute call. We look at your results together and you get a straight answer on what's worth fixing." },
    { title: "3 · Build", body: "A fixed-price quote, a clear timeline, and a site you own. Most small-business sites launch within two weeks." },
  ],
  pricingTrust: "Simple fixed quote, agreed on a free call before any work starts. No surprises.",
  faq: [
    { q: "What's included?", a: "A custom-built website — design, build, launch — that works beautifully on phones, plus your own domain. We set up your contact form so customers can reach you any hour." },
    { q: "Who actually builds it?", a: "One person, start to finish — the same person you talk to on the call. No handoffs, no junior team." },
    { q: "How much does it cost?", a: "Every business is a little different, so we agree a simple fixed quote on a free 15-minute call before any work starts. No surprises after that." },
    { q: "What happens after I send my project request?", a: "We reply within one business day to set up a short call. You get an honest assessment and a clear next step — no pressure." },
    { q: "I already have a website.", a: "Great — run the free site check first. You'll see exactly what it's doing well and what it's quietly getting wrong, and we can talk about a rebuild or just the fixes." },
  ],
  founder: "You work directly with the person designing and building your site — no account managers, no junior handoffs, no agency overhead.",
  contactBlurb: "Tell us about your business and what you want your website to do. You'll get an honest assessment and a clear next step — no pressure, no jargon.",
} as const;

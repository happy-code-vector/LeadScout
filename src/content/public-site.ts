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
  founder: "You work directly with the person designing and building your site — no account managers, no junior handoffs, no agency overhead.",
  contactBlurb: "Tell us about your business and what you want your website to do. You'll get an honest assessment and a clear next step — no pressure, no jargon.",
} as const;

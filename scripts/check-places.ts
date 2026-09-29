import "dotenv/config";

/**
 * Places API connection check. NEVER prints the key itself — only shape
 * diagnostics and Google's response (with the key redacted if it ever
 * appears in output). Uses the free IDs-only field mask, so running this
 * costs nothing against your quota.
 */

const key = process.env.GOOGLE_PLACES_API_KEY ?? "";

const diagnostics = {
  set: key.length > 0,
  length: key.length,
  startsWithAIza: key.startsWith("AIza"),
  hasLeadingOrTrailingWhitespace: key !== key.trim(),
  containsQuotes: /["']/.test(key),
  containsSpace: /\s/.test(key),
  containsHashOrSemicolon: /[#;]/.test(key),
};

console.log("env diagnostics:", JSON.stringify(diagnostics));

if (!diagnostics.set) {
  console.error("RESULT: GOOGLE_PLACES_API_KEY is empty in .env");
  process.exit(1);
}

function redact(text: string): string {
  return text.split(key).join("***KEY***");
}

async function main() {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      // IDs-only mask = "Text Search Essentials (IDs Only)" tier: free.
      "X-Goog-FieldMask": "places.id,nextPageToken",
    },
    body: JSON.stringify({
      textQuery: "plumber",
      pageSize: 1,
      locationRestriction: {
        rectangle: {
          low: { latitude: 40.67, longitude: -73.99 },
          high: { latitude: 40.68, longitude: -73.98 },
        },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const body = await res.text().catch(() => "(no body)");
  console.log("HTTP status:", res.status);
  console.log("response:", redact(body.slice(0, 800)));

  if (res.ok) {
    const json = JSON.parse(body) as { places?: unknown[] };
    console.log(`RESULT: OK — ${json.places?.length ?? 0} place id(s) returned. The key works.`);
  } else {
    console.log("RESULT: FAILED — see Google's message above for the cause.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("RESULT: request never completed:", redact(String(err)));
  process.exitCode = 1;
});

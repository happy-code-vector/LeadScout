import { applyUnsubscribe, verifyUnsubscribeToken } from "@/lib/outreach/unsubscribe";

/**
 * Unsubscribe endpoint (spec: Outreach / Unsubscribe endpoint).
 * GET and POST, no login, plain confirmation page.
 * POST also serves the RFC 8058 one-click flow (List-Unsubscribe-Post).
 */

const PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Unsubscribed</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#111}
.card{max-width:28rem;padding:2rem;text-align:center}h1{font-size:1.25rem}p{color:#555}</style></head>
<body><div class="card">
<h1>You're unsubscribed</h1>
<p id="msg">This email address has been removed. You won't hear from us again.</p>
</div></body></html>`;

const ERROR_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Link expired</title></head>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="text-align:center"><h1>This link didn't work</h1>
<p style="color:#555">It may be expired or malformed. If you're still receiving emails, reply and ask to stop.</p></div>
</body></html>`;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const claims = verifyUnsubscribeToken(token);
  if (!claims) {
    return new Response(ERROR_PAGE, { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  await applyUnsubscribe(claims);
  return new Response(PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  // Same behavior as GET (RFC 8058 one-click unsubscribe).
  return GET(_request, { params });
}

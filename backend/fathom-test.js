/**
 * fathom-test.js
 *
 * Standalone script to hit Fathom's REST API directly (no MCP, no LLM) and
 * print the raw meeting list + transcript + summary, so we can see exactly
 * what a free-tier Fathom API key returns before building anything on top
 * of it.
 *
 * Requires FATHOM_API_KEY in backend/.env (Fathom app -> Settings -> API).
 *
 * Usage: npm run fathom:test
 */
import 'dotenv/config';

const FATHOM_API_BASE = 'https://api.fathom.ai/external/v1';

async function main() {
  const apiKey = process.env.FATHOM_API_KEY;
  if (!apiKey) {
    console.error('[fathom-test] FATHOM_API_KEY is not set in backend/.env');
    process.exit(1);
  }

  const params = new URLSearchParams({
    include_transcript: 'true',
    // Last 30 days, matching the free-tier window we validated for Granola.
    created_after: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  console.log('=== Calling GET /meetings ===');
  const res = await fetch(`${FATHOM_API_BASE}/meetings?${params.toString()}`, {
    headers: { 'X-Api-Key': apiKey },
  });

  console.log(`[fathom-test] Status: ${res.status} ${res.statusText}`);
  const body = await res.json().catch(() => null);
  console.log(JSON.stringify(body, null, 2));

  if (!res.ok) {
    console.error('\n[fathom-test] Request failed — see status/body above.');
    process.exit(1);
  }

  const meetings = body?.items || body?.meetings || [];
  console.log(`\n[fathom-test] Found ${meetings.length} meeting(s) in the last 30 days.`);

  if (meetings.length > 0) {
    const first = meetings[0];
    console.log('\n=== First meeting: summary ===');
    console.log(first.default_summary?.markdown_formatted || '(no summary field found — inspect raw JSON above)');

    console.log('\n=== First meeting: transcript (first 10 entries) ===');
    console.log(JSON.stringify((first.transcript || []).slice(0, 10), null, 2));
  }
}

main().catch(err => {
  console.error('[fathom-test] Failed:', err);
  process.exit(1);
});

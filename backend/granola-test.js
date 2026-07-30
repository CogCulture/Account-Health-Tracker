/**
 * granola-test.js
 *
 * Standalone script to connect to Granola's MCP server directly from this
 * backend (no chatbot, no LLM) and print the raw tool list + sample meeting
 * data, so we can see exactly what fields/summaries Granola returns before
 * building anything on top of it.
 *
 * First run opens a browser for one-time Granola OAuth sign-in (handled by
 * mcp-remote). Tokens are cached in ~/.mcp-auth for subsequent runs.
 *
 * Usage: npm run granola:test
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const GRANOLA_MCP_URL = 'https://mcp.granola.ai/mcp';

async function main() {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', 'mcp-remote', GRANOLA_MCP_URL],
  });

  const client = new Client({ name: 'account-health-granola-test', version: '0.0.1' });

  console.log('[granola-test] Connecting to Granola MCP (a browser window may open for sign-in)...');
  // Default request timeout (60s) is too short for a manual OAuth sign-in on first run.
  await client.connect(transport, { timeout: 5 * 60 * 1000 });
  console.log('[granola-test] Connected.\n');

  const { tools } = await client.listTools();
  console.log('=== Available tools ===');
  console.log(tools.map(t => `- ${t.name}: ${t.description || ''}`).join('\n'));

  console.log('\n=== list_meetings input schema ===');
  console.log(JSON.stringify(tools.find(t => t.name === 'list_meetings')?.inputSchema, null, 2));

  console.log('\n=== get_meetings input schema ===');
  console.log(JSON.stringify(tools.find(t => t.name === 'get_meetings')?.inputSchema, null, 2));

  console.log('\n=== Calling get_account_info ===');
  const account = await client.callTool({ name: 'get_account_info', arguments: {} });
  console.log(JSON.stringify(account, null, 2));

  console.log('\n=== Calling list_meeting_folders ===');
  const folders = await client.callTool({ name: 'list_meeting_folders', arguments: {} });
  console.log(JSON.stringify(folders, null, 2));

  console.log('\n=== Calling list_meetings (default, no folder_id) ===');
  const listResult = await client.callTool({ name: 'list_meetings', arguments: {} });
  console.log(JSON.stringify(listResult, null, 2));

  console.log('\n=== Calling list_meetings (folder_id: Team meetings) ===');
  const listInFolder = await client.callTool({
    name: 'list_meetings',
    arguments: { folder_id: '06f649db-8114-4b21-a943-a0dbefca52a2' },
  });
  console.log(JSON.stringify(listInFolder, null, 2));

  console.log('\n=== Calling query_granola_meetings (broad query) ===');
  const query = await client.callTool({ name: 'query_granola_meetings', arguments: { query: 'List all meetings you know about, even just one.' } });
  console.log(JSON.stringify(query, null, 2));

  // Granola returns an XML-ish text blob (not JSON) for list_meetings, e.g.
  // <meeting id="...' title="...">. Extract the first id via regex instead.
  let firstId;
  for (const result of [listInFolder, listResult]) {
    const text = result?.content?.find(c => c.type === 'text')?.text || '';
    const match = text.match(/<meeting id="([^"]+)"/);
    if (match) {
      firstId = match[1];
      break;
    }
  }

  if (firstId) {
    console.log(`\n=== Calling get_meetings for id: ${firstId} ===`);
    const detail = await client.callTool({ name: 'get_meetings', arguments: { meeting_ids: [firstId] } });
    console.log(JSON.stringify(detail, null, 2));
  } else {
    console.log('\n[granola-test] Could not determine a meeting id from list_meetings output — inspect the JSON above manually and call get_meetings yourself if needed.');
  }

  await client.close();
  process.exit(0);
}

main().catch(err => {
  console.error('[granola-test] Failed:', err);
  process.exit(1);
});

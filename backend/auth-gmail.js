/**
 * auth-gmail.js
 *
 * One-time CLI helper to authorize Gmail access.
 * Starts a temporary HTTP server to auto-capture the OAuth redirect,
 * or accepts manual code input.
 * Run: node auth-gmail.js
 */
import http from 'http';
import url from 'url';
import readline from 'readline';
import { getAuthorizationUrl, handleOAuthCallback } from './gmailService.js';

async function main() {
  try {
    const authUrl = getAuthorizationUrl();

    // Start a temporary HTTP server to capture the redirect automatically
    let server;
    let completed = false;

    server = http.createServer(async (req, res) => {
      try {
        const parsed = url.parse(req.url, true);
        if (parsed.pathname === '/api/auth/google/callback') {
          const code = parsed.query.code;
          if (code) {
            console.log('\n[OAuth Server] Received authorization code from browser redirect.');
            console.log('Exchanging code for tokens...');
            await handleOAuthCallback(code);
            console.log('✅ Success! Gmail tokens saved to gmail_tokens.json.');
            completed = true;

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc;">
                  <div style="background: white; padding: 2.5rem; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); text-align: center; max-width: 450px;">
                    <h2 style="color: #16a34a; margin-top: 0;">✅ Gmail Connected Successfully!</h2>
                    <p style="color: #475569; font-size: 15px; line-height: 1.5;">Your account is authorized to read Granola meeting notes. You can close this browser tab.</p>
                  </div>
                </body>
              </html>
            `);

            setTimeout(() => {
              server.close();
              process.exit(0);
            }, 1000);
            return;
          }
        }
      } catch (err) {
        console.error('Error handling callback:', err.message);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Authentication error: ' + err.message);
      }
    });

    server.listen(3001, () => {
      console.log('\n======================================================');
      console.log('🔗 Open this URL in your browser to authorize Gmail:');
      console.log('======================================================\n');
      console.log(authUrl);
      console.log('\n======================================================\n');
      console.log('Temporary listener active on port 3001.');
      console.log('Once you click "Allow", the browser will redirect and auto-complete!\n');
    });

    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        console.log('Port 3001 is already in use by another process. You can paste the code manually below.');
      }
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('Or paste the authorization code (or full redirect URL) here: ', async (input) => {
      if (completed) return;
      rl.close();
      let code = input.trim();
      if (code.includes('code=')) {
        const match = code.match(/code=([^&]+)/);
        if (match) code = decodeURIComponent(match[1]);
      }

      if (!code) {
        console.error('No code provided.');
        return;
      }

      try {
        console.log('\nExchanging code for tokens...');
        await handleOAuthCallback(code);
        console.log('✅ Success! Gmail tokens saved to gmail_tokens.json.');
        if (server) server.close();
        process.exit(0);
      } catch (err) {
        console.error('Failed to exchange code:', err.message);
      }
    });

  } catch (err) {
    console.error('Error starting auth:', err.message);
    process.exit(1);
  }
}

main();

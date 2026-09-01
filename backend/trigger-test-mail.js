import 'dotenv/config';

const apiKey = process.env.BREVO_API_KEY;
if (!apiKey) {
  throw new Error('BREVO_API_KEY missing');
}

const parseSender = (fromStr) => {
  const raw = fromStr || 'geo@cogculture.agency';
  const match = raw.match(/^(?:"?([^"<]+)"?\s*)?<([^>]+)>$/);
  if (match) {
    return {
      name: (match[1] || 'Account Health Tracker').trim(),
      email: match[2].trim(),
    };
  }
  return { name: 'Account Health Tracker', email: raw.trim() };
};

const sentAt = new Date().toLocaleString('en-IN', {
  timeZone: 'Asia/Kolkata',
  dateStyle: 'medium',
  timeStyle: 'short',
});

const payload = {
  sender: parseSender(process.env.SMTP_FROM),
  to: [
    { email: 'apoorv@cogculture.agency', name: 'Apoorv' },
    { email: 'shourya@cogculture.agency', name: 'Shourya' },
  ],
  subject: 'Test mail from Account Health Tracker',
  htmlContent: `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1e293b">
      <p>Hi Apoorv and Shourya,</p>
      <p>This is a test mail from Account Health Tracker.</p>
      <p>Please ignore.</p>
      <p style="font-size:12px;color:#64748b">Sent at ${sentAt} IST.</p>
    </div>
  `,
};

const res = await fetch('https://api.brevo.com/v3/smtp/email', {
  method: 'POST',
  headers: {
    accept: 'application/json',
    'api-key': apiKey,
    'content-type': 'application/json',
  },
  body: JSON.stringify(payload),
});

const body = await res.text();
if (!res.ok) {
  throw new Error(`Brevo HTTP ${res.status}: ${body}`);
}

console.log(`Sent test mail to ${payload.to.map((r) => r.email).join(', ')}. Response: ${body}`);

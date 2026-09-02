import 'dotenv/config';
import { sendViaSmtp } from './emailService.js';

const sentAt = new Date().toLocaleString('en-IN', {
  timeZone: 'Asia/Kolkata',
  dateStyle: 'medium',
  timeStyle: 'short',
});

const to = [
  { email: 'apoorv@cogculture.agency', name: 'Apoorv' },
  { email: 'shourya@cogculture.agency', name: 'Shourya' },
  { email: 'tanushree@cogculture.agency', name: 'Tanushree' },
];

const subject = 'Test mail from Account Health Tracker (Gmail SMTP)';
const html = `
  <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1e293b">
    <p>Hi Team,</p>
    <p>This is a test mail from Account Health Tracker sent via <strong>Gmail SMTP</strong> (<code>ahtcog@cogculture.agency</code>).</p>
    <p>Please ignore.</p>
    <p style="font-size:12px;color:#64748b">Sent at ${sentAt} IST.</p>
  </div>
`;

console.log(`Sending test email via Gmail SMTP to ${to.map((r) => r.email).join(', ')}...`);

const ok = await sendViaSmtp({
  toAddresses: to,
  subject,
  html,
});

if (ok) {
  console.log(`Successfully sent test mail to ${to.map((r) => r.email).join(', ')}.`);
} else {
  console.error('Failed to send test email.');
  process.exit(1);
}


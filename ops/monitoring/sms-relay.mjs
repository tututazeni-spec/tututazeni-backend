// Relay Alertmanager -> SMS (Twilio). Sem dependências: corre com `node sms-relay.mjs`.
// Vive fora da app de propósito: o SMS tem de sair mesmo quando todas as réplicas estão em baixo.
// Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM (E.164), ALERT_SMS_TO (lista separada por vírgulas).
import { createServer } from 'node:http';

const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_SMS_FROM: from, ALERT_SMS_TO } = process.env;
const recipients = (ALERT_SMS_TO ?? '').split(',').map(s => s.trim()).filter(Boolean);
const PORT = Number(process.env.SMS_RELAY_PORT ?? 9094);
const MAX_BODY = 1_000_000;

export function buildMessage(payload) {
  const alerts = Array.isArray(payload?.alerts) ? payload.alerts : [];
  const lines = alerts.slice(0, 3).map(a => a.annotations?.summary ?? a.labels?.alertname ?? 'alerta');
  const extra = alerts.length > 3 ? ` (+${alerts.length - 3})` : '';
  return `INNOVA [${String(payload?.status ?? 'firing').toUpperCase()}] ${lines.join(' | ')}${extra}`.slice(0, 300);
}

async function sendSms(to, body) {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status} para ${to}`);
}

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') return res.writeHead(200).end('ok');
  if (req.method !== 'POST' || req.url !== '/alert') return res.writeHead(404).end();

  let raw = '';
  req.on('data', chunk => {
    raw += chunk;
    if (raw.length > MAX_BODY) req.destroy();
  });
  req.on('end', async () => {
    try {
      const body = buildMessage(JSON.parse(raw));
      const results = await Promise.allSettled(recipients.map(to => sendSms(to, body)));
      const failed = results.filter(r => r.status === 'rejected');
      failed.forEach(f => console.error(JSON.stringify({ level: 'error', msg: f.reason.message })));
      // 502 faz o Alertmanager repetir o envio
      res.writeHead(failed.length === recipients.length ? 502 : 200).end();
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', msg: `payload inválido: ${err.message}` }));
      res.writeHead(400).end();
    }
  });
});

if (!sid || !token || !from || recipients.length === 0) {
  console.error('sms-relay: TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_SMS_FROM/ALERT_SMS_TO em falta');
  process.exit(1);
}
server.listen(PORT, () => console.log(JSON.stringify({ level: 'info', msg: `sms-relay a ouvir em :${PORT}` })));

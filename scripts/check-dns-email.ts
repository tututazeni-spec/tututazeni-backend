// Verificação só de leitura de DNS e e-mail do domínio de produção (SPF, DKIM, DMARC, MX, A).
//   DNS_APP_HOST=app.innova.ao MAIL_DOMAIN=innova.ao DKIM_SELECTORS=default,s1 \
//     npm run ops:dns-check
// MAIL_DOMAIN omite-se se SMTP_FROM estiver definido (usa o domínio do remetente).
// Sai com código 1 se algum ponto BLOQUEANTE falhar. Não altera nada. Ver docs/deploy/dns-e-email.md.
import { promises as dns, type MxRecord } from 'dns';

type Level = 'OK' | 'AVISO' | 'FALHA';
const results: { level: Level; check: string; detail: string }[] = [];
const add = (level: Level, check: string, detail = '') => results.push({ level, check, detail });

async function txt(name: string): Promise<string[]> {
  try {
    return (await dns.resolveTxt(name)).map(parts => parts.join(''));
  } catch {
    return [];
  }
}

export function senderDomain(env: NodeJS.ProcessEnv): string | undefined {
  if (env.MAIL_DOMAIN) return env.MAIL_DOMAIN.toLowerCase();
  const m = /@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/.exec(env.SMTP_FROM ?? '');
  return m?.[1].toLowerCase();
}

async function checkApp(host: string) {
  const [v4, v6] = await Promise.all([
    dns.resolve4(host).catch(() => [] as string[]),
    dns.resolve6(host).catch(() => [] as string[]),
  ]);
  v4.length + v6.length > 0
    ? add('OK', `${host} resolve`, [...v4, ...v6].join(', '))
    : add(
        'FALHA',
        `${host} resolve`,
        'sem registo A/AAAA — criar o registo no DNS (proxied no Cloudflare)',
      );
}

async function checkMail(domain: string, selectors: string[]) {
  const mx = await dns.resolveMx(domain).catch(() => [] as MxRecord[]);
  mx.length > 0
    ? add('OK', `MX de ${domain}`, mx.map(r => r.exchange).join(', '))
    : add('AVISO', `MX de ${domain}`, 'sem MX: respostas e bounces não chegam a ninguém');

  const spf = (await txt(domain)).filter(r => r.toLowerCase().startsWith('v=spf1'));
  if (spf.length === 0) add('FALHA', `SPF de ${domain}`, 'sem registo TXT v=spf1');
  else if (spf.length > 1)
    add('FALHA', `SPF de ${domain}`, 'mais de um registo SPF (inválido: junta num só)');
  else if (/\s\+?all\b/.test(spf[0]))
    add('FALHA', `SPF de ${domain}`, 'termina em +all/all: qualquer um pode enviar');
  else if (/-all\b|~all\b/.test(spf[0])) add('OK', `SPF de ${domain}`, spf[0]);
  else add('AVISO', `SPF de ${domain}`, `sem -all/~all no fim: ${spf[0]}`);

  const dmarc = (await txt(`_dmarc.${domain}`)).find(r => r.toLowerCase().startsWith('v=dmarc1'));
  if (!dmarc)
    add('FALHA', `DMARC de ${domain}`, 'sem _dmarc TXT (começar por p=none; rua=mailto:...)');
  else {
    const policy = /;\s*p=(none|quarantine|reject)/i.exec(dmarc)?.[1]?.toLowerCase();
    if (!/;\s*rua=/i.test(dmarc))
      add('AVISO', `DMARC de ${domain}`, `sem rua= (ninguém recebe relatórios): ${dmarc}`);
    if (policy === 'none')
      add(
        'AVISO',
        `DMARC de ${domain}`,
        'p=none só monitoriza; subir para quarantine/reject depois de 2-4 semanas limpas',
      );
    else if (policy) add('OK', `DMARC de ${domain}`, dmarc);
    else add('FALHA', `DMARC de ${domain}`, `política p= em falta ou inválida: ${dmarc}`);
  }

  if (selectors.length === 0) {
    add(
      'AVISO',
      'DKIM',
      'defina DKIM_SELECTORS (selector dado pelo fornecedor de e-mail) para o verificar',
    );
    return;
  }
  for (const sel of selectors) {
    const name = `${sel}._domainkey.${domain}`;
    const cname = await dns.resolveCname(name).catch(() => [] as string[]);
    const keys = (await txt(name)).filter(r => /v=dkim1|p=/i.test(r));
    cname.length > 0 || keys.length > 0
      ? add('OK', `DKIM ${sel}`, cname[0] ?? 'chave TXT publicada')
      : add('FALHA', `DKIM ${sel}`, `sem registo em ${name}`);
  }
}

async function main() {
  const env = process.env;
  const app = env.DNS_APP_HOST;
  app
    ? await checkApp(app)
    : add('AVISO', 'Domínio da aplicação', 'defina DNS_APP_HOST para o verificar');

  const domain = senderDomain(env);
  if (!domain) add('FALHA', 'Domínio de e-mail', 'defina MAIL_DOMAIN ou SMTP_FROM');
  else {
    if (/example\.(com|org)$|\.test$|localhost/.test(domain))
      add('FALHA', 'Domínio de e-mail', `${domain} é um valor de exemplo`);
    const selectors = (env.DKIM_SELECTORS ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    await checkMail(domain, selectors);
  }

  for (const r of results) {
    const icon = r.level === 'OK' ? '✅' : r.level === 'AVISO' ? '⚠️ ' : '❌';
    console.log(`${icon} ${r.check}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  const failed = results.filter(r => r.level === 'FALHA').length;
  console.log(`\n${failed ? `${failed} ponto(s) bloqueante(s)` : 'Sem pontos bloqueantes'}`);
  process.exit(failed ? 1 : 0);
}

if (require.main === module) {
  main().catch(e => {
    console.error(e);
    process.exit(2);
  });
}

// Redacted view (?redact=1) for screenshots and demos: no service names, domains, subjects,
// addresses or quotes, only ids, dates and outcomes. Applied when rendering, never to stored data.

export const isRedacted = (v: string | undefined) => v === '1';

export function maskEmail(email: string | null | undefined): string {
  if (!email) return '';
  const [local, domain = ''] = email.split('@');
  const tld = domain.split('.').slice(-1)[0];
  return `${local[0] ?? ''}•••@•••.${tld}`;
}

export function maskText(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets.filter((x) => x && x.length > 2)) {
    out = out.split(s).join('•••');
  }
  return out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => maskEmail(m));
}

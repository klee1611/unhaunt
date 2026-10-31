// Ultramarine must quote the page it read. Code checks the quote is really there,
// after normalising whitespace, quotes and case, so a paraphrase or invention fails.
export function normalise(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function quoteIsOnPage(quote: string, pageText: string): boolean {
  const q = normalise(quote).replace(/^["']|["']$/g, '').replace(/\.{3}|…/g, '');
  if (q.length < 20) return false; // too short to prove anything
  return normalise(pageText).includes(q);
}

// An email address may only be used if it appears inside the verified quote.
export function emailInQuote(email: string, quote: string): boolean {
  return normalise(quote).includes(email.trim().toLowerCase());
}

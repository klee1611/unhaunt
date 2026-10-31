import { getDomain } from 'tldts';

export interface HibpBreach {
  Name: string;
  Title: string;
  Domain: string;
  BreachDate: string;
  DataClasses: string[];
  IsVerified: boolean;
  IsFabricated: boolean;
  IsSpamList: boolean;
}

export interface BreachMatch {
  name: string;
  date: string;
  dataClasses: string[];
  afterSignup: boolean;
}

export const HIBP_URL = 'https://haveibeenpwned.com/api/v3/breaches';

// Free public list, no key needed. Matched by registrable domain only (no email lookups).
export function matchBreaches(domain: string, firstSeen: string, breaches: HibpBreach[]): BreachMatch[] {
  return breaches
    .filter((b) => b.Domain && !b.IsFabricated && !b.IsSpamList)
    .filter((b) => (getDomain(b.Domain) ?? b.Domain).toLowerCase() === domain.toLowerCase())
    .map((b) => ({
      name: b.Title,
      date: b.BreachDate,
      dataClasses: b.DataClasses,
      // A breach before you signed up can't contain your account.
      afterSignup: b.BreachDate >= firstSeen.slice(0, 10),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

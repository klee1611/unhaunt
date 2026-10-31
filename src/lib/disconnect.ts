import { tool } from 'ai';
import { z } from 'zod';

import { auth0 } from './auth0';
import { getAccessToken, withGmail } from './auth0-ai';

// "Disconnect Gmail" does two things, in this order:
//  1. Revoke the grant at Google (revoking an access token also revokes its refresh token).
//  2. Delete the connected account in Auth0, which removes the stored tokens from Token Vault.
// Step 2 alone would leave Google's grant alive, so both are needed.

export const revokeGoogleGrantTool = withGmail(
  tool({
    description: 'Revoke the Gmail grant at Google',
    inputSchema: z.object({}),
    execute: async () => {
      const token = await getAccessToken();
      const res = await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
      });
      return { revoked: res.ok, status: res.status };
    },
  }),
);

export async function deleteConnectedAccounts(connection = 'google-oauth2') {
  const domain = process.env.AUTH0_DOMAIN!;
  const { token } = await auth0.getAccessToken({
    audience: `https://${domain}/me/`,
    scope: 'read:me:connected_accounts delete:me:connected_accounts',
  });
  const base = `https://${domain}/me/v1/connected-accounts/accounts`;
  const list = await fetch(`${base}?connection=${encodeURIComponent(connection)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!list.ok) throw new Error(`listing connected accounts failed: ${list.status}`);
  const body = (await list.json()) as { accounts?: { id: string }[] } | { id: string }[];
  const accounts = Array.isArray(body) ? body : (body.accounts ?? []);
  let deleted = 0;
  for (const a of accounts) {
    const res = await fetch(`${base}/${encodeURIComponent(a.id)}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) deleted++;
  }
  return { found: accounts.length, deleted };
}

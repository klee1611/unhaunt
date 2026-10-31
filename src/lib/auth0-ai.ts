import { Auth0AI, getAccessTokenFromTokenVault } from '@auth0/ai-vercel';
import {
  AccessDeniedInterrupt,
  AuthorizationRequestExpiredInterrupt,
  UserDoesNotHavePushNotificationsInterrupt,
} from '@auth0/ai/interrupts';

import { getRefreshToken, getUser } from './auth0';
import { logEvent } from './ledger';

export const GMAIL_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
];

// Get the access token for a connection via Auth0
export const getAccessToken = async () => getAccessTokenFromTokenVault();

const auth0AI = new Auth0AI();

// Token Vault: the agent gets a short-lived Google token for Gmail; it never sees a password or refresh token.
export const withGmail = auth0AI.withTokenVault({
  connection: 'google-oauth2',
  scopes: GMAIL_SCOPES,
  refreshToken: getRefreshToken,
});

export type PhoneOutcome = 'denied' | 'expired' | 'no_push' | 'error';

// CIBA: a push to the user's phone (Auth0 Guardian) before anything is sent. Blocking is fine here:
// one local user, one request at a time. Every outcome other than "approve" means nothing is sent.
export const withPhoneApproval = auth0AI.withAsyncAuthorization({
  userID: async () => {
    const user = await getUser();
    return user?.sub as string;
  },
  // Auth0 limits binding messages to 64 characters of [a-zA-Z0-9 +-_.,:#]. No email or service names here.
  bindingMessage: async ({ id }: { id: string }) => `Unhaunt: send deletion request #${id.replace('svc-', '')}`,
  scopes: ['openid', 'send:deletion_request'],
  audience: process.env.GHOST_API_AUDIENCE,
  requestedExpiry: 120,
  onAuthorizationRequest: async (authReq, poll) => {
    logEvent({ type: 'phone_requested', authReqId: authReq.id });
    await poll;
  },
  onUnauthorized: async (e: Error, { id }: { id: string }) => {
    const outcome: PhoneOutcome =
      e instanceof AccessDeniedInterrupt
        ? 'denied'
        : e instanceof AuthorizationRequestExpiredInterrupt
          ? 'expired'
          : e instanceof UserDoesNotHavePushNotificationsInterrupt
            ? 'no_push'
            : 'error';
    logEvent({ type: 'phone_outcome', id, outcome, message: e.message });
    return { sent: false, outcome };
  },
});

import { Auth0Client } from '@auth0/nextjs-auth0/server';

// The ID token was just validated by the SDK; we only read its auth_time (when you last signed in).
function authTimeFrom(idToken: string | null): number | undefined {
  try {
    const payload = JSON.parse(Buffer.from(idToken!.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.auth_time === 'number' ? payload.auth_time : undefined;
  } catch {
    return undefined;
  }
}

// Create an Auth0 Client.
export const auth0 = new Auth0Client({
  // Mounts /auth/connect endpoint (Connected Accounts for Token Vault)
  enableConnectAccountEndpoint: true,
  // Keep the sign-in time on the session so a send can require a fresh sign-in.
  async beforeSessionSaved(session, idToken) {
    const authTime = authTimeFrom(idToken);
    return authTime ? { ...session, user: { ...session.user, auth_time: authTime } } : session;
  },
});

// Get the refresh token from Auth0 session
export const getRefreshToken = async () => {
  const session = await auth0.getSession();
  return session?.tokenSet?.refreshToken;
};

export const getUser = async () => {
  const session = await auth0.getSession();
  return session?.user;
};

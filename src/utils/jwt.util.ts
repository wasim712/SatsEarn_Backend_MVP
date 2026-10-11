import jwt from 'jsonwebtoken';

export type SessionTokenPayload = {
  userId: string;
  role: string;
  // User.tokenVersion at sign-in. Tokens issued before versioning carry none and count as 0.
  tv?: number;
};

const ALGORITHM = 'HS256';
const SESSION_TTL = '7d';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not defined in environment variables.');
  return secret;
}

export function signSessionToken(user: { id: string; role: string; tokenVersion: number }): string {
  const payload: SessionTokenPayload = { userId: user.id, role: user.role, tv: user.tokenVersion };
  return jwt.sign(payload, getJwtSecret(), { algorithm: ALGORITHM, expiresIn: SESSION_TTL });
}

export function verifySessionToken(token: string): SessionTokenPayload {
  return jwt.verify(token, getJwtSecret(), { algorithms: [ALGORITHM] }) as SessionTokenPayload;
}

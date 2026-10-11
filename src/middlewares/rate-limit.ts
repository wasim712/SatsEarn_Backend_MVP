import { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// All limiters use the default in-memory store, which is per process. If the API runs on more
// than one instance, switch these to a shared store (e.g. Redis) or the effective limit multiplies.

const tooManyRequests = { error: "Too many requests, please try again later." };

function clientIpKey(req: Request) {
  return ipKeyGenerator(req.ip || "unknown");
}

export const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 200, // Limit each IP to 200 requests per window
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooManyRequests,
});

// Per target account, so rotating IPs doesn't buy more guesses or more emails for one victim.
// perIp: count per (email, IP) instead, for routes where a per-account cap would let anyone
// lock a real user out (sign-in is already slowed by bcrypt).
export function emailLimiter(name: string, windowMs: number, limit: number, options: { perIp?: boolean } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: tooManyRequests,
    keyGenerator: (req) => {
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      if (!email) return `${name}:ip:${clientIpKey(req)}`;
      return options.perIp ? `${name}:email:${email}:ip:${clientIpKey(req)}` : `${name}:email:${email}`;
    },
  });
}

// Per signed-in user; must run after requireAuth.
export function userLimiter(name: string, windowMs: number, limit: number) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: tooManyRequests,
    keyGenerator: (req) => (req.user?.id ? `${name}:user:${req.user.id}` : `${name}:ip:${clientIpKey(req)}`),
  });
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export const authLimits = {
  signup: emailLimiter("signup", HOUR, 5),
  verifyOtp: emailLimiter("verify-otp", 15 * MINUTE, 10),
  signin: emailLimiter("signin", 15 * MINUTE, 10, { perIp: true }),
  forgotPassword: emailLimiter("forgot-password", HOUR, 3),
  resetPassword: emailLimiter("reset-password", 15 * MINUTE, 10),
};

export const userLimits = {
  quizAnswer: userLimiter("quiz-answer", MINUTE, 30),
  quizSubmit: userLimiter("quiz-submit", MINUTE, 5),
  minigameClaim: userLimiter("minigame-claim", MINUTE, 3),
  taskSubmit: userLimiter("task-submit", MINUTE, 10),
  withdrawal: userLimiter("withdrawal", HOUR, 5),
  premiumUpgrade: userLimiter("premium-upgrade", MINUTE, 3),
  changePassword: userLimiter("change-password", 15 * MINUTE, 5),
};

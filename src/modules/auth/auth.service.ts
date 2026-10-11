import { prisma } from '../../db/prisma.client';
import { AdminService } from '../admin/admin.service';
import { EmailService } from './email.service';
import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { CryptoUtil } from '../../utils/crypto.util';
import { signSessionToken } from '../../utils/jwt.util';
import { TierUtils } from '../../utils/tier.utils';
import { isValidTimeZone } from '../../utils/reward.util';

type AuthUserPayload = {
    id: string;
    email: string;
    fullName: string | null;
    country: string | null;
    referralCode: string;
    role: string;
    activeTier?: string;
    isPremium?: boolean;
    premiumExpiresAt?: Date | null;
    hasCompletedOnboarding: boolean;
    hasSkippedOnboarding: boolean;
    shouldShowOnboarding: boolean;
};

export interface SignUpInput {
    email: string;
    password: string;
    fullName: string;
    country: string;
    dateOfBirth: string | Date;
    referralCode?: string;
    username: string;
    clientIp?: string; // 🚀 NEW: Accept IP from the controller
    timezone?: string; // IANA timezone (e.g. "Asia/Kolkata"), detected client-side
}

type OtpPurpose = 'SIGNUP' | 'RESET';

type OtpUser = {
    id: string;
    email: string;
    otpCode: string | null;
    otpPurpose: string | null;
    otpExpiresAt: Date | null;
};

const OTP_TTL_MS = 15 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const INVALID_SIGNUP_CODE = "Invalid or expired verification code.";
const INVALID_RESET_CODE = "Invalid or expired reset code.";

// Compared against when the email is unknown, so response time doesn't reveal whether an account exists.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-password', 10);

export class AuthService {

    private static buildAuthUser(user: {
        id: string;
        email: string;
        fullName: string | null;
        country: string | null;
        referralCode: string;
        role: string;
        premiumExpiresAt: Date | null;
        totalXp: number;
        hasCompletedOnboarding: boolean;
        hasSkippedOnboarding: boolean;
    }): AuthUserPayload {
        const activePremiumTier = TierUtils.getCurrentPremiumTier(user as any);
        const isPremium = Boolean(activePremiumTier);
        const activeTier = activePremiumTier || TierUtils.getFreeTier(user.totalXp);

        return {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            country: user.country,
            referralCode: user.referralCode,
            role: user.role,
            activeTier,
            isPremium,
            premiumExpiresAt: user.premiumExpiresAt,
            hasCompletedOnboarding: user.hasCompletedOnboarding,
            hasSkippedOnboarding: user.hasSkippedOnboarding,
            shouldShowOnboarding: !user.hasCompletedOnboarding && !user.hasSkippedOnboarding,
        };
    }

    // 6-digit code from a CSPRNG (000000-999999)
    private static generateOTP(): string {
        return randomInt(0, 1_000_000).toString().padStart(6, '0');
    }

    private static hashOtp(email: string, purpose: OtpPurpose, code: string): string {
        return CryptoUtil.hmac(`otp:${purpose}:${email}:${code}`);
    }

    // Fresh code for one purpose. Only its keyed hash is stored; the plain code goes in the email.
    private static issueOtp(email: string, purpose: OtpPurpose) {
        const code = this.generateOTP();
        return {
            code,
            data: {
                otpCode: this.hashOtp(email, purpose, code),
                otpPurpose: purpose,
                otpAttempts: 0,
                otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
            },
        };
    }

    private static otpMatches(user: OtpUser, purpose: OtpPurpose, token: string): boolean {
        if (!user.otpCode) return false;

        // Codes issued before purpose-bound hashing were stored encrypted with no purpose.
        if (!user.otpPurpose) {
            const legacyCode = CryptoUtil.decrypt(user.otpCode);
            return legacyCode !== null && CryptoUtil.safeEqual(legacyCode, token);
        }

        return user.otpPurpose === purpose
            && CryptoUtil.safeEqual(user.otpCode, this.hashOtp(user.email, purpose, token));
    }

    // Spends one guess against the stored code. After OTP_MAX_ATTEMPTS guesses the code is burned;
    // the atomic reservation stops parallel requests from going past the limit.
    private static async checkOtp(user: OtpUser, purpose: OtpPurpose, token: string): Promise<boolean> {
        if (!user.otpCode || !user.otpExpiresAt || user.otpExpiresAt < new Date()) return false;

        const reserved = await prisma.user.updateMany({
            where: { id: user.id, otpCode: user.otpCode, otpAttempts: { lt: OTP_MAX_ATTEMPTS } },
            data: { otpAttempts: { increment: 1 } },
        });
        if (reserved.count === 0) return false;

        const matches = this.otpMatches(user, purpose, token);

        if (!matches) {
            await prisma.user.updateMany({
                where: { id: user.id, otpCode: user.otpCode, otpAttempts: { gte: OTP_MAX_ATTEMPTS } },
                data: { otpCode: null, otpPurpose: null, otpExpiresAt: null },
            });
        }

        return matches;
    }

    // ==========================================
    // 1. SIGN UP (Generate User & OTP)
    // ==========================================
    static async signUp(data: SignUpInput) {
        const email = data.email.trim().toLowerCase();
        const username = data.username.trim().toLowerCase();
        const referralCode = data.referralCode?.trim().toUpperCase();

        // 🚀 FIXED: Use the IP passed from the controller, fallback to UNKNOWN
        const clientIp = data.clientIp || 'UNKNOWN';

        // 1. Check existing users
        const existingUser = await prisma.user.findFirst({
            where: { OR: [{ email }, { username }] }
        });

        if (existingUser) {
            // If the EMAIL matches:
            if (existingUser.email === email) {
                if (existingUser.isVerified) {
                    throw new Error("Email already registered. Please log in.");
                }

                // Account exists but is UNVERIFIED.
                // Act as a "Resend OTP" + "Update Info" flow.
                // Safe to overwrite: verify-otp also requires this password, so only someone holding
                // both the inbox and the latest password can activate the account.
                const newPasswordHash = await bcrypt.hash(data.password, 10);
                const otp = this.issueOtp(email, 'SIGNUP');

                await prisma.user.update({
                    where: { id: existingUser.id },
                    data: {
                        passwordHash: newPasswordHash,
                        fullName: data.fullName,
                        ...otp.data,
                        lastIpAddress: CryptoUtil.encrypt(clientIp) // 🚀 Update IP just in case
                    }
                });

                await EmailService.sendVerificationEmail(email, otp.code);

                return { message: "Account was unverified. A fresh verification code has been sent to your email!" };
            }

            // If the email didn't match, it means the USERNAME matched:
            if (existingUser.username === username) {
                throw new Error("Username already taken.");
            }
        }

        // ==========================================
        // 2. BRAND NEW USER FLOW
        // ==========================================

        // Validate Referral Code
        let referredById = null;
        if (referralCode) {
            const referrer = await prisma.user.findUnique({ where: { referralCode } });
            if (!referrer) throw new Error("Invalid referral code provided.");
            referredById = referrer.id;
        }

        // Hash Password & Generate OTP
        const passwordHash = await bcrypt.hash(data.password, 10);
        const otp = this.issueOtp(email, 'SIGNUP'); // Expires in 15 mins

        const { v4: uuidv4 } = await import('uuid');

        // Save Unverified User to Database
        const newUser = await prisma.user.create({
            data: {
                email,
                passwordHash,
                fullName: data.fullName,
                username,
                country: data.country,
                dateOfBirth: new Date(data.dateOfBirth),
                referralCode: uuidv4().substring(0, 8).toUpperCase(),
                referredById,
                isVerified: false,
                ...otp.data,
                registrationIp: CryptoUtil.encrypt(clientIp), // 🚀 NEW: Save registration IP
                lastIpAddress: CryptoUtil.encrypt(clientIp),   // 🚀 NEW: Save last IP
                ...(data.timezone && isValidTimeZone(data.timezone) ? { timezone: data.timezone } : {}),
            }
        });

        // Fire Email via Resend
        await EmailService.sendVerificationEmail(newUser.email, otp.code);

        return { message: "Account created! Please check your email for the verification code." };
    }

    // ==========================================
    // 2. VERIFY OTP (Activate & Login)
    // ==========================================
    static async verifyOtp(email: string, token: string, password: string) {
        const cleanEmail = email.trim().toLowerCase();

        // One generic error for every failure, so this endpoint doesn't reveal account state.
        const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
        if (!user || user.isVerified || !user.passwordHash) throw new Error(INVALID_SIGNUP_CODE);

        // 1. Validate OTP (limited guesses), then the password chosen at signup
        if (!(await this.checkOtp(user, 'SIGNUP', token))) throw new Error(INVALID_SIGNUP_CODE);
        if (!(await bcrypt.compare(password, user.passwordHash))) throw new Error(INVALID_SIGNUP_CODE);

        // 2. Fetch Gamification Settings for Welcome Bonus
        const settings = await AdminService.getGamificationSettings().catch(() => ({ welcomeBonusSats: 50 }));

        // 3. Activate User & Grant Bonus
        const activatedUser = await prisma.$transaction(async (tx) => {
            // Conditional update: two concurrent verifies can't both grant the welcome bonus.
            const activated = await tx.user.updateMany({
                where: { id: user.id, isVerified: false },
                data: {
                    isVerified: true,
                    otpCode: null,
                    otpPurpose: null,
                    otpAttempts: 0,
                    otpExpiresAt: null,
                    balanceLocked: settings.welcomeBonusSats,
                },
            });
            if (activated.count === 0) throw new Error(INVALID_SIGNUP_CODE);

            const updatedUser = await tx.user.findUniqueOrThrow({
                where: { id: user.id },
                select: {
                    id: true,
                    email: true,
                    fullName: true,
                    country: true,
                    referralCode: true,
                    role: true,
                    premiumExpiresAt: true,
                    totalXp: true,
                    hasCompletedOnboarding: true,
                    hasSkippedOnboarding: true,
                    tokenVersion: true,
                },
            });

            if (settings.welcomeBonusSats > 0) {
                await tx.ledger.create({
                    data: {
                        userId: user.id,
                        amountSats: settings.welcomeBonusSats,
                        type: 'WELCOME_BONUS',
                        description: 'Signup welcome bonus',
                    },
                });
            }

            return updatedUser;
        });

        // 4. Fire Welcome Email
        EmailService.sendWelcomeEmail(activatedUser.email, activatedUser.fullName ?? 'Sats Earner', settings.welcomeBonusSats)
            .catch(err => console.error("Failed to send welcome email:", err));

        // 5. Generate Session Token
        const sessionToken = signSessionToken(activatedUser);

        return { session: sessionToken, user: this.buildAuthUser(activatedUser) };
    }

    // ==========================================
    // 3. SIGN IN
    // ==========================================
    // 🚀 FIXED: Accept clientIp to track VPN/Location changes on login
    static async signIn(email: string, password: string, clientIp: string = 'UNKNOWN') {
        const user = await prisma.user.findUnique({
            where: { email: email.trim().toLowerCase() }
        });

        // Always run bcrypt so response time doesn't reveal whether the email exists.
        const isValidPassword = await bcrypt.compare(password, user?.passwordHash || DUMMY_PASSWORD_HASH);
        if (!user || !user.passwordHash || !isValidPassword) {
            throw new Error("Invalid email or password.");
        }

        // Only reveal verification status to someone who already knows the password.
        if (!user.isVerified) {
            throw new Error("Please verify your email address before logging in.");
        }

        // 🚀 NEW: Update their last known IP address so the Fraud Engine is accurate
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: { lastIpAddress: CryptoUtil.encrypt(clientIp) },
            select: {
                id: true,
                email: true,
                fullName: true,
                country: true,
                referralCode: true,
                role: true,
                premiumExpiresAt: true,
                totalXp: true,
                hasCompletedOnboarding: true,
                hasSkippedOnboarding: true,
                tokenVersion: true,
            },
        });

        const sessionToken = signSessionToken(updatedUser);

        return { session: sessionToken, user: this.buildAuthUser(updatedUser) };
    }

    // ==========================================
    // 4. RESEND OTP
    // ==========================================
    static async resendSignupOtp(email: string) {
        const genericResponse = { message: "If this account is waiting for verification, a new code has been sent." };
        const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });

        if (!user || user.isVerified) return genericResponse;

        const otp = this.issueOtp(user.email, 'SIGNUP');

        await prisma.user.update({
            where: { id: user.id },
            data: otp.data,
        });

        await EmailService.sendVerificationEmail(user.email, otp.code);

        return genericResponse;
    }

    // ==========================================
    // 5. PASSWORD RESET FLOW
    // ==========================================
    static async requestPasswordReset(email: string) {
        const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });

        // Unverified accounts hold a signup code; issuing a reset code would replace it.
        if (!user || !user.isVerified || !user.isActive) {
            return { message: "If an account exists, a password reset code has been sent." };
        }

        const otp = this.issueOtp(user.email, 'RESET');

        await prisma.user.update({
            where: { id: user.id },
            data: otp.data,
        });

        await EmailService.sendPasswordResetEmail(user.email, otp.code);

        return { message: "If an account exists, a password reset code has been sent." };
    }

    static async resetPassword(email: string, token: string, newPassword: string) {
        const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
        if (!user || !user.isVerified) throw new Error(INVALID_RESET_CODE);

        if (!(await this.checkOtp(user, 'RESET', token))) {
            throw new Error(INVALID_RESET_CODE);
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash,
                otpCode: null,
                otpPurpose: null,
                otpAttempts: 0,
                otpExpiresAt: null,
                tokenVersion: { increment: 1 }, // log out every existing session
            }
        });

        return { message: "Password updated successfully. Please log in." };
    }

    // ==========================================
    // 6. UTILITIES
    // ==========================================
    static async checkUsername(username: string) {
        if (!username || username.trim() === "") {
            return { available: false, message: "Username cannot be empty." };
        }

        const cleanUsername = username.trim().toLowerCase();

        if (cleanUsername.length < 3) {
            return { available: false, message: "Username must be at least 3 characters long." };
        }

        const existingUser = await prisma.user.findUnique({
            where: { username: cleanUsername },
            select: { id: true }
        });

        if (existingUser) {
            return { available: false, message: "Username is already taken." };
        }

        return { available: true, message: "Username is available!" };
    }
}

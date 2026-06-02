import { prisma } from '../../db/prisma.client';
import { AdminService } from '../admin/admin.service'; 
import { EmailService } from './email.service'; 
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { CryptoUtil } from '../../utils/crypto.util';
import { TierUtils } from '../../utils/tier.utils';

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
}

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
    
    // Helper to generate a 6-digit OTP
    private static generateOTP(): string {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    // Helper to issue JWT session tokens
    private static generateToken(userId: string, role: string): string {
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error("JWT_SECRET is not defined in environment variables.");
        return jwt.sign({ userId, role }, secret, { expiresIn: '7d' }); // 7-day session
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
                const newPasswordHash = await bcrypt.hash(data.password, 10);
                const newOtpCode = this.generateOTP();
                const newOtpExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

                await prisma.user.update({
                    where: { id: existingUser.id },
                    data: {
                        passwordHash: newPasswordHash,
                        fullName: data.fullName,       
                        otpCode: CryptoUtil.encrypt(newOtpCode),
                        otpExpiresAt: newOtpExpiresAt,
                        lastIpAddress: CryptoUtil.encrypt(clientIp) // 🚀 Update IP just in case
                    }
                });

                await EmailService.sendVerificationEmail(email, newOtpCode);

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
        const otpCode = this.generateOTP();
        const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // Expires in 15 mins
        
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
                otpCode: CryptoUtil.encrypt(otpCode),
                otpExpiresAt,
                registrationIp: CryptoUtil.encrypt(clientIp), // 🚀 NEW: Save registration IP
                lastIpAddress: CryptoUtil.encrypt(clientIp)   // 🚀 NEW: Save last IP
            }
        });

        // Fire Email via Resend
        await EmailService.sendVerificationEmail(newUser.email, otpCode);

        return { message: "Account created! Please check your email for the verification code." };
    }

    // ==========================================
    // 2. VERIFY OTP (Activate & Login)
    // ==========================================
    static async verifyOtp(email: string, token: string) {
        const cleanEmail = email.trim().toLowerCase();

        const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
        if (!user) throw new Error("User not found.");
        if (user.isVerified) throw new Error("Account is already verified. Please log in.");

        // 1. Validate OTP
        if (CryptoUtil.decrypt(user.otpCode) !== token) throw new Error("Invalid verification code.");
        if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) {
            throw new Error("Verification code expired. Please request a new one.");
        }

        // 2. Fetch Gamification Settings for Welcome Bonus
        const settings = await AdminService.getGamificationSettings().catch(() => ({ welcomeBonusSats: 0 }));

        // 3. Activate User & Grant Bonus
        const activatedUser = await prisma.user.update({
            where: { id: user.id },
            data: {
                isVerified: true,
                otpCode: null, 
                otpExpiresAt: null,
                balanceLocked: settings.welcomeBonusSats
            },
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
            },
        });

        // 4. Fire Welcome Email
        EmailService.sendWelcomeEmail(activatedUser.email, activatedUser.fullName ?? 'Sats Earner', settings.welcomeBonusSats)
            .catch(err => console.error("Failed to send welcome email:", err));

        // 5. Generate Session Token
        const sessionToken = this.generateToken(activatedUser.id, activatedUser.role);

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

        if (!user || !user.passwordHash) {
            throw new Error("Invalid email or password.");
        }

        if (!user.isVerified) {
            throw new Error("Please verify your email address before logging in.");
        }

        const isValidPassword = await bcrypt.compare(password, user.passwordHash);
        if (!isValidPassword) throw new Error("Invalid email or password.");

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
            },
        });

        const sessionToken = this.generateToken(user.id, user.role);

        return { session: sessionToken, user: this.buildAuthUser(updatedUser) };
    }

    // ==========================================
    // 4. RESEND OTP
    // ==========================================
    static async resendSignupOtp(email: string) {
        const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
        
        if (!user) throw new Error("User not found.");
        if (user.isVerified) throw new Error("Account is already verified.");

        const otpCode = this.generateOTP();
        const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await prisma.user.update({
            where: { id: user.id },
            data: { otpCode: CryptoUtil.encrypt(otpCode), otpExpiresAt }
        });

        await EmailService.sendVerificationEmail(user.email, otpCode);

        return { message: "A new verification code has been sent to your email." };
    }

    // ==========================================
    // 5. PASSWORD RESET FLOW
    // ==========================================
    static async requestPasswordReset(email: string) {
        const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
        
        if (!user) return { message: "If an account exists, a password reset code has been sent." };

        const otpCode = this.generateOTP();
        const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await prisma.user.update({
            where: { id: user.id },
            data: { otpCode: CryptoUtil.encrypt(otpCode), otpExpiresAt }
        });

        await EmailService.sendPasswordResetEmail(user.email, otpCode);

        return { message: "If an account exists, a password reset code has been sent." };
    }

    static async resetPassword(email: string, token: string, newPassword: string) {
        const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
        if (!user) throw new Error("Invalid request."); 

        if (CryptoUtil.decrypt(user.otpCode) !== token || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
            throw new Error("Invalid or expired reset code.");
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash,
                otpCode: null,
                otpExpiresAt: null
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

import { supabase } from '../../external/supabase.client';
import { prisma } from '../../db/prisma.client';
import { AdminService } from '../admin/admin.service'; 
import { EmailService } from './email.service'; // Integrated Resend
// import { v4 as uuidv4 } from 'uuid';

// 1️⃣ Type Definitions for better strictness
export interface SignUpInput {
    email: string;
    password: string;
    fullName: string;
    country: string;
    dateOfBirth: string | Date;
    referralCode?: string;
    username: string;
}
export class AuthService {
    
    // ==========================================
    // 1. SIGN UP
    // ==========================================
    static async signUp(data: SignUpInput) {
        // Edge Case Handling: Sanitize inputs to prevent case-sensitivity bugs
        const email = data.email.trim().toLowerCase();
        const username = data.username.trim().toLowerCase();
        const referralCode = data.referralCode?.trim().toUpperCase();

        // 1. Check if username already exists in DB
        const existingUsername = await prisma.user.findUnique({
            where: { username },
        });
        const existingEmail = await prisma.user.findUnique({
            where : {email}
        })
        if (existingEmail) {
            throw new Error("Email already taken. Please choose another.");
        }

        if (existingUsername) {
            throw new Error("Username already taken. Please choose another.");
        }

        // 2. Validate referral code (if provided)
        let referrerId = null;
        if (referralCode) {
            const referrer = await prisma.user.findUnique({
                where: { referralCode },
                select: { id: true } // Optimization: Only fetch the ID
            });

            if (!referrer) {
                throw new Error("Invalid referral code provided.");
            }
            referrerId = referrer.id;
        }

        // 3. Proceed with Supabase Auth
        const { data: authData, error } = await supabase.auth.signUp({
            email,
            password: data.password,
            options: {
                data: { 
                    fullName: data.fullName, 
                    country: data.country, 
                    dateOfBirth: data.dateOfBirth, 
                    referralCode, // Storing the code they used, not their new one
                    username 
                },
            },
        });

        if (error) {
            // Edge Case: User exists in Supabase but didn't verify email previously
            if (error.message.toLowerCase().includes("already registered")) {
                 throw new Error("Email is already registered. Try logging in or resetting your password.");
            }
            throw new Error(error.message);
        }

        // 4. Safe OTP Resend Fallback
        // Wrap in try-catch so rate-limit errors on resend don't break the signup flow
        try {
            await supabase.auth.resend({ type: 'signup', email });
        } catch (resendError) {
            console.warn("OTP Resend skipped/failed (likely rate-limited):", resendError);
        }

        return { message: "Account created! Please check your email for the verification code." };
    }


    // ==========================================
    // 2. VERIFY OTP & CREATE DB RECORD
    // ==========================================
    static async verifyOtp(email: string, token: string) {
        const cleanEmail = email.trim().toLowerCase();

        // 1. Verify token with Supabase
        const { data: authData, error } = await supabase.auth.verifyOtp({
            email: cleanEmail,
            token,
            type: 'email',
        });

        if (error) throw new Error(`Verification failed: ${error.message}`);

        const supabaseUser = authData.user;
        if (!supabaseUser || !authData.session) {
            throw new Error("Verification successful, but session could not be established.");
        }

        // 2. Check if DB user already exists (idempotency check)
        let dbUser = await prisma.user.findUnique({
            where: { supabaseAuthId: supabaseUser.id },
        });

        // 3. If no DB user, we initialize them now
        if (!dbUser) {
            const meta = supabaseUser.user_metadata;

            // Fetch dynamic settings & handle referrals
            const settings = await AdminService.getGamificationSettings().catch(() => ({ welcomeBonusSats: 0 })); // Fallback if admin settings fail
            
            let referredById = null;
            if (meta.referralCode) {
                const referrer = await prisma.user.findUnique({ where: { referralCode: meta.referralCode } });
                if (referrer) referredById = referrer.id;
            }
const { v4: uuidv4 } = await import('uuid');
            // Create user in Prisma safely using upsert to avoid race conditions
            dbUser = await prisma.user.upsert({
                where: { supabaseAuthId: supabaseUser.id },
                update: {}, // Do nothing if they magically exist already
                create: {
                    supabaseAuthId: supabaseUser.id,
                    email: supabaseUser.email!,
                    fullName: meta.fullName || 'Unknown',
                    username: meta.username,
                    country: meta.country || 'Unknown',
                    dateOfBirth: new Date(meta.dateOfBirth),
                    referralCode: uuidv4().substring(0, 8).toUpperCase(), // Generate their unique code
                    xp: 0,
                    tier: 'BASIC',
                    balanceLocked: settings.welcomeBonusSats,
                    referredById,
                },
            });

            // 4. Fire custom Resend Welcome Email asynchronously
            // We DO NOT await this. It runs in the background so it doesn't delay the API response
            EmailService.sendWelcomeEmail(dbUser.email, dbUser.fullName ?? 'Sats Earner', settings.welcomeBonusSats)
                .catch(err => console.error("Failed to send welcome email:", err));
        }

        return { session: authData.session, user: dbUser };
    }


    // ==========================================
    // 3. SIGN IN
    // ==========================================
    static async signIn(email: string, password: string) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password,
        });

        if (error) throw new Error(`Login failed: ${error.message}`);

        const dbUser = await prisma.user.findUnique({
            where: { supabaseAuthId: data.user.id },
        });

        // Edge Case: Supabase verified them, but DB creation failed during `verifyOtp` crash
        if (!dbUser) {
            // Log them out of Supabase to prevent ghost sessions
            await supabase.auth.signOut();
            throw new Error("Account setup incomplete. Please contact support.");
        }

        return { session: data.session, user: dbUser };
    }


    // ==========================================
    // 4. PASSWORD RESET FLOW
    // ==========================================
    static async requestPasswordReset(email: string) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
        
        if (error) {
            // Security Edge Case: Don't reveal if an email exists or not to prevent user enumeration attacks
            if (error.message.includes("User not found")) {
                console.warn(`Password reset requested for non-existent email: ${email}`);
                return { message: "If an account exists, a password reset email has been sent." };
            }
            throw new Error(error.message);
        }
        
        return { message: "If an account exists, a password reset email has been sent." };
    }

    static async resetPassword(email: string, token: string, newPassword: string) {
        // 1. Verify the recovery OTP. This generates a temporary session.
        const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
            email: email.trim().toLowerCase(),
            token,
            type: 'recovery',
        });

        if (verifyError) throw new Error(`Invalid or expired reset token: ${verifyError.message}`);
        if (!verifyData.session) throw new Error("Could not establish secure session for reset.");
        await supabase.auth.setSession(verifyData.session);
        const { error: updateError } = await supabase.auth.updateUser({
            password: newPassword
        });
        if (updateError) throw new Error(`Failed to update password: ${updateError.message}`);
        await supabase.auth.signOut();

        return { message: "Password updated successfully. Please log in with your new password." };
    }


    // ==========================================
    // 5. UTILITIES
    // ==========================================
    static async checkUsername(username: string) {
        if (!username || username.trim() === "") {
            return { available: false, message: "Username cannot be empty" };
        }

        const existingUser = await prisma.user.findUnique({
            where: { username: username.trim().toLowerCase() },
            select: { id: true } // Optimization
        });

        return {
            available: !existingUser,
        };
    }
}
import { supabase } from '../../external/supabase.client';
import { prisma } from '../../db/prisma.client';
import { v4 as uuidv4 } from 'uuid';

export class AuthService {
  // Step 1: Sign up and send OTP
  static async signUp(data: any) {
    const { email, password, fullName, country, dateOfBirth, referralCode } = data;

    // Supabase handles sending the Email OTP automatically if Email Confirmations are ON
    const { data: authData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          fullName,
          country,
          dateOfBirth,
          referralCode,
        },
      },
    });

    if (error) throw new Error(error.message);
    return { message: "OTP sent to email. Please verify." };
  }

  // Step 2: Verify the OTP and create the database record
  static async verifyOtp(email: string, token: string) {
    const { data: authData, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });

    if (error) throw new Error(error.message);

    const supabaseUser = authData.user;
    if (!supabaseUser) throw new Error("Verification failed");

    // Check if user already exists in Prisma to prevent overwriting
    let dbUser = await prisma.user.findUnique({
      where: { supabaseAuthId: supabaseUser.id },
    });

    if (!dbUser) {
      // Create user in Prisma, grab KYC data from Supabase metadata
      const meta = supabaseUser.user_metadata;
      
      // Handle referral logic if a code was provided
      let referredById = null;
      if (meta.referralCode) {
        const referrer = await prisma.user.findUnique({
          where: { referralCode: meta.referralCode }
        });
        if (referrer) referredById = referrer.id;
      }

      dbUser = await prisma.user.create({
        data: {
          supabaseAuthId: supabaseUser.id,
          email: supabaseUser.email!,
          fullName: meta.fullName,
          country: meta.country,
          dateOfBirth: new Date(meta.dateOfBirth),
          referralCode: uuidv4().substring(0, 8).toUpperCase(), // Generate unique referral code
          balanceLocked: 50, // Welcome bonus applied here
          referredById,
        },
      });
    }

    return { session: authData.session, user: dbUser };
  }

  // Standard Login
  static async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw new Error(error.message);

    const dbUser = await prisma.user.findUnique({
      where: { supabaseAuthId: data.user.id },
    });

    return { session: data.session, user: dbUser };
  }
  // Add these inside your AuthService class

  static async requestPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw new Error(error.message);
    return { message: "Password reset OTP sent to email." };
  }

  static async resetPassword(email: string, token: string, newPassword: string) {
    // 1. Verify the recovery OTP
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'recovery',
    });

    if (verifyError) throw new Error(verifyError.message);
    if (!verifyData.user) throw new Error("Verification failed");

    // 2. Update the user's password using the Supabase Admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      verifyData.user.id,
      { password: newPassword }
    );

    if (updateError) throw new Error(updateError.message);
    return { message: "Password updated successfully." };
  }
}

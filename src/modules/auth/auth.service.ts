import { supabase } from '../../external/supabase.client';
import { prisma } from '../../db/prisma.client';
import { v4 as uuidv4 } from 'uuid';
import { AdminService } from '../admin/admin.service'; // Import to get global settings

export class AuthService {
  // Step 1: Sign up and send OTP
  static async signUp(data: any) {
    const { email, password, fullName, country, dateOfBirth, referralCode } = data;

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

    let dbUser = await prisma.user.findUnique({
      where: { supabaseAuthId: supabaseUser.id },
    });

    if (!dbUser) {
      const meta = supabaseUser.user_metadata;
      
      // 1. Fetch Dynamic Welcome Bonus from Admin Settings
      const settings = await AdminService.getGamificationSettings();
      const welcomeBonus = settings.welcomeBonusSats;

      // 2. Handle referral logic
      let referredById = null;
      if (meta.referralCode) {
        const referrer = await prisma.user.findUnique({
          where: { referralCode: meta.referralCode }
        });
        if (referrer) referredById = referrer.id;
      }

      // 3. Create user with Gamification Defaults
      dbUser = await prisma.user.create({
        data: {
          supabaseAuthId: supabaseUser.id,
          email: supabaseUser.email!,
          fullName: meta.fullName,
          country: meta.country,
          dateOfBirth: new Date(meta.dateOfBirth),
          referralCode: uuidv4().substring(0, 8).toUpperCase(),
          
          // STARTING STATS
          xp: 0,             // Start at Level 0
          tier: 'BASIC',     // Start at Basic Tier
          balanceLocked: welcomeBonus, // 50 Sats Welcome Bonus
          
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

  static async requestPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw new Error(error.message);
    return { message: "Password reset OTP sent to email." };
  }

  static async resetPassword(email: string, token: string, newPassword: string) {
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'recovery',
    });

    if (verifyError) throw new Error(verifyError.message);
    if (!verifyData.user) throw new Error("Verification failed");

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      verifyData.user.id,
      { password: newPassword }
    );

    if (updateError) throw new Error(updateError.message);
    return { message: "Password updated successfully." };
  }
}
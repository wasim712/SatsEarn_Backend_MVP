import { Resend } from 'resend';

// Initialize Resend with the API key from your environment variables
const resend = new Resend(process.env.RESEND_API_KEY);

// Define a central sender address to keep things consistent
const SENDER_EMAIL = process.env.EMAIL_FROM || 'SatsEarn <onboarding@resend.dev>'; 

export class EmailService {
    
    // ==========================================
    // 1. ACCOUNT VERIFICATION OTP
    // ==========================================
    static async sendVerificationEmail(email: string, otpCode: string): Promise<boolean> {
        try {
            const { data, error } = await resend.emails.send({
                from: SENDER_EMAIL,
                to: email,
                subject: 'Verify your SatsEarn account',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
                        <h1 style="color: #F7931A;">Welcome to SatsEarn!</h1>
                        <p>You are almost ready to start earning. Please use the verification code below to activate your account.</p>
                        
                        <div style="background-color: #f4f4f4; padding: 20px; border-radius: 8px; margin: 25px 0; text-align: center;">
                            <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #333;">${otpCode}</span>
                        </div>
                        
                        <p style="font-size: 14px; color: #666;">This code will expire in 15 minutes. If you did not request this email, you can safely ignore it.</p>
                        <br/>
                        <p>Best regards,</p>
                        <p><strong>The Sats Earn Team</strong></p>
                    </div>
                `
            });

            if (error) {
                console.error("[EmailService] OTP Send Error:", error);
                return false;
            }
            return true;
        } catch (err) {
            console.error("[EmailService] Failed to send OTP email:", err);
            return false;
        }
    }

    // ==========================================
    // 2. PASSWORD RESET OTP
    // ==========================================
    static async sendPasswordResetEmail(email: string, otpCode: string): Promise<boolean> {
        try {
            const { data, error } = await resend.emails.send({
                from: SENDER_EMAIL,
                to: email,
                subject: 'Reset your SatsEarn password',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
                        <h1 style="color: #F7931A;">Password Reset Request</h1>
                        <p>We received a request to reset the password for your SatsEarn account. Use the code below to securely change your password.</p>
                        
                        <div style="background-color: #f4f4f4; padding: 20px; border-radius: 8px; margin: 25px 0; text-align: center;">
                            <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #333;">${otpCode}</span>
                        </div>
                        
                        <p style="font-size: 14px; color: #666;">This code will expire in 15 minutes. If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
                        <br/>
                        <p>Best regards,</p>
                        <p><strong>The Sats Earn Team</strong></p>
                    </div>
                `
            });

            if (error) {
                console.error("[EmailService] Password Reset Send Error:", error);
                return false;
            }
            return true;
        } catch (err) {
            console.error("[EmailService] Failed to send password reset email:", err);
            return false;
        }
    }

    // ==========================================
    // 3. WELCOME BONUS EMAIL
    // ==========================================
    static async sendWelcomeEmail(email: string, fullName: string, welcomeBonus: number): Promise<boolean> {
        try {
            const { data, error } = await resend.emails.send({
                from: SENDER_EMAIL,
                to: email,
                subject: 'Welcome to Sats Earn! 🚀',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
                        <h1 style="color: #F7931A;">Welcome aboard, ${fullName}!</h1>
                        <p>Your account has been successfully verified, and we are thrilled to have you here.</p>
                        
                        <div style="background-color: #f4f4f4; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <h2 style="margin-top: 0; color: #333;">🎉 Your Welcome Bonus</h2>
                            <p style="font-size: 16px; margin-bottom: 0;">
                                We've credited your account with a locked welcome bonus of <strong>${welcomeBonus} Sats</strong>.
                            </p>
                        </div>
                        
                        <p>Start exploring the platform and completing tasks to unlock your balance and earn more.</p>
                        
                        <br/>
                        <p>Best regards,</p>
                        <p><strong>The Sats Earn Team</strong></p>
                    </div>
                `
            });

            if (error) {
                console.error("[EmailService] Resend API Error:", error);
                return false;
            }

            console.log(`[EmailService] Welcome email sent successfully to ${email}. ID: ${data?.id}`);
            return true;

        } catch (err) {
            console.error("[EmailService] Failed to send welcome email. Exception:", err);
            return false;
        }
    }
}
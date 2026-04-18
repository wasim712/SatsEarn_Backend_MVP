import { Resend } from 'resend';

// Initialize Resend with the API key from your environment variables
// Ensure you have RESEND_API_KEY in your .env file
const resend = new Resend(process.env.RESEND_API_KEY);

// Define a central sender address to keep things consistent
// In production, this MUST be the domain you verified in Resend (e.g., 'onboarding@satsearn.com')
// If testing without a domain, you MUST use 'onboarding@resend.dev'
const SENDER_EMAIL = process.env.EMAIL_FROM || 'Sats Earn <onboarding@resend.dev>'; 

export class EmailService {
    
    /**
     * Sends a welcome email to the user after successful OTP verification.
     * @param email The user's email address
     * @param fullName The user's full name
     * @param welcomeBonus The amount of locked Sats they received
     */
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

    // You can easily add more transactional emails here later!
    // Example stubs for your future gamification system:
    
    /*
    static async sendLevelUpEmail(email: string, newLevel: number) { ... }
    static async sendReferralSuccessEmail(email: string, reward: number) { ... }
    */
}
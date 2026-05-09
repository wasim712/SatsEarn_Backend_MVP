import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs"; // Replaces Supabase Auth
import "dotenv/config";

// TIP: For Prisma migrations/seeding with Neon, it is safer to use the DIRECT_URL
const pool = new Pool({
    connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    max: 1,
    ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log("🌱 Starting Full System Seed...");

    // --- 1. SETTINGS SEED ---
    await prisma.platformSettings.upsert({
        where: { id: "global-settings" },
        update: {},
        create: {
            id: "global-settings",
            welcomeBonusSats: 50,
            minWithdrawalSats: 25000,
      tierMinWithdrawalMatrix: {
        BASIC: 25000,
        COPPER: 25000,
        BRONZE: 25000,
        SILVER: 25000,
        GOLD: 25000,
        PLATINUM: 25000,
        DIAMOND: 25000,
        CROWN: 25000,
        ELITE: 25000,
        FOUNDER: 25000,
      },
            baseXpPerTask: 10,
        },
    });
    console.log("✅ Platform settings initialized.");

    // --- 2. ADMIN SEED ---
    const adminEmail = "admin@satsearn.com";
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
        throw new Error("❌ ADMIN_PASSWORD environment variable is missing!");
    }

    console.log("🔐 Hashing admin password...");
    const passwordHash = await bcrypt.hash(adminPassword, 10);

    // Upsert the Admin User directly into Prisma
    await prisma.user.upsert({
        where: { email: adminEmail },
        update: { 
            role: "SUPER_ADMIN",
            passwordHash // Ensures password updates if you change ADMIN_PASSWORD in .env
        },
        create: {
            email: adminEmail,
            passwordHash,
            authProvider: "EMAIL",
            isVerified: true, // Skip OTP verification for the admin
            fullName: "Saksham Arya",
            username: "admin",
            role: "SUPER_ADMIN",
            referralCode: "ADMIN001",
            country: "IN",
            
            // --- UPDATED ECONOMY FIELDS ---
            totalXp: 10000, 
            // 'tier' and 'supabaseAuthId' have been completely removed!
        },
    });

    console.log(`👑 SUCCESS: Admin account created!`);
    console.log(`📧 Email: ${adminEmail}`);
    console.log(`⚠️  Keep your ADMIN_PASSWORD secure in your .env file!`);
}

main()
    .catch((e) => {
        console.error("❌ Seed failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    max: 1,
    ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
);

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
            baseXpPerTask: 10,
        },
    });
    console.log("✅ Platform settings initialized.");
const adminEmail = "admin@satsearn.com";
const adminPassword = process.env.ADMIN_PASSWORD!;

const { data: authData, error: authError } =
  await supabaseAdmin.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
    user_metadata: {
      fullName: "Saksham Arya",
      country: "IN",
      username: "admin",
    },
  });

let supabaseId: string;

if (authError) {
  if (authError.message.includes("already registered")) {
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 100,
    });

    const existing = list.users.find((u) => u.email === adminEmail);
    if (!existing) throw new Error("Admin exists but not found");

    supabaseId = existing.id;
  } else {
    throw authError;
  }
} else {
  supabaseId = authData.user!.id;
}

await prisma.user.upsert({
  where: { supabaseAuthId: supabaseId },
  update: { role: "SUPER_ADMIN" },
  create: {
    supabaseAuthId: supabaseId,
    email: adminEmail,
    fullName: "Saksham Arya",
    username: "admin",
    role: "SUPER_ADMIN",
    referralCode: "ADMIN001",
    country: "IN",
    xp: 10000,
    tier: "GOLD",
  },
});
    console.log(`👑 SUCCESS: Admin account created!`);
    console.log(`📧 Email: ${adminEmail}`);
    console.log(`🔑 Password: ${adminPassword}`);
    console.log(`⚠️  Delete the password from seed.ts after running!`);
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

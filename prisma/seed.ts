import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// 1. Setup Database Connection
// --- 1. Updated Database Connection with longer timeouts ---
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 30000, // Wait 30s to connect
  idleTimeoutMillis: 30000,       // Keep connection alive 30s
  max: 1,                         // For seeding, 1 connection is safer
  ssl: { rejectUnauthorized: false } 
});
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

// 2. Setup Supabase Admin Client (using Service Role Key)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Use Service Role Key for "God Mode"
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  console.log("🌱 Starting Full System Seed...");

  // --- 1. SETTINGS SEED ---
  await prisma.platformSettings.upsert({
    where: { id: 'global-settings' },
    update: {},
    create: {
      id: 'global-settings',
      welcomeBonusSats: 50,
      minWithdrawalSats: 25000,
      baseXpPerTask: 10
    },
  });
  console.log("✅ Platform settings initialized.");

  // --- 2. ADMIN CREATION (AUTH + DB) ---
  const adminEmail = "admin@satsearn.com";
  const adminPassword = "SuperSecurePassword123!"; // Change this immediately!

  console.log(`Checking for admin: ${adminEmail}...`);

  // Try to create the user in Supabase Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true, // Bypasses email verification
    user_metadata: { fullName: "Saksham Arya", country: "IN" }
  });

  let supabaseId: string;

  if (authError) {
    if (authError.message.includes("already registered")) {
       // If already in Auth, fetch their ID
       const { data: list } = await supabaseAdmin.auth.admin.listUsers();
       supabaseId = list.users.find(u => u.email === adminEmail)!.id;
       console.log("ℹ️ Admin already exists in Supabase Auth. Syncing to Prisma...");
    } else {
      throw authError;
    }
  } else {
    supabaseId = authData.user!.id;
    console.log("✨ New Admin created in Supabase Auth.");
  }

  // --- 3. PRISMA ADMIN SYNC ---
  await prisma.user.upsert({
    where: { supabaseAuthId: supabaseId },
    update: { role: 'SUPER_ADMIN' },
    create: {
      supabaseAuthId: supabaseId,
      email: adminEmail,
      fullName: "Saksham Arya",
      role: 'SUPER_ADMIN',
      referralCode: "BOSS001",
      country: "IN",
      xp: 10000,
      tier: 'GOLD'
    },
  });

  console.log(`👑 SUCCESS: Admin account created!`);
  console.log(`📧 Email: ${adminEmail}`);
  console.log(`🔑 Password: ${adminPassword}`);
  console.log(`⚠️  Delete the password from seed.ts after running!`);
}

main()
  .catch((e) => { console.error("❌ Seed failed:", e); process.exit(1); })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
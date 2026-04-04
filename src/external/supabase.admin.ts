import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('⚠️ Missing Supabase Admin environment variables. Check your .env file.');
}

// 👑 THE ADMIN CLIENT
// This uses the service_role key. It bypasses all RLS rules and allows 
// you to manage the Auth system directly. NEVER expose this to the frontend.
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false, // We don't need to maintain a session for server-side admin tasks
  },
});
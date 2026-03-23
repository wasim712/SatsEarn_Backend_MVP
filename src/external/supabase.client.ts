import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

export const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY // Using the service role key to bypass RLS during server-side operations
);
import { createClient } from '@supabase/supabase-js'

// The publishable key is safe to ship in a website — your data is protected by
// the Row Level Security rules in the database, not by hiding this key.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://jeqawmdnfnzyzzlshixi.supabase.co'
const key = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_Zf3JV5uwwUgfDAupptH1nQ_D6l_9y8r'

export const supabase = createClient(url, key)

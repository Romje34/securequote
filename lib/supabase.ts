import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://djkiswjhozuqnskgdjlr.supabase.co";

const supabaseKey = "sb_publishable_bnUY9bAuts7HVag34CjYAQ_ZSP1JUas";

export const supabase = createClient(supabaseUrl, supabaseKey);
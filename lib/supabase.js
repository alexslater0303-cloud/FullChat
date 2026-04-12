const { createClient } = require('@supabase/supabase-js');
if (!process.env.SUPABASE_URL) throw new Error('SUPABASE_URL env var is missing');
if (!process.env.SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_KEY env var is missing');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
module.exports = { supabase };

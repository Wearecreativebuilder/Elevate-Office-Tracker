// Public Supabase client configuration for the Elevate member portal.
// SUPABASE_ANON_KEY is a browser-safe publishable key, not a service role key.
// All confidential access must be protected by database RLS.
export default function handler(req,res) {
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'})}
  res.setHeader('Cache-Control','no-store, max-age=0');
  const supabaseUrl=process.env.SUPABASE_URL||'';
  const supabaseAnonKey=process.env.SUPABASE_ANON_KEY||'';
  if(!supabaseUrl||!supabaseAnonKey)return res.status(503).json({error:'Member authentication has not been configured'});
  try {
    const u=new URL(supabaseUrl);
    if(u.protocol!=='https:')throw Error('Invalid URL');
  } catch {return res.status(503).json({error:'Invalid authentication configuration'})}
  return res.status(200).json({supabaseUrl,supabaseAnonKey});
}

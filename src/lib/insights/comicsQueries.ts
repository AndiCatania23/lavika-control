import { supabaseServer } from '@/lib/supabaseServer';
import { unavailableComics, type ComicsInsights } from './comics';
export async function loadComicsInsights(token: string | undefined): Promise<ComicsInsights> {
  if (!supabaseServer || !token) return unavailableComics;
  try {
    // Same authorization as existing Control APIs: validated JWT + dev_admins.
    const {data: {user}, error: authError} = await supabaseServer.auth.getUser(token);
    if (authError || !user) return unavailableComics;
    const admin = await supabaseServer.from('dev_admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (admin.error || !admin.data) return unavailableComics;
    const { data,error } = await supabaseServer.rpc('comics_insights');
    if (error || !data || !Array.isArray(data.rows) || !Array.isArray(data.daily) || typeof data.startedAt!=='string' || typeof data.generatedAt!=='string') return unavailableComics;
    return { available:true, startedAt:data.startedAt, generatedAt:data.generatedAt, rows:data.rows, daily:data.daily };
  } catch { return unavailableComics; }
}

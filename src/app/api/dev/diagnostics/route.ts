import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

type TableName = 'user_profile' | 'user_profiles';

async function getTableCount(table: TableName): Promise<number | null> {
  if (!supabaseServer) return null;

  const { count, error } = await supabaseServer
    .from(table)
    .select('*', { count: 'exact', head: true });

  if (error) return null;
  return count ?? 0;
}

export async function GET() {
  const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);

  const env = {
    hasSupabaseUrl,
    hasAnonKey,
    hasServiceRoleKey,
    hasGeminiKey,
  };

  if (!supabaseServer) {
    return NextResponse.json({
      environment: env,
      database: {
        connected: false,
        tables: {
          user_profile: null,
          user_profiles: null,
        },
      },
      recommendations: [
        'Imposta SUPABASE_SERVICE_ROLE_KEY per abilitare diagnostica e scrittura feed server-side.',
      ],
    });
  }

  const [userProfile, userProfiles] = await Promise.all([
    getTableCount('user_profile'),
    getTableCount('user_profiles'),
  ]);

  const counts = {
    user_profile: userProfile,
    user_profiles: userProfiles,
  };

  const recommendations: string[] = [];
  if ((userProfile ?? 0) === 0 && (userProfiles ?? 0) === 0) {
    recommendations.push('Popola la tabella user_profile (o user_profiles) con display_name e avatar.');
  }
  if (!hasGeminiKey) {
    recommendations.push('Imposta GEMINI_API_KEY per abilitare la generazione manuale delle pills.');
  }

  return NextResponse.json({
    environment: env,
    database: {
      connected: true,
      tables: counts,
    },
    recommendations,
  });
}

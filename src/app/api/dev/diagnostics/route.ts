import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { listGithubWorkflows } from '@/lib/githubWorkflows';

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
  const hasGithubToken = Boolean(process.env.GITHUB_TOKEN);

  const env = {
    hasSupabaseUrl,
    hasAnonKey,
    hasServiceRoleKey,
    hasGithubToken,
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

  const [userProfile, userProfiles, workflowList] = await Promise.all([
    getTableCount('user_profile'),
    getTableCount('user_profiles'),
    listGithubWorkflows(),
  ]);

  const counts = {
    user_profile: userProfile,
    user_profiles: userProfiles,
  };

  const recommendations: string[] = [];
  if ((userProfile ?? 0) === 0 && (userProfiles ?? 0) === 0) {
    recommendations.push('Popola la tabella user_profile (o user_profiles) con display_name e avatar.');
  }
  if (workflowList.length === 0) {
    recommendations.push('Verifica GITHUB_TOKEN e GITHUB_REPO per leggere workflow/runs reali.');
  }

  return NextResponse.json({
    environment: env,
    database: {
      connected: true,
      tables: counts,
    },
    github: {
      workflows: workflowList.length,
    },
    recommendations,
  });
}

import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { mapAuthUserToDevUser, type UserSessionAggregate } from '@/lib/devControl/serverData';

interface ProfileOverride {
  displayName?: string;
  avatarUrl?: string;
}

async function loadProfileByUserId(userId: string): Promise<ProfileOverride | undefined> {
  const client = supabaseServer;
  if (!client) return undefined;

  const parseProfile = (row: Record<string, unknown>): ProfileOverride => ({
    displayName: typeof (row.display_name ?? row.displayName ?? row.full_name ?? row.name) === 'string'
      ? String(row.display_name ?? row.displayName ?? row.full_name ?? row.name)
      : undefined,
    avatarUrl: typeof (row.avatarUrl ?? row.avatar_url ?? row.picture) === 'string'
      ? String(row.avatarUrl ?? row.avatar_url ?? row.picture)
      : undefined,
  });

  const tryTable = async (tableName: 'user_profile' | 'user_profiles') => {
    const byUserIdResponse = await client
      .from(tableName)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!byUserIdResponse.error && byUserIdResponse.data) {
      return parseProfile(byUserIdResponse.data as Record<string, unknown>);
    }

    const byIdResponse = await client
      .from(tableName)
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (byIdResponse.error || !byIdResponse.data) return undefined;
    return parseProfile(byIdResponse.data as Record<string, unknown>);
  };

  const primary = await tryTable('user_profile');
  if (primary) return primary;
  return tryTable('user_profiles');
}

async function loadSessionAggregateByUserId(userId: string): Promise<UserSessionAggregate | undefined> {
  const client = supabaseServer;
  if (!client) return undefined;

  const [{ count }, { data }] = await Promise.all([
    client
      .from('user_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    client
      .from('user_sessions')
      .select('last_seen_at')
      .eq('user_id', userId)
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    sessionsCount: count ?? 0,
    lastSeenAt: (data as { last_seen_at?: string | null } | null)?.last_seen_at ?? undefined,
  };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseServer) {
    return NextResponse.json(null, { status: 404 });
  }

  const { id } = await params;
  const { data, error } = await supabaseServer.auth.admin.getUserById(id);

  if (error || !data?.user) {
    return NextResponse.json(null, { status: 404 });
  }

  const profile = await loadProfileByUserId(id);
  const sessionAggregate = await loadSessionAggregateByUserId(id);
  return NextResponse.json(mapAuthUserToDevUser(data.user, profile, sessionAggregate));
}

import { NextResponse } from 'next/server';
import type { User } from '@/mocks/users';
import { supabaseServer } from '@/lib/supabaseServer';
import { mapAuthUserToDevUser, type UserSessionAggregate } from '@/lib/devControl/serverData';

interface ProfileOverride {
  displayName?: string;
  avatarUrl?: string;
}

function mapProfileRow(row: Record<string, unknown>): { userId: string; profile: ProfileOverride } | null {
  const userIdRaw = row.user_id ?? row.id;
  if (typeof userIdRaw !== 'string' || userIdRaw.trim().length === 0) {
    return null;
  }

  const displayNameRaw = row.display_name ?? row.name ?? row.full_name;
  const avatarRaw = row.avatarUrl ?? row.avatar_url ?? row.picture;

  return {
    userId: userIdRaw,
    profile: {
      displayName: typeof displayNameRaw === 'string' ? displayNameRaw : undefined,
      avatarUrl: typeof avatarRaw === 'string' ? avatarRaw : undefined,
    },
  };
}

async function loadProfilesByUserIds(userIds: string[]): Promise<Map<string, ProfileOverride>> {
  const client = supabaseServer;
  if (!client || userIds.length === 0) return new Map();

  const map = new Map<string, ProfileOverride>();

  const tryTable = async (tableName: 'user_profile' | 'user_profiles') => {
    const byUserIdResponse = await client
      .from(tableName)
      .select('*')
      .in('user_id', userIds);

    if (!byUserIdResponse.error && byUserIdResponse.data) {
      for (const row of byUserIdResponse.data as Record<string, unknown>[]) {
        const mapped = mapProfileRow(row);
        if (mapped) {
          map.set(mapped.userId, mapped.profile);
        }
      }
      return true;
    }

    const byIdResponse = await client
      .from(tableName)
      .select('*')
      .in('id', userIds);

    if (byIdResponse.error || !byIdResponse.data) {
      return false;
    }

    for (const row of byIdResponse.data as Record<string, unknown>[]) {
      const mapped = mapProfileRow(row);
      if (mapped) {
        map.set(mapped.userId, mapped.profile);
      }
    }

    return true;
  };

  const loadedFromPrimary = await tryTable('user_profile');
  if (!loadedFromPrimary) {
    await tryTable('user_profiles');
  }

  return map;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

async function loadSessionAggregatesByUserIds(userIds: string[]): Promise<Map<string, UserSessionAggregate>> {
  const client = supabaseServer;
  if (!client || userIds.length === 0) return new Map();

  const map = new Map<string, UserSessionAggregate>();
  const chunks = chunkArray(userIds, 200);
  const pageSize = 1000;

  for (const chunk of chunks) {
    for (let page = 0; page < 50; page += 1) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await client
        .from('user_sessions')
        .select('user_id,last_seen_at')
        .in('user_id', chunk)
        .order('last_seen_at', { ascending: false })
        .range(from, to);

      if (error || !data || data.length === 0) break;

      for (const row of data as Array<{ user_id: string; last_seen_at: string }>) {
        const current = map.get(row.user_id);
        if (!current) {
          map.set(row.user_id, { sessionsCount: 1, lastSeenAt: row.last_seen_at });
          continue;
        }

        current.sessionsCount += 1;
        if (!current.lastSeenAt || new Date(row.last_seen_at).getTime() > new Date(current.lastSeenAt).getTime()) {
          current.lastSeenAt = row.last_seen_at;
        }
      }

      if (data.length < pageSize) break;
    }
  }

  return map;
}

async function listAllUsers() {
  if (!supabaseServer) return [];

  const allAuthUsers: Array<Awaited<ReturnType<typeof supabaseServer.auth.admin.listUsers>>['data']['users'][number]> = [];
  const perPage = 200;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseServer.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error('Error listing users:', error);
      break;
    }

    const batch = data?.users ?? [];
    allAuthUsers.push(...batch);

    if (batch.length < perPage) break;
  }

  const profileMap = await loadProfilesByUserIds(allAuthUsers.map(user => user.id));
  const sessionMap = await loadSessionAggregatesByUserIds(allAuthUsers.map(user => user.id));
  const allUsers: User[] = allAuthUsers.map(user => mapAuthUserToDevUser(user, profileMap.get(user.id), sessionMap.get(user.id)));

  return allUsers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json([]);
  }

  const users = await listAllUsers();
  return NextResponse.json(users);
}

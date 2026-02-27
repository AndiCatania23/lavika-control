import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

interface AdminRow {
  id?: string;
  user_id?: string;
  role?: string;
  permissions?: unknown;
}

interface AdminView {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
}

function parsePermissions(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }

  return [];
}

function resolveDisplayName(email: string | null | undefined, metadata: Record<string, unknown> | undefined): string {
  const candidates = [metadata?.display_name, metadata?.full_name, metadata?.name];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  if (typeof email === 'string' && email.includes('@')) {
    return email.split('@')[0];
  }

  return 'Admin';
}

export async function GET() {
  const client = supabaseServer;

  if (!client) {
    return NextResponse.json([]);
  }

  const { data: rows, error } = await client
    .from('dev_admins')
    .select('*')
    .order('created_at', { ascending: true });

  if (error || !rows) {
    return NextResponse.json([]);
  }

  const normalizedRows = (rows as AdminRow[])
    .filter(row => typeof row.user_id === 'string' && row.user_id.length > 0)
    .map(row => ({
      id: typeof row.id === 'string' && row.id.length > 0 ? row.id : String(row.user_id),
      userId: String(row.user_id),
      role: typeof row.role === 'string' && row.role.length > 0 ? row.role : 'admin',
      permissions: parsePermissions(row.permissions),
    }));

  const adminViews: AdminView[] = await Promise.all(
    normalizedRows.map(async row => {
      const { data } = await client.auth.admin.getUserById(row.userId);
      const authUser = data?.user;
      const email = authUser?.email ?? '-';
      const metadata = (authUser?.user_metadata as Record<string, unknown> | undefined) ?? undefined;

      return {
        id: row.id,
        userId: row.userId,
        role: row.role,
        permissions: row.permissions,
        email,
        name: resolveDisplayName(email, metadata),
      };
    })
  );

  return NextResponse.json(adminViews);
}

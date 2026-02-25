'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getUserById, User, getSessions, Session } from '@/lib/data';
import { StatusPill } from '@/components/StatusPill';
import { ArrowLeft, MapPin, Calendar, CreditCard, Clock } from 'lucide-react';

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = params.id as string;
    Promise.all([
      getUserById(id),
      getSessions(),
    ]).then(([userData, sessionsData]) => {
      setUser(userData || null);
      setSessions(sessionsData.filter(s => s.userId === id).slice(0, 5));
      setLoading(false);
    });
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">User not found</p>
        <button
          onClick={() => router.push('/users')}
          className="mt-4 text-primary hover:underline"
        >
          Back to users
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push('/users')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to users
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xl font-medium">
                {user.avatar}
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-foreground">{user.name}</h2>
                <p className="text-muted-foreground">{user.email}</p>
                <div className="flex items-center gap-4 mt-3">
                  <StatusPill status={user.status} />
                  <span className={`text-xs px-2 py-1 rounded ${
                    user.badge === 'gold' ? 'bg-yellow-500/20 text-yellow-400' :
                    user.badge === 'silver' ? 'bg-gray-400/20 text-gray-300' :
                    'bg-amber-700/20 text-amber-600'
                  }`}>
                    {user.badge.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="font-semibold text-foreground mb-4">Recent Sessions</h3>
            {sessions.length > 0 ? (
              <div className="space-y-3">
                {sessions.map(session => (
                  <div key={session.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="text-sm text-foreground">{session.device}</div>
                        <div className="text-xs text-muted-foreground">{session.browser}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-foreground">{session.location}</div>
                      <div className="text-xs text-muted-foreground">{new Date(session.createdAt).toLocaleString('en-GB')}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No sessions found</p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="font-semibold text-foreground mb-4">Details</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Joined</div>
                  <div className="text-sm text-foreground">{new Date(user.createdAt).toLocaleDateString('en-GB')}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Last Login</div>
                  <div className="text-sm text-foreground">{new Date(user.lastLogin).toLocaleString('en-GB')}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Location</div>
                  <div className="text-sm text-foreground">Milan, Italy</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Total Revenue</div>
                  <div className="text-sm text-foreground">${user.revenue}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="font-semibold text-foreground mb-4">Activity</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sessions</span>
                <span className="text-foreground">{user.sessionsCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Avg. Session</span>
                <span className="text-foreground">12m</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

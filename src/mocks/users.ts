export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string;
  avatarUrl?: string;
  badge: 'bronze' | 'silver' | 'gold';
  status: 'active' | 'inactive' | 'suspended';
  createdAt: string;
  lastLogin: string;
  sessionsCount: number;
  revenue: number;
}

export const users: User[] = [
  {
    id: 'usr_001',
    email: 'mario.rossi@example.com',
    name: 'Mario Rossi',
    avatar: 'MR',
    badge: 'gold',
    status: 'active',
    createdAt: '2024-01-15T10:30:00Z',
    lastLogin: '2025-02-25T08:45:00Z',
    sessionsCount: 342,
    revenue: 5999,
  },
  {
    id: 'usr_002',
    email: 'giulia.bianchi@example.com',
    name: 'Giulia Bianchi',
    avatar: 'GB',
    badge: 'silver',
    status: 'active',
    createdAt: '2024-02-20T14:22:00Z',
    lastLogin: '2025-02-24T16:30:00Z',
    sessionsCount: 187,
    revenue: 999,
  },
  {
    id: 'usr_003',
    email: 'luca.verdi@example.com',
    name: 'Luca Verdi',
    avatar: 'LV',
    badge: 'bronze',
    status: 'active',
    createdAt: '2024-03-10T09:15:00Z',
    lastLogin: '2025-02-23T11:20:00Z',
    sessionsCount: 45,
    revenue: 0,
  },
  {
    id: 'usr_004',
    email: 'anna.neri@example.com',
    name: 'Anna Neri',
    avatar: 'AN',
    badge: 'silver',
    status: 'active',
    createdAt: '2024-04-05T16:45:00Z',
    lastLogin: '2025-02-25T09:10:00Z',
    sessionsCount: 234,
    revenue: 999,
  },
  {
    id: 'usr_005',
    email: 'paolo.gialli@example.com',
    name: 'Paolo Gialli',
    avatar: 'PG',
    badge: 'gold',
    status: 'inactive',
    createdAt: '2024-01-22T11:00:00Z',
    lastLogin: '2025-01-15T14:30:00Z',
    sessionsCount: 89,
    revenue: 5999,
  },
  {
    id: 'usr_006',
    email: 'sofia.blu@example.com',
    name: 'Sofia Blu',
    avatar: 'SB',
    badge: 'bronze',
    status: 'active',
    createdAt: '2024-05-18T13:25:00Z',
    lastLogin: '2025-02-20T10:45:00Z',
    sessionsCount: 12,
    revenue: 0,
  },
  {
    id: 'usr_007',
    email: 'andrea.rosa@example.com',
    name: 'Andrea Rosa',
    avatar: 'AR',
    badge: 'silver',
    status: 'suspended',
    createdAt: '2024-02-14T08:30:00Z',
    lastLogin: '2025-02-10T15:00:00Z',
    sessionsCount: 156,
    revenue: 999,
  },
  {
    id: 'usr_008',
    email: 'elena.arancio@example.com',
    name: 'Elena Arancio',
    avatar: 'EA',
    badge: 'gold',
    status: 'active',
    createdAt: '2023-11-08T10:00:00Z',
    lastLogin: '2025-02-25T07:30:00Z',
    sessionsCount: 567,
    revenue: 5999,
  },
];

export function getUserById(id: string): User | undefined {
  return users.find(u => u.id === id);
}

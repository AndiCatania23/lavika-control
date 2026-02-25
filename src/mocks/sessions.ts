export interface Session {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  device: string;
  browser: string;
  ip: string;
  location: string;
  createdAt: string;
  duration: number;
  status: 'active' | 'expired';
}

export const sessions: Session[] = [
  {
    id: 'ses_001',
    userId: 'usr_001',
    userName: 'Mario Rossi',
    userEmail: 'mario.rossi@example.com',
    device: 'MacBook Pro',
    browser: 'Chrome 122',
    ip: '85.45.123.12',
    location: 'Milan, Italy',
    createdAt: '2025-02-25T08:45:00Z',
    duration: 3420,
    status: 'active',
  },
  {
    id: 'ses_002',
    userId: 'usr_004',
    userName: 'Anna Neri',
    userEmail: 'anna.neri@example.com',
    device: 'iPhone 15 Pro',
    browser: 'Safari 17',
    ip: '79.35.67.89',
    location: 'Rome, Italy',
    createdAt: '2025-02-25T09:10:00Z',
    duration: 1850,
    status: 'active',
  },
  {
    id: 'ses_003',
    userId: 'usr_002',
    userName: 'Giulia Bianchi',
    userEmail: 'giulia.bianchi@example.com',
    device: 'Windows PC',
    browser: 'Firefox 123',
    ip: '151.45.78.23',
    location: 'Florence, Italy',
    createdAt: '2025-02-24T16:30:00Z',
    duration: 5400,
    status: 'expired',
  },
  {
    id: 'ses_004',
    userId: 'usr_008',
    userName: 'Elena Arancio',
    userEmail: 'elena.arancio@example.com',
    device: 'MacBook Air',
    browser: 'Chrome 122',
    ip: '95.45.123.45',
    location: 'Turin, Italy',
    createdAt: '2025-02-25T07:30:00Z',
    duration: 2100,
    status: 'active',
  },
  {
    id: 'ses_005',
    userId: 'usr_003',
    userName: 'Luca Verdi',
    userEmail: 'luca.verdi@example.com',
    device: 'Android Phone',
    browser: 'Chrome 122',
    ip: '82.55.123.78',
    location: 'Bologna, Italy',
    createdAt: '2025-02-23T11:20:00Z',
    duration: 1800,
    status: 'expired',
  },
  {
    id: 'ses_006',
    userId: 'usr_006',
    userName: 'Sofia Blu',
    userEmail: 'sofia.blu@example.com',
    device: 'iPad Pro',
    browser: 'Safari 17',
    ip: '88.23.45.67',
    location: 'Naples, Italy',
    createdAt: '2025-02-20T10:45:00Z',
    duration: 900,
    status: 'expired',
  },
];

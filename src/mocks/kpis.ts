export interface Kpi {
  id: string;
  title: string;
  value: string;
  delta: string;
  deltaType: 'positive' | 'negative' | 'neutral';
  sparkline: number[];
}

export const kpis: Kpi[] = [
  {
    id: 'total_users',
    title: 'Total Users',
    value: '12,847',
    delta: '+12.5%',
    deltaType: 'positive',
    sparkline: [45, 52, 48, 61, 55, 67, 72, 78, 85, 92, 88, 95],
  },
  {
    id: 'new_users_7d',
    title: 'New Users (7d)',
    value: '342',
    delta: '+8.2%',
    deltaType: 'positive',
    sparkline: [28, 32, 35, 31, 38, 42, 45, 48, 52, 49, 55, 58],
  },
  {
    id: 'new_users_30d',
    title: 'New Users (30d)',
    value: '1,247',
    delta: '+5.1%',
    deltaType: 'positive',
    sparkline: [120, 135, 142, 138, 155, 162, 170, 178, 185, 192, 198, 205],
  },
  {
    id: 'premium_users',
    title: 'Premium Users',
    value: '2,156',
    delta: '+3.2%',
    deltaType: 'positive',
    sparkline: [18, 22, 25, 28, 32, 35, 38, 42, 45, 48, 52, 55],
  },
  {
    id: 'dau',
    title: 'Daily Active Users',
    value: '4,892',
    delta: '+2.8%',
    deltaType: 'positive',
    sparkline: [320, 345, 362, 358, 375, 390, 405, 412, 425, 438, 445, 452],
  },
  {
    id: 'mau',
    title: 'Monthly Active Users',
    value: '9,234',
    delta: '+4.1%',
    deltaType: 'positive',
    sparkline: [680, 720, 758, 795, 832, 870, 905, 942, 980, 1015, 1052, 1088],
  },
];

export const systemStatus = [
  { id: 'supabase', name: 'Supabase', status: 'operational' as const, latency: '45ms' },
  { id: 'r2', name: 'R2 Storage', status: 'operational' as const, latency: '23ms' },
  { id: 'vps', name: 'VPS Runner', status: 'operational' as const, latency: '12ms' },
];

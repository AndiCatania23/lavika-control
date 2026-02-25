'use client';

interface StatusPillProps {
  status: 'operational' | 'ok' | 'running' | 'success' | 'warning' | 'warn' | 'down' | 'failed' | 'error' | 'critical' | 'active' | 'inactive' | 'suspended' | 'paused' | 'cancelled' | 'expired';
  size?: 'sm' | 'md';
}

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  operational: { bg: 'bg-green-500/10', text: 'text-green-500', label: 'Operational' },
  ok: { bg: 'bg-green-500/10', text: 'text-green-500', label: 'OK' },
  running: { bg: 'bg-blue-500/10', text: 'text-blue-500', label: 'Running' },
  success: { bg: 'bg-green-500/10', text: 'text-green-500', label: 'Success' },
  warning: { bg: 'bg-yellow-500/10', text: 'text-yellow-500', label: 'Warning' },
  warn: { bg: 'bg-yellow-500/10', text: 'text-yellow-500', label: 'Warning' },
  down: { bg: 'bg-red-500/10', text: 'text-red-500', label: 'Down' },
  failed: { bg: 'bg-red-500/10', text: 'text-red-500', label: 'Failed' },
  error: { bg: 'bg-red-500/10', text: 'text-red-500', label: 'Error' },
  critical: { bg: 'bg-red-500/10', text: 'text-red-500', label: 'Critical' },
  active: { bg: 'bg-green-500/10', text: 'text-green-500', label: 'Active' },
  inactive: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Inactive' },
  suspended: { bg: 'bg-red-500/10', text: 'text-red-500', label: 'Suspended' },
  paused: { bg: 'bg-yellow-500/10', text: 'text-yellow-500', label: 'Paused' },
  cancelled: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Cancelled' },
  expired: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Expired' },
};

export function StatusPill({ status, size = 'md' }: StatusPillProps) {
  const config = statusConfig[status] || { bg: 'bg-muted', text: 'text-muted-foreground', label: status };
  
  return (
    <span className={`inline-flex items-center rounded-full ${config.bg} ${config.text} ${
      size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
    } font-medium`}>
      <span className={`w-1 h-1 rounded-full bg-current mr-1`} />
      {config.label}
    </span>
  );
}

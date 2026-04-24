'use client';

interface StatusPillProps {
  status: 'operational' | 'ok' | 'running' | 'success' | 'warning' | 'warn' | 'down' | 'failed' | 'error' | 'critical' | 'active' | 'inactive' | 'suspended' | 'paused' | 'cancelled' | 'expired' | string;
  size?: 'sm' | 'md';
}

type Variant = 'ok' | 'info' | 'warn' | 'err' | 'neutral';

const statusConfig: Record<string, { variant: Variant; label: string }> = {
  operational: { variant: 'ok',      label: 'Operational' },
  ok:          { variant: 'ok',      label: 'OK' },
  success:     { variant: 'ok',      label: 'Success' },
  active:      { variant: 'ok',      label: 'Active' },
  running:     { variant: 'info',    label: 'Running' },
  warning:     { variant: 'warn',    label: 'Warning' },
  warn:        { variant: 'warn',    label: 'Warning' },
  paused:      { variant: 'warn',    label: 'Paused' },
  down:        { variant: 'err',     label: 'Down' },
  failed:      { variant: 'err',     label: 'Failed' },
  error:       { variant: 'err',     label: 'Error' },
  critical:    { variant: 'err',     label: 'Critical' },
  suspended:   { variant: 'err',     label: 'Suspended' },
  inactive:    { variant: 'neutral', label: 'Inactive' },
  cancelled:   { variant: 'neutral', label: 'Cancelled' },
  expired:     { variant: 'neutral', label: 'Expired' },
};

export function StatusPill({ status, size = 'md' }: StatusPillProps) {
  const config = statusConfig[status] || { variant: 'neutral' as Variant, label: status };
  const variantClass =
    config.variant === 'ok'   ? 'pill-ok'
    : config.variant === 'warn' ? 'pill-warn'
    : config.variant === 'err'  ? 'pill-err'
    : config.variant === 'info' ? 'pill-info'
    : '';
  const sizeStyle = size === 'sm'
    ? { fontSize: 10, padding: '1px 6px' }
    : undefined;
  return (
    <span className={`pill ${variantClass}`} style={sizeStyle}>
      <span
        className="inline-block rounded-full"
        style={{
          width: 6,
          height: 6,
          background: 'currentColor',
          marginRight: 2,
        }}
      />
      {config.label}
    </span>
  );
}

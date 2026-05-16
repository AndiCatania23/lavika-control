import { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function InsightSection({ title, subtitle, children }: Props) {
  return (
    <section className="rounded-xl border border-[color:var(--hairline)] bg-card p-5 lg:p-6">
      <div className="mb-4 space-y-0.5">
        <h2 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-hi)]">{title}</h2>
        {subtitle ? (
          <p className="text-[12px] text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <div>{children}</div>
    </section>
  );
}

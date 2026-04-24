'use client';

import { ReactNode } from 'react';

interface SectionHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function SectionHeader({ title, description, actions }: SectionHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h2 className="lk-h1">{title}</h2>
        {description && (
          <p className="lk-caption mt-1">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 sm:gap-3 flex-wrap">{actions}</div>}
    </div>
  );
}

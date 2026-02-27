'use client';

import { useState, ReactNode } from 'react';
import { ChevronUp, ChevronDown, Search, ChevronLeft, ChevronRight } from 'lucide-react';

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchPlaceholder?: string;
  searchKeys?: (keyof T)[];
  onRowClick?: (item: T) => void;
  mobileColumnKeys?: string[];
  mobileDense?: boolean;
  mobileHideLabelKeys?: string[];
  mobileRowFooter?: (item: T) => ReactNode;
  mobileRowFooterSeparated?: boolean;
  mobileVariant?: 'cards' | 'table';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DataTable<T = Record<string, any>>({ 
  data, 
  columns, 
  searchPlaceholder = 'Search...',
  searchKeys = [],
  onRowClick,
  mobileColumnKeys,
  mobileDense = false,
  mobileHideLabelKeys = [],
  mobileRowFooter,
  mobileRowFooterSeparated = true,
  mobileVariant = 'cards',
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filteredData = data.filter(item => {
    if (!search || searchKeys.length === 0) return true;
    const searchLower = search.toLowerCase();
    return searchKeys.some(key => {
      const value = item[key];
      return value && String(value).toLowerCase().includes(searchLower);
    });
  });

  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortKey) return 0;
    const aVal = (a as Record<string, unknown>)[sortKey];
    const bVal = (b as Record<string, unknown>)[sortKey];
    if (aVal === bVal) return 0;
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    const comparison = String(aVal).localeCompare(String(bVal));
    return sortDir === 'asc' ? comparison : -comparison;
  });

  const totalPages = Math.ceil(sortedData.length / pageSize);
  const paginatedData = sortedData.slice((page - 1) * pageSize, page * pageSize);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const renderCellValue = (item: T, col: Column<T>) => {
    if (col.render) return col.render(item);
    return String((item as Record<string, unknown>)[col.key] ?? '-');
  };

  const mobileColumns = mobileColumnKeys && mobileColumnKeys.length > 0
    ? columns.filter(col => mobileColumnKeys.includes(col.key))
    : columns;
  const isMobileTable = mobileVariant === 'table';

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {columns.some(c => c.sortable) && (
          <div className="flex items-center gap-2">
            <select
              value={sortKey ?? ''}
              onChange={e => {
                const value = e.target.value;
                setSortKey(value || null);
                setPage(1);
              }}
              className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Ordina per</option>
              {columns.filter(c => c.sortable).map(col => (
                <option key={col.key} value={col.key}>{col.header}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))}
              className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground hover:bg-muted/30"
            >
              {sortDir === 'asc' ? 'A-Z' : 'Z-A'}
            </button>
          </div>
        )}
      </div>

      {mobileVariant === 'cards' && (
      <div className="md:hidden space-y-3">
        {paginatedData.map((item, i) => (
          <div
            key={i}
            onClick={() => onRowClick?.(item)}
            className={`bg-card border border-border rounded-lg ${mobileDense ? 'p-2.5 space-y-1' : 'p-4 space-y-2'} ${onRowClick ? 'cursor-pointer active:scale-[0.99]' : ''}`}
          >
            {mobileColumns.map(col => (
              <div key={col.key} className="flex items-start justify-between gap-3">
                {!mobileHideLabelKeys.includes(col.key) && (
                  <span className={`text-muted-foreground shrink-0 ${mobileDense ? 'text-[10px]' : 'text-xs'}`}>{col.header}</span>
                )}
                <div className={`${mobileDense ? 'text-xs' : 'text-sm'} text-foreground ${mobileHideLabelKeys.includes(col.key) ? 'w-full text-left' : 'text-right'} min-w-0`}>
                  {renderCellValue(item, col)}
                </div>
              </div>
            ))}
            {mobileRowFooter && (
              <div className={`${mobileRowFooterSeparated ? 'pt-1 border-t border-border/60' : ''} ${mobileDense ? 'mt-1' : 'mt-2'}`}>
                {mobileRowFooter(item)}
              </div>
            )}
          </div>
        ))}
        {paginatedData.length === 0 && (
          <div className="bg-card border border-border rounded-lg p-6 text-center text-sm text-muted-foreground">
            Nessun dato disponibile
          </div>
        )}
      </div>
      )}

      <div className={`${mobileVariant === 'table' ? 'block' : 'hidden md:block'} border border-border rounded-lg overflow-x-auto`}>
        <table className={`w-full ${isMobileTable ? 'min-w-full table-fixed' : 'min-w-[500px]'}`}>
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {columns.map(col => (
                  <th
                  key={col.key}
                  className={`${isMobileTable ? 'px-2 py-2 text-[10px] tracking-normal' : 'px-4 py-3 text-xs tracking-wider'} text-left font-medium text-muted-foreground uppercase ${
                    col.sortable ? 'cursor-pointer hover:text-foreground' : ''
                  } ${col.className || ''}`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortKey === col.key && (
                      sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((item, i) => (
              <tr
                key={i}
                className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors ${
                  onRowClick ? 'cursor-pointer' : ''
                }`}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map(col => (
                  <td key={col.key} className={`${isMobileTable ? 'px-2 py-2 text-xs' : 'px-4 py-3 text-sm'} text-foreground align-top overflow-hidden ${col.className || ''}`}>
                    {renderCellValue(item, col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, sortedData.length)} di {sortedData.length}
          </span>
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
              Math.max(0, page - 3),
              Math.min(totalPages, page + 2)
            ).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 rounded text-sm ${
                  page === p ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="md:hidden flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-2 rounded border border-border text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Prec
            </button>
            <span className="text-sm text-muted-foreground">{page}/{totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-2 rounded border border-border text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Succ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

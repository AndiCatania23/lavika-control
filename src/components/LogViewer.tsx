'use client';

import { useState, useRef, useEffect } from 'react';
import { Filter, ArrowDown, Pause, Play } from 'lucide-react';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

interface LogViewerProps {
  logs: LogEntry[];
  autoScroll?: boolean;
}

const levelColors = {
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
};

export function LogViewer({ logs, autoScroll: initialAutoScroll = true }: LogViewerProps) {
  const [filter, setFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [autoScroll, setAutoScroll] = useState(initialAutoScroll);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredLogs = filter === 'all' ? logs : logs.filter(l => l.level === filter);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll]);

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={filter}
            onChange={e => setFilter(e.target.value as typeof filter)}
            className="bg-transparent text-sm text-foreground border-none focus:outline-none"
          >
            <option value="all">All</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
            autoScroll ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {autoScroll ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          {autoScroll ? 'Auto' : 'Manual'}
          {autoScroll && <ArrowDown className="w-3 h-3 ml-1" />}
        </button>
      </div>
      
      <div
        ref={containerRef}
        className="h-80 overflow-auto p-4 font-mono text-xs space-y-1"
      >
        {filteredLogs.map((log, i) => (
          <div key={i} className="flex gap-3">
            <span className="text-muted-foreground shrink-0">
              {new Date(log.timestamp).toLocaleTimeString('en-GB')}
            </span>
            <span className={`uppercase font-medium shrink-0 w-12 ${levelColors[log.level]}`}>
              [{log.level}]
            </span>
            <span className="text-foreground">{log.message}</span>
          </div>
        ))}
        {filteredLogs.length === 0 && (
          <div className="text-muted-foreground text-center py-8">No logs to display</div>
        )}
      </div>
    </div>
  );
}

export const mockLogs: LogEntry[] = [
  { timestamp: '2025-02-25T14:30:00.000Z', level: 'info', message: 'Job started by admin' },
  { timestamp: '2025-02-25T14:30:01.000Z', level: 'info', message: 'Connecting to source API...' },
  { timestamp: '2025-02-25T14:30:02.000Z', level: 'info', message: 'Successfully connected to source' },
  { timestamp: '2025-02-25T14:30:05.000Z', level: 'info', message: 'Fetching records: page 1/125' },
  { timestamp: '2025-02-25T14:30:08.000Z', level: 'info', message: 'Processing batch of 100 records' },
  { timestamp: '2025-02-25T14:30:10.000Z', level: 'warn', message: 'Skipped record: missing required field "price"' },
  { timestamp: '2025-02-25T14:30:12.000Z', level: 'info', message: 'Inserted 45 new records' },
  { timestamp: '2025-02-25T14:30:14.000Z', level: 'info', message: 'Updated 12 existing records' },
  { timestamp: '2025-02-25T14:30:15.000Z', level: 'info', message: 'Fetching records: page 2/125' },
  { timestamp: '2025-02-25T14:30:20.000Z', level: 'info', message: 'Processing batch of 100 records' },
  { timestamp: '2025-02-25T14:30:25.000Z', level: 'info', message: 'Fetching records: page 3/125' },
  { timestamp: '2025-02-25T14:30:30.000Z', level: 'info', message: 'Job completed successfully' },
];

export interface ErrorLog {
  id: string;
  severity: 'error' | 'warning' | 'critical';
  source: string;
  message: string;
  stack?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  jobRunId?: string;
}

export const errors: ErrorLog[] = [
  {
    id: 'err_001',
    severity: 'critical',
    source: 'sync_engine',
    message: 'Connection timeout while fetching data from source API',
    stack: `Error: Connection timeout
    at SyncEngine.fetchData (/app/src/sync/engine.ts:145)
    at async SyncEngine.process (/app/src/sync/engine.ts:89)
    at async JobRunner.execute (/app/src/jobs/runner.ts:34)`,
    metadata: {
      sourceId: 'src_amazon',
      retryCount: 3,
      timeout: 30000,
    },
    timestamp: '2025-02-25T02:05:22Z',
    jobRunId: 'run_006',
  },
  {
    id: 'err_002',
    severity: 'error',
    source: 'database',
    message: 'Failed to insert record: unique constraint violation',
    stack: `Error: unique_constraint_violation
    at Database.insert (/app/src/db/client.ts:234)
    at async SyncEngine.saveRecord (/app/src/sync/engine.ts:178)`,
    metadata: {
      table: 'products',
      recordId: 'prod_45231',
      constraint: 'products_external_id_unique',
    },
    timestamp: '2025-02-25T02:10:45Z',
    jobRunId: 'run_006',
  },
  {
    id: 'err_003',
    severity: 'warning',
    source: 'integrity_scanner',
    message: 'Orphaned reference found: product category not found',
    metadata: {
      productId: 'prod_12456',
      categoryId: 'cat_missing_001',
      table: 'product_categories',
    },
    timestamp: '2025-02-23T03:08:12Z',
    jobRunId: 'run_005',
  },
  {
    id: 'err_004',
    severity: 'error',
    source: 'thumbnail_generator',
    message: 'Failed to process image: unsupported format',
    stack: `Error: Unsupported image format
    at ThumbnailGenerator.process (/app/src/media/thumbnails.ts:67)`,
    metadata: {
      fileId: 'file_98765',
      format: 'WEBP',
      size: '45MB',
    },
    timestamp: '2025-02-22T14:30:00Z',
  },
  {
    id: 'err_005',
    severity: 'critical',
    source: 'auth_service',
    message: 'Rate limit exceeded for API key',
    metadata: {
      apiKeyId: 'key_****4521',
      endpoint: '/api/v1/sync',
      limit: 1000,
      window: '1 hour',
    },
    timestamp: '2025-02-24T16:45:00Z',
  },
  {
    id: 'err_006',
    severity: 'warning',
    source: 'sync_engine',
    message: 'Skipped record due to missing required field',
    metadata: {
      sourceId: 'src_shopify',
      recordId: 'shop_78234',
      missingField: 'price',
    },
    timestamp: '2025-02-25T14:31:00Z',
    jobRunId: 'run_002',
  },
];

export function getErrors(filters?: { severity?: string; source?: string }): ErrorLog[] {
  let filtered = [...errors];
  if (filters?.severity) {
    filtered = filtered.filter(e => e.severity === filters.severity);
  }
  if (filters?.source) {
    filtered = filtered.filter(e => e.source === filters.source);
  }
  return filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function getErrorById(id: string): ErrorLog | undefined {
  return errors.find(e => e.id === id);
}

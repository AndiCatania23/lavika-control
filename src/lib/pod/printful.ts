// Printful API helper — server-side only.
// Docs: https://developers.printful.com/docs/

const API_BASE = process.env.PRINTFUL_API_BASE?.trim() || 'https://api.printful.com';

function getCreds(): { token: string; storeId: string } | null {
  const token = process.env.PRINTFUL_API_TOKEN?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token || !storeId) return null;
  return { token, storeId };
}

export function isPrintfulConfigured(): boolean {
  return getCreds() !== null;
}

async function pfFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const creds = getCreds();
  if (!creds) throw new Error('Printful not configured (PRINTFUL_API_TOKEN / PRINTFUL_STORE_ID)');

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${creds.token}`,
      'X-PF-Store-Id': creds.storeId,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Printful ${res.status}: ${text.slice(0, 200)}`);
  }

  const payload = (await res.json()) as { code: number; result: T; error?: { message?: string } };
  if (payload.code >= 400) {
    throw new Error(`Printful API error ${payload.code}: ${payload.error?.message ?? 'unknown'}`);
  }
  return payload.result;
}

// ─── Sync products ───

export type PrintfulSyncProductSummary = {
  id: number;
  external_id: string | null;
  name: string;
  variants: number;
  synced: number;
  thumbnail_url: string | null;
};

export async function listPrintfulSyncProducts(): Promise<PrintfulSyncProductSummary[]> {
  const result = await pfFetch<Array<{
    id: number;
    external_id?: string | null;
    name: string;
    variants?: number;
    synced?: number;
    thumbnail_url?: string | null;
  }>>('/store/products?limit=100');

  return result.map((p) => ({
    id: p.id,
    external_id: p.external_id ?? null,
    name: p.name,
    variants: p.variants ?? 0,
    synced: p.synced ?? 0,
    thumbnail_url: p.thumbnail_url ?? null,
  }));
}

export type PrintfulSyncVariant = {
  id: number;                 // sync_variant_id → salvato in shop_product_variants.pod_variant_id
  external_id: string | null;
  name: string;
  size: string | null;
  color: string | null;
  sku: string | null;
  retail_price: string | null;
  currency: string | null;
  product: {
    variant_id: number;       // catalog variant id Printful (blank)
    product_id: number;
    image: string | null;
    name: string;
  };
};

export type PrintfulSyncProductDetail = {
  sync_product: {
    id: number;
    external_id: string | null;
    name: string;
    thumbnail_url: string | null;
    is_ignored: boolean;
  };
  sync_variants: PrintfulSyncVariant[];
};

export async function getPrintfulSyncProduct(syncProductId: number): Promise<PrintfulSyncProductDetail> {
  const result = await pfFetch<{
    sync_product: {
      id: number;
      external_id?: string | null;
      name: string;
      thumbnail_url?: string | null;
      is_ignored?: boolean;
    };
    sync_variants: Array<{
      id: number;
      external_id?: string | null;
      name: string;
      size?: string | null;
      color?: string | null;
      sku?: string | null;
      retail_price?: string | null;
      currency?: string | null;
      product: {
        variant_id: number;
        product_id: number;
        image?: string | null;
        name: string;
      };
    }>;
  }>(`/store/products/${syncProductId}`);

  return {
    sync_product: {
      id: result.sync_product.id,
      external_id: result.sync_product.external_id ?? null,
      name: result.sync_product.name,
      thumbnail_url: result.sync_product.thumbnail_url ?? null,
      is_ignored: Boolean(result.sync_product.is_ignored),
    },
    sync_variants: result.sync_variants.map((v) => ({
      id: v.id,
      external_id: v.external_id ?? null,
      name: v.name,
      size: v.size ?? null,
      color: v.color ?? null,
      sku: v.sku ?? null,
      retail_price: v.retail_price ?? null,
      currency: v.currency ?? null,
      product: {
        variant_id: v.product.variant_id,
        product_id: v.product.product_id,
        image: v.product.image ?? null,
        name: v.product.name,
      },
    })),
  };
}

// ─── Orders (per il futuro cron forwarder — non usato qui) ───

export type PrintfulOrderInput = {
  external_id: string;                    // shop_orders.order_number per matching
  recipient: {
    name: string;
    address1: string;
    address2?: string | null;
    city: string;
    state_code?: string | null;
    country_code: string;                 // 'IT'
    zip: string;
    phone?: string | null;
    email?: string | null;
  };
  items: Array<{
    sync_variant_id: number;              // dal shop_product_variants.pod_variant_id
    quantity: number;
  }>;
  retail_costs?: {
    currency?: string;
    subtotal?: string;
    shipping?: string;
    tax?: string;
    total?: string;
  };
};

export type PrintfulOrderSummary = {
  id: number;
  external_id: string | null;
  status: string;                         // draft | pending | failed | canceled | fulfilled | inprocess | partial | onhold
  shipments: Array<{
    tracking_number: string | null;
    tracking_url: string | null;
    carrier: string | null;
    shipped_at: number | null;            // unix timestamp
  }>;
};

export async function createPrintfulOrder(input: PrintfulOrderInput, confirm = false): Promise<PrintfulOrderSummary> {
  const path = confirm ? '/orders?confirm=true' : '/orders';
  const result = await pfFetch<{
    id: number;
    external_id?: string | null;
    status: string;
    shipments?: Array<{
      tracking_number?: string | null;
      tracking_url?: string | null;
      carrier?: string | null;
      shipped_at?: number | null;
    }>;
  }>(path, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return {
    id: result.id,
    external_id: result.external_id ?? null,
    status: result.status,
    shipments: (result.shipments ?? []).map((s) => ({
      tracking_number: s.tracking_number ?? null,
      tracking_url: s.tracking_url ?? null,
      carrier: s.carrier ?? null,
      shipped_at: s.shipped_at ?? null,
    })),
  };
}

export async function getPrintfulOrder(orderId: number): Promise<PrintfulOrderSummary> {
  const result = await pfFetch<{
    id: number;
    external_id?: string | null;
    status: string;
    shipments?: Array<{
      tracking_number?: string | null;
      tracking_url?: string | null;
      carrier?: string | null;
      shipped_at?: number | null;
    }>;
  }>(`/orders/${orderId}`);

  return {
    id: result.id,
    external_id: result.external_id ?? null,
    status: result.status,
    shipments: (result.shipments ?? []).map((s) => ({
      tracking_number: s.tracking_number ?? null,
      tracking_url: s.tracking_url ?? null,
      carrier: s.carrier ?? null,
      shipped_at: s.shipped_at ?? null,
    })),
  };
}

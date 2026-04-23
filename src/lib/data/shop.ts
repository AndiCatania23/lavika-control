// Shop data layer — client fetch wrapper per API /api/dev/shop/*

export type ProductType = 'felpa' | 'cappellino' | 'tshirt' | 'accessorio' | 'sticker';
export type ProductCategory = 'curva' | 'lavika' | 'everyday' | 'collector';
export type ProductTier = 'standard' | 'capsule' | 'collector' | 'coming_soon';
export type StadiumSector = 'sud' | 'nord' | 'tribuna_a' | 'tribuna_b' | 'tribuna_elite';
export type ProductBadge = 'new' | 'sale' | 'limited' | 'signed' | 'hot';
export type ProductStatus = 'draft' | 'active' | 'paused' | 'archived';

export interface ShopProductImage {
  id: string;
  url: string;
  alt_text: string | null;
  is_primary: boolean;
  sort_order: number;
  variant_size: string | null;
}

export interface ShopProductVariant {
  id: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  price_delta_eur: number;
  stock: number;
  low_stock_threshold: number;
  stripe_price_id: string | null;
  pod_provider: string | null;
  pod_variant_id: string | null;
  stock_managed: boolean;
}

export interface ShopProduct {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  product_type: ProductType;
  category: ProductCategory;
  tier: ProductTier;
  sector: StadiumSector | null;
  price_eur: number;
  price_original_eur: number | null;
  badge: ProductBadge | null;
  limited_edition_max: number | null;
  limited_edition_number: number | null;
  signed_by: string | null;
  signed_on: string | null;
  status: ProductStatus;
  stripe_product_id: string | null;
  sort_order: number;
  pod_provider: string | null;
  pod_product_id: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  // Joined
  images?: ShopProductImage[];
  variants?: ShopProductVariant[];
}

// Labels UI
export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  felpa: 'Felpa',
  cappellino: 'Cappellino',
  tshirt: 'T-Shirt',
  accessorio: 'Accessorio',
  sticker: 'Sticker',
};

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  curva: 'Tifoserie',
  lavika: 'Lavika Capsule',
  everyday: 'Everyday',
  collector: "Collector's",
};

export const TIER_LABELS: Record<ProductTier, string> = {
  standard: 'Standard',
  capsule: 'Capsule',
  collector: 'Collector',
  coming_soon: 'Coming Soon',
};

export const SECTOR_LABELS: Record<StadiumSector, string> = {
  sud: 'Curva Sud',
  nord: 'Curva Nord',
  tribuna_a: 'Tribuna A',
  tribuna_b: 'Tribuna B',
  tribuna_elite: 'Tribuna Elite',
};

export const STATUS_LABELS: Record<ProductStatus, string> = {
  draft: 'Bozza',
  active: 'Attivo',
  paused: 'In pausa',
  archived: 'Archiviato',
};

// ─── API functions ───

async function safeJson<T>(response: Response, fallback: T): Promise<T> {
  if (!response.ok) return fallback;
  return response.json() as Promise<T>;
}

async function assertOk(response: Response, action: string): Promise<void> {
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Errore sconosciuto' }));
    throw new Error((err as { error?: string }).error || `Errore ${action}`);
  }
}

export async function getShopProducts(): Promise<ShopProduct[]> {
  const res = await fetch('/api/dev/shop/products', { cache: 'no-store' });
  return safeJson(res, [] as ShopProduct[]);
}

export async function createShopProduct(product: Partial<ShopProduct>): Promise<ShopProduct> {
  const res = await fetch('/api/dev/shop/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product),
  });
  await assertOk(res, 'creazione prodotto');
  return res.json() as Promise<ShopProduct>;
}

export async function updateShopProduct(id: string, updates: Partial<ShopProduct>): Promise<ShopProduct> {
  const res = await fetch('/api/dev/shop/products', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...updates }),
  });
  await assertOk(res, 'aggiornamento prodotto');
  return res.json() as Promise<ShopProduct>;
}

export async function deleteShopProduct(id: string): Promise<void> {
  const res = await fetch(`/api/dev/shop/products?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  await assertOk(res, 'eliminazione prodotto');
}

// ─── Images ───
export async function addShopProductImage(payload: {
  product_id: string;
  url: string;
  alt_text?: string;
  is_primary?: boolean;
  sort_order?: number;
  variant_size?: string;
}): Promise<ShopProductImage> {
  const res = await fetch('/api/dev/shop/products/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await assertOk(res, 'aggiunta immagine');
  return res.json() as Promise<ShopProductImage>;
}

export async function updateShopProductImage(id: string, updates: Partial<ShopProductImage>): Promise<ShopProductImage> {
  const res = await fetch('/api/dev/shop/products/images', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...updates }),
  });
  await assertOk(res, 'aggiornamento immagine');
  return res.json() as Promise<ShopProductImage>;
}

export async function deleteShopProductImage(id: string): Promise<void> {
  const res = await fetch(`/api/dev/shop/products/images?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  await assertOk(res, 'eliminazione immagine');
}

// ─── Variants ───
export async function addShopProductVariant(payload: {
  product_id: string;
  sku?: string;
  size?: string;
  color?: string;
  price_delta_eur?: number;
  stock?: number;
  low_stock_threshold?: number;
}): Promise<ShopProductVariant> {
  const res = await fetch('/api/dev/shop/products/variants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await assertOk(res, 'aggiunta variante');
  return res.json() as Promise<ShopProductVariant>;
}

export async function updateShopProductVariant(id: string, updates: Partial<ShopProductVariant>): Promise<ShopProductVariant> {
  const res = await fetch('/api/dev/shop/products/variants', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...updates }),
  });
  await assertOk(res, 'aggiornamento variante');
  return res.json() as Promise<ShopProductVariant>;
}

export async function deleteShopProductVariant(id: string): Promise<void> {
  const res = await fetch(`/api/dev/shop/products/variants?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  await assertOk(res, 'eliminazione variante');
}

// ─── Orders ───

export type OrderStatus = 'pending' | 'paid' | 'fulfilling' | 'shipped' | 'delivered' | 'refunded' | 'cancelled';

export interface ShopOrderLineItem {
  product_id?: string;
  name?: string;
  image_url?: string;
  variant_id?: string;
  size?: string;
  color?: string;
  quantity: number;
  unit_price_eur?: number;
  unit_amount?: number; // cents (da Stripe)
}

export interface ShopOrder {
  id: string;
  order_number: string | null;
  user_id: string | null;
  stripe_session_id: string;
  stripe_payment_intent_id: string | null;
  stripe_customer_id: string | null;
  total_amount: number; // cents
  currency: string;
  status: OrderStatus;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  shipping_address: Record<string, unknown> | null;
  line_items: ShopOrderLineItem[];
  receipt_url: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf_url: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  shipping_carrier: string | null;
  staff_notes: string | null;
  fulfilled_by: string | null;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  updated_at: string;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'In attesa',
  paid: 'Pagato',
  fulfilling: 'In preparazione',
  shipped: 'Spedito',
  delivered: 'Consegnato',
  refunded: 'Rimborsato',
  cancelled: 'Cancellato',
};

export async function getShopOrders(statusFilter?: OrderStatus | 'all'): Promise<ShopOrder[]> {
  const qs = statusFilter && statusFilter !== 'all' ? `?status=${encodeURIComponent(statusFilter)}` : '';
  const res = await fetch(`/api/dev/shop/orders${qs}`, { cache: 'no-store' });
  return safeJson(res, [] as ShopOrder[]);
}

export async function updateShopOrder(
  id: string,
  updates: Partial<Pick<ShopOrder, 'status' | 'tracking_number' | 'tracking_url' | 'shipping_carrier' | 'staff_notes'>>,
  actor?: { id: string | null; email: string | null },
): Promise<ShopOrder> {
  const res = await fetch('/api/dev/shop/orders', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      ...updates,
      ...(actor ? { actor_id: actor.id, actor_email: actor.email } : {}),
    }),
  });
  await assertOk(res, 'aggiornamento ordine');
  return res.json() as Promise<ShopOrder>;
}

export type ShopOrderEvent = {
  id: string;
  event_type: 'status_changed' | 'tracking_updated' | 'note_updated' | 'fulfilled_by_set' | 'order_created';
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_email: string | null;
  data: Record<string, unknown>;
  created_at: string;
};

export async function getShopOrderEvents(orderId: string): Promise<ShopOrderEvent[]> {
  const res = await fetch(`/api/dev/shop/orders/${orderId}/events`, { cache: 'no-store' });
  await assertOk(res, 'caricamento eventi ordine');
  return res.json() as Promise<ShopOrderEvent[]>;
}

export function formatCents(cents: number, currency = 'EUR'): string {
  return `€${(cents / 100).toFixed(2)}`;
}

// ─── Banners ───

export type BannerType = 'drop' | 'auction' | 'sale' | 'signed' | 'preorder';
export type BannerAccent = 'red' | 'gold' | 'blue';

export interface ShopBanner {
  id: string;
  type: BannerType;
  headline: string;
  subline: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_href: string | null;
  accent_color: BannerAccent | null;
  priority: number;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export const BANNER_TYPE_LABELS: Record<BannerType, string> = {
  drop: 'Drop',
  auction: 'Asta',
  sale: 'Saldi',
  signed: 'Firmato',
  preorder: 'Pre-ordine',
};

export async function getShopBanners(): Promise<ShopBanner[]> {
  const res = await fetch('/api/dev/shop/banners', { cache: 'no-store' });
  return safeJson(res, [] as ShopBanner[]);
}

export async function createShopBanner(banner: Partial<ShopBanner>): Promise<ShopBanner> {
  const res = await fetch('/api/dev/shop/banners', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(banner),
  });
  await assertOk(res, 'creazione banner');
  return res.json() as Promise<ShopBanner>;
}

export async function updateShopBanner(id: string, updates: Partial<ShopBanner>): Promise<ShopBanner> {
  const res = await fetch('/api/dev/shop/banners', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...updates }),
  });
  await assertOk(res, 'aggiornamento banner');
  return res.json() as Promise<ShopBanner>;
}

export async function deleteShopBanner(id: string): Promise<void> {
  const res = await fetch(`/api/dev/shop/banners?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  await assertOk(res, 'eliminazione banner');
}

// ─── Utilities ───

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function formatPrice(eur: number): string {
  return `€${eur.toFixed(2)}`;
}

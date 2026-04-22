import Stripe from 'stripe';

// Sync prodotti Control → Stripe catalog.
// Pattern Stripe: Product (container) + Prices multipli (varianti).
// Per modifiche prezzo: archive old price + create new (Stripe Prices immutabili).

let _stripe: Stripe | null = null;
function getStripe(): Stripe | null {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  _stripe = new Stripe(key);
  return _stripe;
}

export interface StripeSyncProductInput {
  id: string;                     // supabase UUID → salva in metadata
  slug: string;
  name: string;
  description?: string | null;
  price_eur: number;              // prezzo base in EUR (intero)
  imageUrls?: string[];           // R2 URLs delle immagini (max 8 per Stripe)
  stripe_product_id?: string | null;  // se esiste già, update invece di create
}

export interface StripeSyncResult {
  stripe_product_id: string;
  stripe_price_id: string;
}

/**
 * Crea o aggiorna Product + Price su Stripe.
 * Ritorna gli ID Stripe da salvare in Supabase.
 *
 * Price changes: se esiste già un Product ma il prezzo cambia, archivia il
 * vecchio price e crea nuovo (Stripe Prices sono immutabili su amount).
 */
export async function syncProductToStripe(input: StripeSyncProductInput): Promise<StripeSyncResult | null> {
  const stripe = getStripe();
  if (!stripe) {
    console.warn('[stripeShopSync] STRIPE_SECRET_KEY non configurata, skip sync');
    return null;
  }

  const productPayload: Stripe.ProductCreateParams = {
    name: input.name,
    description: input.description || undefined,
    images: (input.imageUrls ?? []).slice(0, 8),
    metadata: {
      supabase_id: input.id,
      slug: input.slug,
    },
  };

  let productId = input.stripe_product_id ?? '';

  if (!productId) {
    // CREATE new product
    const product = await stripe.products.create(productPayload);
    productId = product.id;
  } else {
    // UPDATE existing product
    try {
      await stripe.products.update(productId, {
        name: productPayload.name,
        description: productPayload.description,
        images: productPayload.images,
        metadata: productPayload.metadata,
      });
    } catch (err) {
      // Se il prodotto Stripe e' stato cancellato, creane uno nuovo
      const errObj = err as { code?: string };
      if (errObj?.code === 'resource_missing') {
        const product = await stripe.products.create(productPayload);
        productId = product.id;
      } else {
        throw err;
      }
    }
  }

  // Gestione Price: cerca price attivo con stesso amount, altrimenti crea nuovo
  const amountCents = Math.round(input.price_eur * 100);
  const existingPrices = await stripe.prices.list({ product: productId, active: true, limit: 10 });

  let priceId: string | null = null;
  for (const p of existingPrices.data) {
    if (p.unit_amount === amountCents && p.currency === 'eur') {
      priceId = p.id;
      break;
    }
  }

  if (!priceId) {
    // Archivia i price attivi precedenti (amount diverso)
    for (const p of existingPrices.data) {
      await stripe.prices.update(p.id, { active: false });
    }
    // Crea nuovo price
    const newPrice = await stripe.prices.create({
      product: productId,
      unit_amount: amountCents,
      currency: 'eur',
      metadata: {
        supabase_product_id: input.id,
      },
    });
    priceId = newPrice.id;
  }

  return {
    stripe_product_id: productId,
    stripe_price_id: priceId,
  };
}

/**
 * Archive Stripe product (non elimina — Stripe non permette delete su prodotti
 * con storia di payment). Usato quando prodotto passa a status='archived' o viene
 * eliminato da Control.
 */
export async function archiveProductOnStripe(stripeProductId: string): Promise<void> {
  const stripe = getStripe();
  if (!stripe || !stripeProductId) return;

  try {
    await stripe.products.update(stripeProductId, { active: false });
  } catch (err) {
    const errObj = err as { code?: string };
    if (errObj?.code !== 'resource_missing') throw err;
  }
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

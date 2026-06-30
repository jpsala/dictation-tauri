import type { KvNamespaceLike } from "./admin-store";
import { getPricingSnapshot } from "./pricing-store";
import { refreshPricing } from "./pricing-refresh";
import { getPricingWatchlist, putManualPricingWatchlist, type PricingTarget, type PricingWatchlistSnapshot } from "./pricing-watchlist-store";

type RefreshPricingAdminOptions = {
  groqApiKey?: string | null;
  openrouterApiKey?: string | null;
  fetchImpl?: typeof fetch;
  now?: () => string;
};

export type PricingAdminSnapshot = {
  watchlist: PricingWatchlistSnapshot;
  pricing: Awaited<ReturnType<typeof getPricingSnapshot>>;
};

export async function getPricingAdminSnapshot(store: KvNamespaceLike): Promise<PricingAdminSnapshot> {
  const watchlist = await getPricingWatchlist(store);
  const pricing = await getPricingSnapshot(store, watchlist.merged);
  return { watchlist, pricing };
}

export async function updateManualPricingAdminWatchlist(
  store: KvNamespaceLike,
  targets: PricingTarget[],
): Promise<PricingAdminSnapshot> {
  await putManualPricingWatchlist(store, targets);
  return getPricingAdminSnapshot(store);
}

export async function refreshPricingAdmin(
  store: KvNamespaceLike,
  options: RefreshPricingAdminOptions = {},
): Promise<PricingAdminSnapshot> {
  await refreshPricing(store, options);
  return getPricingAdminSnapshot(store);
}

import { getShortingReadiness } from "@/lib/shorting-readiness";
import type { createServiceRoleClient } from "@/lib/supabase/server";

type ServiceSupabase = ReturnType<typeof createServiceRoleClient>;

export async function loadArtistShortingEligibility(supabase: ServiceSupabase, artistId: string) {
  const { data, error } = await supabase
    .from("price_history")
    .select("price_date,price")
    .eq("artist_id", artistId)
    .order("price_date", { ascending: true });

  if (error) {
    throw new Error(`Could not verify short-selling eligibility: ${error.message}`);
  }

  return getShortingReadiness(
    (data ?? []).map((point) => ({
      date: point.price_date,
      price: Number(point.price)
    }))
  );
}

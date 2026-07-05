import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type SupabaseConfigStatus = {
  urlConfigured: boolean;
  anonKeyConfigured: boolean;
  serviceRoleConfigured: boolean;
  marketUpdateSecretConfigured: boolean;
  cronSecretConfigured: boolean;
  lastfmApiKeyConfigured: boolean;
  spotifyCredentialsConfigured: boolean;
  youtubeApiKeyConfigured: boolean;
  redditCredentialsConfigured: boolean;
  adminEmailsConfigured: boolean;
  readyForPublicReads: boolean;
  readyForAdminWrites: boolean;
};

export function getSupabaseConfigStatus(): SupabaseConfigStatus {
  const urlConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKeyConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const marketUpdateSecretConfigured = Boolean(process.env.MARKET_UPDATE_SECRET);
  const cronSecretConfigured = Boolean(process.env.CRON_SECRET);
  const lastfmApiKeyConfigured = Boolean(process.env.LASTFM_API_KEY);
  const spotifyCredentialsConfigured = Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
  const youtubeApiKeyConfigured = Boolean(process.env.YOUTUBE_API_KEY);
  const redditCredentialsConfigured = Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
  const adminEmailsConfigured = Boolean(process.env.ADMIN_EMAILS);

  return {
    urlConfigured,
    anonKeyConfigured,
    serviceRoleConfigured,
    marketUpdateSecretConfigured,
    cronSecretConfigured,
    lastfmApiKeyConfigured,
    spotifyCredentialsConfigured,
    youtubeApiKeyConfigured,
    redditCredentialsConfigured,
    adminEmailsConfigured,
    readyForPublicReads: urlConfigured && anonKeyConfigured,
    readyForAdminWrites: urlConfigured && serviceRoleConfigured && marketUpdateSecretConfigured
  };
}

export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase service role credentials are not configured.");
  }

  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export function createAnonServerClient(authorization?: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase anon credentials are not configured.");
  }

  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      headers: authorization ? { Authorization: authorization } : {}
    }
  });
}

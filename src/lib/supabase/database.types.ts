export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      artists: {
        Row: {
          id: string;
          name: string;
          ticker: string;
          current_price: number;
          previous_close: number;
          daily_change_percent: number;
          hype_score: number;
          volatility: number;
          category: "superstar" | "mainstream" | "rising" | "underground";
          accent: string;
          last_move_explanation: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          ticker: string;
          current_price: number;
          previous_close: number;
          daily_change_percent?: number;
          hype_score?: number;
          volatility?: number;
          category: "superstar" | "mainstream" | "rising" | "underground";
          accent?: string;
          last_move_explanation?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["artists"]["Insert"]>;
        Relationships: [];
      };
      artist_stats: {
        Row: {
          artist_id: string;
          streaming_growth: number;
          youtube_growth: number;
          search_growth: number;
          social_growth: number;
          news_score: number;
          trader_demand: number;
          updated_at: string;
        };
        Insert: {
          artist_id: string;
          streaming_growth?: number;
          youtube_growth?: number;
          search_growth?: number;
          social_growth?: number;
          news_score?: number;
          trader_demand?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["artist_stats"]["Insert"]>;
        Relationships: [];
      };
      artist_external_ids: {
        Row: {
          artist_id: string;
          spotify_id: string | null;
          youtube_channel_id: string | null;
          musicbrainz_id: string | null;
          lastfm_name: string | null;
          gdelt_query: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          artist_id: string;
          spotify_id?: string | null;
          youtube_channel_id?: string | null;
          musicbrainz_id?: string | null;
          lastfm_name?: string | null;
          gdelt_query?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["artist_external_ids"]["Insert"]>;
        Relationships: [];
      };
      price_history: {
        Row: {
          id: string;
          artist_id: string;
          price_date: string;
          price: number;
          hype_score: number;
          explanation: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          artist_id: string;
          price_date: string;
          price: number;
          hype_score: number;
          explanation: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["price_history"]["Insert"]>;
        Relationships: [];
      };
      market_observations: {
        Row: {
          id: string;
          artist_id: string;
          source: string;
          metric: string;
          observed_date: string;
          observed_at: string;
          value: number;
          unit: string;
          raw_payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          artist_id: string;
          source: string;
          metric: string;
          observed_date: string;
          observed_at?: string;
          value: number;
          unit?: string;
          raw_payload?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["market_observations"]["Insert"]>;
        Relationships: [];
      };
      market_events: {
        Row: {
          id: string;
          artist_id: string;
          event_date: string;
          event_type: "release" | "review" | "news" | "controversy" | "award" | "tour" | "viral";
          title: string;
          source_name: string | null;
          source_url: string | null;
          sentiment_score: number;
          impact_score: number;
          confidence: number;
          raw_payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          artist_id: string;
          event_date: string;
          event_type: "release" | "review" | "news" | "controversy" | "award" | "tour" | "viral";
          title: string;
          source_name?: string | null;
          source_url?: string | null;
          sentiment_score?: number;
          impact_score?: number;
          confidence?: number;
          raw_payload?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["market_events"]["Insert"]>;
        Relationships: [];
      };
      market_signal_snapshots: {
        Row: {
          id: string;
          artist_id: string;
          source_date: string;
          streaming_growth: number;
          youtube_growth: number;
          search_growth: number;
          social_growth: number;
          news_score: number;
          trader_demand: number;
          raw_payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          artist_id: string;
          source_date: string;
          streaming_growth?: number;
          youtube_growth?: number;
          search_growth?: number;
          social_growth?: number;
          news_score?: number;
          trader_demand?: number;
          raw_payload?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["market_signal_snapshots"]["Insert"]>;
        Relationships: [];
      };
      market_update_runs: {
        Row: {
          id: string;
          run_date: string;
          status: "running" | "succeeded" | "failed";
          source: string;
          started_at: string;
          completed_at: string | null;
          summary: Json;
          error_message: string | null;
        };
        Insert: {
          id?: string;
          run_date: string;
          status?: "running" | "succeeded" | "failed";
          source?: string;
          started_at?: string;
          completed_at?: string | null;
          summary?: Json;
          error_message?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["market_update_runs"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          username: string;
          cash_balance: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          cash_balance?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      holdings: {
        Row: {
          user_id: string;
          artist_id: string;
          shares: number;
          average_buy_price: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          artist_id: string;
          shares: number;
          average_buy_price: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["holdings"]["Insert"]>;
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          artist_id: string;
          type: "buy" | "sell";
          shares: number;
          price: number;
          cash_delta: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          artist_id: string;
          type: "buy" | "sell";
          shares: number;
          price: number;
          cash_delta: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["transactions"]["Insert"]>;
        Relationships: [];
      };
      watchlist: {
        Row: {
          user_id: string;
          artist_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          artist_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["watchlist"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      market_leaderboard: {
        Row: {
          user_id: string;
          username: string;
          portfolio_value: number;
          cash_balance: number;
          holdings_value: number;
          gain_percent: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      buy_artist_shares: {
        Args: {
          p_artist_id: string;
          p_shares: number;
        };
        Returns: Array<{
          transaction_id: string;
          artist_id: string;
          ticker: string;
          shares: number;
          execution_price: number;
          order_value: number;
          cash_balance: number;
          shares_owned: number;
          average_buy_price: number;
          updated_artist_price: number;
          price_impact_percent: number;
        }>;
      };
      sell_artist_shares: {
        Args: {
          p_artist_id: string;
          p_shares: number;
        };
        Returns: Array<{
          transaction_id: string;
          artist_id: string;
          ticker: string;
          shares: number;
          execution_price: number;
          order_value: number;
          cash_balance: number;
          shares_owned: number;
          average_buy_price: number;
          updated_artist_price: number;
          price_impact_percent: number;
        }>;
      };
    };
    Enums: {
      artist_category: "superstar" | "mainstream" | "rising" | "underground";
      transaction_type: "buy" | "sell";
      market_update_status: "running" | "succeeded" | "failed";
    };
    CompositeTypes: Record<string, never>;
  };
};

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
      market_controls: {
        Row: {
          id: boolean;
          trading_mode: "continuous" | "halted" | "maintenance";
          allow_trading: boolean;
          allow_market_impact: boolean;
          status_note: string;
          day_change_reset: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          trading_mode?: "continuous" | "halted" | "maintenance";
          allow_trading?: boolean;
          allow_market_impact?: boolean;
          status_note?: string;
          day_change_reset?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["market_controls"]["Insert"]>;
        Relationships: [];
      };
      artist_trading_halts: {
        Row: {
          artist_id: string;
          is_halted: boolean;
          reason: string;
          starts_at: string;
          ends_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          artist_id: string;
          is_halted?: boolean;
          reason?: string;
          starts_at?: string;
          ends_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["artist_trading_halts"]["Insert"]>;
        Relationships: [];
      };
      price_history: {
        Row: {
          id: string;
          artist_id: string;
          price_date: string;
          price: number;
          hype_score: number;
          model_version: string;
          explanation: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          artist_id: string;
          price_date: string;
          price: number;
          hype_score: number;
          model_version?: string;
          explanation: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["price_history"]["Insert"]>;
        Relationships: [];
      };
      price_ticks: {
        Row: {
          id: string;
          artist_id: string;
          observed_at: string;
          price: number;
          source: "market_run" | "trade" | "migration" | "manual";
          reference_id: string | null;
          model_version: string | null;
          raw_payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          artist_id: string;
          observed_at?: string;
          price: number;
          source?: "market_run" | "trade" | "migration" | "manual";
          reference_id?: string | null;
          model_version?: string | null;
          raw_payload?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["price_ticks"]["Insert"]>;
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
          model_version: string;
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
          model_version?: string;
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
          model_version: string;
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
          model_version?: string;
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
          bio: string;
          favorite_artist_ids: string[];
          avatar_url: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          cash_balance?: number;
          bio?: string;
          favorite_artist_ids?: string[];
          avatar_url?: string;
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
      short_positions: {
        Row: {
          user_id: string;
          artist_id: string;
          shares: number;
          average_short_price: number;
          collateral: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          artist_id: string;
          shares: number;
          average_short_price: number;
          collateral?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["short_positions"]["Insert"]>;
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
          gross_value: number;
          commission: number;
          market_eligible: boolean;
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
          gross_value?: number;
          commission?: number;
          market_eligible?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["transactions"]["Insert"]>;
        Relationships: [];
      };
      short_transactions: {
        Row: {
          id: string;
          user_id: string;
          artist_id: string;
          type: "short" | "cover";
          shares: number;
          price: number;
          cash_delta: number;
          gross_value: number;
          commission: number;
          collateral_delta: number;
          realized_pnl: number;
          market_eligible: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          artist_id: string;
          type: "short" | "cover";
          shares: number;
          price: number;
          cash_delta: number;
          gross_value?: number;
          commission?: number;
          collateral_delta?: number;
          realized_pnl?: number;
          market_eligible?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["short_transactions"]["Insert"]>;
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
          short_liability: number;
          short_equity: number;
          gain_percent: number;
        };
        Relationships: [];
      };
      market_trade_events: {
        Row: {
          id: string;
          user_id: string;
          artist_id: string;
          type: "buy" | "sell" | "short" | "cover";
          shares: number;
          price: number;
          cash_delta: number;
          gross_value: number;
          commission: number;
          collateral_delta: number;
          realized_pnl: number;
          market_eligible: boolean;
          created_at: string;
          position_kind: "long" | "short";
        };
        Relationships: [];
      };
      short_position_risk: {
        Row: {
          user_id: string;
          artist_id: string;
          ticker: string;
          name: string;
          shares: number;
          average_short_price: number;
          collateral: number;
          current_price: number;
          current_liability: number;
          unrealized_pnl: number;
          short_equity: number;
          equity_percent: number;
          updated_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      buy_artist_shares: {
        Args: {
          p_artist_id: string;
          p_shares: number;
          p_market_eligible?: boolean;
        };
        Returns: Array<{
          transaction_id: string;
          artist_id: string;
          ticker: string;
          shares: number;
          execution_price: number;
          order_value: number;
          gross_order_value: number;
          commission: number;
          cash_balance: number;
          shares_owned: number;
          average_buy_price: number;
          updated_artist_price: number;
          price_impact_percent: number;
          market_eligible: boolean;
          quote_bid_price: number;
          quote_ask_price: number;
          spread_percent: number;
          slippage_percent: number;
          liquidity_score: number;
        }>;
      };
      calculate_artist_market_quote: {
        Args: {
          p_artist_id: string;
          p_shares?: number;
        };
        Returns: Array<{
          artist_id: string;
          ticker: string;
          mid_price: number;
          bid_price: number;
          ask_price: number;
          buy_execution_price: number;
          sell_execution_price: number;
          spread_percent: number;
          slippage_percent: number;
          liquidity_score: number;
        }>;
      };
      cover_artist_shares: {
        Args: {
          p_artist_id: string;
          p_shares: number;
          p_market_eligible?: boolean;
        };
        Returns: Array<{
          transaction_id: string;
          artist_id: string;
          ticker: string;
          shares: number;
          execution_price: number;
          order_value: number;
          gross_order_value: number;
          commission: number;
          collateral_released: number;
          realized_pnl: number;
          cash_balance: number;
          short_shares: number;
          average_short_price: number;
          updated_artist_price: number;
          price_impact_percent: number;
          market_eligible: boolean;
          quote_bid_price: number;
          quote_ask_price: number;
          spread_percent: number;
          slippage_percent: number;
          liquidity_score: number;
        }>;
      };
      get_market_trading_status: {
        Args: {
          p_artist_id?: string | null;
        };
        Returns: Array<{
          trading_mode: "continuous" | "halted" | "maintenance";
          market_open: boolean;
          market_impact_enabled: boolean;
          artist_halted: boolean;
          reason: string;
        }>;
      };
      short_artist_shares: {
        Args: {
          p_artist_id: string;
          p_shares: number;
          p_market_eligible?: boolean;
        };
        Returns: Array<{
          transaction_id: string;
          artist_id: string;
          ticker: string;
          shares: number;
          execution_price: number;
          order_value: number;
          gross_order_value: number;
          commission: number;
          collateral_required: number;
          cash_balance: number;
          short_shares: number;
          average_short_price: number;
          updated_artist_price: number;
          price_impact_percent: number;
          market_eligible: boolean;
          quote_bid_price: number;
          quote_ask_price: number;
          spread_percent: number;
          slippage_percent: number;
          liquidity_score: number;
        }>;
      };
      sell_artist_shares: {
        Args: {
          p_artist_id: string;
          p_shares: number;
          p_market_eligible?: boolean;
        };
        Returns: Array<{
          transaction_id: string;
          artist_id: string;
          ticker: string;
          shares: number;
          execution_price: number;
          order_value: number;
          gross_order_value: number;
          commission: number;
          cash_balance: number;
          shares_owned: number;
          average_buy_price: number;
          updated_artist_price: number;
          price_impact_percent: number;
          market_eligible: boolean;
          quote_bid_price: number;
          quote_ask_price: number;
          spread_percent: number;
          slippage_percent: number;
          liquidity_score: number;
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

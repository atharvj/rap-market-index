alter table public.price_history
  add column if not exists model_version text not null default 'rmi-core-v1';

alter table public.market_signal_snapshots
  add column if not exists model_version text not null default 'rmi-core-v1';

alter table public.market_update_runs
  add column if not exists model_version text not null default 'rmi-core-v1';

create index if not exists price_history_model_version_idx
  on public.price_history (model_version, price_date desc);

create index if not exists market_signal_snapshots_model_version_idx
  on public.market_signal_snapshots (model_version, source_date desc);

create index if not exists market_update_runs_model_version_idx
  on public.market_update_runs (model_version, run_date desc);

notify pgrst, 'reload schema';

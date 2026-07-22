# Supabase database history

The numbered files in `migrations/` are system-managed database history. They
are not a checklist for the site owner to paste into the Supabase SQL Editor.

## Do not manually run or delete them

- Production already reflects the migrations through `035`.
- Each migration records how to rebuild the database's tables, functions,
  triggers, security policies, constraints, and essential reference data.
- The encrypted backup workflow includes these files because application data
  is not recoverable without the matching database structure and security rules.
- Deleting or renaming an applied migration can break a future Supabase
  migration-ledger sync. Replaying a data migration manually can also damage
  current market state.

Routine artist additions, removals, and source-ID corrections belong in the
protected `/dev` roster tools. A new migration is appropriate only for a lasting
database rule or a necessary one-time transformation that must be reproducible.

When an unapplied migration is eventually needed, Codex or the deployment
operator should inspect the local and remote migration ledgers and apply it with
the Supabase CLI. The site owner should not run numbered SQL files individually.

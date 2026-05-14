-- v1.5 launch plan D-W1-2 (1/5): composite unique index on external_accounts.
--
-- Prerequisite for the composite foreign key in 0034_tenant_connectors.sql:
--   foreign key (tenant_id, external_account_id) references external_accounts (tenant_id, id)
--
-- Without this index, the FK target isn't a unique key and the migration would
-- fail. external_accounts.id is already unique (primary key), so (tenant_id, id)
-- is trivially unique too -- the index just makes Postgres aware of it.
--
-- No RLS change, no data change.

create unique index if not exists external_accounts_tenant_id_idx
  on public.external_accounts (tenant_id, id);

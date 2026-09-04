-- ============================================================================
--  SSH — Harvest Reporting Backend (0004)
--  The Harvest UI persists official documents (bills, FCR reports, UASF rate
--  sheets) into public.bills using columns that were never added by 0003:
--    report_type, document_data, date, tank_name, kgs,
--    request_type, category, supplier_name, grader_name, supervisor_name
--  Every silent save failure ("Full Harvest document save skipped", etc.)
--  traces back to these columns being absent. This migration is idempotent.
-- ============================================================================

alter table public.bills add column if not exists report_type text;
alter table public.bills add column if not exists document_data jsonb;
alter table public.bills add column if not exists date date;
alter table public.bills add column if not exists tank_name text;
alter table public.bills add column if not exists kgs numeric;
alter table public.bills add column if not exists request_type text;
alter table public.bills add column if not exists category text;
alter table public.bills add column if not exists supplier_name text;
alter table public.bills add column if not exists grader_name text;
alter table public.bills add column if not exists supervisor_name text;

-- Constrain report_type to the exact document kinds the UI produces.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bills_report_type_check'
  ) then
    alter table public.bills add constraint bills_report_type_check
      check (report_type is null or report_type in (
        'bill', 'middle_bill', 'middle_report',
        'uasf_rates', 'full_bill', 'full_report', 'full_uasf_rates'
      ));
  end if;
exception when others then null;
end $$;

-- Indexes for the Reports/Payments query patterns
create index if not exists idx_bills_site_report_type on public.bills(site_id, report_type);
create index if not exists idx_bills_site_date on public.bills(site_id, date);

-- ----------------------------------------------------------------------------
-- payments: support harvest-bill settlement requests from the Harvest tab
--   * new enum member 'harvest' on payment_type
--   * new enum member 'pending_approval' on payment_status (Accounts approval)
--   * bill_id link + structured method details
-- ----------------------------------------------------------------------------
alter type public.payment_type add value if not exists 'harvest';
alter type public.payment_status add value if not exists 'pending_approval';

alter table public.payments add column if not exists bill_id uuid references public.bills (id) on delete set null;
alter table public.payments add column if not exists payment_method_details jsonb;

create index if not exists idx_payments_bill_id on public.payments(bill_id);

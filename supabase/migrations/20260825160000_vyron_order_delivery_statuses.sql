-- VYRON ORDER — widen the notification delivery lifecycle.
--
-- The engine already distinguishes Pending, Sent, Failed and Not Configured.
-- Connecting real providers adds three more real states:
--
--   Sending   — handed to the provider, no answer yet.
--   Delivered — a provider callback confirmed receipt. Nothing sets this today;
--               provider acceptance is Sent, and only a delivery webhook may
--               ever promote a row to Delivered.
--   Cancelled — the event was superseded before the message went out.
--
-- Existing values are unchanged, so no row is rewritten and no history is lost.
--
-- Rollback:
--   alter table public.vyron_order_notification_deliveries
--     drop constraint vyron_order_notification_deliveries_status_check;
--   alter table public.vyron_order_notification_deliveries
--     add constraint vyron_order_notification_deliveries_status_check
--     check (status in ('Pending', 'Sent', 'Failed', 'Not Configured'));

alter table public.vyron_order_notification_deliveries
  drop constraint if exists vyron_order_notification_deliveries_status_check;

alter table public.vyron_order_notification_deliveries
  add constraint vyron_order_notification_deliveries_status_check
  check (status in ('Pending', 'Sending', 'Sent', 'Delivered', 'Failed', 'Not Configured', 'Cancelled'));

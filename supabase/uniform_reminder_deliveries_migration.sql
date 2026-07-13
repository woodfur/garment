-- Uniform reminder delivery tracking
-- Prevents duplicate Zapier reminders for the same branch schedule and reminder window.

CREATE TABLE IF NOT EXISTS uniform_reminder_deliveries (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id              uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  schedule_id            uuid NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  target_service_date    date NOT NULL,
  reminder_kind          text NOT NULL CHECK (reminder_kind IN ('wednesday','sunday')),
  delivery_status        text NOT NULL CHECK (delivery_status IN ('sent','failed')),
  zapier_response_status int,
  error_message          text,
  sent_at                timestamptz,
  created_at             timestamptz DEFAULT now(),
  UNIQUE (branch_id, schedule_id, reminder_kind)
);

CREATE INDEX IF NOT EXISTS idx_uniform_reminder_deliveries_target
  ON uniform_reminder_deliveries(target_service_date, reminder_kind);

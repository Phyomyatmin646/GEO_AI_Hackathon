-- Rename app_users to farmers to reuse the table as requested
ALTER TABLE app_users RENAME TO farmers;

ALTER TABLE farmers RENAME COLUMN phone TO phone_number;
ALTER TABLE farmers RENAME COLUMN location TO region;

ALTER TABLE farmers 
  ADD COLUMN township TEXT,
  ADD COLUMN village TEXT,
  ADD COLUMN grid_id TEXT,
  ADD COLUMN preferred_language TEXT DEFAULT 'my',
  ADD COLUMN preferred_channel TEXT DEFAULT 'sms',
  ADD COLUMN sms_consent BOOLEAN DEFAULT false,
  ADD COLUMN email_consent BOOLEAN DEFAULT false,
  ADD COLUMN ivr_consent BOOLEAN DEFAULT false,
  ADD COLUMN is_active BOOLEAN DEFAULT true,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX farmers_grid_id_idx ON farmers(grid_id);
CREATE INDEX farmers_region_idx ON farmers(region);

CREATE TABLE farmer_crops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    crop_model_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX farmer_crops_crop_model_key_idx ON farmer_crops(crop_model_key);

CREATE TABLE farmer_communication_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    sms_enabled BOOLEAN DEFAULT true,
    email_enabled BOOLEAN DEFAULT false,
    ussd_enabled BOOLEAN DEFAULT true,
    ivr_enabled BOOLEAN DEFAULT false,
    preferred_language TEXT DEFAULT 'my',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(farmer_id)
);

CREATE TABLE outbound_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID REFERENCES farmers(id) ON DELETE SET NULL,
    alert_id TEXT,
    channel TEXT NOT NULL,
    recipient TEXT NOT NULL,
    message_type TEXT,
    message_text TEXT NOT NULL,
    priority TEXT DEFAULT 'normal',
    status TEXT DEFAULT 'queued',
    attempt_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    provider_message_id TEXT,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX outbound_messages_status_idx ON outbound_messages(status);
CREATE INDEX outbound_messages_farmer_id_idx ON outbound_messages(farmer_id);
CREATE INDEX outbound_messages_alert_id_idx ON outbound_messages(alert_id);

CREATE TABLE message_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES outbound_messages(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    provider TEXT NOT NULL,
    provider_message_id TEXT,
    status TEXT NOT NULL,
    error_code TEXT,
    error_message TEXT,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE farmer_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID REFERENCES farmers(id) ON DELETE SET NULL,
    grid_id TEXT,
    channel TEXT NOT NULL,
    report_type TEXT NOT NULL,
    message_text TEXT,
    raw_payload JSONB,
    verification_status TEXT DEFAULT 'pending',
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    reviewed_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX farmer_reports_grid_id_idx ON farmer_reports(grid_id);
CREATE INDEX farmer_reports_verification_status_idx ON farmer_reports(verification_status);

CREATE TABLE ussd_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL UNIQUE,
    farmer_id UUID REFERENCES farmers(id) ON DELETE SET NULL,
    phone_number TEXT NOT NULL,
    current_menu TEXT NOT NULL,
    last_input TEXT,
    status TEXT DEFAULT 'active',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

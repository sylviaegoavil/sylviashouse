-- ============================================================================
-- Sylvia's House — Supabase Database Schema (FASE 1)
-- ============================================================================
-- Run this SQL in the Supabase SQL Editor to set up the database.
-- ============================================================================

-- ─── Groups ──────────────────────────────────────────────────────────────────

CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  excel_group TEXT NOT NULL,
  excel_tab TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Workers ─────────────────────────────────────────────────────────────────

CREATE TABLE workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  doc_number VARCHAR(9) NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'DNI' CHECK (doc_type IN ('DNI', 'CE')),
  has_soda BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(group_id, doc_number)
);

CREATE INDEX idx_workers_group ON workers(group_id);
CREATE INDEX idx_workers_doc ON workers(doc_number);
CREATE INDEX idx_workers_active ON workers(is_active);

-- ─── Orders ──────────────────────────────────────────────────────────────────

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  order_date DATE NOT NULL,
  source TEXT NOT NULL DEFAULT 'whatsapp' CHECK (source IN ('whatsapp', 'manual')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_orders_worker ON orders(worker_id);
CREATE INDEX idx_orders_group ON orders(group_id);
CREATE INDEX idx_orders_date ON orders(order_date);
CREATE INDEX idx_orders_worker_date ON orders(worker_id, order_date);
CREATE INDEX idx_orders_group_date ON orders(group_id, order_date);

-- ─── Processing Logs ─────────────────────────────────────────────────────────

CREATE TABLE processing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  file_name TEXT,
  total_orders INT,
  matched INT,
  unmatched INT,
  new_workers_added INT,
  processed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_processing_logs_group ON processing_logs(group_id);

-- ─── Parsing Errors ──────────────────────────────────────────────────────────

CREATE TABLE parsing_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processing_log_id UUID REFERENCES processing_logs(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
  order_date DATE NOT NULL,
  raw_text TEXT NOT NULL,
  error_type TEXT NOT NULL CHECK (
    error_type IN (
      'wrong_dni',
      'wrong_name',
      'missing_dni',
      'missing_name',
      'unmatched',
      'bad_format'
    )
  ),
  expected_value TEXT,
  actual_value TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_parsing_errors_log ON parsing_errors(processing_log_id);
CREATE INDEX idx_parsing_errors_group ON parsing_errors(group_id);

-- ─── Users ───────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'client')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Seed data: the 6 WhatsApp groups ────────────────────────────────────────

INSERT INTO groups (name, excel_group, excel_tab) VALUES
  ('APT ALMUERZOS', 'APT', 'ALMUERZOS APT'),
  ('APT CENAS', 'APT', 'CENAS APT'),
  ('PRODUCCION', 'PRODUCCION', 'PRODUCCION'),
  ('STAFF', 'PRODUCCION', 'STAFF'),
  ('PATIO ALMUERZOS', 'PATIO', 'ALMUERZOS PATIO'),
  ('PATIO CENAS', 'PATIO', 'CENAS PATIO');

-- ─── Row Level Security (RLS) ────────────────────────────────────────────────
-- Enable RLS on all tables. For FASE 1 we allow all operations via the
-- anon key; tighten these policies in FASE 2 when auth is fully integrated.

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE parsing_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Allow full access for authenticated and anon users (FASE 1 — open access)
CREATE POLICY "Allow all on groups" ON groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on workers" ON workers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on orders" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on processing_logs" ON processing_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on parsing_errors" ON parsing_errors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on users" ON users FOR ALL USING (true) WITH CHECK (true);

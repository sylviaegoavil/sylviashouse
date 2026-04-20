-- ============================================================================
-- Sylvia's House — Supabase Phase 2 Migration
-- ============================================================================
-- Run this AFTER supabase-schema.sql (Phase 1)
-- ============================================================================

-- ─── Manual product types (café, tortas, gaseosas, bocaditos) ─────────────────

CREATE TABLE manual_product_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Manual products per day per group ───────────────────────────────────────

CREATE TABLE manual_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type_id UUID REFERENCES manual_product_types(id),
  group_id UUID REFERENCES groups(id),
  product_date DATE NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_type_id, group_id, product_date)
);

-- ─── Prices per group per concept ────────────────────────────────────────────

CREATE TABLE group_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id),
  concept TEXT NOT NULL, -- 'ALMUERZO', 'CENA', 'ALMUERZO ESPECIAL', 'CENA ESPECIAL'
  unit_price DECIMAL(10,2) NOT NULL,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Fixed values config (e.g. 25 cenas fijas in PRODUCCION) ─────────────────

CREATE TABLE group_fixed_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id),
  concept TEXT NOT NULL, -- 'CENAS', 'CAFÉ'
  default_quantity INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Daily overrides for fixed values ────────────────────────────────────────

CREATE TABLE fixed_value_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id),
  concept TEXT NOT NULL,
  override_date DATE NOT NULL,
  quantity INT NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(group_id, concept, override_date)
);

-- ─── Worker add/remove requests ──────────────────────────────────────────────

CREATE TABLE worker_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id),
  request_type TEXT NOT NULL CHECK (request_type IN ('add', 'remove')),
  worker_id UUID REFERENCES workers(id),
  first_name TEXT,
  last_name TEXT,
  doc_number VARCHAR(9),
  doc_type TEXT DEFAULT 'DNI',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by UUID REFERENCES users(id),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Audit log ───────────────────────────────────────────────────────────────

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── RLS policies (open access — tighten in Phase 3 with real auth) ──────────

ALTER TABLE manual_product_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_fixed_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_value_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on manual_product_types" ON manual_product_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on manual_products" ON manual_products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on group_prices" ON group_prices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on group_fixed_values" ON group_fixed_values FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on fixed_value_overrides" ON fixed_value_overrides FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on worker_requests" ON worker_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on audit_log" ON audit_log FOR ALL USING (true) WITH CHECK (true);

-- ─── Seed data ────────────────────────────────────────────────────────────────

-- Fixed values for PRODUCCION
INSERT INTO group_fixed_values (group_id, concept, default_quantity)
SELECT id, 'CENAS', 25 FROM groups WHERE name = 'PRODUCCION';
INSERT INTO group_fixed_values (group_id, concept, default_quantity)
SELECT id, 'CAFÉ', 2 FROM groups WHERE name = 'PRODUCCION';

-- Manual product types
INSERT INTO manual_product_types (name, unit_price) VALUES
  ('CAFÉ', 30),
  ('TORTA GRANDE', 125),
  ('TORTA MEDIANA', 100),
  ('BOCADITOS', 2),
  ('GASEOSA 3L', 15),
  ('GASEOSA 600 ml', 3.50),
  ('GASEOSAS 500ml', 3.50),
  ('REPOSICIÓN THERMO', 100);

-- Default prices per group (adjust as needed)
-- APT
INSERT INTO group_prices (group_id, concept, unit_price)
SELECT id, 'ALMUERZO', 18.00 FROM groups WHERE name = 'APT ALMUERZOS';
INSERT INTO group_prices (group_id, concept, unit_price)
SELECT id, 'CENA', 18.00 FROM groups WHERE name = 'APT CENAS';

-- PRODUCCION
INSERT INTO group_prices (group_id, concept, unit_price)
SELECT id, 'ALMUERZO', 18.00 FROM groups WHERE name = 'PRODUCCION';
INSERT INTO group_prices (group_id, concept, unit_price)
SELECT id, 'ALMUERZO', 18.00 FROM groups WHERE name = 'STAFF';

-- PATIO
INSERT INTO group_prices (group_id, concept, unit_price)
SELECT id, 'ALMUERZO', 18.00 FROM groups WHERE name = 'PATIO ALMUERZOS';
INSERT INTO group_prices (group_id, concept, unit_price)
SELECT id, 'CENA', 18.00 FROM groups WHERE name = 'PATIO CENAS';

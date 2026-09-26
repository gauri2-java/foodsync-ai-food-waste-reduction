-- FoodSync schema. Idempotent: safe to re-run.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ───────────────────────── Organisations, sites, users ─────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  org_type      TEXT NOT NULL CHECK (org_type IN ('institution','processor','ngo','buyer','compost','logistics','regulator')),
  registration_no TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  verified      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sites (
  id              SERIAL PRIMARY KEY,
  org_id          INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  site_type       TEXT NOT NULL CHECK (site_type IN ('kitchen','plant','ngo_center','buyer_depot','compost_facility','depot')),
  address         TEXT,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  enrolled_headcount INT,                 -- kitchens: people entitled to meals
  daily_capacity_kg  NUMERIC(10,2),       -- recipients: how much food they can absorb per day
  accepts_categories TEXT[] NOT NULL DEFAULT '{}',   -- recipients: food category codes accepted
  opens_at        TIME NOT NULL DEFAULT '06:00',
  closes_at       TIME NOT NULL DEFAULT '22:00',
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sites_org ON sites(org_id);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  org_id        INT REFERENCES organizations(id) ON DELETE SET NULL,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','kitchen_manager','plant_manager','quality_officer','ngo_coordinator','buyer','driver','auditor')),
  phone         TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────── Reference data ─────────────────────────
CREATE TABLE IF NOT EXISTS food_categories (
  code             TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  is_cooked        BOOLEAN NOT NULL,
  shelf_life_ref_h NUMERIC(8,2) NOT NULL,  -- safe hours at ref_temp_c
  ref_temp_c       NUMERIC(5,2) NOT NULL,
  q10              NUMERIC(5,2) NOT NULL,  -- spoilage rate multiplier per +10 °C
  co2e_per_kg      NUMERIC(6,3) NOT NULL,  -- kg CO2e embodied per kg food
  water_l_per_kg   NUMERIC(8,1) NOT NULL,  -- virtual water footprint
  land_m2_per_kg   NUMERIC(6,3) NOT NULL,
  cost_per_kg      NUMERIC(8,2) NOT NULL   -- INR
);

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id          SERIAL PRIMARY KEY,
  site_id     INT REFERENCES sites(id) ON DELETE CASCADE,   -- NULL = applies to all sites
  event_date  DATE NOT NULL,
  event_type  TEXT NOT NULL CHECK (event_type IN ('holiday','exam','festival','vacation','special_event')),
  title       TEXT NOT NULL,
  attendance_factor NUMERIC(4,2)          -- optional manual hint (e.g. 0.3 during vacation)
);
CREATE INDEX IF NOT EXISTS idx_cal_date ON calendar_events(event_date);

CREATE TABLE IF NOT EXISTS weather_daily (
  lat_key     NUMERIC(6,2) NOT NULL,
  lng_key     NUMERIC(6,2) NOT NULL,
  day         DATE NOT NULL,
  temp_max_c  NUMERIC(5,2),
  temp_min_c  NUMERIC(5,2),
  rain_mm     NUMERIC(6,2),
  source      TEXT NOT NULL,
  PRIMARY KEY (lat_key, lng_key, day)
);

-- ───────────────────────── Kitchen: menu, recipes, meal logs ─────────────────────────
CREATE TABLE IF NOT EXISTS ingredients (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  unit          TEXT NOT NULL DEFAULT 'kg',
  category_code TEXT NOT NULL REFERENCES food_categories(code),
  unit_cost     NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_items (
  id               SERIAL PRIMARY KEY,
  org_id           INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  category_code    TEXT NOT NULL REFERENCES food_categories(code),
  portion_kg       NUMERIC(6,3) NOT NULL,
  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS recipe_lines (
  menu_item_id  INT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  ingredient_id INT NOT NULL REFERENCES ingredients(id),
  qty_per_portion NUMERIC(10,4) NOT NULL,   -- in ingredient unit
  PRIMARY KEY (menu_item_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS menu_plan (
  id           SERIAL PRIMARY KEY,
  site_id      INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  plan_date    DATE NOT NULL,
  meal_slot    TEXT NOT NULL CHECK (meal_slot IN ('breakfast','lunch','snacks','dinner')),
  menu_item_id INT NOT NULL REFERENCES menu_items(id),
  planned_portions INT,
  UNIQUE (site_id, plan_date, meal_slot, menu_item_id)
);

CREATE TABLE IF NOT EXISTS meal_logs (
  id              SERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  log_date        DATE NOT NULL,
  meal_slot       TEXT NOT NULL CHECK (meal_slot IN ('breakfast','lunch','snacks','dinner')),
  headcount       INT NOT NULL,          -- actual diners (POS / check-in)
  prepared_portions INT NOT NULL,
  served_portions INT NOT NULL,
  leftover_kg     NUMERIC(10,2) NOT NULL DEFAULT 0,  -- edible, untouched surplus
  plate_waste_kg  NUMERIC(10,2) NOT NULL DEFAULT 0,  -- inedible/plate waste
  forecast_portions INT,                 -- what FoodSync recommended, if any
  created_by      INT REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, log_date, meal_slot)
);
CREATE INDEX IF NOT EXISTS idx_meal_logs_site_date ON meal_logs(site_id, log_date);

-- ───────────────────────── Forecasting ─────────────────────────
CREATE TABLE IF NOT EXISTS forecast_models (
  id          SERIAL PRIMARY KEY,
  series_key  TEXT NOT NULL,             -- e.g. 'kitchen:3:lunch' or 'product:2'
  trained_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  train_rows  INT NOT NULL,
  mape        NUMERIC(8,3),
  baseline_mape NUMERIC(8,3),
  rmse        NUMERIC(10,3),
  residual_sd NUMERIC(10,3),
  params      JSONB NOT NULL             -- serialised model
);
CREATE INDEX IF NOT EXISTS idx_fm_series ON forecast_models(series_key, trained_at DESC);

CREATE TABLE IF NOT EXISTS forecasts (
  id          SERIAL PRIMARY KEY,
  model_id    INT NOT NULL REFERENCES forecast_models(id) ON DELETE CASCADE,
  series_key  TEXT NOT NULL,
  target_date DATE NOT NULL,
  predicted   NUMERIC(10,2) NOT NULL,
  lower_bound NUMERIC(10,2) NOT NULL,
  upper_bound NUMERIC(10,2) NOT NULL,
  drivers     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (series_key, target_date, model_id)
);

-- ───────────────────────── Inventory ─────────────────────────
CREATE TABLE IF NOT EXISTS storage_units (
  id          SERIAL PRIMARY KEY,
  site_id     INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  unit_type   TEXT NOT NULL CHECK (unit_type IN ('cold_room','freezer','dry_store','hot_holding','ambient')),
  min_temp_c  NUMERIC(5,2),
  max_temp_c  NUMERIC(5,2),
  max_humidity NUMERIC(5,2)
);

CREATE TABLE IF NOT EXISTS inventory_lots (
  id             SERIAL PRIMARY KEY,
  site_id        INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  ingredient_id  INT NOT NULL REFERENCES ingredients(id),
  storage_unit_id INT REFERENCES storage_units(id) ON DELETE SET NULL,
  lot_code       TEXT NOT NULL,
  qty            NUMERIC(12,3) NOT NULL,
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  status         TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','consumed','listed_surplus','discarded')),
  supplier       TEXT
);
CREATE INDEX IF NOT EXISTS idx_lots_site_exp ON inventory_lots(site_id, expires_at);

-- ───────────────────────── IoT ─────────────────────────
CREATE TABLE IF NOT EXISTS devices (
  id             SERIAL PRIMARY KEY,
  device_uid     TEXT NOT NULL UNIQUE,
  site_id        INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  storage_unit_id INT REFERENCES storage_units(id) ON DELETE SET NULL,
  machine_id     INT,
  device_type    TEXT NOT NULL CHECK (device_type IN ('env_sensor','gas_sensor','machine_meter','gps_tracker','thermal_probe')),
  api_key_hash   TEXT NOT NULL,
  last_seen_at   TIMESTAMPTZ,
  active         BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS sensor_readings (
  id          BIGSERIAL PRIMARY KEY,
  device_id   INT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL,
  metric      TEXT NOT NULL,           -- temp_c, humidity, nh3_ppm, co2_ppm, ch4_ppm, power_kw, energy_kwh, throughput_kgph, status
  value       DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_readings_dev_time ON sensor_readings(device_id, metric, recorded_at DESC);

-- ───────────────────────── Processing units ─────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id            SERIAL PRIMARY KEY,
  org_id        INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  category_code TEXT NOT NULL REFERENCES food_categories(code),
  raw_material_id INT REFERENCES ingredients(id),
  std_yield_pct NUMERIC(5,2) NOT NULL,     -- expected output/input %
  std_energy_kwh_per_kg NUMERIC(8,4) NOT NULL,
  unit_price    NUMERIC(10,2) NOT NULL,
  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS production_lines (
  id          SERIAL PRIMARY KEY,
  site_id     INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  rated_kgph  NUMERIC(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS machines (
  id          SERIAL PRIMARY KEY,
  line_id     INT NOT NULL REFERENCES production_lines(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  machine_type TEXT NOT NULL,
  rated_kw    NUMERIC(8,2) NOT NULL
);
DO $$ BEGIN
  ALTER TABLE devices ADD CONSTRAINT fk_devices_machine FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS production_runs (
  id            SERIAL PRIMARY KEY,
  line_id       INT NOT NULL REFERENCES production_lines(id) ON DELETE CASCADE,
  product_id    INT NOT NULL REFERENCES products(id),
  run_date      DATE NOT NULL,
  planned_output_kg NUMERIC(12,2) NOT NULL,
  input_kg      NUMERIC(12,2) NOT NULL,
  output_kg     NUMERIC(12,2) NOT NULL,
  scrap_kg      NUMERIC(12,2) NOT NULL,
  dispatched_kg NUMERIC(12,2) NOT NULL DEFAULT 0,  -- sold / shipped (demand realised)
  planned_minutes INT NOT NULL,
  run_minutes   INT NOT NULL,
  energy_kwh    NUMERIC(12,2) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_runs_line_date ON production_runs(line_id, run_date);

CREATE TABLE IF NOT EXISTS downtime_events (
  id          SERIAL PRIMARY KEY,
  machine_id  INT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ NOT NULL,
  ended_at    TIMESTAMPTZ,
  reason      TEXT NOT NULL CHECK (reason IN ('breakdown','changeover','no_material','cleaning','power_failure','quality_hold','other')),
  notes       TEXT
);

-- ───────────────────────── Quality ─────────────────────────
CREATE TABLE IF NOT EXISTS quality_inspections (
  id              SERIAL PRIMARY KEY,
  surplus_id      INT,
  lot_id          INT REFERENCES inventory_lots(id) ON DELETE SET NULL,
  category_code   TEXT NOT NULL REFERENCES food_categories(code),
  inspected_by    INT REFERENCES users(id),
  inspected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  image_path      TEXT,
  image_features  JSONB,
  sensor_snapshot JSONB,
  food_temp_c     NUMERIC(5,2),
  hours_since_prep NUMERIC(6,2),
  vision_score    NUMERIC(5,2),         -- 0..100
  freshness_score NUMERIC(5,2) NOT NULL, -- fused 0..100
  scw_hours       NUMERIC(6,2) NOT NULL, -- safe consumption window remaining
  verdict         TEXT NOT NULL CHECK (verdict IN ('safe','use_quickly','degraded','unsafe')),
  human_label     TEXT CHECK (human_label IN ('fresh','degraded')),
  explanation     JSONB
);

CREATE TABLE IF NOT EXISTS quality_models (
  id         SERIAL PRIMARY KEY,
  trained_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  samples    INT NOT NULL,
  accuracy   NUMERIC(5,3),
  params     JSONB NOT NULL
);

-- ───────────────────────── Surplus & redistribution ─────────────────────────
CREATE TABLE IF NOT EXISTS surplus_listings (
  id              SERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  meal_log_id     INT REFERENCES meal_logs(id) ON DELETE SET NULL,
  lot_id          INT REFERENCES inventory_lots(id) ON DELETE SET NULL,
  production_run_id INT REFERENCES production_runs(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  category_code   TEXT NOT NULL REFERENCES food_categories(code),
  quantity_kg     NUMERIC(10,2) NOT NULL,
  portions        INT,
  prepared_at     TIMESTAMPTZ NOT NULL,
  safe_until      TIMESTAMPTZ NOT NULL,
  freshness_score NUMERIC(5,2),
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','offered','matched','in_transit','delivered','expired','composted','cancelled')),
  channel         TEXT CHECK (channel IN ('donation','secondary_sale','compost')),
  assigned_site_id INT REFERENCES sites(id),
  sale_price      NUMERIC(10,2),
  created_by      INT REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_surplus_status ON surplus_listings(status, safe_until);
DO $$ BEGIN
  ALTER TABLE quality_inspections ADD CONSTRAINT fk_qi_surplus FOREIGN KEY (surplus_id) REFERENCES surplus_listings(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS surplus_offers (
  id            SERIAL PRIMARY KEY,
  surplus_id    INT NOT NULL REFERENCES surplus_listings(id) ON DELETE CASCADE,
  recipient_site_id INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  rank          INT NOT NULL,
  score         NUMERIC(6,4) NOT NULL,
  distance_km   NUMERIC(8,2) NOT NULL,
  eta_min       NUMERIC(8,1) NOT NULL,
  score_breakdown JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired','superseded')),
  offered_price NUMERIC(10,2),
  responded_at  TIMESTAMPTZ,
  responded_by  INT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (surplus_id, recipient_site_id)
);

-- ───────────────────────── Logistics ─────────────────────────
CREATE TABLE IF NOT EXISTS vehicles (
  id            SERIAL PRIMARY KEY,
  org_id        INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  depot_site_id INT REFERENCES sites(id),
  registration  TEXT NOT NULL UNIQUE,
  capacity_kg   NUMERIC(10,2) NOT NULL,
  refrigerated  BOOLEAN NOT NULL DEFAULT false,
  driver_user_id INT REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','on_trip','maintenance')),
  last_lat      DOUBLE PRECISION,
  last_lng      DOUBLE PRECISION,
  last_ping_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS trips (
  id            SERIAL PRIMARY KEY,
  vehicle_id    INT NOT NULL REFERENCES vehicles(id),
  status        TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','cancelled')),
  planned_km    NUMERIC(10,2) NOT NULL,
  planned_minutes NUMERIC(10,1) NOT NULL,
  actual_km     NUMERIC(10,2),
  geometry      JSONB,                 -- [[lat,lng],...]
  optimizer     JSONB,                 -- solver stats
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trip_stops (
  id            SERIAL PRIMARY KEY,
  trip_id       INT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  seq           INT NOT NULL,
  stop_type     TEXT NOT NULL CHECK (stop_type IN ('pickup','dropoff')),
  surplus_id    INT NOT NULL REFERENCES surplus_listings(id),
  site_id       INT NOT NULL REFERENCES sites(id),
  eta           TIMESTAMPTZ NOT NULL,
  deadline      TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed')),
  completed_at  TIMESTAMPTZ,
  food_temp_c   NUMERIC(5,2),
  handoff_token_hash TEXT,
  received_portions INT,
  notes         TEXT
);
CREATE INDEX IF NOT EXISTS idx_stops_trip ON trip_stops(trip_id, seq);

-- ───────────────────────── Alerts & audit ─────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id          SERIAL PRIMARY KEY,
  site_id     INT REFERENCES sites(id) ON DELETE CASCADE,
  alert_type  TEXT NOT NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  title       TEXT NOT NULL,
  detail      TEXT,
  entity_ref  TEXT,                     -- dedupe key e.g. 'lot:12'
  acknowledged_by INT REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alerts_open ON alerts(acknowledged_at, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_alerts_open_ref ON alerts(alert_type, entity_ref) WHERE acknowledged_at IS NULL;

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id    INT REFERENCES users(id),
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  payload     JSONB NOT NULL DEFAULT '{}',
  prev_hash   TEXT NOT NULL,
  hash        TEXT NOT NULL
);

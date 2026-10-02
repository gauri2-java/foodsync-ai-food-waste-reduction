# FoodSync — Smart Food Waste Management & Redistribution Platform

**SIH 2026 · Problem Statement SIH26234 · Ministry of Food Processing Industries**

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/gauri2-java/foodsync-ai-food-waste-reduction)

FoodSync is an end-to-end platform for institutional kitchens and food processing units. It **predicts demand** so less food is over-cooked, **grades freshness** with images and IoT sensors, **matches surplus** with NGOs, secondary buyers or compost, **routes deliveries** before food spoils, **monitors processing lines** for losses, downtime and energy waste, and **reports impact** (CO₂e, water, land, money) in BRSR/FSSAI-ready form.

Everything runs on your local PostgreSQL. All data, thresholds and factors live in the database and are editable in the UI; the analytics are implemented in the codebase and are inspectable — there are no external AI APIs.

## Quick start

Prerequisites: Node.js 20+ and PostgreSQL 14+ (running locally).

```bash
npm install
cp .env.example .env          # then set DATABASE_URL (your postgres password) and JWT_SECRET
npm run db:setup              # creates the `foodsync` database, schema and ~7 months of demo history
npm start                     # http://localhost:5000
npm run simulate              # (second terminal) live IoT sensors, machine meters and vehicle GPS
```

Seeded accounts (one per role) use the password in `SEED_PASSWORD` (default `FoodSync@123`); the full list is `admin@`, `kitchen@`, `cafeteria@`, `plant@`, `quality@`, `ngo@`, `hope@`, `stars@`, `buyer@`, `driver1/2/3@`, `auditor@` — all `@foodsync.local`.

`npm test` runs the unit tests for the analytics engines (no database needed).

## How it maps to the problem statement

| Requirement | Where | How |
|---|---|---|
| Predict demand & surplus in real time | Demand & planning | Hybrid forecaster: additive ridge regression (weekday, yearly season, exams/holidays/festivals/vacations, live **Open-Meteo** weather, recent level) + gradient-boosted trees on residuals. Time-ordered holdout MAPE vs a seasonal-naive baseline is shown for every model; retrained daily from new meal logs. |
| Smart production planning | Demand & planning → production plan | Cook quantity = forecast upper band at a configurable service level; the menu plan × recipes (bill of materials) give raw-material needs, netted against stock **first-expiry-first-out** into a procurement list. |
| Items nearing expiry / quality deterioration | Inventory, Quality, IoT cold chain | Near-expiry scans; Safe Consumption Window from a Q10 kinetic shelf-life model + FSSAI danger-zone rule (5–60 °C) + MQ-135 NH₃/CO₂ readings + image colour/texture analysis. Inspector labels train a calibrated logistic model. |
| Connect surplus with NGOs, shelters, buyers | Surplus exchange, Food offers | Channel cascade donation → secondary sale → compost. Recipients are ranked on proximity, capacity, fairness and time slack, with feasibility checks (category, opening hours, reach before the window closes). Offers go to the top N at once; the first to accept wins, and unanswered offers expire and re-match. |
| AI logistics & route optimisation | Fleet & routes, My trips | Pickup-and-delivery VRP with vehicle capacity and hard deadlines at each food's safe-window end (regret-2 insertion + relocate search), compared against one-trip-per-pickup. Driver app with GPS sharing and QR hand-off. |
| Processing efficiency & storage conditions | Processing units, IoT cold chain | Yield vs standard, scrap cost, OEE, energy intensity, downtime Pareto, overproduction vs dispatch; sustained cold-chain breach alerts; device-offline detection. |
| Detect overproduction, losses, downtime, excess energy | Processing units, Alerts | Rule findings + **Isolation Forest** anomaly detection on machine telemetry with a plain-language cause. |
| Sustainability, carbon, ESG | Sustainability & ESG | Food saved, meals, net CO₂e (landfill + embodied − transport), virtual water, land, money; BRSR Principle-6 indicators; FSSAI surplus-distribution register; one-click PDF. |
| Tamper-evident records | Audit trail | SHA-256 hash-chained audit log with integrity verification; QR hand-off tokens are HMAC-signed. |

## Architecture

```
client/            Vanilla JS SPA (no build step) · Chart.js · Leaflet · SSE live updates
server/
  app.js, server.js
  middleware/      request logging (timed, leveled JSON), JWT auth, org scoping, errors, uploads
  modules/<name>/  *.routes → *.controller → *.service (business logic) → *.repository (SQL only)
  ml/              forecaster, ridge, gbm, isolationForest, vrp, matching, shelfLife, vision, logistic
  jobs/            surplus housekeeping, expiry scan, cold-chain/offline scan, anomaly scan, daily retrain
  db/schema.sql    PostgreSQL schema · db/seed/ demo data generator
simulator/         IoT + GPS simulator (uses the same public device/driver APIs as real hardware)
hardware/          ESP32 + DHT22 + MQ-135 firmware for a real storage node
tests/             node:test unit tests for the analytics engines
```

Live updates use Server-Sent Events (`/api/dashboard/stream`). Devices post to `POST /api/iot/ingest` with `x-device-id` and `x-device-key` headers, and only a hash of each key is stored.

## Data you can change

- **Administration → Tunable parameters:** routing speed and detour factor, matching weights, offer timeout, gas and danger-zone thresholds, forecast service level, near-expiry window, anomaly threshold, and emission factors.
- **Administration → Food categories:** shelf life, Q10, and CO₂e, water and land footprint per category.
- **Meal service log → Calendar:** exams, holidays and events that the forecaster learns from.
- Sites, organisations (with NGO verification), users, storage units, devices, dishes and recipes, and vehicles.

## Notes on the demo data

`npm run db:seed` generates a fictional city network (3 kitchens, 1 processing plant, 6 NGOs, 2 buyers, a biogas plant and a 3-vehicle fleet) with realistic patterns. Weather history is real (Open-Meteo) when online. Kitchens cook to a static headcount rule until `SEED_GO_LIVE_DAYS` ago and to FoodSync's forecast afterwards, which gives the before/after comparison. Footprint factors are indicative literature values and must be validated before external disclosure.

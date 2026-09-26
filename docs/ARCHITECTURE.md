# 🏛️ FoodSync Architecture & Technical Approach

## Overview
FoodSync is an end-to-end AIoT ecosystem addressing **SIH26234**: *AI-Powered Smart Food Waste Reduction and Sustainable Redistribution Ecosystem for Institutional Kitchens and Food Processing Units* under the **Ministry of Food Processing Industries (MoFPI)**.

## 4-Stage Architectural Pipeline

```
+------------------------+      +--------------------------+      +---------------------------+      +-------------------------+
| STAGE 1: DEMAND ENGINE | ---> | STAGE 2: QUALITY SENSING | ---> | STAGE 3: REDISTRIBUTION   | ---> | STAGE 4: ESG & AUDIT    |
| Prophet + XGBoost      |      | YOLOv8 Edge CV + Gas IoT |      | OR-Tools CVRPTW Routing   |      | FSSAI & SEBI BRSR       |
| Dynamic Batch Quotas   |      | Safe Consumption Window  |      | Dynamic QR Verification   |      | CO2e & Water Avoidance  |
+------------------------+      +--------------------------+      +---------------------------+      +-------------------------+
```

1. **Stage 1: Demand Forecasting (Pre-Cooking)**
   - Inputs: Attendance, footfall, POS logs, weather, academic and festival calendars.
   - Algorithms: Prophet time-series + XGBoost regression for dynamic raw material sizing.
   - Target: 18% procurement savings, <5% overproduction.

2. **Stage 2: Quality Assessment & Safe Consumption Window**
   - Inputs: YOLOv8 visual classification, MQ-135 ($NH_3$), MQ-4 ($CO_2$), DHT22 temperature/humidity.
   - Outputs: Dynamic Safe Consumption Window (SCW) countdown.

3. **Stage 3: Redistribution & Vehicle Routing**
   - Optimization: Capacitated Vehicle Routing with Time Windows (CVRPTW) prioritised by decaying shelf life.
   - Safety: Dynamic QR code digital seal with mandatory 60°C thermal gate check.

4. **Stage 4: ESG Analytics & Compliance**
   - $2.5	ext{ kg } CO_2e$ avoided per kg edible food diverted.
   - Standardized export for FSSAI "Save Food Share Food" and SEBI BRSR reporting.

# Railway AI Models Training Report — Version v1

**Generated at**: 2026-09-10T06:19:15.243894+00:00  
**Data Source**: combined (1202 total records)  
**Total Features**: 68 transformed features  

---

## 1. Maintenance Duration Model (XGBRegressor)
- **Target**: `target_maintenance_duration` (minutes)
- **Test MAE**: **14.847 min** (Baseline mean: 63.261 min, **76.53% improvement**)
- **Test RMSE**: 19.172 min
- **Test R²**: **0.9315**
- **Beats Baseline**: True

---

## 2. Asset Risk & Priority Model (XGBClassifier)
- **Target**: `target_asset_risk_priority` (3 Tiers: LOW, MEDIUM, HIGH)
- **Test Accuracy**: **0.8674** (Baseline majority: 0.3978)
- **Weighted F1 Score**: **0.8656**
- **Macro Precision**: 0.8515
- **Macro Recall**: 0.8582
- **Beats Baseline**: True

---

## 3. Operational Impact Model (XGBRegressor)
- **Target**: `target_operational_impact` (Friction score: 0–100)
- **Test MAE**: **3.642 pts** (Baseline mean: 13.684 pts, **73.39% improvement**)
- **Test RMSE**: 4.482 pts
- **Test R²**: **0.9268**
- **Beats Baseline**: True

---

## Training Configuration
- Random Seed: 42
- Test Split: 0.15
- Validation Split: 0.15
- Status: **SUCCESS (All 3 Models Exceed Baselines)**

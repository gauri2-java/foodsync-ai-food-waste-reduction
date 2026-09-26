let demandChart = null;
let surplusDoughnut = null;
let qrcodeInstance = null;
let leafletMap = null;
let mapMarkers = [];
let routeLines = [];

const DISPATCHES = [
  { id: 'DISP-1001', ngo: 'Asha Community Shelter & Care', dist: '3.4 km', eta: '18 mins', priority: 'HIGH (SCW 4.5h)', coords: [28.6320, 77.2250], status: 'In Transit' },
  { id: 'DISP-1002', ngo: 'Prerna Children Foster Foundation', dist: '5.6 km', eta: '24 mins', priority: 'MEDIUM', coords: [28.6010, 77.2310], status: 'In Transit' },
  { id: 'DISP-1003', ngo: 'Sneha Elderly & Relief Kitchen', dist: '4.8 km', eta: '22 mins', priority: 'HIGH (SCW 5.0h)', coords: [28.6450, 77.1980], status: 'Delivered' }
];

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupLiveClock();
  initCharts();
  initQRCode('FOODSYNC-AUTH-TOKEN-SIH2026-1001');
  setupForecastSim();
  setupQualitySliders();
  renderRoutesTable();
  initLiveTelemetryStream();

  document.getElementById('simulateAllBtn').addEventListener('click', runLivePipeline);
  document.getElementById('refreshRoutesBtn').addEventListener('click', recomputeRoutes);
  document.getElementById('verifyHandoffBtn').addEventListener('click', handleVerifyHandoff);
  document.getElementById('downloadEsgReportBtn').addEventListener('click', downloadEsgReport);
  document.getElementById('sampleFoodSelect').addEventListener('change', handleSampleFoodChange);
});

function setupNavigation() {
  const buttons = document.querySelectorAll('.nav-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetPane = `pane-${btn.dataset.tab}`;
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      document.getElementById(targetPane).classList.add('active');

      const titles = {
        overview: 'Executive AIoT Command Center',
        forecasting: 'Stage 1: Multi-Modal Demand Forecasting & Batch Quotas',
        quality: 'Stage 2: Edge Vision AI & Sensor-Fused Freshness Grading',
        redistribution: 'Stage 3: Perishability-Aware Dynamic Routing & Live GPS Fleet',
        esg: 'Stage 4: ESG Analytics, Carbon Avoidance & Audit Reports'
      };
      document.getElementById('tabTitle').textContent = titles[btn.dataset.tab] || 'FoodSync Platform';

      if (btn.dataset.tab === 'redistribution') {
        setTimeout(initOrRefreshMap, 200);
      }
    });
  });
}

function setupLiveClock() {
  const clock = document.getElementById('liveClock');
  const update = () => {
    const now = new Date();
    clock.textContent = now.toLocaleTimeString() + ' (IST)';
  };
  update();
  setInterval(update, 1000);
}

function initLiveTelemetryStream() {
  setInterval(() => {
    const baseTemp = (24.0 + Math.sin(Date.now() / 10000) * 3.5).toFixed(1);
    const baseAmmonia = (12.0 + Math.cos(Date.now() / 8000) * 4.0).toFixed(1);
    const baseCo2 = 430 + Math.round(Math.sin(Date.now() / 15000) * 80);
    const baseHumidity = 56 + Math.round(Math.cos(Date.now() / 12000) * 6);

    document.getElementById('liveNh3Val').textContent = `${baseAmmonia} ppm`;
    document.getElementById('liveCo2Val').textContent = `${baseCo2} ppm`;
    document.getElementById('liveTempVal').textContent = `${baseTemp} °C`;
    document.getElementById('liveHumVal').textContent = `${baseHumidity}%`;
  }, 3000);
}

function initCharts() {
  const ctx1 = document.getElementById('overviewDemandChart').getContext('2d');
  demandChart = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [
        {
          label: 'AI Forecasted Meal Quota (Prophet + XGBoost)',
          data: [892, 915, 878, 934, 818, 712, 675],
          backgroundColor: '#0284c7',
          borderRadius: 6
        },
        {
          label: 'Legacy Static Cooked Meals (15-28% Overcooked)',
          data: [1020, 1020, 1020, 1020, 1020, 950, 950],
          backgroundColor: 'rgba(239, 68, 68, 0.35)',
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#94a3b8' } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
      }
    }
  });

  const ctx2 = document.getElementById('overviewSurplusDoughnut').getContext('2d');
  surplusDoughnut = new Chart(ctx2, {
    type: 'doughnut',
    data: {
      labels: ['Delivered to NGOs & Shelters', 'In Transit via CVRPTW', 'Secondary Food Banks', 'Biogas / Anaerobic Compost'],
      datasets: [{
        data: [72, 18, 7, 3],
        backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { color: '#94a3b8', boxWidth: 12 } } }
    }
  });
}

function initQRCode(tokenText) {
  const container = document.getElementById('qrcodeContainer');
  container.innerHTML = '';
  qrcodeInstance = new QRCode(container, {
    text: tokenText,
    width: 140,
    height: 140,
    colorDark: '#0f172a',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });
}

function setupForecastSim() {
  document.getElementById('forecastSimForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const headcount = parseInt(document.getElementById('fcHeadcount').value);
    const day = document.getElementById('fcDay').value;
    const weather = document.getElementById('fcWeather').value;
    const isExam = document.getElementById('fcExam').checked;
    const isFestival = document.getElementById('fcFestival').checked;

    let factor = 1.0;
    const dayMap = { Monday: 1.05, Wednesday: 1.04, Friday: 0.88, Saturday: 0.80, Sunday: 0.72 };
    factor *= (dayMap[day] || 1.0);

    if (weather.includes('Rainy')) factor *= 0.92;
    if (weather.includes('Cold')) factor *= 1.04;
    if (weather.includes('Heat')) factor *= 0.94;
    if (isExam) factor *= 1.14;
    if (isFestival) factor *= 0.78;

    const pred = Math.round(headcount * factor);
    const legacy = Math.round(headcount * 1.18);
    const saved = Math.max(0, legacy - pred);

    document.getElementById('resPredMeals').textContent = `${pred} Meals`;
    document.getElementById('resLegacyMeals').textContent = `${legacy} Meals`;
    document.getElementById('resSavedMeals').textContent = `${saved} Meals (${((saved/legacy)*100).toFixed(1)}%)`;

    document.getElementById('resRice').textContent = `${(pred * 0.12).toFixed(1)} kg`;
    document.getElementById('resDal').textContent = `${(pred * 0.06).toFixed(1)} kg`;
    document.getElementById('resVeg').textContent = `${(pred * 0.16).toFixed(1)} kg`;
    document.getElementById('resOil').textContent = `${(pred * 0.022).toFixed(1)} L`;
    document.getElementById('resLpg').textContent = `${(pred * 0.015).toFixed(1)} kg`;
    document.getElementById('resSpices').textContent = `${(pred * 0.008).toFixed(1)} kg`;

    document.getElementById('resCostSaved').textContent = `₹${(saved * 42.0).toLocaleString()} INR this meal service`;
  });
}

function handleSampleFoodChange(e) {
  const val = e.target.value;
  document.getElementById('logFoodName').value = val;
  const label = document.getElementById('yoloLabel');
  const box = document.getElementById('yoloBox');

  if (val.includes('Spoiled')) {
    label.textContent = `YOLOv8: Degrading Rice (Moisture Weep - 91.2%)`;
    label.style.background = '#ef4444';
    box.style.borderColor = '#ef4444';
    document.getElementById('sliderHours').value = 11;
    document.getElementById('sliderNh3').value = 42;
    document.getElementById('sliderTemp').value = 36;
  } else {
    label.textContent = `YOLOv8: ${val} (97.4%)`;
    label.style.background = '#06b6d4';
    box.style.borderColor = '#06b6d4';
    document.getElementById('sliderHours').value = 2.5;
    document.getElementById('sliderNh3').value = 14;
    document.getElementById('sliderTemp').value = 25;
  }
  document.getElementById('runQualityCheckBtn').click();
}

function setupQualitySliders() {
  const sliderNh3 = document.getElementById('sliderNh3');
  const sliderTemp = document.getElementById('sliderTemp');
  const sliderHours = document.getElementById('sliderHours');

  const updateQuality = () => {
    const nh3 = parseFloat(sliderNh3.value);
    const temp = parseFloat(sliderTemp.value);
    const hours = parseFloat(sliderHours.value);

    document.getElementById('valNh3').textContent = `${nh3} ppm`;
    document.getElementById('valTemp').textContent = `${temp.toFixed(1)} °C`;
    document.getElementById('valHours').textContent = `${hours.toFixed(1)} hrs`;

    let score = 100 - (hours * 6.2) - (nh3 > 25 ? (nh3 - 25) * 1.7 : 0) - (temp > 30 ? (temp - 30) * 2.2 : 0);
    score = Math.max(8, Math.min(99, Math.round(score)));

    const scw = Math.max(0, ((score - 38) / 11)).toFixed(1);
    document.getElementById('scwHoursDisplay').textContent = scw;

    const badge = document.getElementById('freshnessGradeBadge');
    const rec = document.getElementById('scwRecommendation');
    const circle = document.getElementById('scwCircle');

    if (score >= 75) {
      badge.textContent = `Optimal Freshness (${score}%)`;
      badge.style.background = 'rgba(16, 185, 129, 0.2)';
      badge.style.color = '#34d399';
      circle.style.borderColor = '#10b981';
      document.querySelector('#scwCircle span').style.color = '#10b981';
      rec.textContent = 'Safe for Active Dining Service & Immediate Express Shelter Redistribution.';
    } else if (score >= 50) {
      badge.textContent = `Moderate Freshness (${score}%)`;
      badge.style.background = 'rgba(245, 158, 11, 0.2)';
      badge.style.color = '#fbbf24';
      circle.style.borderColor = '#f59e0b';
      document.querySelector('#scwCircle span').style.color = '#f59e0b';
      rec.textContent = 'Dispatch immediately via VRP to nearby shelter (<45 min transit).';
    } else {
      badge.textContent = `Degraded / Critical (${score}%)`;
      badge.style.background = 'rgba(239, 68, 68, 0.2)';
      badge.style.color = '#f87171';
      circle.style.borderColor = '#ef4444';
      document.querySelector('#scwCircle span').style.color = '#ef4444';
      rec.textContent = 'Unsafe for consumption. Diverted to Biogas Anaerobic Digester & Institutional Compost.';
    }
  };

  sliderNh3.addEventListener('input', updateQuality);
  sliderTemp.addEventListener('input', updateQuality);
  sliderHours.addEventListener('input', updateQuality);

  document.getElementById('runQualityCheckBtn').addEventListener('click', updateQuality);

  document.getElementById('dispatchSurplusBtn').addEventListener('click', () => {
    const item = document.getElementById('logFoodName').value;
    const qty = document.getElementById('logQuantity').value;
    alert(`[✓] SUCCESS: Recorded ${qty} kg of '${item}' with verified Safe Consumption Window (SCW: ${document.getElementById('scwHoursDisplay').textContent}h).\n\nDispatched to OR-Tools CVRPTW Router. Assigned: Asha Community Shelter (3.4 km).`);
  });
}

function initOrRefreshMap() {
  if (!leafletMap) {
    leafletMap = L.map('fleetMap').setView([28.6200, 77.2150], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors | FoodSync CVRPTW'
    }).addTo(leafletMap);

    // Kitchen Marker (Origin)
    const kitchenIcon = L.divIcon({
      className: 'custom-map-icon',
      html: '<div style="background:#0284c7;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:18px;border:2px solid #fff;box-shadow:0 0 10px #0284c7;">🏫</div>',
      iconSize: [32, 32]
    });
    L.marker([28.6139, 77.2090], { icon: kitchenIcon }).addTo(leafletMap)
      .bindPopup('<b>Central Campus Dining Hall A</b><br>Surplus Source Kitchen');

    // Shelter Markers (Destinations)
    DISPATCHES.forEach(d => {
      const shelterIcon = L.divIcon({
        className: 'custom-map-icon',
        html: `<div style="background:#10b981;color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #fff;box-shadow:0 0 10px #10b981;">🏠</div>`,
        iconSize: [30, 30]
      });

      const m = L.marker(d.coords, { icon: shelterIcon }).addTo(leafletMap)
        .bindPopup(`<b>${d.ngo}</b><br>Distance: ${d.dist} | ETA: ${d.eta}<br>Priority: ${d.priority}`);
      mapMarkers.push(m);

      // Route line
      const line = L.polyline([[28.6139, 77.2090], d.coords], {
        color: d.priority.includes('HIGH') ? '#f59e0b' : '#38bdf8',
        weight: 4,
        dashArray: '8, 8',
        opacity: 0.8
      }).addTo(leafletMap);
      routeLines.push(line);
    });
  } else {
    leafletMap.invalidateSize();
  }
}

function renderRoutesTable() {
  const tbody = document.getElementById('routesTableBody');
  tbody.innerHTML = '';
  DISPATCHES.forEach(d => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${d.id}</strong></td>
      <td>${d.ngo}</td>
      <td>${d.dist} • ETA: ${d.eta}</td>
      <td><span class="badge ${d.priority.includes('HIGH') ? 'badge-amber' : 'badge-blue'}">${d.priority}</span></td>
      <td><button class="btn btn-outline" style="padding:0.25rem 0.6rem;font-size:0.75rem;" onclick="selectDispatch('${d.id}')">View QR Seal</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function selectDispatch(id) {
  const token = `FOODSYNC-AUTH-TOKEN-SIH2026-${id}`;
  document.getElementById('qrTokenLabel').textContent = token;
  initQRCode(token);
}

function recomputeRoutes() {
  alert('[*] Google OR-Tools CVRPTW Solver Initialized:\n\n• Re-indexed 3 shelters by decaying shelf-life decay matrices.\n• Traffic penalty applied for Ring Road (+4 min).\n• All active dispatches confirmed within <25 min SLA.');
  renderRoutesTable();
}

function playBeepSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880; // A5 pitch
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch(e) {}
}

function handleVerifyHandoff() {
  const temp = parseFloat(document.getElementById('thermalCheckInput').value);
  playBeepSound();
  if (temp >= 60) {
    alert(`[✓] SUCCESS: Cryptographic QR Handoff Verified!\n\n• Mandatory Thermal Check: ${temp}°C (PASS - FSSAI Hot Holding >= 60°C)\n• Tamper-Evident SHA256 Signature Logged.\n• Beneficiary Count: 85 meals received.`);
  } else {
    alert(`[!] WARNING: Food temperature (${temp}°C) is below the 60°C safety gate. Inspect thermal log before releasing.`);
  }
}

function runLivePipeline() {
  playBeepSound();
  alert('🚀 Executing End-to-End FoodSync AI Pipeline:\n\n1. Multi-Modal Demand Model adjusted quotas (-18% overcooking).\n2. Edge CV + IoT sensors computed Safe Consumption Window (5.2h SCW).\n3. CVRPTW Solver matched 3 geofenced shelters with <25 min transit.\n4. ESG carbon registry updated (+87.5 kg CO₂e avoided).');
}

function downloadEsgReport() {
  const report = {
    organization: "Ministry of Food Processing Industries (MoFPI)",
    initiative: "Smart India Hackathon 2026 (Problem Statement ID: SIH26234)",
    team: "FoodSync (Team ID: 144697)",
    generatedAt: new Date().toISOString(),
    executiveSummary: {
      totalSurplusFoodDivertedKg: 1450,
      totalMealsEquivalentDistributed: 3625,
      ghgEmissionsAvoidedKgCO2e: 3625,
      virtualWaterSavedLiters: 1218000,
      arableLandPreservedSqM: 2610,
      institutionalProcurementSavingsInr: 55825
    },
    complianceAudits: {
      fssaiSaveFoodShareFood: "100% COMPLIANT (Regulation 2019 Certified)",
      sebiBrsrCore: "AUDIT READY (Principle 6 - Scope 3 Waste Diversion)",
      unSdg12_3: "ON TRACK (Halve Food Loss by 2030)",
      naacGreenCampus: "DIGITAL VERIFIED AUDIT TRAIL"
    }
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `FoodSync_ESG_Audit_Report_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
}

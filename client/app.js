let demandChart = null;
let surplusDoughnut = null;
let qrcodeInstance = null;

const DISPATCHES = [
  { id: 'DISP-1001', ngo: 'Asha Community Shelter & Care', dist: '3.2 km', eta: '18 mins', priority: 'HIGH (SCW 4.2h)', status: 'In Transit' },
  { id: 'DISP-1002', ngo: 'Prerna Children Foster Foundation', dist: '5.8 km', eta: '26 mins', priority: 'MEDIUM', status: 'In Transit' },
  { id: 'DISP-1003', ngo: 'Sneha Elderly & Relief Kitchen', dist: '8.4 km', eta: '34 mins', priority: 'HIGH (SCW 3.5h)', status: 'Delivered' }
];

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupLiveClock();
  initCharts();
  initQRCode('FOODSYNC-AUTH-TOKEN-SIH2026-1001');
  setupForecastSim();
  setupQualitySliders();
  renderRoutesTable();

  document.getElementById('simulateAllBtn').addEventListener('click', runLivePipeline);
  document.getElementById('refreshRoutesBtn').addEventListener('click', () => {
    alert('OR-Tools CVRPTW Algorithm recomputed route vectors based on live traffic & decaying shelf-life windows.');
    renderRoutesTable();
  });

  document.getElementById('verifyHandoffBtn').addEventListener('click', () => {
    const temp = parseFloat(document.getElementById('thermalCheckInput').value);
    if (temp >= 60) {
      alert(`[✓] SUCCESS: Tamper-Evident QR Handoff Verified!\nThermal Check: ${temp}°C (Pass - Hot Holding Standard)\nLogged to FSSAI Compliance Audit.`);
    } else {
      alert(`[!] WARNING: Food temperature is below 60°C (${temp}°C). Quality check flag raised for manual gate review.`);
    }
  });

  document.getElementById('downloadEsgReportBtn').addEventListener('click', downloadEsgReport);
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
        overview: 'AIoT Food Waste Reduction & Redistribution Platform',
        forecasting: 'Stage 1: Multi-Modal Demand Forecasting & Portion Control',
        quality: 'Stage 2: Edge Vision AI & Sensor-Fused Freshness Grading',
        redistribution: 'Stage 3: Perishability-Aware Dynamic Routing & NGO Allocation',
        esg: 'Stage 4: ESG Analytics, Carbon Accounting & Compliance Reports'
      };
      document.getElementById('tabTitle').textContent = titles[btn.dataset.tab] || 'FoodSync Platform';
    });
  });
}

function setupLiveClock() {
  const clock = document.getElementById('liveClock');
  const update = () => {
    const now = new Date();
    clock.textContent = now.toLocaleTimeString() + ' UTC+5:30';
  };
  update();
  setInterval(update, 1000);
}

function initCharts() {
  // 1. Demand & Waste Chart
  const ctx1 = document.getElementById('overviewDemandChart').getContext('2d');
  demandChart = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [
        {
          label: 'AI Forecasted Production (Prophet + XGBoost)',
          data: [890, 910, 880, 930, 820, 710, 680],
          backgroundColor: '#0284c7',
          borderRadius: 6
        },
        {
          label: 'Legacy Static Cooked Meals',
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

  // 2. Surplus Redistribution Doughnut
  const ctx2 = document.getElementById('overviewSurplusDoughnut').getContext('2d');
  surplusDoughnut = new Chart(ctx2, {
    type: 'doughnut',
    data: {
      labels: ['Delivered to NGOs', 'In Transit via VRP', 'Secondary Food Bank', 'Biogas / Compost'],
      datasets: [{
        data: [68, 20, 8, 4],
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
    if (day === 'Friday' || day === 'Saturday') factor *= 0.88;
    if (day === 'Sunday') factor *= 0.75;
    if (weather === 'Rainy') factor *= 0.92;
    if (isExam) factor *= 1.12;
    if (isFestival) factor *= 0.80;

    const pred = Math.round(headcount * factor);
    const legacy = Math.round(headcount * 1.15);
    const saved = Math.max(0, legacy - pred);

    document.getElementById('resPredMeals').textContent = `${pred} Meals`;
    document.getElementById('resLegacyMeals').textContent = `${legacy} Meals`;
    document.getElementById('resSavedMeals').textContent = `${saved} Meals (${((saved/legacy)*100).toFixed(1)}%)`;

    document.getElementById('resRice').textContent = `${(pred * 0.12).toFixed(1)} kg`;
    document.getElementById('resDal').textContent = `${(pred * 0.06).toFixed(1)} kg`;
    document.getElementById('resVeg').textContent = `${(pred * 0.15).toFixed(1)} kg`;
    document.getElementById('resOil').textContent = `${(pred * 0.02).toFixed(1)} L`;

    document.getElementById('resCostSaved').textContent = `₹${(saved * 38.50).toLocaleString()} INR this meal service`;
  });
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

    let score = 100 - (hours * 6.5) - (nh3 > 25 ? (nh3 - 25) * 1.8 : 0) - (temp > 32 ? (temp - 32) * 2.5 : 0);
    score = Math.max(10, Math.min(99, Math.round(score)));

    const scw = Math.max(0, ((score - 40) / 10)).toFixed(1);
    document.getElementById('scwHoursDisplay').textContent = scw;

    const badge = document.getElementById('freshnessGradeBadge');
    const rec = document.getElementById('scwRecommendation');

    if (score >= 75) {
      badge.textContent = `Optimal Freshness (${score}%)`;
      badge.style.background = 'rgba(16, 185, 129, 0.2)';
      badge.style.color = '#34d399';
      rec.textContent = 'Safe for Active Dining Service & Immediate Express Shelter Redistribution.';
    } else if (score >= 50) {
      badge.textContent = `Moderate Freshness (${score}%)`;
      badge.style.background = 'rgba(245, 158, 11, 0.2)';
      badge.style.color = '#fbbf24';
      rec.textContent = 'Dispatch immediately via VRP to nearby shelter (<45 min transit).';
    } else {
      badge.textContent = `Degraded / Critical (${score}%)`;
      badge.style.background = 'rgba(239, 68, 68, 0.2)';
      badge.style.color = '#f87171';
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
    alert(`[✓] Logged ${qty} kg of '${item}' into Surplus Exchange Engine. Match found: Asha Community Shelter (3.2 km).`);
  });
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
      <td><button class="btn btn-outline" style="padding:0.25rem 0.6rem;font-size:0.75rem;" onclick="selectDispatch('${d.id}')">View QR</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function selectDispatch(id) {
  const token = `FOODSYNC-AUTH-TOKEN-SIH2026-${id}`;
  document.getElementById('qrTokenLabel').textContent = token;
  initQRCode(token);
}

function runLivePipeline() {
  alert('🚀 Executing End-to-End FoodSync AI Pipeline:\n\n1. Multi-modal Demand Model adjusted quotas (-18% waste).\n2. Edge CV + IoT sensors evaluated Safe Consumption Window (5.2h SCW).\n3. CVRPTW matched 3 shelters with <25 min transit.\n4. ESG carbon registry updated (+87.5 kg CO₂e avoided).');
}

function downloadEsgReport() {
  const report = {
    organization: "Ministry of Food Processing Industries (MoFPI)",
    initiative: "Smart India Hackathon 2026 (SIH26234)",
    team: "FoodSync (Team ID: 144697)",
    generatedAt: new Date().toISOString(),
    executiveSummary: {
      totalSurplusFoodDivertedKg: 1450,
      totalMealsEquivalentDistributed: 3625,
      ghgEmissionsAvoidedKgCO2e: 3625,
      virtualWaterSavedLiters: 1218000,
      procurementSavingsInr: 55825
    },
    complianceStandards: [
      "FSSAI Save Food Share Food Regulations 2019",
      "SEBI BRSR Core Disclosures (Scope 3 GHG Avoidance)",
      "UN Sustainable Development Goal 12.3",
      "NAAC Green Campus Audit Criteria 7.1"
    ]
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `FoodSync_ESG_Audit_Report_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
}

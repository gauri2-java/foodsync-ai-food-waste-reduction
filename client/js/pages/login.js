// Landing, sign-in and self-registration.
import { api, session } from '../api.js';
import { html, raw, h, $, fmt, errorToast, formData, withBusy, options, toast } from '../ui.js';

const REG_ROLES = [
  ['kitchen_manager', 'Kitchen manager'], ['plant_manager', 'Plant manager'], ['ngo_coordinator', 'NGO coordinator'],
  ['buyer', 'Secondary buyer'], ['quality_officer', 'Food safety officer'], ['driver', 'Delivery driver'], ['auditor', 'Auditor'],
];

function topTicker(stats) {
  if (!stats) return '';
  const items = [[fmt.n(stats.mealsProvided), 'meals delivered'], [fmt.kg(stats.donatedKg), 'surplus food redistributed'], [`${fmt.n(stats.co2eAvoidedKg / 1000, 1)} t`, 'CO₂e avoided'], [stats.ngos, 'verified NGO partners'], [fmt.n(stats.deliveries), 'temperature-verified deliveries'], [stats.kitchens, 'kitchens forecasting daily']];
  return html`<div class="auth-ticker"><span class="ticker-label"><span class="live-dot"></span>Live impact</span><marquee scrollamount="5" onmouseover="this.stop()" onmouseout="this.start()">${raw(items.map(([v, t]) => html`<span class="ticker-chip"><b>${v}</b> ${t}</span>`).join(''))}</marquee></div>`;
}

const PILLARS = [
  ['/img/pillar-kitchen.webp', 'Plan', 'Demand forecasts set cook and purchase quantities'],
  ['/img/pillar-redistribute.webp', 'Redistribute', 'Surplus routed to verified partners before it spoils'],
  ['/img/pillar-community.webp', 'Impact', 'Meals, emissions and savings reported automatically'],
];

function hero() {
  return html`<section class="auth-hero" style="background-image:linear-gradient(180deg, rgba(8,22,15,.62) 0%, rgba(8,22,15,.35) 30%, rgba(8,22,15,.92) 100%), url('/img/hero-fresh.webp')">
    <div class="hero-bottom">
      <div class="hero-eyebrow">Food intelligence platform</div>
      <h1>Less food wasted. More people fed.</h1>
      <p>Demand forecasting, quality monitoring and surplus redistribution for institutional kitchens and food processors.</p>
      <div class="pillars">${raw(PILLARS.map(([img, title, text]) => html`<div class="pillar"><img src="${img}" alt="" loading="lazy"><div><b>${title}</b><span>${text}</span></div></div>`).join(''))}</div>
    </div>
  </section>`;
}

function loginForm() {
  return html`<div class="auth-card">
    <div class="auth-brand"><img src="/img/logo.svg" alt=""><span>FoodSync</span></div>
    <div><h1>Sign in</h1><p class="muted">Welcome back. Enter your organisation credentials.</p></div>
    <form class="form" id="login-form">
      <div class="field"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
      <button class="btn primary" type="submit" style="padding:10px">Sign in</button>
    </form>
    <p class="muted" style="margin:0">Don't have an account? <a href="#/register">Request access</a></p>
    <p class="faint auth-foot">© ${new Date().getFullYear()} FoodSync · Secure access for kitchens, processors, NGOs and partners</p>
  </div>`;
}

function registerForm(orgs) {
  return html`<div class="auth-card">
    <div class="auth-brand"><img src="/img/logo.svg" alt=""><span>FoodSync</span></div>
    <div><h1>Request access</h1><p class="muted">New organisations are verified before activation.</p></div>
    <form class="form" id="reg-form">
      <div class="form-row"><div class="field"><label>Full name</label><input name="full_name" required></div><div class="field"><label>Phone</label><input name="phone" type="tel"></div></div>
      <div class="form-row"><div class="field"><label>Work email</label><input name="email" type="email" autocomplete="username" required></div><div class="field"><label>Password</label><input name="password" type="password" minlength="8" autocomplete="new-password" placeholder="Min. 8 characters" required></div></div>
      <div class="form-row"><div class="field"><label>Role</label><select name="role" required>${raw(REG_ROLES.map(([v, l]) => `<option value="${v}">${l}</option>`).join(''))}</select></div><div class="field"><label>Organisation</label><select name="org_id">${raw(options(orgs, '', { blank: 'New organisation…', labelKey: (o) => o.name }))}</select></div></div>
      <div class="field" id="org-name-field"><label>New organisation name</label><input name="org_name" placeholder="e.g. City Food Bank Trust"></div>
      <button class="btn primary" type="submit" style="padding:10px">Submit request</button>
    </form>
    <p class="muted" style="margin:0">Already have an account? <a href="#/login">Sign in</a></p>
  </div>`;
}

async function signIn(email, password, onLogin) {
  const { token, user } = await api.post('/auth/login', { email, password });
  session.token = token;
  session.user = user;
  onLogin();
}

function bindLogin(root, onLogin) {
  const form = $('#login-form', root);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const { email, password } = formData(form);
    await withBusy(form.querySelector('button'), () => signIn(email, password, onLogin)).catch(errorToast);
  };
}

function bindRegister(root, onLogin) {
  const form = $('#reg-form', root);
  const orgSelect = form.elements.org_id;
  orgSelect.onchange = () => { $('#org-name-field', root).hidden = !!orgSelect.value; };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = formData(form);
    if (data.org_id) data.org_id = Number(data.org_id);
    await withBusy(form.querySelector('button[type=submit]'), async () => {
      const { token, user } = await api.post('/auth/register', data);
      session.token = token;
      session.user = user;
      toast('Welcome to FoodSync', 'ok');
      onLogin();
    }).catch(errorToast);
  };
}

export async function render(root, { mode, onLogin }) {
  if (mode === 'login' && session.token) { onLogin(); return; }
  const [stats, orgs] = await Promise.all([api.get('/public/stats').catch(() => null), mode === 'register' ? api.get('/public/organizations').catch(() => []) : []]);
  root.innerHTML = html`<div class="auth-page">${raw(topTicker(stats))}<div class="auth">${raw(hero())}<section class="auth-panel">${raw(mode === 'register' ? registerForm(orgs) : loginForm())}</section></div></div>`;
  if (mode === 'register') bindRegister(root, onLogin);
  else bindLogin(root, onLogin);
}

/**
 * energy-flow-card.js  v4.0
 * CSS animated dash flows • day/night photo switching • Tesla-style callouts
 */

const CARD_VERSION = '4.9.2';

const DEFAULTS = {
  solar_power:       'sensor.rinu_s_home_solar_power',
  battery_power:     'sensor.rinu_s_home_battery_power',
  battery_soc:       'sensor.powerwall_battery_soc',
  grid_power:        'sensor.rinu_s_home_grid_power',
  house_power:       'sensor.rinu_s_home_load_power',
  ev_power:          'sensor.wall_connector_power_4',
  heat_pump_power:   'sensor.shellyem_34945473ca04_channel_2_power',
  solar_today:       'sensor.rinu_s_home_solar_generated',
  grid_export_today: 'sensor.rinu_s_home_grid_exported',
  grid_import_today: 'sensor.daily_grid_import',
  house_today:       'sensor.rinu_s_home_home_usage',
  cost_today:        'sensor.daily_net_cost',
  ev_soc_rinu:       'sensor.rinu_s_tesla_battery_level',
  ev_soc_lara:       'sensor.lara_s_tesla_battery_level',
  kitchen_temp:      'sensor.kitchen_indoor_temperature',
  fill_height:       false,
  weather:           'weather.forecast_home',
  sun:               'sun.sun',
  bg_url:            'https://cdn.jsdelivr.net/gh/rinudt13/ha-energy-flow-card@main/house.png',
  bg_url_night:      'https://cdn.jsdelivr.net/gh/rinudt13/ha-energy-flow-card@main/house-night.jpg',
  title:             "RINU'S HOME",
};

// Badge positions (% of card) — sky/clear area away from components
const LAYOUT = {
  solar:  { x: 22,  y: 15 },
  pwall:  { x:  9,  y: 15 },
  house:  { x: 68,  y: 12 },
  grid:   { x:  6,  y: 62 },
  hp:     { x: 91,  y: 16 },
  ev:     { x: 50,  y: 12 },
};

// Component anchor points on photo (SVG 800×450)
const ANCHORS = {
  solar: { x: 195, y: 185 },
  pwall: { x: 112, y: 270 },  // white Powerwall box on left wall
  house: { x: 510, y: 250 },
  grid:  { x:  18, y: 310 },  // supply cable entry far-left
  hp:    { x: 680, y: 295 },
  ev:    { x: 382, y: 328 },
};

// Leader line endpoints (badge-bottom → anchor)
const LEADERS = {
  solar: { x1: 176, y1: 100, x2: 195, y2: 185 },
  pwall: { x1:  72, y1: 100, x2: 112, y2: 270 },
  house: { x1: 544, y1:  82, x2: 510, y2: 250 },
  grid:  { x1:  48, y1: 295, x2:  18, y2: 310 },
  hp:    { x1: 728, y1: 105, x2: 680, y2: 295 },
  ev:    { x1: 400, y1:  82, x2: 382, y2: 328 },
};

// Architectural flow paths — trace actual walls/cables on the photo (800×450)
const PATHS = {
  grid:    'M 0 315 L 146 338 L 159 337 L 159 251 L 196 249',
  battery: 'M 132 249 L 148 243 L 198 241',
  house:   'M 244 247 L 278 246 L 372 237 L 495 237 L 496 257',
  solar:   'M 248 165 L 212 200 L 210 230',
  ev:      'M 270 318 L 320 330 L 385 300',
  hp:      'M 683 288 L 683 261 L 659 261',
};

// ─── CSS-animated flow line ───────────────────────────────────────────────────
// Uses stroke-dashoffset animation — no particles, pure CSS engine.
// Speed is set by adjusting animation-duration based on watts.
class FlowLine {
  constructor(svgEl, pathEl, color, reverse = false) {
    this.active  = false;
    this.reverse = reverse;
    this.watts   = 0;
    this._color  = color;

    this.el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.el.setAttribute('d', pathEl.getAttribute('d'));
    this.el.setAttribute('fill', 'none');
    this.el.setAttribute('stroke', color);
    this.el.setAttribute('stroke-width', '3.5');
    this.el.setAttribute('stroke-linecap', 'round');
    // dash 18px, gap 9px → pattern unit = 27
    this.el.setAttribute('stroke-dasharray', '18 9');
    this.el.setAttribute('filter', 'url(#lineGlow)');
    this.el.setAttribute('opacity', '0');
    this.el.style.animationName      = 'flowDash';
    this.el.style.animationTimingFunction   = 'linear';
    this.el.style.animationIterationCount  = 'infinite';
    this.el.style.animationDirection = reverse ? 'reverse' : 'normal';
    this.el.style.animationPlayState = 'paused';
    svgEl.appendChild(this.el);
  }

  update() {
    if (this.active) {
      // duration: 2.8s at near-zero → 0.25s at 5 kW
      const dur = Math.max(250, 2800 / (1 + this.watts / 350));
      this.el.style.animationDuration  = dur + 'ms';
      this.el.style.animationPlayState = 'running';
      this.el.setAttribute('opacity', '0.88');
    } else {
      this.el.style.animationPlayState = 'paused';
      this.el.setAttribute('opacity', '0');
    }
  }

  destroy() { this.el.remove(); }
}

// ─── Card ─────────────────────────────────────────────────────────────────────
class EnergyFlowCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._cfg    = null;
    this._hass   = null;
    this._flows  = {};
    this._ready  = false;
    this._nightImg = false;
  }

  static getStubConfig() { return { entities: {} }; }

  setConfig(config) {
    this._cfg = { ...DEFAULTS, ...(config || {}), entities: { ...DEFAULTS, ...(config?.entities || {}) } };
    Object.assign(this._cfg, this._cfg.entities);
    this._build();
  }

  set hass(h) {
    this._hass = h;
    if (this._ready) this._update();
  }

  connectedCallback()    {}
  disconnectedCallback() {}

  _s(id) { return this._hass?.states?.[id]; }

  _n(id) {
    if (!id) return 0;
    const s = this._s(id);
    if (!s) return 0;
    const v = parseFloat(s.state);
    if (isNaN(v)) return 0;
    const unit = (s.attributes?.unit_of_measurement || '').trim();
    return unit === 'W' ? v / 1000 : v;   // kWh / % / £ pass through as-is
  }

  _nRaw(id) {
    if (!id) return null;
    const s = this._s(id);
    if (!s) return null;
    const v = parseFloat(s.state);
    return isNaN(v) ? null : v;
  }

  _night() { return this._s(this._cfg.sun)?.state === 'below_horizon'; }

  _fmt(kw) {
    const a = Math.abs(kw);
    return a < 0.01 ? '0.00 kW' : a.toFixed(2) + ' kW';
  }

  _weatherIcon(state) {
    const m = { sunny:'☀️', 'clear-night':'🌙', partlycloudy:'⛅', cloudy:'☁️',
      rainy:'🌧️', pouring:'🌧️', 'lightning-rainy':'⛈️', snowy:'❄️', fog:'🌫️',
      windy:'💨', hail:'🌨️', exceptional:'🌡️' };
    return m[state] || '🌤️';
  }

  _build() {
    const c = this._cfg;

    const leaderLines = Object.entries(LEADERS).map(([k, l]) =>
      `<line id="ll-${k}" x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}"
             stroke="rgba(255,255,255,0.3)" stroke-width="1" stroke-dasharray="3 5"
             stroke-linecap="round"/>`
    ).join('\n    ');

    const anchorDots = Object.entries(ANCHORS).map(([k, a]) =>
      `<circle cx="${a.x}" cy="${a.y}" r="3"
               fill="rgba(255,255,255,0.5)" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>`
    ).join('\n    ');

    this.shadowRoot.innerHTML = `
<style>
  :host { display:block; ${c.fill_height ? 'height:100svh;' : ''} }
  ha-card { padding:0; overflow:hidden; background:#000;
            border-radius:${c.fill_height ? '0' : '20px'};
            box-shadow:${c.fill_height ? 'none' : '0 16px 48px rgba(0,0,0,.6)'}; }

  .wrap { position:relative; width:100%;
          ${c.fill_height ? 'height:100svh;' : 'aspect-ratio:16/9;'}
          overflow:hidden; }

  .bg { position:absolute; inset:0; width:100%; height:100%;
        object-fit:cover; object-position:center; }

  /* fallback night-filter if no night image is configured */
  .bg.night-filter { filter:brightness(0.35) saturate(0.7) hue-rotate(200deg); }

  /* window glow overlays — used with real night image for extra warmth */
  .wglow { position:absolute; border-radius:50%; pointer-events:none;
           background:radial-gradient(circle, rgba(255,210,100,0.55) 0%, transparent 70%);
           opacity:0; transition:opacity 2.5s ease; }
  .wglow.on { opacity:1; }

  .svg-layer { position:absolute; inset:0; width:100%; height:100%;
               pointer-events:none; overflow:visible; }

  /* ── CSS flow animation ── */
  @keyframes flowDash {
    from { stroke-dashoffset: 27; }
    to   { stroke-dashoffset: 0;  }
  }

  /* top header — single compact row: title | weather | clock */
  .header { position:absolute; top:0; left:0; right:0; z-index:2;
            background:linear-gradient(180deg,rgba(0,0,0,.78) 0%,transparent 100%);
            padding:1.2% 3% 2%; display:flex; align-items:center;
            justify-content:space-between; gap:10px; }
  .header-left { display:flex; align-items:center; gap:12px; flex:1; min-width:0; }
  .title  { font-family:'Segoe UI',sans-serif; font-size:2.2cqi; font-weight:800;
            color:#fff; letter-spacing:.08em; text-shadow:0 2px 12px rgba(0,0,0,.8);
            white-space:nowrap; }
  .clock  { font-family:monospace; font-size:1.6cqi; color:#e2e8f0;
            text-shadow:0 1px 6px rgba(0,0,0,.9); text-align:right; white-space:nowrap; }
  .weather-widget { display:flex; align-items:center; gap:4px;
                    font-family:'Segoe UI',sans-serif; font-size:1.3cqi; color:#e2e8f0;
                    white-space:nowrap; }
  .w-icon { font-size:1.8cqi; line-height:1; }

  /* bottom stats */
  .stats { position:absolute; bottom:0; left:0; right:0;
           background:linear-gradient(0deg,rgba(0,0,0,.82) 0%,transparent 100%);
           padding:3% 3% 2%; display:flex; justify-content:space-between;
           align-items:flex-end; gap:8px; }
  .stat { display:flex; flex-direction:column; align-items:center;
          font-family:'Segoe UI',sans-serif; }
  .stat-val  { font-size:2cqi; font-weight:700; color:#fff; text-shadow:0 0 8px currentColor; }
  .stat-lbl  { font-size:1.1cqi; color:rgba(255,255,255,.6); margin-top:1px; }
  .stat.solar .stat-val   { color:#FDD835; }
  .stat.export .stat-val  { color:#4ade80; }
  .stat.import .stat-val  { color:#f87171; }
  .stat.cost .stat-val    { color:#67e8f9; }
  .stat.selfuse .stat-val { color:#a78bfa; }

  /* callout badges */
  .badge { position:absolute; transform:translate(-50%,-50%); z-index:5;
           background:rgba(0,0,0,.72); backdrop-filter:blur(16px) saturate(1.8);
           -webkit-backdrop-filter:blur(16px) saturate(1.8);
           border:1px solid rgba(255,255,255,.18); border-radius:10px; padding:4px 8px;
           box-shadow:0 4px 18px rgba(0,0,0,.55);
           font-family:'Segoe UI',sans-serif;
           display:flex; flex-direction:column; align-items:center;
           min-width:58px; transition:box-shadow .4s; }
  .badge.active { box-shadow:0 4px 18px rgba(0,0,0,.55), 0 0 14px var(--clr); }

  /* mobile / narrow tablet scaling */
  @container (max-width: 600px) {
    .b-icon { font-size:1.6cqi; }
    .b-val  { font-size:2cqi; }
    .b-lbl, .b-sub { font-size:1.1cqi; }
    .stat-val { font-size:2.8cqi; }
    .stat-lbl { font-size:1.5cqi; }
    .title    { font-size:3cqi; }
    .clock    { font-size:2.4cqi; }
    .weather-widget { font-size:2cqi; }
    .w-icon   { font-size:2.8cqi; }
  }
  .b-icon { font-size:1.1cqi; line-height:1; }
  .b-lbl  { font-size:0.75cqi; color:rgba(255,255,255,.5); margin-top:1px; }
  .b-val  { font-size:1.3cqi; font-weight:700; color:#fff; text-shadow:0 0 8px var(--clr); }
  .b-sub  { font-size:0.75cqi; color:rgba(255,255,255,.45); margin-top:1px; }

  .badge.solar  { --clr:#FDD835; border-left:3px solid #FDD835; }
  .badge.pwall  { --clr:#4ade80; border-left:3px solid #4ade80; }
  .badge.house  { --clr:#38d0ff; border-left:3px solid #38d0ff; }
  .badge.grid   { --clr:#f87171; border-left:3px solid #f87171; }
  .badge.grid.exporting { --clr:#4ade80; border-left:3px solid #4ade80; }
  .badge.hp     { --clr:#fb923c; border-left:3px solid #fb923c; }
  .badge.ev     { --clr:#38bdf8; border-left:3px solid #38bdf8; }

  .soc-arc { width:26px; height:13px; overflow:visible; margin-top:2px; }
</style>

<ha-card>
<div class="wrap" id="wrap">

  <img class="bg" id="bg" src="${c.bg_url}" alt="house"/>

  <!-- window glow overlays — subtle warmth on top of the night photo -->
  <div class="wglow" id="wg1" style="width:9%;height:5%;left:61%;top:34%"></div>
  <div class="wglow" id="wg2" style="width:11%;height:6%;left:71%;top:34%"></div>
  <div class="wglow" id="wg3" style="width:7%;height:4%;left:51%;top:37%"></div>
  <div class="wglow" id="wg4" style="width:5%;height:3%;left:42%;top:40%"></div>
  <div class="wglow" id="wg5" style="width:4%;height:3%;left:19%;top:47%"></div>

  <svg class="svg-layer" id="svg-layer" viewBox="0 0 800 450"
       xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <defs>
      <filter id="lineGlow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="4" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>

    <!-- faint guide tracks -->
    ${Object.entries(PATHS).map(([id, d]) =>
      `<path id="p-${id}" d="${d}" fill="none" stroke="rgba(255,255,255,0.08)"
             stroke-width="2" stroke-dasharray="4 7" stroke-linecap="round"/>`
    ).join('\n    ')}

    <!-- leader lines: badge → component -->
    ${leaderLines}
    ${anchorDots}
  </svg>

  <!-- callout badges -->
  <div class="badge solar" id="b-solar" style="left:${LAYOUT.solar.x}%;top:${LAYOUT.solar.y}%">
    <span class="b-icon">☀️</span>
    <span class="b-lbl">Solar</span>
    <span class="b-val" id="v-solar">0.00 kW</span>
  </div>

  <div class="badge pwall" id="b-pwall" style="left:${LAYOUT.pwall.x}%;top:${LAYOUT.pwall.y}%">
    <span class="b-icon">⚡</span>
    <span class="b-lbl">Powerwall</span>
    <span class="b-val" id="v-pwall">0.00 kW</span>
    <svg class="soc-arc" viewBox="0 0 56 28">
      <path d="M4 28 A24 24 0 0 1 52 28" fill="none" stroke="rgba(255,255,255,.15)"
            stroke-width="5" stroke-linecap="round"/>
      <path id="soc-path" d="M4 28 A24 24 0 0 1 52 28" fill="none" stroke="#4ade80"
            stroke-width="5" stroke-linecap="round"
            stroke-dasharray="75.4" stroke-dashoffset="37.7"/>
      <text id="soc-txt" x="28" y="26" text-anchor="middle" fill="white"
            font-size="10" font-family="monospace" font-weight="700">--%</text>
    </svg>
    <span class="b-sub" id="v-bat-dir">–</span>
  </div>

  <div class="badge house" id="b-house" style="left:${LAYOUT.house.x}%;top:${LAYOUT.house.y}%">
    <span class="b-icon">🏠</span>
    <span class="b-lbl">Home</span>
    <span class="b-val" id="v-house">0.00 kW</span>
  </div>

  <div class="badge grid" id="b-grid" style="left:${LAYOUT.grid.x}%;top:${LAYOUT.grid.y}%">
    <span class="b-icon">🔌</span>
    <span class="b-lbl">Grid</span>
    <span class="b-val" id="v-grid">0.00 kW</span>
    <span class="b-sub" id="v-grid-dir">–</span>
  </div>

  <div class="badge hp" id="b-hp" style="left:${LAYOUT.hp.x}%;top:${LAYOUT.hp.y}%">
    <span class="b-icon">🌡️</span>
    <span class="b-lbl">Heat Pump</span>
    <span class="b-val" id="v-hp">0.00 kW</span>
    <span class="b-sub" id="v-hp-status" style="font-size:0.95cqi;color:rgba(255,255,255,.75)">⚪ Idle</span>
    <span class="b-sub" id="v-kitchen-temp" style="font-size:0.9cqi;color:rgba(255,220,100,.8)">Kitchen: –</span>
  </div>

  <div class="badge ev" id="b-ev" style="left:${LAYOUT.ev.x}%;top:${LAYOUT.ev.y}%">
    <span class="b-icon">🚗</span>
    <span class="b-lbl">EV</span>
    <span class="b-val" id="v-ev">0.00 kW</span>
    <span class="b-sub" id="v-ev-soc">R:–% L:–%</span>
  </div>

  <!-- header -->
  <div class="header">
    <div class="header-left">
      <span class="title">${c.title}</span>
      <div class="weather-widget">
        <span class="w-icon" id="w-icon">🌤️</span>
        <span id="w-cond" style="font-weight:600">–</span>
        <span id="w-temp" style="opacity:.7">–</span>
      </div>
    </div>
    <div class="clock" id="clock">00:00:00</div>
  </div>

  <!-- stats bar -->
  <div class="stats">
    <div class="stat solar">
      <span class="stat-val" id="st-solar">–</span>
      <span class="stat-lbl">☀️ Solar today</span>
    </div>
    <div class="stat export">
      <span class="stat-val" id="st-export">–</span>
      <span class="stat-lbl">↑ Export today</span>
    </div>
    <div class="stat selfuse">
      <span class="stat-val" id="st-self">–</span>
      <span class="stat-lbl">⚡ Self-use</span>
    </div>
    <div class="stat import">
      <span class="stat-val" id="st-import">–</span>
      <span class="stat-lbl">↓ Import today</span>
    </div>
    <div class="stat cost">
      <span class="stat-val" id="st-cost">–</span>
      <span class="stat-lbl">💷 Cost today</span>
    </div>
  </div>

</div>
</ha-card>`;

    this._ready = true;
    this._initFlows();
    this._startClock();
    if (this._hass) this._update();
  }

  _initFlows() {
    const svg = this.shadowRoot.getElementById('svg-layer');
    if (!svg) return;
    const p = id => svg.querySelector(`#p-${id}`);

    // [key, pathId, color, reverse]
    // reverse=true → dashes flow end→start (opposite path direction)
    [
      ['solar',   'solar',   '#FDD835', false],  // panels → inverter (gold)
      ['batChr',  'battery', '#4ade80', true ],  // charging: inverter→battery (green, reverse)
      ['batDis',  'battery', '#f59e0b', false],  // discharging: battery→inverter (amber)
      ['gridImp', 'grid',    '#f87171', false],  // import: street→inverter (red)
      ['gridExp', 'grid',    '#4ade80', true ],  // export: inverter→street (green, reverse)
      ['house',   'house',   '#38d0ff', false],  // inverter→home (light blue)
      ['ev',      'ev',      '#38bdf8', false],  // inverter→car (blue)
      ['hp',      'hp',      '#fb923c', false],  // HP unit (orange)
    ].forEach(([key, pathId, color, rev]) => {
      const pathEl = p(pathId);
      if (!pathEl) return;
      this._flows[key] = new FlowLine(svg, pathEl, color, rev);
    });
  }

  _update() {
    if (!this._hass || !this._cfg || !this._ready) return;
    const c  = this._cfg;
    const sr = this.shadowRoot;

    const solar  = this._n(c.solar_power);
    const bat    = this._n(c.battery_power);   // + = discharging
    const batSoc = this._n(c.battery_soc);
    const grid   = this._n(c.grid_power);       // − = exporting
    const house  = this._n(c.house_power);
    const hp     = this._n(c.heat_pump_power);
    const ev     = this._n(c.ev_power);

    const T       = 0.02;
    const HP_T    = 0.005;  // 5 W — HP idles at low draw
    const batDis  = bat  >  T;
    const batChr  = bat  < -T;
    const gridExp = grid < -T;
    const gridImp = grid >  T;

    // badge values
    this._set('v-solar',    this._fmt(solar));
    this._set('v-pwall',    this._fmt(Math.abs(bat)));
    this._set('v-bat-dir',  batDis ? '↑ Discharging' : batChr ? '↓ Charging' : '⚖ Standby');
    this._set('v-house',    this._fmt(house));
    this._set('v-grid',     this._fmt(Math.abs(grid)));
    this._set('v-grid-dir', gridImp ? '↓ Importing' : gridExp ? '↑ Exporting' : '≈ Balanced');
    this._set('v-hp',       this._fmt(hp));
    this._set('v-ev',       this._fmt(ev));

    this._setActive('b-solar', solar > T);
    this._setActive('b-pwall', Math.abs(bat) > T);
    this._setActive('b-house', house > T);
    this._setActive('b-hp',    hp > HP_T);
    this._setActive('b-ev',    ev > T);

    const bGrid = sr.getElementById('b-grid');
    if (bGrid) {
      bGrid.classList.toggle('exporting', gridExp);
      this._setActive('b-grid', Math.abs(grid) > T);
    }

    // SOC arc
    const arc = sr.getElementById('soc-path');
    const soc = sr.getElementById('soc-txt');
    if (arc && batSoc >= 0) {
      const offset = 75.4 * (1 - batSoc / 100);
      arc.setAttribute('stroke-dashoffset', offset);
      arc.setAttribute('stroke', batSoc > 60 ? '#4ade80' : batSoc > 25 ? '#fbbf24' : '#f87171');
      if (soc) soc.textContent = Math.round(batSoc) + '%';
    }

    // flows — set active + watts, then call update()
    const fw = (key, active, w) => {
      const fl = this._flows[key];
      if (!fl) return;
      fl.active = active;
      fl.watts  = w;
      fl.update();
    };

    fw('solar',   solar > T,  solar * 1000);
    fw('batChr',  batChr,     Math.abs(bat) * 1000);
    fw('batDis',  batDis,     Math.abs(bat) * 1000);
    fw('gridImp', gridImp,    Math.abs(grid) * 1000);
    fw('gridExp', gridExp,    Math.abs(grid) * 1000);
    fw('house',   house > T,  house * 1000);
    fw('ev',      ev > T,     ev * 1000);
    fw('hp',      hp > HP_T,  hp * 1000);

    // daily stats
    const sToday    = this._n(c.solar_today);
    const expToday  = this._n(c.grid_export_today);
    const impToday  = this._n(c.grid_import_today);
    const houseToday = this._n(c.house_today);
    const costV     = this._nRaw(c.cost_today);
    // Self-use = solar energy consumed by the house / total house consumption
    // = min(solar, house_load) / house_load — handles battery-from-grid + solar export correctly
    const selfUse = houseToday > 0
      ? Math.round(Math.max(0, Math.min(100, (Math.min(sToday, houseToday) / houseToday) * 100)))
      : (sToday > 0 ? Math.round(Math.max(0, Math.min(100, ((sToday - expToday) / sToday) * 100))) : 0);

    this._set('st-solar',  sToday   > 0   ? sToday.toFixed(1)  + ' kWh' : '–');
    this._set('st-export', expToday > 0   ? expToday.toFixed(1) + ' kWh' : '–');
    this._set('st-import', impToday > 0   ? impToday.toFixed(1) + ' kWh' : '–');
    this._set('st-self',   (sToday > 0 || houseToday > 0) ? selfUse + '%' : '–');
    this._set('st-cost',   costV != null  ? (costV < 0 ? '-' : '') + '£' + Math.abs(costV).toFixed(2) : '–');

    // EV SOC
    const socRinu = this._nRaw(c.ev_soc_rinu);
    const socLara = this._nRaw(c.ev_soc_lara);
    const socStr = 'R:' + (socRinu != null ? Math.round(socRinu) + '%' : '–') +
                   ' L:' + (socLara != null ? Math.round(socLara) + '%' : '–');
    this._set('v-ev-soc', socStr);

    // HP status + kitchen temp
    this._set('v-hp-status', hp > 0.1 ? '🟢 Running' : '⚪ Idle');
    const kitchenT = this._nRaw(c.kitchen_temp);
    this._set('v-kitchen-temp', kitchenT != null ? `🏠 ${kitchenT.toFixed(1)}°C` : 'Kitchen: –');

    // weather
    const wx = this._s(c.weather);
    if (wx) {
      this._set('w-icon', this._weatherIcon(wx.state));
      const names = { sunny:'Sunny','clear-night':'Clear Night',partlycloudy:'Partly Cloudy',
        cloudy:'Cloudy',rainy:'Rainy',pouring:'Pouring','lightning-rainy':'Thunderstorm',
        snowy:'Snowy','snowy-rainy':'Sleet',fog:'Foggy',windy:'Windy',hail:'Hail',
        exceptional:'Exceptional','windy-variant':'Windy' };
      this._set('w-cond', names[wx.state] ||
        wx.state.replace(/[-_]/g,' ').replace(/\b\w/g, ch => ch.toUpperCase()));
      const t = wx.attributes?.temperature;
      const u = (wx.attributes?.temperature_unit ?? 'C').replace(/^°/, '');
      this._set('w-temp', t != null ? t + '°' + u : '–');
    }

    // day / night image switching
    const night = this._night();
    const bg = sr.getElementById('bg');
    if (bg) {
      const target = (night && c.bg_url_night) ? c.bg_url_night : c.bg_url;
      if (bg.dataset.cur !== target) {
        bg.dataset.cur = target;
        bg.src = target;
      }
      // fallback CSS filter only if no night image
      bg.classList.toggle('night-filter', night && !c.bg_url_night);
    }

    // window glows — more visible at night when using real night photo
    const glowOn = night;
    sr.querySelectorAll('.wglow').forEach(el => el.classList.toggle('on', glowOn));
  }

  _set(id, val) {
    const el = this.shadowRoot.getElementById(id);
    if (el) el.textContent = val;
  }

  _setActive(id, on) {
    const el = this.shadowRoot.getElementById(id);
    if (el) el.classList.toggle('active', on);
  }

  _startClock() {
    const tick = () => {
      const el = this.shadowRoot?.getElementById('clock');
      if (el) el.textContent = new Date().toLocaleTimeString('en-GB');
    };
    tick();
    setInterval(tick, 1000);
  }

  getCardSize() { return 7; }
}

customElements.define('energy-flow-card', EnergyFlowCard);

window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === 'energy-flow-card')) {
  window.customCards.push({
    type: 'energy-flow-card',
    name: 'Energy Flow Card',
    description: 'Photo-based energy flow — CSS dash animations, Tesla callout badges, day/night photos',
    preview: true,
  });
}

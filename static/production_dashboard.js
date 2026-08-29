const format = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);
const formatPct = (value) => `${(value * 100).toFixed(1)}%`;

const start = document.querySelector("#production-start");
const end = document.querySelector("#production-end");
const content = document.querySelector("#production-content");
const error = document.querySelector("#production-error");
const refreshIntervalMs = 30_000;

function renderMaterials(materials) {
  const target = document.querySelector("#material-chart");
  target.replaceChildren();
  const max = Math.max(...materials.map((item) => item.value), 1);
  materials.forEach((item) => {
    const card = document.createElement("div");
    card.className = "mat-card";
    const pct = item.value > 0 ? ((item.value / max) * 100).toFixed(1) : 0;
    card.innerHTML = `
      <div class="mat-head">
        <span class="mat-code">${item.name}</span>
        <strong class="mat-val">${format(item.value)}</strong>
      </div>
      <div class="mat-bar-bg"><div class="mat-bar-fill" style="width:${pct}%"></div></div>
    `;
    target.append(card);
  });
}

function renderProduction(prod) {
  // OB
  document.querySelector("#ob-actual").textContent = format(prod.ob.actual);
  document.querySelector("#ob-plan").textContent = format(prod.ob.plan);
  document.querySelector("#ob-progress").textContent = `${prod.ob.progress}%`;
  document.querySelector("#ob-bar").style.width = `${Math.min(prod.ob.progress, 100)}%`;

  // Coal
  document.querySelector("#coal-actual").textContent = format(prod.coal.actual);
  document.querySelector("#coal-plan").textContent = format(prod.coal.plan);
  document.querySelector("#coal-progress").textContent = `${prod.coal.progress}%`;
  document.querySelector("#coal-bar").style.width = `${Math.min(prod.coal.progress, 100)}%`;

  // SR
  document.querySelector("#sr-actual").textContent = format(prod.sr.actual);
  document.querySelector("#sr-plan").textContent = format(prod.sr.plan);
  document.querySelector("#sr-progress").textContent = `${prod.sr.progress}%`;
  document.querySelector("#sr-bar").style.width = `${Math.min(prod.sr.progress, 100)}%`;

  // Productivity
  document.querySelector("#productivity-val").textContent = format(prod.productivity);
}

function renderWeather(w) {
  document.querySelector("#w-rain-h").textContent = `${format(w.rain_hours)} hrs`;
  document.querySelector("#w-rain-x").textContent = `${format(w.rain_freq)} x kejadian`;

  document.querySelector("#w-slip-h").textContent = `${format(w.slippery_hours)} hrs`;
  document.querySelector("#w-slip-x").textContent = `${format(w.slippery_freq)} x kejadian`;

  document.querySelector("#w-fog-h").textContent = `${format(w.foggy_hours)} hrs`;
  document.querySelector("#w-fog-x").textContent = `${format(w.foggy_freq)} x kejadian`;

  document.querySelector("#w-rain-int").textContent = `${format(w.rain_intensity)} mm`;
}

function renderFleet(f) {
  document.querySelector("#act-fleet").textContent = format(f.actual_fleet);
  document.querySelector("#plan-fleet").textContent = format(f.plan_fleet);

  document.querySelector("#act-pa-prod").textContent = formatPct(f.actual_pa_prod);
  document.querySelector("#plan-pa-prod").textContent = formatPct(f.plan_pa_prod);

  document.querySelector("#act-pa-supp").textContent = formatPct(f.actual_pa_supp);
  document.querySelector("#plan-pa-supp").textContent = formatPct(f.plan_pa_supp);
}

function renderUtilization(u) {
  document.querySelector("#act-ua").textContent = formatPct(u.actual_ua);
  document.querySelector("#plan-ua").textContent = formatPct(u.plan_ua);

  document.querySelector("#act-uo").textContent = formatPct(u.actual_uo);
  document.querySelector("#plan-uo").textContent = formatPct(u.plan_uo);
}

async function load() {
  error.hidden = true;
  const params = new URLSearchParams();
  if (start.value) params.set("start", start.value);
  if (end.value) params.set("end", end.value);

  const response = await fetch(`/api/production?${params}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);

  content.hidden = false;
  document.querySelector("#production-range").textContent = `Data Operasional Tanggal ${data.range.start} s.d. ${data.range.end}`;

  renderMaterials(data.materials);
  renderProduction(data.production);
  renderWeather(data.weather);
  renderFleet(data.fleet);
  renderUtilization(data.utilization);
}

function showLoadError(reason) {
  error.textContent = reason.message;
  error.hidden = false;
}

document.querySelector("#apply-production-filter").addEventListener("click", () => load().catch(showLoadError));
load().catch(showLoadError);
window.setInterval(() => load().catch(showLoadError), refreshIntervalMs);

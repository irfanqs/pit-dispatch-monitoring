const format = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);
const start = document.querySelector("#production-start");
const end = document.querySelector("#production-end");
const content = document.querySelector("#production-content");
const error = document.querySelector("#production-error");
const refreshIntervalMs = 30_000;

function card(prefix, data) {
  document.querySelector(`#${prefix}-actual`).textContent = format(data.actual);
  document.querySelector(`#${prefix}-plan`).textContent = format(data.plan);
  document.querySelector(`#${prefix}-progress`).textContent = data.progress;
  document.querySelector(`#${prefix}-bar`).style.width = `${Math.min(data.progress, 100)}%`;
}
function renderMaterials(materials) {
  const target = document.querySelector("#material-chart"); target.replaceChildren();
  const max = Math.max(...materials.map((item) => item.value), 1);
  materials.filter((item) => item.value > 0).forEach((item) => { const row = document.createElement("div"); row.className = "material-row"; row.innerHTML = `<span>${item.name}</span><i><b style="width:${item.value / max * 100}%"></b></i><strong>${format(item.value)}</strong>`; target.append(row); });
}
function renderWaterfall(items) {
  const target = document.querySelector("#waterfall-chart"); target.replaceChildren();
  const max = Math.max(...items.map((item) => Math.abs(item.total ? item.value : 0)), 1);
  items.forEach((item) => { const row = document.createElement("div"); row.className = `waterfall-row ${item.total ? "total" : item.value < 0 ? "loss" : "gain"}`; row.innerHTML = `<span>${item.name}</span><i><b style="width:${Math.abs(item.value) / max * 100}%"></b></i><strong>${item.value < 0 ? "-" : ""}${format(Math.abs(item.value))}</strong>`; target.append(row); });
}
async function load() { error.hidden = true; const params = new URLSearchParams(); if (start.value) params.set("start", start.value); if (end.value) params.set("end", end.value); const response = await fetch(`/api/production?${params}`, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); content.hidden = false; document.querySelector("#production-range").textContent = `${data.range.start} sampai ${data.range.end}`; card("ob", data.ob); card("coal", data.coal); renderMaterials(data.materials); renderWaterfall(data.waterfall); document.querySelector("#waterfall-note").textContent = data.waterfall_note; }
function showLoadError(reason) { error.textContent = reason.message; error.hidden = false; }
document.querySelector("#apply-production-filter").addEventListener("click", () => load().catch(showLoadError));
load().catch(showLoadError);
window.setInterval(() => load().catch(showLoadError), refreshIntervalMs);

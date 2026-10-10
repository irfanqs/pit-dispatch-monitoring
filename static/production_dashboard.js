const format = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);
const formatPct = (value) => `${(value * 100).toFixed(1)}%`;

const start = document.querySelector("#production-start");
const end = document.querySelector("#production-end");
const content = document.querySelector("#production-content");
const error = document.querySelector("#production-error");
const rangeLabel = document.querySelector("#production-range");
const chatScope = document.querySelector("#production-chat-scope");
const formatDate = (isoDate) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" })
  .format(new Date(`${isoDate}T00:00:00`));
// Chat gets the last applied filter as context, not dates typed but not yet applied.
let appliedRange = { start: "", end: "" };
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
  document.querySelector("#productivity-val").textContent = prod.productivity == null ? "Data tidak tersedia" : format(prod.productivity);
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

async function load(range) {
  error.hidden = true;
  const params = new URLSearchParams();
  if (range.start) params.set("start", range.start);
  if (range.end) params.set("end", range.end);

  const response = await fetch(`/api/production?${params}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);

  content.hidden = false;
  appliedRange = range;
  const rangeText = `${formatDate(data.range.start)} – ${formatDate(data.range.end)}`;
  rangeLabel.textContent = `${appliedRange.start || appliedRange.end ? "Periode" : "Semua data"}: ${rangeText}`;
  chatScope.textContent = appliedRange.start || appliedRange.end
    ? `Semua tanggal bisa ditanya · dashboard: ${rangeText}`
    : `Semua tanggal bisa ditanya · data ${rangeText}`;

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

document.querySelector("#production-filter").addEventListener("submit", (event) => {
  event.preventDefault();
  load({ start: start.value, end: end.value }).catch(showLoadError);
});
document.querySelector("#reset-production-filter").addEventListener("click", () => {
  start.value = "";
  end.value = "";
  load({ start: "", end: "" }).catch(showLoadError);
});
load(appliedRange).catch(showLoadError);
window.setInterval(() => load(appliedRange).catch(showLoadError), refreshIntervalMs);

const chat = document.querySelector("#production-chat");
const chatMessages = document.querySelector("#production-chat-messages");
const chatForm = document.querySelector("#production-chat-form");
const chatInput = document.querySelector("#production-chat-input");
const CHAT_HISTORY_KEY = "speedlens.production-chat-history";
const chatHistory = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || "[]");
    return Array.isArray(saved)
      ? saved.filter((message) =>
        message && ["user", "assistant"].includes(message.role)
        && typeof message.content === "string").slice(-10)
      : [];
  } catch {
    return [];
  }
})();

function appendChatMessage(role, text) {
  const message = document.createElement("p");
  message.className = `chat-message ${role}`;
  message.textContent = text;
  chatMessages.append(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return message;
}

function renderChatHistory() {
  chatMessages.replaceChildren();
  if (!chatHistory.length) {
    appendChatMessage("assistant", "Tanyakan produksi, target, material, cuaca, fleet, PA, UA, atau UO untuk tanggal atau bulan mana pun, misalnya \"OB 3 Maret 2025\".");
    return;
  }
  chatHistory.forEach(({ role, content }) => appendChatMessage(role, content));
}

function persistChatHistory() {
  const recentMessages = chatHistory.slice(-10);
  chatHistory.splice(0, chatHistory.length - recentMessages.length);
  try {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(recentMessages));
  } catch {
    // Chat continues when browser storage is unavailable or full.
  }
}

renderChatHistory();

document.querySelector("#production-chat-toggle").addEventListener("click", () => {
  chat.hidden = false;
  chatInput.focus();
});
document.querySelector("#production-chat-close").addEventListener("click", () => { chat.hidden = true; });

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = chatInput.value.trim();
  if (!question) return;
  appendChatMessage("user", question);
  chatInput.value = "";
  chatInput.disabled = true;
  const pending = appendChatMessage("assistant", "Sedang menganalisis data dashboard…");
  try {
    const response = await fetch("/api/production/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history: chatHistory.slice(-10), ...appliedRange }),
    });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const message = response.status === 404
        ? "Endpoint chat tidak ditemukan di server ini. Mulai ulang versi aplikasi terbaru."
        : `Server mengirim HTML, bukan JSON (HTTP ${response.status}). Periksa jendela Flask untuk error.`;
      throw new Error(message);
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Chat tidak dapat diproses.");
    pending.textContent = data.answer;
    chatHistory.push({ role: "user", content: question }, { role: "assistant", content: data.answer });
    persistChatHistory();
  } catch (chatError) {
    pending.textContent = chatError.message;
  } finally {
    chatInput.disabled = false;
    chatInput.focus();
  }
});

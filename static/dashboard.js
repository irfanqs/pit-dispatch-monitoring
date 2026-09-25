const reportSelect = document.querySelector("#report-select");
const dashboardContent = document.querySelector("#dashboard-content");
const dashboardEmpty = document.querySelector("#dashboard-empty");
const reportSource = document.querySelector("#report-source");
const reportMeta = document.querySelector("#report-meta");
const downloadReport = document.querySelector("#download-report");
const metricVehicles = document.querySelector("#metric-vehicles");
const metricDetections = document.querySelector("#metric-detections");
const metricAverageSpeed = document.querySelector("#metric-average-speed");
const metricMaxSpeed = document.querySelector("#metric-max-speed");
const measurementCount = document.querySelector("#measurement-count");
const speedTrend = document.querySelector("#speed-trend");
const speedDistribution = document.querySelector("#speed-distribution");
const segmentList = document.querySelector("#segment-list");
const sourceSheetTable = document.querySelector("#source-sheet-table");
const sourceSheetCount = document.querySelector("#source-sheet-count");
const sourceSheetError = document.querySelector("#source-sheet-error");
const sourceSheetPage = document.querySelector("#source-sheet-page");
const sourceSheetPrevious = document.querySelector("#source-sheet-previous");
const sourceSheetNext = document.querySelector("#source-sheet-next");
const sourceSheetDateFilter = document.querySelector("#source-sheet-date-filter");
const sourceSheetStart = document.querySelector("#source-sheet-start");
const sourceSheetEnd = document.querySelector("#source-sheet-end");
const sourceSheetReset = document.querySelector("#source-sheet-reset");
const sourceSheetTotal = document.querySelector("#source-sheet-total");
const sourceSheetRows = document.querySelector("#source-sheet-rows");
const sourceSheetExcavators = document.querySelector("#source-sheet-excavators");
const sourceSheetTrend = document.querySelector("#source-sheet-trend");
const sourceSheetCategories = document.querySelector("#source-sheet-categories");
let activeSourceSheet = "DATA_BCM";
let activeSourceSheetPage = 1;
let activeSourceSheetDates = { start: "", end: "" };

function number(value) {
  return new Intl.NumberFormat("id-ID").format(value);
}

function renderTrend(timeline) {
  speedTrend.replaceChildren();
  if (!timeline.length) {
    speedTrend.textContent = "Belum ada pengukuran kecepatan pada laporan ini.";
    return;
  }
  const width = 720;
  const height = 264;
  const padding = { top: 18, right: 18, bottom: 32, left: 42 };
  const values = timeline.map((item) => item.average_speed);
  const maximum = Math.max(...values, 10);
  const x = (index) => padding.left + index * ((width - padding.left - padding.right) / Math.max(timeline.length - 1, 1));
  const y = (value) => height - padding.bottom - (value / maximum) * (height - padding.top - padding.bottom);
  const points = timeline.map((item, index) => `${x(index)},${y(item.average_speed)}`).join(" ");
  const fillPoints = `${padding.left},${height - padding.bottom} ${points} ${x(timeline.length - 1)},${height - padding.bottom}`;
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  [0, maximum / 2, maximum].forEach((value) => {
    const line = document.createElementNS(namespace, "line");
    line.setAttribute("class", "axis");
    line.setAttribute("x1", String(padding.left));
    line.setAttribute("x2", String(width - padding.right));
    line.setAttribute("y1", String(y(value)));
    line.setAttribute("y2", String(y(value)));
    const label = document.createElementNS(namespace, "text");
    label.setAttribute("x", "0");
    label.setAttribute("y", String(y(value) + 4));
    label.textContent = `${Math.round(value)}`;
    svg.append(line, label);
  });
  const fill = document.createElementNS(namespace, "polygon");
  fill.setAttribute("class", "trend-fill");
  fill.setAttribute("points", fillPoints);
  const line = document.createElementNS(namespace, "polyline");
  line.setAttribute("class", "trend-line");
  line.setAttribute("points", points);
  svg.append(fill, line);
  timeline.forEach((item, index) => {
    if (index !== 0 && index !== timeline.length - 1 && index % Math.ceil(timeline.length / 5) !== 0) return;
    const label = document.createElementNS(namespace, "text");
    label.setAttribute("x", String(x(index)));
    label.setAttribute("y", String(height - 8));
    label.setAttribute("text-anchor", "middle");
    label.textContent = `${item.minute}m`;
    svg.append(label);
  });
  speedTrend.append(svg);
}

function renderDistribution(distribution) {
  speedDistribution.replaceChildren();
  const maximum = Math.max(...distribution.map((item) => item.count), 1);
  distribution.forEach((item) => {
    const column = document.createElement("div");
    column.className = "bar-column";
    const count = document.createElement("span");
    count.textContent = number(item.count);
    const bar = document.createElement("i");
    bar.style.height = `${Math.max(3, item.count / maximum * 136)}px`;
    const label = document.createElement("span");
    label.textContent = item.label;
    column.append(count, bar, label);
    speedDistribution.append(column);
  });
}

function renderSegments(segments) {
  segmentList.replaceChildren();
  if (!segments.length) {
    segmentList.textContent = "Belum ada pengukuran segmen.";
    return;
  }
  const maximum = Math.max(...segments.map((item) => item.count));
  segments.forEach((item) => {
    const row = document.createElement("div");
    row.className = "segment-row";
    const name = document.createElement("span");
    name.textContent = item.name;
    const count = document.createElement("span");
    count.textContent = `${number(item.count)} ukur`;
    const bar = document.createElement("i");
    bar.style.setProperty("--bar-width", `${item.count / maximum * 100}%`);
    row.append(name, count, bar);
    segmentList.append(row);
  });
}

function renderReport(report) {
  dashboardContent.hidden = false;
  dashboardEmpty.hidden = true;
  reportSource.textContent = report.summary["Video sumber"] || report.filename;
  reportMeta.textContent = `${report.summary.Metode || "-"} | ${number(report.metrics.measurements)} pengukuran | ${number(report.metrics.detections)} deteksi`;
  downloadReport.href = `/logs/${encodeURIComponent(report.filename)}`;
  metricVehicles.textContent = number(report.metrics.vehicles);
  metricDetections.textContent = number(report.metrics.detections);
  metricAverageSpeed.textContent = report.metrics.average_speed.toFixed(1);
  metricMaxSpeed.textContent = report.metrics.max_speed.toFixed(1);
  measurementCount.textContent = `${number(report.metrics.measurements)} pengukuran`;
  renderTrend(report.timeline);
  renderDistribution(report.distribution);
  renderSegments(report.segments);
}

async function loadReport(filename) {
  const response = await fetch(`/api/reports/${encodeURIComponent(filename)}`);
  const report = await response.json();
  if (!response.ok) throw new Error(report.error || "Laporan tidak dapat dimuat.");
  renderReport(report);
}

function renderSourceSheet(payload) {
  sourceSheetTable.replaceChildren();
  const header = document.createElement("thead");
  const headerRow = document.createElement("tr");
  payload.columns.forEach((column) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = column;
    headerRow.append(cell);
  });
  header.append(headerRow);

  const body = document.createElement("tbody");
  payload.rows.forEach((row) => {
    const tableRow = document.createElement("tr");
    payload.columns.forEach((_, index) => {
      const cell = document.createElement("td");
      cell.textContent = row[index] || "";
      tableRow.append(cell);
    });
    body.append(tableRow);
  });
  sourceSheetTable.append(header, body);
  sourceSheetCount.textContent = `${number(payload.total_rows)} baris`;
  sourceSheetRows.textContent = number(payload.total_rows);
  sourceSheetTotal.textContent = number(payload.summary.total_sum);
  sourceSheetExcavators.textContent = number(payload.summary.excavators);
  sourceSheetPage.textContent = `Halaman ${payload.page} dari ${payload.total_pages}`;
  sourceSheetPrevious.disabled = payload.page <= 1;
  sourceSheetNext.disabled = payload.page >= payload.total_pages;
  activeSourceSheetPage = payload.page;
  renderSourceSheetTrend(payload.summary.trend);
  renderSourceSheetCategories(payload.summary.categories);
  sourceSheetError.hidden = true;
}

function renderSourceSheetTrend(trend) {
  sourceSheetTrend.replaceChildren();
  const recent = trend.slice(-14);
  if (!recent.length) {
    sourceSheetTrend.textContent = "Tidak ada data pada rentang tanggal ini.";
    return;
  }
  const maximum = Math.max(...recent.map((item) => Math.abs(item.value)), 1);
  recent.forEach((item) => {
    const row = document.createElement("div");
    row.className = "source-trend-row";
    const label = document.createElement("span");
    label.textContent = new Date(`${item.date}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
    const track = document.createElement("div");
    track.className = "source-trend-track";
    const bar = document.createElement("i");
    bar.style.setProperty("--bar-width", `${Math.max(2, Math.abs(item.value) / maximum * 100)}%`);
    track.append(bar);
    const value = document.createElement("strong");
    value.textContent = number(item.value);
    row.append(label, track, value);
    sourceSheetTrend.append(row);
  });
}

function renderSourceSheetCategories(categories) {
  sourceSheetCategories.replaceChildren();
  const visible = categories.slice(0, 6);
  if (!visible.length) {
    sourceSheetCategories.textContent = "Tidak ada nilai kategori pada rentang ini.";
    return;
  }
  const maximum = Math.max(...visible.map((item) => Math.abs(item.value)), 1);
  visible.forEach((item) => {
    const row = document.createElement("div");
    row.className = "source-category-row";
    const label = document.createElement("span");
    label.textContent = item.name;
    const value = document.createElement("strong");
    value.textContent = number(item.value);
    const track = document.createElement("div");
    track.className = "source-trend-track";
    const bar = document.createElement("i");
    bar.style.setProperty("--bar-width", `${Math.max(2, Math.abs(item.value) / maximum * 100)}%`);
    track.append(bar);
    row.append(label, value, track);
    sourceSheetCategories.append(row);
  });
}

async function loadSourceSheet(sheet = activeSourceSheet, page = activeSourceSheetPage, dates = activeSourceSheetDates) {
  activeSourceSheet = sheet;
  activeSourceSheetDates = dates;
  sourceSheetCount.textContent = "Memuat data...";
  sourceSheetError.hidden = true;
  try {
    const params = new URLSearchParams({ sheet, page: String(page) });
    if (dates.start) params.set("start", dates.start);
    if (dates.end) params.set("end", dates.end);
    const response = await fetch(`/api/dashboard/source-sheet?${params}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Data spreadsheet tidak dapat dimuat.");
    renderSourceSheet(payload);
  } catch (error) {
    sourceSheetTable.replaceChildren();
    sourceSheetCount.textContent = "";
    sourceSheetError.textContent = error.message;
    sourceSheetError.hidden = false;
  }
}

document.querySelectorAll(".source-sheet-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".source-sheet-tab").forEach((item) => {
      const selected = item === tab;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-selected", String(selected));
    });
    loadSourceSheet(tab.dataset.sheet, 1);
  });
});
sourceSheetDateFilter.addEventListener("submit", (event) => {
  event.preventDefault();
  loadSourceSheet(activeSourceSheet, 1, { start: sourceSheetStart.value, end: sourceSheetEnd.value });
});
sourceSheetReset.addEventListener("click", () => {
  sourceSheetStart.value = "";
  sourceSheetEnd.value = "";
  loadSourceSheet(activeSourceSheet, 1, { start: "", end: "" });
});
sourceSheetPrevious.addEventListener("click", () => loadSourceSheet(activeSourceSheet, activeSourceSheetPage - 1));
sourceSheetNext.addEventListener("click", () => loadSourceSheet(activeSourceSheet, activeSourceSheetPage + 1));

async function initializeDashboard() {
  loadSourceSheet();
  try {
    const response = await fetch("/api/reports");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Daftar laporan tidak tersedia.");
    if (!payload.reports.length) {
      reportSelect.hidden = true;
      dashboardEmpty.hidden = false;
      return;
    }
    reportSelect.replaceChildren();
    payload.reports.forEach((report) => {
      const option = document.createElement("option");
      option.value = report.filename;
      option.textContent = report.filename;
      reportSelect.append(option);
    });
    reportSelect.disabled = false;
    reportSelect.addEventListener("change", () => loadReport(reportSelect.value).catch((error) => {
      dashboardContent.hidden = true;
      dashboardEmpty.hidden = false;
      dashboardEmpty.querySelector("p").textContent = error.message;
    }));
    await loadReport(reportSelect.value);
  } catch (error) {
    reportSelect.hidden = true;
    dashboardEmpty.hidden = false;
    dashboardEmpty.querySelector("p").textContent = error.message;
  }
}

initializeDashboard();

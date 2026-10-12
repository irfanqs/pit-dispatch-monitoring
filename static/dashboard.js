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
const sourceSheetPeriod = document.querySelector("#source-sheet-period");
const sourceSheetError = document.querySelector("#source-sheet-error");
const sourceSheetDateFilter = document.querySelector("#source-sheet-date-filter");
const sourceSheetStart = document.querySelector("#source-sheet-start");
const sourceSheetEnd = document.querySelector("#source-sheet-end");
const sourceSheetReset = document.querySelector("#source-sheet-reset");
const sourceSheetTotal = document.querySelector("#source-sheet-total");
const sourceSheetRows = document.querySelector("#source-sheet-rows");
const sourceSheetExcavators = document.querySelector("#source-sheet-excavators");
const sourceSheetTrend = document.querySelector("#source-sheet-trend");
const sourceSheetTrendLabel = document.querySelector("#source-sheet-trend-label");
const sourceSheetCategories = document.querySelector("#source-sheet-categories");
const problemTop10 = document.querySelector("#problem-top10");
const excavatorHeatmap = document.querySelector("#excavator-heatmap");
let activeSourceSheet = "DATA_BCM";
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

function formatSheetDate(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function renderSourceSheet(payload) {
  const { trend } = payload.summary;
  sourceSheetPeriod.textContent = trend.length
    ? `${formatSheetDate(trend[0].date)} – ${formatSheetDate(trend[trend.length - 1].date)}`
    : "Tidak ada data";
  sourceSheetRows.textContent = number(payload.total_rows);
  sourceSheetTotal.textContent = number(payload.summary.total_sum);
  sourceSheetExcavators.textContent = number(payload.summary.excavators);
  renderSourceSheetTrend(trend);
  renderSourceSheetCategories(payload.summary.categories);
  renderProblemTop10(payload.problems);
  renderExcavatorHeatmap(payload.problems, payload.excavator_losses);
  sourceSheetError.hidden = true;
}

function renderSourceSheetTrend(trend) {
  sourceSheetTrend.replaceChildren();
  const recent = trend.slice(-14);
  sourceSheetTrendLabel.textContent = `${recent.length} tanggal terakhir`;
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

function renderProblemTop10(problems) {
  problemTop10.replaceChildren();
  if (!problems.length) {
    problemTop10.textContent = "Tidak ada problem pada rentang tanggal ini.";
    return;
  }
  const maximum = Math.max(...problems.map((item) => item.bcm), 1);
  problems.forEach((item) => {
    const column = document.createElement("div");
    column.className = "problem-column";
    column.setAttribute("role", "listitem");
    column.title = `${item.name}: ${number(item.bcm)} BCM, ${number(item.freq)}x`;
    const frequency = document.createElement("span");
    frequency.className = "problem-freq";
    frequency.textContent = `${number(item.freq)}x`;
    const volume = document.createElement("strong");
    volume.textContent = number(Math.round(item.bcm));
    const track = document.createElement("div");
    track.className = "problem-track";
    const bar = document.createElement("i");
    bar.style.setProperty("--bar-height", `${Math.max(2, item.bcm / maximum * 100)}%`);
    // Labels ride on top of each bar, as in the sheet's own Top 10 chart.
    track.append(frequency, volume, bar);
    const label = document.createElement("span");
    label.className = "problem-label";
    label.textContent = item.name;
    column.append(track, label);
    problemTop10.append(column);
  });
}

function renderExcavatorHeatmap(problems, losses) {
  excavatorHeatmap.replaceChildren();
  if (!problems.length || !losses.length) {
    const empty = excavatorHeatmap.insertRow().insertCell();
    empty.className = "heat-empty";
    empty.textContent = "Tidak ada loss pada rentang tanggal ini.";
    return;
  }
  // One shared scale across all problem cells; the Total column stays unshaded because it uses another scale.
  const maximum = Math.max(...losses.flatMap((item) => item.values), 1);
  const headerRow = excavatorHeatmap.createTHead().insertRow();
  ["Excavator", ...problems.map((item) => item.name), "Total"].forEach((text) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = text;
    headerRow.append(cell);
  });
  const body = excavatorHeatmap.createTBody();
  losses.forEach((item) => {
    const row = body.insertRow();
    const name = document.createElement("th");
    name.scope = "row";
    name.textContent = item.name;
    row.append(name);
    item.values.forEach((value, index) => {
      const cell = row.insertCell();
      cell.title = `${item.name} · ${problems[index].name}: ${number(value)} BCM`;
      if (value > 0) {
        cell.style.setProperty("--heat", (6 + value / maximum * 56).toFixed(1));
        cell.textContent = number(Math.round(value));
      } else {
        cell.className = "heat-empty";
        cell.textContent = "–";
      }
    });
    const total = row.insertCell();
    total.className = "heat-total";
    total.title = `${item.name} · semua problem: ${number(item.total)} BCM`;
    total.textContent = number(Math.round(item.total));
  });
}

async function loadSourceSheet(sheet = activeSourceSheet, dates = activeSourceSheetDates) {
  activeSourceSheet = sheet;
  activeSourceSheetDates = dates;
  sourceSheetPeriod.textContent = "Memuat data...";
  sourceSheetError.hidden = true;
  try {
    const params = new URLSearchParams({ sheet });
    if (dates.start) params.set("start", dates.start);
    if (dates.end) params.set("end", dates.end);
    const response = await fetch(`/api/dashboard/source-sheet?${params}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Data spreadsheet tidak dapat dimuat.");
    renderSourceSheet(payload);
  } catch (error) {
    sourceSheetPeriod.textContent = "";
    problemTop10.replaceChildren();
    excavatorHeatmap.replaceChildren();
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
    loadSourceSheet(tab.dataset.sheet);
  });
});
sourceSheetDateFilter.addEventListener("submit", (event) => {
  event.preventDefault();
  loadSourceSheet(activeSourceSheet, { start: sourceSheetStart.value, end: sourceSheetEnd.value });
});
sourceSheetReset.addEventListener("click", () => {
  sourceSheetStart.value = "";
  sourceSheetEnd.value = "";
  loadSourceSheet(activeSourceSheet, { start: "", end: "" });
});

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

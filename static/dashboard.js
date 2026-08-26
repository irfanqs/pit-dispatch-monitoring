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
const vehicleTable = document.querySelector("#vehicle-table");

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

function renderVehicles(vehicles) {
  vehicleTable.replaceChildren();
  if (!vehicles.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "Belum ada tracker yang dikonfirmasi.";
    row.append(cell);
    vehicleTable.append(row);
    return;
  }
  vehicles.forEach((vehicle) => {
    const row = document.createElement("tr");
    [
      `#${vehicle.tracker_id}`,
      number(vehicle.first_frame),
      number(vehicle.last_frame),
      number(vehicle.samples),
      `${vehicle.average_confidence.toFixed(2)}`,
      `${number(vehicle.max_speed)} km/h`,
    ].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    vehicleTable.append(row);
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
  renderVehicles(report.vehicles);
}

async function loadReport(filename) {
  const response = await fetch(`/api/reports/${encodeURIComponent(filename)}`);
  const report = await response.json();
  if (!response.ok) throw new Error(report.error || "Laporan tidak dapat dimuat.");
  renderReport(report);
}

async function initializeDashboard() {
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

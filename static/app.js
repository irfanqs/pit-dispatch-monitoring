const form = document.querySelector("#analysis-form");
const fileInput = document.querySelector("#video");
const fileName = document.querySelector("#file-name");
const calibrationPanel = document.querySelector("#calibration-panel");
const calibrationVideo = document.querySelector("#calibration-video");
const calibrationCanvas = document.querySelector("#calibration-canvas");
const previewStatus = document.querySelector("#preview-status");
const calibrationInstruction = document.querySelector("#calibration-instruction");
const sourcePolygon = document.querySelector("#source_polygon");
const polygonSettings = document.querySelector("#polygon-settings");
const gateSettings = document.querySelector("#gate-settings");
const measurementSettings = document.querySelector("#measurement-settings");
const gateDefinitions = document.querySelector("#gate_definitions");
const gateList = document.querySelector("#gate-list");
const addGateButton = document.querySelector("#add-gate");
const confidence = document.querySelector("#confidence_threshold");
const iou = document.querySelector("#iou_threshold");
const gateConfidence = document.querySelector("#confidence_threshold_gate");
const gateIou = document.querySelector("#iou_threshold_gate");
const modeInputs = document.querySelectorAll('input[name="mode"]');
const detectorInputs = document.querySelectorAll('input[name="detector"]');
const bgSettings = document.querySelector("#bg-settings");
const undoPointButton = document.querySelector("#undo-point");
const resetPointsButton = document.querySelector("#reset-points");
const submitButton = document.querySelector("#submit-button");
const statusPanel = document.querySelector("#status-panel");
const statusLabel = document.querySelector("#status-label");
const statusDetail = document.querySelector("#status-detail");
const progressValue = document.querySelector("#progress-value");
const progressBar = document.querySelector("#progress-bar");
const resultPanel = document.querySelector("#result-panel");
const resultVideo = document.querySelector("#result-video");
const downloadLink = document.querySelector("#download-link");
const downloadLogLink = document.querySelector("#download-log-link");
const errorPanel = document.querySelector("#error-panel");
const errorMessage = document.querySelector("#error-message");
let calibrationPoints = [];
let calibrationUrl;
let gateCount = 2;
let gateDistances = [""];

const pointNames = ["kiri atas", "kanan atas", "kanan bawah", "kiri bawah"];
function selectedMode() {
  return document.querySelector('input[name="mode"]:checked').value;
}

function setModeSettings() {
  const isPolygonMode = selectedMode() === "polygon";
  polygonSettings.hidden = !isPolygonMode;
  gateSettings.hidden = isPolygonMode;
  sourcePolygon.required = isPolygonMode;
  gateDefinitions.required = !isPolygonMode;
}

function selectedDetector() {
  return document.querySelector('input[name="detector"]:checked').value;
}

function setDetectorSettings() {
  const isYolo = selectedDetector() === "yolo";
  document.querySelectorAll(".yolo-only").forEach((element) => {
    element.hidden = !isYolo;
  });
  bgSettings.hidden = isYolo;
}

function gateName(index) {
  return `Gate ${String.fromCharCode(65 + index)}`;
}

function renderGateList() {
  gateList.replaceChildren();
  for (let index = 0; index < gateCount; index += 1) {
    const gate = document.createElement("div");
    const pointStart = calibrationPoints[index * 2];
    const pointEnd = calibrationPoints[index * 2 + 1];
    const lineValue = [pointStart, pointEnd].filter(Boolean).map((point) => `${point.x},${point.y}`).join(";");
    gate.className = "gate-item";

    const label = document.createElement("label");
    label.textContent = gateName(index);
    const lineInput = document.createElement("input");
    lineInput.value = lineValue;
    lineInput.readOnly = true;
    label.append(lineInput);
    gate.append(label);

    const helper = document.createElement("small");
    helper.textContent = index === 0
      ? "Klik dua titik untuk garis pertama."
      : `Masukkan jarak dari ${gateName(index - 1)} ke ${gateName(index)} dalam meter.`;
    gate.append(helper);

    if (index > 0) {
      const distanceLabel = document.createElement("label");
      distanceLabel.textContent = `Jarak ${gateName(index - 1)} ke ${gateName(index)}`;
      const distanceInput = document.createElement("input");
      distanceInput.type = "number";
      distanceInput.min = "0.1";
      distanceInput.step = "0.1";
      distanceInput.placeholder = "Contoh: 50";
      distanceInput.value = gateDistances[index - 1] ?? "";
      distanceInput.addEventListener("input", () => {
        gateDistances[index - 1] = distanceInput.value;
        syncCalibrationInput();
      });
      distanceLabel.append(distanceInput);
      gate.append(distanceLabel);
    }
    gateList.append(gate);
  }
}

function resetGateConfiguration() {
  gateCount = 2;
  gateDistances = [""];
  renderGateList();
}

function updateCalibrationControls() {
  const pointCount = calibrationPoints.length;
  const requiredPointCount = selectedMode() === "polygon" ? 4 : gateCount * 2;
  undoPointButton.disabled = pointCount === 0;
  resetPointsButton.disabled = pointCount === 0;
  if (pointCount === requiredPointCount) {
    calibrationInstruction.textContent = selectedMode() === "polygon"
      ? "Empat sudut area jalan tersimpan. Gunakan Ulangi titik jika area perlu diperbaiki."
      : "Semua gate tersimpan. Masukkan jarak nyata untuk setiap pasangan gate yang berurutan.";
    return;
  }
  if (selectedMode() === "polygon") {
    calibrationInstruction.textContent = `Klik titik ${pointCount + 1}: ${pointNames[pointCount]}.`;
    return;
  }
  const gateIndex = Math.floor(pointCount / 2);
  const endpoint = pointCount % 2 === 0 ? "ujung pertama" : "ujung kedua";
  calibrationInstruction.textContent = `Klik ${endpoint} ${gateName(gateIndex)}.`;
}

function drawCalibration() {
  const context = calibrationCanvas.getContext("2d");
  context.clearRect(0, 0, calibrationCanvas.width, calibrationCanvas.height);
  if (!calibrationPoints.length) return;

  context.lineWidth = Math.max(3, calibrationCanvas.width / 600);
  context.strokeStyle = "#22b8a4";
  context.fillStyle = "#ecfffb";
  context.font = `${Math.max(18, calibrationCanvas.width / 45)}px system-ui`;
  if (selectedMode() === "polygon") {
    context.beginPath();
    calibrationPoints.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    if (calibrationPoints.length === 4) context.closePath();
    context.stroke();
  } else {
    Array.from({ length: gateCount }, (_, index) => index).forEach((index) => {
      const start = calibrationPoints[index * 2];
      const end = calibrationPoints[index * 2 + 1];
      if (!start) return;
      context.beginPath();
      context.moveTo(start.x, start.y);
      if (end) context.lineTo(end.x, end.y);
      context.stroke();
    });
  }
  calibrationPoints.forEach((point, index) => {
    context.beginPath();
    context.arc(point.x, point.y, Math.max(8, calibrationCanvas.width / 100), 0, Math.PI * 2);
    context.fillStyle = "#006f62";
    context.fill();
    context.fillStyle = "#ecfffb";
    context.fillText(String(index + 1), point.x + 12, point.y - 12);
  });
}

function syncCalibrationInput() {
  if (selectedMode() === "polygon") {
    sourcePolygon.value = calibrationPoints.map((point) => `${point.x},${point.y}`).join(";");
    return;
  }
  if (calibrationPoints.length !== gateCount * 2 || gateDistances.some((distance) => Number(distance) <= 0)) {
    gateDefinitions.value = "";
    return;
  }
  const gates = Array.from(
    { length: gateCount },
    (_, index) => calibrationPoints
      .slice(index * 2, index * 2 + 2)
      .map((point) => [point.x, point.y]),
  );
  gateDefinitions.value = JSON.stringify({ gates, distances: gateDistances.map(Number) });
}

function resetCalibration() {
  calibrationPoints = [];
  syncCalibrationInput();
  if (selectedMode() === "gate") renderGateList();
  drawCalibration();
  updateCalibrationControls();
}

function resizeCalibrationCanvas() {
  calibrationCanvas.width = calibrationVideo.videoWidth;
  calibrationCanvas.height = calibrationVideo.videoHeight;
  drawCalibration();
}

function setPreviewStatus(message, state = "loading") {
  previewStatus.textContent = message;
  previewStatus.dataset.state = state;
}

fileInput.addEventListener("click", () => {
  fileInput.value = "";
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  fileName.textContent = file?.name ?? "Belum ada file dipilih";
  if (!file) return;
  calibrationVideo.pause();
  calibrationVideo.removeAttribute("src");
  calibrationVideo.load();
  if (calibrationUrl) URL.revokeObjectURL(calibrationUrl);
  calibrationUrl = URL.createObjectURL(file);
  calibrationVideo.src = calibrationUrl;
  calibrationVideo.load();
  setPreviewStatus("Memuat preview video.");
  calibrationPanel.hidden = false;
  measurementSettings.hidden = false;
  setModeSettings();
  setDetectorSettings();
  resetGateConfiguration();
  resetCalibration();
});

calibrationVideo.addEventListener("loadedmetadata", () => {
  resizeCalibrationCanvas();
  setPreviewStatus("Preview siap. Jeda video pada frame yang paling jelas, lalu pilih titik kalibrasi.", "ready");
  updateCalibrationControls();
});

calibrationVideo.addEventListener("error", () => {
  setPreviewStatus(
    "Preview tidak dapat diputar oleh browser. Gunakan MP4 H.264 atau konversi video terlebih dahulu.",
    "error",
  );
});

modeInputs.forEach((input) => {
  input.addEventListener("change", () => {
    setModeSettings();
    if (selectedMode() === "gate") resetGateConfiguration();
    resetCalibration();
  });
});

detectorInputs.forEach((input) => {
  input.addEventListener("change", setDetectorSettings);
});

gateConfidence.addEventListener("input", () => { confidence.value = gateConfidence.value; });
gateIou.addEventListener("input", () => { iou.value = gateIou.value; });

calibrationCanvas.addEventListener("pointerdown", (event) => {
  const requiredPointCount = selectedMode() === "polygon" ? 4 : gateCount * 2;
  if (calibrationPoints.length === requiredPointCount || !calibrationVideo.videoWidth) return;
  const bounds = calibrationCanvas.getBoundingClientRect();
  const point = {
    x: Math.round((event.clientX - bounds.left) * calibrationCanvas.width / bounds.width),
    y: Math.round((event.clientY - bounds.top) * calibrationCanvas.height / bounds.height),
  };
  calibrationPoints.push(point);
  syncCalibrationInput();
  if (selectedMode() === "gate") renderGateList();
  drawCalibration();
  updateCalibrationControls();
});

undoPointButton.addEventListener("click", () => {
  calibrationPoints.pop();
  syncCalibrationInput();
  if (selectedMode() === "gate") renderGateList();
  drawCalibration();
  updateCalibrationControls();
});

resetPointsButton.addEventListener("click", resetCalibration);

addGateButton.addEventListener("click", () => {
  gateCount += 1;
  gateDistances.push("");
  syncCalibrationInput();
  renderGateList();
  drawCalibration();
  updateCalibrationControls();
});

window.addEventListener("beforeunload", () => {
  if (calibrationUrl) URL.revokeObjectURL(calibrationUrl);
});

function showError(message) {
  errorMessage.textContent = message;
  errorPanel.hidden = false;
  statusPanel.hidden = true;
  submitButton.disabled = false;
  submitButton.textContent = "Mulai analisis";
}

async function pollJob(jobId) {
  const response = await fetch(`/api/jobs/${jobId}`);
  const job = await response.json();
  if (!response.ok) throw new Error(job.error || "Status analisis tidak tersedia.");

  progressValue.textContent = `${job.progress}%`;
  progressBar.style.width = `${job.progress}%`;
  if (job.status === "processing") {
    window.setTimeout(() => pollJob(jobId).catch((error) => showError(error.message)), 1000);
    return;
  }
  if (job.status === "error") {
    showError(job.error || "Terjadi kesalahan saat memproses video.");
    return;
  }
  statusLabel.textContent = "Analisis selesai";
  statusDetail.textContent = "Video hasil siap diputar atau diunduh.";
  resultVideo.src = job.result_url;
  downloadLink.href = job.result_url;
  downloadLogLink.href = job.log_url;
  resultPanel.hidden = false;
  submitButton.disabled = false;
  submitButton.textContent = "Analisis video lain";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorPanel.hidden = true;
  resultPanel.hidden = true;
  statusPanel.hidden = false;
  statusLabel.textContent = "Mengunggah dan menyiapkan analisis";
  statusDetail.textContent = selectedDetector() === "bg"
    ? "Video sedang diproses dengan background subtraction."
    : "Video sedang diproses dengan yolo11n.pt.";
  progressValue.textContent = "0%";
  progressBar.style.width = "0%";
  submitButton.disabled = true;
  submitButton.textContent = "Memproses";

  try {
    const response = await fetch("/api/jobs", { method: "POST", body: new FormData(form) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Video tidak dapat dikirim.");
    statusLabel.textContent = "Menganalisis kendaraan";
    pollJob(payload.job_id).catch((error) => showError(error.message));
  } catch (error) {
    showError(error.message);
  }
});

const form = document.querySelector("#analysis-form");
const fileInput = document.querySelector("#video");
const fileName = document.querySelector("#file-name");
const calibrationPanel = document.querySelector("#calibration-panel");
const calibrationVideo = document.querySelector("#calibration-video");
const calibrationCanvas = document.querySelector("#calibration-canvas");
const calibrationInstruction = document.querySelector("#calibration-instruction");
const sourcePolygon = document.querySelector("#source_polygon");
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
const errorPanel = document.querySelector("#error-panel");
const errorMessage = document.querySelector("#error-message");
let calibrationPoints = [];
let calibrationUrl;

const pointNames = ["kiri atas", "kanan atas", "kanan bawah", "kiri bawah"];

function updateCalibrationControls() {
  const pointCount = calibrationPoints.length;
  undoPointButton.disabled = pointCount === 0;
  resetPointsButton.disabled = pointCount === 0;
  if (pointCount === 4) {
    calibrationInstruction.textContent = "Empat titik tersimpan. Gunakan Ulangi titik jika area jalan perlu diperbaiki.";
    return;
  }
  calibrationInstruction.textContent = `Klik titik ${pointCount + 1}: ${pointNames[pointCount]}.`;
}

function drawCalibration() {
  const context = calibrationCanvas.getContext("2d");
  context.clearRect(0, 0, calibrationCanvas.width, calibrationCanvas.height);
  if (!calibrationPoints.length) return;

  context.lineWidth = Math.max(3, calibrationCanvas.width / 600);
  context.strokeStyle = "#22b8a4";
  context.fillStyle = "#ecfffb";
  context.font = `${Math.max(18, calibrationCanvas.width / 45)}px system-ui`;
  context.beginPath();
  calibrationPoints.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  if (calibrationPoints.length === 4) context.closePath();
  context.stroke();
  calibrationPoints.forEach((point, index) => {
    context.beginPath();
    context.arc(point.x, point.y, Math.max(8, calibrationCanvas.width / 100), 0, Math.PI * 2);
    context.fillStyle = "#006f62";
    context.fill();
    context.fillStyle = "#ecfffb";
    context.fillText(String(index + 1), point.x + 12, point.y - 12);
  });
}

function syncPolygonInput() {
  sourcePolygon.value = calibrationPoints.map((point) => `${point.x},${point.y}`).join(";");
}

function resetCalibration() {
  calibrationPoints = [];
  syncPolygonInput();
  drawCalibration();
  updateCalibrationControls();
}

function resizeCalibrationCanvas() {
  calibrationCanvas.width = calibrationVideo.videoWidth;
  calibrationCanvas.height = calibrationVideo.videoHeight;
  drawCalibration();
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  fileName.textContent = file?.name ?? "Belum ada file dipilih";
  if (!file) return;
  if (calibrationUrl) URL.revokeObjectURL(calibrationUrl);
  calibrationUrl = URL.createObjectURL(file);
  calibrationVideo.src = calibrationUrl;
  calibrationPanel.hidden = false;
  resetCalibration();
});

calibrationVideo.addEventListener("loadedmetadata", () => {
  resizeCalibrationCanvas();
  updateCalibrationControls();
});

calibrationCanvas.addEventListener("pointerdown", (event) => {
  if (calibrationPoints.length === 4 || !calibrationVideo.videoWidth) return;
  const bounds = calibrationCanvas.getBoundingClientRect();
  const point = {
    x: Math.round((event.clientX - bounds.left) * calibrationCanvas.width / bounds.width),
    y: Math.round((event.clientY - bounds.top) * calibrationCanvas.height / bounds.height),
  };
  calibrationPoints.push(point);
  syncPolygonInput();
  drawCalibration();
  updateCalibrationControls();
});

undoPointButton.addEventListener("click", () => {
  calibrationPoints.pop();
  syncPolygonInput();
  drawCalibration();
  updateCalibrationControls();
});

resetPointsButton.addEventListener("click", resetCalibration);

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
  statusDetail.textContent = "Video sedang diproses dengan yolo11n.pt.";
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

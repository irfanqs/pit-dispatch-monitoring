"""Serve a local browser interface for vehicle speed estimation."""

from __future__ import annotations

import json
import os
import threading
import uuid
from collections import defaultdict, deque
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request, send_from_directory
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "data" / "uploads"
RESULT_DIR = BASE_DIR / "data" / "results"
LOG_DIR = BASE_DIR / "data" / "logs"
ALLOWED_EXTENSIONS = {"mp4", "mov", "avi", "mkv", "m4v"}
DEFAULT_SOURCE = "1252,787;2298,803;5039,2159;-550,2159"

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024 * 1024
jobs: dict[str, dict[str, Any]] = {}
jobs_lock = threading.Lock()
Point = tuple[float, float]


def allowed_video(filename: str) -> bool:
    """Return whether a filename has a supported video extension."""
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def parse_polygon(value: str) -> list[list[float]]:
    """Parse four x,y coordinate pairs entered in the calibration field."""
    points = []
    for pair in value.split(";"):
        x_value, y_value = pair.strip().split(",")
        points.append([float(x_value), float(y_value)])
    if len(points) != 4:
        raise ValueError("Area jalan harus berisi tepat empat titik koordinat.")
    return points


def parse_gate_definitions(value: str) -> tuple[list[tuple[Point, Point]], list[float]]:
    """Parse ordered gate lines and distances between adjacent gates from JSON."""
    payload = json.loads(value)
    raw_gates = payload["gates"]
    raw_distances = payload["distances"]
    if len(raw_gates) < 2 or len(raw_distances) != len(raw_gates) - 1:
        raise ValueError("Setidaknya dua gate dan jarak antar-gate diperlukan.")
    gates: list[tuple[Point, Point]] = []
    for raw_gate in raw_gates:
        if len(raw_gate) != 2 or any(len(point) != 2 for point in raw_gate):
            raise ValueError("Setiap gate harus memiliki tepat dua titik.")
        start = (float(raw_gate[0][0]), float(raw_gate[0][1]))
        end = (float(raw_gate[1][0]), float(raw_gate[1][1]))
        gates.append((start, end))
    distances = [float(distance) for distance in raw_distances]
    if any(distance <= 0 for distance in distances):
        raise ValueError("Semua jarak antar-gate harus lebih besar dari nol.")
    return gates, distances


def cross_product(first: Point, second: Point, third: Point) -> float:
    """Return the signed turn formed by three two-dimensional points."""
    return (
        (second[0] - first[0]) * (third[1] - first[1])
        - (second[1] - first[1]) * (third[0] - first[0])
    )


def point_on_segment(point: Point, start: Point, end: Point) -> bool:
    """Return whether a collinear point falls within a finite line segment."""
    return (
        min(start[0], end[0]) <= point[0] <= max(start[0], end[0])
        and min(start[1], end[1]) <= point[1] <= max(start[1], end[1])
    )


def segments_intersect(first_start: Point, first_end: Point, second_start: Point, second_end: Point) -> bool:
    """Return whether a tracked movement segment crosses a finite gate segment."""
    first_start_turn = cross_product(first_start, first_end, second_start)
    first_end_turn = cross_product(first_start, first_end, second_end)
    second_start_turn = cross_product(second_start, second_end, first_start)
    second_end_turn = cross_product(second_start, second_end, first_end)
    crosses = (first_start_turn > 0) != (first_end_turn > 0) and (second_start_turn > 0) != (second_end_turn > 0)
    if crosses:
        return True
    return (
        first_start_turn == 0 and point_on_segment(second_start, first_start, first_end)
    ) or (
        first_end_turn == 0 and point_on_segment(second_end, first_start, first_end)
    ) or (
        second_start_turn == 0 and point_on_segment(first_start, second_start, second_end)
    ) or (
        second_end_turn == 0 and point_on_segment(first_end, second_start, second_end)
    )


def update_job(job_id: str, **values: Any) -> None:
    """Atomically merge updated processing state into a job record."""
    with jobs_lock:
        jobs[job_id].update(values)


def mux_h264_frame(output_container: Any, output_stream: Any, frame: Any) -> None:
    """Encode one BGR frame into a browser-compatible H.264 video stream."""
    import av

    video_frame = av.VideoFrame.from_ndarray(frame, format="bgr24")
    for packet in output_stream.encode(video_frame):
        output_container.mux(packet)


def finish_h264_encoding(output_container: Any, output_stream: Any) -> None:
    """Flush delayed H.264 frames and close the output container safely."""
    for packet in output_stream.encode():
        output_container.mux(packet)
    output_container.close()


def format_log_sheet(worksheet: Any) -> None:
    """Apply consistent header, width, and frozen-row formatting to a log sheet."""
    from openpyxl.styles import Font, PatternFill

    header_fill = PatternFill("solid", fgColor="006F62")
    for cell in worksheet[1]:
        cell.fill = header_fill
        cell.font = Font(color="FFFFFF", bold=True)
    worksheet.freeze_panes = "A2"
    worksheet.auto_filter.ref = worksheet.dimensions
    for column_cells in worksheet.columns:
        column_letter = column_cells[0].column_letter
        longest_value = max(len(str(cell.value or "")) for cell in column_cells)
        worksheet.column_dimensions[column_letter].width = min(max(longest_value + 2, 12), 28)


def write_detection_workbook(
    target_path: Path,
    source_video_name: str,
    mode: str,
    video_fps: float,
    video_frame_count: int,
    detection_logs: list[dict[str, Any]],
    speed_logs: list[dict[str, Any]],
) -> None:
    """Write detection and speed measurements to a formatted Excel workbook."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    workbook = Workbook()
    summary = workbook.active
    summary.title = "Ringkasan"
    summary.append(["Ringkasan Analisis Kecepatan", ""])
    summary.merge_cells("A1:B1")
    summary["A1"].font = Font(color="FFFFFF", bold=True, size=14)
    summary["A1"].fill = PatternFill("solid", fgColor="006F62")
    summary.append(["Video sumber", source_video_name])
    summary.append(["Metode", mode.title()])
    summary.append(["FPS", video_fps])
    summary.append(["Frame diproses", video_frame_count])
    summary.append(["Jumlah deteksi", len(detection_logs)])
    summary.append(["Pengukuran kecepatan", len(speed_logs)])
    summary.column_dimensions["A"].width = 28
    summary.column_dimensions["B"].width = 32

    detections_sheet = workbook.create_sheet("Deteksi")
    detections_sheet.append(
        [
            "Frame",
            "Waktu video (detik)",
            "Tracker ID",
            "Kelas ID",
            "Confidence",
            "X1",
            "Y1",
            "X2",
            "Y2",
            "Mode",
            "Kecepatan terakhir (km/h)",
        ]
    )
    for entry in detection_logs:
        detections_sheet.append(
            [
                entry["frame"],
                entry["time_seconds"],
                entry["tracker_id"],
                entry["class_id"],
                entry["confidence"],
                entry["x1"],
                entry["y1"],
                entry["x2"],
                entry["y2"],
                entry["mode"],
                entry["speed_kmh"],
            ]
        )
    format_log_sheet(detections_sheet)
    for column in ("B", "E"):
        for cell in detections_sheet[column][1:]:
            cell.number_format = "0.00"

    speed_sheet = workbook.create_sheet("Kecepatan")
    speed_sheet.append(
        [
            "Frame",
            "Waktu video (detik)",
            "Tracker ID",
            "Segmen",
            "Jarak (meter)",
            "Waktu tempuh (detik)",
            "Kecepatan (km/h)",
        ]
    )
    for entry in speed_logs:
        speed_sheet.append(
            [
                entry["frame"],
                entry["time_seconds"],
                entry["tracker_id"],
                entry["segment"],
                entry["distance_meters"],
                entry["elapsed_seconds"],
                entry["speed_kmh"],
            ]
        )
    format_log_sheet(speed_sheet)
    for column in ("B", "E", "F", "G"):
        for cell in speed_sheet[column][1:]:
            cell.number_format = "0.00"
    workbook.save(target_path)


def record_detections(
    detection_logs: list[dict[str, Any]],
    detections: Any,
    frame_index: int,
    video_fps: float,
    mode: str,
    speeds: dict[int, int],
) -> None:
    """Append the current tracked detections and their latest speeds to the log."""
    for index, tracker_id in enumerate(detections.tracker_id):
        tracker_key = int(tracker_id)
        x1, y1, x2, y2 = detections.xyxy[index]
        detection_logs.append(
            {
                "frame": frame_index,
                "time_seconds": frame_index / video_fps,
                "tracker_id": tracker_key,
                "class_id": int(detections.class_id[index]),
                "confidence": float(detections.confidence[index]),
                "x1": round(float(x1), 2),
                "y1": round(float(y1), 2),
                "x2": round(float(x2), 2),
                "y2": round(float(y2), 2),
                "mode": mode,
                "speed_kmh": speeds.get(tracker_key),
            }
        )


def run_estimation(
    job_id: str,
    source_path: Path,
    target_path: Path,
    source_video_name: str,
    mode: str,
    source_polygon: list[list[float]] | None,
    target_width: float | None,
    target_height: float | None,
    gates: list[tuple[Point, Point]] | None,
    gate_distances: list[float] | None,
    confidence_threshold: float,
    iou_threshold: float,
) -> None:
    """Run detection, tracking, and speed annotation for one uploaded video."""
    try:
        import cv2
        import numpy as np
        import supervision as sv
        import av
        from ultralytics import YOLO

        video_info = sv.VideoInfo.from_video_path(video_path=str(source_path))
        if mode == "polygon":
            if source_polygon is None or target_width is None or target_height is None:
                raise ValueError("Kalibrasi poligon belum lengkap.")
            source = np.array(source_polygon, dtype=np.float32)
            target = np.array(
                [
                    [0, 0],
                    [target_width - 1, 0],
                    [target_width - 1, target_height - 1],
                    [0, target_height - 1],
                ],
                dtype=np.float32,
            )
            matrix = cv2.getPerspectiveTransform(source, target)
            polygon_zone = sv.PolygonZone(polygon=source)
        elif mode == "gate":
            if gates is None or gate_distances is None:
                raise ValueError("Kalibrasi gate belum lengkap.")
            matrix = None
            polygon_zone = None
        else:
            raise ValueError("Metode pengukuran tidak dikenali.")
        model = YOLO("yolo11x.pt")
        tracker = sv.ByteTrack(
            frame_rate=video_info.fps,
            track_activation_threshold=confidence_threshold,
        )
        thickness = sv.calculate_optimal_line_thickness(video_info.resolution_wh)
        text_scale = sv.calculate_optimal_text_scale(video_info.resolution_wh)
        trace_annotator = sv.TraceAnnotator(
            thickness=thickness,
            trace_length=int(video_info.fps * 2),
            position=sv.Position.BOTTOM_CENTER,
        )
        box_annotator = sv.BoxAnnotator(thickness=thickness)
        label_annotator = sv.LabelAnnotator(
            text_scale=text_scale,
            text_thickness=thickness,
            text_position=sv.Position.BOTTOM_CENTER,
        )
        coordinates: defaultdict[int, deque[int]] = defaultdict(
            lambda: deque(maxlen=max(1, int(video_info.fps)))
        )
        previous_positions: dict[int, Point] = {}
        gate_entry_states: dict[int, tuple[int, int]] = {}
        completed_speeds: dict[int, int] = {}
        logged_speeds: dict[int, int] = {}
        detection_logs: list[dict[str, Any]] = []
        speed_logs: list[dict[str, Any]] = []
        frame_count = max(video_info.total_frames, 1)

        output_container = av.open(str(target_path), mode="w", options={"movflags": "+faststart"})
        output_stream = output_container.add_stream("libx264", rate=round(video_info.fps))
        output_stream.width, output_stream.height = video_info.resolution_wh
        output_stream.pix_fmt = "yuv420p"
        output_stream.options = {"crf": "23", "preset": "veryfast"}
        try:
            for frame_index, frame in enumerate(
                sv.get_video_frames_generator(source_path=str(source_path)), start=1
            ):
                result = model(frame, conf=confidence_threshold, iou=iou_threshold, verbose=False)[0]
                detections = sv.Detections.from_ultralytics(result)
                if polygon_zone is not None:
                    detections = detections[polygon_zone.trigger(detections)]
                detections = tracker.update_with_detections(detections=detections)
                points = detections.get_anchors_coordinates(sv.Position.BOTTOM_CENTER)

                labels = []
                if mode == "polygon":
                    transformed_points = cv2.perspectiveTransform(
                        points.reshape(-1, 1, 2).astype(np.float32), matrix
                    ).reshape(-1, 2).astype(int) if points.size else points
                    for tracker_id, point in zip(detections.tracker_id, transformed_points, strict=True):
                        coordinates[int(tracker_id)].append(int(point[1]))
                        history = coordinates[int(tracker_id)]
                        if len(history) < video_info.fps / 2:
                            labels.append(f"#{tracker_id}")
                            continue
                        distance = abs(history[-1] - history[0])
                        elapsed_time = len(history) / video_info.fps
                        speed = int(distance / elapsed_time * 3.6)
                        completed_speeds[int(tracker_id)] = speed
                        if logged_speeds.get(int(tracker_id)) != speed:
                            speed_logs.append(
                                {
                                    "frame": frame_index,
                                    "time_seconds": frame_index / video_info.fps,
                                    "tracker_id": int(tracker_id),
                                    "segment": "Area poligon",
                                    "distance_meters": distance,
                                    "elapsed_seconds": elapsed_time,
                                    "speed_kmh": speed,
                                }
                            )
                            logged_speeds[int(tracker_id)] = speed
                        labels.append(f"#{tracker_id} {speed} km/h")
                else:
                    for tracker_id, point in zip(detections.tracker_id, points, strict=True):
                        tracker_key = int(tracker_id)
                        current_position = (float(point[0]), float(point[1]))
                        previous_position = previous_positions.get(tracker_key)
                        if previous_position is not None:
                            crossed_gate_indices = [
                                index
                                for index, gate in enumerate(gates)
                                if segments_intersect(
                                    previous_position, current_position, gate[0], gate[1]
                                )
                            ]
                            crossed_gate_index = crossed_gate_indices[0] if crossed_gate_indices else None
                            entry_state = gate_entry_states.get(tracker_key)
                            if entry_state is None and crossed_gate_index is not None:
                                gate_entry_states[tracker_key] = (crossed_gate_index, frame_index)
                            elif crossed_gate_index is not None and entry_state is not None:
                                previous_gate_index = entry_state[0]
                                if abs(previous_gate_index - crossed_gate_index) != 1:
                                    gate_entry_states[tracker_key] = (crossed_gate_index, frame_index)
                                else:
                                    elapsed_time = (frame_index - entry_state[1]) / video_info.fps
                                    if elapsed_time > 0:
                                        distance_index = min(previous_gate_index, crossed_gate_index)
                                        completed_speeds[tracker_key] = int(
                                            gate_distances[distance_index] / elapsed_time * 3.6
                                        )
                                        speed_logs.append(
                                            {
                                                "frame": frame_index,
                                                "time_seconds": frame_index / video_info.fps,
                                                "tracker_id": tracker_key,
                                                "segment": f"Gate {chr(65 + previous_gate_index)} - Gate {chr(65 + crossed_gate_index)}",
                                                "distance_meters": gate_distances[distance_index],
                                                "elapsed_seconds": elapsed_time,
                                                "speed_kmh": completed_speeds[tracker_key],
                                            }
                                        )
                                    gate_entry_states[tracker_key] = (crossed_gate_index, frame_index)
                        previous_positions[tracker_key] = current_position
                        speed = completed_speeds.get(tracker_key)
                        labels.append(f"#{tracker_id}" if speed is None else f"#{tracker_id} {speed} km/h")

                annotated_frame = trace_annotator.annotate(frame.copy(), detections)
                annotated_frame = box_annotator.annotate(annotated_frame, detections)
                annotated_frame = label_annotator.annotate(annotated_frame, detections, labels)
                if mode == "gate":
                    for index, gate in enumerate(gates):
                        gate_start = tuple(map(int, gate[0]))
                        gate_end = tuple(map(int, gate[1]))
                        cv2.line(annotated_frame, gate_start, gate_end, (80, 190, 80), thickness)
                        cv2.putText(
                            annotated_frame,
                            chr(65 + index),
                            gate_start,
                            cv2.FONT_HERSHEY_SIMPLEX,
                            text_scale,
                            (80, 190, 80),
                            thickness,
                        )
                record_detections(
                    detection_logs,
                    detections,
                    frame_index,
                    video_info.fps,
                    mode,
                    completed_speeds,
                )
                mux_h264_frame(output_container, output_stream, annotated_frame)
                update_job(job_id, progress=round(frame_index / frame_count * 100))
        finally:
            finish_h264_encoding(output_container, output_stream)

        log_path = LOG_DIR / f"{job_id}-detection-log.xlsx"
        write_detection_workbook(
            log_path,
            source_video_name,
            mode,
            video_info.fps,
            video_info.total_frames,
            detection_logs,
            speed_logs,
        )

        update_job(
            job_id,
            status="complete",
            progress=100,
            result_url=f"/results/{target_path.name}",
            log_url=f"/logs/{log_path.name}",
        )
    except Exception as error:
        update_job(job_id, status="error", error=str(error))


@app.get("/")
def index() -> str:
    """Render the video analysis workspace."""
    return render_template("index.html", default_source=DEFAULT_SOURCE)


@app.post("/api/jobs")
def create_job() -> tuple[Any, int] | Any:
    """Save an uploaded video and start its estimation job in a background thread."""
    video = request.files.get("video")
    if video is None or not video.filename:
        return jsonify(error="Pilih file video terlebih dahulu."), 400
    if not allowed_video(video.filename):
        return jsonify(error="Format video tidak didukung."), 400
    try:
        mode = request.form.get("mode", "polygon")
        confidence_threshold = float(request.form["confidence_threshold"])
        iou_threshold = float(request.form["iou_threshold"])
        if not 0 < confidence_threshold <= 1 or not 0 < iou_threshold <= 1:
            raise ValueError("Nilai konfigurasi harus berada dalam rentang yang valid.")
        source_polygon = None
        target_width = None
        target_height = None
        gates = None
        gate_distances = None
        if mode == "polygon":
            source_polygon = parse_polygon(request.form["source_polygon"])
            target_width = float(request.form["target_width"])
            target_height = float(request.form["target_height"])
            if min(target_width, target_height) <= 0:
                raise ValueError("Ukuran target harus lebih besar dari nol.")
        elif mode == "gate":
            gates, gate_distances = parse_gate_definitions(request.form["gate_definitions"])
        else:
            raise ValueError("Metode pengukuran tidak dikenali.")
    except (KeyError, TypeError, ValueError) as error:
        return jsonify(error=f"Konfigurasi tidak valid: {error}"), 400

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    RESULT_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    job_id = uuid.uuid4().hex
    filename = secure_filename(video.filename)
    source_path = UPLOAD_DIR / f"{job_id}-{filename}"
    target_path = RESULT_DIR / f"{job_id}-estimated.mp4"
    video.save(source_path)
    with jobs_lock:
        jobs[job_id] = {"status": "processing", "progress": 0, "error": None}
    thread = threading.Thread(
        target=run_estimation,
        kwargs={
            "job_id": job_id,
            "source_path": source_path,
            "target_path": target_path,
            "source_video_name": filename,
            "mode": mode,
            "source_polygon": source_polygon,
            "target_width": target_width,
            "target_height": target_height,
            "gates": gates,
            "gate_distances": gate_distances,
            "confidence_threshold": confidence_threshold,
            "iou_threshold": iou_threshold,
        },
        daemon=True,
    )
    thread.start()
    return jsonify(job_id=job_id), 202


@app.get("/api/jobs/<job_id>")
def get_job(job_id: str) -> tuple[Any, int] | Any:
    """Return the current state of a video processing job."""
    with jobs_lock:
        job = jobs.get(job_id)
    if job is None:
        return jsonify(error="Pekerjaan tidak ditemukan."), 404
    return jsonify(job)


@app.get("/results/<path:filename>")
def result_file(filename: str) -> Any:
    """Serve a completed analysis video from the local results directory."""
    return send_from_directory(RESULT_DIR, filename)


@app.get("/logs/<path:filename>")
def log_file(filename: str) -> Any:
    """Serve an Excel detection log from the local logs directory."""
    return send_from_directory(LOG_DIR, filename)


@app.errorhandler(413)
def file_too_large(_: Any) -> tuple[Any, int]:
    """Return a helpful response when an upload exceeds the size limit."""
    return jsonify(error="Ukuran video melebihi batas 2 GB."), 413


if __name__ == "__main__":
    app.run(debug=True, port=int(os.environ.get("PORT", "5000")))

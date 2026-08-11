"""Serve a local browser interface for vehicle speed estimation."""

from __future__ import annotations

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


def parse_gate(value: str) -> tuple[Point, Point]:
    """Parse two x,y coordinate pairs that define a virtual gate line."""
    points = parse_polygon(f"{value};0,0;0,0")[:2]
    return (points[0][0], points[0][1]), (points[1][0], points[1][1])


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


def run_estimation(
    job_id: str,
    source_path: Path,
    target_path: Path,
    mode: str,
    source_polygon: list[list[float]] | None,
    target_width: float | None,
    target_height: float | None,
    gate_a: tuple[Point, Point] | None,
    gate_b: tuple[Point, Point] | None,
    gate_distance: float | None,
    confidence_threshold: float,
    iou_threshold: float,
) -> None:
    """Run detection, tracking, and speed annotation for one uploaded video."""
    try:
        import cv2
        import numpy as np
        import supervision as sv
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
            if gate_a is None or gate_b is None or gate_distance is None:
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
        gate_entry_frames: dict[int, int] = {}
        completed_speeds: dict[int, int] = {}
        frame_count = max(video_info.total_frames, 1)

        with sv.VideoSink(str(target_path), video_info) as sink:
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
                        labels.append(f"#{tracker_id} {int(distance / elapsed_time * 3.6)} km/h")
                else:
                    for tracker_id, point in zip(detections.tracker_id, points, strict=True):
                        tracker_key = int(tracker_id)
                        current_position = (float(point[0]), float(point[1]))
                        previous_position = previous_positions.get(tracker_key)
                        if previous_position is not None:
                            if tracker_key not in gate_entry_frames and segments_intersect(previous_position, current_position, gate_a[0], gate_a[1]):
                                gate_entry_frames[tracker_key] = frame_index
                            elif tracker_key in gate_entry_frames and tracker_key not in completed_speeds and segments_intersect(previous_position, current_position, gate_b[0], gate_b[1]):
                                elapsed_time = (frame_index - gate_entry_frames[tracker_key]) / video_info.fps
                                if elapsed_time > 0:
                                    completed_speeds[tracker_key] = int(gate_distance / elapsed_time * 3.6)
                        previous_positions[tracker_key] = current_position
                        speed = completed_speeds.get(tracker_key)
                        labels.append(f"#{tracker_id}" if speed is None else f"#{tracker_id} {speed} km/h")

                annotated_frame = trace_annotator.annotate(frame.copy(), detections)
                annotated_frame = box_annotator.annotate(annotated_frame, detections)
                annotated_frame = label_annotator.annotate(annotated_frame, detections, labels)
                if mode == "gate":
                    gate_a_start = tuple(map(int, gate_a[0]))
                    gate_a_end = tuple(map(int, gate_a[1]))
                    gate_b_start = tuple(map(int, gate_b[0]))
                    gate_b_end = tuple(map(int, gate_b[1]))
                    cv2.line(annotated_frame, gate_a_start, gate_a_end, (80, 190, 80), thickness)
                    cv2.line(annotated_frame, gate_b_start, gate_b_end, (80, 190, 80), thickness)
                sink.write_frame(annotated_frame)
                update_job(job_id, progress=round(frame_index / frame_count * 100))

        update_job(
            job_id,
            status="complete",
            progress=100,
            result_url=f"/results/{target_path.name}",
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
        gate_a = None
        gate_b = None
        gate_distance = None
        if mode == "polygon":
            source_polygon = parse_polygon(request.form["source_polygon"])
            target_width = float(request.form["target_width"])
            target_height = float(request.form["target_height"])
            if min(target_width, target_height) <= 0:
                raise ValueError("Ukuran target harus lebih besar dari nol.")
        elif mode == "gate":
            gate_a = parse_gate(request.form["gate_a"])
            gate_b = parse_gate(request.form["gate_b"])
            gate_distance = float(request.form["gate_distance"])
            if gate_distance <= 0:
                raise ValueError("Jarak antar gate harus lebih besar dari nol.")
        else:
            raise ValueError("Metode pengukuran tidak dikenali.")
    except (KeyError, TypeError, ValueError) as error:
        return jsonify(error=f"Konfigurasi tidak valid: {error}"), 400

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    RESULT_DIR.mkdir(parents=True, exist_ok=True)
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
            "mode": mode,
            "source_polygon": source_polygon,
            "target_width": target_width,
            "target_height": target_height,
            "gate_a": gate_a,
            "gate_b": gate_b,
            "gate_distance": gate_distance,
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


@app.errorhandler(413)
def file_too_large(_: Any) -> tuple[Any, int]:
    """Return a helpful response when an upload exceeds the size limit."""
    return jsonify(error="Ukuran video melebihi batas 2 GB."), 413


if __name__ == "__main__":
    app.run(debug=True, port=int(os.environ.get("PORT", "5000")))

"""
Classical background-subtraction detector for the speed estimation app.

Based on the "detect_hauler_v2plus" approach: MOG2 background subtraction,
ROI masking (sky + near-camera ground), morphological cleanup, and contour
filtering (area, aspect ratio, solidity, merging). It emits
``supervision.Detections`` so it can feed ByteTrack and the existing speed
measurement logic without a deep learning model.
"""

from __future__ import annotations

import cv2
import numpy as np
import supervision as sv


class BgSubDetector:
    """Detect moving blobs in a static-camera video stream via background subtraction."""

    def __init__(
        self,
        *,
        history: int = 500,
        var_threshold: float = 50,
        warmup_frames: int = 300,
        sky_fraction: float = 0.15,
        bottom_fraction: float = 0.85,
        min_area: float = 300,
        max_area: float = 8000,
        min_aspect: float = 0.5,
        max_aspect: float = 3.5,
        min_solidity: float = 0.40,
        merge_dist: float = 60,
        class_id: int = 0,
    ) -> None:
        self.warmup_frames = int(warmup_frames)
        self.sky_fraction = float(sky_fraction)
        self.bottom_fraction = float(bottom_fraction)
        self.min_area = float(min_area)
        self.max_area = float(max_area)
        self.min_aspect = float(min_aspect)
        self.max_aspect = float(max_aspect)
        self.min_solidity = float(min_solidity)
        self.merge_dist = float(merge_dist)
        self.class_id = int(class_id)

        self.bg_sub = cv2.createBackgroundSubtractorMOG2(
            history=int(history),
            varThreshold=float(var_threshold),
            detectShadows=False,
        )
        self.kernel_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        self.kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        self.kernel_dilate = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        self._road_mask: np.ndarray | None = None
        self._processed = 0

    @property
    def is_ready(self) -> bool:
        """Return whether enough frames built the background model."""
        return self._processed >= self.warmup_frames

    def _ensure_road_mask(self, frame: np.ndarray) -> None:
        h, w = frame.shape[:2]
        sky_line = int(self.sky_fraction * h)
        bottom_line = int(self.bottom_fraction * h)
        mask = np.zeros((h, w), dtype=np.uint8)
        mask[sky_line:bottom_line, :] = 255
        self._road_mask = mask

    def process(self, frame: np.ndarray) -> sv.Detections | None:
        """Update the background model and return detections once warmup is done.

        Returns ``None`` while the background model is still warming up.
        """
        fg_mask = self.bg_sub.apply(frame)
        self._processed += 1
        if not self.is_ready:
            return None

        if self._road_mask is None:
            self._ensure_road_mask(frame)

        fg_mask = cv2.bitwise_and(fg_mask, self._road_mask)
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, self.kernel_open)
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, self.kernel_close)
        fg_mask = cv2.dilate(fg_mask, self.kernel_dilate, iterations=1)
        _, fg_mask = cv2.threshold(fg_mask, 200, 255, cv2.THRESH_BINARY)

        contours, _ = cv2.findContours(
            fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        raw_boxes = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if not (self.min_area <= area <= self.max_area):
                continue
            bx, by, bw, bh = cv2.boundingRect(contour)
            aspect = bw / max(bh, 1)
            if not (self.min_aspect <= aspect <= self.max_aspect):
                continue
            hull = cv2.convexHull(contour)
            hull_area = cv2.contourArea(hull)
            solidity = area / hull_area if hull_area > 0 else 0
            if solidity < self.min_solidity:
                continue
            raw_boxes.append((bx, by, bw, bh))

        final_boxes = []
        for bx, by, bw, bh in self._merge_boxes(raw_boxes):
            area = bw * bh
            aspect = bw / max(bh, 1)
            if self.min_area <= area <= self.max_area and (
                self.min_aspect <= aspect <= self.max_aspect
            ):
                final_boxes.append((bx, by, bw, bh))

        if not final_boxes:
            return sv.Detections.empty()

        xyxy = np.asarray(
            [[x, y, x + w, y + h] for x, y, w, h in final_boxes],
            dtype=np.float32,
        )
        confidence = np.ones(len(final_boxes), dtype=np.float32)
        class_ids = np.full(len(final_boxes), self.class_id, dtype=int)
        return sv.Detections(xyxy=xyxy, confidence=confidence, class_id=class_ids)

    def _merge_boxes(
        self, boxes: list[tuple[float, float, float, float]]
    ) -> list[tuple[float, float, float, float]]:
        """Merge bounding boxes whose centroids lie within ``merge_dist`` pixels."""
        if not boxes:
            return []
        merged = True
        result = list(boxes)
        while merged:
            merged = False
            new_result = []
            used = [False] * len(result)
            for i in range(len(result)):
                if used[i]:
                    continue
                x1, y1, w1, h1 = result[i]
                cx1, cy1 = x1 + w1 / 2, y1 + h1 / 2
                group = [result[i]]
                used[i] = True
                for j in range(i + 1, len(result)):
                    if used[j]:
                        continue
                    x2, y2, w2, h2 = result[j]
                    cx2, cy2 = x2 + w2 / 2, y2 + h2 / 2
                    if abs(cx1 - cx2) < self.merge_dist and abs(cy1 - cy2) < self.merge_dist:
                        group.append(result[j])
                        used[j] = True
                        merged = True
                gx = min(b[0] for b in group)
                gy = min(b[1] for b in group)
                gx2 = max(b[0] + b[2] for b in group)
                gy2 = max(b[1] + b[3] for b in group)
                new_result.append((gx, gy, gx2 - gx, gy2 - gy))
            result = new_result
        return result

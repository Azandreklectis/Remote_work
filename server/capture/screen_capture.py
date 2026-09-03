"""
Low-latency screen capture for the Game Stream server.

The capture component uses MSS to grab frames directly from the
desktop and converts them into NumPy arrays suitable for the
video encoding pipeline.
"""

import threading
import time
from queue import Empty, Full, Queue

import cv2
import mss
import numpy as np

from server.config import CONFIG
from server.utils.logger import logger


class ScreenCapture:
    """Continuously capture the primary display at the configured FPS."""

    def __init__(self) -> None:
        self.width = CONFIG.video.width
        self.height = CONFIG.video.height
        self.fps = CONFIG.video.fps
        self.queue_size = CONFIG.video.queue_size

        self._frames: Queue[np.ndarray] = Queue(maxsize=self.queue_size)
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._capture: mss.mss | None = None

    def start(self) -> None:
        """Start the background screen-capture thread."""

        if self._thread is not None and self._thread.is_alive():
            return

        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._capture_loop,
            name="screen-capture",
            daemon=True,
        )
        self._thread.start()

        logger.info(
            "Screen capture started: %dx%d @ %d FPS",
            self.width,
            self.height,
            self.fps,
        )

    def stop(self) -> None:
        """Stop the background screen-capture thread."""

        self._stop_event.set()

        if self._thread is not None:
            self._thread.join(timeout=2.0)

        self._thread = None

        if self._capture is not None:
            self._capture.close()
            self._capture = None

        logger.info("Screen capture stopped")

    def read(self, timeout: float = 1.0) -> np.ndarray | None:
        """
        Return the newest available frame.

        Older frames are discarded when multiple frames are waiting.
        This keeps the stream focused on current frames instead of
        allowing latency to build up in the queue.
        """

        try:
            frame = self._frames.get(timeout=timeout)
        except Empty:
            return None

        while True:
            try:
                frame = self._frames.get_nowait()
            except Empty:
                break

        return frame

    def _capture_loop(self) -> None:
        """Capture frames continuously until the stop event is set."""

        frame_interval = 1.0 / self.fps
        next_frame_time = time.perf_counter()

        try:
            self._capture = mss.mss()

            monitor = self._capture.monitors[1]

            monitor_width = monitor["width"]
            monitor_height = monitor["height"]

            if monitor_width != self.width or monitor_height != self.height:
                logger.info(
                    "Display resolution is %dx%d; resizing capture to %dx%d",
                    monitor_width,
                    monitor_height,
                    self.width,
                    self.height,
                )

            while not self._stop_event.is_set():
                frame_start = time.perf_counter()

                screenshot = self._capture.grab(monitor)

                frame = np.asarray(screenshot, dtype=np.uint8)

                # MSS returns BGRA. OpenCV/encoder pipeline expects BGR.
                frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)

                if frame.shape[1] != self.width or frame.shape[0] != self.height:
                    frame = cv2.resize(
                        frame,
                        (self.width, self.height),
                        interpolation=cv2.INTER_LINEAR,
                    )

                self._put_latest_frame(frame)

                next_frame_time += frame_interval

                sleep_time = next_frame_time - time.perf_counter()

                if sleep_time > 0:
                    time.sleep(sleep_time)
                elif time.perf_counter() - next_frame_time > frame_interval:
                    # If capture falls behind significantly, reset the
                    # timing point instead of building up scheduling drift.
                    next_frame_time = time.perf_counter()

                capture_time = time.perf_counter() - frame_start

                if capture_time > frame_interval:
                    logger.warning(
                        "Screen capture is slower than target FPS: %.2f ms",
                        capture_time * 1000,
                    )

        except Exception:
            logger.exception("Screen capture loop failed")

        finally:
            if self._capture is not None:
                self._capture.close()
                self._capture = None

    def _put_latest_frame(self, frame: np.ndarray) -> None:
        """
        Put a frame into the queue while keeping only the newest data.

        Dropping an old frame is preferable to allowing the queue to
        grow because stale frames directly increase streaming latency.
        """

        try:
            self._frames.put_nowait(frame)
            return
        except Full:
            pass

        try:
            self._frames.get_nowait()
        except Empty:
            pass

        try:
            self._frames.put_nowait(frame)
        except Full:
            # Another operation may have filled the queue between the
            # previous removal and this insertion.
            pass

    def __enter__(self) -> "ScreenCapture":
        """Start capture when entering a context manager."""

        self.start()
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        """Stop capture when leaving a context manager."""

        self.stop()
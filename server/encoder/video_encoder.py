"""
Video encoding component for the Game Stream server.

The encoder converts captured BGR frames into H.264 video frames
using FFmpeg. The encoder is configured for low-latency streaming
and is designed to be consumed by the WebRTC pipeline.
"""

import subprocess
import threading
from typing import Iterator

import numpy as np

from server.config import CONFIG
from server.utils.logger import logger


class VideoEncoder:
    """Encode raw BGR frames into H.264 using FFmpeg."""

    def __init__(self) -> None:
        self.width = CONFIG.video.width
        self.height = CONFIG.video.height
        self.fps = CONFIG.video.fps
        self.bitrate = CONFIG.video.bitrate
        self.codec = CONFIG.video.codec

        self._process: subprocess.Popen[bytes] | None = None
        self._lock = threading.Lock()

    def start(self) -> None:
        """Start the FFmpeg H.264 encoder process."""

        with self._lock:
            if self._process is not None and self._process.poll() is None:
                return

            command = [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "rawvideo",
                "-pix_fmt",
                "bgr24",
                "-video_size",
                f"{self.width}x{self.height}",
                "-framerate",
                str(self.fps),
                "-i",
                "pipe:0",
                "-an",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-tune",
                "zerolatency",
                "-profile:v",
                "main",
                "-pix_fmt",
                "yuv420p",
                "-b:v",
                str(self.bitrate),
                "-maxrate",
                str(self.bitrate),
                "-bufsize",
                str(self.bitrate // 2),
                "-g",
                str(self.fps),
                "-keyint_min",
                str(self.fps),
                "-sc_threshold",
                "0",
                "-f",
                "h264",
                "pipe:1",
            ]

            try:
                self._process = subprocess.Popen(
                    command,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    bufsize=0,
                )

                logger.info(
                    "H.264 encoder started: %dx%d @ %d FPS, %d bps",
                    self.width,
                    self.height,
                    self.fps,
                    self.bitrate,
                )

            except FileNotFoundError as exc:
                self._process = None
                raise RuntimeError(
                    "FFmpeg was not found. Make sure FFmpeg is installed "
                    "and available in the system PATH."
                ) from exc

            except OSError as exc:
                self._process = None
                raise RuntimeError(
                    f"Failed to start FFmpeg encoder: {exc}"
                ) from exc

    def encode(self, frame: np.ndarray) -> None:
        """
        Send one BGR frame to FFmpeg.

        The encoded H.264 output is available through iter_encoded().
        """

        if self._process is None or self._process.poll() is not None:
            self.start()

        if self._process is None or self._process.stdin is None:
            raise RuntimeError("FFmpeg encoder input is unavailable.")

        if frame.dtype != np.uint8:
            raise ValueError("Frame must use uint8 pixel data.")

        if frame.ndim != 3 or frame.shape[2] != 3:
            raise ValueError("Frame must have shape (height, width, 3).")

        if frame.shape[1] != self.width or frame.shape[0] != self.height:
            raise ValueError(
                f"Frame size must be {self.width}x{self.height}, "
                f"received {frame.shape[1]}x{frame.shape[0]}."
            )

        if not frame.flags["C_CONTIGUOUS"]:
            frame = np.ascontiguousarray(frame)

        try:
            self._process.stdin.write(frame.tobytes())
            self._process.stdin.flush()

        except (BrokenPipeError, OSError) as exc:
            self.stop()
            raise RuntimeError(
                "FFmpeg encoder stopped unexpectedly while receiving a frame."
            ) from exc

    def iter_encoded(self, chunk_size: int = 4096) -> Iterator[bytes]:
        """
        Yield encoded H.264 byte chunks produced by FFmpeg.

        The caller can feed these chunks into the media streaming layer.
        """

        if self._process is None or self._process.stdout is None:
            raise RuntimeError("FFmpeg encoder output is unavailable.")

        while self._process.poll() is None:
            data = self._process.stdout.read(chunk_size)

            if not data:
                break

            yield data

    def encode_frame(self, frame: np.ndarray) -> bytes:
        """
        Encode one frame and return currently available H.264 output.

        This method is intended for simple testing and diagnostics.
        The continuous streaming pipeline should use encode() together
        with iter_encoded().
        """

        if self._process is None or self._process.poll() is not None:
            self.start()

        self.encode(frame)

        if self._process is None or self._process.stdout is None:
            raise RuntimeError("FFmpeg encoder output is unavailable.")

        output = bytearray()

        while True:
            data = self._process.stdout.read1(65536)

            if not data:
                break

            output.extend(data)

            if len(data) < 65536:
                break

        return bytes(output)

    def stop(self) -> None:
        """Stop FFmpeg and release encoder resources."""

        with self._lock:
            process = self._process
            self._process = None

            if process is None:
                return

            try:
                if process.stdin is not None:
                    process.stdin.close()
            except OSError:
                pass

            try:
                process.wait(timeout=2.0)
            except subprocess.TimeoutExpired:
                process.kill()

                try:
                    process.wait(timeout=1.0)
                except subprocess.TimeoutExpired:
                    pass

            logger.info("H.264 encoder stopped")

    def __enter__(self) -> "VideoEncoder":
        """Start the encoder when entering a context manager."""

        self.start()
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        """Stop the encoder when leaving a context manager."""

        self.stop()
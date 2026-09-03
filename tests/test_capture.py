"""
Tests for the screen-capture component.

These tests verify the capture pipeline without requiring a real
continuous capture session wherever possible.
"""

import numpy as np

from server.capture.screen_capture import ScreenCapture
from server.config import CONFIG


def test_screen_capture_initial_state() -> None:
    """Verify that ScreenCapture initializes with configured values."""

    capture = ScreenCapture()

    assert capture.width == CONFIG.video.width
    assert capture.height == CONFIG.video.height
    assert capture.fps == CONFIG.video.fps
    assert capture.queue_size == CONFIG.video.queue_size


def test_screen_capture_queue_starts_empty() -> None:
    """Verify that no frame is available before capture starts."""

    capture = ScreenCapture()

    assert capture.read(timeout=0.01) is None


def test_screen_capture_accepts_frame() -> None:
    """Verify that a valid frame can be placed into the capture queue."""

    capture = ScreenCapture()

    frame = np.zeros(
        (
            CONFIG.video.height,
            CONFIG.video.width,
            3,
        ),
        dtype=np.uint8,
    )

    capture._put_latest_frame(frame)

    received = capture.read(timeout=0.1)

    assert received is not None
    assert received.shape == frame.shape
    assert received.dtype == np.uint8
    assert np.array_equal(received, frame)


def test_screen_capture_keeps_newest_frame() -> None:
    """
    Verify that the capture queue prefers recent frames.

    The queue is intentionally small because stale frames would
    increase streaming latency.
    """

    capture = ScreenCapture()

    frame_one = np.zeros(
        (
            CONFIG.video.height,
            CONFIG.video.width,
            3,
        ),
        dtype=np.uint8,
    )

    frame_two = np.full(
        (
            CONFIG.video.height,
            CONFIG.video.width,
            3,
        ),
        255,
        dtype=np.uint8,
    )

    capture._put_latest_frame(frame_one)
    capture._put_latest_frame(frame_two)

    received = capture.read(timeout=0.1)

    assert received is not None
    assert np.array_equal(received, frame_two)


def test_screen_capture_context_manager() -> None:
    """
    Verify that the capture object supports context-manager usage.

    The test replaces the real start/stop methods so it does not
    require access to a physical display.
    """

    capture = ScreenCapture()

    state = {
        "started": False,
        "stopped": False,
    }

    def fake_start() -> None:
        state["started"] = True

    def fake_stop() -> None:
        state["stopped"] = True

    capture.start = fake_start
    capture.stop = fake_stop

    with capture as active_capture:
        assert active_capture is capture
        assert state["started"] is True

    assert state["stopped"] is True
"""
Tests for the video encoder component.

These tests verify encoder configuration, frame validation,
and basic H.264 encoding behavior through FFmpeg.
"""

import numpy as np
import pytest

from server.config import CONFIG
from server.encoder.video_encoder import VideoEncoder


def create_test_frame() -> np.ndarray:
    """Create a valid black BGR frame using the configured resolution."""

    return np.zeros(
        (
            CONFIG.video.height,
            CONFIG.video.width,
            3,
        ),
        dtype=np.uint8,
    )


def test_video_encoder_initial_state() -> None:
    """Verify that the encoder loads the expected configuration."""

    encoder = VideoEncoder()

    assert encoder.width == CONFIG.video.width
    assert encoder.height == CONFIG.video.height
    assert encoder.fps == CONFIG.video.fps
    assert encoder.bitrate == CONFIG.video.bitrate
    assert encoder.codec == CONFIG.video.codec

    assert encoder._process is None


def test_video_encoder_rejects_wrong_dtype() -> None:
    """Verify that non-uint8 frames are rejected."""

    encoder = VideoEncoder()

    frame = np.zeros(
        (
            CONFIG.video.height,
            CONFIG.video.width,
            3,
        ),
        dtype=np.float32,
    )

    with pytest.raises(ValueError, match="uint8"):
        encoder.encode(frame)


def test_video_encoder_rejects_wrong_dimensions() -> None:
    """Verify that frames with the wrong resolution are rejected."""

    encoder = VideoEncoder()

    frame = np.zeros(
        (
            CONFIG.video.height // 2,
            CONFIG.video.width // 2,
            3,
        ),
        dtype=np.uint8,
    )

    with pytest.raises(
        ValueError,
        match="Frame size must be",
    ):
        encoder.encode(frame)


def test_video_encoder_rejects_wrong_channel_count() -> None:
    """Verify that grayscale or incorrectly shaped frames are rejected."""

    encoder = VideoEncoder()

    frame = np.zeros(
        (
            CONFIG.video.height,
            CONFIG.video.width,
        ),
        dtype=np.uint8,
    )

    with pytest.raises(
        ValueError,
        match="shape",
    ):
        encoder.encode(frame)


def test_video_encoder_rejects_four_channel_frame() -> None:
    """Verify that BGRA frames are rejected by the encoder interface."""

    encoder = VideoEncoder()

    frame = np.zeros(
        (
            CONFIG.video.height,
            CONFIG.video.width,
            4,
        ),
        dtype=np.uint8,
    )

    with pytest.raises(
        ValueError,
        match="shape",
    ):
        encoder.encode(frame)


def test_video_encoder_start_and_stop() -> None:
    """
    Verify that FFmpeg can be started and stopped successfully.

    This test requires FFmpeg to be installed and available through
    the system PATH.
    """

    encoder = VideoEncoder()

    try:
        encoder.start()

        assert encoder._process is not None
        assert encoder._process.poll() is None

    finally:
        encoder.stop()

    assert encoder._process is None


def test_video_encoder_produces_h264_output() -> None:
    """
    Verify that a valid frame can be passed through FFmpeg and that
    encoded H.264 data is produced.

    This is an integration test and requires FFmpeg.
    """

    encoder = VideoEncoder()

    try:
        encoder.start()

        frame = create_test_frame()

        encoder.encode(frame)

        assert encoder._process is not None
        assert encoder._process.stdout is not None

        output = bytearray()

        while True:
            data = encoder._process.stdout.read(65536)

            if not data:
                break

            output.extend(data)

            if len(data) < 65536:
                break

        assert len(output) > 0

        # H.264 Annex-B streams contain NAL units beginning with
        # a 3-byte or 4-byte start code.
        encoded = bytes(output)

        has_start_code = (
            b"\x00\x00\x01" in encoded
            or b"\x00\x00\x00\x01" in encoded
        )

        assert has_start_code

    finally:
        encoder.stop()
"""
Central configuration for the Game Stream server.

All runtime settings used by the server are defined here so that
the rest of the application does not contain hard-coded values.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class VideoConfig:
    """Video capture and streaming configuration."""

    width: int = 1920
    height: int = 1080
    fps: int = 60

    # Initial MVP codec.
    codec: str = "H264"

    # Target bitrate for the initial 1080p60 stream.
    bitrate: int = 12_000_000

    # Number of frames allowed to accumulate in the capture pipeline.
    # Keeping this small is important for low latency.
    queue_size: int = 2


@dataclass(frozen=True)
class ServerConfig:
    """Network configuration for the local streaming server."""

    host: str = "0.0.0.0"
    port: int = 8080

    # Maximum size accepted for an HTTP request body.
    max_request_size: int = 1_048_576


@dataclass(frozen=True)
class WebRTCConfig:
    """WebRTC configuration."""

    # Keep the MVP local-network focused.
    # STUN/TURN servers will be added when internet connectivity
    # is implemented.
    stun_server: str | None = "stun:stun.l.google.com:19302"
    turn_server: str | None = None

    # Keep the media path as low-latency as possible.
    audio_enabled: bool = False


@dataclass(frozen=True)
class InputConfig:
    """Remote input configuration."""

    enabled: bool = True

    # Initial control polling/update rate.
    polling_rate: int = 120


@dataclass(frozen=True)
class AppConfig:
    """Complete application configuration."""

    video: VideoConfig
    server: ServerConfig
    webrtc: WebRTCConfig
    input: InputConfig


# Single immutable application configuration used by the server.
CONFIG = AppConfig(
    video=VideoConfig(),
    server=ServerConfig(),
    webrtc=WebRTCConfig(),
    input=InputConfig(),
)
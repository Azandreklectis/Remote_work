"""
WebRTC server for the Game Stream application.

This module connects the screen-capture pipeline to WebRTC and
receives remote input through a WebRTC DataChannel.

The server is intentionally LAN-first for the MVP. STUN/TURN
configuration can be added later when internet connectivity is
implemented.
"""

from __future__ import annotations

import asyncio
import json
from fractions import Fraction
from threading import Lock
from typing import Any

from aiortc import RTCConfiguration, RTCIceServer
from server.config import CONFIG

import av
import numpy as np
from aiohttp import web
from aiortc import (
    RTCPeerConnection,
    RTCSessionDescription,
    RTCDataChannel,
    VideoStreamTrack,
)
from aiortc.mediastreams import MediaStreamError

from server.capture.screen_capture import ScreenCapture
from server.input.input_handler import InputEvent, InputHandler
from server.utils.logger import logger


class ScreenVideoTrack(VideoStreamTrack):
    """
    WebRTC video track backed by the desktop screen capture.

    Frames are pulled from ScreenCapture only when WebRTC requests
    the next frame, preventing unnecessary buffering.
    """

    kind = "video"

    def __init__(self, capture: ScreenCapture) -> None:
        super().__init__()

        self.capture = capture
        self._timestamp = 0
        self._time_base = Fraction(1, 90000)
        self._frame_duration = 90000 // capture.fps

    async def recv(self) -> av.VideoFrame:
        """Return the next captured desktop frame."""

        frame = await asyncio.to_thread(self.capture.read, 1.0)

        if frame is None:
            raise MediaStreamError

        video_frame = av.VideoFrame.from_ndarray(
            frame,
            format="bgr24",
        )

        self._timestamp += self._frame_duration

        video_frame.pts = self._timestamp
        video_frame.time_base = self._time_base

        return video_frame


class WebRTCServer:
    """Manage WebRTC peer connections and remote input."""

    def __init__(
        self,
        capture: ScreenCapture,
        input_handler: InputHandler,
    ) -> None:
        self.capture = capture
        self.input_handler = input_handler

        self._peer_connections: set[RTCPeerConnection] = set()
        self._peer_lock = Lock()

        self._closed = False

    def register_routes(self, app: web.Application) -> None:
        """Register WebRTC routes with the aiohttp application."""

        app.router.add_post("/webrtc/offer", self.handle_offer)

        logger.info("WebRTC offer endpoint registered at /webrtc/offer")

    async def handle_offer(self, request: web.Request) -> web.Response:
        """
        Receive an SDP offer and return the SDP answer.

        The browser sends an offer containing its requested media
        capabilities and data-channel configuration. aiortc performs
        the server-side negotiation and returns the answer.
        """

        if self._closed:
            return web.json_response(
                {"error": "WebRTC server is shutting down."},
                status=503,
            )

        if request.content_type != "application/json":
            return web.json_response(
                {"error": "Request must use application/json."},
                status=415,
            )

        try:
            params = await request.json()
        except Exception:
            return web.json_response(
                {"error": "Invalid JSON request body."},
                status=400,
            )

        if not isinstance(params, dict):
            return web.json_response(
                {"error": "Request body must be a JSON object."},
                status=400,
            )

        offer_type = params.get("type")
        offer_sdp = params.get("sdp")

        if offer_type != "offer":
            return web.json_response(
                {"error": "Expected a WebRTC offer."},
                status=400,
            )

        if not isinstance(offer_sdp, str) or not offer_sdp.strip():
            return web.json_response(
                {"error": "WebRTC offer SDP is missing."},
                status=400,
            )

        ice_servers = []

        if CONFIG.webrtc.stun_server:
            ice_servers.append(
                RTCIceServer(
                    urls=CONFIG.webrtc.stun_server,
                )
            )

        peer_connection = RTCPeerConnection(
            configuration=RTCConfiguration(
                iceServers=ice_servers,
            )
        )

        with self._peer_lock:
            self._peer_connections.add(peer_connection)

        logger.info(
            "New WebRTC peer connection created. Active connections: %d",
            len(self._peer_connections),
        )

        self._configure_peer_connection(peer_connection)

        try:
            offer = RTCSessionDescription(
                sdp=offer_sdp,
                type=offer_type,
            )

            await peer_connection.setRemoteDescription(offer)

            video_track = ScreenVideoTrack(self.capture)
            peer_connection.addTrack(video_track)

            answer = await peer_connection.createAnswer()

            await peer_connection.setLocalDescription(answer)

            local_description = peer_connection.localDescription

            if local_description is None:
                raise RuntimeError(
                    "WebRTC local description was not created."
                )

            return web.json_response(
                {
                    "sdp": local_description.sdp,
                    "type": local_description.type,
                }
            )

        except Exception:
            logger.exception("Failed to establish WebRTC connection")

            await self._close_peer_connection(peer_connection)

            return web.json_response(
                {"error": "Failed to establish WebRTC connection."},
                status=500,
            )

    def _configure_peer_connection(
        self,
        peer_connection: RTCPeerConnection,
    ) -> None:
        """Attach event handlers to a WebRTC peer connection."""

        @peer_connection.on("connectionstatechange")
        async def on_connection_state_change() -> None:
            state = peer_connection.connectionState

            logger.info(
                "WebRTC connection state changed: %s",
                state,
            )

            if state in {"failed", "closed"}:
                await self._close_peer_connection(peer_connection)

        @peer_connection.on("iceconnectionstatechange")
        async def on_ice_connection_state_change() -> None:
            logger.info(
                "WebRTC ICE connection state: %s",
                peer_connection.iceConnectionState,
            )

        @peer_connection.on("datachannel")
        def on_datachannel(channel: RTCDataChannel) -> None:
            logger.info(
                "WebRTC DataChannel opened: %s",
                channel.label,
            )

            self._configure_data_channel(channel)

    def _configure_data_channel(
        self,
        channel: RTCDataChannel,
    ) -> None:
        """Configure a WebRTC DataChannel for remote input."""

        @channel.on("open")
        def on_open() -> None:
            logger.info(
                "Input DataChannel ready: %s",
                channel.label,
            )

        @channel.on("close")
        def on_close() -> None:
            logger.info(
                "Input DataChannel closed: %s",
                channel.label,
            )

            self.input_handler.release_all()

        @channel.on("error")
        def on_error(error: Any) -> None:
            logger.error(
                "WebRTC DataChannel error: %s",
                error,
            )

            self.input_handler.release_all()

        @channel.on("message")
        def on_message(message: Any) -> None:
            self._handle_data_channel_message(message)

    def _handle_data_channel_message(self, message: Any) -> None:
        """
        Parse one DataChannel message and send it to InputHandler.

        The expected format is JSON representing an InputEvent.
        """

        try:
            if isinstance(message, bytes):
                message = message.decode("utf-8")

            if not isinstance(message, str):
                logger.warning(
                    "Ignoring unsupported DataChannel message type: %s",
                    type(message).__name__,
                )
                return

            data = json.loads(message)

            if not isinstance(data, dict):
                logger.warning(
                    "Ignoring DataChannel message that is not an object"
                )
                return

            event = self._parse_input_event(data)

            if event is None:
                return

            self.input_handler.handle_event(event)

        except json.JSONDecodeError:
            logger.warning("Ignoring invalid JSON input message")

        except UnicodeDecodeError:
            logger.warning("Ignoring invalid UTF-8 input message")

        except Exception:
            logger.exception(
                "Unexpected error while processing DataChannel input"
            )

    @staticmethod
    def _parse_input_event(
        data: dict[str, Any],
    ) -> InputEvent | None:
        """Validate and convert JSON input data into an InputEvent."""

        event_type = data.get("event_type")
        action = data.get("action")

        if not isinstance(event_type, str):
            logger.warning("Input event is missing event_type")
            return None

        if not isinstance(action, str):
            logger.warning("Input event is missing action")
            return None

        event_type = event_type.strip().lower()
        action = action.strip().lower()

        if event_type not in {"keyboard", "mouse"}:
            logger.warning(
                "Unsupported input event type: %s",
                event_type,
            )
            return None

        key = data.get("key")
        button = data.get("button")

        x = data.get("x")
        y = data.get("y")

        if key is not None and not isinstance(key, str):
            logger.warning("Invalid keyboard key value")
            return None

        if button is not None and not isinstance(button, str):
            logger.warning("Invalid mouse button value")
            return None

        if x is not None:
            try:
                x = float(x)
            except (TypeError, ValueError):
                logger.warning("Invalid mouse x coordinate")
                return None

        if y is not None:
            try:
                y = float(y)
            except (TypeError, ValueError):
                logger.warning("Invalid mouse y coordinate")
                return None

        return InputEvent(
            event_type=event_type,
            action=action,
            key=key,
            x=x,
            y=y,
            button=button,
        )

    async def _close_peer_connection(
        self,
        peer_connection: RTCPeerConnection,
    ) -> None:
        """Close and remove a peer connection safely."""

        with self._peer_lock:
            self._peer_connections.discard(peer_connection)

        try:
            await peer_connection.close()
        except Exception:
            logger.exception("Error while closing WebRTC peer connection")

        self.input_handler.release_all()

        with self._peer_lock:
            active_connections = len(self._peer_connections)

        logger.info(
            "WebRTC peer connection closed. Active connections: %d",
            active_connections,
        )

    async def close(self) -> None:
        """Close every active WebRTC peer connection."""

        self._closed = True

        with self._peer_lock:
            connections = list(self._peer_connections)

        if connections:
            logger.info(
                "Closing %d active WebRTC connection(s)",
                len(connections),
            )

        await asyncio.gather(
            *(self._close_peer_connection(connection)
              for connection in connections),
            return_exceptions=True,
        )

        self.input_handler.release_all()

        logger.info("WebRTC server closed")
"""
WebRTC signaling helpers for the Game Stream server.

Signaling is responsible only for exchanging the information required
to establish a WebRTC connection. The actual audio/video transport
and remote input transport are handled by WebRTC after negotiation.
"""

from __future__ import annotations

from dataclasses import dataclass

from aiohttp import web

from server.utils.logger import logger


@dataclass
class SignalingMessage:
    """A WebRTC signaling message."""

    message_type: str
    payload: dict


class Signaling:
    """
    Manage WebRTC signaling between the browser client and server.

    The MVP uses HTTP endpoints for exchanging SDP offers and answers.
    """

    def __init__(self) -> None:
        self._routes: list[web.RouteDef] = []

    def register_routes(self, app: web.Application) -> None:
        """Register signaling routes with an aiohttp application."""

        app.router.add_post("/offer", self.handle_offer)

        self._routes = [
            web.post("/offer", self.handle_offer),
        ]

        logger.info("WebRTC signaling routes registered")

    async def handle_offer(self, request: web.Request) -> web.Response:
        """
        Receive a WebRTC offer from the browser.

        The actual offer processing is delegated to the WebRTC server.
        This method validates the incoming request and stores the offer
        on the request for the WebRTC layer to process.
        """

        if request.content_type != "application/json":
            return web.json_response(
                {"error": "Request must use application/json."},
                status=415,
            )

        try:
            data = await request.json()
        except Exception:
            return web.json_response(
                {"error": "Invalid JSON request body."},
                status=400,
            )

        if not isinstance(data, dict):
            return web.json_response(
                {"error": "Request body must be a JSON object."},
                status=400,
            )

        offer_type = data.get("type")
        offer_sdp = data.get("sdp")

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

        logger.info("Received WebRTC offer from client")

        request["webrtc_offer"] = {
            "type": offer_type,
            "sdp": offer_sdp,
        }

        return web.json_response(
            {
                "status": "accepted",
                "message": "WebRTC offer received.",
            }
        )
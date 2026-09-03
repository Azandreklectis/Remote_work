"""
Main entry point for the Game Stream server.

The server starts the screen-capture pipeline, initializes remote
input handling, exposes the WebRTC endpoint, and serves the browser
client over HTTP.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from aiohttp import web

from server.capture.screen_capture import ScreenCapture
from server.config import CONFIG
from server.input.input_handler import InputHandler
from server.streaming.signaling import Signaling
from server.streaming.webrtc_server import WebRTCServer
from server.utils.logger import logger


PROJECT_ROOT = Path(__file__).resolve().parent.parent
CLIENT_DIRECTORY = PROJECT_ROOT / "client"


class GameStreamServer:
    """Coordinate all Game Stream server components."""

    def __init__(self) -> None:
        self.capture = ScreenCapture()
        self.input_handler = InputHandler()
        self.signaling = Signaling()

        self.webrtc = WebRTCServer(
            capture=self.capture,
            input_handler=self.input_handler,
        )

        self.app = web.Application(
            client_max_size=CONFIG.server.max_request_size,
        )

        self._runner: web.AppRunner | None = None
        self._site: web.TCPSite | None = None

        self._configure_routes()
        self._configure_lifecycle()

    def _configure_routes(self) -> None:
        """Configure HTTP and WebRTC routes."""

        self.app.router.add_get("/", self.handle_index)

        self.app.router.add_static(
            "/static/",
            path=CLIENT_DIRECTORY,
            name="client-static",
        )

        self.webrtc.register_routes(self.app)

        logger.info("HTTP routes configured")

    def _configure_lifecycle(self) -> None:
        """Register application startup and shutdown callbacks."""

        self.app.on_startup.append(self._startup)
        self.app.on_shutdown.append(self._shutdown)

    async def _startup(self, app: web.Application) -> None:
        """Start server-side streaming components."""

        logger.info("Starting Game Stream server")

        self.capture.start()

        logger.info(
            "Game Stream server ready at http://%s:%d",
            self._display_host(),
            CONFIG.server.port,
        )

    async def _shutdown(self, app: web.Application) -> None:
        """Stop all server-side components cleanly."""

        logger.info("Shutting down Game Stream server")

        await self.webrtc.close()

        self.capture.stop()
        self.input_handler.close()

        logger.info("Game Stream server shutdown complete")

    async def handle_index(self, request: web.Request) -> web.StreamResponse:
        """Serve the main browser client."""

        index_path = CLIENT_DIRECTORY / "index.html"

        if not index_path.is_file():
            logger.error("Client index file not found: %s", index_path)

            return web.json_response(
                {"error": "Client application is not available."},
                status=500,
            )

        return web.FileResponse(index_path)

    async def start(self) -> None:
        """Start the aiohttp server and keep it running."""

        self._runner = web.AppRunner(self.app)

        await self._runner.setup()

        self._site = web.TCPSite(
            self._runner,
            host=CONFIG.server.host,
            port=CONFIG.server.port,
        )

        await self._site.start()

        logger.info(
            "Listening on %s:%d",
            CONFIG.server.host,
            CONFIG.server.port,
        )

    async def stop(self) -> None:
        """Stop the HTTP server."""

        if self._runner is not None:
            await self._runner.cleanup()
            self._runner = None
            self._site = None

    @staticmethod
    def _display_host() -> str:
        """
        Return a user-friendly host for the startup message.

        The server binds to 0.0.0.0, but clients should connect using
        the gaming PC's LAN IP address.
        """

        return "PC-LAN-IP"


async def run_server() -> None:
    """Create and run the Game Stream server."""

    server = GameStreamServer()

    try:
        await server.start()

        logger.info(
            "Open http://<PC-LAN-IP>:%d on the phone",
            CONFIG.server.port,
        )

        await asyncio.Event().wait()

    except asyncio.CancelledError:
        logger.info("Server task cancelled")

    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")

    finally:
        await server.stop()


def main() -> None:
    """Application entry point."""

    try:
        asyncio.run(run_server())
    except KeyboardInterrupt:
        logger.info("Game Stream server stopped")


if __name__ == "__main__":
    main()
"""
Tests for the WebRTC connection layer.

These tests verify input-message parsing and WebRTC server state
without requiring an actual browser or network connection.
"""

from server.capture.screen_capture import ScreenCapture
from server.input.input_handler import InputHandler
from server.streaming.webrtc_server import WebRTCServer


def create_webrtc_server() -> WebRTCServer:
    """Create a WebRTC server using the normal application components."""

    capture = ScreenCapture()
    input_handler = InputHandler()

    return WebRTCServer(
        capture=capture,
        input_handler=input_handler,
    )


def test_webrtc_server_initial_state() -> None:
    """Verify that a newly created WebRTC server is ready for connections."""

    server = create_webrtc_server()

    try:
        assert server._closed is False
        assert len(server._peer_connections) == 0
        assert server.capture is not None
        assert server.input_handler is not None

    finally:
        server.input_handler.close()


def test_parse_keyboard_input_event() -> None:
    """Verify that a keyboard input message is parsed correctly."""

    server = create_webrtc_server()

    try:
        event = server._parse_input_event(
            {
                "event_type": "keyboard",
                "action": "down",
                "key": "w",
            }
        )

        assert event is not None
        assert event.event_type == "keyboard"
        assert event.action == "down"
        assert event.key == "w"

    finally:
        server.input_handler.close()


def test_parse_mouse_input_event() -> None:
    """Verify that a mouse input message is parsed correctly."""

    server = create_webrtc_server()

    try:
        event = server._parse_input_event(
            {
                "event_type": "mouse",
                "action": "move",
                "x": 0.5,
                "y": 0.75,
            }
        )

        assert event is not None
        assert event.event_type == "mouse"
        assert event.action == "move"
        assert event.x == 0.5
        assert event.y == 0.75

    finally:
        server.input_handler.close()


def test_parse_mouse_button_event() -> None:
    """Verify that mouse button input is parsed correctly."""

    server = create_webrtc_server()

    try:
        event = server._parse_input_event(
            {
                "event_type": "mouse",
                "action": "down",
                "button": "left",
            }
        )

        assert event is not None
        assert event.event_type == "mouse"
        assert event.action == "down"
        assert event.button == "left"

    finally:
        server.input_handler.close()


def test_parse_input_event_normalizes_strings() -> None:
    """Verify that event types and actions are normalized."""

    server = create_webrtc_server()

    try:
        event = server._parse_input_event(
            {
                "event_type": " KEYBOARD ",
                "action": " DOWN ",
                "key": "w",
            }
        )

        assert event is not None
        assert event.event_type == "keyboard"
        assert event.action == "down"

    finally:
        server.input_handler.close()


def test_parse_input_event_rejects_missing_event_type() -> None:
    """Verify that an event without event_type is rejected."""

    server = create_webrtc_server()

    try:
        event = server._parse_input_event(
            {
                "action": "down",
                "key": "w",
            }
        )

        assert event is None

    finally:
        server.input_handler.close()


def test_parse_input_event_rejects_missing_action() -> None:
    """Verify that an event without an action is rejected."""

    server = create_webrtc_server()

    try:
        event = server._parse_input_event(
            {
                "event_type": "keyboard",
                "key": "w",
            }
        )

        assert event is None

    finally:
        server.input_handler.close()


def test_parse_input_event_rejects_unknown_event_type() -> None:
    """Verify that unsupported event types are rejected."""

    server = create_webrtc_server()

    try:
        event = server._parse_input_event(
            {
                "event_type": "gamepad",
                "action": "down",
                "key": "w",
            }
        )

        assert event is None

    finally:
        server.input_handler.close()


def test_parse_input_event_rejects_invalid_coordinates() -> None:
    """Verify that invalid mouse coordinates are rejected."""

    server = create_webrtc_server()

    try:
        event = server._parse_input_event(
            {
                "event_type": "mouse",
                "action": "move",
                "x": "not-a-number",
                "y": 0.5,
            }
        )

        assert event is None

    finally:
        server.input_handler.close()


def test_parse_input_event_converts_coordinates_to_float() -> None:
    """Verify that numeric coordinate values are converted to float."""

    server = create_webrtc_server()

    try:
        event = server._parse_input_event(
            {
                "event_type": "mouse",
                "action": "move",
                "x": "0.25",
                "y": "0.75",
            }
        )

        assert event is not None
        assert isinstance(event.x, float)
        assert isinstance(event.y, float)
        assert event.x == 0.25
        assert event.y == 0.75

    finally:
        server.input_handler.close()


def test_webrtc_server_can_be_closed() -> None:
    """Verify that the WebRTC server enters the closed state."""

    server = create_webrtc_server()

    try:
        import asyncio

        asyncio.run(server.close())

        assert server._closed is True
        assert len(server._peer_connections) == 0

    finally:
        server.input_handler.close()
"""
Remote input handling for the Game Stream server.

This module receives normalized input commands from the WebRTC
DataChannel and translates them into keyboard and mouse actions
on the gaming PC.
"""

from __future__ import annotations

from dataclasses import dataclass
from threading import Lock

from pynput import keyboard, mouse

from server.config import CONFIG
from server.utils.logger import logger


@dataclass(frozen=True)
class InputEvent:
    """Normalized input event received from the remote client."""

    event_type: str
    action: str
    key: str | None = None
    x: float | None = None
    y: float | None = None
    button: str | None = None


class InputHandler:
    """
    Translate remote input events into local keyboard and mouse actions.

    Keyboard keys are kept in a set so that key-down and key-up events
    can be tracked safely and duplicate key-down events are ignored.
    """

    def __init__(self) -> None:
        self.enabled = CONFIG.input.enabled

        self._keyboard = keyboard.Controller()
        self._mouse = mouse.Controller()

        self._pressed_keys: set[keyboard.Key | keyboard.KeyCode] = set()
        self._lock = Lock()

    def handle_event(self, event: InputEvent) -> bool:
        """
        Process one normalized input event.

        Returns True when the event was handled successfully.
        """

        if not self.enabled:
            return False

        try:
            if event.event_type == "keyboard":
                return self._handle_keyboard(event)

            if event.event_type == "mouse":
                return self._handle_mouse(event)

            logger.warning("Unknown input event type: %s", event.event_type)
            return False

        except Exception:
            logger.exception("Failed to handle input event")
            return False

    def _handle_keyboard(self, event: InputEvent) -> bool:
        """Handle keyboard press and release events."""

        if not event.key:
            logger.warning("Keyboard event missing key")
            return False

        key = self._parse_key(event.key)

        with self._lock:
            if event.action == "down":
                if key in self._pressed_keys:
                    return True

                self._keyboard.press(key)
                self._pressed_keys.add(key)
                return True

            if event.action == "up":
                self._keyboard.release(key)
                self._pressed_keys.discard(key)
                return True

        logger.warning("Unknown keyboard action: %s", event.action)
        return False

    def _handle_mouse(self, event: InputEvent) -> bool:
        """Handle mouse movement, button, and scroll events."""

        if event.action == "move":
            if event.x is None or event.y is None:
                logger.warning("Mouse move event missing coordinates")
                return False

            self._move_mouse(event.x, event.y)
            return True

        if event.action in {"down", "up"}:
            if not event.button:
                logger.warning("Mouse button event missing button")
                return False

            button = self._parse_mouse_button(event.button)

            if event.action == "down":
                self._mouse.press(button)
            else:
                self._mouse.release(button)

            return True

        if event.action == "scroll":
            if event.y is None:
                logger.warning("Mouse scroll event missing y value")
                return False

            self._mouse.scroll(0, int(event.y))
            return True

        logger.warning("Unknown mouse action: %s", event.action)
        return False

    def _move_mouse(self, normalized_x: float, normalized_y: float) -> None:
        """
        Move the local mouse using normalized coordinates.

        Coordinates are expected to be in the range 0.0–1.0.
        """

        x = min(max(float(normalized_x), 0.0), 1.0)
        y = min(max(float(normalized_y), 0.0), 1.0)

        screen_width = self._get_screen_width()
        screen_height = self._get_screen_height()

        target_x = int(x * (screen_width - 1))
        target_y = int(y * (screen_height - 1))

        self._mouse.position = (target_x, target_y)

    @staticmethod
    def _parse_key(key_value: str) -> keyboard.Key | keyboard.KeyCode:
        """
        Convert a client key string into a pynput keyboard key.
        """

        normalized = key_value.strip().lower()

        special_keys = {
            "backspace": keyboard.Key.backspace,
            "delete": keyboard.Key.delete,
            "enter": keyboard.Key.enter,
            "escape": keyboard.Key.esc,
            "esc": keyboard.Key.esc,
            "tab": keyboard.Key.tab,
            "space": keyboard.Key.space,
            "shift": keyboard.Key.shift,
            "shiftleft": keyboard.Key.shift_l,
            "shiftright": keyboard.Key.shift_r,
            "ctrl": keyboard.Key.ctrl,
            "control": keyboard.Key.ctrl,
            "ctrlleft": keyboard.Key.ctrl_l,
            "ctrlright": keyboard.Key.ctrl_r,
            "alt": keyboard.Key.alt,
            "altleft": keyboard.Key.alt_l,
            "altright": keyboard.Key.alt_r,
            "windows": keyboard.Key.cmd,
            "win": keyboard.Key.cmd,
            "cmd": keyboard.Key.cmd,
            "arrowup": keyboard.Key.up,
            "arrowdown": keyboard.Key.down,
            "arrowleft": keyboard.Key.left,
            "arrowright": keyboard.Key.right,
            "home": keyboard.Key.home,
            "end": keyboard.Key.end,
            "pageup": keyboard.Key.page_up,
            "pagedown": keyboard.Key.page_down,
            "insert": keyboard.Key.insert,
            "capslock": keyboard.Key.caps_lock,
            "numlock": keyboard.Key.num_lock,
            "printscreen": keyboard.Key.print_screen,
            "pause": keyboard.Key.pause,
        }

        if normalized in special_keys:
            return special_keys[normalized]

        if len(normalized) == 1:
            return keyboard.KeyCode.from_char(normalized)

        if normalized.startswith("f") and normalized[1:].isdigit():
            function_number = int(normalized[1:])

            if 1 <= function_number <= 12:
                return getattr(
                    keyboard.Key,
                    f"f{function_number}",
                )

        raise ValueError(f"Unsupported keyboard key: {key_value}")

    @staticmethod
    def _parse_mouse_button(button_value: str) -> mouse.Button:
        """Convert a client mouse-button string into a pynput button."""

        normalized = button_value.strip().lower()

        buttons = {
            "left": mouse.Button.left,
            "right": mouse.Button.right,
            "middle": mouse.Button.middle,
        }

        if normalized not in buttons:
            raise ValueError(f"Unsupported mouse button: {button_value}")

        return buttons[normalized]

    @staticmethod
    def _get_screen_width() -> int:
        """Return the primary display width."""

        try:
            import mss

            with mss.mss() as capture:
                return int(capture.monitors[1]["width"])
        except Exception:
            return CONFIG.video.width

    @staticmethod
    def _get_screen_height() -> int:
        """Return the primary display height."""

        try:
            import mss

            with mss.mss() as capture:
                return int(capture.monitors[1]["height"])
        except Exception:
            return CONFIG.video.height

    def release_all(self) -> None:
        """
        Release every keyboard key currently held by the remote client.

        This is important when a connection drops while a key is held.
        """

        with self._lock:
            for key in tuple(self._pressed_keys):
                try:
                    self._keyboard.release(key)
                except Exception:
                    logger.exception("Failed to release keyboard key")

            self._pressed_keys.clear()

    def close(self) -> None:
        """Release all active input state."""

        self.release_all()

        logger.info("Input handler closed")

    def __enter__(self) -> "InputHandler":
        """Create an active input handler using a context manager."""

        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        """Release input state when leaving a context manager."""

        self.close()
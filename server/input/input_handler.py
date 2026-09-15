"""
Generic remote input handling for the Game Stream server.

This module receives normalized keyboard, mouse, and controller
events and translates them into local input actions.

The input system is intentionally generic so that the client UI
does not need to know how the PC implements the input.
"""

from __future__ import annotations

from dataclasses import dataclass
from threading import Lock
from typing import Any

from pynput import keyboard, mouse

from server.config import CONFIG
from server.utils.logger import logger


@dataclass(frozen=True)
class InputEvent:
    """Generic normalized input event."""

    event_type: str
    action: str

    key: str | None = None

    x: float | None = None
    y: float | None = None

    dx: float | None = None
    dy: float | None = None

    button: str | None = None

    controller: str | None = None
    axis: str | None = None
    value: float | None = None


class InputHandler:
    """
    Translate generic remote input events into local PC actions.

    Keyboard and mouse events are currently implemented through
    pynput.

    Controller events are accepted and stored by the generic
    input layer. Actual virtual controller injection will be
    implemented in Task 5.
    """

    SUPPORTED_EVENT_TYPES = {
        "keyboard",
        "mouse",
        "controller",
    }

    KEYBOARD_ACTIONS = {
        "down",
        "up",
    }

    MOUSE_ACTIONS = {
        "move",
        "down",
        "up",
        "click",
        "scroll",
    }

    CONTROLLER_ACTIONS = {
        "button_down",
        "button_up",
        "axis",
    }

    def __init__(self) -> None:
        self.enabled = CONFIG.input.enabled

        self._keyboard = keyboard.Controller()
        self._mouse = mouse.Controller()

        self._pressed_keys: set[
            keyboard.Key | keyboard.KeyCode
        ] = set()

        self._pressed_mouse_buttons: set[
            mouse.Button
        ] = set()

        self._controller_state: dict[
            str,
            dict[str, Any],
        ] = {}

        self._lock = Lock()

    def handle_event(self, event: InputEvent) -> bool:
        """
        Process one generic input event.

        Returns True when the event was handled successfully.
        """

        if not self.enabled:
            return False

        try:
            event_type = event.event_type.strip().lower()

            if event_type == "keyboard":
                return self._handle_keyboard(event)

            if event_type == "mouse":
                return self._handle_mouse(event)

            if event_type == "controller":
                return self._handle_controller(event)

            logger.warning(
                "Unsupported input event type: %s",
                event.event_type,
            )

            return False

        except Exception:
            logger.exception(
                "Failed to handle input event"
            )

            return False

    # =============================================================
    # KEYBOARD
    # =============================================================

    def _handle_keyboard(
        self,
        event: InputEvent,
    ) -> bool:
        """Handle generic keyboard events."""

        if event.action not in self.KEYBOARD_ACTIONS:
            logger.warning(
                "Unsupported keyboard action: %s",
                event.action,
            )
            return False

        if not event.key:
            logger.warning(
                "Keyboard event missing key"
            )
            return False

        key = self._parse_key(event.key)

        with self._lock:
            if event.action == "down":
                # Ignore duplicate key-down events.
                if key in self._pressed_keys:
                    return True

                self._keyboard.press(key)
                self._pressed_keys.add(key)

                return True

            self._keyboard.release(key)
            self._pressed_keys.discard(key)

            return True

    # =============================================================
    # MOUSE
    # =============================================================

    def _handle_mouse(
        self,
        event: InputEvent,
    ) -> bool:
        """Handle generic mouse events."""

        if event.action == "move":
            return self._handle_mouse_move(event)

        if event.action == "down":
            return self._handle_mouse_button(
                event,
                pressed=True,
            )

        if event.action == "up":
            return self._handle_mouse_button(
                event,
                pressed=False,
            )

        if event.action == "click":
            return self._handle_mouse_click(event)

        if event.action == "scroll":
            return self._handle_mouse_scroll(event)

        logger.warning(
            "Unsupported mouse action: %s",
            event.action,
        )

        return False

    def _handle_mouse_move(
        self,
        event: InputEvent,
    ) -> bool:
        """
        Handle mouse movement.

        Relative movement uses dx/dy.

        Absolute movement uses normalized x/y.
        """

        if (
            event.dx is not None
            or event.dy is not None
        ):
            dx = (
                event.dx
                if event.dx is not None
                else 0.0
            )

            dy = (
                event.dy
                if event.dy is not None
                else 0.0
            )

            self._move_mouse_relative(
                dx,
                dy,
            )

            return True

        if (
            event.x is not None
            and event.y is not None
        ):
            self._move_mouse_absolute(
                event.x,
                event.y,
            )

            return True

        logger.warning(
            "Mouse move event requires x/y or dx/dy"
        )

        return False

    def _handle_mouse_button(
        self,
        event: InputEvent,
        pressed: bool,
    ) -> bool:
        """Handle mouse button press/release."""

        if not event.button:
            logger.warning(
                "Mouse button event missing button"
            )
            return False

        button = self._parse_mouse_button(
            event.button
        )

        with self._lock:
            if pressed:
                self._mouse.press(button)
                self._pressed_mouse_buttons.add(
                    button
                )
            else:
                self._mouse.release(button)
                self._pressed_mouse_buttons.discard(
                    button
                )

        return True

    def _handle_mouse_click(
        self,
        event: InputEvent,
    ) -> bool:
        """Handle a complete mouse click."""

        if not event.button:
            logger.warning(
                "Mouse click event missing button"
            )
            return False

        button = self._parse_mouse_button(
            event.button
        )

        self._mouse.click(button)

        return True

    def _handle_mouse_scroll(
        self,
        event: InputEvent,
    ) -> bool:
        """Handle mouse scrolling."""

        if (
            event.x is None
            and event.y is None
        ):
            logger.warning(
                "Mouse scroll event requires x or y"
            )
            return False

        horizontal = (
            int(event.x)
            if event.x is not None
            else 0
        )

        vertical = (
            int(event.y)
            if event.y is not None
            else 0
        )

        self._mouse.scroll(
            horizontal,
            vertical,
        )

        return True

    def _move_mouse_relative(
        self,
        dx: float,
        dy: float,
    ) -> None:
        """Move the local mouse relatively."""

        self._mouse.move(
            int(round(dx)),
            int(round(dy)),
        )

    def _move_mouse_absolute(
        self,
        normalized_x: float,
        normalized_y: float,
    ) -> None:
        """Move the local mouse using normalized coordinates."""

        x = min(
            max(float(normalized_x), 0.0),
            1.0,
        )

        y = min(
            max(float(normalized_y), 0.0),
            1.0,
        )

        screen_width = self._get_screen_width()
        screen_height = self._get_screen_height()

        target_x = int(
            x * (screen_width - 1)
        )

        target_y = int(
            y * (screen_height - 1)
        )

        self._mouse.position = (
            target_x,
            target_y,
        )

    # =============================================================
    # CONTROLLER
    # =============================================================

    def _handle_controller(
        self,
        event: InputEvent,
    ) -> bool:
        """
        Handle generic controller events.

        Actual OS controller injection is intentionally deferred
        to Task 5.
        """

        if event.action not in self.CONTROLLER_ACTIONS:
            logger.warning(
                "Unsupported controller action: %s",
                event.action,
            )
            return False

        controller_name = (
            event.controller or "default"
        ).strip().lower()

        controller_state = (
            self._controller_state.setdefault(
                controller_name,
                {
                    "buttons": set(),
                    "axes": {},
                },
            )
        )

        if event.action == "button_down":
            if not event.button:
                logger.warning(
                    "Controller button_down missing button"
                )
                return False

            controller_state["buttons"].add(
                event.button
            )

            logger.debug(
                "Controller button down: %s",
                event.button,
            )

            return True

        if event.action == "button_up":
            if not event.button:
                logger.warning(
                    "Controller button_up missing button"
                )
                return False

            controller_state["buttons"].discard(
                event.button
            )

            logger.debug(
                "Controller button up: %s",
                event.button,
            )

            return True

        if event.action == "axis":
            if not event.axis:
                logger.warning(
                    "Controller axis event missing axis"
                )
                return False

            if event.value is None:
                logger.warning(
                    "Controller axis event missing value"
                )
                return False

            value = min(
                max(float(event.value), -1.0),
                1.0,
            )

            controller_state["axes"][
                event.axis
            ] = value

            logger.debug(
                "Controller axis %s = %.3f",
                event.axis,
                value,
            )

            return True

        return False

    # =============================================================
    # KEY PARSING
    # =============================================================

    @staticmethod
    def _parse_key(
        key_value: str,
    ) -> keyboard.Key | keyboard.KeyCode:
        """Convert a client key string into a pynput key."""

        normalized = (
            key_value.strip().lower()
        )

        special_keys: dict[
            str,
            keyboard.Key | keyboard.KeyCode,
        ] = {
            "backspace": keyboard.Key.backspace,
            "delete": keyboard.Key.delete,

            "enter": keyboard.Key.enter,
            "return": keyboard.Key.enter,

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
            "up": keyboard.Key.up,

            "arrowdown": keyboard.Key.down,
            "down": keyboard.Key.down,

            "arrowleft": keyboard.Key.left,
            "left": keyboard.Key.left,

            "arrowright": keyboard.Key.right,
            "right": keyboard.Key.right,

            "home": keyboard.Key.home,
            "end": keyboard.Key.end,

            "pageup": keyboard.Key.page_up,
            "pagedown": keyboard.Key.page_down,

            "insert": keyboard.Key.insert,

            "capslock": keyboard.Key.caps_lock,
            "numlock": keyboard.Key.num_lock,

            "printscreen": keyboard.Key.print_screen,
            "pause": keyboard.Key.pause,

            "menu": keyboard.Key.menu,
        }

        if normalized in special_keys:
            return special_keys[normalized]

        if len(normalized) == 1:
            return keyboard.KeyCode.from_char(
                normalized
            )

        if (
            normalized.startswith("f")
            and normalized[1:].isdigit()
        ):
            function_number = int(
                normalized[1:]
            )

            if 1 <= function_number <= 12:
                function_key = getattr(
                    keyboard.Key,
                    f"f{function_number}",
                    None,
                )

                if function_key is not None:
                    return function_key

        raise ValueError(
            f"Unsupported keyboard key: {key_value}"
        )

    # =============================================================
    # MOUSE BUTTON PARSING
    # =============================================================

    @staticmethod
    def _parse_mouse_button(
        button_value: str,
    ) -> mouse.Button:
        """Convert a client mouse button name."""

        normalized = (
            button_value.strip().lower()
        )

        buttons = {
            "left": mouse.Button.left,
            "right": mouse.Button.right,
            "middle": mouse.Button.middle,
        }

        if normalized not in buttons:
            raise ValueError(
                f"Unsupported mouse button: {button_value}"
            )

        return buttons[normalized]

    # =============================================================
    # SCREEN HELPERS
    # =============================================================

    @staticmethod
    def _get_screen_width() -> int:
        """Return the primary display width."""

        try:
            import mss

            with mss.mss() as capture:
                return int(
                    capture.monitors[1]["width"]
                )

        except Exception:
            return CONFIG.video.width

    @staticmethod
    def _get_screen_height() -> int:
        """Return the primary display height."""

        try:
            import mss

            with mss.mss() as capture:
                return int(
                    capture.monitors[1]["height"]
                )

        except Exception:
            return CONFIG.video.height

    # =============================================================
    # CLEANUP
    # =============================================================

    def release_all(self) -> None:
        """
        Release every active keyboard and mouse input.

        This prevents stuck keys/buttons when the connection
        disappears while an input is held.
        """

        with self._lock:
            for key in tuple(
                self._pressed_keys
            ):
                try:
                    self._keyboard.release(key)
                except Exception:
                    logger.exception(
                        "Failed to release keyboard key"
                    )

            self._pressed_keys.clear()

            for button in tuple(
                self._pressed_mouse_buttons
            ):
                try:
                    self._mouse.release(button)
                except Exception:
                    logger.exception(
                        "Failed to release mouse button"
                    )

            self._pressed_mouse_buttons.clear()

            for state in (
                self._controller_state.values()
            ):
                state["buttons"].clear()
                state["axes"].clear()

    def close(self) -> None:
        """Release all active input state."""

        self.release_all()

        logger.info(
            "Input handler closed"
        )

    def __enter__(self) -> "InputHandler":
        """Create an active input handler."""

        return self

    def __exit__(
        self,
        exc_type,
        exc_value,
        traceback,
    ) -> None:
        """Release input state on context exit."""

        self.close()
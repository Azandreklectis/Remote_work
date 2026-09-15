/**
 * Generic remote input controls for Game Stream.
 *
 * Task 3:
 * - Touchpad / relative mouse movement
 * - Mouse sensitivity
 * - Left / right / middle click
 * - Double click
 * - Click and drag
 * - Scrolling
 * - Touchpad enable/disable
 * - Touchpad settings
 * - Physical keyboard
 * - Virtual buttons
 * - Joystick
 * - Generic controller events
 *
 * The public GameControls interface is preserved for main.js.
 */

class GameControls {
    constructor(webrtc) {
        this.webrtc = webrtc;

        this.enabled = true;

        // ---------------------------------------------------------
        // Keyboard state
        // ---------------------------------------------------------

        this.activeKeys = new Set();

        // ---------------------------------------------------------
        // Mouse state
        // ---------------------------------------------------------

        this.activeMouseButtons = new Set();

        // ---------------------------------------------------------
        // Controller state
        // ---------------------------------------------------------

        this.activeControllerButtons = new Set();

        // ---------------------------------------------------------
        // Touchpad configuration
        // ---------------------------------------------------------

        this.touchpadEnabled = true;

        this.mouseSensitivity = 1.0;

        this.minMouseSensitivity = 0.25;
        this.maxMouseSensitivity = 3.0;

        // Movement threshold prevents tiny browser/pointer noise
        // from generating unnecessary mouse packets.
        this.mouseMovementThreshold = 0.01;

        // ---------------------------------------------------------
        // Touchpad state
        // ---------------------------------------------------------

        this.touchpadPointerId = null;

        this.touchpadLastX = 0;
        this.touchpadLastY = 0;

        this.touchpadMoved = false;

        this.touchpadDragging = false;

        this.touchpadLongPressTimer = null;

        this.touchpadLongPressDelay = 400;

        this.lastTapTime = 0;

        this.doubleTapWindow = 300;

        // ---------------------------------------------------------
        // Joystick state
        // ---------------------------------------------------------

        this.joystickActive = false;
        this.joystickPointerId = null;

        // ---------------------------------------------------------
        // Bound event handlers
        // ---------------------------------------------------------

        this.handleKeyDown =
            this.handleKeyDown.bind(this);

        this.handleKeyUp =
            this.handleKeyUp.bind(this);

        this.handleWindowBlur =
            this.handleWindowBlur.bind(this);

        this.handleVisibilityChange =
            this.handleVisibilityChange.bind(this);

        this.handleBeforeUnload =
            this.handleBeforeUnload.bind(this);
    }

    // =============================================================
    // INITIALIZATION
    // =============================================================

    initialize() {
        // this.bindPhysicalKeyboard();
        // this.bindJoystick();
        // this.bindActionButtons();
        // this.bindTouchpad();
        // this.bindCleanupEvents();

        console.log(
            "GameControls initialized."
        );

        return this;
    }

    // =============================================================
    // GENERIC INPUT
    // =============================================================

    sendInput(event) {
        if (!this.enabled) {
            return false;
        }

        if (!this.webrtc) {
            return false;
        }

        if (
            typeof this.webrtc.sendInput !==
            "function"
        ) {
            console.warn(
                "WebRTC input channel is not available."
            );

            return false;
        }

        try {
            return Boolean(
                this.webrtc.sendInput(event)
            );
        } catch (error) {
            console.error(
                "Failed to send input:",
                error
            );

            return false;
        }
    }

    // =============================================================
    // KEYBOARD
    // =============================================================

    keyDown(key) {
        const normalized =
            this.normalizeControlKey(key);

        if (!normalized) {
            return false;
        }

        if (
            this.activeKeys.has(normalized)
        ) {
            return true;
        }

        this.activeKeys.add(normalized);

        return this.sendInput({
            event_type: "keyboard",
            action: "down",
            key: normalized
        });
    }

    keyUp(key) {
        const normalized =
            this.normalizeControlKey(key);

        if (!normalized) {
            return false;
        }

        this.activeKeys.delete(normalized);

        return this.sendInput({
            event_type: "keyboard",
            action: "up",
            key: normalized
        });
    }

    bindPhysicalKeyboard() {
        window.addEventListener(
            "keydown",
            this.handleKeyDown
        );

        window.addEventListener(
            "keyup",
            this.handleKeyUp
        );
    }

    handleKeyDown(event) {
        if (!this.enabled) {
            return;
        }

        const target = event.target;

        if (
            target &&
            (
                target.tagName === "INPUT" ||
                target.tagName === "TEXTAREA" ||
                target.tagName === "SELECT" ||
                target.isContentEditable
            )
        ) {
            return;
        }

        const key =
            this.normalizeKeyboardEvent(event);

        if (!key) {
            return;
        }

        if (
            this.shouldPreventDefault(key)
        ) {
            event.preventDefault();
        }

        this.keyDown(key);
    }

    handleKeyUp(event) {
        if (!this.enabled) {
            return;
        }

        const target = event.target;

        if (
            target &&
            (
                target.tagName === "INPUT" ||
                target.tagName === "TEXTAREA" ||
                target.tagName === "SELECT" ||
                target.isContentEditable
            )
        ) {
            return;
        }

        const key =
            this.normalizeKeyboardEvent(event);

        if (!key) {
            return;
        }

        if (
            this.shouldPreventDefault(key)
        ) {
            event.preventDefault();
        }

        this.keyUp(key);
    }

    normalizeKeyboardEvent(event) {
        if (!event) {
            return null;
        }

        const code = event.code || "";
        const key = event.key || "";

        const codeMap = {
            KeyA: "a",
            KeyB: "b",
            KeyC: "c",
            KeyD: "d",
            KeyE: "e",
            KeyF: "f",
            KeyG: "g",
            KeyH: "h",
            KeyI: "i",
            KeyJ: "j",
            KeyK: "k",
            KeyL: "l",
            KeyM: "m",
            KeyN: "n",
            KeyO: "o",
            KeyP: "p",
            KeyQ: "q",
            KeyR: "r",
            KeyS: "s",
            KeyT: "t",
            KeyU: "u",
            KeyV: "v",
            KeyW: "w",
            KeyX: "x",
            KeyY: "y",
            KeyZ: "z",

            Digit0: "0",
            Digit1: "1",
            Digit2: "2",
            Digit3: "3",
            Digit4: "4",
            Digit5: "5",
            Digit6: "6",
            Digit7: "7",
            Digit8: "8",
            Digit9: "9",

            F1: "f1",
            F2: "f2",
            F3: "f3",
            F4: "f4",
            F5: "f5",
            F6: "f6",
            F7: "f7",
            F8: "f8",
            F9: "f9",
            F10: "f10",
            F11: "f11",
            F12: "f12",

            ArrowUp: "arrowup",
            ArrowDown: "arrowdown",
            ArrowLeft: "arrowleft",
            ArrowRight: "arrowright",

            Home: "home",
            End: "end",
            PageUp: "pageup",
            PageDown: "pagedown",
            Insert: "insert",
            Delete: "delete",

            Backspace: "backspace",
            Enter: "enter",
            Tab: "tab",
            Space: "space",
            Escape: "escape",

            ShiftLeft: "shiftleft",
            ShiftRight: "shiftright",

            ControlLeft: "ctrlleft",
            ControlRight: "ctrlright",

            AltLeft: "altleft",
            AltRight: "altright",

            MetaLeft: "windows",
            MetaRight: "windows",

            CapsLock: "capslock",
            NumLock: "numlock",

            PrintScreen: "printscreen",
            Pause: "pause",
            ContextMenu: "menu"
        };

        if (codeMap[code]) {
            return codeMap[code];
        }

        return this.normalizeControlKey(key);
    }

    normalizeControlKey(key) {
        if (
            key === null ||
            key === undefined
        ) {
            return null;
        }

        let normalized =
            String(key)
                .trim()
                .toLowerCase();

        if (!normalized) {
            return null;
        }

        const aliases = {
            " ": "space",
            spacebar: "space",

            esc: "escape",

            return: "enter",

            ctrl: "ctrl",
            control: "ctrl",

            leftctrl: "ctrlleft",
            rightctrl: "ctrlright",

            leftshift: "shiftleft",
            rightshift: "shiftright",

            leftalt: "altleft",
            rightalt: "altright",

            win: "windows",
            cmd: "windows",
            meta: "windows",

            up: "arrowup",
            down: "arrowdown",
            left: "arrowleft",
            right: "arrowright",

            pgup: "pageup",
            pgdn: "pagedown",

            del: "delete"
        };

        if (aliases[normalized]) {
            normalized =
                aliases[normalized];
        }

        if (normalized.length === 1) {
            return normalized;
        }

        if (
            /^f([1-9]|1[0-2])$/.test(
                normalized
            )
        ) {
            return normalized;
        }

        const supported = new Set([
            "backspace",
            "delete",
            "enter",
            "escape",
            "tab",
            "space",

            "shift",
            "shiftleft",
            "shiftright",

            "ctrl",
            "ctrlleft",
            "ctrlright",

            "alt",
            "altleft",
            "altright",

            "windows",

            "arrowup",
            "arrowdown",
            "arrowleft",
            "arrowright",

            "home",
            "end",
            "pageup",
            "pagedown",
            "insert",

            "capslock",
            "numlock",

            "printscreen",
            "pause",
            "menu"
        ]);

        if (supported.has(normalized)) {
            return normalized;
        }

        return null;
    }

    shouldPreventDefault(key) {
        const preventKeys = new Set([
            "space",
            "tab",
            "escape",
            "arrowup",
            "arrowdown",
            "arrowleft",
            "arrowright",
            "backspace",
            "delete",
            "pageup",
            "pagedown",
            "home",
            "end"
        ]);

        return preventKeys.has(key);
    }

    // =============================================================
    // MOUSE — RELATIVE MOVEMENT
    // =============================================================

    mouseMoveRelative(dx, dy) {
        if (!this.touchpadEnabled) {
            return false;
        }

        let movementX =
            Number(dx || 0);

        let movementY =
            Number(dy || 0);

        if (
            !Number.isFinite(movementX)
        ) {
            movementX = 0;
        }

        if (
            !Number.isFinite(movementY)
        ) {
            movementY = 0;
        }

        movementX *=
            this.mouseSensitivity;

        movementY *=
            this.mouseSensitivity;

        if (
            Math.abs(movementX) <
                this.mouseMovementThreshold &&
            Math.abs(movementY) <
                this.mouseMovementThreshold
        ) {
            return true;
        }

        return this.sendInput({
            event_type: "mouse",
            action: "move",
            dx: movementX,
            dy: movementY
        });
    }

    mouseMoveAbsolute(x, y) {
        return this.sendInput({
            event_type: "mouse",
            action: "move",
            x: Number(x),
            y: Number(y)
        });
    }

    // =============================================================
    // MOUSE BUTTONS
    // =============================================================

    mouseDown(button = "left") {
        const normalized =
            this.normalizeMouseButton(button);

        if (!normalized) {
            return false;
        }

        if (
            this.activeMouseButtons.has(
                normalized
            )
        ) {
            return true;
        }

        this.activeMouseButtons.add(
            normalized
        );

        return this.sendInput({
            event_type: "mouse",
            action: "down",
            button: normalized
        });
    }

    mouseUp(button = "left") {
        const normalized =
            this.normalizeMouseButton(button);

        if (!normalized) {
            return false;
        }

        this.activeMouseButtons.delete(
            normalized
        );

        return this.sendInput({
            event_type: "mouse",
            action: "up",
            button: normalized
        });
    }

    mouseClick(button = "left") {
        const normalized =
            this.normalizeMouseButton(button);

        if (!normalized) {
            return false;
        }

        return this.sendInput({
            event_type: "mouse",
            action: "click",
            button: normalized
        });
    }

    mouseDoubleClick(button = "left") {
        const normalized =
            this.normalizeMouseButton(button);

        if (!normalized) {
            return false;
        }

        this.mouseClick(normalized);

        window.setTimeout(
            () => {
                this.mouseClick(normalized);
            },
            70
        );

        return true;
    }

    normalizeMouseButton(button) {
        if (!button) {
            return null;
        }

        const normalized =
            String(button)
                .trim()
                .toLowerCase();

        const aliases = {
            primary: "left",
            secondary: "right",
            wheel: "middle",
            middlebutton: "middle"
        };

        const value =
            aliases[normalized] ||
            normalized;

        if (
            value === "left" ||
            value === "right" ||
            value === "middle"
        ) {
            return value;
        }

        return null;
    }

    // =============================================================
    // MOUSE SCROLL
    // =============================================================

    mouseScroll(x = 0, y = 0) {
        let horizontal =
            Number(x || 0);

        let vertical =
            Number(y || 0);

        if (
            !Number.isFinite(horizontal)
        ) {
            horizontal = 0;
        }

        if (
            !Number.isFinite(vertical)
        ) {
            vertical = 0;
        }

        /*
         * Browser wheel deltas are generally much larger than
         * the small integer scroll values expected by pynput.
         *
         * Convert the gesture into a useful number of wheel steps.
         */
        horizontal =
            this.normalizeScrollDelta(
                horizontal
            );

        vertical =
            this.normalizeScrollDelta(
                vertical
            );

        if (
            horizontal === 0 &&
            vertical === 0
        ) {
            return true;
        }

        return this.sendInput({
            event_type: "mouse",
            action: "scroll",
            x: horizontal,
            y: vertical
        });
    }

    normalizeScrollDelta(delta) {
        if (!Number.isFinite(delta)) {
            return 0;
        }

        if (Math.abs(delta) < 1) {
            return 0;
        }

        /*
         * Preserve direction while avoiding huge values.
         */
        const direction =
            delta < 0 ? -1 : 1;

        const magnitude =
            Math.min(
                Math.max(
                    Math.round(
                        Math.abs(delta) / 40
                    ),
                    1
                ),
                8
            );

        return direction * magnitude;
    }

    // =============================================================
    // TOUCHPAD
    // =============================================================

    bindTouchpad() {
        let touchpad =
            document.getElementById(
                "touchpad"
            );

        /*
         * Task 3 is self-contained.
         *
         * If index.html already contains a touchpad,
         * use it.
         *
         * Otherwise create one automatically so that
         * Task 3 does not require an index.html rewrite.
         */
        if (!touchpad) {
            touchpad =
                this.createTouchpad();
        }

        if (!touchpad) {
            console.warn(
                "Unable to initialize touchpad."
            );

            return;
        }

        this.touchpadElement =
            touchpad;

        this.applyTouchpadStyles(
            touchpad
        );

        this.createTouchpadSettings(
            touchpad
        );

        let pointerId = null;

        const release = (
            event,
            sendClick
        ) => {
            if (
                pointerId === null ||
                event.pointerId !== pointerId
            ) {
                return;
            }

            window.clearTimeout(
                this.touchpadLongPressTimer
            );

            this.touchpadLongPressTimer =
                null;

            const wasDragging =
                this.touchpadDragging;

            const moved =
                this.touchpadMoved;

            pointerId = null;

            this.touchpadPointerId =
                null;

            try {
                touchpad.releasePointerCapture(
                    event.pointerId
                );
            } catch (_) {
                // Pointer capture may not be available.
            }

            if (wasDragging) {
                this.mouseUp("left");

                this.touchpadDragging =
                    false;
            } else if (
                sendClick &&
                !moved
            ) {
                this.handleTouchpadTap();
            }

            this.touchpadMoved =
                false;

            event.preventDefault();
        };

        touchpad.addEventListener(
            "pointerdown",
            (event) => {
                if (
                    !this.enabled ||
                    !this.touchpadEnabled
                ) {
                    return;
                }

                /*
                 * Only one active touchpad pointer.
                 */
                if (pointerId !== null) {
                    return;
                }

                pointerId =
                    event.pointerId;

                this.touchpadPointerId =
                    event.pointerId;

                this.touchpadLastX =
                    event.clientX;

                this.touchpadLastY =
                    event.clientY;

                this.touchpadMoved =
                    false;

                this.touchpadDragging =
                    false;

                try {
                    touchpad.setPointerCapture(
                        event.pointerId
                    );
                } catch (_) {
                    // Ignore unsupported capture.
                }

                /*
                 * Long press begins a left-button drag.
                 *
                 * This makes it possible to drag windows,
                 * select text, move files, etc. from the phone.
                 */
                this.touchpadLongPressTimer =
                    window.setTimeout(
                        () => {
                            if (
                                pointerId ===
                                event.pointerId &&
                                !this.touchpadMoved
                            ) {
                                this.touchpadDragging =
                                    true;

                                this.mouseDown(
                                    "left"
                                );
                            }
                        },
                        this.touchpadLongPressDelay
                    );

                event.preventDefault();
            },
            {
                passive: false
            }
        );

        touchpad.addEventListener(
            "pointermove",
            (event) => {
                if (
                    pointerId === null ||
                    event.pointerId !== pointerId ||
                    !this.touchpadEnabled
                ) {
                    return;
                }

                const dx =
                    event.clientX -
                    this.touchpadLastX;

                const dy =
                    event.clientY -
                    this.touchpadLastY;

                this.touchpadLastX =
                    event.clientX;

                this.touchpadLastY =
                    event.clientY;

                if (
                    Math.abs(dx) > 0 ||
                    Math.abs(dy) > 0
                ) {
                    this.touchpadMoved =
                        true;

                    /*
                     * Movement cancels the tap/long-press
                     * timer after a small movement.
                     */
                    if (
                        Math.abs(dx) > 2 ||
                        Math.abs(dy) > 2
                    ) {
                        window.clearTimeout(
                            this.touchpadLongPressTimer
                        );

                        this.touchpadLongPressTimer =
                            null;
                    }

                    this.mouseMoveRelative(
                        dx,
                        dy
                    );
                }

                event.preventDefault();
            },
            {
                passive: false
            }
        );

        touchpad.addEventListener(
            "pointerup",
            (event) => {
                release(
                    event,
                    true
                );
            },
            {
                passive: false
            }
        );

        touchpad.addEventListener(
            "pointercancel",
            (event) => {
                release(
                    event,
                    false
                );
            },
            {
                passive: false
            }
        );

        touchpad.addEventListener(
            "wheel",
            (event) => {
                if (
                    !this.enabled ||
                    !this.touchpadEnabled
                ) {
                    return;
                }

                this.mouseScroll(
                    event.deltaX,
                    event.deltaY
                );

                event.preventDefault();
            },
            {
                passive: false
            }
        );

        /*
         * Right-click through context menu.
         */
        touchpad.addEventListener(
            "contextmenu",
            (event) => {
                event.preventDefault();

                this.mouseClick(
                    "right"
                );
            }
        );

        /*
         * Middle mouse through a three-finger
         * pointer gesture is not reliable across
         * browsers, so expose it through the
         * settings/control API instead.
         */
        touchpad.addEventListener(
            "dblclick",
            (event) => {
                event.preventDefault();

                /*
                 * The explicit double-click handler is
                 * kept here as a fallback for browsers
                 * that synthesize dblclick.
                 */
                if (
                    !this.touchpadDragging
                ) {
                    this.mouseDoubleClick(
                        "left"
                    );
                }
            }
        );
    }

    handleTouchpadTap() {
        const now =
            Date.now();

        const elapsed =
            now - this.lastTapTime;

        if (
            elapsed > 0 &&
            elapsed <= this.doubleTapWindow
        ) {
            this.lastTapTime = 0;

            this.mouseDoubleClick(
                "left"
            );

            return;
        }

        this.lastTapTime = now;

        this.mouseClick(
            "left"
        );
    }

    createTouchpad() {
        const touchpad =
            document.createElement(
                "div"
            );

        touchpad.id =
            "touchpad";

        touchpad.setAttribute(
            "aria-label",
            "Touchpad"
        );

        touchpad.setAttribute(
            "role",
            "application"
        );

        const label =
            document.createElement(
                "div"
            );

        label.className =
            "game-stream-touchpad-label";

        label.textContent =
            "TOUCHPAD";

        touchpad.appendChild(
            label
        );

        document.body.appendChild(
            touchpad
        );

        return touchpad;
    }

    applyTouchpadStyles(
        touchpad
    ) {
        /*
         * Only apply fallback styles when the page does
         * not already provide a dedicated stylesheet.
         */
        if (
            !touchpad.style.position
        ) {
            touchpad.style.position =
                "fixed";
        }

        if (
            !touchpad.style.left
        ) {
            touchpad.style.left =
                "50%";
        }

        if (
            !touchpad.style.bottom
        ) {
            touchpad.style.bottom =
                "18px";
        }

        if (
            !touchpad.style.transform
        ) {
            touchpad.style.transform =
                "translateX(-50%)";
        }

        if (
            !touchpad.style.width
        ) {
            touchpad.style.width =
                "min(52vw, 420px)";
        }

        if (
            !touchpad.style.height
        ) {
            touchpad.style.height =
                "min(22vh, 180px)";
        }

        if (
            !touchpad.style.minWidth
        ) {
            touchpad.style.minWidth =
                "220px";
        }

        if (
            !touchpad.style.minHeight
        ) {
            touchpad.style.minHeight =
                "110px";
        }

        if (
            !touchpad.style.borderRadius
        ) {
            touchpad.style.borderRadius =
                "18px";
        }

        if (
            !touchpad.style.border
        ) {
            touchpad.style.border =
                "1px solid rgba(255,255,255,0.18)";
        }

        if (
            !touchpad.style.background
        ) {
            touchpad.style.background =
                "rgba(20,20,20,0.55)";
        }

        if (
            !touchpad.style.backdropFilter
        ) {
            touchpad.style.backdropFilter =
                "blur(8px)";
        }

        touchpad.style.touchAction =
            "none";

        touchpad.style.userSelect =
            "none";

        touchpad.style.webkitUserSelect =
            "none";

        touchpad.style.zIndex =
            "20";

        touchpad.style.display =
            "flex";

        touchpad.style.alignItems =
            "center";

        touchpad.style.justifyContent =
            "center";

        touchpad.style.overflow =
            "hidden";

        const label =
            touchpad.querySelector(
                ".game-stream-touchpad-label"
            );

        if (label) {
            label.style.pointerEvents =
                "none";

            label.style.opacity =
                "0.35";

            label.style.fontSize =
                "11px";

            label.style.letterSpacing =
                "2px";

            label.style.fontFamily =
                "sans-serif";
        }
    }

    createTouchpadSettings(
        touchpad
    ) {
        if (
            document.getElementById(
                "touchpad-settings"
            )
        ) {
            return;
        }

        const settings =
            document.createElement(
                "div"
            );

        settings.id =
            "touchpad-settings";

        settings.style.position =
            "fixed";

        settings.style.right =
            "18px";

        settings.style.bottom =
            "18px";

        settings.style.zIndex =
            "30";

        settings.style.background =
            "rgba(15,15,15,0.92)";

        settings.style.border =
            "1px solid rgba(255,255,255,0.18)";

        settings.style.borderRadius =
            "12px";

        settings.style.padding =
            "10px 12px";

        settings.style.fontFamily =
            "sans-serif";

        settings.style.fontSize =
            "12px";

        settings.style.color =
            "#fff";

        settings.style.minWidth =
            "155px";

        settings.style.display =
            "none";

        const title =
            document.createElement(
                "div"
            );

        title.textContent =
            "Touchpad";

        title.style.fontWeight =
            "600";

        title.style.marginBottom =
            "8px";

        settings.appendChild(
            title
        );

        const sensitivityRow =
            document.createElement(
                "label"
            );

        sensitivityRow.style.display =
            "flex";

        sensitivityRow.style.flexDirection =
            "column";

        sensitivityRow.style.gap =
            "5px";

        const sensitivityText =
            document.createElement(
                "span"
            );

        sensitivityText.textContent =
            "Sensitivity: 1.00";

        const sensitivity =
            document.createElement(
                "input"
            );

        sensitivity.type =
            "range";

        sensitivity.min =
            String(
                this.minMouseSensitivity
            );

        sensitivity.max =
            String(
                this.maxMouseSensitivity
            );

        sensitivity.step =
            "0.05";

        sensitivity.value =
            String(
                this.mouseSensitivity
            );

        sensitivity.addEventListener(
            "input",
            () => {
                this.setMouseSensitivity(
                    sensitivity.value
                );

                sensitivityText.textContent =
                    `Sensitivity: ${this.mouseSensitivity.toFixed(2)}`;
            }
        );

        sensitivityRow.appendChild(
            sensitivityText
        );

        sensitivityRow.appendChild(
            sensitivity
        );

        settings.appendChild(
            sensitivityRow
        );

        const buttons =
            document.createElement(
                "div"
            );

        buttons.style.display =
            "flex";

        buttons.style.gap =
            "5px";

        buttons.style.marginTop =
            "9px";

        const leftButton =
            this.createSettingsButton(
                "L Click",
                () => {
                    this.mouseClick(
                        "left"
                    );
                }
            );

        const rightButton =
            this.createSettingsButton(
                "R Click",
                () => {
                    this.mouseClick(
                        "right"
                    );
                }
            );

        const middleButton =
            this.createSettingsButton(
                "M Click",
                () => {
                    this.mouseClick(
                        "middle"
                    );
                }
            );

        buttons.appendChild(
            leftButton
        );

        buttons.appendChild(
            rightButton
        );

        buttons.appendChild(
            middleButton
        );

        settings.appendChild(
            buttons
        );

        const toggle =
            this.createSettingsButton(
                "Disable Touchpad",
                () => {
                    this.setTouchpadEnabled(
                        !this.touchpadEnabled
                    );

                    toggle.textContent =
                        this.touchpadEnabled
                            ? "Disable Touchpad"
                            : "Enable Touchpad";
                }
            );

        toggle.style.marginTop =
            "7px";

        toggle.style.width =
            "100%";

        settings.appendChild(
            toggle
        );

        document.body.appendChild(
            settings
        );

        /*
         * Small settings button.
         */
        const gear =
            document.createElement(
                "button"
            );

        gear.id =
            "touchpad-settings-toggle";

        gear.type =
            "button";

        gear.textContent =
            "⚙";

        gear.title =
            "Touchpad settings";

        gear.style.position =
            "fixed";

        gear.style.right =
            "18px";

        gear.style.bottom =
            "210px";

        gear.style.zIndex =
            "31";

        gear.style.width =
            "38px";

        gear.style.height =
            "38px";

        gear.style.borderRadius =
            "50%";

        gear.style.border =
            "1px solid rgba(255,255,255,0.2)";

        gear.style.background =
            "rgba(15,15,15,0.75)";

        gear.style.color =
            "#fff";

        gear.style.cursor =
            "pointer";

        gear.addEventListener(
            "click",
            (event) => {
                event.preventDefault();

                settings.style.display =
                    settings.style.display ===
                    "none"
                        ? "block"
                        : "none";
            }
        );

        document.body.appendChild(
            gear
        );
    }

    createSettingsButton(
        text,
        callback
    ) {
        const button =
            document.createElement(
                "button"
            );

        button.type =
            "button";

        button.textContent =
            text;

        button.style.flex =
            "1";

        button.style.border =
            "1px solid rgba(255,255,255,0.15)";

        button.style.borderRadius =
            "7px";

        button.style.background =
            "rgba(255,255,255,0.08)";

        button.style.color =
            "#fff";

        button.style.padding =
            "5px 6px";

        button.style.cursor =
            "pointer";

        button.addEventListener(
            "click",
            (event) => {
                event.preventDefault();

                callback();
            }
        );

        return button;
    }

    setMouseSensitivity(
        value
    ) {
        let sensitivity =
            Number(value);

        if (
            !Number.isFinite(
                sensitivity
            )
        ) {
            return;
        }

        sensitivity =
            Math.max(
                this.minMouseSensitivity,
                Math.min(
                    this.maxMouseSensitivity,
                    sensitivity
                )
            );

        this.mouseSensitivity =
            sensitivity;
    }

    setTouchpadEnabled(
        enabled
    ) {
        this.touchpadEnabled =
            Boolean(enabled);

        if (
            !this.touchpadEnabled
        ) {
            this.cancelTouchpadInteraction();
        }
    }

    cancelTouchpadInteraction() {
        window.clearTimeout(
            this.touchpadLongPressTimer
        );

        this.touchpadLongPressTimer =
            null;

        if (
            this.touchpadDragging
        ) {
            this.mouseUp(
                "left"
            );
        }

        this.touchpadDragging =
            false;

        this.touchpadMoved =
            false;

        this.touchpadPointerId =
            null;
    }

    // =============================================================
    // JOYSTICK
    // =============================================================

    bindJoystick() {
        const joystick =
            document.getElementById(
                "virtual-stick"
            );

        if (!joystick) {
            return;
        }

        const knob =
            joystick.querySelector(
                ".stick-knob"
            ) ||
            joystick.querySelector(
                ".joystick-knob"
            ) ||
            joystick.querySelector(
                ".joystick-handle"
            );

        if (!knob) {
            console.warn(
                "Joystick found, but no joystick knob found."
            );

            return;
        }

        const releaseJoystick =
            () => {
                if (
                    !this.joystickActive
                ) {
                    return;
                }

                this.joystickActive =
                    false;

                this.joystickPointerId =
                    null;

                this.releaseJoystickKeys();

                knob.style.transform =
                    "translate(-50%, -50%)";
            };

        joystick.addEventListener(
            "pointerdown",
            (event) => {
                if (!this.enabled) {
                    return;
                }

                this.joystickActive =
                    true;

                this.joystickPointerId =
                    event.pointerId;

                try {
                    joystick.setPointerCapture(
                        event.pointerId
                    );
                } catch (_) {
                    // Ignore.
                }

                this.updateJoystick(
                    joystick,
                    knob,
                    event
                );

                event.preventDefault();
            },
            {
                passive: false
            }
        );

        joystick.addEventListener(
            "pointermove",
            (event) => {
                if (
                    !this.joystickActive ||
                    event.pointerId !==
                        this.joystickPointerId
                ) {
                    return;
                }

                this.updateJoystick(
                    joystick,
                    knob,
                    event
                );

                event.preventDefault();
            },
            {
                passive: false
            }
        );

        joystick.addEventListener(
            "pointerup",
            releaseJoystick,
            {
                passive: false
            }
        );

        joystick.addEventListener(
            "pointercancel",
            releaseJoystick,
            {
                passive: false
            }
        );
    }

    updateJoystick(
        joystick,
        knob,
        event
    ) {
        const rect =
            joystick.getBoundingClientRect();

        const centerX =
            rect.left +
            rect.width / 2;

        const centerY =
            rect.top +
            rect.height / 2;

        let dx =
            event.clientX -
            centerX;

        let dy =
            event.clientY -
            centerY;

        const maxDistance =
            Math.min(
                rect.width,
                rect.height
            ) * 0.35;

        const distance =
            Math.sqrt(
                dx * dx +
                dy * dy
            );

        if (
            distance > maxDistance
        ) {
            const scale =
                maxDistance /
                distance;

            dx *= scale;
            dy *= scale;
        }

        knob.style.transform =
            `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

        const threshold =
            maxDistance * 0.25;

        let horizontal = 0;
        let vertical = 0;

        if (
            Math.abs(dx) >= threshold
        ) {
            horizontal =
                dx < 0
                    ? -1
                    : 1;
        }

        if (
            Math.abs(dy) >= threshold
        ) {
            vertical =
                dy < 0
                    ? -1
                    : 1;
        }

        this.updateJoystickKeys(
            horizontal,
            vertical
        );
    }

    updateJoystickKeys(
        horizontal,
        vertical
    ) {
        const desired =
            new Set();

        if (
            horizontal < 0
        ) {
            desired.add("a");
        } else if (
            horizontal > 0
        ) {
            desired.add("d");
        }

        if (
            vertical < 0
        ) {
            desired.add("w");
        } else if (
            vertical > 0
        ) {
            desired.add("s");
        }

        for (
            const key of [
                "w",
                "a",
                "s",
                "d"
            ]
        ) {
            const active =
                this.activeKeys.has(
                    key
                );

            const shouldBeActive =
                desired.has(key);

            if (
                shouldBeActive &&
                !active
            ) {
                this.keyDown(key);
            } else if (
                !shouldBeActive &&
                active
            ) {
                this.keyUp(key);
            }
        }
    }

    releaseJoystickKeys() {
        for (
            const key of [
                "w",
                "a",
                "s",
                "d"
            ]
        ) {
            if (
                this.activeKeys.has(
                    key
                )
            ) {
                this.keyUp(key);
            }
        }
    }

    // =============================================================
    // ACTION BUTTONS
    // =============================================================

    bindActionButtons() {
        const buttons =
            document.querySelectorAll(
                ".action-button[data-key], [data-control-key]"
            );

        buttons.forEach(
            (button) => {
                const key =
                    button.dataset.controlKey ||
                    button.dataset.key;

                if (!key) {
                    return;
                }

                this.bindVirtualKeyButton(
                    button,
                    key
                );
            }
        );

        this.bindButtonById(
            "action-x",
            "x"
        );

        this.bindButtonById(
            "action-z",
            "z"
        );

        this.bindButtonById(
            "action-space",
            "space"
        );

        this.bindButtonById(
            "button-x",
            "x"
        );

        this.bindButtonById(
            "button-z",
            "z"
        );

        this.bindButtonById(
            "button-space",
            "space"
        );
    }

    bindButtonById(
        id,
        key
    ) {
        const button =
            document.getElementById(
                id
            );

        if (!button) {
            return;
        }

        if (
            button.dataset
                .gameControlsBound
        ) {
            return;
        }

        this.bindVirtualKeyButton(
            button,
            key
        );
    }

    bindVirtualKeyButton(
        button,
        key
    ) {
        if (!button) {
            return;
        }

        if (
            button.dataset
                .gameControlsBound
        ) {
            return;
        }

        button.dataset
            .gameControlsBound =
            "true";

        const press =
            (event) => {
                event.preventDefault();

                this.keyDown(key);
            };

        const release =
            (event) => {
                event.preventDefault();

                this.keyUp(key);
            };

        button.addEventListener(
            "pointerdown",
            press,
            {
                passive: false
            }
        );

        button.addEventListener(
            "pointerup",
            release,
            {
                passive: false
            }
        );

        button.addEventListener(
            "pointercancel",
            release,
            {
                passive: false
            }
        );

        button.addEventListener(
            "pointerleave",
            release,
            {
                passive: false
            }
        );

        button.addEventListener(
            "click",
            (event) => {
                event.preventDefault();
            }
        );
    }

    // =============================================================
    // CONTROLLER
    // =============================================================

    controllerButtonDown(
        button,
        controller = "default"
    ) {
        if (!button) {
            return false;
        }

        const normalized =
            String(button)
                .trim()
                .toLowerCase();

        const identifier =
            `${controller}:${normalized}`;

        if (
            this.activeControllerButtons
                .has(identifier)
        ) {
            return true;
        }

        this.activeControllerButtons.add(
            identifier
        );

        return this.sendInput({
            event_type: "controller",
            action: "button_down",
            controller: controller,
            button: normalized
        });
    }

    controllerButtonUp(
        button,
        controller = "default"
    ) {
        if (!button) {
            return false;
        }

        const normalized =
            String(button)
                .trim()
                .toLowerCase();

        const identifier =
            `${controller}:${normalized}`;

        this.activeControllerButtons.delete(
            identifier
        );

        return this.sendInput({
            event_type: "controller",
            action: "button_up",
            controller: controller,
            button: normalized
        });
    }

    controllerAxis(
        axis,
        value,
        controller = "default"
    ) {
        if (!axis) {
            return false;
        }

        let normalizedValue =
            Number(value);

        if (
            !Number.isFinite(
                normalizedValue
            )
        ) {
            return false;
        }

        normalizedValue =
            Math.max(
                -1,
                Math.min(
                    1,
                    normalizedValue
                )
            );

        return this.sendInput({
            event_type: "controller",
            action: "axis",
            controller: controller,
            axis: String(axis)
                .trim()
                .toLowerCase(),
            value: normalizedValue
        });
    }

    // =============================================================
    // CLEANUP
    // =============================================================

    bindCleanupEvents() {
        window.addEventListener(
            "blur",
            this.handleWindowBlur
        );

        document.addEventListener(
            "visibilitychange",
            this.handleVisibilityChange
        );

        window.addEventListener(
            "beforeunload",
            this.handleBeforeUnload
        );
    }

    handleWindowBlur() {
        this.resetAllInputs();
    }

    handleVisibilityChange() {
        if (
            document.visibilityState !==
            "visible"
        ) {
            this.resetAllInputs();
        }
    }

    handleBeforeUnload() {
        this.resetAllInputs();
    }

    resetAllInputs() {
        const keys =
            Array.from(
                this.activeKeys
            );

        for (
            const key of keys
        ) {
            this.keyUp(key);
        }

        const mouseButtons =
            Array.from(
                this.activeMouseButtons
            );

        for (
            const button of mouseButtons
        ) {
            this.mouseUp(button);
        }

        const controllerButtons =
            Array.from(
                this.activeControllerButtons
            );

        for (
            const identifier of
            controllerButtons
        ) {
            const separator =
                identifier.indexOf(":");

            const controller =
                separator >= 0
                    ? identifier.slice(
                        0,
                        separator
                    )
                    : "default";

            const button =
                separator >= 0
                    ? identifier.slice(
                        separator + 1
                    )
                    : identifier;

            this.controllerButtonUp(
                button,
                controller
            );
        }

        this.cancelTouchpadInteraction();

        this.releaseJoystickKeys();

        this.joystickActive =
            false;

        this.joystickPointerId =
            null;
    }

    releaseAllMouseButtons() {
        const buttons =
            Array.from(
                this.activeMouseButtons
            );

        for (
            const button of buttons
        ) {
            this.mouseUp(button);
        }
    }

    // =============================================================
    // ENABLE / DISABLE
    // =============================================================

    disable() {
        this.resetAllInputs();

        this.enabled = false;
    }

    enable() {
        this.enabled = true;
    }

    // =============================================================
    // DESTROY
    // =============================================================

    destroy() {
        this.resetAllInputs();

        window.removeEventListener(
            "keydown",
            this.handleKeyDown
        );

        window.removeEventListener(
            "keyup",
            this.handleKeyUp
        );

        window.removeEventListener(
            "blur",
            this.handleWindowBlur
        );

        document.removeEventListener(
            "visibilitychange",
            this.handleVisibilityChange
        );

        window.removeEventListener(
            "beforeunload",
            this.handleBeforeUnload
        );

        this.enabled = false;
    }
}

/*
 * main.js expects GameControls to be globally available.
 */
window.GameControls =
    GameControls;

/*
 * Touch and keyboard controls for the Game Stream client.
 *
 * This module translates:
 * - Virtual joystick movement into keyboard input.
 * - Touch action buttons into keyboard input.
 * - Physical keyboard input into keyboard input.
 *
 * All input is sent through the WebRTC DataChannel exposed by
 * WebRTCClient.
 */

"use strict";

class GameControls {
    constructor() {
        this.webrtc = null;

        this.virtualStick = null;
        this.stickKnob = null;
        this.actionButtons = [];

        this.activeKeys = new Set();
        this.keyToDirection = new Map();

        this.stickPointerId = null;
        this.stickCenterX = 0;
        this.stickCenterY = 0;
        this.stickRadius = 0;

        this.initialized = false;
    }

    initialize(webrtcClient) {
        if (!webrtcClient) {
            throw new Error(
                "A WebRTC client is required for game controls."
            );
        }

        this.webrtc = webrtcClient;

        this.virtualStick =
            document.getElementById("virtual-stick");

        this.stickKnob =
            document.getElementById("stick-knob");

        this.actionButtons =
            Array.from(
                document.querySelectorAll(".action-button")
            );

        if (!this.virtualStick || !this.stickKnob) {
            throw new Error(
                "Virtual joystick elements were not found."
            );
        }

        this.configureVirtualStick();
        this.configureActionButtons();
        this.configureKeyboard();

        this.initialized = true;
    }

    configureVirtualStick() {
        this.virtualStick.addEventListener(
            "pointerdown",
            (event) => {
                this.startStick(event);
            }
        );

        window.addEventListener(
            "pointermove",
            (event) => {
                this.moveStick(event);
            }
        );

        window.addEventListener(
            "pointerup",
            (event) => {
                this.endStick(event);
            }
        );

        window.addEventListener(
            "pointercancel",
            (event) => {
                this.endStick(event);
            }
        );

        window.addEventListener(
            "blur",
            () => {
                this.resetAllInputs();
            }
        );
    }

    configureActionButtons() {
        for (const button of this.actionButtons) {
            const key = button.dataset.key;

            if (!key) {
                continue;
            }

            button.addEventListener(
                "pointerdown",
                (event) => {
                    event.preventDefault();

                    button.setPointerCapture(
                        event.pointerId
                    );

                    this.pressKey(key);

                    button.classList.add("active");
                }
            );

            button.addEventListener(
                "pointerup",
                (event) => {
                    event.preventDefault();

                    this.releaseKey(key);

                    button.classList.remove("active");
                }
            );

            button.addEventListener(
                "pointercancel",
                () => {
                    this.releaseKey(key);

                    button.classList.remove("active");
                }
            );

            button.addEventListener(
                "lostpointercapture",
                () => {
                    this.releaseKey(key);

                    button.classList.remove("active");
                }
            );
        }
    }

    configureKeyboard() {
        window.addEventListener(
            "keydown",
            (event) => {
                if (this.shouldIgnoreKeyboardEvent(event)) {
                    return;
                }

                event.preventDefault();

                const key = this.normalizeKeyboardKey(
                    event.key
                );

                if (!key) {
                    return;
                }

                this.pressKey(key);
            }
        );

        window.addEventListener(
            "keyup",
            (event) => {
                if (this.shouldIgnoreKeyboardEvent(event)) {
                    return;
                }

                event.preventDefault();

                const key = this.normalizeKeyboardKey(
                    event.key
                );

                if (!key) {
                    return;
                }

                this.releaseKey(key);
            }
        );
    }

    shouldIgnoreKeyboardEvent(event) {
        const target = event.target;

        if (!target) {
            return false;
        }

        const tagName =
            target.tagName
                ? target.tagName.toLowerCase()
                : "";

        return (
            tagName === "input" ||
            tagName === "textarea" ||
            tagName === "select"
        );
    }

    startStick(event) {
        if (
            this.stickPointerId !== null &&
            this.stickPointerId !== event.pointerId
        ) {
            return;
        }

        event.preventDefault();

        this.stickPointerId = event.pointerId;

        this.virtualStick.setPointerCapture(
            event.pointerId
        );

        const rect =
            this.virtualStick.getBoundingClientRect();

        this.stickCenterX =
            rect.left + rect.width / 2;

        this.stickCenterY =
            rect.top + rect.height / 2;

        this.stickRadius =
            Math.min(rect.width, rect.height) / 2;

        this.updateStick(
            event.clientX,
            event.clientY
        );
    }

    moveStick(event) {
        if (
            this.stickPointerId === null ||
            event.pointerId !== this.stickPointerId
        ) {
            return;
        }

        event.preventDefault();

        this.updateStick(
            event.clientX,
            event.clientY
        );
    }

    endStick(event) {
        if (
            this.stickPointerId === null ||
            event.pointerId !== this.stickPointerId
        ) {
            return;
        }

        event.preventDefault();

        this.releaseDirectionKeys();

        this.stickPointerId = null;

        this.resetStickPosition();

        try {
            this.virtualStick.releasePointerCapture(
                event.pointerId
            );
        } catch (_) {
            // Pointer capture may already have been released.
        }
    }

    updateStick(clientX, clientY) {
        const dx =
            clientX - this.stickCenterX;

        const dy =
            clientY - this.stickCenterY;

        const distance =
            Math.sqrt(
                dx * dx +
                dy * dy
            );

        const maxDistance =
            this.stickRadius * 0.65;

        let normalizedX = 0;
        let normalizedY = 0;

        if (distance > 0) {
            const scale =
                Math.min(
                    distance,
                    maxDistance
                ) / distance;

            const limitedX =
                dx * scale;

            const limitedY =
                dy * scale;

            normalizedX =
                limitedX / maxDistance;

            normalizedY =
                limitedY / maxDistance;

            this.setStickVisualPosition(
                limitedX,
                limitedY
            );
        } else {
            this.setStickVisualPosition(
                0,
                0
            );
        }

        this.updateDirectionKeys(
            normalizedX,
            normalizedY
        );
    }

    updateDirectionKeys(x, y) {
        const deadZone = 0.25;

        const nextDirections =
            new Set();

        if (y < -deadZone) {
            nextDirections.add("w");
        }

        if (y > deadZone) {
            nextDirections.add("s");
        }

        if (x < -deadZone) {
            nextDirections.add("a");
        }

        if (x > deadZone) {
            nextDirections.add("d");
        }

        for (const key of this.keyToDirection.keys()) {
            if (!nextDirections.has(key)) {
                this.releaseKey(key);
            }
        }

        for (const key of nextDirections) {
            if (!this.keyToDirection.has(key)) {
                this.pressKey(key);
            }
        }

        this.keyToDirection.clear();

        for (const key of nextDirections) {
            this.keyToDirection.set(
                key,
                true
            );
        }
    }

    releaseDirectionKeys() {
        for (const key of this.keyToDirection.keys()) {
            this.releaseKey(key);
        }

        this.keyToDirection.clear();
    }

    setStickVisualPosition(x, y) {
        this.stickKnob.style.transform =
            `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    }

    resetStickPosition() {
        this.stickKnob.style.transform =
            "translate(-50%, -50%)";
    }

    pressKey(key) {
        const normalizedKey =
            this.normalizeControlKey(key);

        if (!normalizedKey) {
            return;
        }

        if (this.activeKeys.has(normalizedKey)) {
            return;
        }

        const sent =
            this.webrtc.sendInput({
                event_type: "keyboard",
                action: "down",
                key: normalizedKey
            });

        if (sent) {
            this.activeKeys.add(normalizedKey);
        }
    }

    releaseKey(key) {
        const normalizedKey =
            this.normalizeControlKey(key);

        if (!normalizedKey) {
            return;
        }

        if (!this.activeKeys.has(normalizedKey)) {
            return;
        }

        this.webrtc.sendInput({
            event_type: "keyboard",
            action: "up",
            key: normalizedKey
        });

        this.activeKeys.delete(
            normalizedKey
        );
    }

    resetAllInputs() {
        for (const key of this.activeKeys) {
            this.webrtc.sendInput({
                event_type: "keyboard",
                action: "up",
                key: key
            });
        }

        this.activeKeys.clear();

        this.releaseDirectionKeys();

        this.stickPointerId = null;

        this.resetStickPosition();

        for (const button of this.actionButtons) {
            button.classList.remove("active");
        }
    }

    normalizeControlKey(key) {
        if (typeof key !== "string") {
            return null;
        }

        const normalized =
            key.trim().toLowerCase();

        if (!normalized) {
            return null;
        }

        const supportedKeys = new Set([
            "w",
            "a",
            "s",
            "d",
            "x",
            "z",
            "space",
            "enter",
            "escape",
            "shift",
            "ctrl",
            "alt",
            "q",
            "e",
            "r",
            "f",
            "c",
            "v"
        ]);

        if (supportedKeys.has(normalized)) {
            return normalized;
        }

        return null;
    }

    normalizeKeyboardKey(key) {
        if (typeof key !== "string") {
            return null;
        }

        const normalized =
            key.toLowerCase();

        const keyMap = {
            " ": "space",
            "escape": "escape",
            "enter": "enter",
            "shift": "shift",
            "control": "ctrl",
            "alt": "alt"
        };

        const mapped =
            keyMap[normalized] || normalized;

        return this.normalizeControlKey(
            mapped
        );
    }
}

window.GameControls = GameControls;
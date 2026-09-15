/*
 * Main application controller for the Game Stream client.
 *
 * This module connects the UI, WebRTC client, game controls,
 * and standalone touchpad.
 * It is the browser application's main entry point.
 */

"use strict";

class GameStreamApp {
    constructor() {
        this.ui = null;
        this.webrtc = null;
        this.controls = null;
        this.touchpad = null;

        this.connecting = false;
        this.initialized = false;
    }

    initialize() {
        if (this.initialized) {
            return;
        }

        this.ui = new GameUI();
        this.ui.initialize();

        const videoElement =
            document.getElementById("game-video");

        if (!(videoElement instanceof HTMLVideoElement)) {
            throw new Error(
                "Game video element was not found."
            );
        }

        this.webrtc = new WebRTCClient();
        this.webrtc.initialize(videoElement);

        this.controls = new GameControls();
        this.controls.initialize(this.webrtc);

        this.touchpad = new Touchpad(
            this.webrtc
        );

        this.touchpad.initialize();

        this.configureWebRTCEvents();
        this.configureUIEvents();

        this.initialized = true;

        this.ui.setConnectionStatus(
            "Ready to connect to gaming PC."
        );

        console.info(
            "Game Stream client initialized."
        );
    }

    configureWebRTCEvents() {
        this.webrtc.onConnectionStateChange =
            (state) => {
                this.handleConnectionStateChange(
                    state
                );
            };

        this.webrtc.onVideoReady =
            () => {
                this.handleVideoReady();
            };

        this.webrtc.onError =
            (error) => {
                this.handleWebRTCError(error);
            };
    }

    configureUIEvents() {
        const connectButton =
            document.getElementById(
                "connect-button"
            );

        const retryButton =
            document.getElementById(
                "retry-button"
            );

        if (!connectButton || !retryButton) {
            throw new Error(
                "Connection control buttons were not found."
            );
        }

        connectButton.addEventListener(
            "click",
            () => {
                this.connect();
            }
        );

        retryButton.addEventListener(
            "click",
            () => {
                this.connect();
            }
        );
    }

    async connect() {
        if (!this.initialized) {
            return;
        }

        if (this.connecting) {
            return;
        }

        if (this.webrtc.isConnected()) {
            return;
        }

        this.connecting = true;

        this.controls.resetAllInputs();

        if (this.touchpad) {
            this.touchpad.hide();
        }

        this.ui.showConnecting();

        try {
            await this.webrtc.connect();

            /*
             * WebRTC connection establishment may complete before
             * the media track has actually started rendering.
             * The video-ready callback will finish the UI transition.
             */
            this.ui.setLoadingMessage(
                "Waiting for game video..."
            );

        } catch (error) {
            console.error(
                "Game Stream connection failed:",
                error
            );

            this.handleConnectionFailure(
                this.getErrorMessage(error)
            );
        } finally {
            this.connecting = false;
        }
    }

    async disconnect() {
        if (!this.webrtc) {
            return;
        }

        this.controls.resetAllInputs();

        if (this.touchpad) {
            this.touchpad.hide();
        }

        await this.webrtc.disconnect();

        this.connecting = false;

        this.ui.showDisconnected();
    }

    handleConnectionStateChange(state) {
        switch (state) {
            case "connected":
                this.ui.setConnectionStatus(
                    "Connected to gaming PC."
                );

                this.ui.showGame();
                this.ui.hideError();

                break;

            case "connecting":
            case "new":
                if (!this.connecting) {
                    this.ui.showConnecting();
                }

                break;

            case "disconnected":
                this.controls.resetAllInputs();

                if (this.touchpad) {
                    this.touchpad.hide();
                }

                this.ui.showConnectionError(
                    "The connection to the gaming PC was lost."
                );

                break;

            case "failed":
                this.controls.resetAllInputs();

                if (this.touchpad) {
                    this.touchpad.hide();
                }

                this.ui.showConnectionError(
                    "WebRTC connection failed."
                );

                break;

            case "closed":
                this.controls.resetAllInputs();

                if (this.touchpad) {
                    this.touchpad.hide();
                }

                if (!this.connecting) {
                    this.ui.showDisconnected();
                }

                break;

            default:
                console.info(
                    "Unhandled WebRTC state:",
                    state
                );
        }
    }

    handleVideoReady() {
        this.ui.showConnected();

        this.ui.setConnectionStatus(
            "Connected to gaming PC."
        );

        if (this.touchpad) {
            this.touchpad.show();
        }

        console.info(
            "Game video is ready."
        );
    }

    handleWebRTCError(error) {
        console.error(
            "WebRTC client error:",
            error
        );

        if (this.connecting) {
            this.handleConnectionFailure(
                this.getErrorMessage(error)
            );
        }
    }

    handleConnectionFailure(message) {
        this.connecting = false;

        this.controls.resetAllInputs();

        if (this.touchpad) {
            this.touchpad.hide();
        }

        this.ui.showConnectionError(
            message ||
            "Unable to connect to the gaming PC."
        );
    }

    getErrorMessage(error) {
        if (!error) {
            return "Unable to connect to the gaming PC.";
        }

        if (
            typeof error === "string" &&
            error.trim()
        ) {
            return error;
        }

        if (
            error instanceof Error &&
            error.message
        ) {
            return error.message;
        }

        if (
            typeof error.message === "string" &&
            error.message.trim()
        ) {
            return error.message;
        }

        return "Unable to connect to the gaming PC.";
    }
}

function initializeGameStream() {
    try {
        const app =
            new GameStreamApp();

        app.initialize();

        window.gameStreamApp = app;

    } catch (error) {
        console.error(
            "Failed to initialize Game Stream:",
            error
        );

        const status =
            document.getElementById(
                "connection-status"
            );

        if (status) {
            status.textContent =
                "Failed to initialize Game Stream.";
        }

        const connectButton =
            document.getElementById(
                "connect-button"
            );

        if (connectButton) {
            connectButton.disabled = true;
        }
    }
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeGameStream
    );
} else {
    initializeGameStream();
}
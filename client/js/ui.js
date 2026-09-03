/*
 * User-interface management for the Game Stream client.
 *
 * This module controls:
 * - Connection status messages.
 * - Loading and error overlays.
 * - Showing and hiding the game screen.
 * - Connect and retry button state.
 */

"use strict";

class GameUI {
    constructor() {
        this.connectionPanel = null;
        this.connectionStatus = null;
        this.connectButton = null;

        this.gameContainer = null;
        this.loadingOverlay = null;
        this.loadingMessage = null;

        this.errorOverlay = null;
        this.errorMessage = null;
        this.retryButton = null;

        this.initialized = false;
    }

    initialize() {
        this.connectionPanel =
            document.getElementById("connection-panel");

        this.connectionStatus =
            document.getElementById("connection-status");

        this.connectButton =
            document.getElementById("connect-button");

        this.gameContainer =
            document.getElementById("game-container");

        this.loadingOverlay =
            document.getElementById("loading-overlay");

        this.loadingMessage =
            document.getElementById("loading-message");

        this.errorOverlay =
            document.getElementById("error-overlay");

        this.errorMessage =
            document.getElementById("error-message");

        this.retryButton =
            document.getElementById("retry-button");

        this.validateElements();

        this.initialized = true;
    }

    validateElements() {
        const requiredElements = [
            ["connection-panel", this.connectionPanel],
            ["connection-status", this.connectionStatus],
            ["connect-button", this.connectButton],
            ["game-container", this.gameContainer],
            ["loading-overlay", this.loadingOverlay],
            ["loading-message", this.loadingMessage],
            ["error-overlay", this.errorOverlay],
            ["error-message", this.errorMessage],
            ["retry-button", this.retryButton]
        ];

        const missingElements =
            requiredElements
                .filter(([, element]) => !element)
                .map(([id]) => id);

        if (missingElements.length > 0) {
            throw new Error(
                `Missing UI elements: ${missingElements.join(", ")}`
            );
        }
    }

    setConnectionStatus(message) {
        if (!this.connectionStatus) {
            return;
        }

        this.connectionStatus.textContent = message;
    }

    setConnectButtonEnabled(enabled) {
        if (!this.connectButton) {
            return;
        }

        this.connectButton.disabled = !enabled;

        this.connectButton.textContent =
            enabled
                ? "Connect"
                : "Connecting...";
    }

    setRetryButtonEnabled(enabled) {
        if (!this.retryButton) {
            return;
        }

        this.retryButton.disabled = !enabled;

        this.retryButton.textContent =
            enabled
                ? "Retry"
                : "Retrying...";
    }

    showConnectionPanel() {
        if (!this.connectionPanel) {
            return;
        }

        this.connectionPanel.classList.remove(
            "hidden"
        );
    }

    hideConnectionPanel() {
        if (!this.connectionPanel) {
            return;
        }

        this.connectionPanel.classList.add(
            "hidden"
        );
    }

    showGame() {
        if (!this.gameContainer) {
            return;
        }

        this.gameContainer.classList.remove(
            "hidden"
        );
    }

    hideGame() {
        if (!this.gameContainer) {
            return;
        }

        this.gameContainer.classList.add(
            "hidden"
        );
    }

    showLoading(message = "Connecting to game...") {
        if (!this.loadingOverlay) {
            return;
        }

        this.setLoadingMessage(message);

        this.loadingOverlay.classList.remove(
            "hidden"
        );
    }

    hideLoading() {
        if (!this.loadingOverlay) {
            return;
        }

        this.loadingOverlay.classList.add(
            "hidden"
        );
    }

    setLoadingMessage(message) {
        if (!this.loadingMessage) {
            return;
        }

        this.loadingMessage.textContent = message;
    }

    showError(message) {
        if (!this.errorOverlay) {
            return;
        }

        this.setErrorMessage(message);

        this.errorOverlay.classList.remove(
            "hidden"
        );
    }

    hideError() {
        if (!this.errorOverlay) {
            return;
        }

        this.errorOverlay.classList.add(
            "hidden"
        );
    }

    setErrorMessage(message) {
        if (!this.errorMessage) {
            return;
        }

        this.errorMessage.textContent = message;
    }

    showConnected() {
        this.hideConnectionPanel();
        this.showGame();
        this.hideLoading();
        this.hideError();
    }

    showConnecting() {
        this.showConnectionPanel();
        this.setConnectionStatus(
            "Connecting to gaming PC..."
        );

        this.setConnectButtonEnabled(false);

        this.hideError();
        this.showGame();
        this.showLoading(
            "Establishing WebRTC connection..."
        );
    }

    showDisconnected() {
        this.showConnectionPanel();
        this.setConnectionStatus(
            "Disconnected from gaming PC."
        );

        this.setConnectButtonEnabled(true);

        this.hideLoading();
        this.hideGame();
    }

    showConnectionError(message) {
        this.showGame();
        this.hideLoading();

        this.setConnectionStatus(
            "Unable to connect to gaming PC."
        );

        this.setErrorMessage(
            message ||
            "Unable to connect to the gaming PC."
        );

        this.showError(
            message ||
            "Unable to connect to the gaming PC."
        );

        this.setConnectButtonEnabled(true);
        this.setRetryButtonEnabled(true);
    }
}

window.GameUI = GameUI;
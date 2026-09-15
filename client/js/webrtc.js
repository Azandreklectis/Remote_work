/*
 * WebRTC client for the Game Stream browser application.
 *
 * This module:
 * - Creates the RTCPeerConnection.
 * - Requests the remote video track.
 * - Creates the input DataChannel.
 * - Exchanges the SDP offer/answer with the server.
 * - Reports connection state changes to the UI layer.
 *
 * Diagnostics:
 * - WebRTC RTT
 * - Delivered/presented video FPS
 * - Video RTP jitter
 * - Video packet loss
 * - Video end-to-end latency
 */

"use strict";

class WebRTCClient {
    constructor() {
        this.peerConnection = null;
        this.inputChannel = null;

        this.videoElement = null;

        this.onConnectionStateChange = null;
        this.onVideoReady = null;
        this.onError = null;

        this.connected = false;

        // ---------------------------------------------------------
        // RTT measurement state
        // ---------------------------------------------------------

        this.rttTimer = null;
        this.rttOverlay = null;
        this.rttSamples = [];
        this.lastRtt = null;

        // ---------------------------------------------------------
        // FPS measurement state
        // ---------------------------------------------------------

        this.fpsTimer = null;
        this.fpsOverlay = null;
        this.fpsSamples = [];

        this.videoFrameCallbackId = null;
        this.videoFrameMeasurementActive = false;

        this.presentedFrames = 0;
        this.lastPresentedFrames = null;
        this.lastFpsMeasurementTime = null;

        this.decodedFrames = 0;

        // ---------------------------------------------------------
        // Jitter measurement state
        // ---------------------------------------------------------

        this.jitterSamples = [];
        this.lastJitter = null;

        // ---------------------------------------------------------
        // Packet loss measurement state
        // ---------------------------------------------------------

        this.packetLossSamples = [];
        this.lastPacketLoss = null;

        // ---------------------------------------------------------
        // End-to-end latency measurement state
        // ---------------------------------------------------------

        this.e2eLatencySamples = [];
        this.lastE2eLatency = null;
    }

    initialize(videoElement) {
        if (!(videoElement instanceof HTMLVideoElement)) {
            throw new Error("A valid video element is required.");
        }

        this.videoElement = videoElement;
    }

    async connect() {
        if (!this.videoElement) {
            throw new Error(
                "WebRTCClient must be initialized with a video element."
            );
        }

        if (
            this.peerConnection &&
            this.peerConnection.connectionState !== "closed"
        ) {
            await this.disconnect();
        }

        this.connected = false;

        try {
            this.peerConnection = new RTCPeerConnection({
                iceServers: [
                    {
                        urls: "stun:stun.l.google.com:19302"
                    }
                ]
            });

            this.configurePeerConnection();

            /*
             * The MVP uses a client-created DataChannel for remote input.
             * The server listens for the "datachannel" event.
             */
            this.inputChannel = this.peerConnection.createDataChannel(
                "input",
                {
                    ordered: true
                }
            );

            this.configureInputChannel();

            /*
             * We only need to receive video from the gaming PC.
             */
            this.peerConnection.addTransceiver("video", {
                direction: "recvonly"
            });

            const offer = await this.peerConnection.createOffer();

            await this.peerConnection.setLocalDescription(offer);

            await this.waitForIceGathering();

            const localDescription =
                this.peerConnection.localDescription;

            if (!localDescription) {
                throw new Error(
                    "Failed to create a local WebRTC description."
                );
            }

            const response = await fetch("/webrtc/offer", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    type: localDescription.type,
                    sdp: localDescription.sdp
                })
            });

            if (!response.ok) {
                let errorMessage =
                    `Server returned HTTP ${response.status}.`;

                try {
                    const errorData = await response.json();

                    if (errorData.error) {
                        errorMessage = errorData.error;
                    }
                } catch (_) {
                    // Keep the HTTP status message.
                }

                throw new Error(errorMessage);
            }

            const answer = await response.json();

            if (
                !answer ||
                answer.type !== "answer" ||
                typeof answer.sdp !== "string"
            ) {
                throw new Error(
                    "Server returned an invalid WebRTC answer."
                );
            }

            await this.peerConnection.setRemoteDescription(
                new RTCSessionDescription({
                    type: answer.type,
                    sdp: answer.sdp
                })
            );

            return true;
        } catch (error) {
            this.handleError(error);

            await this.disconnect();

            throw error;
        }
    }

    configurePeerConnection() {
        if (!this.peerConnection) {
            return;
        }

        this.peerConnection.ontrack = (event) => {
            this.handleRemoteTrack(event);
        };

        this.peerConnection.onconnectionstatechange = () => {
            if (!this.peerConnection) {
                return;
            }

            this.handleConnectionStateChange(
                this.peerConnection.connectionState
            );
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            if (!this.peerConnection) {
                return;
            }

            const state =
                this.peerConnection.iceConnectionState;

            console.info(
                "WebRTC ICE connection state:",
                state
            );

            if (state === "failed") {
                this.handleError(
                    new Error("WebRTC ICE connection failed.")
                );
            }
        };

        this.peerConnection.onicecandidateerror = (event) => {
            console.warn(
                "WebRTC ICE candidate error:",
                event
            );
        };
    }

    configureInputChannel() {
        if (!this.inputChannel) {
            return;
        }

        this.inputChannel.onopen = () => {
            console.info("WebRTC input DataChannel opened.");

            this.startRttMeasurement();
            this.startFpsMeasurement();
            this.startNetworkDiagnostics();
        };

        this.inputChannel.onclose = () => {
            console.info("WebRTC input DataChannel closed.");

            this.stopRttMeasurement();
            this.stopFpsMeasurement();
            this.stopNetworkDiagnostics();
        };

        this.inputChannel.onerror = (event) => {
            console.error(
                "WebRTC input DataChannel error:",
                event
            );
        };
    }

    handleRemoteTrack(event) {
        if (!this.videoElement) {
            return;
        }

        if (!event.streams || event.streams.length === 0) {
            console.warn(
                "Received video track without a MediaStream."
            );
            return;
        }

        const stream = event.streams[0];

        this.videoElement.srcObject = stream;

        /*
         * Start actual presented-frame measurement.
         */
        this.startPresentedFrameMeasurement();

        const playPromise = this.videoElement.play();

        if (playPromise instanceof Promise) {
            playPromise
                .then(() => {
                    if (typeof this.onVideoReady === "function") {
                        this.onVideoReady();
                    }
                })
                .catch((error) => {
                    console.warn(
                        "Browser prevented automatic video playback:",
                        error
                    );

                    if (typeof this.onVideoReady === "function") {
                        this.onVideoReady();
                    }
                });
        } else if (typeof this.onVideoReady === "function") {
            this.onVideoReady();
        }
    }

    handleConnectionStateChange(state) {
        console.info(
            "WebRTC connection state:",
            state
        );

        this.connected =
            state === "connected";

        if (state === "connected") {
            this.startRttMeasurement();
            this.startFpsMeasurement();
            this.startNetworkDiagnostics();
        } else if (
            state === "failed" ||
            state === "disconnected" ||
            state === "closed"
        ) {
            this.stopRttMeasurement();
            this.stopFpsMeasurement();
            this.stopNetworkDiagnostics();
        }

        if (typeof this.onConnectionStateChange === "function") {
            this.onConnectionStateChange(state);
        }
    }

    // =============================================================
    // RTT MEASUREMENT
    // =============================================================

    startRttMeasurement() {
        if (this.rttTimer !== null) {
            return;
        }

        this.createRttOverlay();

        this.updateRtt();

        this.rttTimer = window.setInterval(() => {
            this.updateRtt();
        }, 1000);
    }

    stopRttMeasurement() {
        if (this.rttTimer !== null) {
            window.clearInterval(this.rttTimer);
            this.rttTimer = null;
        }

        if (this.rttOverlay) {
            this.rttOverlay.remove();
            this.rttOverlay = null;
        }

        this.rttSamples = [];
        this.lastRtt = null;
    }

    async updateRtt() {
        if (!this.peerConnection) {
            return;
        }

        if (
            this.peerConnection.connectionState !== "connected" &&
            this.peerConnection.connectionState !== "connecting"
        ) {
            return;
        }

        try {
            const stats =
                await this.peerConnection.getStats();

            let bestRtt = null;

            stats.forEach((report) => {
                /*
                 * candidate-pair.currentRoundTripTime is expressed
                 * in seconds by the WebRTC statistics API.
                 */
                if (
                    report.type === "candidate-pair" &&
                    report.state === "succeeded" &&
                    typeof report.currentRoundTripTime === "number"
                ) {
                    const rttMs =
                        report.currentRoundTripTime * 1000;

                    if (
                        Number.isFinite(rttMs) &&
                        rttMs >= 0 &&
                        (bestRtt === null ||
                            rttMs < bestRtt)
                    ) {
                        bestRtt = rttMs;
                    }
                }
            });

            if (bestRtt === null) {
                return;
            }

            this.lastRtt = bestRtt;

            this.rttSamples.push(bestRtt);

            if (this.rttSamples.length > 10) {
                this.rttSamples.shift();
            }

            const average =
                this.rttSamples.reduce(
                    (sum, value) => sum + value,
                    0
                ) / this.rttSamples.length;

            const minimum =
                Math.min(...this.rttSamples);

            const maximum =
                Math.max(...this.rttSamples);

            this.updateRttOverlay(
                bestRtt,
                average,
                minimum,
                maximum
            );

            console.info(
                `WebRTC RTT: ${bestRtt.toFixed(1)} ms | ` +
                `avg: ${average.toFixed(1)} ms | ` +
                `min: ${minimum.toFixed(1)} ms | ` +
                `max: ${maximum.toFixed(1)} ms`
            );
        } catch (error) {
            console.warn(
                "Failed to read WebRTC RTT statistics:",
                error
            );
        }
    }

    createRttOverlay() {
        if (this.rttOverlay) {
            return;
        }

        const overlay =
            document.createElement("div");

        overlay.id = "webrtc-rtt-overlay";

        overlay.style.position = "fixed";
        overlay.style.top = "10px";
        overlay.style.left = "10px";
        overlay.style.zIndex = "9999";

        overlay.style.padding = "7px 10px";

        overlay.style.background =
            "rgba(0, 0, 0, 0.70)";

        overlay.style.border =
            "1px solid rgba(255, 255, 255, 0.20)";

        overlay.style.borderRadius = "7px";

        overlay.style.color = "#ffffff";

        overlay.style.fontFamily =
            "ui-monospace, SFMono-Regular, Consolas, monospace";

        overlay.style.fontSize = "12px";

        overlay.style.lineHeight = "1.4";

        overlay.style.pointerEvents = "none";

        overlay.textContent =
            "RTT: measuring...";

        document.body.appendChild(overlay);

        this.rttOverlay = overlay;
    }

    updateRttOverlay(
        current,
        average,
        minimum,
        maximum
    ) {
        if (!this.rttOverlay) {
            return;
        }

        this.rttOverlay.textContent =
            `RTT ${current.toFixed(1)} ms | ` +
            `AVG ${average.toFixed(1)} | ` +
            `MIN ${minimum.toFixed(1)} | ` +
            `MAX ${maximum.toFixed(1)}`;
    }

    // =============================================================
    // FPS MEASUREMENT
    // =============================================================

    startFpsMeasurement() {
        if (this.fpsTimer !== null) {
            return;
        }

        this.createFpsOverlay();

        this.fpsTimer = window.setInterval(() => {
            this.updateFps();
        }, 1000);

        this.updateFps();
    }

    stopFpsMeasurement() {
        if (this.fpsTimer !== null) {
            window.clearInterval(this.fpsTimer);
            this.fpsTimer = null;
        }

        this.stopPresentedFrameMeasurement();

        if (this.fpsOverlay) {
            this.fpsOverlay.remove();
            this.fpsOverlay = null;
        }

        this.fpsSamples = [];

        this.presentedFrames = 0;
        this.lastPresentedFrames = null;
        this.lastFpsMeasurementTime = null;

        this.decodedFrames = 0;
    }

    async updateFps() {
        if (!this.peerConnection) {
            return;
        }

        if (
            this.peerConnection.connectionState !== "connected" &&
            this.peerConnection.connectionState !== "connecting"
        ) {
            return;
        }

        const now = performance.now();

        let presentedFps = null;

        if (
            this.lastPresentedFrames !== null &&
            this.lastFpsMeasurementTime !== null
        ) {
            const elapsed =
                (now - this.lastFpsMeasurementTime) / 1000;

            const frameDelta =
                this.presentedFrames -
                this.lastPresentedFrames;

            if (elapsed > 0) {
                presentedFps =
                    frameDelta / elapsed;
            }
        }

        this.lastPresentedFrames =
            this.presentedFrames;

        this.lastFpsMeasurementTime = now;

        let decodedFps = null;

        try {
            const stats =
                await this.peerConnection.getStats();

            stats.forEach((report) => {
                if (
                    report.type === "inbound-rtp" &&
                    report.kind === "video" &&
                    typeof report.framesPerSecond === "number"
                ) {
                    if (
                        decodedFps === null ||
                        report.framesPerSecond > decodedFps
                    ) {
                        decodedFps =
                            report.framesPerSecond;
                    }
                }

                if (
                    report.type === "inbound-rtp" &&
                    report.kind === "video" &&
                    typeof report.framesDecoded === "number"
                ) {
                    this.decodedFrames =
                        report.framesDecoded;
                }
            });
        } catch (error) {
            console.warn(
                "Failed to read WebRTC FPS statistics:",
                error
            );
        }

        const currentFps =
            presentedFps !== null &&
            Number.isFinite(presentedFps)
                ? presentedFps
                : decodedFps;

        if (
            currentFps === null ||
            !Number.isFinite(currentFps) ||
            currentFps < 0
        ) {
            return;
        }

        this.fpsSamples.push(currentFps);

        if (this.fpsSamples.length > 10) {
            this.fpsSamples.shift();
        }

        const average =
            this.fpsSamples.reduce(
                (sum, value) => sum + value,
                0
            ) / this.fpsSamples.length;

        const minimum =
            Math.min(...this.fpsSamples);

        const maximum =
            Math.max(...this.fpsSamples);

        this.updateFpsOverlay(
            currentFps,
            average,
            minimum,
            maximum
        );

        console.info(
            `Video FPS: ${currentFps.toFixed(1)} | ` +
            `avg: ${average.toFixed(1)} | ` +
            `min: ${minimum.toFixed(1)} | ` +
            `max: ${maximum.toFixed(1)}`
        );
    }

    startPresentedFrameMeasurement() {
        if (!this.videoElement) {
            return;
        }

        if (
            !("requestVideoFrameCallback" in HTMLVideoElement.prototype)
        ) {
            console.warn(
                "requestVideoFrameCallback() is not supported. " +
                "FPS and E2E latency will use available WebRTC statistics."
            );

            return;
        }

        if (this.videoFrameMeasurementActive) {
            return;
        }

        this.videoFrameMeasurementActive = true;
        this.presentedFrames = 0;

        const handleVideoFrame = (
            now,
            metadata
        ) => {
            if (!this.videoFrameMeasurementActive) {
                return;
            }

            this.presentedFrames += 1;

            /*
             * Measure end-to-end video latency when the browser
             * exposes the WebRTC frame capture timestamp.
             *
             * captureTime is mapped onto the browser's high-resolution
             * performance timeline by the WebRTC implementation.
             */
            if (
                metadata &&
                typeof metadata.captureTime === "number"
            ) {
                const presentationTime =
                    Number.isFinite(metadata.expectedDisplayTime)
                        ? metadata.expectedDisplayTime
                        : now;

                const latency =
                    presentationTime -
                    metadata.captureTime;

                if (
                    Number.isFinite(latency) &&
                    latency >= 0 &&
                    latency < 5000
                ) {
                    this.lastE2eLatency = latency;

                    this.e2eLatencySamples.push(
                        latency
                    );

                    if (
                        this.e2eLatencySamples.length > 10
                    ) {
                        this.e2eLatencySamples.shift();
                    }
                }
            }

            this.videoFrameCallbackId =
                this.videoElement.requestVideoFrameCallback(
                    handleVideoFrame
                );
        };

        this.videoFrameCallbackId =
            this.videoElement.requestVideoFrameCallback(
                handleVideoFrame
            );
    }

    stopPresentedFrameMeasurement() {
        this.videoFrameMeasurementActive = false;

        /*
         * requestVideoFrameCallback callbacks are one-shot.
         * There is normally nothing that must be cancelled.
         */
        this.videoFrameCallbackId = null;
    }

    createFpsOverlay() {
        if (this.fpsOverlay) {
            return;
        }

        const overlay =
            document.createElement("div");

        overlay.id = "webrtc-fps-overlay";

        overlay.style.position = "fixed";
        overlay.style.top = "45px";
        overlay.style.left = "10px";
        overlay.style.zIndex = "9999";

        overlay.style.padding = "7px 10px";

        overlay.style.background =
            "rgba(0, 0, 0, 0.70)";

        overlay.style.border =
            "1px solid rgba(255, 255, 255, 0.20)";

        overlay.style.borderRadius = "7px";

        overlay.style.color = "#ffffff";

        overlay.style.fontFamily =
            "ui-monospace, SFMono-Regular, Consolas, monospace";

        overlay.style.fontSize = "12px";

        overlay.style.lineHeight = "1.4";

        overlay.style.pointerEvents = "none";

        overlay.textContent =
            "FPS: measuring...";

        document.body.appendChild(overlay);

        this.fpsOverlay = overlay;
    }

    updateFpsOverlay(
        current,
        average,
        minimum,
        maximum
    ) {
        if (!this.fpsOverlay) {
            return;
        }

        this.fpsOverlay.textContent =
            `FPS ${current.toFixed(1)} | ` +
            `AVG ${average.toFixed(1)} | ` +
            `MIN ${minimum.toFixed(1)} | ` +
            `MAX ${maximum.toFixed(1)}`;
    }

    // =============================================================
    // NETWORK DIAGNOSTICS
    // =============================================================

    startNetworkDiagnostics() {
        /*
         * RTT and FPS already have their own timers.
         *
         * Jitter and packet loss are read from the same WebRTC
         * statistics API once every second.
         */
        if (
            !this.networkDiagnosticsTimer
        ) {
            this.networkDiagnosticsTimer =
                window.setInterval(() => {
                    this.updateNetworkDiagnostics();
                }, 1000);
        }

        this.createNetworkDiagnosticsOverlay();

        this.updateNetworkDiagnostics();
    }

    stopNetworkDiagnostics() {
        if (this.networkDiagnosticsTimer) {
            window.clearInterval(
                this.networkDiagnosticsTimer
            );

            this.networkDiagnosticsTimer = null;
        }

        if (this.networkDiagnosticsOverlay) {
            this.networkDiagnosticsOverlay.remove();
            this.networkDiagnosticsOverlay = null;
        }

        this.jitterSamples = [];
        this.lastJitter = null;

        this.packetLossSamples = [];
        this.lastPacketLoss = null;

        this.e2eLatencySamples = [];
        this.lastE2eLatency = null;
    }

    async updateNetworkDiagnostics() {
        if (!this.peerConnection) {
            return;
        }

        if (
            this.peerConnection.connectionState !== "connected" &&
            this.peerConnection.connectionState !== "connecting"
        ) {
            return;
        }

        try {
            const stats =
                await this.peerConnection.getStats();

            let videoJitter = null;

            let packetsReceived = null;
            let packetsLost = null;

            stats.forEach((report) => {
                /*
                 * Inbound RTP video statistics.
                 */
                if (
                    report.type === "inbound-rtp" &&
                    report.kind === "video"
                ) {
                    /*
                     * RTP jitter is reported in seconds.
                     */
                    if (
                        typeof report.jitter === "number"
                    ) {
                        const jitterMs =
                            report.jitter * 1000;

                        if (
                            Number.isFinite(jitterMs) &&
                            jitterMs >= 0
                        ) {
                            if (
                                videoJitter === null ||
                                jitterMs < videoJitter
                            ) {
                                videoJitter =
                                    jitterMs;
                            }
                        }
                    }

                    if (
                        typeof report.packetsReceived ===
                        "number"
                    ) {
                        packetsReceived =
                            (packetsReceived || 0) +
                            report.packetsReceived;
                    }

                    if (
                        typeof report.packetsLost ===
                        "number"
                    ) {
                        packetsLost =
                            (packetsLost || 0) +
                            report.packetsLost;
                    }
                }
            });

            /*
             * -----------------------------------------------------
             * JITTER
             * -----------------------------------------------------
             */

            if (
                videoJitter !== null
            ) {
                this.lastJitter =
                    videoJitter;

                this.jitterSamples.push(
                    videoJitter
                );

                if (
                    this.jitterSamples.length > 10
                ) {
                    this.jitterSamples.shift();
                }
            }

            /*
             * -----------------------------------------------------
             * PACKET LOSS
             * -----------------------------------------------------
             *
             * Cumulative WebRTC counters are converted into the
             * percentage of packets that have been lost.
             */
            let packetLoss = null;

            if (
                packetsReceived !== null &&
                packetsLost !== null
            ) {
                const totalPackets =
                    packetsReceived +
                    Math.max(packetsLost, 0);

                if (totalPackets > 0) {
                    packetLoss =
                        (Math.max(packetsLost, 0) /
                            totalPackets) *
                        100;

                    if (
                        Number.isFinite(packetLoss)
                    ) {
                        this.lastPacketLoss =
                            packetLoss;

                        this.packetLossSamples.push(
                            packetLoss
                        );

                        if (
                            this.packetLossSamples.length >
                            10
                        ) {
                            this.packetLossSamples.shift();
                        }
                    }
                }
            }

            /*
             * -----------------------------------------------------
             * OVERLAY
             * -----------------------------------------------------
             */

            this.updateNetworkDiagnosticsOverlay();

            console.info(
                `Network diagnostics: ` +
                `jitter=${
                    this.lastJitter !== null
                        ? this.lastJitter.toFixed(2)
                        : "n/a"
                } ms | ` +
                `packet loss=${
                    this.lastPacketLoss !== null
                        ? this.lastPacketLoss.toFixed(2)
                        : "n/a"
                }% | ` +
                `E2E=${
                    this.lastE2eLatency !== null
                        ? this.lastE2eLatency.toFixed(1)
                        : "n/a"
                } ms`
            );
        } catch (error) {
            console.warn(
                "Failed to read network diagnostics:",
                error
            );
        }
    }

    createNetworkDiagnosticsOverlay() {
        if (this.networkDiagnosticsOverlay) {
            return;
        }

        const overlay =
            document.createElement("div");

        overlay.id =
            "webrtc-network-diagnostics-overlay";

        overlay.style.position = "fixed";
        overlay.style.top = "80px";
        overlay.style.left = "10px";
        overlay.style.zIndex = "9999";

        overlay.style.padding = "7px 10px";

        overlay.style.background =
            "rgba(0, 0, 0, 0.70)";

        overlay.style.border =
            "1px solid rgba(255, 255, 255, 0.20)";

        overlay.style.borderRadius = "7px";

        overlay.style.color = "#ffffff";

        overlay.style.fontFamily =
            "ui-monospace, SFMono-Regular, Consolas, monospace";

        overlay.style.fontSize = "12px";

        overlay.style.lineHeight = "1.4";

        overlay.style.pointerEvents = "none";

        overlay.textContent =
            "JIT: measuring... | LOSS: measuring... | E2E: measuring...";

        document.body.appendChild(overlay);

        this.networkDiagnosticsOverlay =
            overlay;
    }

    updateNetworkDiagnosticsOverlay() {
        if (!this.networkDiagnosticsOverlay) {
            return;
        }

        const jitter =
            this.lastJitter !== null
                ? `${this.lastJitter.toFixed(2)} ms`
                : "n/a";

        const packetLoss =
            this.lastPacketLoss !== null
                ? `${this.lastPacketLoss.toFixed(2)}%`
                : "n/a";

        const e2e =
            this.lastE2eLatency !== null
                ? `${this.lastE2eLatency.toFixed(1)} ms`
                : "n/a";

        this.networkDiagnosticsOverlay.textContent =
            `JIT ${jitter} | ` +
            `LOSS ${packetLoss} | ` +
            `E2E ${e2e}`;
    }

    // =============================================================
    // INPUT
    // =============================================================

    sendInput(event) {
        if (!this.inputChannel) {
            return false;
        }

        if (this.inputChannel.readyState !== "open") {
            return false;
        }

        try {
            const message =
                JSON.stringify(event);

            this.inputChannel.send(message);

            return true;
        } catch (error) {
            console.error(
                "Failed to send input event:",
                error
            );

            return false;
        }
    }

    // =============================================================
    // ICE GATHERING
    // =============================================================

    async waitForIceGathering(timeout = 3000) {
        if (!this.peerConnection) {
            return;
        }

        if (
            this.peerConnection.iceGatheringState ===
            "complete"
        ) {
            return;
        }

        await new Promise((resolve) => {
            let finished = false;

            const finish = () => {
                if (finished) {
                    return;
                }

                finished = true;

                this.peerConnection.removeEventListener(
                    "icegatheringstatechange",
                    handleStateChange
                );

                clearTimeout(timer);

                resolve();
            };

            const handleStateChange = () => {
                if (
                    this.peerConnection &&
                    this.peerConnection.iceGatheringState ===
                        "complete"
                ) {
                    finish();
                }
            };

            const timer = setTimeout(
                finish,
                timeout
            );

            this.peerConnection.addEventListener(
                "icegatheringstatechange",
                handleStateChange
            );
        });
    }

    // =============================================================
    // DISCONNECT
    // =============================================================

    async disconnect() {
        this.connected = false;

        this.stopRttMeasurement();
        this.stopFpsMeasurement();
        this.stopNetworkDiagnostics();

        if (this.inputChannel) {
            try {
                this.inputChannel.close();
            } catch (_) {
                // Channel may already be closed.
            }

            this.inputChannel = null;
        }

        if (this.peerConnection) {
            try {
                this.peerConnection.close();
            } catch (_) {
                // Peer connection may already be closed.
            }

            this.peerConnection = null;
        }

        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.srcObject = null;
        }

        if (
            typeof this.onConnectionStateChange ===
            "function"
        ) {
            this.onConnectionStateChange("closed");
        }
    }

    // =============================================================
    // ERROR HANDLING
    // =============================================================

    handleError(error) {
        console.error(
            "WebRTC error:",
            error
        );

        if (
            typeof this.onError ===
            "function"
        ) {
            this.onError(error);
        }
    }

    // =============================================================
    // STATUS HELPERS
    // =============================================================

    isInputChannelOpen() {
        return (
            this.inputChannel !== null &&
            this.inputChannel.readyState === "open"
        );
    }

    isConnected() {
        return this.connected;
    }
}

window.WebRTCClient = WebRTCClient;

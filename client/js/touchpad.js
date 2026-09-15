/**
 * Touchpad Controller
 *
 * Normal mode:
 *   - Touch/drag = relative mouse movement
 *   - Tap = left click
 *
 * Edit mode:
 *   - Drag body = move touchpad
 *   - 8 resize handles = resize touchpad
 *
 * Resize handles:
 *
 *        NW       N       NE
 *          ●──────●──────●
 *          │             │
 *        W ●             ● E
 *          │             │
 *          ●──────●──────●
 *        SW       S       SE
 *
 * Resize limits:
 *   - Minimum width:  160px
 *   - Minimum height: 80px
 *   - Maximum width:  NONE
 *   - Maximum height: NONE
 */

class Touchpad {
    constructor(webrtc) {
        this.webrtc = webrtc;

        this.touchpad = null;
        this.settingsButton = null;
        this.resizeHandles = {};

        this.editMode = false;

        this.pointerId = null;

        // -----------------------------------------------------
        // Normal touchpad state
        // -----------------------------------------------------

        this.touchStartX = 0;
        this.touchStartY = 0;

        this.lastX = 0;
        this.lastY = 0;

        this.moved = false;

        // -----------------------------------------------------
        // Edit-mode drag state
        // -----------------------------------------------------

        this.dragging = false;

        this.dragStartX = 0;
        this.dragStartY = 0;

        this.originalLeft = 0;
        this.originalTop = 0;

        // -----------------------------------------------------
        // Resize state
        // -----------------------------------------------------

        this.resizing = false;
        this.resizeDirection = null;

        this.resizeStartX = 0;
        this.resizeStartY = 0;

        this.resizeStartLeft = 0;
        this.resizeStartTop = 0;

        this.resizeStartWidth = 0;
        this.resizeStartHeight = 0;

        // -----------------------------------------------------
        // Only minimum dimensions.
        // No maximum width/height.
        // -----------------------------------------------------

        this.minWidth = 160;
        this.minHeight = 80;
    }

    // =========================================================
    // INITIALIZATION
    // =========================================================

    initialize() {
        this.createTouchpad();
        this.createSettingsButton();
        this.createResizeHandles();
        this.bindEvents();

        // Hidden until WebRTC/video is ready.
        this.hide();

        console.log("Touchpad initialized.");

        return this;
    }

    // =========================================================
    // CREATE TOUCHPAD
    // =========================================================

    createTouchpad() {
        const existing =
            document.getElementById("touchpad");

        if (existing) {
            existing.remove();
        }

        this.touchpad =
            document.createElement("div");

        this.touchpad.id = "touchpad";

        this.touchpad.style.setProperty(
            "position",
            "fixed",
            "important"
        );

        this.touchpad.style.setProperty(
            "box-sizing",
            "border-box",
            "important"
        );

        this.touchpad.style.setProperty(
            "z-index",
            "1000",
            "important"
        );

        this.touchpad.style.setProperty(
            "touch-action",
            "none",
            "important"
        );

        this.touchpad.style.setProperty(
            "user-select",
            "none",
            "important"
        );

        this.touchpad.style.setProperty(
            "-webkit-user-select",
            "none",
            "important"
        );

        this.touchpad.style.setProperty(
            "-webkit-touch-callout",
            "none",
            "important"
        );

        this.setInitialGeometry();

        document.body.appendChild(
            this.touchpad
        );
    }

    // =========================================================
    // SETTINGS BUTTON
    // =========================================================

    createSettingsButton() {
        this.settingsButton =
            document.createElement("button");

        this.settingsButton.id =
            "touchpad-settings-button";

        this.settingsButton.type =
            "button";

        this.settingsButton.textContent =
            "⚙";

        this.settingsButton.setAttribute(
            "aria-label",
            "Edit touchpad"
        );

        this.settingsButton.style.setProperty(
            "position",
            "absolute",
            "important"
        );

        this.settingsButton.style.setProperty(
            "top",
            "8px",
            "important"
        );

        this.settingsButton.style.setProperty(
            "right",
            "8px",
            "important"
        );

        this.settingsButton.style.setProperty(
            "width",
            "34px",
            "important"
        );

        this.settingsButton.style.setProperty(
            "height",
            "34px",
            "important"
        );

        this.settingsButton.style.setProperty(
            "padding",
            "0",
            "important"
        );

        this.settingsButton.style.setProperty(
            "display",
            "flex",
            "important"
        );

        this.settingsButton.style.setProperty(
            "align-items",
            "center",
            "important"
        );

        this.settingsButton.style.setProperty(
            "justify-content",
            "center",
            "important"
        );

        this.settingsButton.style.setProperty(
            "border-radius",
            "8px",
            "important"
        );

        this.settingsButton.style.setProperty(
            "border",
            "1px solid rgba(255,255,255,0.25)",
            "important"
        );

        this.settingsButton.style.setProperty(
            "background",
            "rgba(20,20,20,0.85)",
            "important"
        );

        this.settingsButton.style.setProperty(
            "color",
            "white",
            "important"
        );

        this.settingsButton.style.setProperty(
            "font-size",
            "18px",
            "important"
        );

        this.settingsButton.style.setProperty(
            "cursor",
            "pointer",
            "important"
        );

        this.settingsButton.style.setProperty(
            "z-index",
            "20",
            "important"
        );

        this.touchpad.appendChild(
            this.settingsButton
        );
    }

    // =========================================================
    // CREATE 8 RESIZE HANDLES
    // =========================================================

    createResizeHandles() {
        const directions = [
            "nw",
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w"
        ];

        directions.forEach((direction) => {
            const handle =
                document.createElement("div");

            handle.className =
                "touchpad-resize-handle";

            handle.dataset.direction =
                direction;

            this.styleResizeHandle(
                handle,
                direction
            );

            this.touchpad.appendChild(
                handle
            );

            this.resizeHandles[direction] =
                handle;
        });
    }

    // =========================================================
    // STYLE RESIZE HANDLE
    // =========================================================

    styleResizeHandle(
        handle,
        direction
    ) {
        const size = 18;

        handle.style.setProperty(
            "position",
            "absolute",
            "important"
        );

        handle.style.setProperty(
            "width",
            `${size}px`,
            "important"
        );

        handle.style.setProperty(
            "height",
            `${size}px`,
            "important"
        );

        handle.style.setProperty(
            "box-sizing",
            "border-box",
            "important"
        );

        handle.style.setProperty(
            "border-radius",
            "50%",
            "important"
        );

        handle.style.setProperty(
            "background",
            "rgba(255,255,255,0.95)",
            "important"
        );

        handle.style.setProperty(
            "border",
            "2px solid rgba(0,0,0,0.55)",
            "important"
        );

        handle.style.setProperty(
            "z-index",
            "30",
            "important"
        );

        handle.style.setProperty(
            "display",
            "none",
            "important"
        );

        handle.style.setProperty(
            "pointer-events",
            "auto",
            "important"
        );

        handle.style.setProperty(
            "touch-action",
            "none",
            "important"
        );

        handle.style.setProperty(
            "transform",
            "translate(-50%, -50%)",
            "important"
        );

        const cursorMap = {
            nw: "nwse-resize",
            n: "ns-resize",
            ne: "nesw-resize",

            e: "ew-resize",

            se: "nwse-resize",
            s: "ns-resize",
            sw: "nesw-resize",

            w: "ew-resize"
        };

        handle.style.setProperty(
            "cursor",
            cursorMap[direction],
            "important"
        );

        this.positionResizeHandle(
            handle,
            direction
        );
    }

    // =========================================================
    // POSITION RESIZE HANDLE
    // =========================================================

    positionResizeHandle(
        handle,
        direction
    ) {
        const positions = {
            nw: {
                left: "0%",
                top: "0%"
            },

            n: {
                left: "50%",
                top: "0%"
            },

            ne: {
                left: "100%",
                top: "0%"
            },

            e: {
                left: "100%",
                top: "50%"
            },

            se: {
                left: "100%",
                top: "100%"
            },

            s: {
                left: "50%",
                top: "100%"
            },

            sw: {
                left: "0%",
                top: "100%"
            },

            w: {
                left: "0%",
                top: "50%"
            }
        };

        const position =
            positions[direction];

        if (!position) {
            return;
        }

        handle.style.setProperty(
            "left",
            position.left,
            "important"
        );

        handle.style.setProperty(
            "top",
            position.top,
            "important"
        );
    }

    // =========================================================
    // INITIAL GEOMETRY
    // =========================================================

    setInitialGeometry() {
        const viewportWidth =
            window.innerWidth;

        const viewportHeight =
            window.innerHeight;

        let width;
        let height;

        if (viewportWidth >= 768) {
            width = 420;
            height = 180;
        } else {
            width =
                Math.min(
                    300,
                    viewportWidth * 0.72
                );

            height =
                Math.min(
                    120,
                    viewportHeight * 0.20
                );

            width =
                Math.max(
                    this.minWidth,
                    width
                );

            height =
                Math.max(
                    this.minHeight,
                    height
                );
        }

        const left =
            (viewportWidth - width) / 2;

        const top =
            viewportHeight * 0.55;

        this.applyGeometry(
            left,
            top,
            width,
            height
        );
    }

    // =========================================================
    // APPLY GEOMETRY
    // =========================================================

    applyGeometry(
        left,
        top,
        width,
        height
    ) {
        if (!this.touchpad) {
            return;
        }

        // -----------------------------------------------------
        // ONLY MINIMUM SIZE.
        //
        // There is deliberately NO maximum width.
        // There is deliberately NO maximum height.
        // -----------------------------------------------------

        width =
            Math.max(
                this.minWidth,
                width
            );

        height =
            Math.max(
                this.minHeight,
                height
            );

        // Only prevent the top/left coordinates from becoming
        // negative. The element itself may extend beyond the
        // viewport.
        left =
            Math.max(
                0,
                left
            );

        top =
            Math.max(
                0,
                top
            );

        this.touchpad.style.setProperty(
            "left",
            `${left}px`,
            "important"
        );

        this.touchpad.style.setProperty(
            "top",
            `${top}px`,
            "important"
        );

        this.touchpad.style.setProperty(
            "width",
            `${width}px`,
            "important"
        );

        this.touchpad.style.setProperty(
            "height",
            `${height}px`,
            "important"
        );

        this.touchpad.style.setProperty(
            "transform",
            "none",
            "important"
        );
    }

    // =========================================================
    // EVENT BINDING
    // =========================================================

    bindEvents() {
        if (!this.touchpad) {
            return;
        }

        // -----------------------------------------------------
        // Settings button
        // -----------------------------------------------------

        this.settingsButton.addEventListener(
            "click",
            (event) => {
                event.preventDefault();
                event.stopPropagation();

                this.toggleEditMode();
            }
        );

        // -----------------------------------------------------
        // Touchpad
        // -----------------------------------------------------

        this.touchpad.addEventListener(
            "pointerdown",
            (event) => {
                this.handlePointerDown(
                    event
                );
            }
        );

        // -----------------------------------------------------
        // Global pointer events
        // -----------------------------------------------------

        document.addEventListener(
            "pointermove",
            (event) => {
                this.handlePointerMove(
                    event
                );
            }
        );

        document.addEventListener(
            "pointerup",
            (event) => {
                this.handlePointerUp(
                    event
                );
            }
        );

        document.addEventListener(
            "pointercancel",
            (event) => {
                this.handlePointerUp(
                    event
                );
            }
        );

        // -----------------------------------------------------
        // Disable browser context menu
        // -----------------------------------------------------

        this.touchpad.addEventListener(
            "contextmenu",
            (event) => {
                event.preventDefault();
            }
        );

        // -----------------------------------------------------
        // Reposition only if necessary when viewport changes.
        // This does NOT resize/cap the touchpad.
        // -----------------------------------------------------

        window.addEventListener(
            "resize",
            () => {
                this.keepInsideViewport();
            }
        );
    }

    // =========================================================
    // POINTER DOWN
    // =========================================================

    handlePointerDown(event) {
        if (!this.touchpad) {
            return;
        }

        // -----------------------------------------------------
        // Ignore settings button
        // -----------------------------------------------------

        if (
            event.target ===
                this.settingsButton ||
            this.settingsButton.contains(
                event.target
            )
        ) {
            return;
        }

        // -----------------------------------------------------
        // Check for resize handle
        // -----------------------------------------------------

        const handle =
            event.target.closest(
                ".touchpad-resize-handle"
            );

        if (
            handle &&
            this.editMode
        ) {
            event.preventDefault();
            event.stopPropagation();

            this.startResize(
                event,
                handle.dataset.direction
            );

            return;
        }

        // -----------------------------------------------------
        // EDIT MODE = MOVE TOUCHPAD
        // -----------------------------------------------------

        if (this.editMode) {
            event.preventDefault();

            this.pointerId =
                event.pointerId;

            this.dragging = true;

            this.dragStartX =
                event.clientX;

            this.dragStartY =
                event.clientY;

            this.originalLeft =
                parseFloat(
                    this.touchpad.style.left
                ) || 0;

            this.originalTop =
                parseFloat(
                    this.touchpad.style.top
                ) || 0;

            return;
        }

        // -----------------------------------------------------
        // NORMAL MODE = MOUSE
        // -----------------------------------------------------

        event.preventDefault();

        this.pointerId =
            event.pointerId;

        this.touchStartX =
            event.clientX;

        this.touchStartY =
            event.clientY;

        this.lastX =
            event.clientX;

        this.lastY =
            event.clientY;

        this.moved = false;
    }

    // =========================================================
    // POINTER MOVE
    // =========================================================

    handlePointerMove(event) {
        if (
            this.pointerId !== null &&
            event.pointerId !==
                this.pointerId
        ) {
            return;
        }

        // -----------------------------------------------------
        // RESIZING
        // -----------------------------------------------------

        if (this.resizing) {
            event.preventDefault();

            this.updateResize(
                event.clientX,
                event.clientY
            );

            return;
        }

        // -----------------------------------------------------
        // EDIT MODE DRAG
        // -----------------------------------------------------

        if (this.dragging) {
            event.preventDefault();

            const dx =
                event.clientX -
                this.dragStartX;

            const dy =
                event.clientY -
                this.dragStartY;

            const width =
                this.touchpad.offsetWidth;

            const height =
                this.touchpad.offsetHeight;

            let left =
                this.originalLeft + dx;

            let top =
                this.originalTop + dy;

            // Only stop the top-left corner from going
            // negative. The touchpad can otherwise extend
            // beyond the viewport.
            left =
                Math.max(
                    0,
                    left
                );

            top =
                Math.max(
                    0,
                    top
                );

            this.applyGeometry(
                left,
                top,
                width,
                height
            );

            return;
        }

        // -----------------------------------------------------
        // NORMAL TOUCHPAD
        // -----------------------------------------------------

        if (this.editMode) {
            return;
        }

        if (
            this.pointerId === null
        ) {
            return;
        }

        event.preventDefault();

        const dx =
            event.clientX -
            this.lastX;

        const dy =
            event.clientY -
            this.lastY;

        const totalDx =
            event.clientX -
            this.touchStartX;

        const totalDy =
            event.clientY -
            this.touchStartY;

        if (
            Math.abs(totalDx) > 5 ||
            Math.abs(totalDy) > 5
        ) {
            this.moved = true;
        }

        this.lastX =
            event.clientX;

        this.lastY =
            event.clientY;

        if (
            dx !== 0 ||
            dy !== 0
        ) {
            this.sendMouseMove(
                dx,
                dy
            );
        }
    }

    // =========================================================
    // POINTER UP
    // =========================================================

    handlePointerUp(event) {
        if (
            this.pointerId !== null &&
            event.pointerId !==
                this.pointerId
        ) {
            return;
        }

        // -----------------------------------------------------
        // RESIZE END
        // -----------------------------------------------------

        if (this.resizing) {
            this.resizing = false;

            this.resizeDirection =
                null;

            this.pointerId =
                null;

            return;
        }

        // -----------------------------------------------------
        // DRAG END
        // -----------------------------------------------------

        if (this.dragging) {
            this.dragging = false;

            this.pointerId =
                null;

            return;
        }

        // -----------------------------------------------------
        // NORMAL TOUCH = LEFT CLICK
        // -----------------------------------------------------

        if (!this.editMode) {
            if (!this.moved) {
                this.sendMouseClick(
                    "left"
                );
            }
        }

        this.pointerId =
            null;

        this.moved = false;
    }

    // =========================================================
    // START RESIZE
    // =========================================================

    startResize(
        event,
        direction
    ) {
        const rect =
            this.touchpad.getBoundingClientRect();

        this.pointerId =
            event.pointerId;

        this.resizing = true;

        this.resizeDirection =
            direction;

        this.resizeStartX =
            event.clientX;

        this.resizeStartY =
            event.clientY;

        this.resizeStartLeft =
            rect.left;

        this.resizeStartTop =
            rect.top;

        this.resizeStartWidth =
            rect.width;

        this.resizeStartHeight =
            rect.height;
    }

    // =========================================================
    // UPDATE RESIZE
    // =========================================================

    updateResize(
        currentX,
        currentY
    ) {
        const dx =
            currentX -
            this.resizeStartX;

        const dy =
            currentY -
            this.resizeStartY;

        const direction =
            this.resizeDirection;

        let left =
            this.resizeStartLeft;

        let top =
            this.resizeStartTop;

        let width =
            this.resizeStartWidth;

        let height =
            this.resizeStartHeight;

        // -----------------------------------------------------
        // EAST
        // -----------------------------------------------------

        if (
            direction.includes("e")
        ) {
            width =
                this.resizeStartWidth +
                dx;
        }

        // -----------------------------------------------------
        // WEST
        // -----------------------------------------------------

        if (
            direction.includes("w")
        ) {
            width =
                this.resizeStartWidth -
                dx;

            left =
                this.resizeStartLeft +
                dx;
        }

        // -----------------------------------------------------
        // SOUTH
        // -----------------------------------------------------

        if (
            direction.includes("s")
        ) {
            height =
                this.resizeStartHeight +
                dy;
        }

        // -----------------------------------------------------
        // NORTH
        // -----------------------------------------------------

        if (
            direction.includes("n")
        ) {
            height =
                this.resizeStartHeight -
                dy;

            top =
                this.resizeStartTop +
                dy;
        }

        // -----------------------------------------------------
        // MINIMUM WIDTH ONLY
        // -----------------------------------------------------

        if (
            width < this.minWidth
        ) {
            if (
                direction.includes("w")
            ) {
                left =
                    this.resizeStartLeft +
                    (
                        this.resizeStartWidth -
                        this.minWidth
                    );
            }

            width =
                this.minWidth;
        }

        // -----------------------------------------------------
        // MINIMUM HEIGHT ONLY
        // -----------------------------------------------------

        if (
            height < this.minHeight
        ) {
            if (
                direction.includes("n")
            ) {
                top =
                    this.resizeStartTop +
                    (
                        this.resizeStartHeight -
                        this.minHeight
                    );
            }

            height =
                this.minHeight;
        }

        // -----------------------------------------------------
        // IMPORTANT:
        //
        // There is NO maximum width.
        // There is NO maximum height.
        //
        // There is NO right boundary.
        // There is NO bottom boundary.
        //
        // Therefore:
        //
        // E / W / NE / NW / SE / SW
        // can make the touchpad arbitrarily wide.
        //
        // N / S / NE / NW / SE / SW
        // can make it arbitrarily tall.
        // -----------------------------------------------------

        // Only prevent the top-left coordinate from becoming
        // negative.
        if (left < 0) {
            if (
                direction.includes("w")
            ) {
                width += left;
            }

            left = 0;
        }

        if (top < 0) {
            if (
                direction.includes("n")
            ) {
                height += top;
            }

            top = 0;
        }

        width =
            Math.max(
                this.minWidth,
                width
            );

        height =
            Math.max(
                this.minHeight,
                height
            );

        this.applyGeometry(
            left,
            top,
            width,
            height
        );
    }

    // =========================================================
    // EDIT MODE
    // =========================================================

    toggleEditMode() {
        this.editMode =
            !this.editMode;

        if (this.editMode) {
            this.enterEditMode();
        } else {
            this.exitEditMode();
        }
    }

    // =========================================================
    // ENTER EDIT MODE
    // =========================================================

    enterEditMode() {
        this.touchpad.classList.add(
            "touchpad-edit-mode"
        );

        this.settingsButton.textContent =
            "✓";

        this.settingsButton.setAttribute(
            "aria-label",
            "Finish editing touchpad"
        );

        Object.values(
            this.resizeHandles
        ).forEach((handle) => {
            handle.style.setProperty(
                "display",
                "block",
                "important"
            );
        });

        console.log(
            "Touchpad edit mode enabled."
        );
    }

    // =========================================================
    // EXIT EDIT MODE
    // =========================================================

    exitEditMode() {
        this.touchpad.classList.remove(
            "touchpad-edit-mode"
        );

        this.settingsButton.textContent =
            "⚙";

        this.settingsButton.setAttribute(
            "aria-label",
            "Edit touchpad"
        );

        Object.values(
            this.resizeHandles
        ).forEach((handle) => {
            handle.style.setProperty(
                "display",
                "none",
                "important"
            );
        });

        this.dragging = false;
        this.resizing = false;

        this.resizeDirection =
            null;

        this.pointerId =
            null;

        console.log(
            "Touchpad edit mode disabled."
        );
    }

    // =========================================================
    // SEND MOUSE MOVE
    // =========================================================

    sendMouseMove(
        dx,
        dy
    ) {
        if (
            !this.webrtc ||
            typeof this.webrtc.sendInput !==
                "function"
        ) {
            return;
        }

        this.webrtc.sendInput({
            event_type: "mouse",
            action: "move",
            dx: dx,
            dy: dy
        });
    }

    // =========================================================
    // SEND MOUSE CLICK
    // =========================================================

    sendMouseClick(
        button
    ) {
        if (
            !this.webrtc ||
            typeof this.webrtc.sendInput !==
                "function"
        ) {
            return;
        }

        this.webrtc.sendInput({
            event_type: "mouse",
            action: "click",
            button: button
        });
    }

    // =========================================================
    // SHOW
    // =========================================================

    show() {
        if (!this.touchpad) {
            return;
        }

        this.touchpad.style.setProperty(
            "display",
            "block",
            "important"
        );
    }

    // =========================================================
    // HIDE
    // =========================================================

    hide() {
        if (!this.touchpad) {
            return;
        }

        this.touchpad.style.setProperty(
            "display",
            "none",
            "important"
        );
    }

    // =========================================================
    // VIEWPORT CHANGE
    // =========================================================
    //
    // IMPORTANT:
    // This does NOT cap width or height.
    //
    // It only prevents the touchpad's top-left corner
    // from becoming negative after an orientation/window
    // size change.
    // =========================================================

    keepInsideViewport() {
        if (!this.touchpad) {
            return;
        }

        const rect =
            this.touchpad.getBoundingClientRect();

        let left =
            rect.left;

        let top =
            rect.top;

        const width =
            rect.width;

        const height =
            rect.height;

        left =
            Math.max(
                0,
                left
            );

        top =
            Math.max(
                0,
                top
            );

        this.applyGeometry(
            left,
            top,
            width,
            height
        );
    }
}
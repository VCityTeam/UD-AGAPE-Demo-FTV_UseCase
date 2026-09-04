import * as THREE from 'three';

/** PlanarControls STATE.NONE, used to cancel a camera action we stole the mouse from. */
const ITOWNS_CONTROL_STATE_NONE = -1;

/** World up axis of the planar scene (iTowns planar views are Z-up). */
const WORLD_UP = new THREE.Vector3(0, 0, 1);

/**
 * InteractiveObjectController: Handles interactive manipulation of media objects in Phase 1
 * Responsibilities:
 * - Detect clicks on loaded media objects
 * - Select/deselect objects with visual feedback
 * - Move, raise, rotate and scale objects in the scene
 * - Update media configuration in real-time
 * - Manage raycasting and mouse events
 *
 * Tools:
 * - 'move'   : drag on the horizontal plane (around the city)
 * - 'height' : drag up/down along the world Z axis
 * - 'rotate' : drag to spin around the world up axis / the camera right axis
 * - 'scale'  : drag up/down (or use the wheel) to resize uniformly
 *
 * The active tool can be set from the UI, or temporarily overridden while dragging by
 * holding Shift (height), R (rotate) or S (scale).
 */
export class InteractiveObjectController {
    constructor(view, guidedVisit) {
        this.view = view;
        this.guidedVisit = guidedVisit;

        // Raycasting setup
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.previousMouse = new THREE.Vector2();

        // Sensitivities
        this.rotationSensitivity = Math.PI; // radians for a full screen sweep
        this.scaleSensitivity = 3; // exponential factor for a full screen sweep
        this.wheelScaleSensitivity = 0.0015;
        this.minScale = 0.01;
        this.maxScale = 1000;

        // Selection and drag state
        this.selectedObject = null;
        this.selectedOutline = null;
        this.isDragging = false;
        this.dragPlane = new THREE.Plane(WORLD_UP.clone(), 0);
        this.dragPoint = new THREE.Vector3();
        this.dragOffset = new THREE.Vector3();

        /** Tool selected in the UI. One of 'move', 'height', 'rotate', 'scale'. */
        this.activeTool = 'move';
        /** Tool actually used by the drag in progress. */
        this.dragMode = 'move';

        /** Keys currently held down, used for temporary tool overrides. */
        this.pressedKeys = new Set();

        /** Called with the controller whenever the selection or a transform changes. */
        this.onSelectionChange = null;

        // Enable/disable flag
        this.enabled = false;

        // Event listeners (stored for cleanup)
        this.onMouseDownListener = this.onMouseDown.bind(this);
        this.onMouseMoveListener = this.onMouseMove.bind(this);
        this.onMouseUpListener = this.onMouseUp.bind(this);
        this.onWheelListener = this.onWheel.bind(this);
        this.onKeyDownListener = this.onKeyDown.bind(this);
        this.onKeyUpListener = this.onKeyUp.bind(this);
        this.onWindowBlurListener = () => this.pressedKeys.clear();

        // Visual feedback - outline material for selection
        this.outlineMaterial = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            depthTest: false,
            transparent: true
        });
    }

    /**
     * Enable interactive controls
     * @return {void}
     */
    enable() {
        if (this.enabled) return;

        this.enabled = true;

        // Capture phase: the media controller must see the event before iTowns'
        // PlanarControls (which listens on the same element in the bubble phase),
        // otherwise the camera starts panning as soon as an object is grabbed.
        const options = { capture: true };
        this.view.domElement.addEventListener('mousedown', this.onMouseDownListener, options);
        this.view.domElement.addEventListener('wheel', this.onWheelListener, { capture: true, passive: false });

        // Move and up are watched on the window so a drag survives the pointer
        // leaving the canvas.
        window.addEventListener('mousemove', this.onMouseMoveListener, options);
        window.addEventListener('mouseup', this.onMouseUpListener, options);
        window.addEventListener('keydown', this.onKeyDownListener);
        window.addEventListener('keyup', this.onKeyUpListener);
        window.addEventListener('blur', this.onWindowBlurListener);

        console.log('InteractiveObjectController: Enabled');
    }

    /**
     * Disable interactive controls
     * @return {void}
     */
    disable() {
        if (!this.enabled) return;

        this.enabled = false;

        const options = { capture: true };
        this.view.domElement.removeEventListener('mousedown', this.onMouseDownListener, options);
        this.view.domElement.removeEventListener('wheel', this.onWheelListener, options);
        window.removeEventListener('mousemove', this.onMouseMoveListener, options);
        window.removeEventListener('mouseup', this.onMouseUpListener, options);
        window.removeEventListener('keydown', this.onKeyDownListener);
        window.removeEventListener('keyup', this.onKeyUpListener);
        window.removeEventListener('blur', this.onWindowBlurListener);

        this.pressedKeys.clear();
        this.isDragging = false;
        this._restoreCameraControls();
        this.deselectObject();
        console.log('InteractiveObjectController: Disabled');
    }

    /**
     * Change the tool used by the next drag.
     * @param  {string} tool - 'move', 'height', 'rotate' or 'scale'
     * @return {void}
     */
    setActiveTool(tool) {
        this.activeTool = tool;
        this._notifySelectionChange();
    }

    /**
     * Handle mouse down - detect click, select object and start a drag
     * @param  {MouseEvent} event - Mouse event
     * @return {void}
     */
    onMouseDown(event) {
        if (!this.enabled || event.button !== 0) return;

        // Let the UI overlays (toggle buttons, toolbar...) handle their own clicks.
        if (this._isUiEvent(event)) return;

        this._updateMouseCoordinates(event);

        const intersected = this._raycastFromMouse();
        const mode = this._resolveDragMode(event);

        // Height, rotate and scale act on the current selection, so they do not
        // require grabbing the object itself, which is hard to hit once it is small.
        const target = intersected || (mode !== 'move' ? this.selectedObject : null);

        if (!target) {
            // Clicking the void clears the selection and leaves the camera alone.
            this.deselectObject();
            return;
        }

        // We are taking over this gesture: keep iTowns from panning the camera.
        this._takeOverEvent(event);

        // PlanarControls normally focuses the view on mousedown; we just stopped it
        // from running, so do it here to keep the arrow-key step navigation alive.
        this.view.domElement.focus();

        if (target !== this.selectedObject) {
            this.selectObject(target);
        }

        this.dragMode = mode;
        this.isDragging = true;
        this.previousMouse.copy(this.mouse);

        if (mode === 'move' || mode === 'height') {
            this._setupPositionDragPlane(mode, target);

            if (!this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPoint)) {
                console.warn('InteractiveObjectController: initial plane intersection failed');
                this.isDragging = false;
                this._restoreCameraControls();
                return;
            }

            this.dragOffset.copy(this.dragPoint).sub(target.position);
        }

        console.log('InteractiveObjectController: dragging', target.userData.mediaId, 'with tool', mode);
    }

    /**
     * Handle mouse move - apply the current tool to the selected object
     * @param  {MouseEvent} event - Mouse event
     * @return {void}
     */
    onMouseMove(event) {
        if (!this.enabled || !this.isDragging || !this.selectedObject) return;

        this._takeOverEvent(event);
        this._updateMouseCoordinates(event);

        switch (this.dragMode) {
            case 'move':
            case 'height':
                this._applyPositionDrag();
                break;
            case 'rotate':
                this._applyRotationDrag();
                break;
            case 'scale':
                this._applyScaleDrag();
                break;
            default:
                break;
        }

        this.previousMouse.copy(this.mouse);
        this._updateSelectionOutline();
        this.view.notifyChange();
    }

    /**
     * Handle mouse up - finalize the drag and write the transform back to the config
     * @param  {MouseEvent} event - Mouse event
     * @return {void}
     */
    onMouseUp(event) {
        if (!this.enabled) return;
        if (!this.isDragging) return;

        this._takeOverEvent(event);
        this.isDragging = false;
        this._restoreCameraControls();

        if (this.selectedObject) {
            this._updateConfigTransform();
            console.log('InteractiveObjectController: finalized transform for',
                this.selectedObject.userData.mediaId);
        }
        this._notifySelectionChange();
    }

    /**
     * Handle the wheel - scale the selected object instead of zooming the camera.
     * Only active while the scale tool is selected or the S key is held.
     * @param  {WheelEvent} event - Wheel event
     * @return {void}
     */
    onWheel(event) {
        if (!this.enabled || !this.selectedObject) return;
        if (this.activeTool !== 'scale' && !this.pressedKeys.has('s')) return;

        this._takeOverEvent(event);

        const factor = Math.exp(-event.deltaY * this.wheelScaleSensitivity);
        this._scaleSelected(factor);

        this._updateSelectionOutline();
        this.view.notifyChange();
        this._updateConfigTransform();
        this._notifySelectionChange();
    }

    /**
     * Track modifier keys and handle the delete shortcut.
     * @param  {KeyboardEvent} event - Keyboard event
     * @return {void}
     */
    onKeyDown(event) {
        if (!this.enabled) return;
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

        this.pressedKeys.add(event.key.toLowerCase());

        if ((event.key === 'Delete' || event.key === 'Backspace') && this.selectedObject) {
            event.preventDefault();
            this.removeSelectedObject();
        }
    }

    /**
     * Stop tracking a released modifier key.
     * @param  {KeyboardEvent} event - Keyboard event
     * @return {void}
     */
    onKeyUp(event) {
        this.pressedKeys.delete(event.key.toLowerCase());
    }

    /**
     * Select an object and provide visual feedback
     * @param  {THREE.Object3D} object - Object to select
     * @return {void}
     */
    selectObject(object) {
        const mediaRoot = this._findMediaRoot(object);
        if (!mediaRoot) return;

        if (this.selectedObject === mediaRoot) return;

        if (this.selectedObject) {
            this.deselectObject();
        }

        this.selectedObject = mediaRoot;
        this._createSelectionOutline();

        // Slight transparency so the selected object reads as "grabbed"
        if (mediaRoot.material && typeof mediaRoot.material.opacity === 'number') {
            mediaRoot.userData.originalOpacity = mediaRoot.material.opacity;
            mediaRoot.material.transparent = true;
            mediaRoot.material.opacity *= 0.8;
        }

        this.view.notifyChange();
        this._notifySelectionChange();
    }

    /**
     * Deselect current object and remove visual feedback
     * @return {void}
     */
    deselectObject() {
        if (!this.selectedObject) return;

        if (this.selectedObject.material && this.selectedObject.userData.originalOpacity !== undefined) {
            this.selectedObject.material.opacity = this.selectedObject.userData.originalOpacity;
            delete this.selectedObject.userData.originalOpacity;
        }

        this._removeSelectionOutline();

        this.selectedObject = null;
        this.view.notifyChange();
        this._notifySelectionChange();
    }

    /**
     * Reset the selected object rotation and scale to their default values.
     * @return {void}
     */
    resetSelectedTransform() {
        if (!this.selectedObject) return;

        const initial = this.selectedObject.userData.initialTransform;

        if (initial?.rotation) {
            const { x, y, z, w } = initial.rotation;
            this.selectedObject.quaternion.set(x, y, z, w);
        } else {
            this.selectedObject.quaternion.identity();
        }

        if (initial?.scale) {
            this.selectedObject.scale.set(initial.scale.x, initial.scale.y, initial.scale.z);
        } else {
            this.selectedObject.scale.set(1, 1, 1);
        }

        this.selectedObject.updateMatrixWorld(true);

        this._updateSelectionOutline();
        this._updateConfigTransform();
        this.view.notifyChange();
        this._notifySelectionChange();
    }

    /**
     * Remove the selected object from the scene and from the step configuration.
     * @return {void}
     */
    removeSelectedObject() {
        const object = this.selectedObject;
        if (!object) return;

        const mediaId = object.userData.mediaId;
        this.deselectObject();

        this.guidedVisit.mediaManager.removeMediaObject(object);

        const currentStep = this.guidedVisit.getCurrentStep();
        if (currentStep && Array.isArray(currentStep.media)) {
            currentStep.media = currentStep.media.filter((entry) => entry.id !== mediaId);
        }

        this.view.notifyChange();
    }

    /**
     * Copy the transform of the selected object to the clipboard, ready to be
     * pasted into a config file.
     * @return {object|null} - The copied transform
     */
    copySelectedTransformToClipboard() {
        if (!this.selectedObject) {
            console.warn('No object selected to copy transform');
            return null;
        }

        const { position, quaternion, scale } = this.selectedObject;

        const transformData = {
            id: this.selectedObject.userData.mediaId,
            position: { x: position.x, y: position.y, z: position.z },
            rotation: { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w },
            scale: { x: scale.x, y: scale.y, z: scale.z }
        };

        const serialized = JSON.stringify(transformData, null, 2);
        navigator.clipboard?.writeText(serialized).catch((error) => {
            console.warn('Clipboard unavailable, transform logged instead:', error);
        });
        console.log('Copied transform to clipboard:', serialized);

        return transformData;
    }

    /**
     * Decide which tool the drag being started should use.
     * @param  {MouseEvent} event - Mouse event
     * @return {string} - 'move', 'height', 'rotate' or 'scale'
     */
    _resolveDragMode(event) {
        if (this.pressedKeys.has('s')) return 'scale';
        if (this.pressedKeys.has('r')) return 'rotate';
        if (event.shiftKey) return 'height';
        return this.activeTool;
    }

    /**
     * Setup the plane used to move an object.
     * 'move' uses the horizontal plane through the object, 'height' a vertical
     * plane facing the camera, so both drags follow the mouse one to one.
     * @param  {string} mode - 'move' or 'height'
     * @param  {THREE.Object3D} object - Object being dragged
     * @return {void}
     */
    _setupPositionDragPlane(mode, object) {
        if (mode === 'height') {
            const cameraDirection = new THREE.Vector3();
            this.view.camera.camera3D.getWorldDirection(cameraDirection);
            cameraDirection.z = 0;

            if (cameraDirection.lengthSq() < 1e-6) {
                // Camera looking straight down: any vertical plane will do.
                cameraDirection.set(0, 1, 0);
            }
            cameraDirection.normalize();

            this.dragPlane.setFromNormalAndCoplanarPoint(cameraDirection, object.position);
            return;
        }

        this.dragPlane.setFromNormalAndCoplanarPoint(WORLD_UP, object.position);
    }

    /**
     * Move the selected object along the current drag plane.
     * @return {void}
     */
    _applyPositionDrag() {
        this.raycaster.setFromCamera(this.mouse, this.view.camera.camera3D);

        const dragPoint = new THREE.Vector3();
        if (!this.raycaster.ray.intersectPlane(this.dragPlane, dragPoint)) {
            return;
        }

        const newPosition = dragPoint.sub(this.dragOffset);

        if (this.dragMode === 'height') {
            // Only the altitude is taken from the vertical plane intersection.
            this.selectedObject.position.z = newPosition.z;
        } else {
            this.selectedObject.position.copy(newPosition);
        }

        this.selectedObject.updateMatrixWorld(true);
    }

    /**
     * Rotate the selected object: horizontal mouse motion spins it around the
     * world up axis, vertical motion tilts it around the camera right axis.
     * @return {void}
     */
    _applyRotationDrag() {
        const deltaX = this.mouse.x - this.previousMouse.x;
        const deltaY = this.mouse.y - this.previousMouse.y;

        const cameraRight = new THREE.Vector3();
        this.view.camera.camera3D.matrixWorld.extractBasis(cameraRight, new THREE.Vector3(), new THREE.Vector3());
        cameraRight.normalize();

        const yaw = new THREE.Quaternion().setFromAxisAngle(
            WORLD_UP,
            -deltaX * this.rotationSensitivity
        );
        const pitch = new THREE.Quaternion().setFromAxisAngle(
            cameraRight,
            -deltaY * this.rotationSensitivity
        );

        // premultiply: the rotations are expressed in world space, not object space.
        this.selectedObject.quaternion.premultiply(yaw).premultiply(pitch).normalize();
        this.selectedObject.updateMatrixWorld(true);
    }

    /**
     * Scale the selected object uniformly from the vertical mouse motion.
     * @return {void}
     */
    _applyScaleDrag() {
        const deltaY = this.mouse.y - this.previousMouse.y;
        this._scaleSelected(Math.exp(deltaY * this.scaleSensitivity));
        this.selectedObject.updateMatrixWorld(true);
    }

    /**
     * Multiply the selected object scale, keeping it within sane bounds.
     * @param  {number} factor - Multiplication factor
     * @return {void}
     */
    _scaleSelected(factor) {
        if (!this.selectedObject || !Number.isFinite(factor) || factor <= 0) return;

        const scale = this.selectedObject.scale;
        const clamped = THREE.MathUtils.clamp(scale.x * factor, this.minScale, this.maxScale);
        const applied = clamped / scale.x;

        scale.multiplyScalar(applied);
        this.selectedObject.updateMatrixWorld(true);
    }

    /**
     * Prevent iTowns' camera controls from reacting to an event we handle ourselves.
     * @param  {Event} event - Event being consumed
     * @return {void}
     */
    _takeOverEvent(event) {
        event.preventDefault();
        event.stopPropagation();
        // PlanarControls listens on the same element: only stopping immediate
        // propagation guarantees it never sees the event.
        event.stopImmediatePropagation();

        const controls = this.view.controls;
        if (controls) {
            controls.enabled = false;
            controls.state = ITOWNS_CONTROL_STATE_NONE;
        }
    }

    /**
     * Give the camera controls back to iTowns once a drag is over.
     * @return {void}
     */
    _restoreCameraControls() {
        const controls = this.view.controls;
        if (controls) {
            controls.state = ITOWNS_CONTROL_STATE_NONE;
            controls.enabled = true;
        }
    }

    /**
     * Whether the event targets one of the HTML overlays (buttons, toolbar...)
     * rather than the 3D canvas.
     * @param  {Event} event - Event to test
     * @return {boolean}
     */
    _isUiEvent(event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return false;

        return Boolean(target.closest('button, input, select, textarea, label, a, .interactive_panel'));
    }

    /**
     * Walk up the hierarchy to find the object carrying the media user data,
     * so clicking a sub-mesh of a loaded 3D model selects the whole model.
     * @param  {THREE.Object3D} object - Object hit by the raycaster
     * @return {THREE.Object3D|null}
     */
    _findMediaRoot(object) {
        let current = object;
        while (current) {
            if (current.userData?.isMedia) return current;
            current = current.parent;
        }
        return null;
    }

    /**
     * Raycast from mouse position to find intersected media objects
     * @return {THREE.Object3D|null} - Media root of the first intersection, or null
     */
    _raycastFromMouse() {
        this.raycaster.setFromCamera(this.mouse, this.view.camera.camera3D);

        const mediaObjects = [];
        this.view.scene.traverse((obj) => {
            if (obj.userData?.isMedia) {
                mediaObjects.push(obj);
            }
        });

        if (mediaObjects.length === 0) return null;

        const intersects = this.raycaster.intersectObjects(mediaObjects, true);
        if (intersects.length === 0) return null;

        return this._findMediaRoot(intersects[0].object);
    }

    /**
     * Update normalized mouse coordinates from event
     * @param  {MouseEvent} event - Mouse event
     * @return {void}
     */
    _updateMouseCoordinates(event) {
        const rect = this.view.domElement.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        this.mouse.x = (x / rect.width) * 2 - 1;
        this.mouse.y = -(y / rect.height) * 2 + 1;
    }

    /**
     * Create the unit box outline used as selection feedback.
     * It is scaled to the object bounding box on every update, so rotation and
     * scale changes are reflected without rebuilding any geometry.
     * @return {void}
     */
    _createSelectionOutline() {
        this._removeSelectionOutline();

        const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
        this.selectedOutline = new THREE.LineSegments(edges, this.outlineMaterial);
        this.selectedOutline.renderOrder = 999;
        this.selectedOutline.userData.isSelectionOutline = true;

        this.view.scene.add(this.selectedOutline);
        this._updateSelectionOutline();
    }

    /**
     * Remove the selection outline from the scene.
     * @return {void}
     */
    _removeSelectionOutline() {
        if (!this.selectedOutline) return;

        this.selectedOutline.removeFromParent();
        this.selectedOutline.geometry.dispose();
        this.selectedOutline = null;
    }

    /**
     * Fit the outline to the selected object world bounding box.
     * @return {void}
     */
    _updateSelectionOutline() {
        if (!this.selectedOutline || !this.selectedObject) return;

        const box = new THREE.Box3().setFromObject(this.selectedObject);
        if (box.isEmpty()) return;

        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        this.selectedOutline.position.copy(center);
        this.selectedOutline.scale.set(
            Math.max(size.x, 0.001),
            Math.max(size.y, 0.001),
            Math.max(size.z, 0.001)
        );
        this.selectedOutline.updateMatrixWorld(true);
    }

    /**
     * Notify listeners (UI) that the selection or its transform changed.
     * @return {void}
     */
    _notifySelectionChange() {
        if (typeof this.onSelectionChange === 'function') {
            this.onSelectionChange(this);
        }
    }

    /**
     * Write the selected object transform back to the guidedVisit config, both in
     * the current step override and in the global media config, so the object
     * keeps its placement when navigating away and back.
     * @return {void}
     */
    _updateConfigTransform() {
        if (!this.selectedObject) return;

        const mediaId = this.selectedObject.userData.mediaId;
        if (mediaId === null || mediaId === undefined) return;

        const { position, quaternion, scale } = this.selectedObject;
        const transform = {
            position: { x: position.x, y: position.y, z: position.z },
            rotation: { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w },
            scale: { x: scale.x, y: scale.y, z: scale.z }
        };

        const currentStep = this.guidedVisit.getCurrentStep();
        const stepEntry = currentStep?.media?.find((entry) => entry.id === mediaId);
        if (stepEntry) {
            Object.assign(stepEntry, transform);
        }

        const mediaEntry = this.guidedVisit.mediaConfig?.find?.((media) => media.id === mediaId);
        if (mediaEntry) {
            Object.assign(mediaEntry, transform);
        }
    }

    /**
     * Cleanup: Remove all event listeners and selection
     * @return {void}
     */
    cleanup() {
        this.disable();

        if (this.outlineMaterial) {
            this.outlineMaterial.dispose();
        }
    }
}

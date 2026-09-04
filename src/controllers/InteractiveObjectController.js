import * as THREE from 'three';

/**
 * InteractiveObjectController: Handles interactive manipulation of media objects in Phase 1
 * Responsibilities:
 * - Detect clicks on loaded media objects
 * - Select/deselect objects with visual feedback
 * - Drag objects around the scene
 * - Update media configuration in real-time
 * - Manage raycasting and mouse events
 */
export class InteractiveObjectController {
    constructor(view, guidedVisit) {
        this.view = view;
        this.guidedVisit = guidedVisit;

        // Raycasting setup
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.previousMouse = new THREE.Vector2();

        // Rotation sensitivity
        this.rotationSensitivity = 0.5;

        // Selection and drag state
        this.selectedObject = null;
        this.selectedOutline = null;
        this.isDragging = false;
        this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        this.dragPoint = new THREE.Vector3();
        this.dragOffset = new THREE.Vector3();
        this.dragMode = 'position'; // Can be 'position', 'rotation', or 'scale'

        // Enable/disable flag
        this.enabled = false;

        // Event listeners (stored for cleanup)
        this.onMouseDownListener = this.onMouseDown.bind(this);
        this.onMouseMoveListener = this.onMouseMove.bind(this);
        this.onMouseUpListener = this.onMouseUp.bind(this);

        // Visual feedback - outline material for selection
        this.outlineMaterial = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            linewidth: 2
        });
    }

    /**
     * Enable interactive controls
     * @return {void}
     */
    enable() {
        if (this.enabled) return;

        this.enabled = true;
        this.view.domElement.addEventListener('mousedown', this.onMouseDownListener);
        this.view.domElement.addEventListener('mousemove', this.onMouseMoveListener);
        this.view.domElement.addEventListener('mouseup', this.onMouseUpListener);

        console.log('InteractiveObjectController: Enabled');
    }

    /**
     * Disable interactive controls
     * @return {void}
     */
    disable() {
        if (!this.enabled) return;

        this.enabled = false;
        this.view.domElement.removeEventListener('mousedown', this.onMouseDownListener);
        this.view.domElement.removeEventListener('mousemove', this.onMouseMoveListener);
        this.view.domElement.removeEventListener('mouseup', this.onMouseUpListener);

        this.deselectObject();
        console.log('InteractiveObjectController: Disabled');
    }

    /**
     * Handle mouse down - detect click and select object
     * @param  {MouseEvent} event - Mouse event
     * @return {void}
     */
    onMouseDown(event) {
        if (!this.enabled) return;

        // Get normalized mouse coordinates
        this._updateMouseCoordinates(event);
        console.log('Mouse down at:', this.mouse);

        // Raycast to find intersected objects
        const intersected = this._raycastFromMouse();

        // Si r, position, sinon rotation
        if (!this.keydownListener) {
            this.keydownListener = (event) => {
                if (event.key === 'r' || event.key === 'R') {
                    this.dragMode = 'rotation';
                    console.log('Drag mode switched to:', this.dragMode);
                }
            };
            this.keyupListener = (event) => {
                if (event.key === 'r' || event.key === 'R') {
                    this.dragMode = 'position';
                    console.log('Drag mode switched to:', this.dragMode);
                }
            };
            window.addEventListener('keydown', this.keydownListener);
            window.addEventListener('keyup', this.keyupListener);
        }
        
        if (this.dragMode === 'position') {
            if (intersected) {
                this.selectObject(intersected);
                this.isDragging = true;
                this.view.controls.enabled = false; // Disable orbit controls while dragging

                // Setup drag plane perpendicular to camera view direction
                const camera = this.view.camera.camera3D;
                const cameraDirection = new THREE.Vector3();
                camera.getWorldDirection(cameraDirection);
                cameraDirection.normalize();

                // Plane normal points toward camera (perpendicular to screen)
                this.dragPlane.setFromNormalAndCoplanarPoint(
                    cameraDirection,
                    intersected.position
                );

                // Calculate offset between click point and object center
                const planeIntersection = this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPoint);
                if (!planeIntersection) {
                    console.warn('Initial plane intersection failed!');
                    this.isDragging = false;
                    return;
                }
                
                this.dragOffset.copy(this.dragPoint).sub(intersected.position);

                console.log('InteractiveObjectController: Selected object', intersected.userData.mediaId, 
                    'at position', {x: intersected.position.x.toFixed(2), y: intersected.position.y.toFixed(2), z: intersected.position.z.toFixed(2)},
                    'dragOffset:', {x: this.dragOffset.x.toFixed(2), y: this.dragOffset.y.toFixed(2), z: this.dragOffset.z.toFixed(2)});
            }
        } else if (this.dragMode === 'rotation') {
            if (intersected) {
                this.selectObject(intersected);
                this.isDragging = true;
                this.view.controls.enabled = false; // Disable orbit controls while dragging
                
                // store current mouse coordinates for rotation calculations
                this.previousMouse.copy(this.mouse);

                console.log('InteractiveObjectController: Selected object for rotation', intersected.userData.mediaId);
            }
        }
    }

    /**
     * Handle mouse move - drag selected object or rotate it
     * @param  {MouseEvent} event - Mouse event
     * @return {void}
     */
    onMouseMove(event) {
        if (!this.enabled || !this.isDragging || !this.selectedObject) {
            return;
        }

        // Prevent iTowns camera controls from interfering during drag
        event.preventDefault();
        event.stopPropagation();

        // Get normalized mouse coordinates
        this._updateMouseCoordinates(event);

        if (this.dragMode === 'position') {
            const oldPos = this.selectedObject.position.clone();

            // Recalculate ray from camera to mouse
            this.raycaster.setFromCamera(this.mouse, this.view.camera.camera3D);

            // Calculate new position on drag plane
            const dragPoint = new THREE.Vector3();
            const intersectionResult = this.raycaster.ray.intersectPlane(this.dragPlane, dragPoint);
            
            if (intersectionResult) {
                // Remove drag offset to get actual object position
                const newPosition = dragPoint.clone().sub(this.dragOffset);

                // Update object position in scene
                this.selectedObject.position.copy(newPosition);
                this.selectedObject.updateMatrixWorld();

                // Update outline position to match object's bounding box center
                if (this.selectedOutline) {
                    const box = new THREE.Box3().setFromObject(this.selectedObject);
                    const center = box.getCenter(new THREE.Vector3());
                    this.selectedOutline.position.copy(center);
                    this.selectedOutline.updateMatrixWorld();
                }

                // Log position change
                const positionChanged = !oldPos.equals(newPosition);
                console.log('Move event - Mouse:', {x: this.mouse.x.toFixed(3), y: this.mouse.y.toFixed(3)}, 
                    'DragPoint:', {x: dragPoint.x.toFixed(2), y: dragPoint.y.toFixed(2), z: dragPoint.z.toFixed(2)},
                    'Offset:', {x: this.dragOffset.x.toFixed(2), y: this.dragOffset.y.toFixed(2), z: this.dragOffset.z.toFixed(2)},
                    'New Pos:', {x: newPosition.x.toFixed(2), y: newPosition.y.toFixed(2), z: newPosition.z.toFixed(2)},
                    'Changed:', positionChanged);

                this.view.notifyChange();
            } else {
                console.warn('Drag plane intersection FAILED - Plane:', this.dragPlane, 'Ray origin:', this.raycaster.ray.origin);
            }

        } else if (this.dragMode === 'rotation') {
            const deltaX = this.mouse.x - this.previousMouse.x;
            const deltaY = this.mouse.y - this.previousMouse.y;

            // Rotation autour de y
            const rotationY = new THREE.Quaternion();
            rotationY.setFromAxisAngle(new THREE.Vector3(0, 1, 0), deltaX * this.rotationSensitivity);
            this.selectedObject.quaternion.multiplyQuaternions(rotationY, this.selectedObject.quaternion);

            // Autour de x
            const rotationX = new THREE.Quaternion();
            rotationX.setFromAxisAngle(new THREE.Vector3(1, 0, 0), deltaY * this.rotationSensitivity);
            this.selectedObject.quaternion.multiplyQuaternions(rotationX, this.selectedObject.quaternion);

            this.selectedObject.updateMatrix();
            this.selectedObject.updateMatrixWorld(true);

            // Update outline position to match object's bounding box center
            if (this.selectedOutline) {
                const box = new THREE.Box3().setFromObject(this.selectedObject);
                const center = box.getCenter(new THREE.Vector3());
                this.selectedOutline.position.copy(center);
                this.selectedOutline.updateMatrixWorld();
            }

            console.log('Rotation event - Delta:', {x: deltaX.toFixed(3), y: deltaY.toFixed(3)}, 
               'Rotation:', {x: this.selectedObject.rotation.x.toFixed(2), y: this.selectedObject.rotation.y.toFixed(2), z: this.selectedObject.rotation.z.toFixed(2)});

            this.view.notifyChange();
        }

        // Update previous mouse position for next frame
        this.previousMouse.copy(this.mouse);
    }

    /**
     * Handle mouse up - finalize drag and update config
     * @param  {MouseEvent} event - Mouse event
     * @return {void}
     */
    onMouseUp(event) {
        if (!this.enabled) return;

        if (this.isDragging && this.selectedObject) {
            // Prevent iTowns camera controls from interfering
            event.preventDefault();
            event.stopPropagation();

            this.isDragging = false;

            // Update config with new position
            this._updateConfigPosition();
            console.log('InteractiveObjectController: Finalized position for', this.selectedObject.userData.mediaId);
        }
        this.view.controls.enabled = true; // Re-enable orbit controls after selection
    }

    /**
     * Select an object and provide visual feedback
     * @param  {THREE.Object3D} object - Object to select
     * @return {void}
     */
    selectObject(object) {
        if (!object || !object.userData.isMedia) return;

        // Deselect previous
        if (this.selectedObject) {
            this.deselectObject();
        }

        this.selectedObject = object;

        // Create visual feedback (outline)
        this._createSelectionOutline(object);

        // Store original material opacity for visual feedback
        if (object.material && typeof object.material.opacity === 'number') {
            object.userData.originalOpacity = object.material.opacity;
            object.material.opacity *= 0.8;
        }

        this.view.notifyChange();
    }

    /**
     * Deselect current object and remove visual feedback
     * @return {void}
     */
    deselectObject() {
        if (!this.selectedObject) return;

        // Restore original opacity
        if (this.selectedObject.material && this.selectedObject.userData.originalOpacity !== undefined) {
            this.selectedObject.material.opacity = this.selectedObject.userData.originalOpacity;
            delete this.selectedObject.userData.originalOpacity;
        }

        // Remove outline
        if (this.selectedOutline && this.selectedOutline.parent) {
            this.selectedOutline.parent.remove(this.selectedOutline);
        }
        this.selectedOutline = null;

        this.selectedObject = null;
        this.view.notifyChange();
    }

    /**
     * 
     * 
     */
    copySelectedTransformToClipboard(){
        if (!this.selectedObject) {
            console.warn('No object selected to copy transform');
            return;
        }

        const position = this.selectedObject.position;
        const rotation = this.selectedObject.quaternion;
        const scale = this.selectedObject.scale;
        
        const transformData = {
            position: { x: position.x, y: position.y, z: position.z },
            rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
            scale: { x: scale.x, y: scale.y, z: scale.z }
        };

        navigator.clipboard.writeText(JSON.stringify(transformData)); // Copier dans le ctrlc/v
        console.log('Copied transform to clipboard:', transformData);
    }

    /**
     * Create a visual outline for a selected object
     * @param  {THREE.Object3D} object - Object to outline
     * @return {void}
     */
    _createSelectionOutline(object) {
        // Remove old outline if exists
        if (this.selectedOutline && this.selectedOutline.parent) {
            this.selectedOutline.parent.remove(this.selectedOutline);
        }

        // Create box outline based on object bounds
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Create edges geometry
        const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        const edges = new THREE.EdgesGeometry(geometry);
        this.selectedOutline = new THREE.LineSegments(edges, this.outlineMaterial);

        // Position outline at the bounding box center (in world space)
        // Don't apply object's rotation or scale—the bounding box already accounts for them
        this.selectedOutline.position.copy(center);
        this.selectedOutline.rotation.set(0, 0, 0);
        this.selectedOutline.scale.set(1, 1, 1);

        // Add to scene
        this.view.scene.add(this.selectedOutline);
    }

    /**
     * Raycast from mouse position to find intersected media objects
     * @return {THREE.Object3D|null} - First intersected media object or null
     */
    _raycastFromMouse() {
        this.raycaster.setFromCamera(this.mouse, this.view.camera.camera3D);

        // Get all children of scene
        const mediaObjects = [];
        this.view.scene.traverse((obj) => {
            if (obj.userData?.isMedia) {
                mediaObjects.push(obj);
            }
        });

        if (mediaObjects.length === 0) return null;

        // Raycast and return first intersection
        const intersects = this.raycaster.intersectObjects(mediaObjects);
        if (intersects.length > 0) {
            return intersects[0].object;
        }

        return null;
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
     * Update config with new object position
     * Syncs the moved object back to the guidedVisit config
     * @return {void}
     */
    _updateConfigPosition() {
        if (!this.selectedObject) return;

        const mediaId = this.selectedObject.userData.mediaId;
        const position = this.selectedObject.position;
        const rotation = this.selectedObject.quaternion;
        const scale = this.selectedObject.scale;

        // Find media in current step config
        const currentStep = this.guidedVisit.getCurrentStep();
        if (!currentStep || !currentStep.media) return;

        // Find and update the media entry
        for (const media of currentStep.media) {
            if (media.id === mediaId) {
                // Update or create position/rotation/scale
                media.position = {
                    x: position.x,
                    y: position.y,
                    z: position.z
                };

                media.rotation = {
                    x: rotation.x,
                    y: rotation.y,
                    z: rotation.z,
                    w: rotation.w
                };

                media.scale = {
                    x: scale.x,
                    y: scale.y,
                    z: scale.z
                };

                console.log('InteractiveObjectController: Updated config for', mediaId, media.position);
                return;
            }
        }
    }

    /**
     * Cleanup: Remove all event listeners and selection
     * @return {void}
     */
    cleanup() {
        this.disable();
        this.deselectObject();

        if (this.outlineMaterial) {
            this.outlineMaterial.dispose();
        }
    }
}

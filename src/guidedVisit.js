import { GuidedTour } from '@ud-viz/widget_guided_tour';
import * as THREE from 'three';
import { MediaManager } from './managers/MediaManager.js';
import { AnimationController } from './managers/AnimationController.js';
import { BubbleManager } from './managers/BubbleManager.js';
import { BuildingInteraction } from './managers/BuildingInteraction.js';
import { InteractiveObjectController } from './controllers/InteractiveObjectController.js';
import { createDebugCubes, removeDebugCubes } from './utils/SceneUtils.js';

export class GuidedVisit extends GuidedTour {
    constructor(view, config, medias) {
        super(view, config, medias);

        // Initialize managers
        this.mediaManager = new MediaManager(view, this);
        this.animationController = new AnimationController(view, this);
        this.bubbleManager = new BubbleManager(view);
        this.buildingInteraction = new BuildingInteraction(view, this.bubbleManager);
        this.interactiveObjectController = new InteractiveObjectController(view, this);

        // State tracking
        this.currentLookAtIndex = 0;
        this.debugCubes = [];
        this.fsImageDisplayed = false;

        // Setup event listeners
        this.nextStepArrowPressEvent();
        this.nextLookAtPointEvent();
        this.buildingInteraction.onClickOnBuilding();
        this.buildingInteraction.createBuildingClickToggleButton();
        this.createInteractiveToggleButton();
        this.createCopyTransformButton();
    }

    /**
     * Fonction qui permet d'effectuer les actions d'une étape lorsqu'on se déplace vers celle-ci.
     * @param  {number} index - Index de l'étape.
     * @return {void} 
     */
    async goToStep(index) {
        if (this.currentIndex === index) return;

        this.currentLookAtIndex = 0;
        this.buildingInteraction.setBuildingClickEnabled(false);
        this.interactiveObjectController.disable();
        this.updateInteractiveToggleButton();
        this.mediaManager.removeMedia();
        this.removeDebugCubes();
        this.animationController.stopCameraAnimation();

        this.currentIndex = index;
        const step = this.getCurrentStep();
        console.log("je passe dans goToStep", "nouveau step: ", step)

        if (step.media && step.media.length > 0) {
            this.mediaManager.addMedia(step.media);
        }

        if (step.cameraPosition || step.cameraRotation) {
            this.animationController.cameraToPosition(step.cameraPosition, step.cameraRotation);
        }

        if (step.layers && step.layers.length > 0) {
            this.filterLayers(step.layers);
        }
        if (step.objectMovement && step.objectMovement.length > 0) {
            for (const objectMovement of step.objectMovement) {
                this.animationController.animateObjectAlongTrajectory(objectMovement.objectId, objectMovement);
            }
        }
        else if (step.cameraMovement && step.cameraMovement.type == 'rotation') {
            this.animationController.rotateCamera(step.cameraMovement);
        }
        else if (step.cameraLookAt && step.cameraLookAt.length > 0) {
            this.currentLookAtIndex = 0;
            this.animationController.cameraLookAtSmooth(step.cameraLookAt[0]);
            this.createDebugCubes(step.cameraLookAt);
        }
    }

    // addMedia is now delegated to mediaManager

    /**
     * Fonction evenement qui permet de passer à l'étape suivante ou précédente avec les flèches du clavier.
     * @return {void}
     */
    nextStepArrowPressEvent() {
        this.itownsView.domElement.addEventListener('keydown', async (event) => {
            const currentStep = this.getCurrentStep();
            if (event.key === 'ArrowRight') {
                if (currentStep.id + 1 < this.steps.length) { // ex: currentStep : Object { id:0, type: "half", layers: (3) […], media: (1) […] }
                    await this.goToStep(currentStep.id + 1);
                }
            } else if (event.key === 'ArrowLeft') {
                if (currentStep.id - 1 >= 0) {
                    await this.goToStep(currentStep.id - 1);
                }
            }
        }, false);
    }

    /**
     * Fonction evenement qui permet de passer au point de "lookAt" suivant avec la touche N du clavier.
     * @return {void}
     */
    nextLookAtPointEvent() {
        this.itownsView.domElement.addEventListener('keydown', (event) => {
            if (event.key.toLowerCase() !== 'n') return;

            const step = this.getCurrentStep();
            if (!step || !step.cameraLookAt || step.cameraLookAt.length === 0) {
                return;
            }

            this.currentLookAtIndex =
                (this.currentLookAtIndex + 1) % step.cameraLookAt.length;

            const nextPoint = step.cameraLookAt[this.currentLookAtIndex];

            this.animationController.cameraLookAtSmooth(nextPoint, 1200);
            this.itownsView.notifyChange();
        });
    }

    // fetchFile is now in SceneUtils

    // createMediaDiv is now in MediaManager

    // Transform helpers are now in MediaManager

    // Image, Video, and 3D object loading are now in MediaManager

    /**
     * Wrapper to create debug cubes using SceneUtils
     * @param  {Array} pointArray - List of points for cubes
     * @return {void}
     */
    createDebugCubes(pointArray) {
        this.debugCubes = createDebugCubes(this.itownsView, pointArray);
    }

    /**
     * Wrapper to remove debug cubes using SceneUtils
     * @return {void}
     */
    removeDebugCubes() {
        removeDebugCubes(this.itownsView, this.debugCubes);
        this.debugCubes = [];
    }


    /**
     * Wrapper to remove all media using MediaManager
     * @return {void}
     */
    removeMedia() {
        this.mediaManager.removeMedia();
    }

    // Building interaction methods are now delegated to buildingInteraction

    // Bubble methods are now delegated to bubbleManager

    /**
     * Wrapper for animationController.cameraToPosition
     */
    cameraToPosition(position, rotation) {
        this.animationController.cameraToPosition(position, rotation);
    }

    /**
     * Wrapper for animationController.cameraLookAt
     */
    cameraLookAt(position) {
        this.animationController.cameraLookAt(position);
    }

    /**
     * Wrapper for animationController.cameraLookAtSmooth
     */
    cameraLookAtSmooth(target, duration = 1200) {
        this.animationController.cameraLookAtSmooth(target, duration);
    }

    /**
     * Wrapper for animationController.stopCameraAnimation
     */
    stopCameraAnimation() {
        this.animationController.stopCameraAnimation();
    }

    /**
     * Wrapper for animationController.rotateCamera
     */
    async rotateCamera(cameraMovement) {
        return this.animationController.rotateCamera(cameraMovement);
    }

    /**
     * Wrapper for animationController.animateLookAtCamera
     */
    animateLookAtCamera(mesh) {
        this.animationController.animateLookAtCamera(mesh);
    }

    /**
     * Wrapper for animationController.animateObjectAlongTrajectory
     */
    animateObjectAlongTrajectory(targetObjectId, objectMovement) {
        this.animationController.animateObjectAlongTrajectory(targetObjectId, objectMovement);
    }

    /**
     * Enable interactive object manipulation (Phase 1)
     * Allows users to click, select, and drag media objects
     * @return {void}
     */
    enableInteractiveMode() {
        this.interactiveObjectController.enable();
    }

    /**
     * Disable interactive object manipulation
     * @return {void}
     */
    disableInteractiveMode() {
        this.interactiveObjectController.disable();
    }

    /**
     * Toggle interactive mode on/off
     * @return {boolean} - New enabled state
     */
    toggleInteractiveMode() {
        if (this.interactiveObjectController.enabled) {
            this.interactiveObjectController.disable();
            return false;
        } else {
            this.interactiveObjectController.enable();
            return true;
        }
    }

    /**
     * Create the interactive mode panel: the on/off toggle, the tool selector
     * (move / height / rotate / scale) and the actions on the current selection.
     * @return {void}
     */
    createInteractiveToggleButton() {
        if (this.interactivePanel) return;

        const panel = document.createElement('div');
        panel.className = 'interactive_panel';

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'interactive_panel_toggle';
        toggle.addEventListener('click', (event) => {
            event.stopPropagation();
            this.toggleInteractiveMode();
            this.updateInteractiveToggleButton();
        });
        panel.appendChild(toggle);

        const tools = document.createElement('div');
        tools.className = 'interactive_panel_tools';

        this.interactiveToolButtons = {};
        const toolLabels = {
            move: 'Déplacer',
            height: 'Hauteur',
            rotate: 'Tourner',
            scale: 'Taille'
        };

        for (const [tool, label] of Object.entries(toolLabels)) {
            const toolButton = document.createElement('button');
            toolButton.type = 'button';
            toolButton.className = 'interactive_panel_tool';
            toolButton.textContent = label;
            toolButton.addEventListener('click', (event) => {
                event.stopPropagation();
                this.interactiveObjectController.setActiveTool(tool);
                this.updateInteractiveToggleButton();
            });

            tools.appendChild(toolButton);
            this.interactiveToolButtons[tool] = toolButton;
        }
        panel.appendChild(tools);

        const actions = document.createElement('div');
        actions.className = 'interactive_panel_actions';

        const resetButton = document.createElement('button');
        resetButton.type = 'button';
        resetButton.className = 'interactive_panel_action';
        resetButton.textContent = 'Réinitialiser';
        resetButton.addEventListener('click', (event) => {
            event.stopPropagation();
            this.interactiveObjectController.resetSelectedTransform();
        });
        actions.appendChild(resetButton);

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'interactive_panel_action';
        deleteButton.textContent = 'Supprimer';
        deleteButton.addEventListener('click', (event) => {
            event.stopPropagation();
            this.interactiveObjectController.removeSelectedObject();
        });
        actions.appendChild(deleteButton);

        panel.appendChild(actions);

        const info = document.createElement('p');
        info.className = 'interactive_panel_info';
        panel.appendChild(info);

        this.itownsView.domElement.appendChild(panel);

        this.interactivePanel = panel;
        this.interactiveToggleButton = toggle;
        this.interactivePanelInfo = info;

        this.createCopyTransformButton();

        // Keep the panel in sync with what the controller is doing.
        this.interactiveObjectController.onSelectionChange = () =>
            this.updateInteractiveToggleButton();

        this.updateInteractiveToggleButton();
    }

    /**
     * Refresh the panel: toggle label, active tool highlight and selection info
     * @return {void}
     */
    updateInteractiveToggleButton() {
        if (!this.interactiveToggleButton) return;

        const controller = this.interactiveObjectController;
        const enabled = controller.enabled;

        this.interactiveToggleButton.textContent = enabled
            ? 'Interactive: ON'
            : 'Interactive: OFF';

        if (this.interactivePanel) {
            this.interactivePanel.classList.toggle('disabled', !enabled);
        }

        if (this.interactiveToolButtons) {
            for (const [tool, button] of Object.entries(this.interactiveToolButtons)) {
                button.classList.toggle('active', controller.activeTool === tool);
                button.disabled = !enabled;
            }
        }

        if (this.copyTransformButton) {
            this.copyTransformButton.disabled = !controller.selectedObject;
        }

        if (this.interactivePanelInfo) {
            this.interactivePanelInfo.textContent = this._interactiveInfoText();
        }
    }

    /**
     * Build the hint line shown under the tools.
     * @return {string} - Hint describing the selection and the shortcuts
     */
    _interactiveInfoText() {
        const controller = this.interactiveObjectController;

        if (!controller.enabled) {
            return 'Activer pour sélectionner et déplacer les médias de la scène.';
        }

        const selected = controller.selectedObject;
        if (!selected) {
            return 'Cliquer un média pour le sélectionner. Raccourcis: Maj = hauteur, R = rotation, S = taille (molette).';
        }

        const scale = selected.scale.x.toFixed(2);
        const altitude = selected.position.z.toFixed(1);

        return `Sélection: ${selected.userData.mediaId} — altitude ${altitude} m, échelle ×${scale}. `
            + 'Maj = hauteur, R = rotation, S = taille (molette), Suppr = supprimer.';
    }

    /**
     * Copy the transform of the currently selected object to the clipboard
     * @return {void}
     */
    createCopyTransformButton() {
        if (this.copyTransformButton) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'interactive_panel_action';
        button.textContent = 'Copy Transform';

        button.addEventListener('click', (event) => {
            event.stopPropagation();
            this.interactiveObjectController.copySelectedTransformToClipboard();
        });

        const actions = this.interactivePanel?.querySelector('.interactive_panel_actions');
        (actions || this.itownsView.domElement).appendChild(button);

        this.copyTransformButton = button;
    }
}

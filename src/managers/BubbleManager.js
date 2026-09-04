import * as THREE from 'three';

/**
 * BubbleManager: Handles creation, display, and positioning of UI bubbles
 * Responsibilities:
 * - Create and remove bubble popups
 * - Update bubble screen positions based on 3D coordinates
 * - Manage bubble lifecycle and animation loop
 */
export class BubbleManager {
    constructor(view) {
        this.view = view;
        this.bubbles = [];
        this.bubbleLoopId = null;
    }

    /**
     * Crée une bulle (div) dans la scène iTowns avec le contenu HTML à une position donnée
     * @param  {string} htmlContent - Contenu HTML de la bulle à créer
     * @param  {object} position - Position 3D de la bulle
     * @return {void}
     */
    createBubble(htmlContent, position) {
        const bubble = document.createElement('div');
        bubble.className = 'itowns-bubble';

        const bubbleObj = {
            element: bubble,
            position: position
        };

        // Close button
        const closeBtn = document.createElement('span');
        closeBtn.className = 'itowns-bubble-close-btn';
        closeBtn.innerHTML = ' &times;';
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            this.removeBubble(bubbleObj);
        };

        const content = document.createElement('div');
        content.innerHTML = htmlContent;

        bubble.appendChild(closeBtn);
        bubble.appendChild(content);

        this.view.domElement.appendChild(bubble);

        this.bubbles.push(bubbleObj);

        this.startBubbleLoop();
    }

    /**
     * Supprime une bulle spécifique ou toutes les bulles si aucune n'est spécifiée
     * @param  {object} bubbleObj - Bulle à supprimer (optionnel)
     * @return {void}
     */
    removeBubble(bubbleObj) {
        if (bubbleObj) {
            const index = this.bubbles.indexOf(bubbleObj);
            if (index > -1) {
                this.bubbles.splice(index, 1);
                if (bubbleObj.element && bubbleObj.element.parentNode) {
                    bubbleObj.element.parentNode.removeChild(bubbleObj.element);
                }
            }
        } else {
            // Remove ALL bubbles
            while (this.bubbles.length > 0) {
                this.removeBubble(this.bubbles[0]);
            }
        }

        // Stop loop if no more bubbles
        if (this.bubbles.length === 0) {
            this.stopBubbleLoop();
        }
    }

    /**
     * Lance la boucle de mise à jour des positions des bulles
     * @return {void}
     */
    startBubbleLoop() {
        if (this.bubbleLoopId) return; // Already running

        const update = () => {
            this.updateBubblePosition();
            this.bubbleLoopId = requestAnimationFrame(update);
        };
        this.bubbleLoopId = requestAnimationFrame(update);
    }

    /**
     * Arrête la boucle de mise à jour des positions des bulles
     * @return {void}
     */
    stopBubbleLoop() {
        if (this.bubbleLoopId) {
            cancelAnimationFrame(this.bubbleLoopId);
            this.bubbleLoopId = null;
        }
    }

    /**
     * Met à jour la position écran de toutes les bulles en fonction de leur position 3D
     * @return {void}
     */
    updateBubblePosition() {
        if (this.bubbles.length === 0) return;

        const camera = this.view.camera.camera3D;
        const width = this.view.domElement.clientWidth;
        const height = this.view.domElement.clientHeight;

        for (const bubbleObj of this.bubbles) {
            const position = bubbleObj.position;

            // Project 3D point to 2D screen space
            const vector = position.clone();
            vector.project(camera);

            const x = (vector.x * .5 + .5) * width;
            const y = (1 - (vector.y * .5 + .5)) * height;

            if (vector.z > 1) { // Behind camera
                bubbleObj.element.style.display = 'none';
            } else {
                bubbleObj.element.style.display = 'block';
                bubbleObj.element.style.left = `${x}px`;
                bubbleObj.element.style.top = `${y}px`;
            }
        }
    }

    /**
     * Supprime toutes les bulles et arrête la boucle
     * @return {void}
     */
    removeAllBubbles() {
        this.stopBubbleLoop();
        while (this.bubbles.length > 0) {
            this.removeBubble(this.bubbles[0]);
        }
    }
}

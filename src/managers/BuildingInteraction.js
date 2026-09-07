/**
 * BuildingInteraction: Handles clicking on buildings and city objects
 * Responsibilities:
 * - Detect clicks on buildings
 * - Extract batch IDs and coordinates from intersections
 * - Create bubbles with building information
 * - Toggle building click mode on/off
 */
export class BuildingInteraction {
    constructor(view, bubbleManager) {
        this.view = view;
        this.bubbleManager = bubbleManager;
        this.buildingClickEnabled = false;
        this.buildingClickToggleButton = null;
    }

    /**
     * Lance l'événement d'écoute pour les clics sur les bâtiments
     * Crée une bulle d'information quand un bâtiment est cliqué
     * @return {void}
     */
    onClickOnBuilding() {
        this.view.domElement.addEventListener('click', async (event) => {
            if (!this.buildingClickEnabled) return;

            let pickedObjectType = null;
            let pickedObject = this.pickCityObject(event);

            if (pickedObject == null) {
                pickedObject = this.view.pickTerrainCoordinates(event);
                pickedObjectType = 'terrain';
            }
            else {
                pickedObjectType = 'building';
            }

            let batchId = null;

            if (pickedObjectType === 'building') {
                batchId = this.getBatchIdFromIntersection(pickedObject);
            }

            const position = pickedObject ? 
                (pickedObject.point ? pickedObject.point.clone() : 
                new THREE.Vector3(pickedObject.x, pickedObject.y, pickedObject.z)) : 
                null;
            
            console.log("pickedObject: ", pickedObject, "position: ", position, "batchId: ", batchId);

            let title = batchId ? "Building" : "Terrain";
            let htmlContent = '';
            
            if (batchId) {
                htmlContent += `<strong>${title}</strong>: Batch ID: ${batchId}`;
            }
            if (position) {
                const coords = `${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}`;
                htmlContent += (htmlContent ? '<br>' : '') + `<strong>Coordinates</strong>: ${coords}`;
            }
            if (!htmlContent) htmlContent = 'No Batch ID or Coordinates';

            this.bubbleManager.createBubble(htmlContent, position);
        });
    }

    /**
     * Crée un bouton pour activer/désactiver les clics sur les bâtiments
     * @return {void}
     */
    createBuildingClickToggleButton() {
        if (this.buildingClickToggleButton) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.style.position = 'absolute';
        button.style.top = '8px';
        button.style.left = '8px';
        button.style.zIndex = '1000';
        button.style.padding = '4px 8px';
        button.style.fontSize = '12px';
        button.style.lineHeight = '1';
        button.style.cursor = 'pointer';

        button.addEventListener('click', (event) => {
            event.stopPropagation();
            this.setBuildingClickEnabled(!this.buildingClickEnabled);
        });

        this.view.domElement.appendChild(button);
        this.buildingClickToggleButton = button;
        this.updateBuildingClickToggleButton();
    }

    /**
     * Active ou désactive les clics sur les bâtiments
     * @param  {boolean} enabled - État voulu
     * @return {void}
     */
    setBuildingClickEnabled(enabled) {
        this.buildingClickEnabled = enabled;
        this.updateBuildingClickToggleButton();
    }

    /**
     * Met à jour le texte du bouton selon l'état courant
     * @return {void}
     */
    updateBuildingClickToggleButton() {
        if (!this.buildingClickToggleButton) return;
        this.buildingClickToggleButton.textContent = this.buildingClickEnabled ? 'Buildings: ON' : 'Buildings: OFF';
    }

    /**
     * Récupère le premier objet 3D intersecté par le clic de souris
     * @param  {object} event - Objet contenant les informations du clic de souris
     * @return {object} - Objet contenant les informations de l'objet 3D intersecté
     */
    pickCityObject(event) {
        let intersections = this.view.pickObjectsAt(event, 5);

        let firstInter = this.getFirstTileIntersection(intersections);
        if (!!firstInter) {
            let batchId = this.getBatchIdFromIntersection(firstInter);
            let tileId = this.getObject3DFromTile(firstInter.object).tileId;
        }

        return firstInter;
    }

    /**
     * Récupère le premier objet 3D intersecté par le clic de souris parmi les intersections
     * @param  {object} intersects - Objet contenant les informations des objets 3D intersectés
     * @return {object} - Objet contenant les informations de l'objet 3D intersecté
     */
    getFirstTileIntersection(intersects) {
        let first_inter = null;
        let dist_min = 0;
        
        for (let inter of intersects) {
            let geomAttributes = inter.object.geometry.attributes;
            if (!!geomAttributes && !!geomAttributes._BATCHID) {
                if (!first_inter) {
                    first_inter = inter;
                    dist_min = inter.distance;
                } else if (inter.distance < dist_min) {
                    first_inter = inter;
                    dist_min = inter.distance;
                }
            }
        }
        return first_inter;
    }

    /**
     * Récupère l'ID du batch de l'objet 3D intersecté
     * @param  {object} inter - Objet contenant les informations de l'objet 3D intersecté
     * @return {number} - ID du batch
     */
    getBatchIdFromIntersection(inter) {
        let index = inter.face.a;
        return inter.object.geometry.attributes._BATCHID.array[index];
    }

    /**
     * Récupère l'objet 3D (tuile) depuis l'intersection
     * @param  {object} tile - Objet contenant les informations de la tuile
     * @return {object} - Objet tuile
     */
    getObject3DFromTile(tile) {
        if (!tile) {
            throw 'Tile not loaded in view';
        }

        // Find the 'Object3D' part of the tile
        while (!!tile.parent && !(tile.type === 'Object3D')) {
            tile = tile.parent;
        }

        if (!tile.batchTable) {
            throw 'Invalid tile : no batch table';
        }

        return tile;
    }

    /**
     * Cleanup: Remove all event listeners and elements
     * @return {void}
     */
    cleanup() {
        if (this.buildingClickToggleButton && this.buildingClickToggleButton.parentNode) {
            this.buildingClickToggleButton.parentNode.removeChild(this.buildingClickToggleButton);
        }
        this.buildingClickToggleButton = null;
    }
}

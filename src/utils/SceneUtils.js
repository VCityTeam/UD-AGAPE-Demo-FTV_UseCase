import * as THREE from 'three';

/**
 * SceneUtils: Shared utility functions for scene management
 * Responsibilities:
 * - Debug cube creation/removal
 * - File fetching
 * - Vector normalization
 * - Object disposal helpers
 */

/**
 * Création de cubes aux points donnés (pour debug/visualisation)
 * @param  {Array} pointArray - Liste de points auxquels mettre les cubes
 * @param  {string} color - Couleur hex des cubes (optionnel, défaut noir)
 * @return {Array} - Liste des cubes créés
 */
export function createDebugCubes(view, pointArray, color = 0x000000) {
    const scene = view.scene;
    const debugCubes = [];

    pointArray.forEach((p, i) => {
        const cube = new THREE.Mesh(
            new THREE.BoxGeometry(10, 10, 10),
            new THREE.MeshBasicMaterial({
                color: color,
                depthTest: true,
            })
        );

        cube.position.set(p.x, p.y, p.z);
        cube.renderOrder = 1000;

        view.tileLayer.object3d.add(cube);
        scene.add(cube);
        cube.updateMatrixWorld(true);
        view.notifyChange(true);

        debugCubes.push(cube);
    });

    view.notifyChange(true);
    return debugCubes;
}

/**
 * Supprime les cubes créés par createDebugCubes
 * @param  {Array} debugCubes - Tableau des cubes à supprimer
 * @param  {object} view - Vue iTowns
 * @return {void}
 */
export function removeDebugCubes(view, debugCubes) {
    if (!debugCubes || debugCubes.length === 0) return;

    debugCubes.forEach(cube => {
        view.scene.remove(cube);
        // Clean memory
        cube.geometry.dispose();
        cube.material.dispose();
    });

    view.notifyChange();
}

/**
 * Charge un fichier HTML et le retourne dans un div
 * @param  {string} fileName - Nom du fichier HTML à charger
 * @return {Promise<HTMLDivElement>} - Promise qui résout en un div
 */
export function fetchFile(fileName) {
    return new Promise((resolve) => {
        fetch(fileName)
            .then((response) => response.text())
            .then((text) => {
                const fileDiv = document.createElement('div');
                fileDiv.classList.add('file_div');
                fileDiv.innerHTML = text;
                resolve(fileDiv);
            });
    });
}

/**
 * Normalise un vecteur 3D à partir d'une configuration
 * @param  {object} v - Vecteur { x, y, z }
 * @return {object} - Vecteur normalisé
 */
export function normalizeVector3(v) {
    if (!v) return { x: 0, y: 0, z: 0 };
    return {
        x: parseFloat(v.x) || 0,
        y: parseFloat(v.y) || 0,
        z: parseFloat(v.z) || 0
    };
}

/**
 * Normalise un quaternion (vecteur 4D) à partir d'une configuration
 * @param  {object} v - Quaternion { x, y, z, w }
 * @return {object} - Quaternion normalisé
 */
export function normalizeVector4(v) {
    if (!v) return { x: 0, y: 0, z: 0, w: 1 };
    return {
        x: parseFloat(v.x) || 0,
        y: parseFloat(v.y) || 0,
        z: parseFloat(v.z) || 0,
        w: parseFloat(v.w) || 1
    };
}

/**
 * Dispose complètement d'un objet 3D et de ses ressources
 * @param  {object} obj - Objet 3D à disposer
 * @return {void}
 */
export function disposeObject3D(obj) {
    if (obj.geometry) {
        obj.geometry.dispose();
    }
    if (obj.material) {
        if (obj.material.map) {
            obj.material.map.dispose();
        }
        obj.material.dispose();
    }
}

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * MediaManager: Handles loading, creation, and management of all 3D media objects
 * Responsibilities:
 * - Load and create media from configuration
 * - Add/remove media from the iTowns scene
 * - Dispose of resources properly
 * - Track loaded media for cleanup
 */
export class MediaManager {
    constructor(view, guidedVisit) {
        this.view = view;
        this.guidedVisit = guidedVisit;
        this.loadedMedias = []; // Track all loaded media for cleanup
    }

    /**
     * Fonction qui ajoute les médias d'une étape à la scène et remplace les médias existants.
     * @param  {number[]} mediaIds - Tableau des IDs des médias.
     * @return {void}
     */
    addMedia(mediaIds) {
        const mediaDivs = [];
        for (const mediaId of mediaIds) {
            const media = this.guidedVisit.getMediaById(mediaId.id);
            const copiedMedia = { ...media };

            // Add override coordinates if provided
            if (mediaId.position) { copiedMedia.position = mediaId.position; }
            if (mediaId.rotation) { copiedMedia.rotation = mediaId.rotation; }
            if (mediaId.scale) { copiedMedia.scale = mediaId.scale; }
            if (mediaId.isFullScreen) { copiedMedia.isFullScreen = mediaId.isFullScreen; }

            const div = this.createMediaDiv(copiedMedia);
            if (div) {
                mediaDivs.push(div);
            }
        }
        if (this.guidedVisit.mediaContainer) {
            this.guidedVisit.mediaContainer.replaceChildren(...mediaDivs);
        }
    }

    /**
     * Fonction qui crée soit un div dans lequel mettre le média chargé, soit un média qui apparait à un endroit précis
     * Types supportés: texte, vidéo, image, audio, fichier HTML, objet 3D
     * @param  {object} media - Média à créer.
     * @return {HTMLDivElement|void} - Div contenant le média, ou null si le média est placé dans la scène sans div.
     */
    createMediaDiv(media) {
        let mediaDiv = null;
        switch (media.type) {
            case 'text':
                mediaDiv = document.createElement('p');
                mediaDiv.innerHTML = media.value;
                break;
            case 'video':
                if (media.isFullScreen) {
                    this.addMediaAsFullscreen(media.value, media.id, 'video', media);
                } else if (media.position) {
                    this.addVideoAtCoordinates(media.value, media.position, media.rotation, media.scale, media.trajectory, media.id);
                } else {
                    mediaDiv = document.createElement('video');
                    mediaDiv.src = media.value;
                    mediaDiv.controls = true;
                    mediaDiv.muted = false;
                }
                break;
            case 'image':
                if (media.isFullScreen) {
                    this.addMediaAsFullscreen(media.value, media.id, 'image', media);
                } else if (media.position) {
                    this.addImageAtCoordinates(media.value, media.position, media.rotation, media.scale, media.trajectory, media.id);
                } else {
                    mediaDiv = document.createElement('img');
                    mediaDiv.src = media.value;
                }
                break;
            case 'audio':
                mediaDiv = document.createElement('audio');
                mediaDiv.src = media.value;
                mediaDiv.controls = true;
                mediaDiv.muted = false;
                break;
            case 'file':
                mediaDiv = this.fetchFile(media.value);
                break;
            case 'obj3d':
                if (media.position) {
                    this.addObj3dAtCoordinates(media.value, media.position, media.rotation, media.scale, media.trajectory, media.id);
                } else {
                    throw new Error('Obj3d must have a position');
                }
                break;
            default:
                console.log('Unknown media type');
        }
        return mediaDiv;
    }

    /**
     * Fonction helper: Applique une transformation à un objet (position, rotation, scale)
     * @param  {object} object - Objet à transformer.
     * @param  {object} position - Position de l'objet - { x: number, y: number, z: number }.
     * @param  {object} rotation - Rotation de l'objet - { x: number, y: number, z: number, w: number }.
     * @param  {object} scale - Scale de l'objet - { x: number, y: number, z: number }.
     * @return {void}
     */
    _applyTransform(object, position, rotation, scale = { x: 1, y: 1, z: 1 }) {
        if (!object || !position) {
            throw new Error('Invalid arguments - Needs an object or a position');
        }

        object.position.set(position.x, position.y, position.z);

        if (!rotation) {
            rotation = { x: 0, y: 0, z: 0, w: 1 };
        }

        object.quaternion.set(
            rotation.x,
            rotation.y,
            rotation.z,
            rotation.w
        );

        object.scale.set(scale.x, scale.y, scale.z);

        // Remembered so the interactive controller can restore the media to the
        // orientation and size it was configured with.
        object.userData.initialTransform = {
            position: { ...position },
            rotation: { ...rotation },
            scale: { ...scale }
        };
    }

    /**
     * Fonction helper: Ajoute l'objet à la scène iTowns et notifie un changement
     * @param  {object} object - Objet à ajouter à la scène
     * @return {void}
     */
    _addToScene(object) {
        this.view.scene.add(object);
        object.updateMatrixWorld();
        this.view.notifyChange();
        this.guidedVisit.fsImageDisplayed = true;
    }

    /**
     * Fonction helper: Configure les données utilisateur et lance les animations associées
     * @param  {object} object - mesh de l'objet créé
     * @param  {{string, number, object}} {type, mediaId, trajectory} - Dictionnaire contenant des infos sur l'objet
     * @return {void}
     */
    _finalizeMedia(object, { type, mediaId, trajectory }) {
        // Merge: some media set user data before this call (video stop handler,
        // blob URL of an uploaded file...) and overwriting would drop it.
        Object.assign(object.userData, { isMedia: true, type, mediaId });

        const currentStep = this.guidedVisit.getCurrentStep();
        if (currentStep?.objectLookAtCamera?.includes(mediaId)) {
            this.guidedVisit.animationController.animateLookAtCamera(object);
        }

        this.loadedMedias.push(object);
    }

    /**
     * Fonction ajoutant une image à la vue iTowns
     * @param  {string} imagePath - Path de l'image
     * @param  {object} position - Position de l'image - { x: number, y: number, z: number }.
     * @param  {object} rotation - Rotation de l'image - { x: number, y: number, z: number, w: number }.
     * @param  {object} scale - Scale de l'image - { x: number, y: number, z: number }.
     * @param  {Array} trajectory - Trajectory de l'image
     * @param  {string} mediaId - ID de l'image.
     * @return {THREE.Mesh} - Mesh de l'objet
     */
    addImageAtCoordinates(imagePath, position, rotation, scale = { x: 1, y: 1, z: 1 }, trajectory = null, mediaId = null) {
        let width = 200;
        let height = 200;

        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(width, height),
            new THREE.MeshBasicMaterial({
                transparent: true,
                side: THREE.DoubleSide
            })
        );

        const texture = new THREE.TextureLoader().load(imagePath, (tex) => {
            if (mesh.parent) {
                width = tex.image.width / 10;
                height = tex.image.height / 10;

                mesh.geometry.dispose();
                mesh.geometry = new THREE.PlaneGeometry(width, height);
                this.view.notifyChange();
            }
        });

        mesh.material.map = texture;

        this._applyTransform(mesh, position, rotation, scale);
        this._addToScene(mesh);
        this._finalizeMedia(mesh, { type: 'image', mediaId, trajectory });

        return mesh;
    }

    /**
     * Fonction ajoutant une vidéo à la vue iTowns
     * @param  {string} videoPath - Path de la vidéo
     * @param  {object} position - Position de la vidéo - { x: number, y: number, z: number }.
     * @param  {object} rotation - Rotation de la vidéo - { x: number, y: number, z: number, w: number }.
     * @param  {object} scale - Scale de la vidéo - { x: number, y: number, z: number }.
     * @param  {Array} trajectory - Trajectory de la vidéo
     * @param  {string} mediaId - ID de la vidéo.
     * @return {THREE.Mesh} - Mesh de l'objet
     */
    addVideoAtCoordinates(videoPath, position, rotation, scale = { x: 1, y: 1, z: 1 }, trajectory = null, mediaId = null) {
        const video = document.createElement('video');
        video.src = videoPath;
        video.loop = true;
        video.muted = true;
        video.play();

        const texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace;

        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(400, 300),
            new THREE.MeshBasicMaterial({
                map: texture,
                side: THREE.DoubleSide
            })
        );

        video.addEventListener('loadedmetadata', () => {
            if (mesh.parent) {
                mesh.geometry.dispose();
                mesh.geometry = new THREE.PlaneGeometry(
                    video.videoWidth,
                    video.videoHeight
                );
                this.view.notifyChange();
            }
        });

        mesh.userData.stop = () => {
            texture.dispose();
            video.pause();
            video.src = '';
            video.load();
        };

        this._applyTransform(mesh, position, rotation, scale);
        this._addToScene(mesh);
        this._finalizeMedia(mesh, { type: 'video', mediaId, trajectory });

        return mesh;
    }

    /**
     * Fonction ajoutant un objet 3D à la vue iTowns
     * @param  {string} obj3dPath - Path de l'objet 3D
     * @param  {object} position - Position de l'objet 3D - { x: number, y: number, z: number }.
     * @param  {object} rotation - Rotation de l'objet 3D - { x: number, y: number, z: number, w: number }.
     * @param  {object} scale - Scale de l'objet 3D - { x: number, y: number, z: number }.
     * @param  {Array} trajectory - Trajectoire de l'objet 3D
     * @param  {string} mediaId - ID de l'objet 3D.
     * @return {void}
     */
    addObj3dAtCoordinates(obj3dPath, position, rotation, scale, trajectory = null, mediaId = null) {
        const isGLTF = obj3dPath.toLowerCase().endsWith('.gltf') || obj3dPath.toLowerCase().endsWith('.glb');
        const loader = isGLTF ? new GLTFLoader() : new FBXLoader();

        const basePath = obj3dPath.substring(0, obj3dPath.lastIndexOf('/') + 1);
        loader.setResourcePath(basePath);

        loader.load(
            obj3dPath,
            (loadedData) => {
                const object = isGLTF ? loadedData.scene : loadedData;

                this._applyTransform(
                    object,
                    position,
                    rotation,
                    scale || { x: 1, y: 1, z: 1 }
                );

                this._addToScene(object);
                this._finalizeMedia(object, { type: 'obj3d', mediaId, trajectory });
            },
            undefined,
            (error) => {
                console.error('Error loading 3D object:', error);
            }
        );
    }

    /**
     * Fonction ajoutant un média en plein écran à la vue iTowns
     * @param  {string} mediaPath - Path du média à ajouter en plein écran
     * @param  {string} mediaId - ID du média
     * @param  {string} mediaType - Type du média (video ou image)
     * @param  {object} media - Configuration du média
     * @return {HTMLDivElement} - L'élément DIV créé
     */
    addMediaAsFullscreen(mediaPath, mediaId = null, mediaType, media) {
        const mediaDiv = document.createElement('div');
        mediaDiv.classList.add('fullscreen-media-div');

        const isVideo = mediaType === 'video';
        const mediaElement = document.createElement(isVideo ? 'video' : 'img');
        mediaElement.src = mediaPath;

        if (isVideo) {
            mediaElement.autoplay = true;
            mediaElement.loop = true;
            mediaElement.muted = true;
            mediaElement.playsInline = true;
            mediaElement.play();
        }

        // Prevent event propagation
        const stopProp = (e) => e.stopPropagation();
        ['click', 'dblclick', 'mousedown', 'mouseup', 'mousemove', 'wheel', 'touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointerup', 'pointermove'].forEach(evt => {
            mediaElement.addEventListener(evt, stopProp);
        });

        console.log('Adding fullscreen media:', mediaPath, 'with ID:', mediaId, 'and element:', mediaElement);

        mediaDiv.appendChild(mediaElement);
        this.view.domElement.appendChild(mediaDiv);
        this.view.notifyChange();

        return mediaDiv;
    }

    /**
     * Charge un fichier HTML et le retourne dans un div
     * @param  {string} fileName - Nom du fichier HTML à charger.
     * @return {Promise<HTMLDivElement>} - Promise qui résout en un div contenant le contenu HTML
     */
    fetchFile(fileName) {
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
     * Removes a single media object from the scene and releases its resources.
     * Unlike removeMedia(), this is a definitive deletion: a blob URL created for
     * an uploaded file is revoked here.
     * @param  {THREE.Object3D} object - Media object to remove
     * @return {void}
     */
    removeMediaObject(object) {
        if (!object) return;

        if (object.userData?.stop) {
            object.userData.stop();
        }

        object.traverse((child) => {
            if (child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((material) => {
                    if (material.map) material.map.dispose();
                    material.dispose();
                });
            }
            if (child.geometry) {
                child.geometry.dispose();
            }
        });

        if (object.userData?.objectUrl) {
            URL.revokeObjectURL(object.userData.objectUrl);
        }

        object.removeFromParent();
        this.loadedMedias = this.loadedMedias.filter((media) => media !== object);
        this.view.notifyChange();
    }

    /**
     * Removes all the medias in the iTowns scene and cleans up resources
     * @return {void}
     */
    removeMedia() {
        const toRemove = [];

        this.view.scene.traverse((obj) => {
            if (obj.userData?.isMedia) {
                toRemove.push(obj);
            }
        });

        toRemove.forEach((obj) => {
            // Stop any processes associated with the object
            if (obj.userData?.stop) {
                obj.userData.stop();
            }

            if (obj.material) {
                if (obj.material.map) {
                    obj.material.map.dispose();
                }
                obj.material.dispose();
            }

            if (obj.geometry) {
                obj.geometry.dispose();
            }

            this.view.scene.remove(obj);
        });

        this.view.notifyChange();
        this.guidedVisit.fsImageDisplayed = false;

        // Cleanup fullscreen DOM elements
        const fullscreenDivs = this.view.domElement.querySelectorAll('.fullscreen-media-div');
        fullscreenDivs.forEach(div => div.remove());

        this.loadedMedias = [];
    }
}

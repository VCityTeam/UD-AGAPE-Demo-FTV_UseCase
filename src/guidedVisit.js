import { GuidedTour } from '@ud-viz/widget_guided_tour';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class GuidedVisit extends GuidedTour {
    constructor(view, config, medias) {
        super(view, config, medias);
        this.nextStepArrowPressEvent();
        this.nextLookAtPointEvent();
        //this.onClickOnBuilding();
        this.bubbles = []; // liste des bulles
        this.currentLookAtIndex = 0; // pour lookAt de plusieurs points
        this.lookAtDebugCubes = []; // pour lookAt de plusieurs points
    }

    /**
     * Fonction qui permet d'effectuer les actions d'une étape lorsqu'on se déplace vers celle-ci.
     * @param  {number} index - Index de l'étape.
     * @return {void} 
     */
    async goToStep(index) {
        if (this.currentIndex === index) return;

        this.currentLookAtIndex = 0; // reset si on change d'etape
        this.removeMedia();
        this.removeDebugCubes(); // comme media mais cubes n'en sont pas

        this.stopCameraAnimation(); // cameras arretent de bouger si au milieu d'un mouvement

        this.currentIndex = index;
        const step = this.getCurrentStep();
        console.log("je passe dans goToStep", "nouveau step: ", step)

        // faire le bon ordre

        if (step.media && step.media.length > 0) {
            this.addMedia(step.media);
        }

        if (step.cameraPosition || step.cameraRotation) {
            this.cameraToPosition(step.cameraPosition, step.cameraRotation); //Avant était fluide, maintenant instantanée ? 
        }

        // faire le bon ordre
        if (step.layers && step.layers.length > 0) {
            this.filterLayers(step.layers);
        }
        if (step.objectMovement && step.objectMovement.length > 0) { // normalement
            for (const objectMovement of step.objectMovement) {
                this.animateObjectAlongTrajectory(objectMovement.objectId, objectMovement);
            }
        }
        else if (step.cameraMovement && step.cameraMovement.type == 'rotation') { //Inutilisé
            this.rotateCamera(step.cameraMovement);
        }
        else if (step.cameraLookAt && step.cameraLookAt.length > 0) { // TODO CHANGER : mettre un event a la place qui permet de cycler sur les lookats avec une touche du clavier + mettre un cube a chaque point du lookat
            this.currentLookAtIndex = 0;
            this.cameraLookAtSmooth(step.cameraLookAt[0]);
            this.createDebugCubes(step.cameraLookAt);
        }
    }

    /**
     * Fonction qui ajoute les médias d'une étape à la scène et remplace les médias existants.
     * @param  {number[]} mediaIds - Tableau des IDs des médias.
     * @return {void}
     */
    addMedia(mediaIds) { //mediaIds deviens liste de mediasId + coordonnées voulues du média associé
        const mediaDivs = [];
        for (const mediaId of mediaIds) { //mediasIds devient [{id:"2dImagePos",position: {x:1844924,y:5175065,z:150}}] par exemple
            const media = this.getMediaById(mediaId.id); //cheche id du coup
            const copiedMedia = { ...media }; // Copie de l'objet media pour éviter de modifier l'original
            //on ajoute les infos en plus si besoin
            if (mediaId.position) {copiedMedia.position = mediaId.position;}
            if (mediaId.rotation) {copiedMedia.rotation = mediaId.rotation;}
            if (mediaId.scale) {copiedMedia.scale = mediaId.scale;}
            if (mediaId.isFullScreen) {copiedMedia.isFullScreen = mediaId.isFullScreen;}
            // utilisation de copie de l'image car on change des infos dessus (position, rotation, scale)

            const div = this.createMediaDiv(copiedMedia); //prend un div pour l'instant
            if (div) {
                mediaDivs.push(div);
            }
        }
        if (this.mediaContainer) {
            this.mediaContainer.replaceChildren(...mediaDivs); //replaces/removes divs
        }
    }

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

            //this.cameraLookAt(nextPoint);
            this.cameraLookAtSmooth(nextPoint, 1200); // Si smooth fonctionne avec vectorLerp
            this.itownsView.notifyChange();
        });
    }

    /**
     * Fonction qui permet de charger un fichier HTML et de l'injecter dans un div.
     * @param  {string} fileName - Nom du fichier HTML à charger.
     * @return {Promise<HTMLDivElement>} - Promise qui résout en un div contenant le contenu du fichier HTML.
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
     * Fonction qui crée soit un div dans lequel mettre le média chargé, soit un média qui apparait à un endroit précis pour les types suivants:
     *  - vidéo
     *  - image
     *  - objet 3D
     * @param  {object} media - Média à créer.
     * @return {HTMLDivElement|void} - Div contenant le média, ou null si le média est placé dans la scène sans div.
     */
    createMediaDiv(media) { // A REFACTO PARCE QUE PAS PROPRE ET PROBLEME D'ASYNCHRONICITE POUR OBJETS 3D
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
                if (media.isFullScreen) { // A CHANGER, fullscreen deviendra juste un image pour laquelle on calcule les transformations nécessaires pour qu'elle fasse la page entière
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
                mediaDiv = this.fetchFile(media.value); // Ici mediadiv est une promise
                break;
            case 'obj3d':
                if (media.position) { // besoin d'être sûr que les objets ont bien été créés
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
     * Fonction helper pour les fonctions addImageAtCoordinates, addObj3dAtCoordinates et addVideoAtCoordinates
     * Applique une transformation à un objet
     * @param  {object} object - Objet à transformer.
     * @param  {object} position - Position de l'objet - Dictionnaire du type { x: number, y: number, z: number }.
     * @param  {object} rotation - Rotation de l'objet - Dictionnaire du type { x: number, y: number, z: number, w: number }.
     * @param  {object} scale - Scale de l'objet - Dictionnaire du type { x: number, y: number, z: number }.
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
    }

    /**
     * Fonction helper pour les fonctions addImageAtCoordinates, addObj3dAtCoordinates et addVideoAtCoordinates
     * Ajoute l'objet invoqué à la scène iTowns
     * @param  {object} object  - Objet à ajouter à la scène
     * @return {void}
     */
    _addToScene(object) { // est ce que je fais retourner une promesse? --> faire retourner des promesses a toutes les fcts de createMediaDiv
        this.itownsView.scene.add(object);
        object.updateMatrixWorld();
        this.itownsView.notifyChange();
        this.fsImageDisplayed = true;
    }

    /**
     * Fonction helper pour les fonctions addImageAtCoordinates, addObj3dAtCoordinates et addVideoAtCoordinates
     * Lance les animations des objets (mouvement, lookAt...) si ceux si en ont
     * @param  {object} object - mesh de l'objet créé par la focntion parent
     * @param  {{string, number, object}} {type, mediaId, trajectory} - Dictionnaire contenant des informations sur l'objet
     * @return {void}
     */
    _finalizeMedia(object, { type, mediaId, trajectory }) {
        object.userData = { isMedia: true, type, mediaId };

        // if (trajectory) {
        //     this.animateMeshAlongTrajectory(object, trajectory);
        // }

        const currentStep = this.getCurrentStep();
        if (currentStep?.objectLookAtCamera?.includes(mediaId)) {
            this.animateLookAtCamera(object);
        }
    }

    /**
     * Fonction ajoutant une image à la vue iTowns, et renvoyant le mesh de cet objet à la scène pour effectuer des actions dessus/le supprimer
     * @param  {string} imagePath - Path de l'image
     * @param  {object} position - Position de l'image - Dictionnaire du type { x: number, y: number, z: number }.
     * @param  {object} rotation - Rotation de l'image - Dictionnaire du type { x: number, y: number, z: number, w: number }.
     * @param  {object} scale - Scale de l'image - Dictionnaire du type { x: number, y: number, z: number }.
     * @param  {Array<{x:number, y:number, z:number}>}  trajectory - Trajectory de l'image - Tableau du type
       {
        "type": "string",
        "points": [
          { "x": number, "y": number, "z": number },
          ... ,
          { "x": number, "y": number, "z": number },
        ],
        "duration": number,
        "loop": boolean
      }.
     * @param  {string} mediaId - ID de l'image.
     * @return {THREE.MeshBasicMaterial} - Mesh de l'objet sur lequel une image est projetée
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
                this.itownsView.notifyChange();
            }
        });

        mesh.material.map = texture;

        this._applyTransform(mesh, position, rotation, scale);
        this._addToScene(mesh);
        this._finalizeMedia(mesh, { type: 'image', mediaId, trajectory });

        return mesh;
    }

    /**
     * Fonction ajoutant une vidéo à la vue iTowns, et renvoyant le mesh de cet objet à la scène pour effectuer des actions dessus/le supprimer
     * @param  {string} videoPath - Path de la vidéo
     * @param  {object} position - Position de la vidéo - Dictionnaire du type { x: number, y: number, z: number }.
     * @param  {object} rotation - Rotation de la vidéo - Dictionnaire du type { x: number, y: number, z: number, w: number }.
     * @param  {object} scale - Scale de la vidéo - Dictionnaire du type { x: number, y: number, z: number }.
     * @param  {Array<{x:number, y:number, z:number}>}  trajectory - Trajectory de la vidéo - Voir le même paramètre sur la fonction addImageAtCoordinates
     * @param  {string} mediaId - ID de la vidéo.
     * @return {THREE.MeshBasicMaterial} - Mesh de l'objet sur lequel une vidéo est projetée
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
                this.itownsView.notifyChange();
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
     * Fonction ajoutant un objet 3D à la vue iTowns, et renvoyant le mesh de cet objet à la scène pour effectuer des actions dessus/le supprimer
     * @param  {string} obj3dPath - Path de l'objet 3D
     * @param  {object} position - Position de l'objet 3D - Dictionnaire du type { x: number, y: number, z: number }.
     * @param  {object} rotation - Rotation de l'objet 3D - Dictionnaire du type { x: number, y: number, z: number, w: number }.
     * @param  {object} scale - Scale de l'objet 3D - Dictionnaire du type { x: number, y: number, z: number }.
     * @param  {Array<{x:number, y:number, z:number}>}  trajectory - Trajectoire de l'objet 3D - Voir le même paramètre sur la fonction addImageAtCoordinates
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
        }, undefined, (error) => {
            console.error('Error loading 3D object:', error);
        });
    }

    /**
     * Fonction ajoutant un média en plein écran à la vue iTowns, et renvoyant le mesh de cet objet à la scène pour effectuer des actions dessus/le supprimer
     *  @param  {string} mediapath - Path du média à ajouter en plein écran
     *  @param  {string} mediaId - ID du média
     *  @param  {string} mediaType - Type du média
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

        // comme ça event remontent pas a ce div
        const stopProp = (e) => e.stopPropagation();
        ['click', 'dblclick', 'mousedown', 'mouseup', 'mousemove', 'wheel', 'touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointerup', 'pointermove'].forEach(evt => {
            mediaElement.addEventListener(evt, stopProp);
        });

        console.log('Adding fullscreen media:', mediaPath, 'with ID:', mediaId, 'and element:', mediaElement);

        mediaDiv.appendChild(mediaElement);
        this.itownsView.domElement.appendChild(mediaDiv);
        this.itownsView.notifyChange();

        return mediaDiv;
    }

    /**
     * Création de cubes aux point donnés
     * @param  {[number]} pointArray - Liste de points auquels mettre les cubes
     * @return {void}
     */
    createDebugCubes(pointArray) {
        const scene = this.itownsView.scene;
        const camera = this.itownsView.camera.camera3D;

        pointArray.forEach((p, i) => {
            const cube = new THREE.Mesh(
                new THREE.BoxGeometry(10, 10, 10),
                new THREE.MeshBasicMaterial({
                    color: 0x000000,
                    depthTest: true,
                })
            );

            cube.position.set(p.x, p.y, p.z);

            cube.renderOrder = 1000;

            //scene.add(cube);
            this.lookAtDebugCubes.push(cube);
            this.itownsView.tileLayer.object3d.add(cube);
            this.itownsView.scene.add(cube);
            cube.updateMatrixWorld(true);
            this.itownsView.notifyChange(true);
        });

        this.itownsView.notifyChange(true);
    }

    /**
     * Supprime les cubes créés par la fonction createDebugCubes
     * @return {void}
     */
    removeDebugCubes() {
        if (!this.lookAtDebugCubes) return;

        this.lookAtDebugCubes.forEach(cube => {
            this.itownsView.scene.remove(cube);
            // Clean memory
            cube.geometry.dispose();
            cube.material.dispose();
        });

        this.lookAtDebugCubes = [];
        this.itownsView.notifyChange();
    }


    /**
     * Removes all the medias in the iTowns scene
     * @return {void}
     */
    removeMedia() {
        const toRemove = [];

        this.itownsView.scene.traverse((obj) => {
            if (obj.userData?.isMedia) { // Equivalent à obj.userData && obj.userData.isMedia
                toRemove.push(obj);
            }
        });

        toRemove.forEach((obj) => {
            // Process to stop the video and other processes coming with it
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

            this.itownsView.scene.remove(obj);
        });
        this.itownsView.notifyChange();
        this.fsImageDisplayed = false;

        // Cleanup fullscreen DOM elements added directly to itownsView
        const fullscreenDivs = this.itownsView.domElement.querySelectorAll('.fullscreen-media-div');
        fullscreenDivs.forEach(div => div.remove());
    }

    /**
     * Fonction event qui lance la création d'une bulle d'information lorsqu'on clique sur la scène et qu'un bâtiment est détécté
     * Fonction parent de la fonction createBubble
     * @return {void}
     */
    onClickOnBuilding() {
        this.itownsView.domElement.addEventListener('click', async (event) => {
            
            // FUNCTION CODE for only finding buildings:
            //let pickedObject = this.pickCityObject(event) ?? this.itownsView.pickTerrainCoordinates({ x: event.clientX, y: event.clientY });
            let pickedObjectType = null;
            let pickedObject = this.pickCityObject(event);

            if (pickedObject == null) {
                pickedObject = this.itownsView.pickTerrainCoordinates(event);
                pickedObjectType = 'terrain';
            }
            else {
                pickedObjectType = 'building';
            }

            let batchId = null;

            if (pickedObjectType === 'building') {
                let batchId = this.getBatchIdFromIntersection(pickedObject);
                // Use pickedObject.point for exact click location, could use center of building too
            }
                const position = pickedObject ? (pickedObject.point ? pickedObject.point.clone() : new THREE.Vector3(pickedObject.x, pickedObject.y, pickedObject.z)) : null;
                
                // Get building info if possible
                let title = batchId?"Building ": "Terrain";

                let htmlContent = batchId?`<strong>${title}</strong><br>Batch ID: ${batchId}`:
                 `<strong>${title}</strong><br>Coordinates: ${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}`;

                // Create Bubble
                this.createBubble(htmlContent, position);
        });
    }

    /**
     * Fonction fille de onClickOnBuilding
     * Crée une bulle (div) dans la scène iTowns avec le contenu html donnée en argument à la position spécifiée
     * @param  {string} htmlContent - Contenu HTML de la bulle à créer
     * @param  {object} position - Position de la bulle sur l'écran
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

        this.itownsView.domElement.appendChild(bubble);

        this.bubbles.push(bubbleObj);

        this.startBubbleLoop();
        //this.updateBubblePosition();
    }

    /**
     * Fonction fille de createBubble
     * Supprime une bulle de la scène iTowns si une bulle spécifique est appelée, sinon supprime toutes les bulles
     * @param  {object} bubbleObj - Bulle à supprimer
     * @return {void}
     */
    removeBubble(bubbleObj) {
        // If a specific bubble is passed, remove it
        if (bubbleObj) {
            const index = this.bubbles.indexOf(bubbleObj);
            if (index > -1) {
                this.bubbles.splice(index, 1);
                if (bubbleObj.element && bubbleObj.element.parentNode) {
                    bubbleObj.element.parentNode.removeChild(bubbleObj.element);
                }
            }
        } else {
            // If no argument, remove ALL bubbles (cleanup)
            while (this.bubbles.length > 0) {
                this.removeBubble(this.bubbles[0]);
            }
        }

        // If no more bubbles, stop the loop to save resources
        if (this.bubbles.length === 0) {
            this.stopBubbleLoop();
        }
    }

    /**
     * Fonction fille de createBubble
     * Lance la boucle de mise à jour des bulles
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
     * Fonction utilisée par removeBubble et stopAllCurrentAnimations
     * Stop la boucle de mise à jour des bulles
     * @return {void}
     */
    stopBubbleLoop() {
        if (this.bubbleLoopId) {
            cancelAnimationFrame(this.bubbleLoopId);
            this.bubbleLoopId = null;
        }
    }

    /**
     * Fonction fille de startBubbleLoop
     * Met à jour la position des bulles créées pour qu'elle restent accrochées aux bâtiments
     * @return {void}
     */
    updateBubblePosition() {
        if (this.bubbles.length === 0) return;

        const camera = this.itownsView.camera.camera3D;
        const width = this.itownsView.domElement.clientWidth;
        const height = this.itownsView.domElement.clientHeight;


        for (const bubbleObj of this.bubbles) {
            const position = bubbleObj.position;

            // Project 3D point to 2D screen space
            const vector = position.clone();
            vector.project(camera);

            const x = (vector.x * .5 + .5) * width;
            const y = (1 - (vector.y * .5 + .5)) * height;

            if (vector.z > 1) { // Check if behind camera
                bubbleObj.element.style.display = 'none';
            } else {
                bubbleObj.element.style.display = 'block';
                bubbleObj.element.style.left = `${x}px`;
                bubbleObj.element.style.top = `${y}px`;
            }
        }
    }

   
    /**
     * Fonction fille de onClickOnBuilding
     * Récupère le premier objet 3D intersecté par le clic de souris, et renvoie les informations récupérées
     * @param  {object} event - Objet contenant les informations du clic de souris, notamment la position sur l'écran
     * @return {object} - Objet contenant les informations de l'objet 3D intersecté
     */
    pickCityObject(event) {
        let intersections = this.itownsView.pickObjectsAt(event, 5);

        let firstInter = this.getFirstTileIntersection(intersections);
        if (!!firstInter) {
            let batchId = this.getBatchIdFromIntersection(firstInter);
            let tileId = this.getObject3DFromTile(firstInter.object).tileId;
        }

        return firstInter;
    }

    /**
     * Fonction fille de pickCityObject
     * Récupère le premier objet 3D intersecté par le clic de souris
     * @param  {object} intersects - Objet contenant les informations des objets 3D intersectés par le clic de souris
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
     * Fonction fille de pickCityObject
     * Récupère l'ID du batch de l'objet 3D intersecté
     * @param  {object} inter - Objet contenant les informations de l'objet 3D intersecté
     * @return {number} - ID du batch de l'objet 3D intersecté
     */
    getBatchIdFromIntersection(inter) {
        let index = inter.face.a;
        return inter.object.geometry.attributes._BATCHID.array[index];
    }

    /**
     * Fonction fille de pickCityObject
     * Récupère l'ID de la tuile sur laquelle l'objet 3D est
     * @param  {object} tile - Objet contenant les informations de la tuile
     * @return {object} - Objet contenant les informations de la tuile
     */
    getObject3DFromTile(tile) {
        if (!tile) {
            throw 'Tile not loaded in view';
        }

        //Find the 'Object3D' part of the tile
        while (!!tile.parent && !(tile.type === 'Object3D')) {
            tile = tile.parent;
        }

        if (!tile.batchTable) {
            throw 'Invalid tile : no batch table';
        }

        return tile;
    }

    /**
     * Bouge la caméra vers la position donnée
     * @param  {object} position - Position à laquelle déplacer la caméra
     * @param  {object} rotation - Rotation de la caméra à son arrivée au point donné
     * @return {void}
     */
    cameraToPosition(position, rotation) {
        if (position) {
            this.itownsView.camera.camera3D.position.set(position.x, position.y, position.z);
        }
        if (rotation) {
            this.itownsView.camera.camera3D.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
        }
        this.itownsView.camera.camera3D.updateMatrixWorld(true);
        this.itownsView.notifyChange(this.itownsView.camera.camera3D);
    }

    /**
     * Fait regarder la caméra vers un point donné
     * @param  {object} position - Position vers laquelle la caméra doit regarder
     * @return {void}
     */
    cameraLookAt(position) {
        if (position) {
            this.itownsView.camera.camera3D.lookAt(position.x, position.y, position.z); //traite camera comme objet 3D
        }
    }

    /**
     * Fait regarder la caméra vers un point donné de manière fluide
     * @param  {object} target - Position vers laquelle la caméra doit regarder
     * @param  {number} duration - Durée de l'animation en millisecondes (par défaut 1200ms)
     * @return {void}
     */
    cameraLookAtSmooth(target, duration = 1200) {
        const camera = this.itownsView.camera.camera3D;
        const targetVec = new THREE.Vector3(target.x, target.y, target.z);

        // On calcule la distance pour projeter un point cible initial devant la caméra
        const distance = camera.position.distanceTo(targetVec);

        // On détermine le point que la caméra regarde actuellement
        const startLookAt = new THREE.Vector3(0, 0, -1)
            .applyQuaternion(camera.quaternion)
            .normalize()
            .multiplyScalar(distance || 1)
            .add(camera.position);

        let start;

        const animate = (t) => {
            if (!start) start = t;

            // Progression linéaire
            let progress = Math.min((t - start) / duration, 1);
        
            const easeProgress = progress * progress * (3 - 2 * progress); //easing a peu pres cubique

            // Interpolation (lerp) de la position cible
            const currentTarget = new THREE.Vector3().lerpVectors(startLookAt, targetVec, easeProgress);

            // regarde
            camera.lookAt(currentTarget);
            camera.updateMatrixWorld(true);

            this.itownsView.notifyChange(camera);

            if (progress < 1) {
                this.cameraAnimationId = requestAnimationFrame(animate);
            } else {
                this.itownsView.notifyChange(camera);
            }
        };

        this.stopCameraAnimation();
        this.cameraAnimationId = requestAnimationFrame(animate);
    }

    /**
     * Arrête l'animation de la caméra
     * @return {void}
     */
    stopCameraAnimation() {
        if (this.cameraAnimationId) {
            cancelAnimationFrame(this.cameraAnimationId);
            this.cameraAnimationId = null;
            this.itownsView.notifyChange(this.itownsView.camera.camera3D);
        }
    }


    /**
     * Fait tourner la camera selon un angle spécifique en degré par axe de rotation (les angles peuvent être différent pour chaque axe)
     * @param  {object} cameraMovement - dictionnaire {rotationDegrees: {x,y,z}}
     * @return {void}
     */
    async rotateCamera(cameraMovement) { // TODO CHANGER LA FONCTION 
        await new Promise(resolve => setTimeout(resolve, 5000)); 
        const rotationDegrees = cameraMovement.rotationDegrees;
        
        // en radians pas en degrés...
        if (rotationDegrees.x) this.itownsView.camera.camera3D.rotateX(THREE.MathUtils.degToRad(rotationDegrees.x));
        if (rotationDegrees.y) this.itownsView.camera.camera3D.rotateY(THREE.MathUtils.degToRad(rotationDegrees.y));
        if (rotationDegrees.z) this.itownsView.camera.camera3D.rotateZ(THREE.MathUtils.degToRad(rotationDegrees.z));
        
        this.itownsView.camera.camera3D.updateMatrixWorld(true);
        this.itownsView.notifyChange(this.itownsView.camera.camera3D);
    }

    /**
     * WIP: Fonction event permettant l'arrêt de toutes les animations, mouvement, vidéo en cours etc...
     * @return {void}
     */
    stopAllCurrentAnimations() {
        this.itownsView.domElement.addEventListener('keydown', async (event) => {
            if (event.code === 'Space') {
                this.stopCameraAnimation(); // fonctionne pas
                this.stopBubbleLoop(); // fonctionne jusqu'a prochain point
                this.animateObjectAlongTrajectory.stop(); // fonctionne pas
            }
        });
    }

    /**
     * WIP: Fonction event permettant la reprise de toutes les animations, mouvement, vidéo en cours etc...
     * @return {void}
     */

    // resumeAllCurrentAnimations() {
    //     this.itownsView.domElement.addEventListener('keyup', async (event) => {
    //         if (event.code === 'Space') {
    //             //a faire hihi, sans doute garder en memoire tout plein d'infos quand on appuie sur espace dans un premier temps ?
    //         }
    //     });
    // }

    /**
     * Anime le regard d'un mesh pour suivre la position de la caméra.
     * @param  {object} mesh - Mesh à faire bouger
     * @return {void}
     */
    animateLookAtCamera(mesh) {
        // Au moins dans userData pour garder une trace
        mesh.userData.lockAxes = { x: false, y: false, z: true };

        const updateLookAt = () => {
            if (this.itownsView && this.itownsView.camera && this.itownsView.camera.camera3D) {
                // get camera position and apply axis locks so the mesh won't rotate on locked axes
                const camPos = this.itownsView.camera.camera3D.position.clone();
                const meshPos = mesh.position.clone();
                const locked = mesh.userData.lockAxes;

                // if (locked.x) camPos.x = meshPos.x;
                // if (locked.y) camPos.y = meshPos.y;
                // if (locked.z) camPos.z = meshPos.z;

                mesh.lookAt(camPos);
                mesh.updateMatrixWorld();
                this.itownsView.notifyChange();
            }
            mesh.userData.lookAtAnimationId = requestAnimationFrame(updateLookAt);
        };
        mesh.userData.lookAtAnimationId = requestAnimationFrame(updateLookAt);

        // Attach stop function to mesh for cleanup
        const originalStop = mesh.userData.stop;
        mesh.userData.stop = () => {
            if (originalStop) originalStop();
            if (mesh.userData.lookAtAnimationId) {
                cancelAnimationFrame(mesh.userData.lookAtAnimationId);
            }
            delete mesh.userData.lockAxes;
        };
    }

    animateObjectAlongTrajectory(targetObjectId, objectMovement) { // pas sûr que ça marche
        if (!targetObjectId || !objectMovement || !objectMovement.pointsArray) return;
        
        if (objectMovement.pointsArray.length > 1 && objectMovement.type === "orbit") return;
        if (objectMovement.pointsArray.length < 2 && objectMovement.type !== "orbit") return;

        this.stopCameraAnimation();
        let targetObject;

        if (targetObjectId === "camera") {
            targetObject = this.itownsView.camera.camera3D
        }
        else {
            targetObject = this.itownsView.scene.children.find(child => child.userData.mediaId === targetObjectId); // pour trouver object dans les enfants de la scene itowns
        }
        if (!targetObject) { // si pas d'objet
                throw `Object ${targetObjectId} not found`;
        }

        // Création des courbes => soit hermite soit ligne soit orbitale
        const points = objectMovement.pointsArray.map(p => new THREE.Vector3(p.x, p.y, p.z));
        let curve;
        if (objectMovement.type === 'hermite' || objectMovement.type === 'spline') {
            curve = new THREE.CatmullRomCurve3(points, objectMovement.loop || false, 'centripetal');
        } else if (objectMovement.type === 'line') {
            curve = new THREE.CatmullRomCurve3(points, objectMovement.loop || false, 'chordal');
        }
        else if (objectMovement.type === 'orbit') {
            const center = points[0];
            const cameraPos = this.itownsView.camera.camera3D.position;
            
            let radius = objectMovement.radius || 150;
            
            // Calcul de l'angle de départ
            const startAngle = Math.atan2(cameraPos.y - center.y, cameraPos.x - center.x);

            // altitude voulue, sinon celle de base de la cam
            const altitude = objectMovement.cameraHeight !== undefined ? objectMovement.cameraHeight : cameraPos.z;

            const numPoints = 30; // Nombre de points a suivre
            const orbitPoints = [];
            for (let i = 0; i <= numPoints; i++) {
                const angle = startAngle + (i / numPoints) * Math.PI * 2;
                orbitPoints.push(new THREE.Vector3(
                    center.x + Math.cos(angle) * radius,
                    center.y + Math.sin(angle) * radius,
                    altitude // Altitude configurée ou actuelle
                ));
            }

            this.createDebugCubes(objectMovement.pointsArray, "black");
            
            // Courbe autour des points choisis
            curve = new THREE.CatmullRomCurve3(orbitPoints, true, 'centripetal');
            objectMovement.loop = true; // boucle forcée si orbite (a changer/garder?)
        }

        const duration = objectMovement.duration || 5000;
        let startTime = null;

        //animate des mesh
        const animate = (time) => {
            if (!targetObject.parent && targetObjectId !== "camera") return;

            if (startTime === null) {
                startTime = time;
            }

            let elapsed = time - startTime;
            let t = elapsed / duration;

            if (t > 1) {
                if (objectMovement.loop) {
                    t = t % 1;
                } else {
                    t = 1;
                }
            }

            const position = curve.getPointAt(t);

            targetObject.position.copy(position); //equivalent cameratoposition, mais diff selon objet
            
            if (targetObjectId === "camera"){
                const currentRotation = this.itownsView.camera.camera3D.quaternion;
                this.cameraToPosition(position, currentRotation);
            }

            // clock
            let lookAtT = t + 0.01;
            if (lookAtT > 1) {
                lookAtT = objectMovement.loop ? (lookAtT % 1) : 1;
            }
            // lookat en dehors des mouvements, donc on doit chercher la step pour avoir l'info
            // On veut lookAt pendant le mouvement si il y en a un, mais aussi après le mouvement si il est configuré pour ça (ex: lookAtT > 1)
            const step = this.getCurrentStep();

            if (lookAtT <= 1 && t !== lookAtT) {
                const lookAtPos = step?.cameraLookAt?.[0]; // Le premier point si jamais on en a plusieurs
                if (lookAtPos) {
                    this.cameraLookAt(lookAtPos);
                }
            }

            targetObject.updateMatrixWorld();
            this.itownsView.notifyChange();

            if (t < 1 || objectMovement.loop) { //pareil existe pour la camera, juste a fusionner les deux
                targetObject.userData.trajectoryAnimationId = requestAnimationFrame(animate);
            }
        };

        // request pour les deux, au cas où (peut être à séparer plus tard)
        if (targetObjectId === "camera") {
            this.cameraAnimationId = requestAnimationFrame(animate);
        } else {
            targetObject.userData.trajectoryAnimationId = requestAnimationFrame(animate);
        }
    }

}
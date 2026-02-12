import { GuidedTour } from '@ud-viz/widget_guided_tour';
import * as THREE from 'three';

import { iTowns } from 'itowns';

export class GuidedVisit extends GuidedTour {
    constructor(view, config, medias) {
        super(view, config, medias);
        this.addArrowKeyPressedEvent();
        this.onClickOnBuilding();
        this.bubbles = []; // Array to store multiple bubbles
        this.itownsView.domElement.addEventListener('mousemove', this.onDocumentMouseMove.bind(this), false) // Update mouse coordinates?
    }

    goToStep(index) {
        if (this.currentIndex === index) return;

        this.removeMedia();

        this.currentIndex = index;
        const step = this.getCurrentStep();

        if (step.position && step.rotation)
            this.travelToPosition(step.position, step.rotation);

        if (step.layers && step.layers.length > 0) {
            this.filterLayers(step.layers);
        }

        if (step.media && step.media.length > 0) {
            this.addMedia(step.media);
        }
    }

    addMedia(mediaIds) {
        const mediaDivs = [];
        for (const mediaId of mediaIds) {
            const media = this.getMediaById(mediaId);
            mediaDivs.push(this.createMediaDiv(media));
        }
        this.mediaContainer.replaceChildren(...mediaDivs); //replaces/removes divs
    }

    addArrowKeyPressedEvent() {
        this.itownsView.domElement.addEventListener('keydown', async (event) => {
            const currentStep = this.getCurrentStep();
            if (event.key === 'ArrowRight') {
                if (currentStep.next < this.steps.length) { // currentStep : Object { previous: 0, next: 1, type: "half", layers: (3) […], media: (1) […] }
                    await this.goToStep(currentStep.next);
                }
            } else if (event.key === 'ArrowLeft') {
                if (currentStep.previous >= 0) {
                    await this.goToStep(currentStep.previous);
                }
            }
        }, false);
    }

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

    // @Override
    createMediaDiv(media) {
        // console.log(media)
        let mediaDiv = null;
        switch (media.type) {
            case 'text':
                mediaDiv = document.createElement('p');
                mediaDiv.innerHTML = media.value;
                break;
            case 'video':
                if (media.position) {
                    this.addVideoAtCoordinates(media);
                } else {
                    mediaDiv = document.createElement('video');
                    mediaDiv.src = media.value;
                    mediaDiv.controls = true;
                    mediaDiv.muted = false;
                }
                break;
            case 'image':
                if (media.position) {
                    this.addImageAtCoordinates(media);
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
            default:
                console.log('Unknown media type');
        }
        return mediaDiv;
    }

    addImageAtCoordinates(media) { //Apres: lier addImage et addVideo en une seule fonction qui prend le format en argument
        const texture = new THREE.TextureLoader().load(media.value);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide
        });

        const width = 200;
        const height = 200;

        const geometry = new THREE.PlaneGeometry(width, height);
        const mesh = new THREE.Mesh(geometry, material);

        mesh.position.set(media.position.x, media.position.y, media.position.z);

        mesh.quaternion.x = media.rotation.x;
        mesh.quaternion.y = media.rotation.y;
        mesh.quaternion.z = media.rotation.z;
        mesh.quaternion.w = media.rotation.w;

        mesh.scale.set(media.scale.x, media.scale.y, media.scale.z);

        this.itownsView.notifyChange();

        this.itownsView.scene.add(mesh);
        mesh.updateMatrixWorld(); //image s'affiche pas sinon
        this.itownsView.notifyChange();
        this.fsImageDisplayed = true;

        // metadata to identify as media
        mesh.userData = { isMedia: true, type: media.type, source: media.source, license: media.license, position: media.position, rotation: media.rotation, scale: media.scale };
        return mesh;
    }

    addVideoAtCoordinates(media) {
        const video = document.createElement('video');
        video.src = media.value;
        video.loop = true;
        video.muted = true;
        // video.playsInline = true;
        video.play();

        const texture = new THREE.VideoTexture(video);
        texture.needsUpdate = true;
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide
        });

        const width = 400;
        const height = 300;

        const geometry = new THREE.PlaneGeometry(width, height);
        const mesh = new THREE.Mesh(geometry, material);

        mesh.position.set(media.position.x, media.position.y, media.position.z);

        mesh.quaternion.x = media.rotation.x;
        mesh.quaternion.y = media.rotation.y;
        mesh.quaternion.z = media.rotation.z;
        mesh.quaternion.w = media.rotation.w;

        mesh.scale.set(media.scale.x, media.scale.y, media.scale.z);

        //mesh.lookAt(this.itownsView.camera.position);

        this.itownsView.notifyChange();

        this.itownsView.scene.add(mesh);
        mesh.updateMatrixWorld(); //image doesn't show if not here
        this.itownsView.notifyChange();
        this.fsImageDisplayed = true;

        // metadata to identify as media as well as other usefull information
        mesh.userData = { isMedia: true, type: 'video' };

        // For the video to keep playing even when the view doesn't move/is static
        const updateVideo = () => {
            if (video.readyState >= video.HAVE_CURRENT_DATA) {
                this.itownsView.notifyChange();  // LAYER MANAGER DEVIENS this.v.NOTIFYCHANGE() ???
            }
            if (!video.paused && !video.ended) {
                mesh.userData.animationId = requestAnimationFrame(updateVideo);
            }
        };
        //mesh.userData.animationId = requestAnimationFrame(updateVideo);

        // Attach stop function to mesh for cleanup
        mesh.userData.stop = () => {
            if (mesh.userData.animationId) {
                cancelAnimationFrame(mesh.userData.animationId);
                mesh.userData.animationId = null;
            }

            if (texture) {
                texture.dispose();
            }

            video.pause();
            video.src = '';
            video.load();
        };

        return mesh;
    }

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
    }

    onClickOnBuilding() {
        this.itownsView.domElement.addEventListener('click', async (event) => {
            // Get the intersecting objects where our mouse pointer is
            let geometryObjectIntersections = this.itownsView.pickObjectsAt(event, 2); // Picks objects from the geometry layer

            let firstInter = this.getFirstTileIntersection(geometryObjectIntersections);
            if (firstInter) {
                let batchId = this.getBatchIdFromIntersection(firstInter);
                let tileId = this.getObject3DFromTile(firstInter.object).tileId;

                // Use pickedObject.point for exact click location, could use center of building too
                const position = firstInter.point.clone();

                // Get building info if possible
                let title = "Building " + batchId;

                let htmlContent = `<strong>${title}</strong><br>Batch ID: ${batchId}`;

                // Create Bubble
                this.createBubble(htmlContent, position, 'clickevent');
            }
        });
    }

    createBubble(htmlContent, position, type) {
        // don't call removeBubble() here anymore so we can get multiple bubbles

        const bubble = document.createElement('div');
        bubble.className = 'itowns-bubble';
        bubble.style.position = 'absolute';
        bubble.style.backgroundColor = 'white';
        bubble.style.padding = '5px';
        bubble.style.borderRadius = '5px';
        bubble.style.pointerEvents = 'auto';
        bubble.style.zIndex = '1000';
        bubble.style.transform = 'translate(-50%, -100%)';

        const bubbleObj = {
            element: bubble,
            position: position,
            type: type
        };

        // Close button
        const closeBtn = document.createElement('span');
        closeBtn.innerHTML = ' &times;';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.float = 'right';
        closeBtn.style.marginLeft = '5px';
        closeBtn.style.fontWeight = 'bold';
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            this.removeBubble(bubbleObj);
        };

        const content = document.createElement('div');
        content.innerHTML = htmlContent;

        bubble.appendChild(closeBtn);
        bubble.appendChild(content);

        this.itownsView.domElement.parentElement.appendChild(bubble);

        this.bubbles.push(bubbleObj);

        // Start update loop
        this.startBubbleLoop();

        // Initial update
        this.updateBubblePosition();
    }

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
            // Pas d'argument = supprime toutes les bulles qui ont hoverevent --> Pas un bon fix definitif, mais comme la manière de suppression des bulles depend de quel event elles ont été créées, c'est le plus rapide et simple
            // A changer si on rajoute plus d'events qui créent des bulles
            for (let i = 0; i < this.bubbles.length; i++) {
                if (this.bubbles[i].type === 'hoverevent') {
                    this.removeBubble(this.bubbles[i]);
                }
            }
        }

        // If no more bubbles, stop the loop to save resources
        if (this.bubbles.length === 0) {
            this.stopBubbleLoop();
        }
    }

    startBubbleLoop() {
        if (this.bubbleLoopId) return; // Already running

        const update = () => {
            this.updateBubblePosition();
            this.bubbleLoopId = requestAnimationFrame(update);
        };
        this.bubbleLoopId = requestAnimationFrame(update);
    }

    stopBubbleLoop() {
        if (this.bubbleLoopId) {
            cancelAnimationFrame(this.bubbleLoopId);
            this.bubbleLoopId = null;
        }
    }

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

    getBatchIdFromIntersection(inter) {
        let index = inter.face.a;
        return inter.object.geometry.attributes._BATCHID.array[index];
    }

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

    onDocumentMouseMove(event) {
        // update the mouse variable
        const x = (event.clientX / window.innerWidth) * 2 - 1;
        const y = - (event.clientY / window.innerHeight) * 2 + 1;

        // find intersections

        // create a Ray with origin at the mouse position
        //   and direction into the scene (camera direction)
        var raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(x, y), this.itownsView.camera.camera3D);

        // create an array containing all objects in the scene with which the ray intersects
        var intersects = raycaster.intersectObjects(this.itownsView.scene.children);

        let INTERSECTED = intersects && intersects.length > 0 ? intersects[0].object : null;
        // console.log(INTERSECTED);
        // if there is intersection(s)
        if (INTERSECTED && INTERSECTED.userData && (INTERSECTED.userData.type === 'image' || INTERSECTED.userData.type === 'video')) {
            this.removeBubble();
            console.log(INTERSECTED);
            let htmlContent = `<a href="${INTERSECTED.userData.source}">Source</a><br><strong>License:</strong> ${INTERSECTED.userData.license}`;
            this.createBubble(htmlContent, INTERSECTED.position.clone().add(new THREE.Vector3(0, 0, -10)), 'hoverevent');
        } else {
            this.removeBubble();
        }
    }
}

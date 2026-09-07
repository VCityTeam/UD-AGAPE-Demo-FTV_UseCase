import * as THREE from 'three';

/**
 * AnimationController: Handles all animation logic for objects and camera
 * Responsibilities:
 * - Animate objects along trajectories
 * - Camera movements and lookAt operations
 * - Smooth camera transitions
 * - LookAt camera behavior for objects
 * - Cleanup of active animations
 */
export class AnimationController {
    constructor(view, guidedVisit) {
        this.view = view;
        this.guidedVisit = guidedVisit;
        this.cameraAnimationId = null;
        this.activeAnimations = new Map(); // Track animations by object ID
    }

    /**
     * Bouge la caméra vers la position donnée
     * @param  {object} position - Position à laquelle déplacer la caméra
     * @param  {object} rotation - Rotation de la caméra à son arrivée au point donné
     * @return {void}
     */
    cameraToPosition(position, rotation) {
        if (position) {
            this.view.camera.camera3D.position.set(position.x, position.y, position.z);
        }
        if (rotation) {
            this.view.camera.camera3D.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
        }
        this.view.camera.camera3D.updateMatrixWorld(true);
        this.view.notifyChange(this.view.camera.camera3D);
    }

    /**
     * Fait regarder la caméra vers un point donné (instantané)
     * @param  {object} position - Position vers laquelle la caméra doit regarder
     * @return {void}
     */
    cameraLookAt(position) {
        if (position) {
            this.view.camera.camera3D.lookAt(position.x, position.y, position.z);
        }
    }

    /**
     * Fait regarder la caméra vers un point donné de manière fluide
     * @param  {object} target - Position vers laquelle la caméra doit regarder
     * @param  {number} duration - Durée de l'animation en millisecondes (par défaut 1200ms)
     * @return {void}
     */
    cameraLookAtSmooth(target, duration = 1200) {
        const camera = this.view.camera.camera3D;
        const targetVec = new THREE.Vector3(target.x, target.y, target.z);

        // Calcul de la distance pour projeter un point cible initial devant la caméra
        const distance = camera.position.distanceTo(targetVec);

        // Détermine le point que la caméra regarde actuellement
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
        
            // Easing cubique
            const easeProgress = progress * progress * (3 - 2 * progress);

            // Interpolation (lerp) de la position cible
            const currentTarget = new THREE.Vector3().lerpVectors(startLookAt, targetVec, easeProgress);

            // Regarde le point interpolé
            camera.lookAt(currentTarget);
            camera.updateMatrixWorld(true);

            this.view.notifyChange(camera);

            if (progress < 1) {
                this.cameraAnimationId = requestAnimationFrame(animate);
            } else {
                this.view.notifyChange(camera);
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
            this.view.notifyChange(this.view.camera.camera3D);
        }
    }

    /**
     * Fait tourner la caméra selon un angle spécifique en degrés par axe
     * @param  {object} cameraMovement - Dictionnaire {rotationDegrees: {x, y, z}}
     * @return {Promise<void>}
     */
    async rotateCamera(cameraMovement) {
        await new Promise(resolve => setTimeout(resolve, 5000)); 
        const rotationDegrees = cameraMovement.rotationDegrees;
        
        if (rotationDegrees.x) this.view.camera.camera3D.rotateX(THREE.MathUtils.degToRad(rotationDegrees.x));
        if (rotationDegrees.y) this.view.camera.camera3D.rotateY(THREE.MathUtils.degToRad(rotationDegrees.y));
        if (rotationDegrees.z) this.view.camera.camera3D.rotateZ(THREE.MathUtils.degToRad(rotationDegrees.z));
        
        this.view.camera.camera3D.updateMatrixWorld(true);
        this.view.notifyChange(this.view.camera.camera3D);
    }

    /**
     * Anime le regard d'un mesh pour suivre la position de la caméra
     * @param  {object} mesh - Mesh à faire bouger
     * @return {void}
     */
    animateLookAtCamera(mesh) {
        // Track axis locks
        mesh.userData.lockAxes = { x: false, y: false, z: true };

        const updateLookAt = () => {
            if (this.view && this.view.camera && this.view.camera.camera3D) {
                const camPos = this.view.camera.camera3D.position.clone();
                const meshPos = mesh.position.clone();

                mesh.lookAt(camPos);
                mesh.updateMatrixWorld();
                this.view.notifyChange();
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

    /**
     * Anime un objet le long d'une trajectoire (ligne, spline, ou orbite)
     * @param  {string} targetObjectId - ID de l'objet à animer
     * @param  {object} objectMovement - Configuration du mouvement
     * @return {void}
     */
    animateObjectAlongTrajectory(targetObjectId, objectMovement) {
        if (!targetObjectId || !objectMovement || !objectMovement.pointsArray) return;
        
        if (objectMovement.pointsArray.length > 1 && objectMovement.type === "orbit") return;
        if (objectMovement.pointsArray.length < 2 && objectMovement.type !== "orbit") return;

        this.stopCameraAnimation();
        let targetObject;

        if (targetObjectId === "camera") {
            targetObject = this.view.camera.camera3D
        }
        else {
            targetObject = this.view.scene.children.find(child => child.userData.mediaId === targetObjectId);
        }
        if (!targetObject) {
            throw `Object ${targetObjectId} not found`;
        }

        // Création des courbes selon le type
        const points = objectMovement.pointsArray.map(p => new THREE.Vector3(p.x, p.y, p.z));
        let curve;
        
        if (objectMovement.type === 'hermite' || objectMovement.type === 'spline') {
            curve = new THREE.CatmullRomCurve3(points, objectMovement.loop || false, 'centripetal');
        } else if (objectMovement.type === 'line') {
            curve = new THREE.CatmullRomCurve3(points, objectMovement.loop || false, 'chordal');
        }
        else if (objectMovement.type === 'orbit') {
            const center = points[0];
            const cameraPos = this.view.camera.camera3D.position;
            
            let radius = objectMovement.radius || 150;
            const startAngle = Math.atan2(cameraPos.y - center.y, cameraPos.x - center.x);
            const altitude = objectMovement.cameraHeight !== undefined ? objectMovement.cameraHeight : cameraPos.z;

            const numPoints = 30;
            const orbitPoints = [];
            for (let i = 0; i <= numPoints; i++) {
                const angle = startAngle + (i / numPoints) * Math.PI * 2;
                orbitPoints.push(new THREE.Vector3(
                    center.x + Math.cos(angle) * radius,
                    center.y + Math.sin(angle) * radius,
                    altitude
                ));
            }

            this.guidedVisit.createDebugCubes(objectMovement.pointsArray, "black");
            curve = new THREE.CatmullRomCurve3(orbitPoints, true, 'centripetal');
            objectMovement.loop = true;
        }

        const duration = objectMovement.duration || 5000;
        let startTime = null;

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

            targetObject.position.copy(position);
            
            if (targetObjectId === "camera"){
                const currentRotation = this.view.camera.camera3D.quaternion;
                this.cameraToPosition(position, currentRotation);
            }

            // LookAt handling
            let lookAtT = t + 0.01;
            if (lookAtT > 1) {
                lookAtT = objectMovement.loop ? (lookAtT % 1) : 1;
            }
            const step = this.guidedVisit.getCurrentStep();

            if (lookAtT <= 1 && t !== lookAtT) {
                const lookAtPos = step?.cameraLookAt?.[0];
                if (lookAtPos) {
                    this.cameraLookAt(lookAtPos);
                }
            }

            targetObject.updateMatrixWorld();
            this.view.notifyChange();

            if (t < 1 || objectMovement.loop) {
                targetObject.userData.trajectoryAnimationId = requestAnimationFrame(animate);
            }
        };

        // Track animation for this object
        if (targetObjectId === "camera") {
            this.cameraAnimationId = requestAnimationFrame(animate);
        } else {
            targetObject.userData.trajectoryAnimationId = requestAnimationFrame(animate);
            this.activeAnimations.set(targetObjectId, targetObject.userData.trajectoryAnimationId);
        }
    }

    /**
     * Arrête tous les animations actives (pour cleanup)
     * @return {void}
     */
    stopAllAnimations() {
        this.stopCameraAnimation();
        
        this.activeAnimations.forEach((animId, objectId) => {
            cancelAnimationFrame(animId);
        });
        this.activeAnimations.clear();
    }
}

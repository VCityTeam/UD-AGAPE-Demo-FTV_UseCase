const udviz = window.app;

const urlParams = new URLSearchParams(window.location.search);
const selectedDemo = urlParams.get("demo");

/** Valeur de ?demo= qui demande de lire le brouillon de l'éditeur. */
const LOCAL_CONFIG_DEMO = "__local__";

/** Préfixe de ?demo= pour une visite enregistrée dans la bibliothèque locale. */
const LOCAL_CONFIG_PREFIX = "local:";

/** Clés partagées avec l'éditeur de configuration (même origine). */
const VISIT_CONFIG_LOCALSTORAGE_KEY = "agape_demo_visit_config";
const MEDIA_CONFIG_LOCALSTORAGE_KEY = "agape_demo_media_config";

const DEFAULT_VISIT_CONFIG = "../assets/config/functionsConfigFolder/cameraLookAtPointConfig.json";

/** Id de la visite enregistrée demandée, ou null si ce n'est pas le cas. */
const localVisitId = selectedDemo?.startsWith(LOCAL_CONFIG_PREFIX)
    ? selectedDemo.slice(LOCAL_CONFIG_PREFIX.length)
    : null;

const useLocalConfig = selectedDemo === LOCAL_CONFIG_DEMO || Boolean(localVisitId);

const visitConfigFile = (selectedDemo && !useLocalConfig)
    ? `../assets/config/${selectedDemo}`
    // En mode local le fichier par défaut sert de repli si le localStorage est vide.
    : DEFAULT_VISIT_CONFIG;

init();

async function init() {
    const configs = await udviz.loadMultipleJSON([
        "../assets/config/layerConfig.json",
        "../assets/config/mediaConfig.json",
        visitConfigFile,
        "../assets/config/functionsConfig.json"
    ]);

    const parsedConfigs = extractConfigs(configs);
    const localConfigState = applyLocalConfigs(parsedConfigs);

    // Les médias importés (ici ou dans l'éditeur) vivent dans IndexedDB: on
    // regénère une URL valable pour ce document avant de construire la visite.
    const mediaReport = await window.mediaStore?.resolveAll(parsedConfigs.mediaConfig?.medias);

    if (mediaReport?.missing.length) {
        // Sans ça l'image est simplement absente de la scène, sans aucun message.
        localConfigState.message += ` ${mediaReport.missing.length} média(s) introuvable(s)`
            + ` dans le dépôt local (${mediaReport.missing.join(", ")}):`
            + " copier le fichier dans assets/media/ ou le réimporter.";
        console.warn("Médias non résolus:", mediaReport.missing);
    }

    createMenu(
        parsedConfigs.functionsConfig,
        parsedConfigs.visitConfig
    );

    const { view, extent } = createView(parsedConfigs.layerConfig);

    
    addLayers(view, extent, parsedConfigs.layerConfig);

    const guidedTour = createGuidedTour(
        view,
        parsedConfigs.visitConfig,
        parsedConfigs.mediaConfig
    );

    createImageControls(guidedTour);
    createEditorLink(guidedTour, parsedConfigs, localConfigState);

    const firstStep = parsedConfigs.visitConfig.visits[0].steps[0];

    view.camera.camera3D.position.set( // permet de mettre la camera à la position de base donnée dans le visitConfig
        firstStep?.cameraPosition?.x ?? 1844804,
        firstStep?.cameraPosition?.y ?? 5175050,
        firstStep?.cameraPosition?.z ?? 200
    );

    // L'orientation était ignorée ici: la caméra repartait en vue du dessus, où une
    // image verticale est vue par la tranche, donc invisible.
    if (firstStep?.cameraRotation) {
        const rotation = firstStep.cameraRotation;
        view.camera.camera3D.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    }

    view.camera.camera3D.updateMatrixWorld(true);

    // Pour debug
    window.guidedTour = guidedTour;
    window.configsDebug = parsedConfigs; // debug

    

    view.notifyChange(true);
}

function extractConfigs(configs) {
    return {
        visitConfig: configs[
            Object.keys(configs).find(key => !/(mediaConfig|layerConfig|functionsConfig)/.test(key))],

        mediaConfig: configs[
            Object.keys(configs).find(key => /mediaConfig/.test(key))],

        layerConfig: configs[
            Object.keys(configs).find(key => /layerConfig/.test(key))],

        functionsConfig: configs[
            Object.keys(configs).find(key => /functionsConfig/.test(key))]
    };
}

/**
 * Lit une configuration écrite par l'éditeur dans le localStorage.
 * @param  {string} key - Clé de stockage
 * @return {object|null} - Configuration parsée, ou null si absente/illisible
 */
function readLocalConfig(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn(`Configuration locale illisible (${key}):`, error);
        return null;
    }
}

/**
 * Remplace les configs chargées par celles de l'éditeur quand le hub est ouvert
 * avec ?demo=__local__. Les fichiers restent chargés et servent de repli.
 * @param  {object} parsedConfigs - Configs issues des fichiers, modifiées sur place
 * @return {{active: boolean, message: string}} - État à afficher dans le menu
 */
function applyLocalConfigs(parsedConfigs) {
    if (!useLocalConfig) {
        return { active: false, message: "" };
    }

    const source = readLocalSource();

    if (!source) {
        return {
            active: false,
            message: localVisitId
                ? `Visite enregistrée introuvable (${localVisitId}). Configuration par défaut chargée.`
                : "Aucune visite sauvegardée dans l'éditeur. Configuration par défaut chargée."
        };
    }

    const localVisit = source.visitConfig;
    const localMedia = source.mediaConfig;

    parsedConfigs.visitConfig = normalizeVisitConfig(localVisit);

    if (localMedia?.medias?.length) {
        // Les médias de l'éditeur complètent ceux du fichier: une visite locale peut
        // référencer les deux.
        parsedConfigs.mediaConfig = {
            medias: mergeMedias(parsedConfigs.mediaConfig?.medias ?? [], localMedia.medias)
        };
    }

    const label = source.name
        || parsedConfigs.visitConfig.visits[0].name
        || "sans nom";

    return {
        active: true,
        message: `Visite locale: ${label}.`
    };
}

/**
 * Choisit la source locale demandée: une visite enregistrée si ?demo=local:<id>,
 * sinon le brouillon partagé avec l'éditeur.
 * @return {{visitConfig: object, mediaConfig: object, name: string}|null}
 */
function readLocalSource() {
    if (localVisitId) {
        const saved = window.visitLibrary?.load(localVisitId);
        return saved
            ? { visitConfig: saved.visitConfig, mediaConfig: saved.mediaConfig, name: saved.entry.name }
            : null;
    }

    const visitConfig = readLocalConfig(VISIT_CONFIG_LOCALSTORAGE_KEY);
    if (!visitConfig?.visits?.length) return null;

    return {
        visitConfig: visitConfig,
        mediaConfig: readLocalConfig(MEDIA_CONFIG_LOCALSTORAGE_KEY),
        name: ""
    };
}

/**
 * Fusionne deux listes de médias, ceux de l'éditeur l'emportant à id égal.
 * @param  {Array} fileMedias - Médias venant de mediaConfig.json
 * @param  {Array} localMedias - Médias venant de l'éditeur
 * @return {Array} - Liste fusionnée
 */
function mergeMedias(fileMedias, localMedias) {
    const merged = new Map();
    fileMedias.forEach((media) => merged.set(media.id, media));
    localMedias.forEach((media) => merged.set(media.id, media));
    return [...merged.values()];
}

/**
 * Complète les étapes venant de l'éditeur: celui-ci n'écrit ni "id", ni "next",
 * ni "previous", dont dépendent les boutons Previous/Next du GuidedTour.
 * @param  {object} visitConfig - Configuration de visite
 * @return {object} - Configuration avec les étapes complétées
 */
function normalizeVisitConfig(visitConfig) {
    return {
        ...visitConfig,
        visits: visitConfig.visits.map((visit) => {
            const steps = visit.steps ?? [];

            return {
                ...visit,
                steps: steps.map((step, index) => silenceCameraAnimations({
                    ...step,
                    id: step.id ?? index,
                    previous: step.previous ?? Math.max(index - 1, 0),
                    next: step.next ?? Math.min(index + 1, steps.length - 1)
                }))
            };
        })
    };
}

/**
 * Neutralise les animations de caméra d'une étape dont le point de vue a été
 * capturé depuis le hub.
 *
 * cameraLookAtSmooth anime la caméra pendant 1200 ms via requestAnimationFrame,
 * donc bien après que goToStep et init aient posé la caméra: sans ça l'animation
 * réécrase l'orientation enregistrée et la vue revient sur l'ancienne cible.
 * Seule la copie en mémoire est modifiée, la configuration stockée garde ses champs.
 *
 * @param  {object} step - Étape à traiter (copie de travail)
 * @return {object} - La même étape, sans animation de caméra concurrente
 */
function silenceCameraAnimations(step) {
    if (!step.cameraFromHub) return step;

    delete step.cameraLookAt;
    delete step.cameraMovement;

    if (Array.isArray(step.objectMovement)) {
        // Les trajectoires d'objets sont conservées, seules celles qui pilotent la
        // caméra sont retirées.
        step.objectMovement = step.objectMovement.filter(
            (movement) => movement.objectId !== "camera"
        );

        if (step.objectMovement.length === 0) {
            delete step.objectMovement;
        }
    }

    return step;
}

function createView(layerConfig) {

    udviz.proj4.default.defs(
        layerConfig.projection,
        layerConfig.transform
    );

    const extent = new udviz.itowns.Extent(
        layerConfig.projection,
        parseInt(layerConfig.extents.min_x),
        parseInt(layerConfig.extents.max_x),
        parseInt(layerConfig.extents.min_y),
        parseInt(layerConfig.extents.max_y)
    );

    const viewContainer = document.getElementById("view_container");
    viewContainer.classList.add("demo_hub_screen");

    const view = new udviz.itowns.PlanarView(
        viewContainer,
        extent,
        {
            maxSubdivisionLevel: layerConfig.background_image_layer.maxSubdivisionLevel || 15
        }
    );

    udviz.initScene(
        view.camera.camera3D,
        view.mainLoop.gfxEngine.renderer,
        view.scene
    );

    view.camera.camera3D.fov = 70; // un peu plus grand angle (défaut ~50)
    view.camera.camera3D.updateProjectionMatrix();

    return { view, extent };
}

function addLayers(view, extent, layerConfig) {

    // 3D Tiles
    layerConfig["3DTilesLayers"].forEach(layer => {
        udviz.itowns.View.prototype.addLayer.call(
            view,
            new udviz.itowns.C3DTilesLayer(
                layer.id,
                {
                    name: layer.id,
                    source: new udviz.itowns.C3DTilesSource({
                        url: layer.url
                    }),
                },
                view
            )
        );
    });

    // Background imagery
    view.addLayer(
        new udviz.itowns.ColorLayer(
            layerConfig.background_image_layer.layer_name,
            {
                updateStrategy: {
                    type: udviz.itowns.STRATEGY_DICHOTOMY,
                    options: {},
                },
                source: new udviz.itowns.WMSSource({
                    extent: extent,
                    name: layerConfig.background_image_layer.name,
                    url: layerConfig.background_image_layer.url,
                    version: layerConfig.background_image_layer.version,
                    crs: extent.crs,
                    format: layerConfig.background_image_layer.format,
                }),
                transparent: true,
            }
        )
    );

    // Elevation
    view.addLayer(
        new udviz.itowns.ElevationLayer(
            layerConfig.elevation_layer.layer_name,
            {
                useColorTextureElevation: true,
                colorTextureElevationMinZ:
                    layerConfig.elevation_layer.colorTextureElevationMinZ,
                colorTextureElevationMaxZ:
                    layerConfig.elevation_layer.colorTextureElevationMaxZ,

                source: new udviz.itowns.WMSSource({
                    extent: extent,
                    url: layerConfig.elevation_layer.url,
                    name: layerConfig.elevation_layer.name,
                    crs: extent.crs,
                    heightMapWidth: 256,
                    format: layerConfig.elevation_layer.format,
                }),
            }
        )
    );
}

function createGuidedTour(view, visitConfig, mediaConfig) {
    const guidedTour = new udviz.GuidedVisit(
        view,
        visitConfig.visits[0],
        mediaConfig.medias
    );

    guidedTour.goToStep(0);

    guidedTour.previousButton.innerText = "Previous";
    guidedTour.nextButton.innerText = "Next";

    window.guidedTour = guidedTour;

    return guidedTour;
}

function createMenu(functionsConfig, visitConfig) {
    const menuDiv = document.querySelector(".demo_hub_menu");

    if (!menuDiv || !functionsConfig?.functions) return;

    const categories = {};

    functionsConfig.functions.forEach(func => {
        const cat = func.category || "Other";
        const subcat = func.subcategory || null;

        if (!categories[cat]) {
            categories[cat] = {
                items: [],
                subcategories: {}
            };
        }

        if (subcat) {
            if (!categories[cat].subcategories[subcat]) {
                categories[cat].subcategories[subcat] = [];
            }

            categories[cat].subcategories[subcat].push(func);
        } else {
            categories[cat].items.push(func);
        }
    });

    const menuContainer = document.createElement("div");
    menuContainer.className = "demo_hub_menu_container";

    const onDemoChange = (e) => {
        if (e.target.value) {
            window.location.search = "?demo=" + e.target.value;
        }
    };

    const createRadioOption = (func) => {
    const configValue = func.config || func.id;

    const label = document.createElement("label");
    label.className =
        "demo_hub_label" +
        (func.status === "wip" ? " wip" : "");

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "demoSelect";
    radio.value = configValue;

    if (func.status === "wip") {
        radio.disabled = true;
        
    }

    if (
        selectedDemo === configValue ||
        (!selectedDemo &&
            configValue.includes("visitConfig_dynamic"))
    ) {
        radio.checked = true;
    }

    radio.addEventListener("change", onDemoChange);

    const text = document.createElement("span");
    text.className = "demo_hub_text";

    if (func.status === "debug") {
        text.innerText = func.name + " (DEBUG)";
        text.classList.add("debug");

    } else if (func.status === "wip") {
        text.innerText = func.name + " (WIP)";
        text.classList.add("wip");
        //text.hidden = true;
        //radio.hidden = true;


    } else {
        text.innerText = func.name;
    }

    label.appendChild(radio);
    label.appendChild(text);

    return label;
};

    // Les visites locales apparaissent comme des démos parmi les autres, pour ne
    // pas dépendre d'une URL à taper à la main.
    const localOptions = [];

    const draft = readLocalConfig(VISIT_CONFIG_LOCALSTORAGE_KEY);
    if (draft?.visits?.length) {
        localOptions.push({
            config: LOCAL_CONFIG_DEMO,
            name: `${draft.visits[0].name || "Visite"} (brouillon)`
        });
    }

    (window.visitLibrary?.list() ?? []).forEach((entry) => {
        localOptions.push({
            config: LOCAL_CONFIG_PREFIX + entry.id,
            name: entry.name
        });
    });

    if (localOptions.length > 0) {
        const localDiv = document.createElement("div");
        localDiv.className = "demo_hub_category";

        const localTitle = document.createElement("h3");
        localTitle.className = "demo_hub_category_label";
        localTitle.innerText = "Visites locales";
        localDiv.appendChild(localTitle);

        localOptions.forEach((option) => localDiv.appendChild(createRadioOption(option)));
        menuContainer.appendChild(localDiv);
    }

    for (const [category, data] of Object.entries(categories)) {
        const catDiv = document.createElement("div");
        catDiv.className = "demo_hub_category";

        const title = document.createElement("h3");
        title.className = "demo_hub_category_label";
        title.innerText = category;

        catDiv.appendChild(title);

        data.items.forEach(func => {
            catDiv.appendChild(createRadioOption(func));
        });

        for (const [subcat, funcs] of Object.entries(data.subcategories)) {
            const subDiv = document.createElement("div");
            subDiv.className = "demo_hub_subcategory";

            const subTitle = document.createElement("h4");
            subTitle.className = "demo_hub_subcategory_label";
            subTitle.innerText = subcat;

            subDiv.appendChild(subTitle);

            funcs.forEach(func => {
                subDiv.appendChild(createRadioOption(func));
            });

            catDiv.appendChild(subDiv);
        }

        menuContainer.appendChild(catDiv);
    }

    const description = document.createElement("div");
    description.className = "demo_hub_description";

    description.innerText =
        visitConfig?.description ??
        visitConfig?.visits?.[0]?.description ??
        "No description available.";

    menuDiv.appendChild(menuContainer);
    menuDiv.appendChild(description);
}

/**
 * Ajoute le lien retour vers l'éditeur: renvoie la visite telle qu'elle est
 * actuellement en mémoire, y compris les positions/rotations/échelles ajustées
 * à la main dans la scène.
 * @param  {object} guidedTour - Visite guidée courante
 * @param  {object} parsedConfigs - Configurations chargées
 * @param  {object} localConfigState - État renvoyé par applyLocalConfigs
 * @return {void}
 */
function createEditorLink(guidedTour, parsedConfigs, localConfigState) {
    const menuDiv = document.querySelector(".demo_hub_menu");
    if (!menuDiv) return;

    const controls = document.createElement("div");
    controls.className = "demo_hub_editor_link";

    if (localConfigState.message) {
        const banner = document.createElement("p");
        banner.className = "demo_hub_local_banner";
        banner.textContent = localConfigState.message;
        controls.appendChild(banner);
    }

    const sendButton = document.createElement("button");
    sendButton.type = "button";
    sendButton.className = "demo_hub_add_image";
    sendButton.textContent = "Envoyer vers l'éditeur";

    const status = document.createElement("p");
    status.className = "demo_hub_media_status";

    sendButton.addEventListener("click", async () => {
        sendButton.disabled = true;
        status.textContent = "Sauvegarde en cours...";

        try {
            // Une écriture IndexedDB encore en vol serait annulée par la navigation,
            // et le média serait introuvable au retour dans le hub.
            await window.mediaStore?.whenIdle();

            const result = sendVisitToEditor(guidedTour, parsedConfigs);

            if (!result.saved) {
                status.textContent = result.message;
                sendButton.disabled = false;
                return;
            }

            window.location.href = "config_editor.html";
        } catch (error) {
            // Sans ça une erreur laisserait le bouton désactivé sans explication.
            console.error("Envoi vers l'éditeur impossible:", error);
            status.textContent = `Envoi impossible: ${error.message}`;
            sendButton.disabled = false;
        }
    });

    controls.appendChild(sendButton);
    controls.appendChild(status);
    menuDiv.appendChild(controls);
}

/**
 * Enregistre le point de vue courant dans l'étape affichée.
 * Sans cela l'étape revient de l'éditeur sans caméra: le hub replace la caméra à
 * sa position par défaut, en vue du dessus, où une image verticale est vue par la
 * tranche et semble avoir disparu.
 * @param  {object} guidedTour - Visite guidée courante
 * @return {void}
 */
function captureCameraIntoCurrentStep(guidedTour) {
    const step = guidedTour.getCurrentStep?.();
    const camera = guidedTour.itownsView?.camera?.camera3D;
    if (!step || !camera) return;

    step.cameraPosition = {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z
    };

    step.cameraRotation = {
        x: camera.quaternion.x,
        y: camera.quaternion.y,
        z: camera.quaternion.z,
        w: camera.quaternion.w
    };

    // Marque le point de vue comme choisi par l'utilisateur: au rechargement il doit
    // l'emporter sur les animations de caméra de l'étape.
    step.cameraFromHub = true;
}

/**
 * Écrit la visite et les médias courants dans le localStorage lu par l'éditeur.
 * @param  {object} guidedTour - Visite guidée courante
 * @param  {object} parsedConfigs - Configurations chargées
 * @return {{saved: boolean, message: string}} - Résultat de la sauvegarde
 */
function sendVisitToEditor(guidedTour, parsedConfigs) {
    const sourceVisit = parsedConfigs.visitConfig?.visits?.[0] ?? {};

    captureCameraIntoCurrentStep(guidedTour);

    const visitPayload = {
        visits: [{
            id: sourceVisit.id ?? "visitConfig",
            name: guidedTour.name,
            description: guidedTour.description,
            steps: guidedTour.steps
        }]
    };

    // Les octets étant dans le dépôt partagé, il suffit de repasser `value` sur le
    // chemin portable: l'éditeur retrouvera le média par sa `storageKey`.
    const medias = guidedTour.mediaConfig ?? [];
    const portable = medias.map((media) => {
        if (window.mediaStore) return window.mediaStore.toPortable(media);

        // Repli si le dépôt n'a pas pu être chargé: ne jamais écrire une URL blob:,
        // elle serait morte à l'arrivée dans l'éditeur.
        const copy = { ...media };
        if (copy.assetPath) {
            copy.value = copy.assetPath;
        } else if (String(copy.value).startsWith("blob:")) {
            copy.value = "";
        }
        return copy;
    });

    const orphans = portable.filter((media) => !media.storageKey && !media.value);

    try {
        localStorage.setItem(VISIT_CONFIG_LOCALSTORAGE_KEY, JSON.stringify(visitPayload));
        localStorage.setItem(MEDIA_CONFIG_LOCALSTORAGE_KEY, JSON.stringify({ medias: portable }));
    } catch (error) {
        return {
            saved: false,
            message: `Sauvegarde impossible: ${error.message}`
        };
    }

    if (orphans.length > 0) {
        console.warn(
            `${orphans.length} média(s) sans fichier ni chemin connu: `
            + "leur valeur a été vidée pour ne pas écrire une URL morte."
        );
    }

    return { saved: true, message: "" };
}

function createImageControls(guidedTour) {
    const menuDiv = document.querySelector(".demo_hub_menu");
    if (!menuDiv) return;

    const controls = document.createElement("div");
    controls.className = "demo_hub_media_controls";

    const addImageButton = document.createElement("button");
    addImageButton.type = "button";
    addImageButton.className = "demo_hub_add_image";
    addImageButton.textContent = "Ajouter une image";

    const status = document.createElement("p");
    status.className = "demo_hub_media_status";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.hidden = true;

    addImageButton.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (file) {
            const imageMesh = addImageToCurrentStep(guidedTour, file);
            status.textContent = imageMesh
                ? "Image ajoutée et sélectionnée. Utiliser le panneau en haut à gauche de la scène "
                  + "(Déplacer / Hauteur / Tourner / Taille)."
                : "Impossible d'ajouter l'image à cette étape.";
        }
        fileInput.value = "";
    });

    controls.appendChild(addImageButton);
    controls.appendChild(status);
    controls.appendChild(fileInput);
    menuDiv.appendChild(controls);
}

function addImageToCurrentStep(guidedTour, file) {
    const step = guidedTour.getCurrentStep();
    if (!step) return null;

    const view = guidedTour.itownsView;
    const mediaId = `image_${file.name.replace(/\.[^.]+$/, "")}_${Date.now()}`;
    const objectUrl = URL.createObjectURL(file);
    const position = getImageStartPosition(view);

    const media = {
        id: mediaId,
        type: "image",
        // URL vivante pour cette page; `assetPath` est ce qui sera exporté.
        value: objectUrl,
        assetPath: window.mediaStore?.assetPathFor("image", file.name)
            ?? `../assets/media/images/${file.name}`,
        position: position,
        rotation: getImageStartRotation(view, position),
        scale: { x: 1, y: 1, z: 1 },
        fileName: file.name
    };

    // Conserver les octets: sans cela l'image disparaît au rechargement et ne peut
    // pas être transmise à l'éditeur, une URL blob: ne survivant pas à la navigation.
    if (window.mediaStore) {
        media.storageKey = mediaId;
        window.mediaStore.put(mediaId, file).catch((error) => {
            console.warn("Média non stocké, il sera perdu au rechargement:", error);
            delete media.storageKey;
        });
    }

    if (!Array.isArray(step.media)) step.media = [];
    step.media.push({
        id: media.id,
        position: media.position,
        rotation: media.rotation,
        scale: media.scale
    });

    if (Array.isArray(guidedTour.mediaConfig)) {
        guidedTour.mediaConfig.push(media);
    }

    const imageMesh = guidedTour.mediaManager.addImageAtCoordinates(
        media.value,
        media.position,
        media.rotation,
        media.scale,
        null,
        media.id
    );

    // Kept so the blob URL can be released when the media is deleted for good.
    imageMesh.userData.objectUrl = objectUrl;

    guidedTour.enableInteractiveMode();
    guidedTour.interactiveObjectController.selectObject(imageMesh);
    guidedTour.updateInteractiveToggleButton();

    return imageMesh;
}

/**
 * Place a new image on the ground the camera is looking at, slightly raised so it
 * is not buried in the terrain or the buildings.
 * @param  {object} view - The iTowns view
 * @return {{x: number, y: number, z: number}} - Start position of the image
 */
function getImageStartPosition(view) {
    const camera = view.camera.camera3D;

    // Depth picking at the centre of the screen: the point of the city the user
    // is actually looking at.
    const groundPoint = view.getPickingPositionFromDepth();
    if (groundPoint) {
        return {
            x: groundPoint.x,
            y: groundPoint.y,
            z: groundPoint.z + 50
        };
    }

    // Fallback when the terrain is not ready yet: drop it in front of the camera,
    // staying at a comparable altitude instead of following the camera pitch
    // underground.
    const direction = new udviz.THREE.Vector3();
    camera.getWorldDirection(direction);
    direction.z = 0;
    if (direction.lengthSq() < 1e-6) {
        direction.set(0, 1, 0);
    }
    direction.normalize();

    return {
        x: camera.position.x + direction.x * 300,
        y: camera.position.y + direction.y * 300,
        z: camera.position.z - 50
    };
}

/**
 * Orient a new image as an upright billboard facing the camera.
 * @param  {object} view - The iTowns view
 * @param  {{x: number, y: number, z: number}} position - Where the image is placed
 * @return {{x: number, y: number, z: number, w: number}} - Start rotation quaternion
 */
function getImageStartRotation(view, position) {
    const THREE = udviz.THREE;
    const camera = view.camera.camera3D;

    // Plane normal (+Z of the geometry) points horizontally back to the camera...
    const normal = new THREE.Vector3(
        camera.position.x - position.x,
        camera.position.y - position.y,
        0
    );
    if (normal.lengthSq() < 1e-6) {
        normal.set(0, -1, 0);
    }
    normal.normalize();

    // ...and its +Y stays aligned with the world up axis, so the image stands up.
    const up = new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3().crossVectors(up, normal).normalize();

    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(right, up, normal)
    );

    return { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w };
}

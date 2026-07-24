const udviz = window.app;

const urlParams = new URLSearchParams(window.location.search);
const selectedDemo = urlParams.get("demo");

const visitConfigFile = selectedDemo
    ? `../assets/config/${selectedDemo}`
    : "../assets/config/functionsConfigFolder/cameraLookAtPointConfig.json";

init();

async function init() {
    const configs = await udviz.loadMultipleJSON([
        "../assets/config/layerConfig.json",
        "../assets/config/mediaConfig.json",
        visitConfigFile,
        "../assets/config/functionsConfig.json"
    ]);

    const parsedConfigs = extractConfigs(configs);

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

    view.camera.camera3D.position.set( // permet de mettre la camera à la position de base donnée dans le visitConfig
        parsedConfigs.visitConfig.visits[0].steps[0].cameraPosition?.x ?? 1844804,
        parsedConfigs.visitConfig.visits[0].steps[0].cameraPosition?.y ?? 5175050,
        parsedConfigs.visitConfig.visits[0].steps[0].cameraPosition?.z ?? 200
    );

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
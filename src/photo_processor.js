// Initialize Proj4 (EPSG:4326 to EPSG:3946)
proj4.defs(
    "EPSG:3946",
    "+proj=lcc +lat_0=46 +lon_0=3 +lat_1=45.25 +lat_2=46.75 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs"
);

const logArea = document.getElementById('logArea');
const downloadMediaBtn = document.getElementById('downloadMedia');
const downloadVisitBtn = document.getElementById('downloadVisit');
const resultsSection = document.getElementById('resultsArea');

function log(message) {
    const p = document.createElement('div');
    p.textContent = message;
    logArea.appendChild(p);
    logArea.scrollTop = logArea.scrollHeight;
}

function getRotations() {
    return {
        north: { x: 0.707, y: 0, z: 0, w: 0.707 },
        south: { x: 0, y: 0.707, z: 0.707, w: 0 },
        east: { x: -0.500, y: 0.500, z: 0.500, w: -0.500 },
        west: { x: 0.500, y: -0.500, z: -0.500, w: 0.500 },
        byPosition: {
            0: { x: -0.500, y: 0.500, z: 0.500, w: -0.500 }, // east
            1: { x: 0.707, y: 0, z: 0, w: 0.707 }, // north
            2: { x: 0.500, y: -0.500, z: -0.500, w: 0.500 } // west
        }
    };
}

function parseEXIFDate(dateString) {
    if (!dateString) return null;
    // EXIF format: "YYYY:MM:DD HH:MM:SS"
    const parts = dateString.split(' ');
    if (parts.length !== 2) return null;
    const dateParts = parts[0].split(':');
    const timeParts = parts[1].split(':');
    return new Date(
        dateParts[0], dateParts[1] - 1, dateParts[2],
        timeParts[0], timeParts[1], timeParts[2]
    );
}

document.getElementById('imageInput').addEventListener('change', async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    // Reset UI
    resultsSection.style.display = 'block';
    logArea.innerHTML = '';
    downloadMediaBtn.style.display = 'none';
    downloadVisitBtn.style.display = 'none';

    log(`Traitement de ${files.length} images...`);

    // 1. Extract Metadata
    const imagesWithMetadata = [];

    for (const file of files) {
        try {
            const tags = await ExifReader.load(file);

            let imgDate = null;
            if (tags['DateTimeOriginal']) {
                imgDate = parseEXIFDate(tags['DateTimeOriginal'].description);
            }

            if (imgDate && tags['GPSLatitude'] && tags['GPSLongitude']) {
                const lat = tags['GPSLatitude'].description;
                const lon = tags['GPSLongitude'].description;

                // Convert coordinates
                const [x_3946, y_3946] = proj4('EPSG:4326', 'EPSG:3946', [lon, lat]);

                imagesWithMetadata.push({
                    filename: file.name,
                    datetime: imgDate,
                    gps: { lon, lat },
                    position: { x: x_3946, y: y_3946, z: 200 }
                });
            } else {
                log(`Ignoré: ${file.name} (métadonnées GPS ou date manquantes)`);
            }
        } catch (e) {
            log(`Erreur de lecture: ${file.name} - ${e.message}`);
        }
    }

    // Sort by datetime
    imagesWithMetadata.sort((a, b) => a.datetime - b.datetime);
    log(`Métadonnées extraites pour ${imagesWithMetadata.length} images valides.`);

    if (imagesWithMetadata.length === 0) {
        log("Aucune image valide trouvée. Arrêt.");
        return;
    }

    // 2. Group Images by Time (< 11 seconds apart)
    const imagesGroupsByTime = {};
    for (let i = 0; i < imagesWithMetadata.length - 1; i++) {
        const diffSeconds = (imagesWithMetadata[i + 1].datetime - imagesWithMetadata[i].datetime) / 1000;

        if (diffSeconds < 11) {
            const groupKey = `Groupe ${i}`;
            if (!imagesGroupsByTime[groupKey]) imagesGroupsByTime[groupKey] = [];
            imagesGroupsByTime[groupKey].push(imagesWithMetadata[i]);
            imagesGroupsByTime[groupKey].push(imagesWithMetadata[i + 1]);
        } else {
            const groupKey = imagesWithMetadata[i].datetime.toISOString();
            if (!imagesGroupsByTime[groupKey]) imagesGroupsByTime[groupKey] = [];
            imagesGroupsByTime[groupKey].push(imagesWithMetadata[i]);
        }
    }

    // Merge overlapping groups
    let merged = true;
    while (merged) {
        merged = false;
        const keys = Object.keys(imagesGroupsByTime);
        for (let i = 0; i < keys.length; i++) {
            for (let j = i + 1; j < keys.length; j++) {
                if (imagesGroupsByTime[keys[i]] && imagesGroupsByTime[keys[j]]) {
                    const setI = new Set(imagesGroupsByTime[keys[i]].map(img => img.filename));
                    const setJ = new Set(imagesGroupsByTime[keys[j]].map(img => img.filename));

                    const intersection = [...setI].filter(x => setJ.has(x));
                    if (intersection.length > 0) {
                        const combined = [...imagesGroupsByTime[keys[i]], ...imagesGroupsByTime[keys[j]]];
                        // Remove duplicates in combined
                        const uniqueMap = new Map();
                        combined.forEach(img => uniqueMap.set(img.filename, img));

                        imagesGroupsByTime[keys[i]] = Array.from(uniqueMap.values());
                        delete imagesGroupsByTime[keys[j]];
                        merged = true;
                    }
                }
            }
        }
    }

    // Sort within groups and finalize
    for (const group in imagesGroupsByTime) {
        imagesGroupsByTime[group].sort((a, b) => a.datetime - b.datetime);
    }

    log(`Nombre de groupes créés: ${Object.keys(imagesGroupsByTime).length}`);

    // 3. Create Output Data (Media)
    const outputData = [];
    let imageId = 1;
    const rotations = getRotations();

    for (const [groupName, images] of Object.entries(imagesGroupsByTime)) {
        const middlePos = { ...images[0].position };

        images.forEach((imageInfo, positionInGroup) => {
            const rotation = rotations.byPosition[positionInGroup] || rotations.north;
            const pos = { ...middlePos };

            if (positionInGroup === 0) {
                pos.x -= 30;
            } else if (positionInGroup === 2) {
                pos.x += 30;
            } else {
                pos.y += 30;
            }

            outputData.push({
                id: `image_${imageId}`,
                type: "image",
                value: "../assets/media/images/" + imageInfo.filename,
                position: pos,
                rotation: rotation,
                scale: { x: 0.3, y: 0.3, z: 0.3 },
                display3D: true
            });
            imageId++;
        });
    }

    // 4. Create Visit Dictionary
    const visitDictionary = {
        visits: [
            {
                id: "Visit_1",
                name: "Generated Visit",
                description: "Visit generated from image data",
                startIndex: 0,
                endIndex: Object.keys(imagesGroupsByTime).length - 1,
                steps: Object.entries(imagesGroupsByTime).map(([groupName, images], idx) => {
                    const groupImagesConfigs = outputData.filter(media =>
                        images.some(img => media.value.endsWith(img.filename))
                    );

                    // Default to first image if group images are somehow empty or less than 2
                    let refPos = groupImagesConfigs[0]?.position || { x: 0, y: 0, z: 0 };
                    if (groupImagesConfigs.length > 1) {
                        refPos = groupImagesConfigs[1].position;
                    }

                    return {
                        previous: idx > 0 ? idx - 1 : 0,
                        next: idx < Object.keys(imagesGroupsByTime).length - 1 ? idx + 1 : Object.keys(imagesGroupsByTime).length - 1,
                        type: "image_step",
                        layers: ["Ortho_IGN", "lyon3", "planar"],
                        media: groupImagesConfigs.map(m => m.id),
                        position: {
                            x: refPos.x,
                            y: refPos.y - 80,
                            z: refPos.z
                        },
                        rotation: rotations.north
                    };
                })
            }
        ]
    };

    const finalMediaDictionary = { medias: outputData };

    // 5. Setup Download Links
    const createDownload = (btn, data, filename) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        btn.href = url;
        btn.download = filename;
        btn.style.display = 'inline-block';
    };

    createDownload(downloadMediaBtn, finalMediaDictionary, 'mediaConfig.json');
    createDownload(downloadVisitBtn, visitDictionary, 'visitConfig.json');

    log(`Terminé ! ${outputData.length} images traitées avec succès.`);
    log(`Vous pouvez maintenant télécharger les fichiers JSON.`);
});

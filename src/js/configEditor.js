const defaultStepTemplates = {
    basic(index = 0) {
        return {
            id: index,
            type: 'image_step',
            layers: ['Ortho_IGN', 'planar', 'lyon_2018'],
        };
    },

    lookat(index = 0) {
        return {
            id: index,
            type: 'image_step',
            layers: ['Ortho_IGN', 'planar', 'lyon_2018'],
            cameraLookAt: [{ x: 1844040, y: 5175100, z: 200 }],
        };
    },

    movement(index = 0) {
        return {
            id: index,
            type: 'image_step',
            layers: ['Ortho_IGN', 'planar', 'lyon_2018'],
            objectMovement: [
                {
                    objectId: 'camera',
                    type: 'spline',
                    pointsArray: [
                        { x: 1844017, y: 5175100, z: 200 },
                        { x: 1844050, y: 5175200, z: 260 },
                    ],
                    duration: 2000,
                },
            ],
        };
    },

    media(index = 0) {
        return {
            id: index,
            type: 'image_step',
            layers: ['Ortho_IGN', 'planar', 'lyon_2018'],
            media: [],
        };
    },
};

function defaultState() {
    return {
        visits: [
            {
                id: 'visitConfig',
                name: 'Visite 1',
                description: 'Visite générée depuis l\'éditeur JSON.',
                steps: [defaultStepTemplates.basic(0)],
            },
        ],
    };
}

const state = defaultState();
const elements = {};
const uiState = {
    mode: 'visit',
    selectedStepIndex: 0,
};

const VISIT_CONFIG_LOCALSTORAGE_KEY = 'agape_demo_visit_config';

const MEDIA_CONFIG_LOCALSTORAGE_KEY = 'agape_demo_media_config';

function defaultMediaState() {
    return {
        media: [],
    };

}

const mediaState = defaultMediaState();

function normalizeMediaItem(item) {
    const normalized = { ...item };
    normalized.id = String(normalized.id || '').trim();
    normalized.type = normalized.type || 'file';

    if (normalized.value !== undefined && normalized.value !== null) {
        normalized.value = String(normalized.value);
    }

    if ('isFullScreen' in normalized) {
        normalized.isFullScreen = Boolean(normalized.isFullScreen);
    }

    if (normalized.position) {
        normalized.position = normalizeVector3(normalized.position);
    }

    if (normalized.rotation) {
        normalized.rotation = normalizeVector4(normalized.rotation);
    }

    if (normalized.scale) {
        normalized.scale = normalizeVector3(normalized.scale);
    }

    return normalized;
}

function normalizeMediaState(importedState) {
    const media = Array.isArray(importedState?.medias)
        ? importedState.medias
        : Array.isArray(importedState?.media)
            ? importedState.media
            : [];

    return {
        media: media.map(normalizeMediaItem),
    };
}

function currentMediaItems() {
    return mediaState.media;
}

function currentMediaIds() {
    return currentMediaItems()
        .map((item) => item.id)
        .filter(Boolean);
}

function currentMediaIndex() {
    if (typeof mediaState.selectedIndex !== 'number') {
        mediaState.selectedIndex = 0;
    }

    if (mediaState.selectedIndex < 0) {
        mediaState.selectedIndex = 0;
    }

    if (mediaState.selectedIndex >= currentMediaItems().length) {
        mediaState.selectedIndex = currentMediaItems().length - 1;
    }

    return mediaState.selectedIndex;
}

function currentMediaItem() {
    return currentMediaItems()[currentMediaIndex()];
}

function ensureUniqueMediaId(baseId) {
    const existing = new Set(currentMediaIds());
    if (!existing.has(baseId)) {
        return baseId;
    }

    let counter = 2;
    let candidate = `${baseId}_${counter}`;
    while (existing.has(candidate)) {
        counter += 1;
        candidate = `${baseId}_${counter}`;
    }
    return candidate;
}

function serializeMediaItem(media) {
    const payload = {
        id: media.id,
        type: media.type,
    };

    payload.value = media.value;
    if ('isFullScreen' in media) {
        payload.isFullScreen = Boolean(media.isFullScreen);
    }
    if (media.position) {
        payload.position = clone(media.position);
    }
    if (media.rotation) {
        payload.rotation = clone(media.rotation);
    }
    if (media.scale) {
        payload.scale = clone(media.scale);
    }

    return payload;
}

function buildMediaValueFromItem(media) {
    const typeExtensions = {
        image: 'jpg',
        video: 'mp4',
        audio: 'mp3',
        obj3d: 'gltf',
        text: 'txt',
    };

    const extension = typeExtensions[media.type] || 'file';

    if (media.fileName) {
        const fileName = media.fileName.includes('.') ? media.fileName : `${media.fileName}.${extension}`;
        return `../assets/media/${media.type || 'file'}/${fileName}`;
    }

    if (media.id) {
        const fileName = media.id.includes('.') ? media.id : `${media.id}.${extension}`;
        return `../assets/media/${media.type || 'file'}/${fileName}`;
    }

    return `../assets/media/${media.type || 'file'}/`;
}

function syncMediaValue(media) {
    media.value = buildMediaValueFromItem(media);
}

function detectMediaTypeFromFile(file) {
    const mime = file.type || '';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('text/')) return 'text';

    // fallback to extension-based detection for 3D models
    const name = file.name.toLowerCase();
    if (name.endsWith('.gltf') || name.endsWith('.glb') || name.endsWith('.obj') || name.endsWith('.fbx')) return 'obj3d';

    return 'file';
}

function addMediaFromFile(file) {
    const id = ensureUniqueMediaId(file.name.replace(/\.[^.]+$/, ''));
    const type = detectMediaTypeFromFile(file);

    const item = {
        id,
        type,
        fileName: file.name,
        size: file.size,
        mime: file.type,
    };

    syncMediaValue(item);
    mediaState.media.push(item);
    mediaState.selectedIndex = mediaState.media.length - 1;
    renderMediaConfigs();
    setStatus(`Média ajouté: ${file.name}`);
}

function renderMediaConfigs() {
    if (!elements.mediaSelector || !elements.mediaContainer) return;

    const items = currentMediaItems();
    const previousIndex = currentMediaIndex();

    elements.mediaSelector.replaceChildren();
    items.forEach((item, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = `${index + 1}. ${item.id || 'media'}`;
        elements.mediaSelector.appendChild(option);
    });

    elements.mediaSelector.disabled = items.length === 0;
    elements.mediaCount.textContent = `${items.length} média(s)`;

    if (items.length === 0) {
        mediaState.selectedIndex = 0;
        elements.mediaContainer.replaceChildren();
        const hint = document.createElement('p');
        hint.className = 'step_hint';
        hint.textContent = 'Ajoute un média pour commencer.';
        elements.mediaContainer.appendChild(hint);
        return;
    }

    mediaState.selectedIndex = Math.min(previousIndex, items.length - 1);
    elements.mediaSelector.value = String(mediaState.selectedIndex);
    if (!elements.mediaSelector.dataset.boundChange) {
        elements.mediaSelector.addEventListener('change', () => {
            mediaState.selectedIndex = Number(elements.mediaSelector.value);
            renderMediaConfigs();
        });
        elements.mediaSelector.dataset.boundChange = 'true';
    }
    elements.mediaContainer.replaceChildren(renderMediaEditorCard(items[mediaState.selectedIndex], mediaState.selectedIndex));
}

function updateMediaItem(mediaIndex, updater) {
    updater(currentMediaItems()[mediaIndex]);
}

function addMediaProperty(mediaIndex, property, value) {
    updateMediaItem(mediaIndex, (media) => {
        media[property] = clone(value);
    });
    renderMediaConfigs();
}

function removeMediaProperty(mediaIndex, property) {
    updateMediaItem(mediaIndex, (media) => {
        delete media[property];
    });
    renderMediaConfigs();
}

function removeMediaItem(mediaIndex) {
    currentMediaItems().splice(mediaIndex, 1);
    mediaState.selectedIndex = Math.min(mediaIndex, currentMediaItems().length - 1);
    renderMediaConfigs();
}

function renderMediaEditorCard(mediaItem, mediaIndex) {
    const card = document.createElement('article');
    card.className = 'step_card';

    const header = document.createElement('div');
    header.className = 'step_card_header';

    const title = document.createElement('h3');
    title.textContent = `Média ${mediaIndex + 1}`;

    const actions = document.createElement('div');
    actions.className = 'step_card_actions';
    actions.appendChild(createButton('Supprimer', 'step_action_button', () => removeMediaItem(mediaIndex)));

    header.append(title, actions);
    card.appendChild(header);

    const fields = document.createElement('div');
    fields.className = 'step_fields';

    const idInput = document.createElement('input');
    idInput.type = 'text';
    idInput.value = mediaItem.id || '';
    idInput.addEventListener('blur', () => {
        updateMediaItem(mediaIndex, (media) => {
            media.id = idInput.value;
            syncMediaValue(media);
        });
        renderAll();
    });
    fields.appendChild(createField('Id', idInput));

    const typeSelect = createSelect(['image', 'video', 'audio', 'file', 'obj3d', 'text'], mediaItem.type || 'file', (value) => {
        updateMediaItem(mediaIndex, (media) => {
            media.type = value;
            syncMediaValue(media);
        });
        renderAll();
    });
    fields.appendChild(createField('Type', typeSelect));

    card.appendChild(fields);

    const optionBar = document.createElement('div');
    optionBar.className = 'choice_bar';

    if (!('isFullScreen' in mediaItem)) {
        optionBar.appendChild(createButton('Ajouter plein écran', 'option_button', () => addMediaProperty(mediaIndex, 'isFullScreen', false)));
    }
    if (!('position' in mediaItem)) {
        optionBar.appendChild(createButton('Ajouter position', 'option_button', () => addMediaProperty(mediaIndex, 'position', { x: 0, y: 0, z: 0 })));
    }
    if (!('rotation' in mediaItem)) {
        optionBar.appendChild(createButton('Ajouter rotation', 'option_button', () => addMediaProperty(mediaIndex, 'rotation', { x: 0, y: 0, z: 0, w: 1 })));
    }
    if (!('scale' in mediaItem)) {
        optionBar.appendChild(createButton('Ajouter scale', 'option_button', () => addMediaProperty(mediaIndex, 'scale', { x: 1, y: 1, z: 1 })));
    }

    card.appendChild(optionBar);

    syncMediaValue(mediaItem);
    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.value = mediaItem.value || '';
    valueInput.readOnly = true;
    card.appendChild(createField('Value', valueInput));

    if ('isFullScreen' in mediaItem) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = Boolean(mediaItem.isFullScreen);
        checkbox.addEventListener('change', () => updateMediaItem(mediaIndex, (media) => {
            media.isFullScreen = checkbox.checked;
        }));
        card.appendChild(createToggleField('Plein écran', checkbox));
        card.appendChild(createButton('Retirer plein écran', 'mini_button', () => removeMediaProperty(mediaIndex, 'isFullScreen')));
    }

    if ('position' in mediaItem) {
        card.appendChild(renderVectorSection(
            'Position',
            mediaItem.position,
            (key, value) => updateMediaItem(mediaIndex, (media) => {
                media.position = media.position || { x: 0, y: 0, z: 0 };
                media.position[key] = value ?? 0;
            }),
            () => removeMediaProperty(mediaIndex, 'position')
        ));
    }

    if ('rotation' in mediaItem) {
        card.appendChild(renderVectorSection(
            'Rotation',
            mediaItem.rotation,
            (key, value) => updateMediaItem(mediaIndex, (media) => {
                media.rotation = media.rotation || { x: 0, y: 0, z: 0, w: 1 };
                media.rotation[key] = value ?? (key === 'w' ? 1 : 0);
            }),
            () => removeMediaProperty(mediaIndex, 'rotation')
        ));
    }

    if ('scale' in mediaItem) {
        card.appendChild(renderVectorSection(
            'Scale',
            mediaItem.scale,
            (key, value) => updateMediaItem(mediaIndex, (media) => {
                media.scale = media.scale || { x: 1, y: 1, z: 1 };
                media.scale[key] = value ?? 1;
            }),
            () => removeMediaProperty(mediaIndex, 'scale')
        ));
    }

    return card;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function currentVisit() {
    return state.visits[0];
}

function currentSteps() {
    return currentVisit().steps;
}

function normalizeNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeVector3(value) {
    return {
        x: normalizeNumber(value?.x, 0),
        y: normalizeNumber(value?.y, 0),
        z: normalizeNumber(value?.z, 0),
    };
}

function normalizeVector4(value) {
    return {
        x: normalizeNumber(value?.x, 0),
        y: normalizeNumber(value?.y, 0),
        z: normalizeNumber(value?.z, 0),
        w: normalizeNumber(value?.w, 1),
    };
}

function normalizePointList(value) {
    if (Array.isArray(value)) {
        return value.map(normalizeVector3);
    }

    if (value && typeof value === 'object') {
        return [normalizeVector3(value)];
    }

    return [];
}

function ensureMovementConstraints(movement) {
    if (!movement) {
        return movement;
    }

    if (movement.type === 'orbit') {
        if (!Array.isArray(movement.pointsArray) || movement.pointsArray.length === 0) {
            movement.pointsArray = [{ x: 0, y: 0, z: 0 }];
        } else if (movement.pointsArray.length > 1) {
            movement.pointsArray = [movement.pointsArray[0]];
        }
    } else if (movement.type === 'spline' || movement.type === 'line') {
        if (!Array.isArray(movement.pointsArray) || movement.pointsArray.length < 2) {
            movement.pointsArray = [
                { x: 0, y: 0, z: 0 },
                { x: 0, y: 0, z: 0 },
            ];
        }
    }

    return movement;
}

function normalizeStep(step) {
    const normalized = { ...step };

    normalized.layers = Array.isArray(normalized.layers) ? normalized.layers : [];

    if (normalized.cameraPosition) {
        normalized.cameraPosition = normalizeVector3(normalized.cameraPosition);
    }

    if (normalized.cameraRotation) {
        normalized.cameraRotation = normalizeVector4(normalized.cameraRotation);
    }

    if (normalized.cameraLookAt) {
        normalized.cameraLookAt = normalizePointList(normalized.cameraLookAt);
    }

    if (normalized.media) {
        normalized.media = Array.isArray(normalized.media) ? normalized.media : [normalized.media];
    }

    if (normalized.objectMovement) {
        normalized.objectMovement = Array.isArray(normalized.objectMovement)
            ? normalized.objectMovement
            : [normalized.objectMovement];

        normalized.objectMovement = normalized.objectMovement.map((movement) => {
            const normalizedMovement = {
                ...movement,
                pointsArray: normalizePointList(movement.pointsArray),
                rotationDegrees: movement.rotationDegrees ? normalizeVector3(movement.rotationDegrees) : movement.rotationDegrees,
            };

            return ensureMovementConstraints(normalizedMovement);
        });
    }

    return normalized;
}

function normalizeImportedState(importedState) {
    if (!importedState?.visits?.length) {
        return defaultState();
    }

    return {
        visits: importedState.visits.map((visit) => ({
            ...visit,
            steps: Array.isArray(visit.steps)
                ? visit.steps.map(normalizeStep)
                : [normalizeStep(defaultStepTemplates.basic(0))],
        })),
    };
}

function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.style.background = isError
        ? 'rgba(229, 18, 123, 0.12)'
        : 'rgba(252, 249, 232, 0.95)';
}

function createButton(text, className, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    button.addEventListener('click', onClick);
    return button;
}

function createField(labelText, control, className = 'step_field') {
    const wrapper = document.createElement('label');
    wrapper.className = className;

    const label = document.createElement('span');
    label.textContent = labelText;

    wrapper.appendChild(label);
    wrapper.appendChild(control);
    return wrapper;
}

function createToggleField(labelText, control) {
    const wrapper = document.createElement('label');
    wrapper.className = 'step_field toggle_field';

    const label = document.createElement('span');
    label.textContent = labelText;

    wrapper.appendChild(control);
    wrapper.appendChild(label);
    return wrapper;
}

function createVectorInputs(values, dimension, onChange) {
    const wrapper = document.createElement('div');
    wrapper.className = dimension === 4 ? 'vector_grid' : 'vector_grid vector_grid_3';

    const keys = dimension === 4 ? ['x', 'y', 'z', 'w'] : ['x', 'y', 'z'];

    keys.forEach((key, index) => {
        const field = document.createElement('div');
        field.className = 'vector_axis_field';

        const axisLabel = document.createElement('span');
        axisLabel.className = 'vector_axis_label';
        axisLabel.textContent = key.toUpperCase();

        const input = document.createElement('input');
        input.type = 'numeric';
        input.step = 'any';
        input.value = values?.[key] ?? (dimension === 4 && index === 3 ? 1 : 0);
        input.addEventListener('input', () => onChange(key, input.value === '' ? null : Number(input.value)));

        field.appendChild(axisLabel);
        field.appendChild(input);
        wrapper.appendChild(field);
    });

    return wrapper;
}

function createSelect(options, value, onChange) {
    const select = document.createElement('select');

    options.forEach((optionValue) => {
        const option = document.createElement('option');
        option.value = optionValue;
        option.textContent = optionValue;
        select.appendChild(option);
    });

    if (value && !options.includes(value)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    }

    select.value = value || options[0];
    select.addEventListener('change', () => onChange(select.value));
    return select;
}

function addStep(templateName) {
    const factory = defaultStepTemplates[templateName] || defaultStepTemplates.basic;
    currentSteps().push(factory(currentSteps().length));
    renderSteps();
    setStatus(`Etape "${templateName}" ajoutée.`);
}

function updateStep(stepIndex, updater) {
    updater(currentSteps()[stepIndex]);
}

function removeStep(stepIndex) {
    currentSteps().splice(stepIndex, 1);
    if (currentSteps().length === 0) {
        currentSteps().push(defaultStepTemplates.basic(0));
    }
    renderSteps();
}

function duplicateStep(stepIndex) {
    const steps = currentSteps();
    const copy = clone(steps[stepIndex]);
    copy.id = steps.length;
    steps.splice(stepIndex + 1, 0, copy);
    renderSteps();
}

function moveStep(stepIndex, direction) {
    const steps = currentSteps();
    const targetIndex = stepIndex + direction;

    if (targetIndex < 0 || targetIndex >= steps.length) {
        return;
    }

    [steps[stepIndex], steps[targetIndex]] = [steps[targetIndex], steps[stepIndex]];

    // Keep selectedStepIndex in sync when steps are swapped so the UI "follows" the moved step
    if (typeof uiState.selectedStepIndex === 'number') {
        if (uiState.selectedStepIndex === stepIndex) {
            uiState.selectedStepIndex = targetIndex;
        } else if (uiState.selectedStepIndex === targetIndex) {
            uiState.selectedStepIndex = stepIndex;
        }
    }
    renderSteps();
}

function addStepProperty(stepIndex, property, value) {
    updateStep(stepIndex, (step) => {
        step[property] = clone(value);
    });
    renderSteps();
}

function removeStepProperty(stepIndex, property) {
    updateStep(stepIndex, (step) => {
        delete step[property];
    });
    renderSteps();
}

function addMediaItem(stepIndex) {
    updateStep(stepIndex, (step) => {
        if (!Array.isArray(step.media)) {
            step.media = [];
        }
        step.media.push({});
    });

    renderSteps();
}

function addMovementItem(stepIndex, type) {
    const payload = type === 'orbit'
        ? {
            objectId: 'camera',
            type: 'orbit',
            pointsArray: [{ x: 0, y: 0, z: 0 }],
            radius: 150,
            duration: 2000,
            loop: false,
        }
        : {
            objectId: 'camera',
            type,
            pointsArray: [
                { x: 0, y: 0, z: 0 },
                { x: 0, y: 0, z: 0 },
            ],
            duration: 2000,
            loop: false,
        };

    updateStep(stepIndex, (step) => {
        if (!Array.isArray(step.objectMovement)) {
            step.objectMovement = [];
        }

        step.objectMovement.push(ensureMovementConstraints(payload));
    });

    renderSteps();
}

function createPointCard(point, onChange, onRemove) {
    const card = document.createElement('div');
    card.className = 'nested_card';
    card.appendChild(createVectorInputs(point, 3, onChange));

    if (onRemove) {
        card.appendChild(createButton('Retirer', 'mini_button', onRemove));
    }

    return card;
}

function renderVectorSection(title, value, onChange, onRemove) {
    const section = document.createElement('section');
    section.className = 'optional_section';

    const header = document.createElement('div');
    header.className = 'optional_section_header';

    const heading = document.createElement('h4');
    heading.textContent = title;
    header.appendChild(heading);

    if (onRemove) {
        header.appendChild(createButton('Retirer', 'mini_button', onRemove));
    }

    section.appendChild(header);
    section.appendChild(createVectorInputs(value, value && 'w' in value ? 4 : 3, onChange));
    return section;
}

function renderPointListSection(title, points, onAdd, onChangePoint, onRemovePoint, onRemoveSection) {
    const section = document.createElement('section');
    section.className = 'optional_section';

    const header = document.createElement('div');
    header.className = 'optional_section_header';

    const heading = document.createElement('h4');
    heading.textContent = title;
    header.appendChild(heading);

    const headerActions = document.createElement('div');
    headerActions.className = 'step_card_actions';
    headerActions.appendChild(createButton('Ajouter un point', 'step_action_button', onAdd));

    if (onRemoveSection) {
        headerActions.appendChild(createButton('Retirer la section', 'step_action_button', onRemoveSection));
    }

    header.appendChild(headerActions);
    section.appendChild(header);

    const list = document.createElement('div');
    list.className = 'nested_list';

    points.forEach((point, pointIndex) => {
        list.appendChild(createPointCard(
            point,
            (key, value) => onChangePoint(pointIndex, key, value),
            onRemovePoint ? () => onRemovePoint(pointIndex) : null,
        ));
    });

    section.appendChild(list);
    return section;
}

function renderMediaItemCard(mediaItem, mediaIndex, stepIndex) {
    const card = document.createElement('article');
    card.className = 'nested_card';

    const header = document.createElement('div');
    header.className = 'step_card_header';

    const title = document.createElement('h4');
    title.textContent = `Média ${mediaIndex + 1}`;

    const headerActions = document.createElement('div');
    headerActions.className = 'step_card_actions';
    headerActions.appendChild(createButton('Supprimer', 'step_action_button', () => {
        updateStep(stepIndex, (step) => {
            step.media.splice(mediaIndex, 1);
            if (step.media.length === 0) {
                delete step.media;
            }
        });
        renderSteps();
    }));

    header.append(title, headerActions);
    card.appendChild(header);

    const mediaIds = currentMediaIds();
    const idSelect = createSelect(mediaIds, mediaItem.id || mediaIds[0] || '', (value) => updateStep(stepIndex, (step) => {
        step.media[mediaIndex].id = value;
    }));
    idSelect.disabled = mediaIds.length === 0;
    card.appendChild(createField('Id média', idSelect));

    if (mediaIds.length === 0) {
        const hint = document.createElement('p');
        hint.className = 'step_hint';
        hint.textContent = 'Ajoute ou importe des médias pour pouvoir les choisir ici.';
        card.appendChild(hint);
    }

    const choiceBar = document.createElement('div');
    choiceBar.className = 'choice_bar';
    choiceBar.appendChild(createButton('Ajouter une position au média', 'option_button', () => {
        updateStep(stepIndex, (step) => {
            step.media[mediaIndex].position = { x: 0, y: 0, z: 0 };
        });
        renderSteps();
    }));
    choiceBar.appendChild(createButton('Paramétrer la rotation', 'option_button', () => {
        updateStep(stepIndex, (step) => {
            step.media[mediaIndex].rotation = { x: 0, y: 0, z: 0, w: 1 };
        });
        renderSteps();
    }));
    choiceBar.appendChild(createButton('Paramétrer l\'échelle', 'option_button', () => {
        updateStep(stepIndex, (step) => {
            step.media[mediaIndex].scale = { x: 1, y: 1, z: 1 };
        });
        renderSteps();
    }));
    choiceBar.appendChild(createButton('Paramétrer le plein écran', 'option_button', () => {
        updateStep(stepIndex, (step) => {
            step.media[mediaIndex].isFullScreen = true;
        });
        renderSteps();
    }));
    card.appendChild(choiceBar);

    if ('position' in mediaItem) {
        card.appendChild(renderVectorSection(
            'Position',
            mediaItem.position,
            (key, value) => updateStep(stepIndex, (step) => {
                step.media[mediaIndex].position = step.media[mediaIndex].position || { x: 0, y: 0, z: 0 };
                step.media[mediaIndex].position[key] = value ?? 0;
            }),
            () => {
                updateStep(stepIndex, (step) => {
                    delete step.media[mediaIndex].position;
                });
                renderSteps();
            }
        ));
    }

    if ('rotation' in mediaItem) {
        card.appendChild(renderVectorSection(
            'Rotation',
            mediaItem.rotation,
            (key, value) => updateStep(stepIndex, (step) => {
                step.media[mediaIndex].rotation = step.media[mediaIndex].rotation || { x: 0, y: 0, z: 0, w: 1 };
                step.media[mediaIndex].rotation[key] = value ?? (key === 'w' ? 1 : 0);
            }),
            () => {
                updateStep(stepIndex, (step) => {
                    delete step.media[mediaIndex].rotation;
                });
                renderSteps();
            }
        ));
    }

    if ('scale' in mediaItem) {
        card.appendChild(renderVectorSection(
            'Scale',
            mediaItem.scale,
            (key, value) => updateStep(stepIndex, (step) => {
                step.media[mediaIndex].scale = step.media[mediaIndex].scale || { x: 1, y: 1, z: 1 };
                step.media[mediaIndex].scale[key] = value ?? 1;
            }),
            () => {
                updateStep(stepIndex, (step) => {
                    delete step.media[mediaIndex].scale;
                });
                renderSteps();
            }
        ));
    }

    if ('isFullScreen' in mediaItem) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = Boolean(mediaItem.isFullScreen);
        checkbox.addEventListener('change', () => updateStep(stepIndex, (step) => {
            step.media[mediaIndex].isFullScreen = checkbox.checked;
        }));
        card.appendChild(createToggleField('Plein écran', checkbox));
    }

    return card;
}

function renderMovementItemCard(movement, movementIndex, stepIndex) {
    const card = document.createElement('article');
    card.className = 'nested_card';

    const header = document.createElement('div');
    header.className = 'step_card_header';

    const title = document.createElement('h4');
    title.textContent = `Mouvement ${movementIndex + 1}`;

    const headerActions = document.createElement('div');
    headerActions.className = 'step_card_actions';
    headerActions.appendChild(createButton('Supprimer', 'step_action_button', () => {
        updateStep(stepIndex, (step) => {
            step.objectMovement.splice(movementIndex, 1);
            if (step.objectMovement.length === 0) {
                delete step.objectMovement;
            }
        });
        renderSteps();
    }));

    header.append(title, headerActions);
    card.appendChild(header);

    const typeSelect = createSelect(['spline', 'line', 'orbit'], movement.type || 'spline', (value) => {
        updateStep(stepIndex, (step) => {
            step.objectMovement[movementIndex].type = value;
            ensureMovementConstraints(step.objectMovement[movementIndex]);
        });
        renderSteps();
    });
    card.appendChild(createField('Type', typeSelect));

    const objectIdInput = document.createElement('input');
    objectIdInput.type = 'text';
    objectIdInput.value = movement.objectId || '';
    objectIdInput.addEventListener('input', () => updateStep(stepIndex, (step) => {
        step.objectMovement[movementIndex].objectId = objectIdInput.value;
    }));
    card.appendChild(createField('Object id/camera', objectIdInput));

    const choiceBar = document.createElement('div');
    choiceBar.className = 'choice_bar';
    choiceBar.appendChild(createButton('Ajouter duration', 'option_button', () => {
        updateStep(stepIndex, (step) => {
            step.objectMovement[movementIndex].duration = 2000;
        });
        renderSteps();
    }));
    choiceBar.appendChild(createButton('Ajouter loop', 'option_button', () => {
        updateStep(stepIndex, (step) => {
            step.objectMovement[movementIndex].loop = false;
        });
        renderSteps();
    }));

    if (movement.type === 'orbit') {
        choiceBar.appendChild(createButton('Ajouter radius', 'option_button', () => {
            updateStep(stepIndex, (step) => {
                step.objectMovement[movementIndex].radius = 150;
            });
            renderSteps();
        }));
    }

    choiceBar.appendChild(createButton('Ajouter cameraHeight', 'option_button', () => {
        updateStep(stepIndex, (step) => {
            step.objectMovement[movementIndex].cameraHeight = 0;
        });
        renderSteps();
    }));
    choiceBar.appendChild(createButton('Ajouter rotationDegrees', 'option_button', () => {
        updateStep(stepIndex, (step) => {
            step.objectMovement[movementIndex].rotationDegrees = { x: 0, y: 0, z: 0 };
        });
        renderSteps();
    }));
    card.appendChild(choiceBar);

    updateStep(stepIndex, (step) => {
        ensureMovementConstraints(step.objectMovement[movementIndex]);
    });

    const points = Array.isArray(movement.pointsArray) ? movement.pointsArray : [];
    const pointsTitle = movement.type === 'orbit' ? 'Centre de l orbite' : 'Points de trajectoire';
    card.appendChild(renderPointListSection(
        pointsTitle,
        points,
        () => {
            updateStep(stepIndex, (step) => {
                step.objectMovement[movementIndex].pointsArray.push({ x: 0, y: 0, z: 0 });
                ensureMovementConstraints(step.objectMovement[movementIndex]);
            });
            renderSteps();
        },
        (pointIndex, key, value) => updateStep(stepIndex, (step) => {
            step.objectMovement[movementIndex].pointsArray[pointIndex][key] = value ?? 0;
        }),
        (pointIndex) => {
            updateStep(stepIndex, (step) => {
                step.objectMovement[movementIndex].pointsArray.splice(pointIndex, 1);
                ensureMovementConstraints(step.objectMovement[movementIndex]);
            });
            renderSteps();
        },
        null,
    ));

    if ('duration' in movement) {
        const durationInput = document.createElement('input');
        durationInput.type = 'number';
        durationInput.step = '1';
        durationInput.value = movement.duration;
        durationInput.addEventListener('input', () => updateStep(stepIndex, (step) => {
            step.objectMovement[movementIndex].duration = normalizeNumber(durationInput.value, 0);
        }));
        card.appendChild(createField('Duration (ms)', durationInput));
    }

    if ('radius' in movement) {
        const radiusInput = document.createElement('input');
        radiusInput.type = 'number';
        radiusInput.step = 'any';
        radiusInput.value = movement.radius;
        radiusInput.addEventListener('input', () => updateStep(stepIndex, (step) => {
            step.objectMovement[movementIndex].radius = normalizeNumber(radiusInput.value, 0);
        }));
        card.appendChild(createField('Radius', radiusInput));
        card.appendChild(createButton('Retirer radius', 'mini_button', () => {
            updateStep(stepIndex, (step) => {
                delete step.objectMovement[movementIndex].radius;
            });
            renderSteps();
        }));
    }

    if ('cameraHeight' in movement) {
        const cameraHeightInput = document.createElement('input');
        cameraHeightInput.type = 'number';
        cameraHeightInput.step = 'any';
        cameraHeightInput.value = movement.cameraHeight;
        cameraHeightInput.addEventListener('input', () => updateStep(stepIndex, (step) => {
            step.objectMovement[movementIndex].cameraHeight = normalizeNumber(cameraHeightInput.value, 0);
        }));
        card.appendChild(createField('Camera height', cameraHeightInput));
        card.appendChild(createButton('Retirer cameraHeight', 'mini_button', () => {
            updateStep(stepIndex, (step) => {
                delete step.objectMovement[movementIndex].cameraHeight;
            });
            renderSteps();
        }));
    }

    if ('rotationDegrees' in movement) {
        card.appendChild(renderVectorSection(
            'Rotation degrees',
            movement.rotationDegrees,
            (key, value) => updateStep(stepIndex, (step) => {
                step.objectMovement[movementIndex].rotationDegrees = step.objectMovement[movementIndex].rotationDegrees || { x: 0, y: 0, z: 0 };
                step.objectMovement[movementIndex].rotationDegrees[key] = value ?? 0;
            }),
            () => {
                updateStep(stepIndex, (step) => {
                    delete step.objectMovement[movementIndex].rotationDegrees;
                });
                renderSteps();
            }
        ));
    }

    if ('loop' in movement) {
        const loopInput = document.createElement('input');
        loopInput.type = 'checkbox';
        loopInput.checked = Boolean(movement.loop);
        loopInput.addEventListener('change', () => updateStep(stepIndex, (step) => {
            step.objectMovement[movementIndex].loop = loopInput.checked;
        }));
        card.appendChild(createToggleField('Loop', loopInput));
    }

    return card;
}

function renderStepCard(step, stepIndex) {
    const card = document.createElement('article');
    card.className = 'step_card';

    const header = document.createElement('div');
    header.className = 'step_card_header';

    const title = document.createElement('h3');
    title.textContent = `Etape ${stepIndex}`;

    const actions = document.createElement('div');
    actions.className = 'step_card_actions';
    actions.appendChild(createButton('Monter', 'step_action_button', () => moveStep(stepIndex, -1)));
    actions.appendChild(createButton('Descendre', 'step_action_button', () => moveStep(stepIndex, 1)));
    actions.appendChild(createButton('Dupliquer', 'step_action_button', () => duplicateStep(stepIndex)));
    actions.appendChild(createButton('Supprimer', 'step_action_button', () => removeStep(stepIndex)));

    header.append(title, actions);
    card.appendChild(header);

    const fields = document.createElement('div');
    fields.className = 'step_fields';

    const layersInput = document.createElement('input');
    layersInput.type = 'text';
    layersInput.value = Array.isArray(step.layers) ? step.layers.join(', ') : '';
    layersInput.addEventListener('input', () => updateStep(stepIndex, (draft) => {
        draft.layers = layersInput.value
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
    }));
    fields.appendChild(createField('Layers', layersInput, 'step_field step_field_wide'));

    card.appendChild(fields);

    const optionBar = document.createElement('div');
    optionBar.className = 'choice_bar';
    if (!('cameraPosition' in step)) {
        optionBar.appendChild(createButton('Paramétrer la position de la caméra', 'option_button', () => addStepProperty(stepIndex, 'cameraPosition', { x: 0, y: 0, z: 0 })));
    }
    if (!('cameraRotation' in step)) {
        optionBar.appendChild(createButton('Paramétrer la rotation de la caméra', 'option_button', () => addStepProperty(stepIndex, 'cameraRotation', { x: 0, y: 0, z: 0, w: 1 })));
    }
    if (!('cameraLookAt' in step)) {
        optionBar.appendChild(createButton('Paramétrer le point de regard de la caméra', 'option_button', () => addStepProperty(stepIndex, 'cameraLookAt', [{ x: 0, y: 0, z: 0 }])));
        optionBar.appendChild(createButton('Paramétrer la liste de points de regard de la caméra', 'option_button', () => addStepProperty(stepIndex, 'cameraLookAt', [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }])));
    }
    if (!('media' in step)) {
        optionBar.appendChild(createButton('Ajouter un media', 'option_button', () => addStepProperty(stepIndex, 'media', [])));
    }
    if (!('objectMovement' in step)) {
        optionBar.appendChild(createButton('Ajouter un mouvement', 'option_button', () => addStepProperty(stepIndex, 'objectMovement', [])));
    }
    card.appendChild(optionBar);

    if ('cameraPosition' in step) {
        card.appendChild(renderVectorSection(
            'Camera position',
            step.cameraPosition,
            (key, value) => updateStep(stepIndex, (draft) => {
                draft.cameraPosition = draft.cameraPosition || { x: 0, y: 0, z: 0 };
                draft.cameraPosition[key] = value ?? 0;
            }),
            () => removeStepProperty(stepIndex, 'cameraPosition')
        ));
    }

    if ('cameraRotation' in step) {
        card.appendChild(renderVectorSection(
            'Camera rotation',
            step.cameraRotation,
            (key, value) => updateStep(stepIndex, (draft) => {
                draft.cameraRotation = draft.cameraRotation || { x: 0, y: 0, z: 0, w: 1 };
                draft.cameraRotation[key] = value ?? (key === 'w' ? 1 : 0);
            }),
            () => removeStepProperty(stepIndex, 'cameraRotation')
        ));
    }

    if ('cameraLookAt' in step) {
        card.appendChild(renderPointListSection(
            'Camera lookAt',
            step.cameraLookAt,
            () => {
                updateStep(stepIndex, (draft) => {
                    draft.cameraLookAt.push({ x: 0, y: 0, z: 0 });
                });
                renderSteps();
            },
            (pointIndex, key, value) => updateStep(stepIndex, (draft) => {
                draft.cameraLookAt[pointIndex][key] = value ?? 0;
            }),
            (pointIndex) => {
                updateStep(stepIndex, (draft) => {
                    draft.cameraLookAt.splice(pointIndex, 1);
                    if (draft.cameraLookAt.length === 0) {
                        delete draft.cameraLookAt;
                    }
                });
                renderSteps();
            },
            () => removeStepProperty(stepIndex, 'cameraLookAt')
        ));
    }

    if ('media' in step) {
        const section = document.createElement('section');
        section.className = 'optional_section';

        const header = document.createElement('div');
        header.className = 'optional_section_header';
        const heading = document.createElement('h4');
        heading.textContent = 'Media';
        header.appendChild(heading);
        header.appendChild(createButton('Retirer la section', 'mini_button', () => removeStepProperty(stepIndex, 'media')));
        section.appendChild(header);

        const chooser = document.createElement('div');
        chooser.className = 'choice_bar';
        chooser.appendChild(createButton('Ajouter un média', 'option_button', () => addMediaItem(stepIndex)));
        section.appendChild(chooser);

        const list = document.createElement('div');
        list.className = 'nested_list';
        step.media.forEach((mediaItem, mediaIndex) => {
            list.appendChild(renderMediaItemCard(mediaItem, mediaIndex, stepIndex));
        });
        section.appendChild(list);

        card.appendChild(section);
    }

    if ('objectMovement' in step) {
        const section = document.createElement('section');
        section.className = 'optional_section';

        const header = document.createElement('div');
        header.className = 'optional_section_header';
        const heading = document.createElement('h4');
        heading.textContent = 'Object movement';
        header.appendChild(heading);
        header.appendChild(createButton('Retirer la section', 'mini_button', () => removeStepProperty(stepIndex, 'objectMovement')));
        section.appendChild(header);

        const chooser = document.createElement('div');
        chooser.className = 'choice_bar';
        chooser.appendChild(createButton('Spline', 'option_button', () => addMovementItem(stepIndex, 'spline')));
        chooser.appendChild(createButton('Line', 'option_button', () => addMovementItem(stepIndex, 'line')));
        chooser.appendChild(createButton('Orbit', 'option_button', () => addMovementItem(stepIndex, 'orbit')));
        section.appendChild(chooser);

        const list = document.createElement('div');
        list.className = 'nested_list';
        step.objectMovement.forEach((movement, movementIndex) => {
            list.appendChild(renderMovementItemCard(movement, movementIndex, stepIndex));
        });
        section.appendChild(list);

        card.appendChild(section);
    }

    return card;
}

function renderVisitFields() {
    elements.visitId.value = currentVisit().id;
    elements.visitName.value = currentVisit().name;
    elements.visitDescription.value = currentVisit().description || '';
    elements.stepCount.textContent = `${currentSteps().length} étape(s)`;
}

function renderSteps() {
    const steps = currentSteps();
    // clamp selected index
    if (uiState.selectedStepIndex < 0) uiState.selectedStepIndex = 0;
    if (uiState.selectedStepIndex >= steps.length) uiState.selectedStepIndex = steps.length - 1;

    elements.stepsContainer.replaceChildren();

    // create selector dropdown
    const selectorWrapper = document.createElement('div');
    selectorWrapper.className = 'step_selector_wrapper';
    const select = document.createElement('select');
    select.className = 'step_selector';
    steps.forEach((s, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `Etape ${i}`;
        select.appendChild(opt);
    });
    select.value = String(uiState.selectedStepIndex);
    select.addEventListener('change', () => {
        uiState.selectedStepIndex = Number(select.value);
        renderSteps();
    });
    selectorWrapper.appendChild(select);
    elements.stepsContainer.appendChild(selectorWrapper);

    // render only selected step
    const step = steps[uiState.selectedStepIndex];
    if (step) {
        elements.stepsContainer.appendChild(renderStepCard(step, uiState.selectedStepIndex));
    }

    elements.stepCount.textContent = `${steps.length} étape(s)`;
}

function renderAll() {
    const isVisitMode = uiState.mode === 'visit';

    if (elements.visitEditorPanel) {
        elements.visitEditorPanel.hidden = !isVisitMode;
    }
    if (elements.mediaEditorPanel) {
        elements.mediaEditorPanel.hidden = isVisitMode;
    }
    if (elements.visitSidebarPanel) {
        elements.visitSidebarPanel.hidden = !isVisitMode;
    }
    if (elements.visitFilePanel) {
        elements.visitFilePanel.hidden = !isVisitMode;
    }
    if (elements.visitStoragePanel) {
        elements.visitStoragePanel.hidden = !isVisitMode;
    }
    if (elements.mediaFilePanel) {
        elements.mediaFilePanel.hidden = isVisitMode;
    }

    // Uniquement le bon bouton de sauvegarde selon le mode
    if (elements.saveVisitButton) {
        elements.saveVisitButton.hidden = !isVisitMode;
    }
    if (elements.saveMediaButton) {
        elements.saveMediaButton.hidden = isVisitMode;
    }

    if (isVisitMode) {
        renderVisitFields();
        renderSteps();
    } else {
        renderMediaConfigs();
    }
}

function downloadJson() {
    const payload = clone(state);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${payload.visits[0].id || 'visit'}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus(`JSON téléchargé: ${link.download}`);
}

function downloadMediaJson() {
    const payload = { medias: mediaState.media.map(serializeMediaItem) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mediaConfig.json';
    link.click();
    URL.revokeObjectURL(url);
    setStatus(`JSON téléchargé: ${link.download}`);
}

function saveVisitConfigsToLocalStorage() {
    try {
        const visitPayload = clone(state);

        localStorage.setItem(VISIT_CONFIG_LOCALSTORAGE_KEY, JSON.stringify(visitPayload));

        setStatus('Configuration visite sauvegardée dans le localStorage.');
    } catch (error) {
        setStatus(`Impossible de sauvegarder la configuration visite dans le localStorage: ${error.message}`, true);
    }
}

function saveMediaConfigsToLocalStorage() {
    try {
        const mediaPayload = {
            medias: mediaState.media.map(serializeMediaItem),
        };

        localStorage.setItem(MEDIA_CONFIG_LOCALSTORAGE_KEY, JSON.stringify(mediaPayload));

        setStatus('Configuration média sauvegardée dans le localStorage.');
    } catch (error) {
        setStatus(`Impossible de sauvegarder la configuration média dans le localStorage: ${error.message}`, true);
    }
}

function loadVisitConfigsFromLocalStorage() {
    try {
        const raw = localStorage.getItem(VISIT_CONFIG_LOCALSTORAGE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        state.visits = normalizeImportedState(parsed).visits;
        renderAll();
        return true;
    } catch (error) {
        // ignore and keep defaults
        return false;
    }
}

function loadMediaConfigsFromLocalStorage() {
    try {
        const raw = localStorage.getItem(MEDIA_CONFIG_LOCALSTORAGE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        mediaState.media = normalizeMediaState(parsed).media;
        mediaState.selectedIndex = 0;
        renderAll();
        return true;
    } catch (error) {
        return false;
    }
}

function resetEditor() {
    const fresh = defaultState();
    state.visits = fresh.visits;
    renderAll();
    setStatus('Editeur réinitialisé.');
}

function resetMediaEditor() {
    mediaState.media = [];
    mediaState.selectedIndex = 0;
    renderAll();
    setStatus('Médias réinitialisés.');
}

function importJsonFile(file) {
    const reader = new FileReader();

    reader.onload = () => {
        try {
            const parsed = JSON.parse(String(reader.result));
            state.visits = normalizeImportedState(parsed).visits;
            renderAll();
            setStatus(`JSON chargé: ${file.name}`);
        } catch (error) {
            setStatus(`Impossible de charger le JSON: ${error.message}`, true);
        }
    };

    reader.readAsText(file);
}

function importMediaJsonFile(file) {
    const reader = new FileReader();

    reader.onload = () => {
        try {
            const parsed = JSON.parse(String(reader.result));
            mediaState.media = normalizeMediaState(parsed).media;
            mediaState.selectedIndex = 0;
            renderAll();
            setStatus(`JSON chargé: ${file.name}`);
        } catch (error) {
            setStatus(`Impossible de charger le JSON des médias: ${error.message}`, true);
        }
    };

    reader.readAsText(file);
}

function setEditorMode(mode) {
    uiState.mode = mode === 'media' ? 'media' : 'visit';
    renderAll();
    setStatus(uiState.mode === 'visit' ? 'Mode visite activé.' : 'Mode médias activé.');
}

function bindEvents() {
    elements.visitId.addEventListener('input', () => {
        currentVisit().id = elements.visitId.value;
    });

    elements.visitName.addEventListener('input', () => {
        currentVisit().name = elements.visitName.value;
    });

    elements.visitDescription.addEventListener('input', () => {
        currentVisit().description = elements.visitDescription.value;
    });

    elements.downloadButton.addEventListener('click', downloadJson);
    elements.downloadMediaButton.addEventListener('click', downloadMediaJson);
    if (elements.saveVisitButton) {
        elements.saveVisitButton.addEventListener('click', saveVisitConfigsToLocalStorage);
    }
    if (elements.saveMediaButton) {
        elements.saveMediaButton.addEventListener('click', saveMediaConfigsToLocalStorage);
    }
    elements.resetButton.addEventListener('click', resetEditor);
    if (elements.resetMediaButton) {
        elements.resetMediaButton.addEventListener('click', resetMediaEditor);
    }

    if (elements.modeVisitButton) {
        elements.modeVisitButton.addEventListener('click', () => setEditorMode('visit'));
    }
    if (elements.modeMediaButton) {
        elements.modeMediaButton.addEventListener('click', () => setEditorMode('media'));
    }

    elements.importInput.addEventListener('change', () => {
        const file = elements.importInput.files?.[0];
        if (file) {
            importJsonFile(file);
        }
        elements.importInput.value = '';
    });

    if (elements.mediaImportInput) {
        elements.mediaImportInput.addEventListener('change', () => {
            const file = elements.mediaImportInput.files?.[0];
            if (file) {
                importMediaJsonFile(file);
            }
            elements.mediaImportInput.value = '';
        });
    }

    if (elements.mediaUploadInput) {
        elements.mediaUploadInput.addEventListener('change', () => {
            const file = elements.mediaUploadInput.files?.[0];
            if (file) {
                addMediaFromFile(file);
            }
            elements.mediaUploadInput.value = '';
        });
    }

    document.querySelectorAll('[data-action="add-step"]').forEach((button) => {
        button.addEventListener('click', () => addStep(button.dataset.template));
    });
}

// Initialisation de tout les div et boutons de l'éditeur pour récupérer les informations et les lier aux fonctions correspondantes
function init() {
    elements.visitId = document.getElementById('visit_id_input');
    elements.visitName = document.getElementById('visit_name_input');
    elements.visitDescription = document.getElementById('visit_description_input');
    elements.stepsContainer = document.getElementById('steps_container');
    elements.downloadButton = document.getElementById('download_json_button');
    elements.downloadMediaButton = document.getElementById('download_media_json_button');
    elements.saveVisitButton = document.getElementById('save_visit_localstorage_button');
    elements.saveMediaButton = document.getElementById('save_media_localstorage_button');
    elements.importInput = document.getElementById('json_import_input');
    elements.mediaImportInput = document.getElementById('media_json_import_input');
    elements.mediaUploadInput = document.getElementById('media_upload_input');
    elements.resetButton = document.getElementById('reset_button');
    elements.resetMediaButton = document.getElementById('reset_media_button');
    elements.modeVisitButton = document.getElementById('mode_visit_button');
    elements.modeMediaButton = document.getElementById('mode_media_button');
    elements.visitEditorPanel = document.getElementById('visit_editor_panel');
    elements.mediaEditorPanel = document.getElementById('media_editor_panel');
    elements.visitSidebarPanel = document.getElementById('visit_sidebar_panel');
    elements.visitFilePanel = document.getElementById('visit_file_panel');
    elements.visitStoragePanel = document.getElementById('visit_storage_panel');
    elements.mediaFilePanel = document.getElementById('media_file_panel');
    elements.mediaSelector = document.getElementById('media_selector');
    elements.mediaContainer = document.getElementById('media_container');
    elements.mediaCount = document.getElementById('media_count');
    elements.status = document.getElementById('editor_status');
    elements.stepCount = document.getElementById('step_count');

    loadVisitConfigsFromLocalStorage();
    loadMediaConfigsFromLocalStorage();

    bindEvents();
    setEditorMode('visit');
    renderAll();
    setStatus('Editeur prêt. Choisis un bloc à ajouter avant de remplir ses champs.');
}

init();

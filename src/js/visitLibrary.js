/**
 * visitLibrary: bibliothèque de visites enregistrées dans le navigateur.
 *
 * Partagée par l'éditeur et le hub (même origine, donc même localStorage). Elle
 * permet de conserver plusieurs visites nommées au lieu d'un unique brouillon
 * écrasé à chaque sauvegarde.
 *
 * Disposition du stockage:
 * - `agape_demo_visit_library`  : index [{ id, name, savedAt }]
 * - `agape_demo_visit:<id>`     : configuration de visite
 * - `agape_demo_media:<id>`     : configuration média associée
 * - `agape_demo_visit_config` / `agape_demo_media_config` : le brouillon courant,
 *   c'est-à-dire ce que l'aller-retour hub <-> éditeur transporte.
 *
 * Les octets des médias importés ne sont pas ici: ils restent dans le dépôt
 * IndexedDB de mediaStore, partagé par toutes les visites via l'id du média.
 */
(function () {
    const LIBRARY_KEY = 'agape_demo_visit_library';
    const VISIT_PREFIX = 'agape_demo_visit:';
    const MEDIA_PREFIX = 'agape_demo_media:';

    const DRAFT_VISIT_KEY = 'agape_demo_visit_config';
    const DRAFT_MEDIA_KEY = 'agape_demo_media_config';

    /**
     * Lit et parse une clé du localStorage.
     * @param  {string} key - Clé à lire
     * @return {*} - Valeur parsée, ou null
     */
    function read(key) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            console.warn(`visitLibrary: lecture impossible (${key})`, error);
            return null;
        }
    }

    /**
     * Écrit une valeur JSON dans le localStorage.
     * @param  {string} key - Clé à écrire
     * @param  {*} value - Valeur à sérialiser
     * @return {boolean} - Vrai si l'écriture a réussi
     */
    function write(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn(`visitLibrary: écriture impossible (${key})`, error);
            return false;
        }
    }

    /**
     * Index des visites enregistrées, de la plus récente à la plus ancienne.
     * @return {Array<{id: string, name: string, savedAt: number}>}
     */
    function list() {
        const entries = read(LIBRARY_KEY);
        if (!Array.isArray(entries)) return [];

        return entries
            .filter((entry) => entry && typeof entry.id === 'string')
            .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    }

    /**
     * Construit un identifiant de stockage lisible à partir d'un nom.
     * @param  {string} name - Nom de la visite
     * @return {string} - Identifiant unique
     */
    function makeId(name) {
        const slug = String(name || 'visite')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 40) || 'visite';

        return `${slug}_${Date.now()}`;
    }

    /**
     * Enregistre une visite et ses médias sous un nom.
     * @param  {object} params - Paramètres
     * @param  {string} params.name - Nom affiché
     * @param  {object} params.visitConfig - Configuration de visite ({ visits: [...] })
     * @param  {object} params.mediaConfig - Configuration média ({ medias: [...] })
     * @param  {string} [params.id] - Id existant à écraser
     * @return {{id: string, name: string, savedAt: number}|null} - Entrée créée
     */
    function save({ name, visitConfig, mediaConfig, id }) {
        const entryId = id || makeId(name);
        const entry = { id: entryId, name: name || entryId, savedAt: Date.now() };

        if (!write(VISIT_PREFIX + entryId, visitConfig)) return null;
        if (!write(MEDIA_PREFIX + entryId, mediaConfig || { medias: [] })) return null;

        const entries = list().filter((item) => item.id !== entryId);
        entries.push(entry);

        if (!write(LIBRARY_KEY, entries)) return null;

        return entry;
    }

    /**
     * Charge une visite enregistrée.
     * @param  {string} id - Identifiant de l'entrée
     * @return {{entry: object, visitConfig: object, mediaConfig: object}|null}
     */
    function load(id) {
        const entry = list().find((item) => item.id === id);
        const visitConfig = read(VISIT_PREFIX + id);

        if (!entry || !visitConfig?.visits?.length) return null;

        return {
            entry: entry,
            visitConfig: visitConfig,
            mediaConfig: read(MEDIA_PREFIX + id) || { medias: [] }
        };
    }

    /**
     * Supprime une visite enregistrée. Les octets des médias sont conservés:
     * ils peuvent être utilisés par d'autres visites.
     * @param  {string} id - Identifiant de l'entrée
     * @return {void}
     */
    function remove(id) {
        try {
            localStorage.removeItem(VISIT_PREFIX + id);
            localStorage.removeItem(MEDIA_PREFIX + id);
        } catch (error) {
            console.warn(`visitLibrary: suppression impossible (${id})`, error);
        }

        write(LIBRARY_KEY, list().filter((item) => item.id !== id));
    }

    /**
     * Écrit le brouillon courant, celui que transporte l'aller-retour hub/éditeur.
     * @param  {object} visitConfig - Configuration de visite
     * @param  {object} mediaConfig - Configuration média
     * @return {boolean} - Vrai si les deux écritures ont réussi
     */
    function saveDraft(visitConfig, mediaConfig) {
        const visitOk = write(DRAFT_VISIT_KEY, visitConfig);
        const mediaOk = write(DRAFT_MEDIA_KEY, mediaConfig || { medias: [] });
        return visitOk && mediaOk;
    }

    /**
     * Lit le brouillon courant.
     * @return {{visitConfig: object, mediaConfig: object}|null}
     */
    function loadDraft() {
        const visitConfig = read(DRAFT_VISIT_KEY);
        if (!visitConfig?.visits?.length) return null;

        return {
            visitConfig: visitConfig,
            mediaConfig: read(DRAFT_MEDIA_KEY) || { medias: [] }
        };
    }

    window.visitLibrary = {
        LIBRARY_KEY,
        DRAFT_VISIT_KEY,
        DRAFT_MEDIA_KEY,
        list,
        makeId,
        save,
        load,
        remove,
        saveDraft,
        loadDraft
    };
})();

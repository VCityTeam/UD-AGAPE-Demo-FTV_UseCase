/**
 * mediaStore: dépôt de fichiers médias partagé entre le hub et l'éditeur.
 *
 * Les deux pages sont servies par la même origine, elles partagent donc la même
 * base IndexedDB. Un média importé est stocké ici sous son id, et la configuration
 * ne transporte qu'une clé stable (`storageKey`) au lieu d'une URL `blob:`, qui
 * n'est valable que dans le document qui l'a créée.
 *
 * Une configuration média porte donc jusqu'à trois champs:
 * - `assetPath`  : chemin portable (`../assets/media/images/photo.png`), c'est lui
 *                  qui est exporté dans le JSON final;
 * - `storageKey` : clé de ce dépôt, pour retrouver les octets sans fichier sur disque;
 * - `value`      : URL réellement utilisée à l'exécution (objet URL ou chemin).
 */
(function () {
    const DB_NAME = 'agape_demo_media';
    const DB_VERSION = 1;
    const STORE_NAME = 'files';

    /** URLs créées pour ce document, révoquées à la fermeture de la page. */
    const createdUrls = new Map();

    /** Écritures en cours: une navigation avant leur fin perdrait les octets. */
    const pendingWrites = new Set();

    let dbPromise = null;

    /**
     * Ouvre (et crée au besoin) la base IndexedDB.
     * @return {Promise<IDBDatabase>}
     */
    function openDb() {
        if (dbPromise) return dbPromise;

        dbPromise = new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) {
                reject(new Error('IndexedDB indisponible'));
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                    request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        return dbPromise;
    }

    /**
     * Exécute une transaction sur le magasin de fichiers.
     * @param  {string} mode - 'readonly' ou 'readwrite'
     * @param  {Function} run - Reçoit le magasin, retourne une IDBRequest
     * @return {Promise<*>} - Résultat de la requête
     */
    async function withStore(mode, run) {
        const db = await openDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, mode);
            const request = run(transaction.objectStore(STORE_NAME));

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            transaction.onabort = () => reject(transaction.error);
        });
    }

    /**
     * Stocke le contenu d'un fichier importé.
     * @param  {string} key - Clé du média (son id de configuration)
     * @param  {File} file - Fichier importé
     * @return {Promise<object>} - Enregistrement stocké
     */
    async function put(key, file) {
        const record = {
            key: key,
            blob: file,
            fileName: file.name,
            mime: file.type,
            size: file.size,
            updatedAt: Date.now()
        };

        const write = withStore('readwrite', (store) => store.put(record));
        pendingWrites.add(write);

        try {
            await write;
        } finally {
            pendingWrites.delete(write);
        }

        return record;
    }

    /**
     * Attend la fin des écritures en cours. À appeler avant toute navigation:
     * quitter la page pendant une transaction IndexedDB l'annule, et le média
     * serait introuvable au retour.
     * @return {Promise<void>}
     */
    async function whenIdle() {
        await Promise.allSettled([...pendingWrites]);
    }

    /**
     * Lit un enregistrement.
     * @param  {string} key - Clé du média
     * @return {Promise<object|null>}
     */
    async function get(key) {
        if (!key) return null;

        try {
            return (await withStore('readonly', (store) => store.get(key))) || null;
        } catch (error) {
            console.warn(`mediaStore: lecture impossible (${key})`, error);
            return null;
        }
    }

    /**
     * Liste tous les enregistrements.
     * @return {Promise<Array<object>>}
     */
    async function list() {
        try {
            return (await withStore('readonly', (store) => store.getAll())) || [];
        } catch (error) {
            console.warn('mediaStore: liste impossible', error);
            return [];
        }
    }

    /**
     * Supprime un enregistrement et révoque l'URL associée.
     * @param  {string} key - Clé du média
     * @return {Promise<void>}
     */
    async function remove(key) {
        revoke(key);
        await withStore('readwrite', (store) => store.delete(key));
    }

    /**
     * Crée une URL utilisable dans ce document pour un média stocké.
     * La même clé renvoie toujours la même URL, pour ne pas en accumuler.
     * @param  {string} key - Clé du média
     * @return {Promise<string|null>} - Objet URL, ou null si le média est absent
     */
    async function createUrl(key) {
        if (createdUrls.has(key)) return createdUrls.get(key);

        const record = await get(key);
        if (!record?.blob) return null;

        const url = URL.createObjectURL(record.blob);
        createdUrls.set(key, url);
        return url;
    }

    /**
     * Révoque l'URL créée pour une clé.
     * @param  {string} key - Clé du média
     * @return {void}
     */
    function revoke(key) {
        const url = createdUrls.get(key);
        if (!url) return;

        URL.revokeObjectURL(url);
        createdUrls.delete(key);
    }

    /**
     * Révoque toutes les URLs créées par ce document.
     * @return {void}
     */
    function revokeAll() {
        createdUrls.forEach((url) => URL.revokeObjectURL(url));
        createdUrls.clear();
    }

    /**
     * Déduit le dossier d'assets correspondant à un type de média.
     * @param  {string} type - Type du média
     * @return {string} - Nom du dossier sous assets/media
     */
    function folderForType(type) {
        const folders = {
            image: 'images',
            video: 'videos',
            audio: 'audios',
            obj3d: 'obj3d',
            text: 'texts'
        };

        return folders[type] || type || 'file';
    }

    /**
     * Construit le chemin portable attendu pour un fichier importé.
     * @param  {string} type - Type du média
     * @param  {string} fileName - Nom du fichier
     * @return {string} - Chemin relatif depuis le dossier html/
     */
    function assetPathFor(type, fileName) {
        return `../assets/media/${folderForType(type)}/${fileName}`;
    }

    /**
     * Renvoie une copie exportable d'un média: `value` repasse sur le chemin
     * portable, pour qu'aucune URL `blob:` (invalide hors de ce document) ne soit
     * écrite dans un JSON ou dans le localStorage.
     * @param  {object} media - Configuration d'un média
     * @return {object} - Copie exportable
     */
    function toPortable(media) {
        const portable = { ...media };
        const value = String(portable.value || '');

        if (portable.assetPath) {
            portable.value = portable.assetPath;
        } else if (value.startsWith('blob:')) {
            // Aucun chemin connu: mieux vaut une valeur vide qu'une URL morte.
            portable.value = '';
        }

        return portable;
    }

    /**
     * Remplace `value` par une URL vivante pour tous les médias dont les octets
     * sont dans le dépôt. Les autres gardent leur chemin de fichier.
     * @param  {Array<object>} medias - Configurations de médias, modifiées sur place
     * @return {Promise<{resolved: number, missing: Array<string>}>} - Bilan de la résolution
     */
    async function resolveAll(medias) {
        const report = { resolved: 0, missing: [] };
        if (!Array.isArray(medias)) return report;

        for (const media of medias) {
            if (!media?.storageKey) continue;

            const url = await createUrl(media.storageKey);
            if (url) {
                media.value = url;
                report.resolved += 1;
            } else {
                // Octets absents: le média retombera sur son chemin de fichier,
                // qui n'existe que si l'utilisateur l'a copié dans assets/media/.
                report.missing.push(media.id || media.storageKey);
            }
        }

        return report;
    }

    window.addEventListener('pagehide', revokeAll);

    window.mediaStore = {
        put,
        whenIdle,
        get,
        list,
        remove,
        createUrl,
        revoke,
        revokeAll,
        resolveAll,
        toPortable,
        folderForType,
        assetPathFor
    };
})();

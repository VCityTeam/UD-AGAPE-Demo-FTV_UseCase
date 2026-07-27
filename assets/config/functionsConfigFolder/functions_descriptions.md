## Mouvements de Caméra (Ligne, Air-Sol, Dézoom, orbit)
Fichier : `cameraMovementSplineConfig.json`
- Description : Déplace la caméra le long d'une trajectoire 3D définie. Cela permet de créer des zooms, dézooms (en faisant varier le `z`), et des mouvements verticaux/horizontaux.
- Déclinaisons : 
   - Spline / Ligne / Orbit : Trajectoire fluide ou linéaire entre un point de départ et d'arrivée.
- Paramètres clés :
   - `cameraMovement` : Objet contenant la configuration.
   - `type` : `"spline"` (pourrait être `"line"` ou autre à l'avenir).
   - `arrayPoints` : Un tableau de points (coordonnées x, y, z) `[{ "x":..., "y":..., "z":... }, ...]` définissant la trajectoire.
   - `duration` : Durée du mouvement en millisecondes.
   - `loop` : Booléen (`true`/`false`) pour faire boucler le mouvement ou non.

## Rotation Caméra sur place
Fichier : `cameraRotationConfig.json`
- Description : Fait pivoter la caméra autour de son propre axe (comme tourner la tête de gauche à droite ou de haut en bas) sans la déplacer.
- Déclinaisons : 
   - Rotation 3 axes (Pan/Tilt/Roll équivalents).
- Paramètres clés :
   - `type` : `"rotation"`.
   - `rotationDegrees` : Un objet `{ "x": 0, "y": 90, "z": 0 }` pour spécifier l'angle de rotation final sur chaque axe (en degrés).

## Camera Look At (Fixer un point)
Fichiers : `cameraLookAtPointConfig.json` et `cameraLookAtArrayPointsConfig.json`
- Description : Force la cible de vue de la caméra (Target) sur un ou plusieurs points spécifiques. Utile pour garder le focus sur un bâtiment pendant que la caméra se déplace.
- Déclinaisons :
   - Point unique : Fixer un point statique (`cameraLookAt` défini comme un objet JSON).
   - Liste de points : Suivre une liste de points consécutifs (`cameraLookAt` défini comme un tableau JSON).
- Paramètres clés :
   - `cameraLookAt` : Soit un objet `{ "x":..., "y":..., "z":... }`, soit un tableau `[{...}, {...}]`.

## Élément posé (Objets 2D et 3D)
Fichiers : `2dObjectPosConfig.json` et `3dObjectPosConfig.json`
- Description : Insérer un média statique (image pour la 2D, modèle pour la 3D) dans la configuration de l'étape.  
- Déclinaisons possibles :
   - Pose avec rotation : On peut imaginer décliner ces objets selon l'orientation souhaitée pour qu'ils soient couchés (plaqués au sol comme un tapis) ou dressés (comme un panneau pub).
- Paramètres clés :
   - `media` : Un tableau appelant les bons ID de médias, par ex `["part_dieu_derriere_gare"]` ou `["3dObjectPos"]`. La position/rotation de l'étape initiale (`cameraPosition` et `cameraRotation` en quaternion) peut servir de base pour la vue.

## Rotation de caméra autour d'un point (à développer)
- Description : Fait tourner la caméra autour d'un point d'intérêt central (orbite).
- Déclinaisons possibles :
   - Cercle propre (Orbite pure) : Rotation parfaite à rayon constant autour du point.
   - Polyligne / Spline circulaire : Orbite approximée ou irrégulière définie par une liste de points encerclant la cible.
- Paramètres imaginés :
   - `type` : `"orbit"` ou `"circle"`.
   - `center` : Coordonnées du point central `{ "x":..., "y":..., "z":... }`.
   - `radius` : Distance depuis le centre.
   - `duration` ou `speed` : Durée ou vitesse de la rotation.

## Image en plein écran
- Description : Affiche une image ou une vidéo en plein écran.
- Déclinaisons possibles :
   - Image seule : Affiche une image en plein écran.
   - Vidéo : Affiche une vidéo en plein écran.
- Paramètres clés :
   - `media` : Un tableau appelant les bons ID de médias, par ex `["fullScreenImage"]` ou `["fullScreenVideo"]`.
   - Pas de `cameraPosition`, sinon l'image sera positionnée à la position de la caméra au lieu de plein écran

## Objet regardant/suivant la caméra
- Description: Objet 2D ou 3D regardant la caméra
- Déclinaisons possibles:
   - Objet ne regarde la caméra qu'au début et ne suis pas le mouvement de la caméra (devrait être celle de base)
   - Objet suis le mouvement de la caméra
- Paramètres clés:
   - `objectLookAtCamera` : Un array appelant les bons ID de médias, par ex `["3Darrow"]`.


## Objet ou Image en mouvement (à développer)
- Description : Déplace dynamiquement un modèle 3D ou une image 2D dans la scène (ex: véhicule qui avance, bulle qui se déplace).
- Déclinaisons possibles :
   - Polyligne : Déplacement brut de point en point (trajectoire "cassée").
   - Spline : Suivi de chemin courbe adouci passant par les points de contrôle.
   - Courbe généralisée : Déplacements mathématiques (Bézier, Hermite, etc.) sans forcément de liste de points statiques.
- Paramètres imaginés :
   - `objectMovement` : Attribut au sein de la configuration du média (ex: `image en mvt`).
   - `type` : `"polyline"`, `"spline"`, ou `"curve"`.
   - `arrayPoints` : Coordonnées de passage.
   - `duration` : Durée du trajet en ms.
   - `loop` : Booléen si le mouvement doit se répéter en boucle.

## Média 2D en plein écran (en cours de developpement)
- Description : Affiche une image ou une vidéo en plein écran.

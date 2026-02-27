import os, sys, pyproj, PIL
from PIL import Image
from PIL.ExifTags import TAGS
import json

for images in os.listdir("./images_gilles/"):
    if images.endswith(".jpg") or images.endswith(".jpeg") or images.endswith(".png"):
        imgfile = Image.open(f"./images_gilles/{images}")
        exif_data = imgfile._getexif()

        if exif_data:  # s'il existe des informations EXIF
            for tag, value in exif_data.items():
                if ("DateTimeOriginal" in TAGS[tag]) or ("GPSInfo" in TAGS[tag]): 
                    print(TAGS[tag], value)

# GPS = EPSG 4326
# EPSG 3946 = Lambert-93
proj_3946 = pyproj.Proj('+proj=lcc +lat_0=46 +lon_0=3 +lat_1=45.25 +lat_2=46.75 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs', preserve_units=False)

# Fonction pour convertir les coordonnées GPS en degrés décimaux
def get_decimal_coordinates(gps_info):
    lat = gps_info[2]
    lon = gps_info[4]
    
    lat_deg = lat[0] + lat[1] / 60 + lat[2] / 3600
    lon_deg = lon[0] + lon[1] / 60 + lon[2] / 3600
    
    if gps_info[1] == 'S':
        lat_deg = -lat_deg
    if gps_info[3] == 'W':
        lon_deg = -lon_deg
    
    return lon_deg, lat_deg

# Initialiser le dictionnaire de sortie
output_data = []

images_random = os.listdir("./images_gilles/")
images = images_random.sort()  # Trier les images pour une meilleure organisation

image_id = 1
for images in images_random:
    if images.endswith(".jpg") or images.endswith(".jpeg") or images.endswith(".png"):
        imgfile = Image.open(f"./images_gilles/{images}")
        exif_data = imgfile._getexif()

        if exif_data:
            gps_info = None
            for tag, value in exif_data.items():
                if TAGS[tag] == "GPSInfo":
                    gps_info = value
                    break
            
            if gps_info:
                try:
                    lon, lat = get_decimal_coordinates(gps_info)
                    x_3946, y_3946 = proj_3946(lon, lat)
                    
                    image_entry = {
                        "id": f"image_{image_id}",
                        "type": "image",
                        "value": "../assets/media/images/" + images,
                        "position": {"x": x_3946, "y": y_3946, "z": 200},
                        "rotation": {"x": 0.707, "y": 0, "z": 0, "w": 0.707},
                        "scale": {"x": 0.3, "y": 0.3, "z": 0.3},
                        "display3D": True
                    }
                    output_data.append(image_entry)
                    image_id += 1
                except Exception as e:
                    print(f"Erreur pour {images}: {e}")

# Créer le dictionnaire de visite
visit_dictionnary = {
    "visits": [
        {
            "id": "Visit_1",
            "name": "Generated Visit",
            "description": "Visit generated from image data",
            "startIndex": 0,
            "endIndex": len(output_data) - 1,
            "steps": [
                {
                    "previous": idx - 1 if idx > 0 else 0,
                    "next": idx + 1 if idx < len(output_data) - 1 else len(output_data) - 1,
                    "type": "image_step",
                    "layers": ["Ortho_IGN", "lyon3", "planar"],
                    "media": [image["id"]],
                    "position": {"x": image["position"]["x"], "y": image["position"]["y"] - 100, "z": image["position"]["z"]},
                    "rotation": {"x": 0.707, "y": 0, "z": 0, "w": 0.707}
                }
                for idx, image in enumerate(output_data)
            ]
        }
    ]
}

# Ajouter le dictionnaire de visite au dictionnaire final
final_media_dictionnary = {
    "medias": output_data
}


# Sauvegarder dans un fichier JSON
with open("mediaConfig3.json", "w") as json_file:
    json.dump(final_media_dictionnary, json_file, indent=2)

with open("visitConfig4.json", "w") as json_file:
    json.dump(visit_dictionnary, json_file, indent=2)

print(f"Fichiers JSON créés avec {len(output_data)} images")


## Prendre les groupes de photos et créer la skybox a partir de chaque groupe
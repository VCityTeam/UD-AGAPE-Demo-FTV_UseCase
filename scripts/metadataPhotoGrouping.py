import os
import json
import pyproj
from PIL import Image
from PIL.ExifTags import TAGS
from datetime import datetime

def get_proj_3946():
    # GPS = EPSG 4326
    # EPSG 3946 = Lambert-93
    return pyproj.Proj(
        '+proj=lcc +lat_0=46 +lon_0=3 +lat_1=45.25 +lat_2=46.75 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
        preserve_units=False
    )

def get_rotations():
    rotation_north = {"x": 0.707, "y": 0, "z": 0, "w": 0.707}
    rotation_south = {"x": 0, "y": 0.707, "z": 0.707, "w": 0}
    rotation_east = {"x": -0.500, "y": 0.500, "z": 0.500, "w": -0.500}
    rotation_west = {"x": 0.500, "y": -0.500, "z": -0.500, "w": 0.500}
    rotations_by_position = {
        0: rotation_east,
        1: rotation_north,
        2: rotation_west
    }
    return rotation_north, rotation_south, rotation_east, rotation_west, rotations_by_position

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

def get_image_datetime(path):
    try:
        img = Image.open(path)
        exif_data = img._getexif()
        if exif_data:
            for tag_id, value in exif_data.items():
                tag = TAGS.get(tag_id, tag_id)
                if tag == "DateTimeOriginal":
                    return datetime.strptime(value, "%Y:%m:%d %H:%M:%S")
    except Exception as e:
        print(f"Error reading {path}: {e}")
    return None

def get_gps_info(path):
    try:
        img = Image.open(path)
        exif_data = img._getexif()
        if exif_data:
            for tag_id, value in exif_data.items():
                tag = TAGS.get(tag_id, tag_id)
                if tag == "GPSInfo":
                    return value
    except Exception as e:
        print(f"Error reading GPS from {path}: {e}")
    return None

def get_images_with_metadata(images_dir):
    images_list = os.listdir(images_dir)
    images_list.sort()
    images_with_metadata = []
    for img in images_list:
        if img.endswith((".jpg", ".jpeg", ".png")):
            img_path = os.path.join(images_dir, img)
            img_date = get_image_datetime(img_path)
            gps_info = get_gps_info(img_path)
            if img_date and gps_info:
                try:
                    lon, lat = get_decimal_coordinates(gps_info)
                    x_3946, y_3946 = get_proj_3946()(lon, lat)
                    images_with_metadata.append({
                        "filename": img,
                        "datetime": img_date,
                        "gps": {"lon": lon, "lat": lat},
                        "position": {"x": x_3946, "y": y_3946, "z": 200}
                    })
                except Exception as e:
                    print(f"Error processing {img}: {e}")
            else:
                print(f"Skipping {img}: missing date or GPS info")
    return images_with_metadata

def group_images_by_time(images_with_metadata):
    images_groups_by_time = {}
    liste_dates = [img["datetime"] for img in images_with_metadata]
    for i in range(len(liste_dates) - 1):
        diff = liste_dates[i + 1] - liste_dates[i]
        if diff.seconds < 11:
            group_key = f"Groupe {i}"
            if group_key not in images_groups_by_time:
                images_groups_by_time[group_key] = []
            images_groups_by_time[group_key].append(images_with_metadata[i])
            images_groups_by_time[group_key].append(images_with_metadata[i + 1])
        else:
            group_key = liste_dates[i].strftime('%Y-%m-%d %H:%M:%S')
            if group_key not in images_groups_by_time:
                images_groups_by_time[group_key] = []
            images_groups_by_time[group_key].append(images_with_metadata[i])
    # Merge groups with common elements
    merged = True
    while merged:
        merged = False
        keys = list(images_groups_by_time.keys())
        for i in range(len(keys)):
            for j in range(i + 1, len(keys)):
                if keys[i] in images_groups_by_time and keys[j] in images_groups_by_time:
                    set_i = set(img["filename"] for img in images_groups_by_time[keys[i]])
                    set_j = set(img["filename"] for img in images_groups_by_time[keys[j]])
                    if set_i & set_j:
                        combined = {img["filename"]: img for img in images_groups_by_time[keys[i]] + images_groups_by_time[keys[j]]}
                        images_groups_by_time[keys[i]] = list(combined.values())
                        del images_groups_by_time[keys[j]]
                        merged = True
    # Remove duplicates within each group
    for group in images_groups_by_time:
        seen = set()
        unique_images = []
        for img in images_groups_by_time[group]:
            if img["filename"] not in seen:
                seen.add(img["filename"])
                unique_images.append(img)
        images_groups_by_time[group] = sorted(unique_images, key=lambda x: x["datetime"])
    return images_groups_by_time

def create_output_data(images_groups_by_time):
    output_data = []
    image_id = 1
    for group_name, images in images_groups_by_time.items():
        group_len = len(images)
        middle_pos = dict(images[0]["position"])
        for position_in_group, image_info in enumerate(images):
            rotation_north, rotation_south, rotation_east, rotation_west, rotations_by_position = get_rotations()
            rotation = rotations_by_position.get(position_in_group, rotation_north)
            pos = dict(middle_pos)
            if position_in_group == 0:
                pos["x"] = middle_pos["x"] - 30
            elif position_in_group == 2:
                pos["x"] = middle_pos["x"] + 30
            else:
                pos["y"] = middle_pos["y"] + 30
            image_entry = {
                "id": f"image_{image_id}",
                "type": "image",
                "value": "../assets/media/images/" + image_info["filename"],
                "position": pos,
                "rotation": rotation,
                "scale": {"x": 0.3, "y": 0.3, "z": 0.3},
                "display3D": True
            }
            output_data.append(image_entry)
            image_id += 1
    return output_data

def create_visit_dictionary(images_groups_by_time, output_data):
    rotation_north, rotation_south, rotation_east, rotation_west, rotations_by_position = get_rotations()
    visit_dictionnary = {
        "visits": [
            {
                "id": "Visit_1",
                "name": "Generated Visit",
                "description": "Visit generated from image data",
                "startIndex": 0,
                "endIndex": len(images_groups_by_time) - 1,
                "steps": [
                    {
                        "previous": idx - 1 if idx > 0 else 0,
                        "next": idx + 1 if idx < len(images_groups_by_time) - 1 else len(images_groups_by_time) - 1,
                        "type": "image_step",
                        "layers": ["Ortho_IGN", "lyon3", "planar"],
                        "media": [img["id"] for img in group_images],
                        "position": {
                            "x": group_images[1]["position"]["x"],
                            "y": group_images[1]["position"]["y"] - 80,
                            "z": group_images[1]["position"]["z"]
                        },
                        "rotation": rotation_north
                    }
                    for idx, group_images in enumerate(
                        [
                            [image for image in output_data if image["value"].split("/")[-1] in 
                             [img["filename"] for img in images]]
                            for group_name, images in images_groups_by_time.items()
                        ]
                    )
                ]
            }
        ]
    }
    return visit_dictionnary

def save_json_files(final_media_dictionnary, visit_dictionnary):
    with open("mediaConfig3.json", "w") as json_file:
        json.dump(final_media_dictionnary, json_file, indent=2)
    with open("visitConfig4.json", "w") as json_file:
        json.dump(visit_dictionnary, json_file, indent=2)

def main():
    images_dir = "./images_gilles/"
    images_with_metadata = get_images_with_metadata(images_dir)
    images_groups_by_time = group_images_by_time(images_with_metadata)
    output_data = create_output_data(images_groups_by_time)
    visit_dictionnary = create_visit_dictionary(images_groups_by_time, output_data)
    final_media_dictionnary = {"medias": output_data}
    save_json_files(final_media_dictionnary, visit_dictionnary)
    print(f"\nFichiers JSON créés avec {len(output_data)} images")
    print(f"Nombre de groupes: {len(images_groups_by_time)}")

if __name__ == "__main__":
    main()

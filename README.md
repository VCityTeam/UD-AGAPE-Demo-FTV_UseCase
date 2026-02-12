# UD-AGAPE-Demo-FTV_UseCase

This project is a 3D guided visit demo using `ud-viz`, `itowns` and `three.js`. It allows users to navigate through a city with 3DTiles for buildings and multimedia documents (videos, images, etc.) at various coordinates and rotations.


## Getting Started

### Prerequisites

- Node.js installed on your machine.
- `npm` (Node Package Manager).

### Installation

1.  Clone the repository or download the source code.
2.  Navigate to the project directory in your terminal.
3.  Install dependencies:

```bash
npm install
```

### Running the Demo

To start the application in debug mode (recommended for development and testing):

```bash
npm run start-debug
```

This command builds the project in development mode and starts the backend server. Open your browser at the address indicated in the terminal (usually `http://localhost:8080` or similar, check the `backEnd.js` output).

To build and run for production:

```bash
npm run start
```
or 
``` bash
npm run start-debug
```
if you want to do change to files other than the JavaScript and not have to restart the demo

## Project Structure

-   `src/`: Contains the source code of the application (JavaScript logic).
    -   `guidedVisit.js`: Main logic for the guided tour validation and execution.
-   `assets/`: Static assets.
    -   `config/`: Configuration files (JSON) for the demo content.
    -   `media/`: Documents used in the demo, in their respective folders (videos, images, etc.).
-   `html/`: HTML entry points (e.g., `parcours_test.html`).
-   `bin/`: Backend server scripts.

## Configuration Files

The content and behavior of the demo are driven by JSON configuration files located in `assets/config/`.

### 1. `layerConfig.json`

Defines the geospatial layers, initial view extent, and projection details.

**Fields:**
-   `projection`, `transform`: Coordinate system configurations, particularly important for determining the coordinates that will be used for the positions of the camera in `visitConfig.json` and for the position of medias in `mediaConfig.json`.
-   `3DTilesLayers`: 3D tilesets (e.g., building models).
-   `elevation_layer`: Elevation layer configuration.
-   `background_image_layer`: Background image layer configuration.

### 2. `mediaConfig.json`

This file defines the multimedia resources (videos, images) used in the visit.

**Structure:**
-   `sources`: A dictionary of media sources/credits (optional usage).
-   `medias`: An array of media objects.

**Media Object Fields:**
-   `id`: Unique identifier for the media type (referenced in `visitConfig.json`).
-   `type`: Type of media (`video`, `image`, `text`, `audio`, `file`).
-   `value`: Path to the media file (e.g., `../assets/media/videos/Video_P2.mp4`) or text content.
-   `source`: Source of the media (optional usage, as it depends on the data used).
-   `license`: License of the media (optional usage, as it depends on the data used).
-   `position` (Optional): `{x, y, z}` coordinates to place the media in the 3D scene.
-   `rotation` (Optional): `{x, y, z, w}` quaternion for orientation in 3D.
-   `scale` (Optional): `{x, y, z}` scale factors.
-   `display3D`: Boolean, set to `true` to display as a 3D object in the scene.

### 3. `visitConfig.json`

This file defines the steps of the guided tour.

**Structure:**
-   `visits`: An array of visit objects (currently supports one main visit).

**Visit Object Fields:**
-   `id`: Unique ID for the visit.
-   `steps`: An array of step objects defining the sequence of the tour.

**Step Object Fields:**
-   `previous` / `next`: Indices of the previous and next steps (previous of step 0 is itself and next of last step is itself too).
-   `media`: Array of media IDs to display during this step (must absolutely match IDs in `mediaConfig.json`).
-   `position`: Camera position `{x, y, z}` for this step.
-   `rotation`: Camera orientation `{x, y, z, w}`.
-   `layers`: List of active layers for this step.


## Customizing the Demo

### How to Change Media files

1.  **Add your file**: Place your video or image file in the `assets/media/` folder (inside `assets/media/videos/`, `assets/media/images/`, etc.).
2.  **Update `mediaConfig.json`**:
    *   Find the media entry you want to change, or create a new one in the `medias` array.
    *   Update the `value` path to point to your new file (e.g., `"../assets/media/videos/my_new_video.mp4"`).
    *   If you added a new entry, give it a unique `id`.

### How to Update the Visit Steps

1.  **Modify `visitConfig.json`**:
    *   Locate the step you want to change in the `steps` array.
    *   **Change position/view**: Update the `position` and `rotation` values. You can get these values by logging the camera position in the browser console while navigating the 3D scene in debug mode (see below).
    *   **Add/Remove Media**: Update the `media` array for that step with the `id` of the media you defined in `mediaConfig.json`.

### How to Add a New Step

1.  Add a new object to the `steps` array in `visitConfig.json`.
2.  Ensure `previous` and `next` indices of the new step and its neighbors are updated to maintain the chain.
3.  Define the `position` and `rotation` for the camera.
4.  Add relevant media IDs.

## Development / Debugging

To help you find the right coordinates for your new steps or media:

1.  Open the application in your browser (localhost).
2.  Open the Developer Console (F12 or Ctrl+Shift+I).
3.  The `view` and `guidedTour` objects are exposed globally.
4.  Navigate to the desired view in the 3D scene.
5.  Run the following commands in the console to get the current position and rotation:

To get the camera position:
```javascript
view.camera.camera3D.position
```
To get the camera rotation (quaternion):
```javascript
view.camera.camera3D.quaternion
```

Copy these values into your `visitConfig.json` or `mediaConfig.json` depending on your need.

## Things you'll be able do to and see in this demo

- Navigate through the scene with mouse movements
- See 3D buildings in the scene (all white as they are not textured)
- Change steps (can be seen in `visitConfig.json`) by using the arrow keys (left arrow for previous step, right arrow for next step) and get automatically transported to the new position
- See multimedia documents (videos, images, etc.) at various coordinates and rotations at each "step" of the demo (can be seen in `mediaConfig.json`)
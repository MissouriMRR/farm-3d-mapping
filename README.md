# 3D Farm Mapping - Digital Twin

A web-based 3D digital twin viewer for farm properties using drone imagery and CesiumJS.

---

## Prerequisites

Before starting, ensure you have the following installed on your machine:

* **Node.js** (v18.0.0 or higher) - [Download Node.js](https://nodejs.org/)
* **npm** (comes bundled with Node.js)
* **Git** - [Download Git](https://git-scm.com/)

Verify your installations by opening a terminal and running:
```bash
node -v
npm -v
git --version
```

---

## Installation & Setup

Follow these simple steps to install dependencies and run the application locally:

### 1. Clone the Repository
```bash
git clone https://github.com/MissouriMRR/farm-3d-mapping.git
cd farm-3d-mapping
```

### 2. Navigate to the Viewer Directory
The web application is located inside the `viewer` folder:
```bash
cd viewer
```

### 3. Install Dependencies
Install all required packages (React, Vite, CesiumJS, and plugins):
```bash
npm install
```

---

## Running the Application

### Start the Development Server
```bash
npm run dev
```

Once the server starts, open your browser and navigate to:
```
http://localhost:5173
```

You should see the interactive 3D Cesium globe loaded on the screen.

---

## Building for Production

To create an optimized production build:
```bash
npm run build
```

To preview the production build locally:
```bash
npm run preview
```

---

## Project Structure

```
farm-3d-mapping/
├── 3dmapping/
│   ├── 3D Mapping Requirements.pdf
│   └── PROJECT_PLAN_AND_TECH_PROPOSAL.md
├── viewer/
│   ├── public/
│   │   └── data/
│   │       └── callis-road/
│   │           ├── callis_orthophoto.png # High-res orthomosaic draped on terrain
│   │           ├── shots.geojson         # 393 camera shot coordinates & flight path
│   │           ├── bounds.geojson        # Field survey boundary polygon (WGS84)
│   │           └── stats.json            # ODM flight processing statistics
│   ├── src/
│   │   ├── components/
│   │   │   ├── CesiumViewer.css
│   │   │   └── CesiumViewer.tsx          # CesiumJS 3D viewer & layer controls
│   │   ├── config/
│   │   │   └── callisRoad.ts             # Dataset metadata and geographic bounds
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

---

## Features

- **Terrain Draped Orthophoto:** Drapes the Callis Road high-resolution orthophoto onto Cesium World Terrain with depth testing enabled.
- **Flight Trajectory & Camera Shots:** 3D visualization of the 393 camera capture locations and drone flight trajectory path.
- **Field Boundary:** Ground-clamped polygon depicting the field perimeter.
- **Interactive Controls:**
  - Layer visibility toggles (Orthophoto, Flight Path, Field Boundary).
  - Orthophoto opacity slider to compare drone imagery with underlying satellite basemaps.
  - Camera view presets: **3D Tilt** perspective and **Top-Down (2D)** nadir.

farm-3d-mapping/
├── 3dmapping/
│   ├── 3D Mapping Requirements.pdf
│   └── PROJECT_PLAN_AND_TECH_PROPOSAL.md
├── viewer/
│   ├── public/              # Static assets
│   ├── src/
│   │   ├── components/
│   │   │   ├── CesiumViewer.css
│   │   │   └── CesiumViewer.tsx  # Main CesiumJS 3D viewer component
│   │   ├── App.tsx          # Main React component
│   │   ├── index.css        # Global styles
│   │   └── main.tsx         # Application entry point
│   ├── package.json         # Project dependencies and scripts
│   └── vite.config.ts       # Vite + Cesium plugin configuration
└── README.md
```

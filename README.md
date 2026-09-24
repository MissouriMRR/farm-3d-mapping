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

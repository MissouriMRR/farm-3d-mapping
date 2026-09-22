# 3D Farm Mapping – Project Plan

**Prepared for:** Programming Leads (Zach & Matthew)  
**Date:** September 2026  

---

## 1. Objective

Build a web-based **Digital Twin** for farm properties using drone imagery processed through **OpenDroneMap (ODM)**. 

The dashboard will display:
* High-resolution 2D orthophotos and 3D terrain/mesh models.
* Drone flight paths with camera shot locations.
* Overlay pins for future sensor streams (All Seeing Research).

---

## 2. Tech Stack

* **3D Viewer:** **CesiumJS** (React + Vite)
  * *Why CesiumJS over Three.js:* Native support for real-world GPS coordinates (WGS84/UTM), GIS data formats (GeoJSON, GeoTIFF), and ODM’s 3D Tiles without writing custom coordinate math from scratch.
* **Processing:** **OpenDroneMap (ODM)** via Docker running on **Ricky** (Bay Computer).
* **Asset Hosting:** Lightweight static web server / API (FastAPI or Node.js) to serve tiles, models, and GeoJSON metadata.



---

## 3. Current Test Data (Callis Road)

We have verified the initial test dataset (`Callis-Road175-9-4-2026-all`):
* **Orthophoto:** High-resolution orthomosaic generated (`odm_orthophoto.tfw` / PNG).
* **Flight Trajectory:** 393 camera shot coordinates (`shots.geojson`).
* **Point Cloud:** 376,941 points in Entwine format (`ept.json`).
* *Note for next run:* The test run used fast orthophoto mode (no 3D mesh). Future runs will include `--3d-tiles` for full 3D models.

---

## 4. Implementation Roadmap

### Phase 1: Viewer Prototype (Weeks 1–2)
* Scaffold React + Vite app with CesiumJS.
* Load Callis Road orthophoto draped on terrain.
* Plot camera flight path (`shots.geojson`) and field boundary.
* Basic camera controls (orbit, top-down view, zoom).

### Phase 2: 3D Models & ODM Script (Weeks 3–4)
* Add 3D Tiles / mesh rendering to CesiumJS.
* Add UI controls: toggle layers (orthophoto / flight path / 3D model) and view flight stats.
* Write a simple Python automation script to run ODM on any new folder of drone photos.

### Phase 3: Multi-Flight Support & Sensor Hooks (Weeks 5–6)
* Add farm and flight date selector in the dashboard.
* Add mock pins on the 3D map for All Seeing Research sensor telemetry (soil moisture, temperature).
* Final testing, documentation, and handoff.


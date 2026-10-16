# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: Missouri S&T Multirotor (MissouriMRR) team members and the project leads, Zach and Matthew. They review drone survey output processed by OpenDroneMap, check its quality, and demo it in meetings.

Future audiences, not the current design target: farmers checking their own fields, and the partners in the collaboration outline (`3dmapping/Missouri_ST_Drone_Backend_Requirements_v1_1.pdf`, Aug 2026):
- **Allseeing Research Services**, the primary lead. They fly the missions, upload the imagery and do the agronomic analysis.
- **SoilDaddy**, the farm workspace front end, which will call the backend.
- **MoPine** (Todd Sparks), an MBSE digital twin that consumes the processed outputs.
- **Elm Spring Farms** (Matt Adler, Hughesville MO), the primary research site.
- **Lincoln University**, which validates the agriculture side.

## Product Purpose

A web digital twin of drone-surveyed farm properties. Aerial photos are processed with OpenDroneMap into orthophotos, elevation models and 3D models. The viewer shows them in their real-world location so users can navigate the field and read real data from it.

For now, success means the team and leads can open a survey, move through it in 3D and trust what it shows.

## Positioning

Every layer comes from the team's own drone flights and sits in one real-world coordinate frame (WGS84). That includes the orthophoto, flight path, height models and Gaussian splat, so a value read in the viewer is a measurement, not an illustration.

## Operating Context

- Data comes from team drone flights. The first test survey is Callis Road (Field 175, Pettis County MO): 393 nadir photos at about 50 m AGL with consumer GPS, and no GCPs or RTK.
- Processing uses OpenDroneMap in Docker, on Ricky (the Bay computer) or a team member's machine. Matthew noted that ODM slows down past about 60 images per batch, so splitting large sets is a requested capability.
- The viewer is used on laptops and projected in team meetings, and on phones outdoors at the farm.
- This is the team's repo: changes go on branches through PRs, with stack choices approved by Zach and Matthew.

## Capabilities and Constraints

- Current: orthophoto draped on Cesium World Terrain, camera shot positions and flight path, survey boundary, layer toggles, orthophoto opacity, base-map choice, 3D and top-down presets, survey details, and light/dark themes.
- Planned (project plan phases 2–3): ODM 3D Tiles mesh; elevation products (DSM, DTM, canopy height); a Gaussian splat layer; an ODM automation script; multi-farm and multi-date selection; and pins for All Seeing Research sensors.
- Heights are WGS84 ellipsoidal throughout (ODM, Cesium terrain, Cesium positions). Mean sea level near Callis Road is about 33 m above the ellipsoid. Any height shown to people must name its datum.
- Large outputs (tiles, PLYs, rasters) stay out of git unless the team agrees to LFS or hosting.
- No paid tools may be required.
- Partner roadmap: Milestone 1 is a local pipeline plus browser 3D display of the mesh or point cloud. Milestone 2 is a COG orthomosaic, a DSM, a quality report and a JSON metadata sidecar. Milestone 3 is a REST API for SoilDaddy, Milestone 4 is flight planning (ArduPilot `.plan` and DJI WPML), and Milestone 5 is CHM, vegetation indices and change detection. S&T delivers runnable, documented software and does not host compute long term.
- Drones: Allseeing flies a DJI Mavic 4 Pro (25 MP). The S&T team develops on a Mavic 2 Pro.
- Undecided: asset hosting (a static server or FastAPI/Node), and the sensor data format from All Seeing Research.

## Brand Commitments

MissouriMRR team project. The existing product name is "Farm 3D Mapping", and the survey title and status copy are kept unless a change is requested.

## Evidence on Hand

- `viewer/public/data/callis-road/`: orthophoto (WebP), `shots.geojson` (393 shots), boundary GeoJSON and `stats.json`.
- `3dmapping/3D Mapping Requirements.pdf` and `3dmapping/PROJECT_PLAN_AND_TECH_PROPOSAL.md`.
- No farmer testimonials, All Seeing Research data or accuracy benchmarks exist yet. Do not fabricate them.

## Product Principles

1. **Measurement is honest.** Show every height or position with its datum, and keep relative and absolute accuracy distinct. With no GCPs, within-field relative accuracy is roughly 5–10 cm, but absolute accuracy is metre-level, so say so.
2. **One frame, many layers.** New layers join the shared WGS84 frame and line up with existing ones. They are never placed by eye.
3. **The field is the subject.** The interface supports reading the survey and never competes with it.
4. **Built to be handed off.** Pipelines and viewer code should be runnable and understandable by the next team member, on the hardware the team has.

## Accessibility & Inclusion

- Target WCAG 2.2 AA.
- It must work when projected (legible at distance, without relying on subtle contrast) and on a phone outdoors in sunlight (high contrast, touch-sized targets, usable one-handed at narrow widths).

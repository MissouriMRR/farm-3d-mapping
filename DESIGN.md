---
name: Farm 3D Mapping
description: A compact GIS console with light and dark themes
colors:
  light-flight: "#e8c21a"
  light-shot: "#f59e0b"
  light-boundary: "#10b981"
  light-panel: "#f4f5f3"
  light-raise: "#e9ebe7"
  light-rule: "#d8dbd5"
  light-edge: "#c4c8c0"
  light-track: "#e9ebe7"
  light-selected: "#ffffff"
  light-selected-ink: "#1a1d1b"
  light-ink: "#1a1d1b"
  light-ink-2: "#545a53"
  light-ink-3: "#676d65"
  light-control: "#2d3134"
  light-focus: "#2d3134"
  light-status-ok: "#2f8a52"
  light-status-wait: "#b7791f"
  light-symbol-edge: "rgba(0, 0, 0, 0.14)"
  dark-panel: "#181a1b"
  dark-raise: "#202325"
  dark-rule: "#2d3134"
  dark-edge: "#000000"
  dark-track: "#232628"
  dark-selected: "#3a3f42"
  dark-selected-ink: "#e9ebe7"
  dark-ink: "#e9ebe7"
  dark-ink-2: "#a3a9a1"
  dark-ink-3: "#8b9189"
  dark-control: "#cfd3cd"
  dark-focus: "#cfd3cd"
  dark-status-ok: "#4fb477"
  dark-status-wait: "#e0a33a"
  dark-symbol-edge: "rgba(255, 255, 255, 0.15)"
typography:
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif"
    fontSize: "12.5px"
    lineHeight: 1.4
  title:
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.3
  label:
    fontSize: "11.5px"
    fontWeight: 600
rounded:
  segmented: "5px"
  theme-toggle: "6px"
  mobile-sheet: "12px"
spacing:
  panel-inset: "16px"
  legend-gap: "10px"
---

# Design System: Farm 3D Mapping

## Overview

**Creative North Star: "Graphite console"**

A compact, restrained GIS console keeps the farm imagery central. Flat neutral
surfaces, fine dividers, small system typography, and precise map legends carry
the interface. Light and dark themes share the same hierarchy and controls.

This records the implemented design from commit d4e49c9. In the original
September 24, 2026 design session, the user chose concept B with light and dark
modes, requested unified controls, and retained the existing title and status
copy. The October 5 instruction supersedes the earlier incognito requirement:
Impeccable documentation belongs in version control alongside the project.

**Key Characteristics:**
- Compact GIS controls.
- Neutral surfaces in two themes.
- Map symbols that identify the displayed layers.

## Colors

The frontmatter records the current CSS tokens, prefixed by theme. Panel, track,
selected, ink, rule, and edge tokens define the neutral interface. Flight, shot,
and boundary colors identify geographic content; status colors convey loading
and readiness. Preserve color roles when adding controls.

**The Legend Rule.** Match symbol shape and color to the geographic layer.
The current flight legend is golden yellow while Cesium draws the trajectory
with Color.YELLOW; this small existing mismatch is not a new design decision.

## Typography

Use the system font stack. Keep headings compact and sentence case. Survey
values and opacity use tabular numerals; align survey values to the right.
Subtitle text and segmented buttons use 12px; credits use 10.5px.

## Layout

The desktop viewer fills the viewport, with a 292px left panel and a flexible
map. Group related controls with fine horizontal dividers. Keep map layers,
base maps, view presets, survey data, and attribution together in the panel.

At widths up to 720px, place the map above the scrolling panel. The panel has
a maximum height of 56vh and overlaps the map edge by 12px. Hide the survey
table at this breakpoint. The current panel is fixed, not draggable.

## Elevation & Depth

Use opaque surfaces, borders, and tonal changes for hierarchy. The panel has
no floating-card shadow or backdrop blur. The orthophoto thumbnail has a
subtle inset edge. Geographic rendering may use effects independently of UI.

## Shapes

Use modest rounding for controls and larger top corners on the mobile panel.
Legend thumbnails have 2px corners. Keep desktop panel edges square.

## Components

### Segmented controls

Base Map and View use equal-width buttons. Selection changes the background,
text color, and weight. Keep aria-pressed synchronized with the selected value.
Buttons have 6px vertical and 8px horizontal padding.

### Layer rows and opacity

Use native labeled checkboxes beside an image thumbnail, flight line with
points, or boundary outline. The checkbox, symbol, and label occupy columns
of 14px, 26px, and the remaining width. The orthophoto opacity slider appears
under its row while enabled; its percentage is right aligned.

### Theme toggle

A 28px square button switches between sun and moon icons, persists the choice,
and uses the system preference initially. Provide an accessible action label.

### Status and survey

Use a small status dot with plain text and a definition list for survey values.
Retain the existing product wording unless a copy change is requested.

### Attribution

Keep Cesium attribution visible at the panel foot. Its graphite background
remains dark in both themes because the Cesium logo is white.

### Interaction

Buttons and inputs have a 2px focus outline with 1px offset. Theme and segmented
buttons transition color and background over 150ms with ease timing.

## Do's and Don'ts

### Do:
- Do keep mapping controls unified in the panel.
- Do preserve both themes and visible attribution.
- Do use native input semantics and visible keyboard focus.

### Don't:
- Don't replace the compact GIS identity with floating dashboard cards.
- Don't add decorative UI glow, pulsing status dots, or background blur.
- Don't treat documentation of existing behavior as evidence of new visual QA.

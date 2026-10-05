import { CALLIS_ROAD_METADATA } from '../config/callisRoad'
import { useFieldMap } from '../hooks/useFieldMap'
import { useTheme } from '../hooks/useTheme'
import './CesiumViewer.css'

export default function CesiumViewer() {
  const {
    containerRef, creditRef, isLoaded, settings,
    updateSettings, viewMode, flyToField,
  } = useFieldMap()
  const { orthoVisible, opacity, flightPathVisible, boundaryVisible, baseMap } = settings
  const { theme, toggleTheme } = useTheme()

  const { name, date, gsd, flightAltitude, shotsCount, orthophotoUrl } = CALLIS_ROAD_METADATA

  return (
    <div className="cesium-wrapper" data-theme={theme}>
      <aside className="side-panel">
        <header className="panel-head">
          <div className="panel-titles">
            <h1>Farm 3D Mapping - Digital Twin</h1>
            <span className="subtitle">
              {name} • {date}
            </span>
          </div>
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="3" />
                <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" />
              </svg>
            )}
          </button>
          <div className="status" role="status">
            <span className={`status-dot ${isLoaded ? 'active' : 'loading'}`} />
            {isLoaded ? 'Orthophoto Draped' : 'Loading Orthophoto...'}
          </div>
        </header>

        <section className="panel-group">
          <h2 className="group-title">Map Layers</h2>
          <label className="layer-row">
            <input
              type="checkbox"
              checked={orthoVisible}
              onChange={(e) => updateSettings({ orthoVisible: e.target.checked })}
            />
            <span
              className="layer-symbol symbol-ortho"
              style={{ backgroundImage: `url(${orthophotoUrl})` }}
            />
            Callis Road Orthophoto
          </label>
          {orthoVisible && (
            <div className="opacity-row">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={opacity}
                onChange={(e) => updateSettings({ opacity: e.target.valueAsNumber })}
                aria-label="Layer Opacity"
              />
              <span className="opacity-value">{Math.round(opacity * 100)}%</span>
            </div>
          )}
          <label className="layer-row">
            <input
              type="checkbox"
              checked={flightPathVisible}
              onChange={(e) => updateSettings({ flightPathVisible: e.target.checked })}
            />
            <svg className="layer-symbol" viewBox="0 0 26 16" aria-hidden="true">
              <polyline className="symbol-flight-line" points="2,13 9,4 16,10 24,3" />
              <circle className="symbol-flight-shot" cx="9" cy="4" r="1.8" />
              <circle className="symbol-flight-shot" cx="16" cy="10" r="1.8" />
            </svg>
            Flight Trajectory ({shotsCount} shots)
          </label>
          <label className="layer-row">
            <input
              type="checkbox"
              checked={boundaryVisible}
              onChange={(e) => updateSettings({ boundaryVisible: e.target.checked })}
            />
            <svg className="layer-symbol" viewBox="0 0 26 16" aria-hidden="true">
              <rect className="symbol-boundary" x="2" y="2" width="22" height="12" rx="1" />
            </svg>
            Field Boundary
          </label>
        </section>

        <section className="panel-group">
          <h2 className="group-title">Base Map</h2>
          <div className="segmented" role="group" aria-label="Base Map">
            {(
              [
                ['satellite', 'Satellite'],
                ['hybrid', 'Hybrid'],
                ['road', 'Road'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={baseMap === value}
                onClick={() => updateSettings({ baseMap: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="panel-group">
          <h2 className="group-title">View</h2>
          <div className="segmented" role="group" aria-label="View">
            <button
              type="button"
              aria-pressed={viewMode === '3d'}
              onClick={() => flyToField('3d')}
            >
              3D Tilt
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'top-down'}
              onClick={() => flyToField('top-down')}
            >
              Top-Down (2D)
            </button>
          </div>
        </section>

        <section className="panel-group group-survey">
          <h2 className="group-title">Survey</h2>
          <dl className="survey-table">
            <dt>Resolution</dt>
            <dd>{gsd}</dd>
            <dt>Altitude</dt>
            <dd>{flightAltitude}</dd>
            <dt>CRS</dt>
            <dd>WGS84 (EPSG:4326) / UTM 15N</dd>
          </dl>
        </section>

        <div ref={creditRef} className="panel-credits" />
      </aside>

      <main className="map-area">
        <div ref={containerRef} className="cesium-container" />
      </main>
    </div>
  )
}

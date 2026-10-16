import type { FieldMetadata, HeightLayerKey } from '../config/callisRoad'
import ramps from '../config/heightRamps.json'
import { formatEllipsoidal, formatNavd88 } from '../map/datum'
import type { HeightLayerChoice, PickedHeight } from '../map/createFieldMap'

const HEIGHT_CHOICES: [HeightLayerChoice, string][] = [
  ['none', 'Off'],
  ['dsm', 'Surface'],
  ['dtm', 'Ground'],
  ['canopy', 'Canopy'],
]

const HEIGHT_DESCRIPTIONS: Record<HeightLayerKey, string> = {
  dsm: 'Surface elevation, including crops and trees',
  dtm: 'Bare-ground elevation',
  canopy: 'Height above ground (surface minus ground)',
}

type HeightMapProps = {
  field: FieldMetadata
  value: HeightLayerChoice
  onChange: (value: HeightLayerChoice) => void
}

export function HeightMapControl({ field, value, onChange }: HeightMapProps) {
  const heights = field.layers?.heights
  const raster = value !== 'none' ? heights?.[value] : undefined
  const isCanopy = value === 'canopy'
  // Elevation rasters are ramped in ellipsoidal metres; people read them in NAVD88.
  const shown = (metres: number) => Math.round(isCanopy ? metres : metres + field.navd88Offset)

  return (
    <section className="panel-group">
      <h2 className="group-title">Height Map</h2>
      <div className="segmented" role="group" aria-label="Height map">
        {HEIGHT_CHOICES.map(([choice, label]) => (
          <button
            key={choice}
            type="button"
            aria-pressed={value === choice}
            disabled={choice !== 'none' && !heights?.[choice]}
            onClick={() => onChange(choice)}
          >
            {label}
          </button>
        ))}
      </div>
      {!heights && (
        <p className="panel-note">Height maps appear once this survey has a full reconstruction.</p>
      )}
      {raster && value !== 'none' && field.layers?.meshUrl && (
        <p className="panel-note">Shown flat on the ground; the 3D mesh is hidden while a height map is on.</p>
      )}
      {raster && value !== 'none' && (
        <figure className="height-legend">
          <figcaption>{HEIGHT_DESCRIPTIONS[value]}</figcaption>
          <div
            className="height-ramp"
            style={{ background: `linear-gradient(90deg, ${(isCanopy ? ramps.canopy : ramps.elevation).join(', ')})` }}
          />
          <div className="height-scale">
            <span>{shown(raster.min)}</span>
            <span>{isCanopy ? 'm above ground' : 'm NAVD88'}</span>
            <span>{shown(raster.max)}</span>
          </div>
        </figure>
      )}
    </section>
  )
}

type PointHeightProps = {
  field: FieldMetadata
  picked: PickedHeight | null
  onClear: () => void
}

export function PointHeight({ field, picked, onClear }: PointHeightProps) {
  return (
    <section className="panel-group">
      <h2 className="group-title">Point Height</h2>
      {picked ? (
        <div className="point-reading">
          <div className="point-value">{formatNavd88(picked.ellipsoidalHeight, field.navd88Offset)}</div>
          <dl className="survey-table point-detail">
            <dt>Ellipsoidal</dt>
            <dd>{formatEllipsoidal(picked.ellipsoidalHeight).replace(' WGS84 ellipsoid', ' (WGS84)')}</dd>
            <dt>Measured on</dt>
            <dd>{picked.source === 'mesh' ? 'Survey mesh' : 'World terrain (not survey data)'}</dd>
            <dt>Position</dt>
            <dd>{picked.latitude.toFixed(6)}, {picked.longitude.toFixed(6)}</dd>
          </dl>
          <button type="button" className="text-button" onClick={onClear}>Clear reading</button>
        </div>
      ) : (
        <p className="panel-note">Click the map to read the height at that point.</p>
      )}
      <p className="panel-note accuracy-note">
        Heights within the field are accurate to roughly 5–10&nbsp;cm relative to each other. The survey had
        no ground control points, so the whole model may sit a few metres off its true position and elevation.
      </p>
    </section>
  )
}

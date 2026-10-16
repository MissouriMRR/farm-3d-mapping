import { useEffect, useRef, useState } from 'react'
import type { FieldMetadata } from '../config/callisRoad'
import { resolveActiveSurvey } from '../config/surveys'
import {
  createFieldMap, DEFAULT_MAP_SETTINGS, type MapSettings, type PickedHeight,
} from '../map/createFieldMap'
import type { ViewMode } from '../map/camera'

export function useFieldMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const creditRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<ReturnType<typeof createFieldMap> | null>(null)
  const settingsRef = useRef(DEFAULT_MAP_SETTINGS)
  const [settings, setSettings] = useState(DEFAULT_MAP_SETTINGS)
  const [survey, setSurvey] = useState<FieldMetadata | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('3d')
  const [pickedHeight, setPickedHeight] = useState<PickedHeight | null>(null)

  useEffect(() => {
    const requests = new AbortController()
    void resolveActiveSurvey(requests.signal).then(setSurvey)
    return () => requests.abort()
  }, [])

  useEffect(() => {
    if (!survey || !containerRef.current || !creditRef.current) return

    const map = createFieldMap({
      container: containerRef.current,
      credits: creditRef.current,
      field: survey,
      onOrthophotoLoaded: () => setIsLoaded(true),
      onHeightPicked: setPickedHeight,
    })
    map.update(settingsRef.current)
    mapRef.current = map

    return () => {
      map.destroy()
      mapRef.current = null
    }
  }, [survey])

  useEffect(() => {
    settingsRef.current = settings
    mapRef.current?.update(settings)
  }, [settings])

  function updateSettings(patch: Partial<MapSettings>) {
    setSettings(current => ({ ...current, ...patch }))
  }

  function flyToField(mode: ViewMode) {
    mapRef.current?.flyToField(mode)
    setViewMode(mode)
  }

  function clearPick() {
    mapRef.current?.clearPick()
    setPickedHeight(null)
  }

  return {
    containerRef, creditRef, survey, isLoaded, settings, updateSettings, viewMode, flyToField,
    pickedHeight, clearPick,
  }
}

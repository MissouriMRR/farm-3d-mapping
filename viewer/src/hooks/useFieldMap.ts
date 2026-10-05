import { useEffect, useRef, useState } from 'react'
import { CALLIS_ROAD_METADATA } from '../config/callisRoad'
import { createFieldMap, DEFAULT_MAP_SETTINGS, type MapSettings } from '../map/createFieldMap'
import type { ViewMode } from '../map/camera'

export function useFieldMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const creditRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<ReturnType<typeof createFieldMap> | null>(null)
  const [settings, setSettings] = useState(DEFAULT_MAP_SETTINGS)
  const [isLoaded, setIsLoaded] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('3d')

  useEffect(() => {
    if (!containerRef.current || !creditRef.current) return

    const map = createFieldMap({
      container: containerRef.current,
      credits: creditRef.current,
      field: CALLIS_ROAD_METADATA,
      onOrthophotoLoaded: () => setIsLoaded(true),
    })
    mapRef.current = map

    return () => {
      map.destroy()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    mapRef.current?.update(settings)
  }, [settings])

  function updateSettings(patch: Partial<MapSettings>) {
    setSettings(current => ({ ...current, ...patch }))
  }

  function flyToField(mode: ViewMode) {
    mapRef.current?.flyToField(mode)
    setViewMode(mode)
  }

  return { containerRef, creditRef, isLoaded, settings, updateSettings, viewMode, flyToField }
}

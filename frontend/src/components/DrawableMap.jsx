import React, { useState, useRef, useEffect } from 'react'
import {
  MapContainer, TileLayer, Polygon, Rectangle, CircleMarker, useMapEvents, useMap
} from 'react-leaflet'
import L from 'leaflet'
import RiskPin from './RiskPin'
import { Square, Pentagon, RotateCcw, Check, MousePointerClick, AlertTriangle, Leaf } from 'lucide-react'

// Brand palette hex values (tailwind brand-600 / brand-500) — Leaflet path options are raw SVG
// attributes outside the Tailwind class pipeline.
const BRAND_STROKE = '#0d5c2f'
const BRAND_FILL = '#219350'

// Keeps the Leaflet view in sync with the `center` / `zoom` props. MapContainer only reads them
// on first mount, so without this, parent-driven re-centering (e.g. district presets) did nothing.
function MapViewSync({ center, zoom }) {
  const map = useMap()
  const first = useRef(true)
  const lat = Array.isArray(center) ? center[0] : undefined
  const lng = Array.isArray(center) ? center[1] : undefined
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.setView([lat, lng], zoom ?? map.getZoom())
    }
  }, [lat, lng, zoom, map])
  return null
}

// Leaflet measures its container once at mount. Inside modals / animated (scaled) containers that
// size is wrong and tiles render grey, so re-measure shortly after mount and on window resize.
function InvalidateSizeOnMount() {
  const map = useMap()
  useEffect(() => {
    const timers = [100, 400].map((ms) => setTimeout(() => map.invalidateSize(), ms))
    const onResize = () => map.invalidateSize()
    window.addEventListener('resize', onResize)
    return () => {
      timers.forEach(clearTimeout)
      window.removeEventListener('resize', onResize)
    }
  }, [map])
  return null
}

// When the map opens with an existing boundary (editing a saved farm), zoom to it once.
function FitInitialPolygon({ positions }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || !positions || positions.length < 3) return
    done.current = true
    try {
      map.fitBounds(L.latLngBounds(positions), { padding: [40, 40], maxZoom: 17 })
    } catch {
      /* invalid bounds — keep default view */
    }
  }, [positions, map])
  return null
}

// Controller component to handle user map drawing interactions
function DrawingHandler({
  drawMode,
  isDrawing,
  setIsDrawing,
  onShapeFinalized,
  onClear,
  completeLabel,
}) {
  const map = useMap()
  const [startPoint, setStartPoint] = useState(null)
  const [currentPoint, setCurrentPoint] = useState(null)
  const [polygonVertices, setPolygonVertices] = useState([])
  const controlBarRef = useRef(null)

  // Clicks on the floating control bar must not reach the map (they would add a vertex).
  const showControlBar = drawMode === 'polygon' && polygonVertices.length > 0
  useEffect(() => {
    if (showControlBar && controlBarRef.current) {
      L.DomEvent.disableClickPropagation(controlBarRef.current)
      L.DomEvent.disableScrollPropagation(controlBarRef.current)
    }
  }, [showControlBar])

  // Discard an unfinished polygon when switching tools.
  useEffect(() => {
    setPolygonVertices([])
    setStartPoint(null)
    setCurrentPoint(null)
    setIsDrawing(false)
  }, [drawMode, setIsDrawing])

  // Toggle map dragging when in drawing mode to allow smooth rectangle drag
  useEffect(() => {
    if (drawMode === 'rectangle' && isDrawing) {
      map.dragging.disable()
    } else {
      map.dragging.enable()
    }
    return () => {
      map.dragging.enable()
    }
  }, [drawMode, isDrawing, map])

  const finishRectangle = (endPoint) => {
    setIsDrawing(false)
    const start = startPoint
    setStartPoint(null)
    setCurrentPoint(null)
    if (!start || !endPoint) return

    // Ignore tiny accidental clicks (must drag at least ~0.002 degrees)
    const latDiff = Math.abs(start.lat - endPoint.lat)
    const lngDiff = Math.abs(start.lng - endPoint.lng)
    if (latDiff < 0.002 && lngDiff < 0.002) return

    const minLat = Math.min(start.lat, endPoint.lat)
    const maxLat = Math.max(start.lat, endPoint.lat)
    const minLng = Math.min(start.lng, endPoint.lng)
    const maxLng = Math.max(start.lng, endPoint.lng)

    // Standard closed GeoJSON Polygon ring: [[[lon, lat], ...]]
    onShapeFinalized?.({
      type: 'Polygon',
      coordinates: [
        [
          [minLng, minLat],
          [maxLng, minLat],
          [maxLng, maxLat],
          [minLng, maxLat],
          [minLng, minLat],
        ],
      ],
    })
  }

  useMapEvents({
    mousedown(e) {
      if (drawMode === 'rectangle') {
        setIsDrawing(true)
        setStartPoint(e.latlng)
        setCurrentPoint(e.latlng)
      }
    },
    mousemove(e) {
      if (drawMode === 'rectangle' && isDrawing && startPoint) {
        setCurrentPoint(e.latlng)
      }
    },
    mouseup(e) {
      if (drawMode === 'rectangle' && isDrawing && startPoint) {
        finishRectangle(e.latlng)
      }
    },
    // Releasing the mouse outside the map previously left the tool stuck in "drawing" state.
    mouseout() {
      if (drawMode === 'rectangle' && isDrawing && startPoint) {
        finishRectangle(currentPoint)
      }
    },
    click(e) {
      if (drawMode === 'polygon') {
        setPolygonVertices((prev) => [...prev, [e.latlng.lat, e.latlng.lng]])
      }
    },
  })

  const completePolygon = () => {
    if (polygonVertices.length < 3) return

    // Convert to GeoJSON [[[lon, lat], ...]]
    const ring = polygonVertices.map(([lat, lng]) => [lng, lat])
    ring.push(ring[0]) // Close ring

    setPolygonVertices([])
    onShapeFinalized?.({
      type: 'Polygon',
      coordinates: [ring],
    })
  }

  const undoVertex = () => setPolygonVertices((prev) => prev.slice(0, -1))

  const cancelPolygon = () => {
    setPolygonVertices([])
    onClear?.()
  }

  // Active dragging preview rectangle
  const previewBounds =
    startPoint && currentPoint
      ? [
          [Math.min(startPoint.lat, currentPoint.lat), Math.min(startPoint.lng, currentPoint.lng)],
          [Math.max(startPoint.lat, currentPoint.lat), Math.max(startPoint.lng, currentPoint.lng)],
        ]
      : null

  return (
    <>
      {/* Active dragging preview */}
      {previewBounds && (
        <Rectangle
          bounds={previewBounds}
          interactive={false}
          pathOptions={{
            color: BRAND_STROKE,
            weight: 2,
            dashArray: '5, 5',
            fillColor: BRAND_FILL,
            fillOpacity: 0.25,
          }}
        />
      )}

      {/* Polygon in-progress vertices preview */}
      {drawMode === 'polygon' && polygonVertices.length > 1 && (
        <Polygon
          positions={polygonVertices}
          interactive={false}
          pathOptions={{
            color: BRAND_STROKE,
            weight: 2,
            dashArray: '4, 4',
            fillColor: BRAND_FILL,
            fillOpacity: 0.2,
          }}
        />
      )}
      {drawMode === 'polygon' &&
        polygonVertices.map((pt, i) => (
          <CircleMarker
            key={`${i}-${pt[0]}-${pt[1]}`}
            center={pt}
            radius={5}
            interactive={false}
            pathOptions={{ color: '#ffffff', weight: 2, fillColor: BRAND_STROKE, fillOpacity: 1 }}
          />
        ))}

      {/* Floating Polygon Control Bar during point drawing */}
      {showControlBar && (
        <div
          ref={controlBarRef}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto max-w-[calc(100%-2rem)]"
        >
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-stone-200 p-2 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs font-bold text-stone-700 px-2">
              {polygonVertices.length} point{polygonVertices.length === 1 ? '' : 's'}
              {polygonVertices.length < 3 && ' (need 3+)'}
            </span>
            <button
              type="button"
              onClick={completePolygon}
              disabled={polygonVertices.length < 3}
              className="btn-primary py-1 px-3 text-xs flex items-center gap-1 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Check size={12} /> {completeLabel}
            </button>
            <button
              type="button"
              onClick={undoVertex}
              className="btn-secondary py-1 px-2 text-xs flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={cancelPolygon}
              className="btn-secondary py-1 px-2 text-xs flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <RotateCcw size={12} /> Reset
            </button>
          </div>
        </div>
      )}
    </>
  )
}

const TOOL_BTN = 'px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'

export default function DrawableMap({
  center = [9.9252, 78.1198], // Center of Tamil Nadu agricultural belt
  zoom = 9,
  farms = [],
  finalizedPolygon = null,
  onShapeFinalized,
  onClear,
  colorMode = 'pest',
  onChangeColorMode,
  // Context-specific copy: the regional scan uses "scan zone"; farm boundary drawing passes its own.
  completeLabel = 'Scan Zone',
  rectangleHint = 'Click & drag across the map to select a zone',
  polygonHint = 'Tap points to trace the perimeter',
  // The pest / NDVI layer switcher only makes sense when farm pins are shown.
  showLayerSwitcher = true,
  className = '',
}) {
  const [drawMode, setDrawMode] = useState('rectangle') // 'rectangle' | 'polygon'
  const [isDrawing, setIsDrawing] = useState(false)
  const [internalColorMode, setInternalColorMode] = useState(colorMode)

  useEffect(() => {
    setInternalColorMode(colorMode)
  }, [colorMode])

  const handleColorModeChange = (mode) => {
    setInternalColorMode(mode)
    if (onChangeColorMode) {
      onChangeColorMode(mode)
    }
  }

  // Convert GeoJSON coordinates [[[lon, lat], ...]] to Leaflet [[lat, lon], ...]
  const ring = finalizedPolygon?.coordinates?.[0]
  const leafletPolygonPositions = Array.isArray(ring) && ring.length >= 3
    ? ring.map(([lon, lat]) => [lat, lon])
    : null

  return (
    <div className={`relative w-full h-full min-h-[420px] sm:min-h-[560px] rounded-3xl overflow-hidden border border-stone-200 shadow-inner ${className}`}>
      {/* Interactive Drawing & Layer Toolbar */}
      <div className="absolute top-3 left-3 right-3 sm:right-auto z-[1000] flex flex-wrap items-center gap-2">
        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-stone-200/90 p-1.5 flex flex-wrap items-center gap-1 text-xs">
          <button
            type="button"
            aria-pressed={drawMode === 'rectangle'}
            onClick={() => setDrawMode('rectangle')}
            className={`${TOOL_BTN} ${
              drawMode === 'rectangle'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            <Square size={14} /> Rectangle
          </button>

          <button
            type="button"
            aria-pressed={drawMode === 'polygon'}
            onClick={() => setDrawMode('polygon')}
            className={`${TOOL_BTN} ${
              drawMode === 'polygon'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            <Pentagon size={14} /> Polygon
          </button>

          {finalizedPolygon && (
            <button
              type="button"
              onClick={() => onClear?.()}
              className="px-2.5 py-1.5 rounded-xl text-stone-600 hover:text-stone-800 hover:bg-stone-100 font-medium flex items-center gap-1 ml-1 border-l border-stone-200 pl-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <RotateCcw size={13} /> Clear
            </button>
          )}
        </div>

        {/* Data Layer Color-Scale Switcher: Pest Outbreak vs NDVI Vegetation Health */}
        {showLayerSwitcher && (
          <div className="bg-stone-900/90 backdrop-blur-md text-white rounded-2xl shadow-lg border border-stone-700/80 p-1 flex items-center text-xs">
            <button
              type="button"
              aria-pressed={internalColorMode === 'pest'}
              onClick={() => handleColorModeChange('pest')}
              className={`${TOOL_BTN} ${
                internalColorMode === 'pest'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-stone-300 hover:text-white'
              }`}
            >
              <AlertTriangle size={13} /> Pest Risk
            </button>
            <button
              type="button"
              aria-pressed={internalColorMode === 'vegetation'}
              onClick={() => handleColorModeChange('vegetation')}
              className={`${TOOL_BTN} ${
                internalColorMode === 'vegetation'
                  ? 'bg-green-700 text-white shadow-sm'
                  : 'text-stone-300 hover:text-white'
              }`}
            >
              <Leaf size={13} /> NDVI
            </button>
          </div>
        )}
      </div>

      {/* Helper Instructional Banner */}
      <div className="hidden sm:flex absolute top-3 right-3 z-[1000] bg-stone-900/80 backdrop-blur-sm text-white rounded-xl px-3 py-1.5 text-xs font-medium shadow-md items-center gap-1.5 pointer-events-none">
        <MousePointerClick size={13} className="text-brand-300" />
        {drawMode === 'rectangle' ? rectangleHint : polygonHint}
      </div>

      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={true}
        className="absolute inset-0 w-full h-full"
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        />

        <InvalidateSizeOnMount />
        <MapViewSync center={center} zoom={zoom} />
        <FitInitialPolygon positions={leafletPolygonPositions} />

        {/* User Drawing Handler */}
        <DrawingHandler
          drawMode={drawMode}
          isDrawing={isDrawing}
          setIsDrawing={setIsDrawing}
          onShapeFinalized={onShapeFinalized}
          onClear={onClear}
          completeLabel={completeLabel}
        />

        {/* Finalized Active Polygon Layer */}
        {leafletPolygonPositions && (
          <Polygon
            positions={leafletPolygonPositions}
            pathOptions={{
              color: BRAND_STROKE,
              weight: 2.5,
              fillColor: BRAND_FILL,
              fillOpacity: 0.18,
            }}
          />
        )}

        {/* Farm Markers Inside Polygon */}
        {(farms || []).map((f, i) => (
          <RiskPin key={f.farm_id || f.id || i} farm={f} colorMode={internalColorMode} />
        ))}
      </MapContainer>

      {/* Mobile hint (the desktop banner is hidden on narrow screens to keep the toolbar readable) */}
      {drawMode === 'rectangle' && (
        <div className="sm:hidden absolute bottom-6 left-3 right-3 z-[999] bg-stone-900/80 text-white rounded-xl px-3 py-1.5 text-xs font-medium text-center pointer-events-none">
          On a touch screen, choose Polygon and tap the corners of your field.
        </div>
      )}
    </div>
  )
}

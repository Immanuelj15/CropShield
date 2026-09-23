import React, { useState, useRef, useEffect } from 'react'
import {
  MapContainer, TileLayer, Polygon, Rectangle, useMapEvents, useMap
} from 'react-leaflet'
import L from 'leaflet'
import RiskPin from './RiskPin'
import { Square, Pentagon, RotateCcw, Check, MousePointerClick } from 'lucide-react'

// Controller component to handle user map drawing interactions
function DrawingHandler({
  drawMode,
  isDrawing,
  setIsDrawing,
  onShapeFinalized,
  finalizedPolygon,
  onClear,
}) {
  const map = useMap()
  const [startPoint, setStartPoint] = useState(null)
  const [currentPoint, setCurrentPoint] = useState(null)
  const [polygonVertices, setPolygonVertices] = useState([])

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
        setIsDrawing(false)
        const endPoint = e.latlng

        // Ignore tiny accidental clicks (must drag at least ~0.002 degrees)
        const latDiff = Math.abs(startPoint.lat - endPoint.lat)
        const lngDiff = Math.abs(startPoint.lng - endPoint.lng)
        if (latDiff < 0.002 && lngDiff < 0.002) {
          setStartPoint(null)
          setCurrentPoint(null)
          return
        }

        const minLat = Math.min(startPoint.lat, endPoint.lat)
        const maxLat = Math.max(startPoint.lat, endPoint.lat)
        const minLng = Math.min(startPoint.lng, endPoint.lng)
        const maxLng = Math.max(startPoint.lng, endPoint.lng)

        // Standard closed GeoJSON Polygon ring: [[[lon, lat], ...]]
        const coordinates = [
          [
            [minLng, minLat],
            [maxLng, minLat],
            [maxLng, maxLat],
            [minLng, maxLat],
            [minLng, minLat],
          ],
        ]

        setStartPoint(null)
        setCurrentPoint(null)

        onShapeFinalized({
          type: 'Polygon',
          coordinates,
        })
      }
    },
    click(e) {
      if (drawMode === 'polygon') {
        const newPt = [e.latlng.lat, e.latlng.lng]
        const updated = [...polygonVertices, newPt]
        setPolygonVertices(updated)
      }
    },
  })

  const completePolygon = () => {
    if (polygonVertices.length < 3) return

    // Convert to GeoJSON [[[lon, lat], ...]]
    const ring = polygonVertices.map(([lat, lng]) => [lng, lat])
    ring.push(ring[0]) // Close ring

    setPolygonVertices([])
    onShapeFinalized({
      type: 'Polygon',
      coordinates: [ring],
    })
  }

  const cancelPolygon = () => {
    setPolygonVertices([])
    onClear()
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
          pathOptions={{
            color: '#059669',
            weight: 2,
            dashArray: '5, 5',
            fillColor: '#10b981',
            fillOpacity: 0.25,
          }}
        />
      )}

      {/* Polygon in-progress vertices preview */}
      {drawMode === 'polygon' && polygonVertices.length > 0 && (
        <Polygon
          positions={polygonVertices}
          pathOptions={{
            color: '#059669',
            weight: 2,
            dashArray: '4, 4',
            fillColor: '#10b981',
            fillOpacity: 0.2,
          }}
        />
      )}

      {/* Floating Polygon Control Bar during point drawing */}
      {drawMode === 'polygon' && polygonVertices.length > 0 && (
        <div className="leaflet-top leaflet-right mt-16 mr-4 z-[999] pointer-events-auto">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-stone-200 p-2 flex items-center gap-2">
            <span className="text-xs font-bold text-stone-700 px-2">
              {polygonVertices.length} Vertices
            </span>
            <button
              onClick={completePolygon}
              disabled={polygonVertices.length < 3}
              className="btn-primary py-1 px-3 text-xs flex items-center gap-1 shadow-sm"
            >
              <Check size={12} /> Scan Zone
            </button>
            <button
              onClick={cancelPolygon}
              className="btn-secondary py-1 px-2 text-xs flex items-center gap-1"
            >
              <RotateCcw size={12} /> Reset
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default function DrawableMap({
  center = [9.9252, 78.1198], // Center of Tamil Nadu agricultural belt
  zoom = 9,
  farms = [],
  finalizedPolygon = null,
  onShapeFinalized,
  onClear,
}) {
  const [drawMode, setDrawMode] = useState('rectangle') // 'rectangle' | 'polygon'
  const [isDrawing, setIsDrawing] = useState(false)

  // Convert GeoJSON coordinates [[[lon, lat], ...]] to Leaflet [[lat, lon], ...]
  const leafletPolygonPositions = finalizedPolygon
    ? finalizedPolygon.coordinates[0].map(([lon, lat]) => [lat, lon])
    : null

  return (
    <div className="relative w-full h-full min-h-[580px] rounded-3xl overflow-hidden border border-stone-200 shadow-inner">
      {/* Interactive Drawing Toolbar */}
      <div className="absolute top-4 left-4 z-[990] bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-stone-200/90 p-1.5 flex items-center gap-1 text-xs">
        <button
          onClick={() => setDrawMode('rectangle')}
          className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
            drawMode === 'rectangle'
              ? 'bg-emerald-700 text-white shadow-sm'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <Square size={14} /> Drag Rectangle
        </button>

        <button
          onClick={() => setDrawMode('polygon')}
          className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
            drawMode === 'polygon'
              ? 'bg-emerald-700 text-white shadow-sm'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <Pentagon size={14} /> Polygon Points
        </button>

        {finalizedPolygon && (
          <button
            onClick={onClear}
            className="px-2.5 py-1.5 rounded-xl text-stone-500 hover:text-stone-800 hover:bg-stone-100 font-medium flex items-center gap-1 ml-1 border-l border-stone-200 pl-2"
          >
            <RotateCcw size={13} /> Clear
          </button>
        )}
      </div>

      {/* Helper Instructional Banner */}
      <div className="absolute top-4 right-4 z-[990] bg-black/75 backdrop-blur-sm text-white rounded-xl px-3 py-1.5 text-[11px] font-medium shadow-md flex items-center gap-1.5 pointer-events-none">
        <MousePointerClick size={13} className="text-emerald-400" />
        {drawMode === 'rectangle'
          ? 'Click & drag across map to scan zone'
          : 'Tap multiple points to trace perimeter'}
      </div>

      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={true}
        className="w-full h-full min-h-[580px]"
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />

        {/* User Drawing Handler */}
        <DrawingHandler
          drawMode={drawMode}
          isDrawing={isDrawing}
          setIsDrawing={setIsDrawing}
          onShapeFinalized={onShapeFinalized}
          finalizedPolygon={finalizedPolygon}
          onClear={onClear}
        />

        {/* Finalized Active Polygon Layer */}
        {leafletPolygonPositions && (
          <Polygon
            positions={leafletPolygonPositions}
            pathOptions={{
              color: '#047857',
              weight: 2.5,
              fillColor: '#10b981',
              fillOpacity: 0.18,
            }}
          />
        )}

        {/* Farm Markers Inside Polygon */}
        {farms.map((f) => (
          <RiskPin key={f.farm_id} farm={f} />
        ))}
      </MapContainer>
    </div>
  )
}

import type { StyleSpecification } from 'maplibre-gl'

export function monochromeStreets(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.flatMap<StyleSpecification['layers'][number]>(layer => {
      if (layer.type === 'background') return [{ ...layer, paint: { 'background-color': '#e9eae8' } }]
      if (layer.type === 'fill') {
        if (layer.id === 'water') return [{ ...layer, paint: { 'fill-color': '#b9d9eb' } }]
        if (layer.id === 'park' || layer.id === 'landcover_wood') {
          return [{ ...layer, paint: { 'fill-color': '#c8dfc7' } }]
        }
      }
      if (layer.type === 'line' && /^waterway_(river|other)$/.test(layer.id)) {
        return [{ ...layer, paint: { ...layer.paint, 'line-color': '#afd1e5' } }]
      }
      if (layer.type === 'line' && /^(road|bridge|tunnel)_/.test(layer.id) && !/rail/.test(layer.id)) {
        const major = /motorway|trunk|primary|secondary_tertiary/.test(layer.id)
        const casing = layer.id.endsWith('_casing')
        if (casing && !major) return []
        const color = casing ? '#aeb6bb' : major ? '#ffffff' : '#f9faf8'
        const width = casing ? [3, 7, 15, 26] : major ? [2, 5, 12, 22] : [1, 3, 8, 15]
        return [{
          ...layer,
          paint: {
            ...layer.paint,
            'line-color': color,
            'line-width': ['interpolate', ['linear'], ['zoom'], 12, width[0], 15, width[1], 17, width[2], 19, width[3]],
          },
        }]
      }
      if (layer.type === 'symbol' && layer.id.startsWith('poi_')) {
        const transit = layer.id === 'poi_transit'
        return [{
          ...layer,
          minzoom: transit ? 14 : layer.id === 'poi_r1' ? 14 : layer.minzoom,
          layout: {
            ...layer.layout,
            'icon-size': ['interpolate', ['linear'], ['zoom'], 13, transit ? 0.42 : 0.5, 17, transit ? 0.64 : 0.72],
            'text-field': ['step', ['zoom'], '', 15, ['coalesce', ['get', 'name'], '']],
            'text-optional': true,
          },
          paint: { ...layer.paint, 'text-color': '#525252' },
        }, ...(transit ? [{
          ...layer,
          id: 'fuel-stations',
          minzoom: 14,
          filter: ['==', ['get', 'class'], 'fuel'] as ['==', ['get', string], string],
          layout: { 'icon-image': 'fuel', 'icon-size': 0.65 },
        }] : [])]
      }
      if (layer.type === 'symbol' && /^(highway-name-|label_)/.test(layer.id)) {
        return [{
          ...layer,
          layout: layer.id.startsWith('highway-name-') ? {
            ...layer.layout,
            'symbol-placement': 'line',
            'text-rotation-alignment': 'map',
            'text-pitch-alignment': 'viewport',
            'text-size': ['interpolate', ['linear'], ['zoom'], 13, 12, 17, 15, 19, 16],
            'text-max-width': 14,
            'text-padding': 6,
            'text-offset': [0, -.55],
          } : { ...layer.layout, 'text-pitch-alignment': 'viewport' },
          paint: { ...layer.paint, 'text-color': '#3f494f', 'text-halo-color': '#ffffff', 'text-halo-width': 1.25 },
        }]
      }
      return []
    }),
  }
}



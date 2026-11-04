// Геометрия карты: us-atlas (states TopoJSON) + d3-geo geoAlbersUsa. Считается один раз при загрузке модуля.
import { geoAlbersUsa, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';
import topo from 'us-atlas/states-10m.json';

export const MAP_W = 975;
export const MAP_H = 610;

/** FIPS -> USPS. */
const FIPS: Record<string, string> = {
	'01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '12': 'FL', '13': 'GA',
	'15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD',
	'25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ',
	'35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC',
	'46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY'
};

export interface MapState {
	id: string;
	d: string;
	cx: number;
	cy: number;
}

function build(): MapState[] {
	const t = topo as unknown as Topology;
	const fc = feature(t, t.objects.states as GeometryCollection) as unknown as FeatureCollection<Geometry>;
	const projection = geoAlbersUsa().fitSize([MAP_W, MAP_H], fc);
	const path = geoPath(projection);
	const out: MapState[] = [];
	for (const f of fc.features) {
		const id = FIPS[String(f.id).padStart(2, '0')];
		const d = path(f);
		if (!id || !d) continue;
		const [cx, cy] = path.centroid(f);
		out.push({ id, d, cx, cy });
	}
	return out;
}

export const MAP_STATES: MapState[] = build();

// ─── wrap-utils.js ────────────────────────────────────────────────────────────
// Shared constants, colour helpers, and API fetch utility.
// No React imports — plain JS only.

export const API_BASE = "http://localhost:8080";

export const VEG_TYPES = [
	{ label: "Afromontane Forest", color: "#1a4a2e" },
	{ label: "Grassland", color: "#7a8c2a" },
	{ label: "Shrubland", color: "#5a6b1a" },
	{ label: "Bare Soil", color: "#8a7355" },
	{ label: "Cropland", color: "#a0b840" },
	{ label: "Water", color: "#1a3a5c" },
	{ label: "Built-up", color: "#4a4a4a" },
];

// Damage potential: 0 → dark grey, 0.5 → amber, 1 → red
export function damageColor(v) {
	if (v < 0.5) {
		const t = v * 2;
		return [Math.round(40 + t * 192), Math.round(40 + t * 98), 40];
	}
	const t = (v - 0.5) * 2;
	return [Math.round(232 - t * 40), Math.round(138 - t * 138), 0];
}

// Ignition likelihood: semi-transparent blue-purple overlay
export function ignitionColor(v) {
	return [60, 80, 200, Math.round(v * 180)];
}

// Vegetation ordinal → RGBA
export function vegColor(ordinal) {
	const hex = VEG_TYPES[ordinal]?.color ?? "#333333";
	return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 200];
}

// Generic API fetch — throws on non-2xx
export async function apiFetch(path, opts = {}) {
	const res = await fetch(`${API_BASE}${path}`, {
		headers: { "Content-Type": "application/json" },
		...opts,
	});
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
	return res.json();
}

// Convert canvas pixel coordinates to a GeoJSON Polygon string
// Points are in pixel space [col, row] matching PerimeterPolygonExtractorService output
export function pixelPointsToGeoJson(points) {
	if (points.length < 3) return null;
	const ring = [...points, points[0]]; // close the ring
	return JSON.stringify({
		type: "Feature",
		geometry: {
			type: "Polygon",
			coordinates: [ring.map(([x, y]) => [x, y])],
		},
		properties: {},
	});
}

// Decode a cell index to [row, col]
export function decodeIndex(idx, cols) {
	return [Math.floor(idx / cols), idx % cols];
}

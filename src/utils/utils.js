// ─── wrap-utils.js ────────────────────────────────────────────────────────────

export const API_BASE = "http://localhost:8080";

export const VEG_TYPES = [
	{ label: "Afromontane Forest", natural: "#1a6b3a", highContrast: "#2dd4bf" },
	{ label: "Grassland", natural: "#8aad2a", highContrast: "#facc15" },
	{ label: "Shrubland", natural: "#5a7a1a", highContrast: "#a78bfa" },
	{ label: "Bare Soil", natural: "#8a7355", highContrast: "#d97706" },
	{ label: "Cropland", natural: "#b0c840", highContrast: "#86efac" },
	{ label: "Water", natural: "#1a3a6c", highContrast: "#38bdf8" },
	{ label: "Built-up", natural: "#5a5a5a", highContrast: "#f472b6" },
];

export function vegHex(ordinal, mode = "natural") {
	return VEG_TYPES[ordinal]?.[mode] ?? "#333333";
}

export function damageColor(v) {
	if (v < 0.5) {
		const t = v * 2;
		return [Math.round(40 + t * 192), Math.round(40 + t * 98), 40];
	}
	const t = (v - 0.5) * 2;
	return [Math.round(232 - t * 40), Math.round(138 - t * 138), 0];
}
export function ignitionColor(v) {
	// Only cells with I(c) above ~0.35 get meaningful colour.
	// Below that threshold the overlay is transparent — not a uniform blue wash.
	// Above it, scales from faint to saturated blue-amber at 1.0.
	if (v < 0.35) return [60, 80, 200, 0];
	const t = (v - 0.35) / 0.65; // 0→1 over the 0.35–1.0 range
	return [60, 80, 200, Math.round(t * 160)];
}
export function vegColor(ordinal, mode = "natural") {
	const hex = vegHex(ordinal, mode);
	return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 200];
}

export async function apiFetch(path, opts = {}) {
	const res = await fetch(`${API_BASE}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
	return res.json();
}

// ─── Pixel ↔ UTM (EPSG:32737) ────────────────────────────────────────────────
// Canvas draw coords are [col, row] in data-space cells (before zoom/pan).
// UTM: minX=west edge, maxY=north edge, row 0 = northernmost.
export function pixelToUtm(col, row, session) {
	return [session.minX + (col + 0.5) * session.cellSizeMetres, session.maxY - (row + 0.5) * session.cellSizeMetres];
}

// Convert canvas draw points → GeoJSON Polygon in UTM metres.
// session is required so coordinates are in the correct spatial reference.
export function pixelPointsToGeoJson(points, session) {
	if (points.length < 3) return null;
	const coordinates = session ? points.map(([x, y]) => pixelToUtm(x, y, session)) : points.map(([x, y]) => [x, y]);
	const ring = [...coordinates, coordinates[0]];
	return JSON.stringify({ type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: {} });
}

// ─── Marching-squares contour builder ────────────────────────────────────────
// EDGE_TABLE[caseIndex] = array of [edgeA, edgeB] pairs.
// Edges: 0=top, 1=right, 2=bottom, 3=left.
// Case bits (MSB→LSB): TL TR BR BL — bit set if value >= level.
const EDGE_TABLE = [
	[],
	[[3, 0]],
	[[0, 1]],
	[[3, 1]],
	[[1, 2]],
	[
		[3, 0],
		[1, 2],
	],
	[[0, 2]],
	[[3, 2]],
	[[2, 3]],
	[[2, 0]],
	[
		[0, 1],
		[2, 3],
	],
	[[2, 1]],
	[[1, 3]],
	[[1, 0]],
	[[0, 3]],
	[],
];

function edgeMidpoint(edge, tl, tr, bl, br, level) {
	switch (edge) {
		case 0: {
			const t = (level - tl) / (tr - tl || 1e-9);
			return [t, 0];
		}
		case 1: {
			const t = (level - tr) / (br - tr || 1e-9);
			return [1, t];
		}
		case 2: {
			const t = (level - bl) / (br - bl || 1e-9);
			return [t, 1];
		}
		case 3: {
			const t = (level - tl) / (bl - tl || 1e-9);
			return [0, t];
		}
		default:
			return [0.5, 0.5];
	}
}

export function buildContours(elevFlat, rows, cols, levels) {
	if (!elevFlat || elevFlat.length === 0) return [];
	const elev = (r, c) => elevFlat[r * cols + c] ?? 0;
	return levels.map((level) => {
		const segments = [];
		for (let r = 0; r < rows - 1; r++) {
			for (let c = 0; c < cols - 1; c++) {
				const tl = elev(r, c),
					tr = elev(r, c + 1),
					bl = elev(r + 1, c),
					br = elev(r + 1, c + 1);
				const idx = (tl >= level ? 8 : 0) | (tr >= level ? 4 : 0) | (br >= level ? 2 : 0) | (bl >= level ? 1 : 0);
				const edges = EDGE_TABLE[idx];
				for (let i = 0; i < edges.length; i++) {
					const [eA, eB] = edges[i];
					const [ax, ay] = edgeMidpoint(eA, tl, tr, bl, br, level);
					const [bx, by] = edgeMidpoint(eB, tl, tr, bl, br, level);
					segments.push([
						[c + ax, r + ay],
						[c + bx, r + by],
					]);
				}
			}
		}
		return { level, segments };
	});
}

export function contourLevels(elevFlat, intervalM = 50) {
	if (!elevFlat || elevFlat.length === 0) return [];
	let min = Infinity,
		max = -Infinity;
	for (let i = 0; i < elevFlat.length; i++) {
		if (elevFlat[i] < min) min = elevFlat[i];
		if (elevFlat[i] > max) max = elevFlat[i];
	}
	const start = Math.ceil(min / intervalM) * intervalM,
		end = Math.floor(max / intervalM) * intervalM;
	const levels = [];
	for (let l = start; l <= end; l += intervalM) levels.push(l);
	return levels;
}

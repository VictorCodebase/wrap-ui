// ─── wrap-canvas.jsx ──────────────────────────────────────────────────────────
// Rendering layers in order (bottom → top):
//   1. Terrain base  — vegetation colours + elevation shading (always, from gridEnv)
//   2. Topo contours — marching-squares lines over terrain (optional toggle)
//   3. Heatmap       — damage potential overlay (after Phase 1 run)
//   4. Fire perimeter— glowing orange outline (after Phase 2 run)
//   5. Draw overlay  — SVG vertex placement (during draw mode)

import { useEffect, useRef, useCallback, useState } from "react";
import { damageColor, ignitionColor, vegColor, buildContours, contourLevels } from "./utils/utils.js";

// ─── Draw mode SVG overlay ────────────────────────────────────────────────────
function DrawOverlay({ width, height, onPolygon, onCancel, transform }) {
	const [points, setPoints] = useState([]);
	const svgRef = useRef(null);

	const toDataCoords = (screenX, screenY) => [(screenX - transform.offsetX) / transform.scale, (screenY - transform.offsetY) / transform.scale];

	const handleClick = (e) => {
		if (e.detail === 2) return;
		const rect = svgRef.current.getBoundingClientRect();
		const [x, y] = toDataCoords(e.clientX - rect.left, e.clientY - rect.top);
		setPoints((prev) => [...prev, [x, y]]);
	};

	const handleDblClick = (e) => {
		e.preventDefault();
		if (points.length >= 3) {
			onPolygon(points);
			setPoints([]);
		}
	};

	const toScreen = ([x, y]) => [x * transform.scale + transform.offsetX, y * transform.scale + transform.offsetY];
	const screenPoints = points.map(toScreen);
	const polyline = screenPoints.map((p) => p.join(",")).join(" ");

	return (
		<div className="absolute inset-0 z-10" style={{ cursor: "crosshair" }}>
			<div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black bg-opacity-80 border border-amber-700 px-3 py-1.5 font-mono text-xs text-amber-300 pointer-events-none z-20 whitespace-nowrap">
				DRAW IGNITION ZONE — Click to place vertices · Double-click to close
			</div>
			<svg
				ref={svgRef}
				width={width}
				height={height}
				className="absolute inset-0"
				onClick={handleClick}
				onDoubleClick={handleDblClick}
				style={{ touchAction: "none" }}
			>
				{screenPoints.length >= 3 && (
					<polygon points={polyline} fill="rgba(232,138,0,0.15)" stroke="#e88a00" strokeWidth="1.5" strokeDasharray="4 2" />
				)}
				{screenPoints.length >= 2 && screenPoints.length < 3 && (
					<polyline points={polyline} fill="none" stroke="#e88a00" strokeWidth="1.5" strokeDasharray="4 2" />
				)}
				{screenPoints.map(([x, y], i) => (
					<circle key={i} cx={x} cy={y} r={4} fill="#e88a00" stroke="#0d0d0d" strokeWidth={1} />
				))}
			</svg>
			<div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex gap-2 z-20">
				<button
					onClick={() => setPoints((p) => p.slice(0, -1))}
					disabled={points.length === 0}
					className="px-3 py-1 bg-neutral-900 border border-neutral-600 text-neutral-300 font-mono text-xs hover:border-neutral-400 disabled:opacity-30"
				>
					UNDO
				</button>
				<button
					onClick={() => {
						if (points.length >= 3) {
							onPolygon(points);
							setPoints([]);
						}
					}}
					disabled={points.length < 3}
					className="px-3 py-1 bg-amber-900 border border-amber-600 text-amber-100 font-mono text-xs hover:bg-amber-800 disabled:opacity-30"
				>
					CLOSE ({points.length} pts)
				</button>
				<button
					onClick={() => {
						setPoints([]);
						onCancel();
					}}
					className="px-3 py-1 bg-neutral-900 border border-red-800 text-red-400 font-mono text-xs hover:border-red-600"
				>
					CANCEL
				</button>
			</div>
		</div>
	);
}

// ─── Main GridCanvas ──────────────────────────────────────────────────────────
export default function GridCanvas({
	session,
	gridEnv,
	phase1Result,
	phase2Result,
	showIgnition,
	showHeatmap,
	showVeg,
	showTopo,
	vegPalette,
	playStep,
	analytics,
	drawMode,
	onDrawComplete,
	onDrawCancel,
	drawnPoints,
	transform,
	onDragStart,
	onDragMove,
	onDragEnd,
}) {
	const canvasRef = useRef(null);
	const containerRef = useRef(null);
	const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
	const contoursRef = useRef([]);

	useEffect(() => {
		if (!showTopo || !gridEnv?.elevationMetres) {
			contoursRef.current = [];
			return;
		}
		const levels = contourLevels(gridEnv.elevationMetres, 50);
		contoursRef.current = buildContours(gridEnv.elevationMetres, gridEnv.rows, gridEnv.cols, levels);
	}, [gridEnv, showTopo]);

	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		const W = canvas.width;
		const H = canvas.height;

		ctx.fillStyle = "#0a0a0a";
		ctx.fillRect(0, 0, W, H);

		const { scale, offsetX, offsetY } = transform;
		ctx.save();
		ctx.translate(offsetX, offsetY);
		ctx.scale(scale, scale);

		const rows = gridEnv?.rows ?? session?.rows;
		const cols = gridEnv?.cols ?? session?.cols;

		if (!rows || !cols) {
			for (let x = 20; x < W / scale; x += 20)
				for (let y = 20; y < H / scale; y += 20) {
					ctx.fillStyle = "#1a1a1a";
					ctx.fillRect(x, y, 1, 1);
				}
			ctx.fillStyle = "#2a2a2a";
			ctx.font = `${11 / scale}px monospace`;
			ctx.textAlign = "center";
			ctx.fillText("AWAITING SESSION DATA", W / scale / 2, H / scale / 2);
			ctx.restore();
			return;
		}

		const dataW = W / scale;
		const dataH = H / scale;
		const cellW = dataW / cols;
		const cellH = dataH / rows;

		// LAYER 1 — terrain base
		if (gridEnv) {
			const { vegetationTypeOrdinals: veg, elevationMetres: elev } = gridEnv;
			let eMin = Infinity,
				eMax = -Infinity;
			for (let i = 0; i < elev.length; i++) {
				if (elev[i] < eMin) eMin = elev[i];
				if (elev[i] > eMax) eMax = elev[i];
			}
			const eRange = eMax - eMin || 1;

			const offW = Math.max(1, Math.ceil(dataW));
			const offH = Math.max(1, Math.ceil(dataH));
			const img = ctx.createImageData(offW, offH);
			const d = img.data;

			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					const idx = r * cols + c;
					const px = Math.floor(c * cellW),
						py = Math.floor(r * cellH);
					const pw = Math.max(1, Math.ceil(cellW)),
						ph = Math.max(1, Math.ceil(cellH));
					const [vr, vg, vb] = vegColor(veg[idx], vegPalette);
					const shade = 0.6 + 0.4 * ((elev[idx] - eMin) / eRange);
					const fr = Math.round(vr * shade),
						fg = Math.round(vg * shade),
						fb = Math.round(vb * shade);
					for (let dy = 0; dy < ph && py + dy < offH; dy++)
						for (let dx = 0; dx < pw && px + dx < offW; dx++) {
							const pi = ((py + dy) * offW + (px + dx)) * 4;
							d[pi] = fr;
							d[pi + 1] = fg;
							d[pi + 2] = fb;
							d[pi + 3] = 255;
						}
				}
			}
			const tmp = document.createElement("canvas");
			tmp.width = offW;
			tmp.height = offH;
			tmp.getContext("2d").putImageData(img, 0, 0);
			ctx.drawImage(tmp, 0, 0, offW, offH);
		}

		// LAYER 2 — topographic contours
		if (showTopo && contoursRef.current.length > 0) {
			contoursRef.current.forEach(({ level, segments }) => {
				const isMajor = level % 200 === 0;
				ctx.strokeStyle = isMajor ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.14)";
				ctx.lineWidth = (isMajor ? 1.0 : 0.5) / scale;
				segments.forEach(([[ax, ay], [bx, by]]) => {
					ctx.beginPath();
					ctx.moveTo(ax * cellW, ay * cellH);
					ctx.lineTo(bx * cellW, by * cellH);
					ctx.stroke();
				});
			});
		}

		// LAYER 3 — Phase 1 heatmap (only when showHeatmap is true)
		// When showHeatmap is off but showIgnition is on, we still render ignition
		// hotspots directly over the terrain base — so the officer sees only hotspot
		// locations without the damage colouring obscuring the terrain.
		if (phase1Result && (showHeatmap || showIgnition)) {
			const { rows: pR, cols: pC, damagePotentialValues: dmg, ignitionProbabilityValues: ign, vegetationTypeOrdinals: veg } = phase1Result;
			const offW = Math.max(1, Math.ceil(dataW)),
				offH = Math.max(1, Math.ceil(dataH));
			const cW = offW / pC,
				cH = offH / pR;
			const img = ctx.createImageData(offW, offH);
			const d = img.data;

			for (let r = 0; r < pR; r++) {
				for (let c = 0; c < pC; c++) {
					const idx = r * pC + c;
					const px = Math.floor(c * cW),
						py = Math.floor(r * cH);
					const pw = Math.max(1, Math.ceil(cW)),
						ph = Math.max(1, Math.ceil(cH));

					// Heatmap base — only if showHeatmap is on
					let fr = 0,
						fg = 0,
						fb = 0,
						fa = 0;
					if (showHeatmap) {
						const [rr, gg, bb] = damageColor(dmg[idx]);
						fr = rr;
						fg = gg;
						fb = bb;
						fa = 204; // 80% opacity
						if (showVeg) {
							const [vr, vg_, vb] = vegColor(veg[idx], vegPalette);
							const va = 0.45;
							fr = Math.round(fr * (1 - va) + vr * va);
							fg = Math.round(fg * (1 - va) + vg_ * va);
							fb = Math.round(fb * (1 - va) + vb * va);
						}
					}

					// Ignition hotspot overlay — applied regardless of showHeatmap
					if (showIgnition && ign) {
						const [ir, ig_, ib, ia] = ignitionColor(ign[idx]);
						if (ia > 0) {
							const a = ia / 255;
							fr = Math.round(fr * (1 - a) + ir * a);
							fg = Math.round(fg * (1 - a) + ig_ * a);
							fb = Math.round(fb * (1 - a) + ib * a);
							fa = Math.max(fa, ia);
						}
					}

					if (fa === 0) continue; // fully transparent — leave terrain showing

					const ha = fa / 255;
					for (let dy = 0; dy < ph && py + dy < offH; dy++)
						for (let dx = 0; dx < pw && px + dx < offW; dx++) {
							const pi = ((py + dy) * offW + (px + dx)) * 4;
							d[pi] = Math.round(d[pi] * (1 - ha) + fr * ha);
							d[pi + 1] = Math.round(d[pi + 1] * (1 - ha) + fg * ha);
							d[pi + 2] = Math.round(d[pi + 2] * (1 - ha) + fb * ha);
							d[pi + 3] = 255;
						}
				}
			}
			const tmp = document.createElement("canvas");
			tmp.width = offW;
			tmp.height = offH;
			tmp.getContext("2d").putImageData(img, 0, 0);
			ctx.drawImage(tmp, 0, 0, offW, offH);

			// LAYER 3b — top ignition seed markers
			if (analytics?.topIgnitionSeeds && (phase1Result.cols ?? cols)) {
				const pCols = phase1Result.cols ?? cols;
				analytics.topIgnitionSeeds.forEach((encoded, i) => {
					const seedRow = Math.floor(encoded / pCols);
					const seedCol = encoded % pCols;
					const mx = (seedCol + 0.5) * cellW;
					const my = (seedRow + 0.5) * cellH;
					const score = analytics.topIgnitionSeedScores?.[i] ?? 0;
					// Outer glow ring
					ctx.shadowColor = "#e88a00";
					ctx.shadowBlur = 8 / scale;
					ctx.fillStyle = score >= 0.8 ? "#c0392b" : "#e88a00";
					ctx.beginPath();
					ctx.arc(mx, my, 7 / scale, 0, Math.PI * 2);
					ctx.fill();
					ctx.shadowBlur = 0;
					// Label: rank number
					ctx.fillStyle = "#fff";
					ctx.font = `bold ${8 / scale}px monospace`;
					ctx.textAlign = "center";
					ctx.textBaseline = "middle";
					ctx.fillText(String(i + 1), mx, my);
				});
				ctx.textBaseline = "alphabetic";
			}

			ctx.restore();
			const legendLabel = !showHeatmap
				? "IGNITION HOTSPOTS"
				: showVeg
					? "DAMAGE + VEG"
					: showIgnition
						? "DAMAGE + HOTSPOTS"
						: "DAMAGE POTENTIAL";
			_drawLegend(ctx, W, H, legendLabel);
			return;
		}

		// LAYER 4 — Phase 2 fire perimeter
		if (phase2Result?.perimetersByTimestamp?.length > 0) {
			const snap = phase2Result.perimetersByTimestamp[playStep] ?? phase2Result.perimetersByTimestamp[0];
			if (snap?.perimeterGeoJson) {
				let features = [];
				try {
					features = JSON.parse(snap.perimeterGeoJson).features ?? [];
				} catch {}
				ctx.fillStyle = "rgba(80,20,10,0.85)";
				features.forEach((f) => {
					const coords = f.geometry?.coordinates?.[0];
					if (!coords) return;
					ctx.beginPath();
					coords.forEach(([c, r], i) => (i === 0 ? ctx.moveTo(c * cellW, r * cellH) : ctx.lineTo(c * cellW, r * cellH)));
					ctx.closePath();
					ctx.fill();
				});
				ctx.shadowColor = "#e88a00";
				ctx.shadowBlur = 12 / scale;
				ctx.strokeStyle = "#e88a00";
				ctx.lineWidth = 2 / scale;
				features.forEach((f) => {
					const coords = f.geometry?.coordinates?.[0];
					if (!coords) return;
					ctx.beginPath();
					coords.forEach(([c, r], i) => (i === 0 ? ctx.moveTo(c * cellW, r * cellH) : ctx.lineTo(c * cellW, r * cellH)));
					ctx.closePath();
					ctx.stroke();
				});
				ctx.shadowBlur = 0;
			}
			if (drawnPoints?.length >= 3) _drawManualPolygon(ctx, drawnPoints, scale);
		}

		ctx.restore();
	}, [
		gridEnv,
		phase1Result,
		phase2Result,
		showIgnition,
		showHeatmap,
		showVeg,
		showTopo,
		vegPalette,
		playStep,
		session,
		drawnPoints,
		transform,
		analytics,
	]);

	useEffect(() => {
		const obs = new ResizeObserver(() => {
			const canvas = canvasRef.current;
			const container = containerRef.current;
			if (!canvas || !container) return;
			canvas.width = container.clientWidth;
			canvas.height = container.clientHeight;
			setCanvasSize({ w: container.clientWidth, h: container.clientHeight });
		});
		if (containerRef.current) obs.observe(containerRef.current);
		return () => obs.disconnect();
	}, []);

	useEffect(() => {
		draw();
	}, [draw]);

	return (
		<div
			ref={containerRef}
			className="w-full h-full relative"
			style={{ cursor: drawMode ? "crosshair" : "grab" }}
			onMouseDown={drawMode ? undefined : onDragStart}
			onMouseMove={drawMode ? undefined : onDragMove}
			onMouseUp={drawMode ? undefined : onDragEnd}
			onMouseLeave={drawMode ? undefined : onDragEnd}
		>
			<canvas ref={canvasRef} className="w-full h-full block" style={{ userSelect: "none" }} />
			{drawMode && (
				<DrawOverlay
					width={canvasSize.w}
					height={canvasSize.h}
					onPolygon={onDrawComplete}
					onCancel={onDrawCancel}
					transform={transform}
				/>
			)}
		</div>
	);
}

function _drawLegend(ctx, W, H, title) {
	const legW = 160,
		legH = 14,
		legX = W - legW - 16,
		legY = H - 34;
	const grad = ctx.createLinearGradient(legX, 0, legX + legW, 0);
	grad.addColorStop(0, "#282828");
	grad.addColorStop(0.5, "#e88a00");
	grad.addColorStop(1, "#c0392b");
	ctx.fillStyle = grad;
	ctx.fillRect(legX, legY, legW, legH);
	ctx.strokeStyle = "#555";
	ctx.lineWidth = 1;
	ctx.strokeRect(legX, legY, legW, legH);
	ctx.font = "10px monospace";
	ctx.fillStyle = "#888";
	ctx.textAlign = "left";
	ctx.fillText("0", legX, legY + legH + 11);
	ctx.textAlign = "right";
	ctx.fillText("1", legX + legW, legY + legH + 11);
	ctx.textAlign = "center";
	ctx.fillStyle = "#555";
	ctx.fillText(title, legX + legW / 2, legY - 4);
}

function _drawManualPolygon(ctx, points, scale) {
	ctx.strokeStyle = "#4ade80";
	ctx.lineWidth = 2 / scale;
	ctx.setLineDash([5 / scale, 3 / scale]);
	ctx.beginPath();
	points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
	ctx.closePath();
	ctx.stroke();
	ctx.setLineDash([]);
	points.forEach(([x, y]) => {
		ctx.fillStyle = "#4ade80";
		ctx.beginPath();
		ctx.arc(x, y, 3 / scale, 0, Math.PI * 2);
		ctx.fill();
	});
}

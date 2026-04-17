// ─── wrap-canvas.jsx ──────────────────────────────────────────────────────────
// GridCanvas: renders heatmap, fire perimeter, and optional draw mode for
// manual ignition polygon. Exposes drawn polygon back to parent via onPolygon.

import { useEffect, useRef, useCallback, useState } from "react";
import { damageColor, ignitionColor, vegColor, VEG_TYPES, pixelPointsToGeoJson } from "./utils/utils.js";

// ─── Draw mode overlay ────────────────────────────────────────────────────────
// Renders on top of the main canvas when drawMode=true.
// User clicks to place vertices; double-click or Close Polygon button to finish.
function DrawOverlay({ width, height, onPolygon, onCancel }) {
	const [points, setPoints] = useState([]);
	const svgRef = useRef(null);

	const handleClick = (e) => {
		const rect = svgRef.current.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		setPoints((prev) => [...prev, [x, y]]);
	};

	const handleDblClick = (e) => {
		e.preventDefault();
		finalize();
	};

	const finalize = () => {
		if (points.length < 3) return;
		onPolygon(points);
		setPoints([]);
	};

	const undoLast = () => setPoints((prev) => prev.slice(0, -1));
	const cancel = () => {
		setPoints([]);
		onCancel();
	};

	const polyline = points.map((p) => p.join(",")).join(" ");

	return (
		<div className="absolute inset-0 z-10" style={{ cursor: "crosshair" }}>
			{/* Instruction banner */}
			<div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black bg-opacity-80 border border-amber-700 px-3 py-1.5 font-mono text-xs text-amber-300 pointer-events-none z-20 whitespace-nowrap">
				DRAW MODE — Click to place vertices · Double-click or ▣ to close polygon
			</div>

			{/* SVG drawing surface */}
			<svg
				ref={svgRef}
				width={width}
				height={height}
				className="absolute inset-0"
				onClick={handleClick}
				onDoubleClick={handleDblClick}
				style={{ touchAction: "none" }}
			>
				{/* Filled polygon preview */}
				{points.length >= 3 && (
					<polygon points={polyline} fill="rgba(232, 138, 0, 0.15)" stroke="#e88a00" strokeWidth="1.5" strokeDasharray="4 2" />
				)}
				{/* Open polyline if fewer than 3 points */}
				{points.length >= 2 && points.length < 3 && (
					<polyline points={polyline} fill="none" stroke="#e88a00" strokeWidth="1.5" strokeDasharray="4 2" />
				)}
				{/* Vertex dots */}
				{points.map(([x, y], i) => (
					<circle key={i} cx={x} cy={y} r={4} fill="#e88a00" stroke="#0d0d0d" strokeWidth={1} />
				))}
				{/* Preview line from last point to cursor handled via SVG mouse-move — omitted for simplicity */}
			</svg>

			{/* Draw controls */}
			<div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex gap-2 z-20">
				<button
					onClick={undoLast}
					disabled={points.length === 0}
					className="px-3 py-1 bg-neutral-900 border border-neutral-600 text-neutral-300 font-mono text-xs hover:border-neutral-400 disabled:opacity-30"
				>
					← UNDO
				</button>
				<button
					onClick={finalize}
					disabled={points.length < 3}
					className="px-3 py-1 bg-amber-900 border border-amber-600 text-amber-100 font-mono text-xs hover:bg-amber-800 disabled:opacity-30"
				>
					▣ CLOSE POLYGON ({points.length} pts)
				</button>
				<button
					onClick={cancel}
					className="px-3 py-1 bg-neutral-900 border border-red-800 text-red-400 font-mono text-xs hover:border-red-600"
				>
					✕ CANCEL
				</button>
			</div>
		</div>
	);
}

// ─── Main grid canvas ─────────────────────────────────────────────────────────
export default function GridCanvas({
	session,
	phase1Result,
	phase2Result,
	showIgnition,
	showVeg,
	playStep,
	drawMode,
	onDrawComplete,
	onDrawCancel,
	drawnPoints, // preview of already-drawn polygon
}) {
	const canvasRef = useRef(null);
	const containerRef = useRef(null);
	const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		const W = canvas.width;
		const H = canvas.height;

		ctx.fillStyle = "#0a0a0a";
		ctx.fillRect(0, 0, W, H);

		// ── Empty state ──
		if (!phase1Result && !phase2Result) {
			for (let x = 20; x < W; x += 20)
				for (let y = 20; y < H; y += 20) {
					ctx.fillStyle = "#1a1a1a";
					ctx.fillRect(x, y, 1, 1);
				}
			ctx.fillStyle = "#2a2a2a";
			ctx.font = "11px monospace";
			ctx.textAlign = "center";
			ctx.fillText("RUN A SIMULATION TO SEE RESULTS", W / 2, H / 2);
			return;
		}

		// ── Phase 1 heatmap ──
		if (phase1Result) {
			const { rows, cols, damagePotentialValues: dmg, ignitionProbabilityValues: ign, vegetationTypeOrdinals: veg } = phase1Result;
			const cellW = W / cols;
			const cellH = H / rows;
			const imgData = ctx.createImageData(W, H);
			const d = imgData.data;

			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					const idx = r * cols + c;
					const px = Math.floor(c * cellW);
					const py = Math.floor(r * cellH);
					const pw = Math.max(1, Math.ceil(cellW));
					const ph = Math.max(1, Math.ceil(cellH));

					const [rr, gg, bb, aa] = showVeg ? vegColor(veg[idx]) : [...damageColor(dmg[idx]), 255];

					for (let dy = 0; dy < ph && py + dy < H; dy++) {
						for (let dx = 0; dx < pw && px + dx < W; dx++) {
							const pi = ((py + dy) * W + (px + dx)) * 4;
							d[pi] = rr;
							d[pi + 1] = gg;
							d[pi + 2] = bb;
							d[pi + 3] = aa ?? 255;
						}
					}

					// Ignition overlay (composited in-place)
					if (showIgnition && !showVeg && ign) {
						const [ir, ig_, ib, ia] = ignitionColor(ign[idx]);
						if (ia > 10) {
							const alpha = ia / 255;
							for (let dy = 0; dy < ph && py + dy < H; dy++) {
								for (let dx = 0; dx < pw && px + dx < W; dx++) {
									const pi = ((py + dy) * W + (px + dx)) * 4;
									d[pi] = Math.round(d[pi] * (1 - alpha) + ir * alpha);
									d[pi + 1] = Math.round(d[pi + 1] * (1 - alpha) + ig_ * alpha);
									d[pi + 2] = Math.round(d[pi + 2] * (1 - alpha) + ib * alpha);
									d[pi + 3] = 255;
								}
							}
						}
					}
				}
			}
			ctx.putImageData(imgData, 0, 0);

			// Legend
			_drawLegend(ctx, W, H, showVeg ? "VEGETATION LAYER" : "DAMAGE POTENTIAL");
			return;
		}

		// ── Phase 2 perimeter ──
		if (phase2Result?.perimetersByTimestamp?.length > 0 && session) {
			const snap = phase2Result.perimetersByTimestamp[playStep] ?? phase2Result.perimetersByTimestamp[0];
			if (!snap?.perimeterGeoJson) return;

			let features = [];
			try {
				features = JSON.parse(snap.perimeterGeoJson).features ?? [];
			} catch {
				ctx.fillStyle = "#444";
				ctx.font = "11px monospace";
				ctx.textAlign = "center";
				ctx.fillText("PERIMETER DATA PARSE ERROR", W / 2, H / 2);
				return;
			}

			const { rows, cols } = session;
			const cellW = W / cols;
			const cellH = H / rows;

			// Burned fill
			ctx.fillStyle = "rgba(80,20,10,0.85)";
			features.forEach((f) => {
				const coords = f.geometry?.coordinates?.[0];
				if (!coords) return;
				ctx.beginPath();
				coords.forEach(([c, r], i) => (i === 0 ? ctx.moveTo(c * cellW, r * cellH) : ctx.lineTo(c * cellW, r * cellH)));
				ctx.closePath();
				ctx.fill();
			});

			// Glowing perimeter
			ctx.shadowColor = "#e88a00";
			ctx.shadowBlur = 12;
			ctx.strokeStyle = "#e88a00";
			ctx.lineWidth = 2;
			features.forEach((f) => {
				const coords = f.geometry?.coordinates?.[0];
				if (!coords) return;
				ctx.beginPath();
				coords.forEach(([c, r], i) => (i === 0 ? ctx.moveTo(c * cellW, r * cellH) : ctx.lineTo(c * cellW, r * cellH)));
				ctx.closePath();
				ctx.stroke();
			});
			ctx.shadowBlur = 0;

			// Show already-drawn manual ignition polygon if present
			if (drawnPoints?.length >= 3) {
				_drawManualPolygon(ctx, drawnPoints);
			}
		}
	}, [phase1Result, phase2Result, showIgnition, showVeg, playStep, session, drawnPoints]);

	// Resize observer
	useEffect(() => {
		const obs = new ResizeObserver(() => {
			const canvas = canvasRef.current;
			const container = containerRef.current;
			if (!canvas || !container) return;
			canvas.width = container.clientWidth;
			canvas.height = container.clientHeight;
			setCanvasSize({ w: container.clientWidth, h: container.clientHeight });
			draw();
		});
		if (containerRef.current) obs.observe(containerRef.current);
		return () => obs.disconnect();
	}, [draw]);

	useEffect(() => {
		draw();
	}, [draw]);

	return (
		<div ref={containerRef} className="w-full h-full relative">
			<canvas ref={canvasRef} className="w-full h-full block" />
			{drawMode && <DrawOverlay width={canvasSize.w} height={canvasSize.h} onPolygon={onDrawComplete} onCancel={onDrawCancel} />}
		</div>
	);
}

// ─── Private helpers ──────────────────────────────────────────────────────────
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
	ctx.fillStyle = "#888";
	ctx.font = "10px monospace";
	ctx.textAlign = "left";
	ctx.fillText("0", legX, legY + legH + 11);
	ctx.textAlign = "right";
	ctx.fillText("1", legX + legW, legY + legH + 11);
	ctx.textAlign = "center";
	ctx.fillStyle = "#555";
	ctx.fillText(title, legX + legW / 2, legY - 4);
}

function _drawManualPolygon(ctx, points) {
	ctx.strokeStyle = "#4ade80";
	ctx.lineWidth = 2;
	ctx.setLineDash([5, 3]);
	ctx.beginPath();
	points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
	ctx.closePath();
	ctx.stroke();
	ctx.setLineDash([]);
	points.forEach(([x, y]) => {
		ctx.fillStyle = "#4ade80";
		ctx.beginPath();
		ctx.arc(x, y, 3, 0, Math.PI * 2);
		ctx.fill();
	});
}

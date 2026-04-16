import { useState, useEffect, useRef, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:8080";

const VEG_TYPES = [
	{ label: "Afromontane Forest", color: "#1a4a2e" },
	{ label: "Grassland", color: "#7a8c2a" },
	{ label: "Shrubland", color: "#5a6b1a" },
	{ label: "Bare Soil", color: "#8a7355" },
	{ label: "Cropland", color: "#a0b840" },
	{ label: "Water", color: "#1a3a5c" },
	{ label: "Built-up", color: "#4a4a4a" },
];

// Damage potential colour scale: 0→dark grey, 0.5→amber, 1→red
function damageColor(v) {
	if (v < 0.5) {
		const t = v * 2;
		const r = Math.round(40 + t * (232 - 40));
		const g = Math.round(40 + t * (138 - 40));
		const b = Math.round(40 + t * 0);
		return [r, g, b];
	} else {
		const t = (v - 0.5) * 2;
		const r = Math.round(232 + t * (192 - 232));
		const g = Math.round(138 - t * 138);
		const b = 0;
		return [r, g, b];
	}
}

function ignitionColor(v) {
	// blue-purple overlay, semi-transparent
	const a = Math.round(v * 180);
	return [60, 80, 200, a];
}

function vegColor(ordinal) {
	const hex = VEG_TYPES[ordinal]?.color ?? "#333";
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return [r, g, b, 200];
}

// ─── API helpers ──────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
	const res = await fetch(`${API_BASE}${path}`, {
		headers: { "Content-Type": "application/json" },
		...opts,
	});
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
	return res.json();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusPill({ mode }) {
	const isActive = mode === "ACTIVE_FIRE";
	return (
		<div
			className={`px-3 py-1.5 text-xs font-mono font-bold tracking-widest border ${
				isActive ? "bg-red-900 border-red-600 text-red-200" : "bg-amber-900 border-amber-600 text-amber-200"
			}`}
			style={{ letterSpacing: "0.15em" }}
		>
			{isActive ? "■ ACTIVE FIRE MODE" : "◆ RISK ASSESSMENT MODE"}
		</div>
	);
}

function FlatButton({ onClick, disabled, loading, children, variant = "default", className = "" }) {
	const base =
		"w-full px-3 py-2 text-xs font-mono tracking-wider border transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2";
	const variants = {
		default: "bg-neutral-800 border-neutral-600 text-neutral-200 hover:bg-neutral-700 hover:border-neutral-400",
		primary: "bg-amber-900 border-amber-500 text-amber-100 hover:bg-amber-800 hover:border-amber-300",
		danger: "bg-red-900 border-red-600 text-red-100 hover:bg-red-800",
		running: "bg-neutral-900 border-amber-700 text-amber-400 cursor-not-allowed",
	};
	return (
		<button onClick={onClick} disabled={disabled || loading} className={`${base} ${variants[loading ? "running" : variant]} ${className}`}>
			{loading && <span className="inline-block w-3 h-3 border border-amber-500 border-t-transparent rounded-full animate-spin" />}
			{children}
		</button>
	);
}

function InputField({ label, value, onChange, placeholder, type = "text" }) {
	return (
		<div className="flex flex-col gap-1">
			<label className="text-xs font-mono text-neutral-500 tracking-widest uppercase">{label}</label>
			<input
				type={type}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				className="bg-neutral-900 border border-neutral-700 text-neutral-200 font-mono text-sm px-2 py-1.5 focus:outline-none focus:border-amber-600 placeholder-neutral-700"
			/>
		</div>
	);
}

function Toggle({ checked, onChange, label }) {
	return (
		<div className="flex items-center justify-between">
			<span className="text-xs font-mono text-neutral-400 tracking-wider uppercase">{label}</span>
			<button
				onClick={() => onChange(!checked)}
				className={`relative w-10 h-5 border transition-colors ${
					checked ? "bg-amber-800 border-amber-500" : "bg-neutral-800 border-neutral-600"
				}`}
			>
				<span
					className={`absolute top-0.5 w-4 h-4 bg-current transition-all ${
						checked ? "left-5 text-amber-400" : "left-0.5 text-neutral-500"
					}`}
					style={{ backgroundColor: checked ? "#f59e0b" : "#555" }}
				/>
			</button>
		</div>
	);
}

function SectionTitle({ children }) {
	return <div className="text-xs font-mono font-bold tracking-widest text-neutral-400 uppercase border-b border-neutral-800 pb-1 mb-3">{children}</div>;
}

function LogPanel({ entries }) {
	const ref = useRef(null);
	useEffect(() => {
		if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
	}, [entries]);

	const color = (type) => {
		if (type === "EVENT") return "text-amber-400";
		if (type === "WARNING" || type === "WARN") return "text-yellow-400";
		if (type === "ERROR") return "text-red-400";
		if (type === "CORE") return "text-blue-400";
		return "text-neutral-400";
	};

	return (
		<div
			ref={ref}
			className="flex-1 overflow-y-auto bg-neutral-950 border border-neutral-800 p-2 font-mono text-xs leading-5 min-h-0"
			style={{ maxHeight: "280px" }}
		>
			{entries.length === 0 && <span className="text-neutral-700">... awaiting operator command</span>}
			{entries.map((e, i) => {
				const match = e.match(/^\[([^\]]+)\]\s+(\w+):\s+(.*)/s);
				if (match) {
					const [, time, type, msg] = match;
					return (
						<div key={i}>
							<span className="text-neutral-600">[{time}]</span>{" "}
							<span className={`font-bold ${color(type)}`}>{type}:</span>{" "}
							<span className="text-neutral-300">{msg}</span>
						</div>
					);
				}
				return (
					<div key={i} className="text-neutral-400">
						{e}
					</div>
				);
			})}
		</div>
	);
}

function PastRunsList({ runs, mode }) {
	if (!runs || runs.length === 0) return <p className="text-xs font-mono text-neutral-700">No runs recorded.</p>;

	return (
		<div className="flex flex-col gap-1">
			{runs.map((r) => {
				const time = r.completedAt ? new Date(r.completedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";
				const label = r.phase === "ACTIVE_FIRE" ? "Spread Simulation" : "Risk Assessment";
				return (
					<div
						key={r.runId}
						className="border border-neutral-800 bg-neutral-900 px-3 py-2 hover:border-neutral-600 cursor-pointer transition-colors"
					>
						<div className="flex justify-between items-center">
							<span className="text-xs font-mono font-bold text-neutral-300">
								{r.runId?.slice(0, 10).toUpperCase() ?? "—"}
							</span>
							<span className="text-xs font-mono text-neutral-500">{time}</span>
						</div>
						<div className="text-xs font-mono text-neutral-600 mt-0.5">{label}</div>
					</div>
				);
			})}
		</div>
	);
}

// ─── Grid Canvas ──────────────────────────────────────────────────────────────
function GridCanvas({ session, phase1Result, phase2Result, showIgnition, showVeg, playStep }) {
	const canvasRef = useRef(null);

	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		const W = canvas.width;
		const H = canvas.height;

		// Background
		ctx.fillStyle = "#0a0a0a";
		ctx.fillRect(0, 0, W, H);

		// Empty state — dot grid
		if (!phase1Result && !phase2Result) {
			ctx.fillStyle = "#1a1a1a";
			for (let x = 20; x < W; x += 20) for (let y = 20; y < H; y += 20) ctx.fillRect(x, y, 1, 1);
			ctx.fillStyle = "#333";
			ctx.font = "12px monospace";
			ctx.textAlign = "center";
			ctx.fillText("RUN A SIMULATION TO SEE RESULTS", W / 2, H / 2);
			return;
		}

		// Phase 1 heatmap
		if (phase1Result) {
			const { rows, cols, damagePotentialValues, ignitionProbabilityValues, vegetationTypeOrdinals } = phase1Result;
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

					let [rr, gg, bb, aa] = showVeg
						? vegColor(vegetationTypeOrdinals[idx])
						: [...damageColor(damagePotentialValues[idx]), 255];

					for (let dy = 0; dy < ph && py + dy < H; dy++) {
						for (let dx = 0; dx < pw && px + dx < W; dx++) {
							const pi = ((py + dy) * W + (px + dx)) * 4;
							d[pi] = rr;
							d[pi + 1] = gg;
							d[pi + 2] = bb;
							d[pi + 3] = aa;
						}
					}

					// Ignition likelihood overlay
					if (showIgnition && !showVeg && ignitionProbabilityValues) {
						const [ir, ig, ib, ia] = ignitionColor(ignitionProbabilityValues[idx]);
						if (ia > 10) {
							for (let dy = 0; dy < ph && py + dy < H; dy++) {
								for (let dx = 0; dx < pw && px + dx < W; dx++) {
									const pi = ((py + dy) * W + (px + dx)) * 4;
									const alpha = ia / 255;
									d[pi] = Math.round(d[pi] * (1 - alpha) + ir * alpha);
									d[pi + 1] = Math.round(d[pi + 1] * (1 - alpha) + ig * alpha);
									d[pi + 2] = Math.round(d[pi + 2] * (1 - alpha) + ib * alpha);
									d[pi + 3] = 255;
								}
							}
						}
					}
				}
			}
			ctx.putImageData(imgData, 0, 0);

			// Damage potential legend
			const legW = 160,
				legH = 16,
				legX = W - legW - 16,
				legY = H - 36;
			const grad = ctx.createLinearGradient(legX, 0, legX + legW, 0);
			grad.addColorStop(0, "#282828");
			grad.addColorStop(0.5, "#e88a00");
			grad.addColorStop(1, "#c0392b");
			ctx.fillStyle = grad;
			ctx.fillRect(legX, legY, legW, legH);
			ctx.strokeStyle = "#555";
			ctx.lineWidth = 1;
			ctx.strokeRect(legX, legY, legW, legH);
			ctx.fillStyle = "#999";
			ctx.font = "10px monospace";
			ctx.textAlign = "left";
			ctx.fillText("0", legX, legY + legH + 12);
			ctx.textAlign = "right";
			ctx.fillText("1", legX + legW, legY + legH + 12);
			ctx.textAlign = "center";
			ctx.fillStyle = "#666";
			ctx.fillText(showVeg ? "VEGETATION LAYER" : "DAMAGE POTENTIAL", legX + legW / 2, legY - 5);
			return;
		}

		// Phase 2 fire perimeter
		if (phase2Result && phase2Result.perimetersByTimestamp?.length > 0) {
			const snap = phase2Result.perimetersByTimestamp[playStep] ?? phase2Result.perimetersByTimestamp[0];
			if (!snap?.perimeterGeoJson) return;

			// Parse GeoJSON features
			let features = [];
			try {
				const fc = JSON.parse(snap.perimeterGeoJson);
				features = fc.features ?? [];
			} catch {
				ctx.fillStyle = "#333";
				ctx.font = "11px monospace";
				ctx.textAlign = "center";
				ctx.fillText("PERIMETER DATA PARSE ERROR", W / 2, H / 2);
				return;
			}

			if (!session) return;
			const { rows, cols } = session;
			const cellW = W / cols;
			const cellH = H / rows;

			// Draw burned fill
			ctx.fillStyle = "rgba(80, 20, 10, 0.85)";
			features.forEach((f) => {
				const coords = f.geometry?.coordinates?.[0];
				if (!coords) return;
				ctx.beginPath();
				coords.forEach(([c, r], i) => {
					const x = c * cellW;
					const y = r * cellH;
					i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
				});
				ctx.closePath();
				ctx.fill();
			});

			// Draw glowing perimeter
			ctx.shadowColor = "#e88a00";
			ctx.shadowBlur = 12;
			ctx.strokeStyle = "#e88a00";
			ctx.lineWidth = 2;
			features.forEach((f) => {
				const coords = f.geometry?.coordinates?.[0];
				if (!coords) return;
				ctx.beginPath();
				coords.forEach(([c, r], i) => {
					const x = c * cellW;
					const y = r * cellH;
					i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
				});
				ctx.closePath();
				ctx.stroke();
			});
			ctx.shadowBlur = 0;
		}
	}, [phase1Result, phase2Result, showIgnition, showVeg, playStep, session]);

	// Resize canvas to fill container
	const containerRef = useRef(null);
	useEffect(() => {
		const obs = new ResizeObserver(() => {
			const canvas = canvasRef.current;
			const container = containerRef.current;
			if (!canvas || !container) return;
			canvas.width = container.clientWidth;
			canvas.height = container.clientHeight;
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
		</div>
	);
}

// ─── Left Panel ───────────────────────────────────────────────────────────────
function LeftPanel({ session, onRefresh, refreshing, onRunP1, onRunP2, runningP1, runningP2, log }) {
	const [windSpeed, setWindSpeed] = useState("");
	const [windDir, setWindDir] = useState("");
	const [simHours, setSimHours] = useState("24");
	const [manualIgn, setManualIgn] = useState(false);
	const [geoJson, setGeoJson] = useState("");

	const mode = session?.mode ?? "PRE_FIRE";

	return (
		<div className="flex flex-col h-full overflow-hidden border-r border-neutral-800 bg-neutral-950">
			{/* Header */}
			<div className="p-4 border-b border-neutral-800 flex-shrink-0">
				<div className="text-xs font-mono text-neutral-600 tracking-widest mb-2 uppercase">System Status</div>
				<StatusPill mode={mode} />
			</div>

			<div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 min-h-0">
				{/* Refresh */}
				<div>
					<FlatButton onClick={onRefresh} loading={refreshing} variant="default">
						↻ REFRESH SATELLITE DATA
					</FlatButton>
					{session && (
						<div className="flex justify-between mt-1.5">
							<span className="text-xs font-mono text-neutral-700">LAST SYNC</span>
							<span className="text-xs font-mono text-neutral-500">
								{new Date().toLocaleTimeString("en-GB", {
									hour: "2-digit",
									minute: "2-digit",
									second: "2-digit",
								})}
							</span>
						</div>
					)}
				</div>

				{/* Run Simulation */}
				<div>
					<SectionTitle>Run Simulation</SectionTitle>

					{mode === "PRE_FIRE" ? (
						<div className="flex flex-col gap-3">
							<p className="text-xs font-mono text-neutral-600">Configure environmental vectors</p>
							<InputField
								label="Wind Speed (m/s)"
								value={windSpeed}
								onChange={setWindSpeed}
								placeholder="e.g. 12.5"
								type="number"
							/>
							<InputField
								label="Wind Direction (°)"
								value={windDir}
								onChange={setWindDir}
								placeholder="e.g. 225"
								type="number"
							/>
							<FlatButton
								variant="primary"
								loading={runningP1}
								onClick={() =>
									onRunP1({
										windSpeedMsOverride: windSpeed ? parseFloat(windSpeed) : null,
										windDirectionDegOverride: windDir ? parseFloat(windDir) : null,
									})
								}
							>
								{runningP1 ? "■ RUNNING..." : "⚡ RUN RISK ASSESSMENT"}
							</FlatButton>
						</div>
					) : (
						<div className="flex flex-col gap-3">
							<InputField
								label="Duration (Hours)"
								value={simHours}
								onChange={setSimHours}
								placeholder="24"
								type="number"
							/>
							<Toggle label="Manual Ignition" checked={manualIgn} onChange={setManualIgn} />
							{manualIgn && (
								<div className="flex flex-col gap-1">
									<label className="text-xs font-mono text-neutral-500 tracking-widest uppercase">
										GeoJSON Coordinates
									</label>
									<textarea
										value={geoJson}
										onChange={(e) => setGeoJson(e.target.value)}
										rows={5}
										placeholder={
											'{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[...]]}}'
										}
										className="bg-neutral-900 border border-neutral-700 text-neutral-300 font-mono text-xs p-2 focus:outline-none focus:border-amber-600 resize-none placeholder-neutral-800"
									/>
								</div>
							)}
							<FlatButton
								variant="danger"
								loading={runningP2}
								onClick={() =>
									onRunP2({
										cvDisabled: false,
										manualIgnition: manualIgn,
										manualIgnitionPolygonGeoJson: manualIgn ? geoJson : null,
										simulationHours: parseInt(simHours) || 24,
									})
								}
							>
								{runningP2 ? "■ RUNNING..." : "⚡ RUN SPREAD SIMULATION"}
							</FlatButton>
						</div>
					)}
				</div>

				{/* Past Runs */}
				<div>
					<SectionTitle>Past Runs</SectionTitle>
					<PastRunsList runs={session?.pastRuns} mode={mode} />
				</div>
			</div>

			{/* Operator badge */}
			<div className="p-3 border-t border-neutral-800 flex items-center gap-2 flex-shrink-0">
				<div className="w-7 h-7 bg-neutral-800 border border-neutral-600 flex items-center justify-center text-xs font-mono text-neutral-400">
					OP
				</div>
				<div>
					<div className="text-xs font-mono text-neutral-300">OPERATOR 01</div>
					<div className="text-xs font-mono text-neutral-700">Level 4 Auth</div>
				</div>
			</div>
		</div>
	);
}

// ─── Centre Panel ─────────────────────────────────────────────────────────────
function CentrePanel({ session, phase1Result, phase2Result, showIgnition, setShowIgnition, showVeg }) {
	const [playStep, setPlayStep] = useState(0);
	const [playing, setPlaying] = useState(false);
	const playRef = useRef(null);

	const totalSteps = phase2Result?.perimetersByTimestamp?.length ?? 0;
	const currentSnap = phase2Result?.perimetersByTimestamp?.[playStep];

	useEffect(() => {
		if (playing && totalSteps > 0) {
			playRef.current = setInterval(() => {
				setPlayStep((s) => {
					if (s >= totalSteps - 1) {
						setPlaying(false);
						return s;
					}
					return s + 1;
				});
			}, 400);
		} else {
			clearInterval(playRef.current);
		}
		return () => clearInterval(playRef.current);
	}, [playing, totalSteps]);

	// Reset step when new result arrives
	useEffect(() => {
		setPlayStep(0);
		setPlaying(false);
	}, [phase2Result]);

	const sectorLabel = session ? `SEC-01 // ${session.minX?.toFixed(0) ?? "—"}, ${session.minY?.toFixed(0) ?? "—"}` : "NO SESSION";

	return (
		<div className="flex flex-col h-full bg-neutral-950 min-w-0">
			{/* Map header bar */}
			<div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 flex-shrink-0">
				<div>
					<div className="text-xs font-mono text-neutral-600 tracking-widest">CURRENT SECTOR</div>
					<div className="text-sm font-mono font-bold text-neutral-200 tracking-wider">
						{session ? "SEC-01 // ABERDARE FOREST RESERVE" : "AWAITING SESSION"}
					</div>
				</div>
				{/* Zoom controls */}
				<div className="flex gap-1">
					{["+", "−", "⟳"].map((icon) => (
						<button
							key={icon}
							className="w-8 h-8 border border-neutral-700 bg-neutral-900 text-neutral-400 font-mono text-sm hover:bg-neutral-800 hover:border-neutral-500 transition-colors"
						>
							{icon}
						</button>
					))}
				</div>
			</div>

			{/* Canvas */}
			<div className="flex-1 relative min-h-0">
				<GridCanvas
					session={session}
					phase1Result={phase1Result}
					phase2Result={phase2Result}
					showIgnition={showIgnition}
					showVeg={showVeg}
					playStep={playStep}
				/>

				{/* Coordinate overlay */}
				{session && (
					<div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black bg-opacity-60 px-3 py-1 font-mono text-xs text-neutral-500 pointer-events-none">
						UTM 37S · {session.minX?.toFixed(0)} E · {session.minY?.toFixed(0)} N
					</div>
				)}
			</div>

			{/* Phase 1 overlay controls */}
			{phase1Result && (
				<div className="flex items-center gap-4 px-4 py-2 border-t border-neutral-800 flex-shrink-0 bg-neutral-950">
					<div className="flex items-center gap-2">
						<span className="text-xs font-mono text-neutral-600 uppercase tracking-wider">Show Ignition Likelihood</span>
						<button
							onClick={() => setShowIgnition(!showIgnition)}
							className={`w-8 h-4 border relative transition-colors ${showIgnition ? "bg-amber-900 border-amber-600" : "bg-neutral-800 border-neutral-600"}`}
						>
							<span
								className={`absolute top-0.5 w-3 h-3 transition-all ${showIgnition ? "left-4" : "left-0.5"}`}
								style={{ backgroundColor: showIgnition ? "#f59e0b" : "#555" }}
							/>
						</button>
					</div>
					<div className="text-xs font-mono text-neutral-700">
						Source: Monte Carlo ensemble ({session?.rows ?? "—"}×{session?.cols ?? "—"} cells)
					</div>
				</div>
			)}

			{/* Phase 2 playback controls */}
			{phase2Result && totalSteps > 0 && (
				<div className="flex items-center gap-3 px-4 py-2 border-t border-neutral-800 flex-shrink-0 bg-neutral-950">
					{[
						["⏮", () => setPlayStep(0)],
						["⏪", () => setPlayStep(Math.max(0, playStep - 1))],
						[playing ? "⏸" : "▶", () => setPlaying(!playing)],
						["⏩", () => setPlayStep(Math.min(totalSteps - 1, playStep + 1))],
						["⏭", () => setPlayStep(totalSteps - 1)],
					].map(([icon, fn]) => (
						<button
							key={icon}
							onClick={fn}
							className="w-8 h-7 border border-neutral-700 bg-neutral-900 text-neutral-300 font-mono text-xs hover:bg-neutral-800 hover:border-amber-700 transition-colors"
						>
							{icon}
						</button>
					))}
					<input
						type="range"
						min={0}
						max={Math.max(0, totalSteps - 1)}
						value={playStep}
						onChange={(e) => setPlayStep(parseInt(e.target.value))}
						className="flex-1 accent-amber-600"
					/>
					<span className="text-xs font-mono text-neutral-500 whitespace-nowrap">
						{currentSnap?.isoTimestamp
							? new Date(currentSnap.isoTimestamp).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })
							: "—"}
					</span>
					<span className="text-xs font-mono text-amber-700 whitespace-nowrap">
						STEP {playStep + 1} OF {totalSteps}
					</span>
				</div>
			)}
		</div>
	);
}

// ─── Right Panel ──────────────────────────────────────────────────────────────
function RightPanel({ session, phase1Result, showVeg, setShowVeg, log }) {
	return (
		<div className="flex flex-col h-full border-l border-neutral-800 bg-neutral-950 overflow-hidden">
			<div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 min-h-0">
				{/* Grid Info */}
				<div>
					<SectionTitle>Grid Info</SectionTitle>
					<div className="grid grid-cols-2 gap-x-4 gap-y-2">
						{[
							["RESOLUTION", session ? `${session.cellSizeMetres}m/CELL` : "—"],
							["CELLS", session ? `${((session.rows * session.cols) / 1000).toFixed(1)}k` : "—"],
							["ROWS × COLS", session ? `${session.rows} × ${session.cols}` : "—"],
							["CELL SIZE", session ? `${session.cellSizeMetres}m` : "—"],
						].map(([k, v]) => (
							<div key={k}>
								<div className="text-xs font-mono text-neutral-700 tracking-widest">{k}</div>
								<div className="text-sm font-mono text-neutral-300 font-bold">{v}</div>
							</div>
						))}
					</div>
					{session && (
						<div className="mt-3">
							<div className="text-xs font-mono text-neutral-700 tracking-widest mb-1">UTM COORDINATES</div>
							<div className="text-xs font-mono text-amber-700">
								11S {session.minX?.toFixed(0)} {session.minY?.toFixed(0)}
							</div>
						</div>
					)}
				</div>

				{/* Vegetation Layer (Phase 1 only) */}
				{phase1Result && (
					<div>
						<div className="flex items-center justify-between border-b border-neutral-800 pb-1 mb-3">
							<span className="text-xs font-mono font-bold tracking-widest text-neutral-400 uppercase">
								Vegetation Layer
							</span>
							<button
								onClick={() => setShowVeg(!showVeg)}
								className={`w-8 h-4 border relative transition-colors ${showVeg ? "bg-amber-900 border-amber-600" : "bg-neutral-800 border-neutral-600"}`}
							>
								<span
									className={`absolute top-0.5 w-3 h-3 transition-all ${showVeg ? "left-4" : "left-0.5"}`}
									style={{ backgroundColor: showVeg ? "#f59e0b" : "#555" }}
								/>
							</button>
						</div>
						<div className="flex flex-col gap-1.5">
							{VEG_TYPES.map(({ label, color }) => (
								<div key={label} className="flex items-center gap-2">
									<div
										className="w-3 h-3 flex-shrink-0 border border-neutral-700"
										style={{ backgroundColor: color }}
									/>
									<span className="text-xs font-mono text-neutral-500">{label}</span>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Active Hotspots (Phase 2 indicator) */}
				{!phase1Result && (
					<div>
						<SectionTitle>Active Hotspots</SectionTitle>
						<div className="text-4xl font-mono font-bold text-amber-600">{session?.mode === "ACTIVE_FIRE" ? "—" : "0"}</div>
						<div className="text-xs font-mono text-neutral-700 mt-1">DETECTED THIS OVERPASS</div>
					</div>
				)}
			</div>

			{/* Simulation Log */}
			<div className="p-4 border-t border-neutral-800 flex flex-col gap-2 flex-shrink-0" style={{ height: "280px" }}>
				<div className="flex items-center justify-between">
					<SectionTitle>Simulation Log</SectionTitle>
					<div className="w-2 h-2 rounded-full bg-amber-600 animate-pulse mb-1" />
				</div>
				<LogPanel entries={log} />
			</div>
		</div>
	);
}

// ─── Connection error banner ──────────────────────────────────────────────────
function ErrorBanner({ message }) {
	return (
		<div className="w-full bg-red-950 border-b border-red-800 px-4 py-2 font-mono text-xs text-red-300 flex items-center gap-2">
			<span className="text-red-500">✕</span>
			{message}
		</div>
	);
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function WRaPDashboard() {
	const [session, setSession] = useState(null);
	const [phase1Result, setPhase1Result] = useState(null);
	const [phase2Result, setPhase2Result] = useState(null);
	const [showIgnition, setShowIgnition] = useState(false);
	const [showVeg, setShowVeg] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [runningP1, setRunningP1] = useState(false);
	const [runningP2, setRunningP2] = useState(false);
	const [log, setLog] = useState([]);
	const [connError, setConnError] = useState(null);

	const addLog = useCallback((msg) => {
		const ts = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
		setLog((prev) => [...prev.slice(-80), `[${ts}] ${msg}`]);
	}, []);

	// Initial session load
	useEffect(() => {
		addLog("STATUS: System initialising...");
		apiFetch("/api/session/status")
			.then((data) => {
				setSession(data);
				setConnError(null);
				addLog(`STATUS: Session connected. Mode: ${data.mode}`);
				addLog(`CORE: Grid ${data.rows}×${data.cols} cells at ${data.cellSizeMetres}m resolution`);
			})
			.catch((e) => {
				setConnError("Could not connect to WRaP engine. Is the server running on port 8080?");
				addLog(`ERROR: ${e.message}`);
			});
	}, [addLog]);

	const handleRefresh = useCallback(async () => {
		setRefreshing(true);
		addLog("STATUS: Requesting satellite data refresh...");
		try {
			await apiFetch("/api/session/refresh", { method: "POST" });
			const data = await apiFetch("/api/session/status");
			setSession(data);
			addLog(`EVENT: Satellite refresh complete. Mode: ${data.mode}`);
			setConnError(null);
		} catch (e) {
			addLog(`ERROR: Refresh failed — ${e.message}`);
		} finally {
			setRefreshing(false);
		}
	}, [addLog]);

	const handleRunP1 = useCallback(
		async (body) => {
			setRunningP1(true);
			setPhase1Result(null);
			setPhase2Result(null);
			addLog("STATUS: Launching Monte Carlo risk assessment...");
			try {
				const result = await apiFetch("/api/simulation/phase-one/run", {
					method: "POST",
					body: JSON.stringify(body),
				});
				setPhase1Result(result);
				addLog(`CORE: Risk assessment complete. RunId: ${result.runId}`);
				addLog(`CORE: Grid ${result.rows}×${result.cols}, ${result.damagePotentialValues?.length ?? 0} cells`);
				// Refresh session to update past runs
				const sess = await apiFetch("/api/session/status");
				setSession(sess);
			} catch (e) {
				addLog(`ERROR: Phase 1 run failed — ${e.message}`);
			} finally {
				setRunningP1(false);
			}
		},
		[addLog],
	);

	const handleRunP2 = useCallback(
		async (body) => {
			setRunningP2(true);
			setPhase1Result(null);
			setPhase2Result(null);
			addLog("STATUS: Launching spread simulation...");
			addLog(`DATA: Horizon ${body.simulationHours}h · Manual ignition: ${body.manualIgnition}`);
			try {
				const result = await apiFetch("/api/simulation/phase-two/run", {
					method: "POST",
					body: JSON.stringify(body),
				});
				setPhase2Result(result);
				const steps = result.perimetersByTimestamp?.length ?? 0;
				addLog(`CORE: Spread simulation complete. RunId: ${result.runId}`);
				addLog(`CORE: ${steps} perimeter snapshots generated`);
				const sess = await apiFetch("/api/session/status");
				setSession(sess);
			} catch (e) {
				addLog(`ERROR: Phase 2 run failed — ${e.message}`);
			} finally {
				setRunningP2(false);
			}
		},
		[addLog],
	);

	return (
		<div className="flex flex-col w-screen h-screen bg-neutral-950 text-neutral-200 overflow-hidden">
			{/* Top error banner */}
			{connError && <ErrorBanner message={connError} />}

			{/* Title bar */}
			<div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-neutral-950 flex-shrink-0">
				<div className="flex items-center gap-3">
					<span className="text-base font-mono font-bold tracking-widest text-neutral-100">WRaP</span>
					<span className="text-xs font-mono text-neutral-700">COMMAND</span>
					<span className="text-neutral-800 mx-1">|</span>
					<span className="text-xs font-mono text-neutral-600">ABERDARE FOREST RESERVE</span>
				</div>
				<div className="flex items-center gap-4">
					<span className="text-xs font-mono text-neutral-700">
						{new Date().toLocaleString("en-GB", { dateStyle: "short", timeStyle: "medium" })}
					</span>
					{session && (
						<div className="flex items-center gap-1.5">
							<div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
							<span className="text-xs font-mono text-green-700">LIVE</span>
						</div>
					)}
				</div>
			</div>

			{/* Three-column layout */}
			<div className="flex flex-1 min-h-0 overflow-hidden">
				{/* Left — 280px */}
				<div className="w-72 flex-shrink-0">
					<LeftPanel
						session={session}
						onRefresh={handleRefresh}
						refreshing={refreshing}
						onRunP1={handleRunP1}
						onRunP2={handleRunP2}
						runningP1={runningP1}
						runningP2={runningP2}
						log={log}
					/>
				</div>

				{/* Centre — flex */}
				<div className="flex-1 min-w-0">
					<CentrePanel
						session={session}
						phase1Result={phase1Result}
						phase2Result={phase2Result}
						showIgnition={showIgnition}
						setShowIgnition={setShowIgnition}
						showVeg={showVeg}
					/>
				</div>

				{/* Right — 280px */}
				<div className="w-72 flex-shrink-0">
					<RightPanel session={session} phase1Result={phase1Result} showVeg={showVeg} setShowVeg={setShowVeg} log={log} />
				</div>
			</div>
		</div>
	);
}

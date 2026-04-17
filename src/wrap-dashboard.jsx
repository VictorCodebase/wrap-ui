// ─── WRaPDashboard.jsx ────────────────────────────────────────────────────────
// Root application. Owns all state and API calls. Renders title bar and the
// three-column layout. CentrePanel lives here to keep wiring in one file.

import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch, pixelPointsToGeoJson } from "./utils/utils.js";
import { ErrorBanner, MapToggle } from "./wrap-components.jsx";
import { LeftPanel, RightPanel } from "./wrap-panels.jsx";
import GridCanvas from "./wrap-canvas.jsx";

// ─── Centre Panel ─────────────────────────────────────────────────────────────
function CentrePanel({
	session,
	phase1Result,
	phase2Result,
	showIgnition,
	setShowIgnition,
	showVeg,
	drawMode,
	onStartDraw,
	onDrawComplete,
	onDrawCancel,
	drawnPoints,
}) {
	const [playStep, setPlayStep] = useState(0);
	const [playing, setPlaying] = useState(false);
	const playRef = useRef(null);

	const totalSteps = phase2Result?.perimetersByTimestamp?.length ?? 0;
	const currentSnap = phase2Result?.perimetersByTimestamp?.[playStep];

	// Playback interval
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
			}, 350);
		} else {
			clearInterval(playRef.current);
		}
		return () => clearInterval(playRef.current);
	}, [playing, totalSteps]);

	// Reset when new result arrives
	useEffect(() => {
		setPlayStep(0);
		setPlaying(false);
	}, [phase2Result]);

	return (
		<div className="flex flex-col h-full bg-neutral-950 min-w-0">
			{/* Map header */}
			<div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 flex-shrink-0">
				<div>
					<div className="text-xs font-mono text-neutral-600 tracking-widest">CURRENT SECTOR</div>
					<div className="text-sm font-mono font-bold text-neutral-200 tracking-wider">
						{session ? "SEC-01 // ABERDARE FOREST RESERVE" : "AWAITING SESSION"}
					</div>
				</div>
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

			{/* Canvas fills remaining height */}
			<div className="flex-1 relative min-h-0">
				<GridCanvas
					session={session}
					phase1Result={phase1Result}
					phase2Result={phase2Result}
					showIgnition={showIgnition}
					showVeg={showVeg}
					playStep={playStep}
					drawMode={drawMode}
					onDrawComplete={onDrawComplete}
					onDrawCancel={onDrawCancel}
					drawnPoints={drawnPoints}
				/>

				{/* UTM overlay */}
				{session && (
					<div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black bg-opacity-60 px-3 py-1 font-mono text-xs text-neutral-600 pointer-events-none">
						UTM 37S · {session.minX?.toFixed(0)} E · {session.minY?.toFixed(0)} N
					</div>
				)}
			</div>

			{/* Phase 1 bottom bar */}
			{phase1Result && (
				<div className="flex items-center gap-4 px-4 py-2 border-t border-neutral-800 flex-shrink-0 bg-neutral-950">
					<MapToggle checked={showIgnition} onChange={setShowIgnition} label="Show Ignition Likelihood" />
					<span className="text-xs font-mono text-neutral-700">
						Source: Monte Carlo ensemble ({session?.rows ?? "—"}×{session?.cols ?? "—"})
					</span>
					<div className="ml-auto text-xs font-mono text-neutral-600">DAMAGE POTENTIAL · 0 →→ 1</div>
				</div>
			)}

			{/* Phase 2 playback bar */}
			{phase2Result && totalSteps > 0 && (
				<div className="flex items-center gap-2 px-4 py-2 border-t border-neutral-800 flex-shrink-0 bg-neutral-950">
					{/* Controls */}
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
							? new Date(currentSnap.isoTimestamp).toLocaleString("en-GB", {
									dateStyle: "short",
									timeStyle: "short",
								})
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

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function WRaPDashboard() {
	// ── Server / session state ──
	const [session, setSession] = useState(null);
	const [connError, setConnError] = useState(null);
	const [refreshing, setRefreshing] = useState(false);

	// ── Simulation results ──
	const [phase1Result, setPhase1Result] = useState(null);
	const [phase2Result, setPhase2Result] = useState(null);
	const [runningP1, setRunningP1] = useState(false);
	const [runningP2, setRunningP2] = useState(false);
	const [correcting, setCorrecting] = useState(false);

	// ── Map display toggles ──
	const [showIgnition, setShowIgnition] = useState(false);
	const [showVeg, setShowVeg] = useState(false);

	// ── Draw mode (manual ignition polygon) — FR-P2-01 ──
	const [drawMode, setDrawMode] = useState(false);
	const [drawnPoints, setDrawnPoints] = useState(null); // raw canvas points
	const [drawnGeoJson, setDrawnGeoJson] = useState(""); // serialised GeoJSON

	// ── Log ──
	const [log, setLog] = useState([]);

	const addLog = useCallback((msg) => {
		const ts = new Date().toLocaleTimeString("en-GB", {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
		setLog((prev) => [...prev.slice(-100), `[${ts}] ${msg}`]);
	}, []);

	// ── Initial session load ──
	useEffect(() => {
		addLog("STATUS: System initialising...");
		apiFetch("/api/session/status")
			.then((data) => {
				setSession(data);
				setConnError(null);
				addLog(`STATUS: Session connected. Mode: ${data.mode}`);
				addLog(`CORE: Grid ${data.rows}×${data.cols} @ ${data.cellSizeMetres}m/cell`);
			})
			.catch((e) => {
				setConnError("Could not connect to WRaP engine. Is the server running on port 8080?");
				addLog(`ERROR: ${e.message}`);
			});
	}, [addLog]);

	// ── Refresh ──
	const handleRefresh = useCallback(async () => {
		setRefreshing(true);
		addLog("STATUS: Requesting satellite data refresh...");
		try {
			await apiFetch("/api/session/refresh", { method: "POST" });
			const data = await apiFetch("/api/session/status");
			setSession(data);
			setConnError(null);
			addLog(`EVENT: Refresh complete. Mode: ${data.mode}`);
		} catch (e) {
			addLog(`ERROR: Refresh failed — ${e.message}`);
		} finally {
			setRefreshing(false);
		}
	}, [addLog]);

	// ── Phase 1 — FR-P1-01 through FR-P1-05 ──
	const handleRunP1 = useCallback(
		async (body) => {
			setRunningP1(true);
			setPhase1Result(null);
			setPhase2Result(null);
			addLog("STATUS: Launching Monte Carlo risk assessment...");
			if (body.windSpeedMsOverride != null) addLog(`DATA: Wind override ${body.windSpeedMsOverride}m/s @ ${body.windDirectionDegOverride}°`);
			try {
				const result = await apiFetch("/api/simulation/phase-one/run", {
					method: "POST",
					body: JSON.stringify(body),
				});
				setPhase1Result(result);
				addLog(`CORE: Assessment complete. RunId: ${result.runId}`);
				addLog(`CORE: ${result.rows}×${result.cols} grid · ${result.damagePotentialValues?.length ?? 0} cells`);
				const sess = await apiFetch("/api/session/status");
				setSession(sess);
			} catch (e) {
				addLog(`ERROR: Phase 1 failed — ${e.message}`);
			} finally {
				setRunningP1(false);
			}
		},
		[addLog],
	);

	// ── Phase 2 — FR-P2-01 through FR-P2-05 ──
	const handleRunP2 = useCallback(
		async (body) => {
			setRunningP2(true);
			setPhase1Result(null);
			setPhase2Result(null);
			addLog("STATUS: Launching spread simulation...");
			addLog(`DATA: Horizon ${body.simulationHours}h · Manual ignition: ${body.manualIgnition}`);
			if (body.manualIgnition) addLog("DATA: Manual ignition polygon provided via " + (drawnPoints ? "canvas draw" : "GeoJSON paste"));
			try {
				const result = await apiFetch("/api/simulation/phase-two/run", {
					method: "POST",
					body: JSON.stringify(body),
				});
				setPhase2Result(result);
				const steps = result.perimetersByTimestamp?.length ?? 0;
				addLog(`CORE: Simulation complete. RunId: ${result.runId}`);
				addLog(`CORE: ${steps} perimeter snapshots`);
				const sess = await apiFetch("/api/session/status");
				setSession(sess);
			} catch (e) {
				addLog(`ERROR: Phase 2 failed — ${e.message}`);
			} finally {
				setRunningP2(false);
			}
		},
		[addLog, drawnPoints],
	);

	// ── CV Correction — UC-03, FR-CV-01, FR-CV-02 ──
	// Endpoint: POST /api/simulation/phase-two/correct
	// DTO: CvCorrectionRequestDto (Group 11 / dto-package-contract)
	const handleCorrect = useCallback(
		async (body) => {
			setCorrecting(true);
			addLog("STATUS: Injecting CV observation correction...");
			try {
				await apiFetch("/api/simulation/phase-two/correct", {
					method: "POST",
					body: JSON.stringify(body),
				});
				addLog("EVENT: CV correction injected. CA will resume from corrected state.");
				const suppressed = body.suppressedZoneCellIds?.length ?? 0;
				const moisture = body.updatedMoistureValues ? Object.keys(body.updatedMoistureValues).length : 0;
				addLog(`CORE: ${suppressed} cells suppressed · ${moisture} NDMI values refreshed`);
			} catch (e) {
				addLog(`ERROR: Correction failed — ${e.message}`);
			} finally {
				setCorrecting(false);
			}
		},
		[addLog],
	);

	// ── Draw mode handlers ──
	const handleStartDraw = useCallback(() => {
		setDrawMode(true);
		setDrawnPoints(null);
		setDrawnGeoJson("");
		addLog("STATUS: Draw mode active. Click on map to place perimeter vertices.");
	}, [addLog]);

	const handleDrawComplete = useCallback(
		(points) => {
			const geoJson = pixelPointsToGeoJson(points);
			if (!geoJson) {
				addLog("WARNING: Polygon requires at least 3 vertices.");
				return;
			}
			setDrawnPoints(points);
			setDrawnGeoJson(geoJson);
			setDrawMode(false);
			addLog(`EVENT: Manual ignition polygon captured (${points.length} vertices).`);
		},
		[addLog],
	);

	const handleDrawCancel = useCallback(() => {
		setDrawMode(false);
		addLog("STATUS: Draw mode cancelled.");
	}, [addLog]);

	// ── Clock display (updated every second) ──
	const [clock, setClock] = useState("");
	useEffect(() => {
		const tick = () => setClock(new Date().toLocaleString("en-GB", { dateStyle: "short", timeStyle: "medium" }));
		tick();
		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	}, []);

	return (
		<div className="flex flex-col w-screen h-screen bg-neutral-950 text-neutral-200 overflow-hidden">
			{/* Connection error banner */}
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
					<span className="text-xs font-mono text-neutral-700">{clock}</span>
					{drawMode && <span className="text-xs font-mono text-amber-400 animate-pulse">● DRAW MODE ACTIVE</span>}
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
				{/* Left — 288px */}
				<div className="w-72 flex-shrink-0">
					<LeftPanel
						session={session}
						onRefresh={handleRefresh}
						refreshing={refreshing}
						onRunP1={handleRunP1}
						runningP1={runningP1}
						onRunP2={handleRunP2}
						runningP2={runningP2}
						onStartDraw={handleStartDraw}
						drawMode={drawMode}
						drawnGeoJson={drawnGeoJson}
					/>
				</div>

				{/* Centre — flex fill */}
				<div className="flex-1 min-w-0">
					<CentrePanel
						session={session}
						phase1Result={phase1Result}
						phase2Result={phase2Result}
						showIgnition={showIgnition}
						setShowIgnition={setShowIgnition}
						showVeg={showVeg}
						drawMode={drawMode}
						onStartDraw={handleStartDraw}
						onDrawComplete={handleDrawComplete}
						onDrawCancel={handleDrawCancel}
						drawnPoints={drawnPoints}
					/>
				</div>

				{/* Right — 288px */}
				<div className="w-72 flex-shrink-0">
					<RightPanel
						session={session}
						phase1Result={phase1Result}
						phase2Result={phase2Result}
						showVeg={showVeg}
						setShowVeg={setShowVeg}
						log={log}
						onCorrect={handleCorrect}
						correcting={correcting}
					/>
				</div>
			</div>
		</div>
	);
}

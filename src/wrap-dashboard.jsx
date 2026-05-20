// ─── WRaPDashboard.jsx ────────────────────────────────────────────────────────
// Root app. Owns session state, API calls, zoom/pan transform, advanced settings.

import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch, pixelPointsToGeoJson } from "./utils/utils.js";
import { ErrorBanner, MapToggle, SectionTitle, FlatButton, InputField, Toggle } from "./wrap-components.jsx";
import { LeftPanel, RightPanel, Phase1AnalyticsBar, Phase2AnalyticsBar } from "./wrap-panels.jsx";
import GridCanvas from "./wrap-canvas.jsx";

// ─── Advanced Settings ────────────────────────────────────────────────────────
// Fields that ARE in request DTOs → sent to API.
// Fields that are NOT in request DTOs → cannot affect the running engine without
// a backend endpoint. See note below.
//
// ⚠ BACKEND NOTE — fields marked [backend-only] below cannot be changed at
// runtime with the current architecture. They are bound from application.properties
// at startup via @ConfigurationProperties and are immutable for the lifetime of
// the JVM process. To support runtime changes, Group 12 (WrapSessionFacade /
// SimulationController) would need to expose a new endpoint such as:
//   POST /api/session/config
// that accepts and stores a SimulationConfig override in a mutable Spring bean.
// Until that endpoint exists, these fields are stored locally only and displayed
// for reference — they have no effect on the backend.
//
// Fields that ARE already in request DTOs and DO work today:
//   windSpeedMsOverride, windDirectionDegOverride  → PhaseOneRunRequestDto
//   simulationHours                                → PhaseTwoRunRequestDto

const SETTINGS_KEY = "wrap_adv_settings";

function loadSettings() {
	try {
		return JSON.parse(localStorage.getItem(SETTINGS_KEY)) ?? {};
	} catch {
		return {};
	}
}
function saveSettings(s) {
	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
	} catch {}
}

function AdvancedSettingsPanel({ open, onClose }) {
	const saved = loadSettings();
	const [cellSize, setCellSize] = useState(saved.cellSizeMetres ?? "100");
	const [timeStep, setTimeStep] = useState(saved.timeStepMinutes ?? "5");
	const [mcRuns, setMcRuns] = useState(saved.monteCarloRuns ?? "200");
	const [threadPool, setThreadPool] = useState(saved.threadPoolSize ?? "8");
	const [horizonHours, setHorizonHours] = useState(saved.phase1HorizonHours ?? "24");

	const save = () => {
		saveSettings({
			cellSizeMetres: cellSize,
			timeStepMinutes: timeStep,
			monteCarloRuns: mcRuns,
			threadPoolSize: threadPool,
			phase1HorizonHours: horizonHours,
		});
		onClose();
	};

	if (!open) return null;

	return (
		<div className="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
			<div className="bg-neutral-900 border border-neutral-700 w-96 font-mono">
				<div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
					<span className="text-xs font-bold text-neutral-300 tracking-widest uppercase">Advanced Settings</span>
					<button onClick={onClose} className="text-neutral-600 hover:text-neutral-300 text-sm">
						✕
					</button>
				</div>
				<div className="p-4 flex flex-col gap-4">
					{/* ── Backend-only fields ── */}
					<div>
						<p className="text-xs text-amber-700 mb-3 leading-4">
							⚠ Fields below are stored locally. They require a backend runtime-config endpoint (Group 12: POST
							/api/session/config) to take effect on the engine. The engine currently reads these from
							application.properties at startup only.
						</p>
						<div className="flex flex-col gap-3">
							<InputField
								label="Cell Size (m)"
								value={cellSize}
								onChange={setCellSize}
								type="number"
								placeholder="100"
							/>
							<InputField
								label="Time Step (minutes)"
								value={timeStep}
								onChange={setTimeStep}
								type="number"
								placeholder="5"
							/>
							<InputField
								label="Monte Carlo Runs (N)"
								value={mcRuns}
								onChange={setMcRuns}
								type="number"
								placeholder="200"
							/>
							<InputField
								label="Thread Pool Size"
								value={threadPool}
								onChange={setThreadPool}
								type="number"
								placeholder="8"
							/>
							<InputField
								label="Phase 1 Horizon (hours)"
								value={horizonHours}
								onChange={setHorizonHours}
								type="number"
								placeholder="24"
							/>
						</div>
					</div>
				</div>
				<div className="flex gap-2 px-4 pb-4">
					<FlatButton variant="primary" onClick={save}>
						SAVE LOCALLY
					</FlatButton>
					<FlatButton onClick={onClose}>CANCEL</FlatButton>
				</div>
			</div>
		</div>
	);
}

// ─── Zoom / pan constants ─────────────────────────────────────────────────────
const ZOOM_STEP = 1.35;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 10;
const INIT_TRANSFORM = { scale: 1, offsetX: 0, offsetY: 0 };

// ─── Centre Panel ─────────────────────────────────────────────────────────────
function CentrePanel({
	session,
	gridEnv,
	phase1Result,
	phase2Result,
	showIgnition,
	setShowIgnition,
	showHeatmap,
	setShowHeatmap,
	showVeg,
	showTopo,
	vegPalette,
	analytics,
	drawMode,
	onDrawComplete,
	onDrawCancel,
	drawnPoints,
}) {
	const [playStep, setPlayStep] = useState(0);
	const [playing, setPlaying] = useState(false);
	const playRef = useRef(null);

	// Zoom / pan state
	const [transform, setTransform] = useState(INIT_TRANSFORM);
	const dragRef = useRef(null); // { startX, startY, initOffX, initOffY }

	const totalSteps = phase2Result?.perimetersByTimestamp?.length ?? 0;
	const currentSnap = phase2Result?.perimetersByTimestamp?.[playStep];

	// Playback
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

	useEffect(() => {
		setPlayStep(0);
		setPlaying(false);
	}, [phase2Result]);

	// Zoom handlers
	const zoomIn = () => setTransform((t) => ({ ...t, scale: Math.min(ZOOM_MAX, t.scale * ZOOM_STEP) }));
	const zoomOut = () => setTransform((t) => ({ ...t, scale: Math.max(ZOOM_MIN, t.scale / ZOOM_STEP) }));
	const resetView = () => setTransform(INIT_TRANSFORM);

	// Drag handlers
	const onDragStart = useCallback(
		(e) => {
			dragRef.current = {
				startX: e.clientX,
				startY: e.clientY,
				initOffX: transform.offsetX,
				initOffY: transform.offsetY,
			};
		},
		[transform.offsetX, transform.offsetY],
	);

	const onDragMove = useCallback((e) => {
		if (!dragRef.current) return;
		const dx = e.clientX - dragRef.current.startX;
		const dy = e.clientY - dragRef.current.startY;
		setTransform((t) => ({
			...t,
			offsetX: dragRef.current.initOffX + dx,
			offsetY: dragRef.current.initOffY + dy,
		}));
	}, []);

	const onDragEnd = useCallback(() => {
		dragRef.current = null;
	}, []);

	// Scroll to zoom (optional convenience)
	const onWheel = useCallback((e) => {
		e.preventDefault();
		setTransform((t) => ({
			...t,
			scale: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, t.scale * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP))),
		}));
	}, []);

	return (
		<div className="flex flex-col h-full bg-neutral-950 min-w-0">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 flex-shrink-0">
				<div>
					<div className="text-xs font-mono text-neutral-600 tracking-widest">CURRENT SECTOR</div>
					<div className="text-sm font-mono font-bold text-neutral-200 tracking-wider">
						{session ? "SEC-01 // ABERDARE FOREST RESERVE" : "AWAITING SESSION"}
					</div>
				</div>
				{/* Zoom/pan controls — wired */}
				<div className="flex gap-1">
					<button
						onClick={zoomIn}
						className="w-8 h-8 border border-neutral-700 bg-neutral-900 text-neutral-400 font-mono text-sm hover:bg-neutral-700 hover:border-neutral-500 transition-colors"
						title="Zoom in"
					>
						+
					</button>
					<button
						onClick={zoomOut}
						className="w-8 h-8 border border-neutral-700 bg-neutral-900 text-neutral-400 font-mono text-sm hover:bg-neutral-700 hover:border-neutral-500 transition-colors"
						title="Zoom out"
					>
						−
					</button>
					<button
						onClick={resetView}
						className="w-8 h-8 border border-neutral-700 bg-neutral-900 text-neutral-400 font-mono text-sm hover:bg-neutral-700 hover:border-neutral-500 transition-colors"
						title="Reset view"
					>
						⟳
					</button>
				</div>
			</div>

			{/* Canvas */}
			<div className="flex-1 relative min-h-0" onWheel={onWheel} style={{ overflow: "hidden" }}>
				<GridCanvas
					session={session}
					gridEnv={gridEnv}
					phase1Result={phase1Result}
					phase2Result={phase2Result}
					showIgnition={showIgnition}
					showHeatmap={showHeatmap}
					showVeg={showVeg}
					showTopo={showTopo}
					vegPalette={vegPalette}
					analytics={analytics}
					playStep={playStep}
					drawMode={drawMode}
					onDrawComplete={onDrawComplete}
					onDrawCancel={onDrawCancel}
					drawnPoints={drawnPoints}
					transform={transform}
					onDragStart={onDragStart}
					onDragMove={onDragMove}
					onDragEnd={onDragEnd}
				/>
				{/* Zoom level badge */}
				{transform.scale !== 1 && (
					<div className="absolute top-2 right-2 bg-black bg-opacity-60 px-2 py-0.5 font-mono text-xs text-neutral-500 pointer-events-none">
						{(transform.scale * 100).toFixed(0)}%
					</div>
				)}
				{/* UTM overlay */}
				{session && (
					<div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black bg-opacity-60 px-3 py-1 font-mono text-xs text-neutral-600 pointer-events-none">
						UTM 37S · {session.minX?.toFixed(0)} E · {session.minY?.toFixed(0)} N
					</div>
				)}
			</div>

			{/* Phase 1 bottom bar */}
			{phase1Result && (
				<div className="flex items-center gap-5 px-4 py-2 border-t border-neutral-800 flex-shrink-0 bg-neutral-950">
					{/* Primary toggle — heatmap on/off */}
					<MapToggle checked={showHeatmap} onChange={setShowHeatmap} label="Damage Heatmap" />
					{/* Secondary toggle — ignition likelihood hotspots */}
					<MapToggle checked={showIgnition} onChange={setShowIgnition} label="Ignition Hotspots" />
					<span className="text-xs font-mono text-neutral-700 ml-auto">
						{session?.rows ?? "—"}×{session?.cols ?? "—"} cells
					</span>
				</div>
			)}

			{/* Phase 1 analytics bar */}
			{phase1Result && <Phase1AnalyticsBar analytics={analytics} />}

			{/* Phase 2 analytics bar */}
			{phase2Result && <Phase2AnalyticsBar analytics={analytics} />}

			{/* Phase 2 playback bar */}
			{phase2Result && totalSteps > 0 && (
				<div className="flex items-center gap-2 px-4 py-2 border-t border-neutral-800 flex-shrink-0 bg-neutral-950">
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

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function WRaPDashboard() {
	const [session, setSession] = useState(null);
	const [connError, setConnError] = useState(null);
	const [refreshing, setRefreshing] = useState(false);

	const [phase1Result, setPhase1Result] = useState(null);
	const [phase2Result, setPhase2Result] = useState(null);
	const [analytics, setAnalytics] = useState(null);
	const [runningP1, setRunningP1] = useState(false);
	const [runningP2, setRunningP2] = useState(false);
	const [correcting, setCorrecting] = useState(false);

	const [showIgnition, setShowIgnition] = useState(false);
	const [showHeatmap, setShowHeatmap] = useState(true); // on by default — primary Phase 1 output
	const [showVeg, setShowVeg] = useState(false);
	const [vegPalette, setVegPalette] = useState("natural");
	const [showTopo, setShowTopo] = useState(false);

	// gridEnv — loaded from GET /api/session/grid once on startup
	// Provides vegetation + elevation for terrain render before any simulation run
	const [gridEnv, setGridEnv] = useState(null);
	const [switchingMode, setSwitchingMode] = useState(false);

	const [drawMode, setDrawMode] = useState(false);
	const [drawnPoints, setDrawnPoints] = useState(null);
	const [drawnGeoJson, setDrawnGeoJson] = useState("");

	const [log, setLog] = useState([]);
	const [clock, setClock] = useState("");
	const [advOpen, setAdvOpen] = useState(false);

	// Past runs — loaded from GET /api/runs, not from session.pastRuns
	// session.pastRuns is populated by WrapSessionFacade but may be empty if the
	// facade hasn't loaded run history. GET /api/runs reads directly from disk.
	const [pastRuns, setPastRuns] = useState([]);

	const addLog = useCallback((msg) => {
		const ts = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
		setLog((prev) => [...prev.slice(-100), `[${ts}] ${msg}`]);
	}, []);

	// Fetch past runs from the dedicated endpoint
	const fetchPastRuns = useCallback(async () => {
		try {
			const runs = await apiFetch("/api/runs");
			// Sort most-recent first (completedAt descending)
			const sorted = [...runs].sort((a, b) => new Date(b.completedAt ?? b.startedAt ?? 0) - new Date(a.completedAt ?? a.startedAt ?? 0));
			setPastRuns(sorted);
		} catch (e) {
			addLog(`WARNING: Could not load run history — ${e.message}`);
		}
	}, [addLog]);

	// Fetch static grid environment — vegetation + elevation for terrain render
	// Endpoint: GET /api/session/grid (Group 12 — see grid_env_and_mode-endpoint-contract.md)
	const fetchGridEnv = useCallback(async () => {
		try {
			const data = await apiFetch("/api/session/grid");
			setGridEnv(data);
			addLog(`CORE: Grid environment loaded — ${data.rows}×${data.cols} cells, elev range available`);
		} catch (e) {
			addLog(`WARNING: Grid environment unavailable — ${e.message}. Terrain render disabled until endpoint is live.`);
		}
	}, [addLog]);

	// Manual mode switch — POST /api/session/mode (Group 12)
	const handleModeSwitch = useCallback(
		async (targetMode) => {
			setSwitchingMode(true);
			addLog(`STATUS: Requesting mode switch → ${targetMode}...`);
			try {
				const data = await apiFetch("/api/session/mode", {
					method: "POST",
					body: JSON.stringify({ mode: targetMode }),
				});
				setSession(data);
				addLog(`EVENT: Mode switched to ${data.mode}`);
				if (targetMode === "ACTIVE_FIRE") addLog("STATUS: Draw an ignition zone on the map to start a spread simulation.");
			} catch (e) {
				addLog(`ERROR: Mode switch failed — ${e.message}`);
			} finally {
				setSwitchingMode(false);
			}
		},
		[addLog],
	);

	// Initial load
	useEffect(() => {
		addLog("STATUS: System initialising...");
		apiFetch("/api/session/status")
			.then((data) => {
				setSession(data);
				setConnError(null);
				addLog(`STATUS: Session connected. Mode: ${data.mode}`);
				addLog(`CORE: Grid ${data.rows}×${data.cols} @ ${data.cellSizeMetres}m/cell`);
				fetchGridEnv();
			})
			.catch((e) => {
				setConnError("Could not connect to WRaP engine. Is the server running on port 8080?");
				addLog(`ERROR: ${e.message}`);
			});
		fetchPastRuns();
	}, [addLog, fetchPastRuns, fetchGridEnv]);

	// Clock
	useEffect(() => {
		const tick = () => setClock(new Date().toLocaleString("en-GB", { dateStyle: "short", timeStyle: "medium" }));
		tick();
		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	}, []);

	// Refresh
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

	// Phase 1
	const handleRunP1 = useCallback(
		async (body) => {
			setRunningP1(true);
			setPhase1Result(null);
			setPhase2Result(null);
			setAnalytics(null);
			addLog("STATUS: Launching Monte Carlo risk assessment...");
			if (body.windSpeedMsOverride != null) addLog(`DATA: Wind override ${body.windSpeedMsOverride}m/s @ ${body.windDirectionDegOverride}°`);
			try {
				const result = await apiFetch("/api/simulation/phase-one/run", {
					method: "POST",
					body: JSON.stringify(body),
				});
				setPhase1Result(result);
				setAnalytics(result.analytics ?? null);
				addLog(`CORE: Assessment complete. RunId: ${result.runId}`);
				addLog(`CORE: ${result.rows}×${result.cols} · ${result.damagePotentialValues?.length ?? 0} cells`);
				if (result.analytics?.highRiskAreaHectares != null)
					addLog(
						`EVENT: ${result.analytics.highRiskAreaHectares.toFixed(0)} ha at elevated risk · Primary fuel: ${result.analytics.dominantVegetationType?.replace(/_/g, " ") ?? "—"}`,
					);
				const sess = await apiFetch("/api/session/status");
				setSession(sess);
				await fetchPastRuns();
			} catch (e) {
				addLog(`ERROR: Phase 1 failed — ${e.message}`);
			} finally {
				setRunningP1(false);
			}
		},
		[addLog, fetchPastRuns],
	);

	// Phase 2
	const handleRunP2 = useCallback(
		async (body) => {
			setRunningP2(true);
			setPhase1Result(null);
			setPhase2Result(null);
			setAnalytics(null);
			addLog("STATUS: Launching spread simulation...");
			addLog(`DATA: Horizon ${body.simulationHours}h · Manual ignition: ${body.manualIgnition}`);
			try {
				const result = await apiFetch("/api/simulation/phase-two/run", {
					method: "POST",
					body: JSON.stringify(body),
				});
				setPhase2Result(result);
				setAnalytics(result.analytics ?? null);
				addLog(`CORE: Simulation complete. RunId: ${result.runId}`);
				addLog(`CORE: ${result.perimetersByTimestamp?.length ?? 0} perimeter snapshots`);
				if (result.analytics?.finalBurnedAreaHectares != null)
					addLog(
						`EVENT: ${result.analytics.finalBurnedAreaHectares.toFixed(0)} ha burned · Peak ROS: ${result.analytics.peakRosHectaresPerHour?.toFixed(0) ?? "—"} ha/hr`,
					);
				if (result.analytics?.burnedAreaByVegetationType?.AFROMONTANE_FOREST > 0)
					addLog(
						`WARNING: Forest loss detected — ${result.analytics.burnedAreaByVegetationType.AFROMONTANE_FOREST.toFixed(1)} ha`,
					);
				const sess = await apiFetch("/api/session/status");
				setSession(sess);
				await fetchPastRuns();
			} catch (e) {
				addLog(`ERROR: Phase 2 failed — ${e.message}`);
			} finally {
				setRunningP2(false);
			}
		},
		[addLog, fetchPastRuns],
	);

	// CV Correction
	const handleCorrect = useCallback(
		async (body) => {
			setCorrecting(true);
			addLog("STATUS: Injecting CV observation correction...");
			try {
				await apiFetch("/api/simulation/phase-two/correct", {
					method: "POST",
					body: JSON.stringify(body),
				});
				addLog("EVENT: CV correction injected. CA resumes from corrected state.");
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

	// Draw mode
	const handleStartDraw = useCallback(() => {
		setDrawMode(true);
		setDrawnPoints(null);
		setDrawnGeoJson("");
		addLog("STATUS: Draw mode active. Click on map to place perimeter vertices.");
	}, [addLog]);

	const handleDrawComplete = useCallback(
		(points) => {
			const geoJson = pixelPointsToGeoJson(points, session);
			if (!geoJson) {
				addLog("WARNING: Polygon requires ≥ 3 vertices.");
				return;
			}
			setDrawnPoints(points);
			setDrawnGeoJson(geoJson);
			setDrawMode(false);
			addLog(`EVENT: Ignition polygon captured (${points.length} vertices, UTM 37S metres).`);
		},
		[addLog, session],
	);

	const handleDrawCancel = useCallback(() => {
		setDrawMode(false);
		addLog("STATUS: Draw mode cancelled.");
	}, [addLog]);

	return (
		<div className="flex flex-col w-screen h-screen bg-neutral-950 text-neutral-200 overflow-hidden relative">
			{/* Advanced settings modal */}
			<AdvancedSettingsPanel open={advOpen} onClose={() => setAdvOpen(false)} />

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
					{/* Mode toggle — POST /api/session/mode */}
					{session && (
						<button
							onClick={() => handleModeSwitch(session.mode === "PRE_FIRE" ? "ACTIVE_FIRE" : "PRE_FIRE")}
							disabled={switchingMode}
							className={`text-xs font-mono border px-2 py-1 transition-colors disabled:opacity-40 ${
								session.mode === "ACTIVE_FIRE"
									? "bg-red-950 border-red-700 text-red-300 hover:bg-red-900"
									: "bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-amber-700 hover:text-amber-400"
							}`}
						>
							{switchingMode ? "..." : session.mode === "PRE_FIRE" ? "→ ACTIVE FIRE" : "→ PRE-FIRE"}
						</button>
					)}
					{/* Advanced settings button */}
					<button
						onClick={() => setAdvOpen(true)}
						className="text-xs font-mono text-neutral-600 hover:text-neutral-400 border border-neutral-800 hover:border-neutral-600 px-2 py-1 transition-colors"
					>
						⚙ SETTINGS
					</button>
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
				<div className="w-72 flex-shrink-0">
					<LeftPanel
						session={session}
						pastRuns={pastRuns}
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

				<div className="flex-1 min-w-0">
					<CentrePanel
						session={session}
						gridEnv={gridEnv}
						phase1Result={phase1Result}
						phase2Result={phase2Result}
						showIgnition={showIgnition}
						setShowIgnition={setShowIgnition}
						showHeatmap={showHeatmap}
						setShowHeatmap={setShowHeatmap}
						showVeg={showVeg}
						showTopo={showTopo}
						vegPalette={vegPalette}
						analytics={analytics}
						drawMode={drawMode}
						onDrawComplete={handleDrawComplete}
						onDrawCancel={handleDrawCancel}
						drawnPoints={drawnPoints}
					/>
				</div>

				<div className="w-72 flex-shrink-0">
					<RightPanel
						session={session}
						gridEnv={gridEnv}
						phase1Result={phase1Result}
						phase2Result={phase2Result}
						showVeg={showVeg}
						setShowVeg={setShowVeg}
						showTopo={showTopo}
						setShowTopo={setShowTopo}
						vegPalette={vegPalette}
						setVegPalette={setVegPalette}
						log={log}
						onCorrect={handleCorrect}
						correcting={correcting}
					/>
				</div>
			</div>
		</div>
	);
}

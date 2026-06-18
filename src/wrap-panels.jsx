// ─── wrap-panels.jsx ──────────────────────────────────────────────────────────
// LeftPanel: controls, run simulation, past runs, operator badge.
// RightPanel: grid info, vegetation legend, CV correction form, simulation log.

import { useState } from "react";
import { StatusPill, FlatButton, InputField, TextArea, Toggle, SectionTitle, LogPanel, MapToggle } from "./wrap-components.jsx";
import { VEG_TYPES, vegHex } from "./utils/utils.js";

// ─── Analytics helpers ────────────────────────────────────────────────────────
function fmt(v, unit = "", dp = 1) {
	return v !== null && v !== undefined ? `${Number(v).toFixed(dp)}${unit}` : "—";
}

function rosLabel(haPhr) {
	if (haPhr === null || haPhr === undefined) return { text: "—", color: "text-neutral-500" };
	if (haPhr > 120) return { text: "EXTREME", color: "text-red-400" };
	if (haPhr > 60) return { text: "FAST", color: "text-orange-400" };
	if (haPhr > 20) return { text: "MODERATE", color: "text-amber-400" };
	return { text: "SLOW", color: "text-green-600" };
}

// A single metric card used in the analytics bar
function MetricCard({ label, value, sub, accent = false, wide = false }) {
	return (
		<div className={`flex flex-col justify-between border border-neutral-800 bg-neutral-900 px-3 py-2 ${wide ? "col-span-2" : ""}`}>
			<div className="text-xs font-mono text-neutral-600 tracking-wider uppercase leading-4">{label}</div>
			<div className={`text-lg font-mono font-bold leading-6 ${accent ? "text-amber-400" : "text-neutral-200"}`}>{value}</div>
			{sub && <div className="text-xs font-mono text-neutral-600 leading-4">{sub}</div>}
		</div>
	);
}

// Vegetation breakdown bar — used in analytics for both phases
function VegBreakdown({ data, label, vegPalette = "natural" }) {
	if (!data || Object.keys(data).length === 0) return null;
	const entries = Object.entries(data).sort(([, a], [, b]) => b - a);
	const total = entries.reduce((s, [, v]) => s + v, 0) || 1;

	return (
		<div>
			<div className="text-xs font-mono text-neutral-600 tracking-wider uppercase mb-1">{label}</div>
			<div className="flex flex-col gap-1">
				{entries.map(([type, ha]) => {
					const idx = VEG_TYPES.findIndex((v) => v.label.toUpperCase().replace(/ /g, "_") === type);
					const veg = VEG_TYPES[idx] ?? { label: type, natural: "#555", highContrast: "#555" };
					const color = idx >= 0 ? vegHex(idx, vegPalette) : "#555";
					const pct = (ha / total) * 100;
					return (
						<div key={type}>
							<div className="flex justify-between mb-0.5">
								<span className="text-xs font-mono text-neutral-500">{veg.label ?? type}</span>
								<span className="text-xs font-mono text-neutral-400">{fmt(ha, " ha", 1)}</span>
							</div>
							<div className="h-1.5 bg-neutral-800 w-full">
								<div className="h-full" style={{ width: `${pct}%`, backgroundColor: color }} />
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ─── Analytics Bar (Phase 1) ──────────────────────────────────────────────────
// Rendered below the canvas after a Phase 1 run. Full centre-panel width.
export function Phase1AnalyticsBar({ analytics }) {
	if (!analytics) return null;
	const {
		highRiskAreaHectares,
		dominantVegetationType,
		highRiskCellCount,
		highRiskAreaByVegetationType,
		topIgnitionSeeds,
		topIgnitionSeedScores,
		simulatedHorizonHours,
	} = analytics;

	const [expanded, setExpanded] = useState(false);

	return (
		<div className="border-t border-neutral-800 bg-neutral-950 flex-shrink-0">
			{/* Collapsed summary row */}
			<div className="flex items-center gap-4 px-4 py-2">
				<div className="flex items-center gap-1.5">
					<span className="text-xs font-mono text-neutral-600 uppercase tracking-wider">Risk Area</span>
					<span className="text-sm font-mono font-bold text-amber-400">{fmt(highRiskAreaHectares, " ha", 0)}</span>
				</div>
				<div className="flex items-center gap-1.5">
					<span className="text-xs font-mono text-neutral-600 uppercase tracking-wider">Primary Fuel</span>
					<span className="text-sm font-mono font-bold text-neutral-300">
						{dominantVegetationType ? dominantVegetationType.replace(/_/g, " ") : "—"}
					</span>
				</div>
				<div className="flex items-center gap-1.5">
					<span className="text-xs font-mono text-neutral-600 uppercase tracking-wider">Horizon</span>
					<span className="text-sm font-mono font-bold text-neutral-300">{fmt(simulatedHorizonHours, "h", 0)}</span>
				</div>
				<div className="flex items-center gap-1.5">
					<span className="text-xs font-mono text-neutral-600 uppercase tracking-wider">High-Risk Cells</span>
					<span className="text-sm font-mono font-bold text-neutral-300">{highRiskCellCount ?? "—"}</span>
				</div>
				<button
					onClick={() => setExpanded((e) => !e)}
					className="ml-auto text-xs font-mono text-neutral-600 hover:text-neutral-300 border border-neutral-800 hover:border-neutral-600 px-2 py-1 transition-colors"
				>
					{expanded ? "▲ LESS" : "▼ DETAIL"}
				</button>
			</div>

			{/* Expanded detail */}
			{expanded && (
				<div className="px-4 pb-4 border-t border-neutral-800">
					<div className="grid grid-cols-4 gap-2 mt-3">
						<MetricCard
							label="High-Risk Area"
							value={fmt(highRiskAreaHectares, " ha", 0)}
							sub="≥ 75th percentile burn freq"
							accent
						/>
						<MetricCard label="High-Risk Cells" value={highRiskCellCount ?? "—"} sub="top quartile of ensemble" />
						<MetricCard label="Forecast Window" value={fmt(simulatedHorizonHours, " hours", 0)} sub="Monte Carlo horizon" />
						<MetricCard
							label="Primary Fuel"
							value={dominantVegetationType?.replace(/_/g, " ") ?? "—"}
							sub="dominant high-risk type"
						/>
					</div>

					{/* Top seeds */}
					{topIgnitionSeeds?.length > 0 && (
						<div className="mt-3">
							<div className="text-xs font-mono text-neutral-600 tracking-wider uppercase mb-2">
								Top Ignition Seeds
							</div>
							<div className="flex gap-2 flex-wrap">
								{topIgnitionSeeds.map((seed, i) => {
									const score = topIgnitionSeedScores?.[i];
									const isHigh = score >= 0.8;
									return (
										<div
											key={i}
											className={`flex items-center gap-1.5 border px-2 py-1 ${isHigh ? "border-red-800 bg-red-950" : "border-neutral-700 bg-neutral-900"}`}
										>
											<div
												className={`w-4 h-4 flex items-center justify-center text-xs font-mono font-bold ${isHigh ? "text-red-300" : "text-amber-500"}`}
											>
												{i + 1}
											</div>
											<span className="text-xs font-mono text-neutral-500">cell {seed}</span>
											{score != null && (
												<span
													className={`text-xs font-mono font-bold ${isHigh ? "text-red-400" : "text-amber-600"}`}
												>
													{Math.round(score * 100)}%
												</span>
											)}
										</div>
									);
								})}
							</div>
							{topIgnitionSeedScores?.some((s) => s >= 0.8) && (
								<p className="text-xs font-mono text-red-600 mt-1">
									⚠ Seed scores above 80% warrant immediate attention
								</p>
							)}
						</div>
					)}

					{/* Veg breakdown */}
					<div className="mt-3">
						<VegBreakdown data={highRiskAreaByVegetationType} label="High-Risk Area by Fuel Type (ha)" />
					</div>
				</div>
			)}
		</div>
	);
}

// ─── Analytics Bar (Phase 2) ──────────────────────────────────────────────────
export function Phase2AnalyticsBar({ analytics }) {
	if (!analytics) return null;
	const {
		finalBurnedAreaHectares,
		peakRosHectaresPerHour,
		stepAtPeakRos,
		perimeterLengthMetres,
		naturalBarrierCellsEncountered,
		burnedAreaByVegetationType,
		simulatedDurationHours,
		generationsRun,
	} = analytics;

	const [expanded, setExpanded] = useState(false);
	const ros = rosLabel(peakRosHectaresPerHour);
	const perimKm = perimeterLengthMetres != null ? (perimeterLengthMetres / 1000).toFixed(1) : "—";

	return (
		<div className="border-t border-neutral-800 bg-neutral-950 flex-shrink-0">
			{/* Collapsed summary row */}
			<div className="flex items-center gap-4 px-4 py-2">
				<div className="flex items-center gap-1.5">
					<span className="text-xs font-mono text-neutral-600 uppercase tracking-wider">Burned</span>
					<span className="text-sm font-mono font-bold text-amber-400">{fmt(finalBurnedAreaHectares, " ha", 0)}</span>
				</div>
				<div className="flex items-center gap-1.5">
					<span className="text-xs font-mono text-neutral-600 uppercase tracking-wider">Peak ROS</span>
					<span className={`text-sm font-mono font-bold ${ros.color}`}>
						{fmt(peakRosHectaresPerHour, " ha/hr", 0)} · {ros.text}
					</span>
				</div>
				<div className="flex items-center gap-1.5">
					<span className="text-xs font-mono text-neutral-600 uppercase tracking-wider">Perimeter</span>
					<span className="text-sm font-mono font-bold text-neutral-300">{perimKm} km</span>
				</div>
				<div className="flex items-center gap-1.5">
					<span className="text-xs font-mono text-neutral-600 uppercase tracking-wider">Duration</span>
					<span className="text-sm font-mono font-bold text-neutral-300">{fmt(simulatedDurationHours, "h", 1)}</span>
				</div>
				<button
					onClick={() => setExpanded((e) => !e)}
					className="ml-auto text-xs font-mono text-neutral-600 hover:text-neutral-300 border border-neutral-800 hover:border-neutral-600 px-2 py-1 transition-colors"
				>
					{expanded ? "▲ LESS" : "▼ DETAIL"}
				</button>
			</div>

			{/* Expanded detail */}
			{expanded && (
				<div className="px-4 pb-4 border-t border-neutral-800">
					<div className="grid grid-cols-4 gap-2 mt-3">
						<MetricCard label="Burned Area" value={fmt(finalBurnedAreaHectares, " ha", 0)} sub="at simulation end" accent />
						<MetricCard
							label="Peak Spread Rate"
							value={fmt(peakRosHectaresPerHour, " ha/hr", 0)}
							sub={ros.text + (stepAtPeakRos != null ? ` · at step ${stepAtPeakRos}` : "")}
							accent
						/>
						<MetricCard label="Active Perimeter" value={`${perimKm} km`} sub="approx linear length" />
						<MetricCard
							label="Natural Barriers"
							value={naturalBarrierCellsEncountered ?? "—"}
							sub={naturalBarrierCellsEncountered > 0 ? "bounded flanks" : "no boundary cover"}
						/>
					</div>

					{/* ROS severity guide */}
					<div className="mt-3 border border-neutral-800 px-3 py-2">
						<div className="text-xs font-mono text-neutral-600 uppercase tracking-wider mb-2">Spread Severity Guide</div>
						<div className="grid grid-cols-4 gap-1">
							{[
								["> 120 ha/hr", "EXTREME", "text-red-400", "bg-red-950 border-red-800"],
								["60–120", "FAST", "text-orange-400", "bg-orange-950 border-orange-800"],
								["20–60", "MODERATE", "text-amber-400", "bg-amber-950 border-amber-800"],
								["< 20", "SLOW", "text-green-500", "bg-neutral-900 border-neutral-700"],
							].map(([range, label, textCls, bgCls]) => (
								<div
									key={label}
									className={`border px-2 py-1 ${bgCls} ${peakRosHectaresPerHour != null && ros.text === label ? "ring-1 ring-white ring-opacity-20" : ""}`}
								>
									<div className={`text-xs font-mono font-bold ${textCls}`}>{label}</div>
									<div className="text-xs font-mono text-neutral-600">{range}</div>
								</div>
							))}
						</div>
					</div>

					{/* Burned area by veg */}
					<div className="mt-3">
						<VegBreakdown data={burnedAreaByVegetationType} label="Burned Area by Fuel Type (ha)" />
					</div>

					{/* Forest flag */}
					{burnedAreaByVegetationType?.AFROMONTANE_FOREST > 0 && (
						<div className="mt-2 border border-amber-800 bg-amber-950 px-3 py-2">
							<p className="text-xs font-mono text-amber-300">
								⚠ Forest loss detected ({fmt(burnedAreaByVegetationType.AFROMONTANE_FOREST, " ha", 1)}) — KWS
								involvement recommended
							</p>
						</div>
					)}

					<div className="mt-2 text-xs font-mono text-neutral-700">
						{generationsRun ?? "—"} CA generations · {fmt(simulatedDurationHours, "h", 1)} simulated
					</div>
				</div>
			)}
		</div>
	);
}

// ─── Past Runs List ───────────────────────────────────────────────────────────
function PastRunsList({ runs }) {
	if (!runs || runs.length === 0) return <p className="text-xs font-mono text-neutral-700">No runs recorded.</p>;

	return (
		<div className="flex flex-col gap-1">
			{runs.map((r) => {
				const time = r.completedAt ? new Date(r.completedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";
				const label = r.phase === "ACTIVE_FIRE" ? "Spread Sim" : "Risk Assess";
				// RunRecord.parameters contains the SimulationConfig snapshot
				const p = r.parameters ?? {};
				const sub = [
					p.cellSizeMetres != null ? `${p.cellSizeMetres}m` : null,
					p.monteCarloRuns != null ? `N=${p.monteCarloRuns}` : null,
					p.timeStepMinutes != null ? `Δt=${p.timeStepMinutes}min` : null,
				]
					.filter(Boolean)
					.join(" · ");
				return (
					<div
						key={r.runId}
						className="border border-neutral-800 bg-neutral-900 px-2 py-2 hover:border-neutral-600 cursor-pointer transition-colors"
					>
						<div className="flex justify-between items-center">
							<span className="text-xs font-mono font-bold text-neutral-300 truncate max-w-32">
								{(r.runId ?? "—").slice(0, 12).toUpperCase()}
							</span>
							<span className="text-xs font-mono text-neutral-500 flex-shrink-0">{time}</span>
						</div>
						<div className="text-xs font-mono text-neutral-600">{label}</div>
						{sub && <div className="text-xs font-mono text-neutral-700 mt-0.5">{sub}</div>}
					</div>
				);
			})}
		</div>
	);
}

// ─── Left Panel ───────────────────────────────────────────────────────────────
export function LeftPanel({
	session,
	pastRuns, // from GET /api/runs — passed from root app
	onRefresh,
	refreshing,
	onRunP1,
	runningP1,
	onRunP2,
	runningP2,
	onStartDraw,
	drawMode,
	drawnGeoJson,
}) {
	const [windSpeed, setWindSpeed] = useState("");
	const [windDir, setWindDir] = useState("");
	const [simHours, setSimHours] = useState("24");
	const [manualIgn, setManualIgn] = useState(false);
	const [geoJsonTxt, setGeoJsonTxt] = useState("");

	const mode = session?.mode ?? "PRE_FIRE";

	// When draw mode produces a polygon, push it into the textarea
	const activeGeoJson = drawnGeoJson || geoJsonTxt;

	return (
		<div className="flex flex-col h-full overflow-hidden border-r border-neutral-800 bg-neutral-950">
			{/* Header */}
			<div className="p-4 border-b border-neutral-800 flex-shrink-0">
				<div className="text-xs font-mono text-neutral-600 tracking-widest mb-2 uppercase">System Status</div>
				<StatusPill mode={mode} />
			</div>

			<div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 min-h-0">
				{/* ── Refresh ── */}
				<div>
					<FlatButton onClick={onRefresh} loading={refreshing}>
						↻ REFRESH SATELLITE DATA
					</FlatButton>
					{session && (
						<div className="flex justify-between mt-1">
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

				{/* ── Run Simulation ── */}
				<div>
					<SectionTitle>Run Simulation</SectionTitle>

					{mode === "PRE_FIRE" ? (
						/* Phase 1 controls — FR-P1-01 through FR-P1-04 */
						<div className="flex flex-col gap-3">
							<p className="text-xs font-mono text-neutral-600">Configure environmental vectors</p>
							<InputField
								label="Wind Speed (m/s)"
								value={windSpeed}
								onChange={setWindSpeed}
								placeholder="e.g. 12.5 (leave blank = ERA5)"
								type="number"
							/>
							<InputField
								label="Wind Direction (°)"
								value={windDir}
								onChange={setWindDir}
								placeholder="e.g. 225 (FROM-direction)"
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
						/* Phase 2 controls — FR-P2-01 */
						<div className="flex flex-col gap-3">
							<InputField
								label="Duration (Hours)"
								value={simHours}
								onChange={setSimHours}
								placeholder="24"
								type="number"
							/>

							<Toggle
								label="Manual Ignition"
								checked={manualIgn}
								onChange={(v) => {
									setManualIgn(v);
									if (!v) setGeoJsonTxt("");
								}}
							/>

							{manualIgn && (
								<div className="flex flex-col gap-2">
									{/* Option A — draw on map */}
									<FlatButton
										variant={drawMode ? "running" : "default"}
										onClick={onStartDraw}
										disabled={drawMode}
									>
										{drawMode ? "● DRAWING ON MAP..." : "✎ DRAW PERIMETER ON MAP"}
									</FlatButton>

									{/* Drawn polygon feedback */}
									{drawnGeoJson && !drawMode && (
										<div className="text-xs font-mono text-green-600 border border-green-900 px-2 py-1 bg-green-950">
											✓ POLYGON CAPTURED ({drawnGeoJson.length} chars)
										</div>
									)}

									{/* Option B — paste GeoJSON */}
									<div className="text-xs font-mono text-neutral-600 text-center">
										— or paste GeoJSON —
									</div>
									<TextArea
										placeholder={'{"type":"Feature","geometry":{"type":"Polygon",...}}'}
										value={geoJsonTxt}
										onChange={setGeoJsonTxt}
										rows={4}
										disabled={!!drawnGeoJson}
									/>
								</div>
							)}

							<FlatButton
								variant="danger"
								loading={runningP2}
								disabled={manualIgn && !activeGeoJson}
								onClick={() =>
									onRunP2({
										cvDisabled: false,
										manualIgnition: manualIgn,
										manualIgnitionPolygonGeoJson: manualIgn ? activeGeoJson : null,
										simulationHours: parseInt(simHours) || 24,
									})
								}
							>
								{runningP2 ? "■ RUNNING..." : "⚡ RUN SPREAD SIMULATION"}
							</FlatButton>
						</div>
					)}
				</div>

				{/* ── Past Runs ── */}
				<div>
					<SectionTitle>Past Runs</SectionTitle>
					<PastRunsList runs={pastRuns} />
				</div>
			</div>

			{/* Operator badge */}
			<div className="p-3 border-t border-neutral-800 flex items-center gap-2 flex-shrink-0">
				<div className="w-7 h-7 bg-neutral-800 border border-neutral-600 flex items-center justify-center text-xs font-mono text-neutral-400 flex-shrink-0">
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

// ─── CV Correction Form ───────────────────────────────────────────────────────
// UC-03: POST /api/simulation/phase-two/correct
// Fields match CvCorrectionRequestDto exactly.
function CvCorrectionForm({ onCorrect, correcting }) {
	const [perimeterGeoJson, setPerimeterGeoJson] = useState("");
	const [suppressedCellIds, setSuppressedCellIds] = useState("");
	const [moistureValuesRaw, setMoistureValuesRaw] = useState("");
	const [expanded, setExpanded] = useState(false);

	const submit = () => {
		// Parse suppressed cell IDs: comma-separated decimal strings
		const suppressedZoneCellIds = suppressedCellIds
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);

		// Parse moisture values: "cellId:value,..." format
		const updatedMoistureValues = {};
		moistureValuesRaw.split(",").forEach((pair) => {
			const [k, v] = pair.split(":").map((s) => s.trim());
			if (k && v && !isNaN(parseFloat(v))) updatedMoistureValues[k] = parseFloat(v);
		});

		onCorrect({
			observedPerimeterGeoJson: perimeterGeoJson || null,
			suppressedZoneCellIds: suppressedZoneCellIds.length > 0 ? suppressedZoneCellIds : null,
			updatedMoistureValues: Object.keys(updatedMoistureValues).length > 0 ? updatedMoistureValues : null,
		});
	};

	return (
		<div className="border border-neutral-800 bg-neutral-900">
			<button
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono text-neutral-400 hover:text-neutral-200 transition-colors"
			>
				<span className="tracking-widest uppercase">CV Correction Inject</span>
				<span className="text-neutral-600">{expanded ? "▲" : "▼"}</span>
			</button>

			{expanded && (
				<div className="px-3 pb-3 flex flex-col gap-2 border-t border-neutral-800">
					<p className="text-xs font-mono text-neutral-600 pt-2">POST /api/simulation/phase-two/correct</p>
					<TextArea
						label="Observed Perimeter GeoJSON (optional)"
						value={perimeterGeoJson}
						onChange={setPerimeterGeoJson}
						placeholder="GeoJSON polygon — for logging only"
						rows={3}
					/>
					<TextArea
						label="Suppressed Cell IDs (comma-separated)"
						value={suppressedCellIds}
						onChange={setSuppressedCellIds}
						placeholder="e.g. 1024,1025,2048"
						rows={2}
					/>
					<TextArea
						label="Moisture Updates (cellId:value, ...)"
						value={moistureValuesRaw}
						onChange={setMoistureValuesRaw}
						placeholder="e.g. 1024:0.12, 1025:0.09"
						rows={2}
					/>
					<FlatButton variant="primary" loading={correcting} onClick={submit}>
						{correcting ? "■ INJECTING..." : "⬆ INJECT CORRECTION"}
					</FlatButton>
					<p className="text-xs font-mono text-neutral-700">All fields optional. Empty suppression list is valid per FR-CV-02.</p>
				</div>
			)}
		</div>
	);
}

// ─── Right Panel ──────────────────────────────────────────────────────────────
export function RightPanel({
	session,
	gridEnv,
	phase1Result,
	phase2Result,
	showFuelRisk,
	setShowFuelRisk,
	showVeg,
	setShowVeg,
	showTopo,
	setShowTopo,
	vegPalette,
	setVegPalette,
	log,
	onCorrect,
	correcting,
}) {
	const mode = session?.mode ?? "PRE_FIRE";
	const isHighContrast = vegPalette === "highContrast";

	return (
		<div className="flex flex-col h-full border-l border-neutral-800 bg-neutral-950 overflow-hidden">
			<div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 min-h-0">
				{/* ── Grid Info ── */}
				<div>
					<SectionTitle>Grid Info</SectionTitle>
					<div className="grid grid-cols-2 gap-x-4 gap-y-2">
						{[
							["RESOLUTION", session ? `${session.cellSizeMetres}m/CELL` : "—"],
							["CELLS", session ? `${((session.rows * session.cols) / 1000).toFixed(1)}k` : "—"],
							["ROWS", session?.rows ?? "—"],
							["COLS", session?.cols ?? "—"],
						].map(([k, v]) => (
							<div key={k}>
								<div className="text-xs font-mono text-neutral-700 tracking-widest">{k}</div>
								<div className="text-sm font-mono text-neutral-300 font-bold">{String(v)}</div>
							</div>
						))}
					</div>
					{session && (
						<div className="mt-2">
							<div className="text-xs font-mono text-neutral-700 tracking-widest">UTM COORDINATES</div>
							<div className="text-xs font-mono text-amber-700 mt-0.5">
								{session.minX?.toFixed(0)} E · {session.minY?.toFixed(0)} N
							</div>
						</div>
					)}
				</div>

				{/* ── Terrain Layers — always visible once gridEnv loads ── */}
				{gridEnv && (
					<div>
						<SectionTitle>Map Layers</SectionTitle>
						<div className="flex flex-col gap-2">
							{session?.fuelRiskValues && <MapToggle checked={showFuelRisk} onChange={setShowFuelRisk} label="CV Fuel Risk" />}
							<MapToggle checked={showTopo} onChange={setShowTopo} label="Topographic Contours" />
							{phase1Result && <MapToggle checked={showVeg} onChange={setShowVeg} label="Vegetation Overlay" />}
						</div>
						{showTopo && (
							<p className="text-xs font-mono text-neutral-700 mt-2 leading-4">50m intervals · major lines at 200m</p>
						)}
					</div>
				)}

				{/* ── Vegetation Layer legend (Phase 1 only) — FR-P1-05 / DEV-005 ── */}
				{phase1Result && (
					<div>
						<div className="flex items-center justify-between border-b border-neutral-800 pb-1 mb-2">
							<span className="text-xs font-mono font-bold tracking-widest text-neutral-400 uppercase">
								Vegetation Layer
							</span>
							<MapToggle checked={showVeg} onChange={setShowVeg} label="" />
						</div>
						{/* Palette toggle */}
						<div className="flex gap-1 mb-2">
							<button
								onClick={() => setVegPalette("natural")}
								className={`flex-1 px-2 py-1 text-xs font-mono border transition-colors ${
									!isHighContrast
										? "border-amber-600 bg-amber-950 text-amber-300"
										: "border-neutral-700 bg-neutral-900 text-neutral-500 hover:border-neutral-500"
								}`}
							>
								Natural
							</button>
							<button
								onClick={() => setVegPalette("highContrast")}
								className={`flex-1 px-2 py-1 text-xs font-mono border transition-colors ${
									isHighContrast
										? "border-amber-600 bg-amber-950 text-amber-300"
										: "border-neutral-700 bg-neutral-900 text-neutral-500 hover:border-neutral-500"
								}`}
							>
								High Contrast
							</button>
						</div>
						<div className="flex flex-col gap-1.5">
							{VEG_TYPES.map(({ label, natural, highContrast }, i) => {
								const color = isHighContrast ? highContrast : natural;
								return (
									<div key={label} className="flex items-center gap-2">
										<div
											className="w-3 h-3 flex-shrink-0 border border-neutral-700"
											style={{ backgroundColor: color }}
										/>
										<span className="text-xs font-mono text-neutral-500">{label}</span>
									</div>
								);
							})}
						</div>
					</div>
				)}

				{/* ── CV Correction (ACTIVE_FIRE only) — UC-03 ── */}
				{mode === "ACTIVE_FIRE" && (
					<div>
						<SectionTitle>Observation Correction</SectionTitle>
						<CvCorrectionForm onCorrect={onCorrect} correcting={correcting} />
					</div>
				)}
			</div>

			{/* ── Simulation Log ── */}
			<div className="p-4 border-t border-neutral-800 flex flex-col gap-2 flex-shrink-0" style={{ height: "260px" }}>
				<div className="flex items-center justify-between">
					<SectionTitle>Simulation Log</SectionTitle>
					<div className="w-2 h-2 rounded-full bg-amber-600 animate-pulse mb-1" />
				</div>
				<LogPanel entries={log} />
			</div>
		</div>
	);
}

// ─── wrap-panels.jsx ──────────────────────────────────────────────────────────
// LeftPanel: controls, run simulation, past runs, operator badge.
// RightPanel: grid info, vegetation legend, CV correction form, simulation log.

import { useState } from "react";
import { StatusPill, FlatButton, InputField, TextArea, Toggle, SectionTitle, LogPanel, MapToggle } from "./wrap-components.jsx";
import { VEG_TYPES } from "./utils/utils.js";

// ─── Past Runs List ───────────────────────────────────────────────────────────
function PastRunsList({ runs }) {
	if (!runs || runs.length === 0) return <p className="text-xs font-mono text-neutral-700">No runs recorded.</p>;

	return (
		<div className="flex flex-col gap-1">
			{runs.map((r) => {
				const time = r.completedAt ? new Date(r.completedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";
				const label = r.phase === "ACTIVE_FIRE" ? "Spread Sim" : "Risk Assess";
				const ws = r.parameters?.windSpeedMsOverride;
				const wd = r.parameters?.windDirectionDegOverride;
				const sub = ws != null ? `WS: ${ws}m/s · DIR: ${wd}°` : "";
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
						<div className="text-xs font-mono text-neutral-600">
							{label}
							{sub ? ` · ${sub}` : ""}
						</div>
					</div>
				);
			})}
		</div>
	);
}

// ─── Left Panel ───────────────────────────────────────────────────────────────
export function LeftPanel({ session, onRefresh, refreshing, onRunP1, runningP1, onRunP2, runningP2, onStartDraw, drawMode, drawnGeoJson }) {
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
					<PastRunsList runs={session?.pastRuns} />
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
export function RightPanel({ session, phase1Result, phase2Result, showVeg, setShowVeg, log, onCorrect, correcting }) {
	const mode = session?.mode ?? "PRE_FIRE";

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

				{/* ── Vegetation Layer (Phase 1 only) — FR-P1-05 / DEV-005 ── */}
				{phase1Result && (
					<div>
						<div className="flex items-center justify-between border-b border-neutral-800 pb-1 mb-2">
							<span className="text-xs font-mono font-bold tracking-widest text-neutral-400 uppercase">
								Vegetation Layer
							</span>
							<MapToggle checked={showVeg} onChange={setShowVeg} label="" />
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

				{/* ── Active Fire stats ── */}
				{mode === "ACTIVE_FIRE" && phase2Result && (
					<div>
						<SectionTitle>Fire Status</SectionTitle>
						<div className="grid grid-cols-2 gap-x-4 gap-y-2">
							<div>
								<div className="text-xs font-mono text-neutral-700">SNAPSHOTS</div>
								<div className="text-xl font-mono font-bold text-amber-600">
									{phase2Result.perimetersByTimestamp?.length ?? 0}
								</div>
							</div>
							<div>
								<div className="text-xs font-mono text-neutral-700">RUN ID</div>
								<div className="text-xs font-mono text-neutral-400 truncate">
									{phase2Result.runId?.slice(0, 12).toUpperCase() ?? "—"}
								</div>
							</div>
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

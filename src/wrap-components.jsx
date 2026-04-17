// ─── wrap-components.jsx ──────────────────────────────────────────────────────
// Shared UI primitive components. No API calls, no simulation state.

import { useEffect, useRef } from "react";

export function StatusPill({ mode }) {
	const isActive = mode === "ACTIVE_FIRE";
	return (
		<div
			className={`px-3 py-1.5 text-xs font-mono font-bold border ${
				isActive ? "bg-red-900 border-red-600 text-red-200" : "bg-amber-900 border-amber-600 text-amber-200"
			}`}
			style={{ letterSpacing: "0.15em" }}
		>
			{isActive ? "■ ACTIVE FIRE MODE" : "◆ RISK ASSESSMENT MODE"}
		</div>
	);
}

export function FlatButton({ onClick, disabled, loading, children, variant = "default", className = "" }) {
	const base =
		"w-full px-3 py-2 text-xs font-mono tracking-wider border transition-colors duration-150 " +
		"disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2";
	const variants = {
		default: "bg-neutral-800 border-neutral-600 text-neutral-200 hover:bg-neutral-700 hover:border-neutral-400",
		primary: "bg-amber-900 border-amber-500 text-amber-100 hover:bg-amber-800 hover:border-amber-300",
		danger: "bg-red-900  border-red-600  text-red-100  hover:bg-red-800",
		running: "bg-neutral-900 border-amber-700 text-amber-400 cursor-not-allowed",
	};
	return (
		<button onClick={onClick} disabled={disabled || loading} className={`${base} ${variants[loading ? "running" : variant]} ${className}`}>
			{loading && <span className="inline-block w-3 h-3 border border-amber-500 border-t-transparent rounded-full animate-spin" />}
			{children}
		</button>
	);
}

export function InputField({ label, value, onChange, placeholder, type = "text", disabled = false }) {
	return (
		<div className="flex flex-col gap-1">
			<label className="text-xs font-mono text-neutral-500 tracking-widest uppercase">{label}</label>
			<input
				type={type}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				disabled={disabled}
				className="bg-neutral-900 border border-neutral-700 text-neutral-200 font-mono text-sm px-2 py-1.5
                   focus:outline-none focus:border-amber-600 placeholder-neutral-700
                   disabled:opacity-40 disabled:cursor-not-allowed"
			/>
		</div>
	);
}

export function TextArea({ label, value, onChange, placeholder, rows = 5, disabled = false }) {
	return (
		<div className="flex flex-col gap-1">
			{label && <label className="text-xs font-mono text-neutral-500 tracking-widest uppercase">{label}</label>}
			<textarea
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				rows={rows}
				disabled={disabled}
				className="bg-neutral-900 border border-neutral-700 text-neutral-300 font-mono text-xs p-2
                   focus:outline-none focus:border-amber-600 resize-none placeholder-neutral-800
                   disabled:opacity-40"
			/>
		</div>
	);
}

export function Toggle({ checked, onChange, label }) {
	return (
		<div className="flex items-center justify-between">
			<span className="text-xs font-mono text-neutral-400 tracking-wider uppercase">{label}</span>
			<button
				onClick={() => onChange(!checked)}
				className={`relative w-10 h-5 border transition-colors flex-shrink-0 ${
					checked ? "bg-amber-800 border-amber-500" : "bg-neutral-800 border-neutral-600"
				}`}
			>
				<span
					className={`absolute top-0.5 w-4 h-4 transition-all ${checked ? "left-5" : "left-0.5"}`}
					style={{ backgroundColor: checked ? "#f59e0b" : "#555" }}
				/>
			</button>
		</div>
	);
}

export function SectionTitle({ children }) {
	return <div className="text-xs font-mono font-bold tracking-widest text-neutral-400 uppercase border-b border-neutral-800 pb-1 mb-3">{children}</div>;
}

export function LogPanel({ entries }) {
	const ref = useRef(null);
	useEffect(() => {
		if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
	}, [entries]);

	const typeColor = (t) => {
		if (t === "EVENT") return "text-amber-400";
		if (t === "WARNING" || t === "WARN") return "text-yellow-400";
		if (t === "ERROR") return "text-red-400";
		if (t === "CORE") return "text-blue-400";
		if (t === "DATA") return "text-cyan-600";
		return "text-neutral-500";
	};

	return (
		<div ref={ref} className="flex-1 overflow-y-auto bg-neutral-950 border border-neutral-800 p-2 font-mono text-xs leading-5 min-h-0">
			{entries.length === 0 && <span className="text-neutral-700">... awaiting operator command</span>}
			{entries.map((e, i) => {
				const m = e.match(/^\[([^\]]+)\]\s+(\w+):\s+(.*)/s);
				if (m) {
					const [, time, type, msg] = m;
					return (
						<div key={i}>
							<span className="text-neutral-700">[{time}]</span>{" "}
							<span className={`font-bold ${typeColor(type)}`}>{type}:</span>{" "}
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

export function ErrorBanner({ message }) {
	return (
		<div className="w-full bg-red-950 border-b border-red-800 px-4 py-2 font-mono text-xs text-red-300 flex items-center gap-2 flex-shrink-0">
			<span className="text-red-500 font-bold">✕</span>
			{message}
		</div>
	);
}

// Inline toggle switch used in map control bars
export function MapToggle({ checked, onChange, label }) {
	return (
		<div className="flex items-center gap-2">
			<span className="text-xs font-mono text-neutral-500 uppercase tracking-wider">{label}</span>
			<button
				onClick={() => onChange(!checked)}
				className={`w-8 h-4 border relative transition-colors flex-shrink-0 ${
					checked ? "bg-amber-900 border-amber-600" : "bg-neutral-800 border-neutral-600"
				}`}
			>
				<span
					className={`absolute top-0.5 w-3 h-3 transition-all ${checked ? "left-4" : "left-0.5"}`}
					style={{ backgroundColor: checked ? "#f59e0b" : "#555" }}
				/>
			</button>
		</div>
	);
}

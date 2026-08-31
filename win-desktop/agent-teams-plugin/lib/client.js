window.__ModuleLoader__.load({
	id: "@nanmicoder/dsh-agent-teams",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		/** Compact `provider/model` route, or just the model when the provider is absent. */
		function memberRouteLabel(member) {
			if (member === void 0) return "";
			const provider = member.provider?.trim() ?? "";
			const model = member.model?.trim() ?? "";
			if (provider !== "" && model !== "") return `${provider}/${model}`;
			return model;
		}
		/**
		* Compact route shown on a running task. Prefer the task's own snapshot
		* field; fall back to the assignee member when older hosts omit it.
		*/
		function taskModelLabel(task, members) {
			const direct = task.model?.trim() ?? "";
			if (direct !== "") return direct;
			return memberRouteLabel(members.find((candidate) => candidate.name === task.assignee));
		}
		/** Short model id for tight DAG/chip surfaces (`openai/gpt-5.6-sol` → `gpt-5.6-sol`). */
		function compactModelLabel(route) {
			const trimmed = route.trim();
			if (trimmed === "") return "";
			const slash = trimmed.lastIndexOf("/");
			return slash === -1 ? trimmed : trimmed.slice(slash + 1);
		}
		/** Whether the captain chat should keep showing the in-progress banner. */
		function teamIsActive(team) {
			if (team.halted === true || team.phase === "staged") return false;
			if (team.members.some((member) => member.activity === "working" || member.status === "working")) return true;
			if (team.tasks.some((task) => task.status === "pending" || task.status === "claimed" || task.status === "in_progress")) return true;
			return team.members.length > 0 && team.tasks.length === 0;
		}
		/** Use a fill-width grid when the task graph has no real dependency edges. */
		function usesParallelTaskGrid(tasks) {
			if (tasks.length === 0) return false;
			const taskIds = new Set(tasks.map((task) => task.id));
			return tasks.every((task) => task.dependencies.every((dependency) => !taskIds.has(dependency)));
		}
		/**
		* Whether an expanded activity panel still belongs to the current session.
		*
		* The panel is mounted in the root-scoped shell overlay, so React does not
		* remount it when the conversation route changes. Ownership keeps an expanded
		* panel from leaking onto the new-session screen (or another conversation)
		* while its local open state is being reset.
		*/
		function activityPanelExpandedForSession(open, owner, current) {
			return open && owner !== void 0 && owner === current;
		}
		/**
		* Auto-expand only for live teams that appear after the current session's
		* initial restore pass. Replayed cards, archived teams, and live teams restored
		* while reopening a conversation must remain behind the collapsed badge.
		*/
		function activityPanelShouldAutoExpand({ alreadyAutoOpened, pageSettled, restoreComplete, previousLiveTeamIds, currentLiveTeamIds }) {
			return !alreadyAutoOpened && pageSettled && restoreComplete && currentLiveTeamIds.some((teamId) => !previousLiveTeamIds.has(teamId));
		}
		/**
		* Resolve the task whose dependency chain should be highlighted.
		*
		* A pinned task is an explicit user choice. Keyboard focus takes precedence
		* over delayed pointer intent so an older hover timer cannot steal the active
		* chain from someone navigating the task map with the keyboard.
		*/
		function dependencyFocusTaskId(pinnedTaskId, keyboardTaskId, hoverTaskId) {
			return pinnedTaskId ?? keyboardTaskId ?? hoverTaskId;
		}
		/** Group tasks by their precomputed dependency depth. */
		function taskStages(tasks) {
			const byDepth = /* @__PURE__ */ new Map();
			for (const task of tasks) {
				const depth = Number.isFinite(task.depth) ? Math.max(0, Math.floor(task.depth)) : 0;
				const stage = byDepth.get(depth) ?? [];
				stage.push(task);
				byDepth.set(depth, stage);
			}
			return [...byDepth.entries()].sort(([left], [right]) => left - right).map(([depth, stageTasks]) => ({
				depth,
				tasks: stageTasks.slice().sort((left, right) => left.id.localeCompare(right.id, "en", { numeric: true }))
			}));
		}
		/**
		* Lay tasks out as the reference panel's compact left-to-right DAG.
		*
		* Columns are dependency-depth stages. Rows are stable task-id order within
		* each stage. Edges use cubic curves so fan-in remains readable without
		* turning every task into a large card.
		*/
		function compactDagLayout(tasks) {
			const stages = taskStages(tasks);
			const positions = /* @__PURE__ */ new Map();
			const nodes = [];
			for (const [column, stage] of stages.entries()) for (const [row, task] of stage.tasks.entries()) {
				const x = column * 118;
				const y = row * 38;
				positions.set(task.id, {
					x,
					y
				});
				nodes.push({
					task,
					x,
					y
				});
			}
			const edges = [];
			for (const task of tasks) {
				const target = positions.get(task.id);
				if (target === void 0) continue;
				for (const dependency of task.dependencies) {
					const source = positions.get(dependency);
					if (source === void 0) continue;
					const x1 = source.x + 92;
					const y1 = source.y + 30 / 2;
					const x2 = target.x;
					const y2 = target.y + 30 / 2;
					edges.push({
						from: dependency,
						to: task.id,
						path: `M${x1} ${y1}C${x1 + 14} ${y1},${x2 - 14} ${y2},${x2} ${y2}`
					});
				}
			}
			const rows = Math.max(1, ...stages.map((stage) => stage.tasks.length));
			return {
				width: stages.length === 0 ? 0 : stages.length * 92 + (stages.length - 1) * 26,
				height: stages.length === 0 ? 0 : rows * 30 + (rows - 1) * 8,
				nodes,
				edges
			};
		}
		/**
		* Return the complete upstream/downstream chain around one task.
		*
		* Traversal uses both dependency directions and remains cycle-safe, so the UI
		* can highlight every handoff related to the focused task even if malformed
		* durable data contains a cycle.
		*/
		function relatedTaskIds(taskId, tasks) {
			const byId = new Map(tasks.map((task) => [task.id, task]));
			if (!byId.has(taskId)) return /* @__PURE__ */ new Set();
			const dependents = /* @__PURE__ */ new Map();
			for (const task of tasks) for (const dependency of task.dependencies) {
				const targets = dependents.get(dependency) ?? [];
				targets.push(task.id);
				dependents.set(dependency, targets);
			}
			const related = /* @__PURE__ */ new Set();
			const upstreamSeen = /* @__PURE__ */ new Set();
			const downstreamSeen = /* @__PURE__ */ new Set();
			const visitUpstream = (id) => {
				if (upstreamSeen.has(id)) return;
				upstreamSeen.add(id);
				related.add(id);
				for (const dependency of byId.get(id)?.dependencies ?? []) visitUpstream(dependency);
			};
			const visitDownstream = (id) => {
				if (downstreamSeen.has(id)) return;
				downstreamSeen.add(id);
				related.add(id);
				for (const dependent of dependents.get(id) ?? []) visitDownstream(dependent);
			};
			visitUpstream(taskId);
			visitDownstream(taskId);
			return related;
		}
		//#endregion
		//#region lib/client/activity-monitor.js
		/** Shared, demand-driven state for the AgentTeams browser monitor. */
		const targets = /* @__PURE__ */ new Map();
		const targetListeners = /* @__PURE__ */ new Set();
		const snapshotListeners = /* @__PURE__ */ new Set();
		let targetSnapshot = [];
		let activitySnapshots = {
			teams: [],
			archivedTeams: []
		};
		function targetKey(sessionId, teamId) {
			return `${sessionId}\u0000${teamId}`;
		}
		function publishTargets() {
			targetSnapshot = [...targets.values()].map(({ key, sessionId, teamId }) => ({
				key,
				sessionId,
				teamId
			}));
			for (const listener of targetListeners) listener();
		}
		/** Subscribe to the active monitor-target list (React external-store shape). */
		function subscribeActivityMonitorTargets(listener) {
			targetListeners.add(listener);
			return () => {
				targetListeners.delete(listener);
			};
		}
		/** Read the stable active-target snapshot. */
		function getActivityMonitorTargetsSnapshot() {
			return targetSnapshot;
		}
		/**
		* Register one successful AgentTeams card as a monitoring demand.
		*
		* The returned cleanup is reference-counted so multiple cards and React
		* StrictMode remounts cannot stop another card's monitor.
		*/
		function monitorAgentTeam(sessionId, teamId) {
			const owner = sessionId.trim();
			const id = teamId.trim();
			if (owner === "" || id === "") return () => {};
			const key = targetKey(owner, id);
			const existing = targets.get(key);
			if (existing === void 0) {
				targets.set(key, {
					key,
					sessionId: owner,
					teamId: id,
					refs: 1
				});
				publishTargets();
			} else existing.refs += 1;
			let released = false;
			return () => {
				if (released) return;
				released = true;
				const current = targets.get(key);
				if (current === void 0) return;
				current.refs -= 1;
				if (current.refs <= 0) {
					targets.delete(key);
					publishTargets();
				}
			};
		}
		/** Subscribe to the shared live/archive snapshot. */
		function subscribeActivitySnapshots(listener) {
			snapshotListeners.add(listener);
			return () => {
				snapshotListeners.delete(listener);
			};
		}
		/** Read the stable shared live/archive snapshot. */
		function getActivitySnapshotsSnapshot() {
			return activitySnapshots;
		}
		/** Publish one or both successful state-route responses. */
		function updateActivitySnapshots(update) {
			const next = {
				teams: update.teams ?? activitySnapshots.teams,
				archivedTeams: update.archivedTeams ?? activitySnapshots.archivedTeams
			};
			if (next.teams === activitySnapshots.teams && next.archivedTeams === activitySnapshots.archivedTeams) return;
			activitySnapshots = next;
			for (const listener of snapshotListeners) listener();
		}
		/** Poll cadence for the live host snapshot route. */
		const ACTIVITY_POLL_MS = 1e3;
		/**
		* Low-frequency probe cadence while a cardless discovery session still owns
		* no team. The probe keeps the panel able to pick up a team created later in
		* that session (e.g. a run_code-wrapped agent_teams_create) without turning
		* every ordinary session into a one-second filesystem scan.
		*/
		const ACTIVITY_PROBE_MS = 5e3;
		/** Host route serving live and archived team snapshots. */
		const ACTIVITY_STATE_URL = "/plugins/dsh-agent-teams/state";
		const ACTIVITY_HALT_URL = "/plugins/dsh-agent-teams/halt";
		/**
		* Start the single polling loop for the current session's requested targets.
		*
		* With neither targets nor a discovery session this is deliberately inert.
		* Explicit card targets poll at the live cadence from the start. A discovery
		* session performs an immediate live+archive restore pass, then — while it
		* still owns no team — probes on a low-frequency cadence, so a team created
		* later in that session (e.g. a run_code-wrapped agent_teams_create) is
		* discovered without a manual reload, without turning every ordinary session
		* into a one-second filesystem scan. The moment a team for the discovery
		* session appears, the controller upgrades to the live one-second cadence for
		* the rest of its lifetime. The caller — the session view, which stops the
		* controller when the session is no longer current — bounds the lifetime, and
		* archive state is refreshed when a target or a previously discovered live
		* team disappears. Monitor demand remains owned by the mounted card and is
		* released only when that card unmounts.
		*/
		function startActivityPolling(monitorTargets, runtime = {}) {
			const discoverySessionId = runtime.discoverySessionId?.trim();
			if (monitorTargets.length === 0 && (discoverySessionId === void 0 || discoverySessionId === "")) return {
				firstTick: Promise.resolve(),
				stop: () => {}
			};
			const fetchState = runtime.fetchState ?? ((url, init) => fetch(url, init));
			const schedule = runtime.schedule ?? ((callback, intervalMs) => setInterval(callback, intervalMs));
			const cancel = runtime.cancel ?? ((timer) => {
				clearInterval(timer);
			});
			const publishSnapshots = runtime.publishSnapshots ?? updateActivitySnapshots;
			let cancelled = false;
			let inFlight = false;
			let hot = monitorTargets.length > 0;
			let discoveryComplete = false;
			let discoveredLiveKeys = /* @__PURE__ */ new Set();
			let controller;
			let timer;
			const intervalMs = () => hot ? ACTIVITY_POLL_MS : ACTIVITY_PROBE_MS;
			const reschedule = () => {
				cancel(timer);
				timer = schedule(() => {
					tick();
				}, intervalMs());
			};
			const tick = async () => {
				if (inFlight || cancelled) return;
				inFlight = true;
				controller = new AbortController();
				try {
					const liveResponse = await fetchState(ACTIVITY_STATE_URL, {
						cache: "no-store",
						signal: controller.signal
					});
					if (!liveResponse.ok) return;
					const body = await liveResponse.json();
					if (cancelled || !Array.isArray(body.teams)) return;
					const liveTeams = body.teams;
					publishSnapshots({ teams: liveTeams });
					const previousDiscoveredKeys = discoveredLiveKeys;
					discoveredLiveKeys = new Set(discoverySessionId === void 0 || discoverySessionId === "" ? [] : liveTeams.filter((team) => team.captainSessionId === discoverySessionId).map((team) => team.teamId));
					if (!hot && discoveredLiveKeys.size > 0) {
						hot = true;
						reschedule();
					}
					const discoveredTeamArchived = [...previousDiscoveredKeys].some((teamId) => !discoveredLiveKeys.has(teamId));
					const missing = monitorTargets.filter((target) => !liveTeams.some((team) => team.captainSessionId === target.sessionId && team.teamId === target.teamId));
					const needsDiscoveryArchive = discoverySessionId !== void 0 && discoverySessionId !== "" && !discoveryComplete;
					if (missing.length === 0 && !needsDiscoveryArchive && !discoveredTeamArchived) return;
					const archivedResponse = await fetchState(`${ACTIVITY_STATE_URL}?archived=1`, {
						cache: "no-store",
						signal: controller.signal
					});
					if (!archivedResponse.ok) return;
					const archivedBody = await archivedResponse.json();
					if (cancelled || !Array.isArray(archivedBody.teams)) return;
					publishSnapshots({ archivedTeams: archivedBody.teams });
					discoveryComplete = true;
				} catch (error) {
					if (error?.name === "AbortError") return;
				} finally {
					inFlight = false;
				}
			};
			const firstTick = tick();
			if (timer === void 0) timer = schedule(() => {
				tick();
			}, intervalMs());
			return {
				firstTick,
				stop: () => {
					if (cancelled) return;
					cancelled = true;
					controller?.abort();
					cancel(timer);
				}
			};
		}
		//#endregion
		//#region lib/client/artwork.js
		/**
		* Shared whale artwork lookup for the activity panel and the conversation
		* card: role keywords map to the packaged role images; the captain always
		* uses the lead whale.
		* @module dsh-agent-teams/client/artwork
		*/
		/** Artwork route prefix served by the plugin host half. */
		const ART_BASE = "/plugins/dsh-agent-teams/assets/";
		/** V2 whale role artwork per role keyword. */
		const ROLE_ART = [
			[/data|analys|metric|performance|数据|分析|指标|性能/, "member-data-v2.png"],
			[/resear|investig|explor|study|研究|调查|探索|调研/, "member-researcher-v2.png"],
			[/\bqa\b|test|verif|quality|测试|质量|验证/, "member-qa-v2.png"],
			[/engineer|dev\b|server|backend|\bapi\b|runtime|watcher|contract|工程|后端|服务|接口|开发|代码|编程/, "member-engineer-v2.png"],
			[/design|\bui\b|\bux\b|front|theme|accessib|设计|前端|主题|无障碍/, "member-designer-v2.png"],
			[/secur|audit|risk|threat|review|安全|审计|审查|风险/, "member-security-v2.png"],
			[/docs|writer|product|spec|撰写|文案|写作|文档|规范/, "member-docs-v2.png"],
			[/release|\bbuild\b|deploy|\bops\b|\bci\b|ship|coordin|发布|构建|部署|运维|协调/, "member-operator-v2.png"]
		];
		/** Captain artwork (always the lead whale). */
		const LEAD_ART = `${ART_BASE}team-lead-v2.png`;
		/** Status action artwork per member activity. */
		const ACTION_ART = {
			working: `${ART_BASE}action-working-v2.png`,
			idle: `${ART_BASE}action-sleeping-v2.png`,
			unknown: `${ART_BASE}action-thinking-v2.png`
		};
		/**
		* Member artwork URL, or null when no role matches (initial-letter fallback).
		* @param name - the member's display name.
		* @param role - the member's role text.
		* @returns the artwork URL, or null when unmatched.
		*/
		function memberArtUrl(name, role) {
			const identity = `${name} ${role}`.toLowerCase();
			for (const [pattern, art] of ROLE_ART) if (pattern.test(identity)) return `${ART_BASE}${art}`;
			return null;
		}
		//#endregion
		//#region \0dsh-css:src/client/AgentTeamsCard.module.css.mjs
		const css$2 = ".fq2Ada_root{box-sizing:border-box;border:1px solid var(--dsw-alias-line-normal);background:var(--dsw-alias-bg-module-platform);border-radius:10px;flex-direction:column;gap:8px;width:100%;min-width:0;padding:10px 12px;display:flex}.fq2Ada_head{align-items:center;gap:8px;min-width:0;display:flex}.fq2Ada_leadAvatar{object-fit:contain;filter:drop-shadow(0 1px 1px #122d4833);background:0 0;border:0;border-radius:0;flex:none;width:30px;height:30px}.fq2Ada_teamName{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;flex:0 auto;font-size:13px;font-weight:600;line-height:20px;overflow:hidden}.fq2Ada_memberCount{color:var(--dsw-alias-label-tertiary);white-space:nowrap;flex:none;margin-left:auto;font-size:11px;line-height:16px}.fq2Ada_panelButton{border:1px solid var(--dsw-alias-line-strong);background:var(--dsw-alias-bg-module);color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;border-radius:999px;flex:none;padding:2px 8px;font-size:10.5px;font-weight:600;line-height:16px;transition:border-color .12s,color .12s}.fq2Ada_panelButton:hover{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}.fq2Ada_panelButton:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.fq2Ada_members{flex-wrap:wrap;gap:6px;min-width:0;display:flex}.fq2Ada_member{border:1px solid var(--dsw-alias-line-normal);background:var(--dsw-alias-bg-module);max-width:160px;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;border-radius:999px;align-items:center;gap:5px;padding:3px 8px 3px 3px;font-size:11px;font-weight:500;line-height:16px;transition:border-color .12s,background-color .12s;display:inline-flex}.fq2Ada_member:hover{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-fill-neutral)}.fq2Ada_member:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.fq2Ada_memberArt{object-fit:contain;filter:drop-shadow(0 1px 1px #122d482e);background:0 0;border:0;border-radius:0;width:24px;height:24px}.fq2Ada_memberInitial{background:var(--dsw-alias-bg-fill-business);width:20px;height:20px;color:var(--dsw-alias-label-on-fill);border-radius:50%;justify-content:center;align-items:center;font-size:10px;font-weight:600;line-height:20px;display:inline-flex}.fq2Ada_memberName{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}";
		const tagId$2 = "@nanmicoder/dsh-agent-teams/AgentTeamsCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@nanmicoder/dsh-agent-teams";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var AgentTeamsCard_module_css_default = {
			"head": "fq2Ada_head",
			"leadAvatar": "fq2Ada_leadAvatar",
			"member": "fq2Ada_member",
			"memberArt": "fq2Ada_memberArt",
			"memberCount": "fq2Ada_memberCount",
			"memberInitial": "fq2Ada_memberInitial",
			"memberName": "fq2Ada_memberName",
			"members": "fq2Ada_members",
			"panelButton": "fq2Ada_panelButton",
			"root": "fq2Ada_root",
			"teamName": "fq2Ada_teamName"
		};
		//#endregion
		//#region lib/client/AgentTeamsCard.js
		/**
		* AgentTeams conversation card: the lightweight in-conversation summary for
		* one team — the captain's whale avatar and name, the member roster as
		* clickable whale avatars (opening the member's subagent transcript), and
		* an "activity panel" button that re-activates the top-right floater.
		*
		* The floater and this card share the `agent-teams:open-panel` window event
		* so the card can summon the panel even after it was closed.
		* @module dsh-agent-teams/client/card
		*/
		/** Window event name the floater listens for to open itself. */
		const OPEN_PANEL_EVENT = "agent-teams:open-panel";
		/** Re-activate the top-right activity panel. */
		function openActivityPanel() {
			window.dispatchEvent(new Event(OPEN_PANEL_EVENT));
		}
		/** Render one durable team as a compact conversation card. */
		function AgentTeamsCard({ node, openMember, sessionId, t }) {
			const data = node.data;
			const owner = data.captainSessionId || sessionId;
			const { teams, archivedTeams } = (0, react.useSyncExternalStore)(subscribeActivitySnapshots, getActivitySnapshotsSnapshot);
			(0, react.useEffect)(() => {
				return monitorAgentTeam(owner, data.teamId);
			}, [data.teamId, owner]);
			const snapshot = teams.find((team) => team.teamId === data.teamId && (owner === "" || team.captainSessionId === owner)) ?? archivedTeams.find((team) => team.teamId === data.teamId && (owner === "" || team.captainSessionId === owner));
			const resolved = (0, react.useMemo)(() => ({
				...data,
				captainSessionId: snapshot?.captainSessionId ?? owner,
				teamName: snapshot?.name ?? data.teamName,
				members: snapshot?.members.map((member) => ({
					id: member.id,
					name: member.name,
					role: member.role
				})) ?? data.members
			}), [
				data,
				owner,
				snapshot
			]);
			return (0, react_jsx_runtime.jsxs)("section", {
				className: AgentTeamsCard_module_css_default.root,
				"data-agent-teams-card": true,
				"data-team-id": resolved.teamId,
				children: [(0, react_jsx_runtime.jsxs)("header", {
					className: AgentTeamsCard_module_css_default.head,
					children: [
						(0, react_jsx_runtime.jsx)("img", {
							className: AgentTeamsCard_module_css_default.leadAvatar,
							src: LEAD_ART,
							alt: "",
							"aria-hidden": true
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: AgentTeamsCard_module_css_default.teamName,
							title: resolved.teamName,
							children: resolved.teamName
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: AgentTeamsCard_module_css_default.memberCount,
							children: t("card.memberCount", { count: resolved.members.length })
						}),
						(0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: AgentTeamsCard_module_css_default.panelButton,
							onClick: () => {
								openActivityPanel();
							},
							"aria-label": t("action.openActivityPanel"),
							title: t("action.openActivityPanel"),
							children: t("activity.panelButton")
						})
					]
				}), resolved.members.length > 0 && (0, react_jsx_runtime.jsx)("div", {
					className: AgentTeamsCard_module_css_default.members,
					children: resolved.members.map((member) => (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: AgentTeamsCard_module_css_default.member,
						onClick: () => {
							if (member.id !== "") openMember(owner, member.id);
						},
						title: member.role === "" ? member.name : `${member.name} · ${member.role}`,
						children: [memberArtUrl(member.name, member.role) !== null ? (0, react_jsx_runtime.jsx)("img", {
							className: AgentTeamsCard_module_css_default.memberArt,
							src: memberArtUrl(member.name, member.role) ?? "",
							alt: "",
							"aria-hidden": true
						}) : (0, react_jsx_runtime.jsx)("span", {
							className: AgentTeamsCard_module_css_default.memberInitial,
							children: member.name.trim().slice(0, 1).toUpperCase() || "?"
						}), (0, react_jsx_runtime.jsx)("span", {
							className: AgentTeamsCard_module_css_default.memberName,
							children: member.name
						})]
					}, member.id))
				})]
			});
		}
		//#endregion
		//#region lib/client/staged-task-mutation.js
		/** Browser-side construction of the complete staged-task Host mutation. */
		function parseLineList(value) {
			return [...new Set(value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean))];
		}
		/** Build the exact payload submitted by the staged task editor. */
		function buildStagedTaskMutationPayload(draft) {
			return {
				sessionId: draft.sessionId,
				teamId: draft.teamId,
				action: "update_task",
				taskId: draft.taskId,
				subject: draft.subject,
				description: draft.description,
				assignee: draft.assignee,
				dependencies: draft.dependencies.split(",").map((item) => item.trim()).filter(Boolean),
				kind: draft.kind,
				round: draft.round.trim() === "" ? null : Number.parseInt(draft.round, 10),
				objective: draft.objective,
				inScope: parseLineList(draft.inScope),
				outOfScope: parseLineList(draft.outOfScope),
				acceptance: parseLineList(draft.acceptance),
				verify: parseLineList(draft.verify),
				deliverables: parseLineList(draft.deliverables),
				nonGoals: parseLineList(draft.nonGoals),
				reviewedTaskId: draft.reviewedTaskId,
				sourceTaskId: draft.sourceTaskId,
				sourceFindingIds: parseLineList(draft.sourceFindingIds),
				coverageOf: parseLineList(draft.coverageOf)
			};
		}
		//#endregion
		//#region \0dsh-css:src/client/ActivityPanel.module.css.mjs
		const css$1 = "html{--agent-teams-panel-shift:420px}html[data-agent-teams-panel-open] [data-phase=active]{box-sizing:border-box;padding-right:var(--agent-teams-panel-shift)}.AdyMkG_badge,.AdyMkG_panel{--dsw-alias-line-normal:var(--dsw-static-neutral-bluish-150,#e7e9ee);--dsw-alias-line-strong:color-mix(in srgb, var(--dsw-static-neutral-bluish-200,#e1e5ee) 50%, var(--dsw-static-neutral-bluish-300,#cfd3d6));--dsw-alias-bg-module:var(--dsw-alias-bg-layer-1,#fff);--dsw-alias-bg-fill-neutral:var(--dsw-static-neutral-bluish-100,#eef0f4);--dsw-alias-bg-fill-business:var(--dsw-alias-state-business-primary,#4d6bfe);--dsw-alias-bg-fill-success:var(--dsw-alias-state-success-primary,#12a150);--dsw-alias-bg-fill-warning:var(--dsw-alias-state-warn-primary,#e08700);--dsw-alias-bg-fill-danger:var(--dsw-alias-state-error-primary,#e5484d);--dsw-alias-state-success:var(--dsw-alias-state-success-primary,#12a150);--dsw-alias-state-warning:var(--dsw-alias-state-warn-primary,#e08700);--dsw-alias-state-danger:var(--dsw-alias-state-error-primary,#e5484d);--dsw-alias-label-on-fill:var(--dsw-alias-label-primary-inverted,#fff)}.AdyMkG_badge{box-sizing:border-box;border:1px solid var(--dsw-alias-line-normal);background:color-mix(in srgb, var(--dsw-alias-bg-module-platform) 92%, transparent);backdrop-filter:blur(16px);height:34px;box-shadow:0 8px 28px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;border-radius:999px;align-items:center;gap:7px;padding:0 12px;font-size:12px;font-weight:600;line-height:20px;transition:border-color .15s,transform .12s;display:inline-flex;position:absolute;top:64px;right:18px}.AdyMkG_badge:hover{border-color:var(--dsw-alias-line-strong);transform:translateY(-1px)}.AdyMkG_badge:active{transform:translateY(0)scale(.98)}.AdyMkG_badge:focus-visible,.AdyMkG_iconButton:focus-visible,.AdyMkG_memberRow:focus-visible,.AdyMkG_membersToggle:focus-visible,.AdyMkG_sectionToggleTitle:focus-visible,.AdyMkG_dagNode:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.AdyMkG_badgeDot,.AdyMkG_panelDot{background:var(--dsw-alias-label-tertiary);border-radius:50%;width:7px;height:7px}.AdyMkG_badgeDot[data-busy=true],.AdyMkG_panelDot[data-busy=true]{background:var(--dsw-alias-state-business-primary);animation:1.25s ease-in-out infinite AdyMkG_agentTeamsPulse}.AdyMkG_badgeCount,.AdyMkG_memberCount,.AdyMkG_teamStats,.AdyMkG_stageLabel,.AdyMkG_taskId{font-variant-numeric:tabular-nums}.AdyMkG_panel{box-sizing:border-box;border:1px solid color-mix(in srgb, var(--dsw-alias-line-strong) 58%, transparent);background:color-mix(in srgb, var(--dsw-alias-bg-module) 95%, transparent);backdrop-filter:blur(20px)saturate(1.08);box-shadow:0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent), 0 32px 72px color-mix(in srgb, var(--dsw-alias-label-primary) 16%, transparent);will-change:transform;border-radius:16px;flex-direction:column;animation:.16s ease-out AdyMkG_agentTeamsPanelIn;display:flex;position:absolute;top:0;left:0;overflow:hidden}.AdyMkG_panel[data-dragging],.AdyMkG_panel[data-resizing]{user-select:none;box-shadow:0 16px 38px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent), 0 36px 78px color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent)}@keyframes AdyMkG_agentTeamsPanelIn{0%{opacity:0}to{opacity:1}}@keyframes AdyMkG_agentTeamsPulse{0%,to{opacity:.42}50%{opacity:1}}.AdyMkG_panelHead{border-bottom:1px solid var(--dsw-alias-line-normal);cursor:grab;touch-action:none;flex:none;justify-content:space-between;align-items:center;min-height:44px;padding:0 14px 0 16px;display:flex}.AdyMkG_panelHead:active,.AdyMkG_panel[data-dragging] .AdyMkG_panelHead{cursor:grabbing}.AdyMkG_panel[data-compact] .AdyMkG_panelHead{cursor:default;touch-action:auto}.AdyMkG_panelTitle{color:var(--dsw-alias-label-primary);align-items:center;gap:8px;font-size:14px;font-weight:600;line-height:20px;display:inline-flex}.AdyMkG_panelControls{flex:none;align-items:center;gap:2px;display:inline-flex}.AdyMkG_iconButton{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:7px;justify-content:center;align-items:center;padding:0;transition:background-color .12s,color .12s,transform .12s;display:inline-flex}.AdyMkG_iconButton:hover{background:var(--dsw-alias-bg-fill-neutral);color:var(--dsw-alias-label-primary)}.AdyMkG_iconButton:active{transform:scale(.94)}.AdyMkG_iconButton[data-control=dock][data-mode=docked] svg{transform:scaleX(-1)}.AdyMkG_resizeHandle{z-index:1;touch-action:none;position:absolute}.AdyMkG_resizeHandle[data-resize-edge=left]{cursor:ew-resize;width:8px;top:44px;bottom:8px;left:0}.AdyMkG_resizeHandle[data-resize-edge=bottom]{cursor:ns-resize;height:8px;bottom:0;left:12px;right:12px}.AdyMkG_resizeHandle[data-resize-edge=corner]{cursor:nwse-resize;width:18px;height:18px;bottom:0;right:0}.AdyMkG_resizeHandle[data-resize-edge=corner]:after{border-right:1px solid var(--dsw-alias-label-tertiary);border-bottom:1px solid var(--dsw-alias-label-tertiary);content:\"\";opacity:.52;width:7px;height:7px;position:absolute;bottom:4px;right:4px}.AdyMkG_teams{overscroll-behavior:contain;scrollbar-color:color-mix(in srgb, var(--dsw-alias-label-tertiary) 28%, transparent) transparent;scrollbar-width:thin;flex-direction:column;min-height:0;display:flex;overflow-y:auto}.AdyMkG_teams::-webkit-scrollbar{width:6px}.AdyMkG_teams::-webkit-scrollbar-track{background:0 0}.AdyMkG_teams::-webkit-scrollbar-thumb{background:color-mix(in srgb, var(--dsw-alias-label-tertiary) 28%, transparent);background-clip:padding-box;border:2px solid #0000;border-radius:999px}.AdyMkG_teams:hover::-webkit-scrollbar-thumb{background:color-mix(in srgb, var(--dsw-alias-label-tertiary) 44%, transparent);background-clip:padding-box}.AdyMkG_team{border-bottom:1px solid var(--dsw-alias-line-normal);flex-direction:column;gap:12px;padding:12px 14px 16px;display:flex;container:AdyMkG_agent-team/inline-size}.AdyMkG_team:last-child{border-bottom:0}.AdyMkG_teamHead{align-items:center;gap:10px;min-width:0;display:flex}.AdyMkG_teamName{min-width:0;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:13px;font-weight:600;line-height:18px;overflow:hidden}.AdyMkG_teamStats{color:var(--dsw-alias-label-tertiary);white-space:nowrap;flex:none;gap:8px;font-size:10.5px;line-height:16px;display:inline-flex}.AdyMkG_teamStopButton{border:1px solid var(--dsw-alias-line-normal);width:26px;height:26px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border-radius:7px;flex:none;place-items:center;padding:0;transition:border-color .15s,background .15s,color .15s;display:grid}.AdyMkG_teamStopButton:hover{border-color:color-mix(in srgb, var(--dsw-alias-state-danger) 42%, var(--dsw-alias-line-normal));background:color-mix(in srgb, var(--dsw-alias-state-danger) 7%, transparent);color:var(--dsw-alias-state-danger)}.AdyMkG_teamStopButton:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.AdyMkG_stopModalActions{justify-content:flex-end;gap:8px;display:flex}.AdyMkG_stopModalActions button{border:1px solid var(--dsw-alias-line-normal,#e7e9ee);background:var(--dsw-alias-bg-fill-neutral,#eef0f4);min-height:34px;color:var(--dsw-alias-label-primary,#1c1c1e);cursor:pointer;font:inherit;border-radius:8px;justify-content:center;align-items:center;gap:6px;padding:6px 13px;font-size:12px;font-weight:600;display:inline-flex}.AdyMkG_stopModalActions button[data-danger]{border-color:var(--dsw-alias-state-danger,#e5484d);background:var(--dsw-alias-state-danger,#e5484d);color:var(--dsw-alias-label-on-fill,#fff)}.AdyMkG_stopModalActions button:disabled{cursor:wait;opacity:.58}.AdyMkG_stopModalError{background:color-mix(in srgb, var(--dsw-alias-state-danger,#e5484d) 8%, transparent);color:var(--dsw-alias-state-danger,#e5484d);border-radius:8px;align-items:flex-start;gap:7px;margin:0;padding:9px 10px;font-size:12px;line-height:18px;display:flex}.AdyMkG_stopModalError svg{flex:none;margin-top:1px}.AdyMkG_sectionHead{justify-content:space-between;align-items:center;gap:8px;min-width:0;display:flex}.AdyMkG_sectionTitle{color:var(--dsw-alias-label-secondary);align-items:center;gap:6px;font-size:11px;font-weight:600;line-height:16px;display:inline-flex}.AdyMkG_sectionHint{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:10px;line-height:14px;overflow:hidden}.AdyMkG_delegationSection{min-width:0}.AdyMkG_captainNode{box-sizing:border-box;border:1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 32%, var(--dsw-alias-line-normal));background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 7%, var(--dsw-alias-bg-module));border-radius:10px;grid-template-columns:48px minmax(0,1fr) auto;align-items:center;gap:9px;min-height:56px;padding:6px 10px;display:grid}.AdyMkG_captainAvatar,.AdyMkG_memberAvatar{flex:none;justify-content:center;align-items:center;display:inline-flex;position:relative}.AdyMkG_captainAvatar{width:46px;height:46px}.AdyMkG_leadAvatar,.AdyMkG_memberArt{object-fit:contain;filter:drop-shadow(0 1px 1px #122d4833);background:0 0;border:0;border-radius:0}.AdyMkG_leadAvatar{width:44px;height:44px}.AdyMkG_memberArt{width:40px;height:40px}.AdyMkG_captainInfo,.AdyMkG_memberInfo{flex-direction:column;min-width:0;display:flex}.AdyMkG_captainInfo{gap:2px}.AdyMkG_captainLine,.AdyMkG_memberLine{align-items:center;gap:6px;min-width:0;display:flex}.AdyMkG_captainName,.AdyMkG_memberName{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;font-weight:600;line-height:18px;overflow:hidden}.AdyMkG_captainRole,.AdyMkG_memberRole{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:10px;line-height:14px;overflow:hidden}.AdyMkG_captainSummary,.AdyMkG_memberStatusLine{color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;line-height:15px;overflow:hidden}.AdyMkG_memberModel,.AdyMkG_taskDetailModel{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9.5px;line-height:14px;overflow:hidden}.AdyMkG_captainState,.AdyMkG_memberState{color:var(--dsw-alias-label-tertiary);white-space:nowrap;flex:none;align-items:center;gap:5px;font-size:10px;font-weight:500;line-height:15px;display:inline-flex}.AdyMkG_captainState[data-busy=true],.AdyMkG_memberState[data-activity=working]{color:var(--dsw-alias-state-business-primary)}.AdyMkG_workGlyph rect{opacity:.5}.AdyMkG_workGlyph[data-active=true] rect{animation:1.1s ease-in-out infinite AdyMkG_agentTeamsDot}@keyframes AdyMkG_agentTeamsDot{0%,to{opacity:.25}50%{opacity:1}}.AdyMkG_progressOverview{flex-direction:column;gap:7px;display:flex}.AdyMkG_progressTitle{color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:600;line-height:16px}.AdyMkG_progressSegments{gap:3px;display:flex}.AdyMkG_progressSegments>span,.AdyMkG_progressEmpty{background:var(--dsw-alias-line-strong);border-radius:2px;flex:1;height:5px}.AdyMkG_progressEmpty{width:100%;display:block}.AdyMkG_progressSegments>span[data-state=running]{background:var(--dsw-alias-state-business-primary)}.AdyMkG_progressSegments>span[data-state=blocked]{background:var(--dsw-alias-state-warning)}.AdyMkG_progressSegments>span[data-state=completed]{background:var(--dsw-alias-state-success)}.AdyMkG_progressSegments>span[data-state=failed]{background:var(--dsw-alias-state-danger)}.AdyMkG_progressSegments>span[data-state=cancelled]{opacity:.55}.AdyMkG_progressLegend{color:var(--dsw-alias-label-tertiary);gap:10px;font-size:9.5px;line-height:14px;display:flex}.AdyMkG_progressLegend>span[data-state=running]{color:var(--dsw-alias-state-business-primary)}.AdyMkG_progressLegend>span[data-state=blocked]{color:var(--dsw-alias-state-warning)}.AdyMkG_progressLegend>span[data-state=completed]{color:var(--dsw-alias-state-success)}.AdyMkG_progressSummary{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 7%, var(--dsw-alias-bg-module));min-width:0;color:var(--dsw-alias-label-secondary);border-radius:8px;align-items:center;gap:6px;padding:5px 8px;font-size:10px;font-weight:600;line-height:15px;display:flex}.AdyMkG_progressSummary[data-state=warning]{background:color-mix(in srgb, var(--dsw-alias-state-warning) 8%, var(--dsw-alias-bg-module))}.AdyMkG_progressSummary[data-state=completed]{background:color-mix(in srgb, var(--dsw-alias-state-success) 8%, var(--dsw-alias-bg-module))}.AdyMkG_progressSummary[data-state=discarded]{background:var(--dsw-alias-bg-fill-neutral)}.AdyMkG_progressSummary>span:last-child{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.AdyMkG_progressSummaryDot{background:var(--dsw-alias-state-business-primary);border-radius:50%;flex:none;width:5px;height:5px}.AdyMkG_progressSummary[data-state=warning] .AdyMkG_progressSummaryDot{background:var(--dsw-alias-state-warning)}.AdyMkG_progressSummary[data-state=completed] .AdyMkG_progressSummaryDot{background:var(--dsw-alias-state-success)}.AdyMkG_progressSummary[data-state=discarded] .AdyMkG_progressSummaryDot{background:var(--dsw-alias-label-tertiary)}.AdyMkG_membersToggle{background:var(--dsw-alias-bg-module-platform);width:100%;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;border:0;border-radius:8px;justify-content:space-between;align-items:center;gap:8px;padding:6px 8px;font-size:10.5px;font-weight:600;line-height:15px;display:flex}.AdyMkG_membersToggle:hover{background:var(--dsw-alias-bg-fill-neutral)}.AdyMkG_membersToggle>span{align-items:center;gap:5px;display:inline-flex}.AdyMkG_membersToggle>span:last-child{color:var(--dsw-alias-state-business-primary)}.AdyMkG_chevron{flex:none;transition:transform .14s}.AdyMkG_chevron[data-open=true]{transform:rotate(90deg)}.AdyMkG_delegationTree{flex-direction:column;gap:2px;margin-left:18px;padding:9px 0 0 20px;display:flex;position:relative}.AdyMkG_delegationTree:before{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 48%, var(--dsw-alias-line-normal));content:\"\";width:1px;position:absolute;top:0;bottom:22px;left:0}.AdyMkG_memberBlock{flex-direction:column;min-width:0;padding:3px 0 7px;display:flex;position:relative}.AdyMkG_memberBranch{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 48%, var(--dsw-alias-line-normal));width:20px;height:1px;display:block;position:absolute;top:27px;right:100%}.AdyMkG_memberBranch:before{background:var(--dsw-alias-state-business-primary);content:\"\";border-radius:50%;width:5px;height:5px;position:absolute;top:-2px;right:-1px}.AdyMkG_memberRow{box-sizing:border-box;width:100%;min-width:0;min-height:48px;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:8px;grid-template-columns:46px minmax(0,1fr) auto;align-items:center;gap:8px;padding:4px 6px;transition:background-color .12s,transform .12s;display:grid}.AdyMkG_memberRow:hover,.AdyMkG_memberRow[data-activity=working]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 6%, var(--dsw-alias-bg-module))}.AdyMkG_memberRow:active{transform:scale(.995)}.AdyMkG_memberAvatar{width:42px;height:42px}.AdyMkG_memberAvatar[data-unread=true]:after{box-sizing:border-box;border:1px solid var(--dsw-alias-bg-module);background:var(--dsw-alias-state-business-primary);content:\"\";border-radius:50%;width:6px;height:6px;animation:1.8s ease-in-out infinite AdyMkG_agentTeamsUnreadPulse;position:absolute;top:0;right:-1px}@keyframes AdyMkG_agentTeamsUnreadPulse{0%,to{opacity:.78;transform:scale(.92)}50%{opacity:1;transform:scale(1.16)}}.AdyMkG_memberInitial{background:var(--dsw-alias-bg-fill-business);width:34px;height:34px;color:var(--dsw-alias-label-on-fill);border-radius:50%;justify-content:center;align-items:center;font-size:14px;font-weight:600;line-height:20px;display:inline-flex}.AdyMkG_stateArt{box-sizing:border-box;object-fit:contain;width:22px;height:22px;filter:drop-shadow(0 0 1px var(--dsw-alias-bg-module)) drop-shadow(0 1px 1px #122d483d);background:0 0;border:0;border-radius:0;position:absolute;bottom:-3px;right:-5px}.AdyMkG_stateArt[data-activity=working]{animation:2.4s ease-in-out infinite AdyMkG_agentTeamsFloat}.AdyMkG_stateArt[data-activity=idle]{animation:4.2s ease-in-out infinite AdyMkG_agentTeamsBreathe}.AdyMkG_stateArt[data-activity=unknown]{animation:2.8s ease-in-out infinite AdyMkG_agentTeamsThink}@keyframes AdyMkG_agentTeamsFloat{0%,to{transform:translateY(0)rotate(-4deg)}50%{transform:translateY(-2px)rotate(4deg)}}@keyframes AdyMkG_agentTeamsBreathe{0%,to{opacity:.82;transform:scale(1)}50%{opacity:1;transform:scale(1.06)}}@keyframes AdyMkG_agentTeamsThink{0%,to{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}.AdyMkG_memberState{margin-left:auto}.AdyMkG_memberCount{color:var(--dsw-alias-label-tertiary);font-size:10.5px;line-height:16px}.AdyMkG_assignmentLine{align-items:center;gap:7px;min-width:0;padding:0 6px 0 60px;display:flex}.AdyMkG_assignmentLabel{color:var(--dsw-alias-label-tertiary);flex:none;font-size:9.5px;line-height:14px}.AdyMkG_assignmentTasks{flex-wrap:wrap;flex:1;gap:4px;min-width:0;display:flex}.AdyMkG_assignmentChip{background:var(--dsw-alias-bg-fill-neutral);max-width:100%;min-height:16px;color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;border-radius:4px;align-items:center;padding:0 5px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9px;font-weight:600;line-height:14px;display:inline-flex;overflow:hidden}.AdyMkG_assignmentChip[data-state=running]{background:var(--dsw-alias-bg-fill-business);color:var(--dsw-alias-label-on-fill)}.AdyMkG_assignmentChip[data-state=completed]{background:var(--dsw-alias-bg-fill-success);color:var(--dsw-alias-label-on-fill)}.AdyMkG_assignmentChip[data-state=blocked]{background:var(--dsw-alias-bg-fill-warning);color:var(--dsw-alias-label-on-fill)}.AdyMkG_assignmentChip[data-state=failed]{background:var(--dsw-alias-bg-fill-danger);color:var(--dsw-alias-label-on-fill)}.AdyMkG_assignmentChip[data-state=cancelled]{color:var(--dsw-alias-label-tertiary);text-decoration:line-through}.AdyMkG_unreadPill{color:var(--dsw-alias-state-business-primary);white-space:nowrap;flex:none;font-size:9.5px;font-weight:600;line-height:14px}.AdyMkG_taskEmpty{color:var(--dsw-alias-label-tertiary);font-size:9.5px;line-height:14px}.AdyMkG_dependencySection{border-top:1px solid var(--dsw-alias-line-normal);flex-direction:column;gap:7px;min-width:0;padding-top:10px;display:flex}.AdyMkG_sectionToggleTitle{color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;border:0;align-items:center;gap:6px;padding:0;font-size:11px;font-weight:600;line-height:16px;display:inline-flex}.AdyMkG_dagViewport{scrollbar-width:thin;min-width:0;padding:2px 0 4px;overflow-x:auto}.AdyMkG_dagCanvas{min-width:100%;position:relative}.AdyMkG_dagCanvas[data-layout=parallel]{flex-wrap:wrap;gap:8px;display:flex}.AdyMkG_dagCanvas[data-layout=parallel] .AdyMkG_dagNode{flex:92px;min-width:92px;position:relative}.AdyMkG_dagEdges{pointer-events:none;position:absolute;inset:0;overflow:visible}.AdyMkG_dagEdges path{fill:none;stroke:var(--dsw-alias-line-strong);stroke-width:1px;transition:opacity .14s,stroke .14s,stroke-width .14s}.AdyMkG_dagEdges path[data-active=true]{stroke:var(--dsw-alias-state-business-primary);stroke-width:1.6px}.AdyMkG_dagEdges path[data-dimmed=true]{opacity:.24}.AdyMkG_dagNode{box-sizing:border-box;border:1px solid var(--dsw-alias-line-normal);background:var(--dsw-alias-bg-module);color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer;border-radius:6px;flex-direction:column;justify-content:center;gap:1px;padding:0 6px;transition:border-color .14s,background-color .14s,opacity .14s;display:flex;position:absolute}.AdyMkG_dagNode:hover,.AdyMkG_dagNode[data-focused=true]{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 6%, var(--dsw-alias-bg-module))}.AdyMkG_dagNode[data-dimmed=true]{opacity:.3}.AdyMkG_dagNode[data-state=running][data-dimmed=true]{opacity:.58}.AdyMkG_dagNode[data-state=completed]{border-color:color-mix(in srgb, var(--dsw-alias-state-success) 48%, var(--dsw-alias-line-normal))}.AdyMkG_dagNode[data-state=blocked]{border-color:color-mix(in srgb, var(--dsw-alias-state-warning) 52%, var(--dsw-alias-line-normal))}.AdyMkG_dagNode[data-state=failed]{border-color:color-mix(in srgb, var(--dsw-alias-state-danger) 56%, var(--dsw-alias-line-normal))}.AdyMkG_dagNodeHead{color:var(--dsw-alias-label-primary);align-items:center;gap:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9.5px;font-weight:700;display:flex}.AdyMkG_dagNodeDot{background:var(--dsw-alias-line-strong);border-radius:1.5px;flex:none;width:5px;height:5px}.AdyMkG_dagNode[data-state=running] .AdyMkG_dagNodeDot{background:var(--dsw-alias-state-business-primary)}.AdyMkG_dagNode[data-state=running] .AdyMkG_dagNodeHead{padding-right:12px}.AdyMkG_dagRunningState{width:9px;height:9px;color:var(--dsw-alias-state-business-primary);pointer-events:none;justify-content:center;align-items:center;display:inline-flex;position:absolute;top:4px;right:5px}.AdyMkG_dagRunningState .AdyMkG_workGlyph{width:9px;height:9px}.AdyMkG_dagNode[data-state=blocked] .AdyMkG_dagNodeDot{background:var(--dsw-alias-state-warning)}.AdyMkG_dagNode[data-state=completed] .AdyMkG_dagNodeDot{background:var(--dsw-alias-state-success)}.AdyMkG_dagNode[data-state=failed] .AdyMkG_dagNodeDot{background:var(--dsw-alias-state-danger)}.AdyMkG_dagNodeLabel{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:8.5px;line-height:11px;overflow:hidden}.AdyMkG_taskDetail{border:1px solid var(--dsw-alias-line-normal);background:var(--dsw-alias-bg-module-platform);border-radius:9px;flex-direction:column;gap:3px;min-width:0;padding:7px 9px;display:flex}.AdyMkG_taskDetailHead{align-items:center;gap:6px;min-width:0;display:flex}.AdyMkG_taskDetailId{color:var(--dsw-alias-state-business-primary);flex:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;font-weight:700}.AdyMkG_taskDetailSubject{min-width:0;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:600;line-height:16px;overflow:hidden}.AdyMkG_taskDetailBadge{background:var(--dsw-alias-bg-fill-neutral);color:var(--dsw-alias-label-secondary);border-radius:4px;flex:none;padding:0 5px;font-size:8.5px;font-weight:600;line-height:14px}.AdyMkG_taskDetailBadge[data-state=running]{background:var(--dsw-alias-bg-fill-business);color:var(--dsw-alias-label-on-fill)}.AdyMkG_taskDetailBadge[data-state=blocked]{background:var(--dsw-alias-bg-fill-warning);color:var(--dsw-alias-label-on-fill)}.AdyMkG_taskDetailBadge[data-state=completed]{background:var(--dsw-alias-bg-fill-success);color:var(--dsw-alias-label-on-fill)}.AdyMkG_taskDetailBadge[data-state=failed]{background:var(--dsw-alias-bg-fill-danger);color:var(--dsw-alias-label-on-fill)}.AdyMkG_taskDetailLine,.AdyMkG_taskDetailMeta{color:var(--dsw-alias-label-secondary);font-size:9.5px;line-height:14px}.AdyMkG_taskDetailMeta{color:var(--dsw-alias-label-tertiary)}.AdyMkG_emptyHint{color:var(--dsw-alias-label-tertiary);padding:10px 12px;font-size:11px;line-height:16px}.AdyMkG_planEditor{border:1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 30%, var(--dsw-alias-line-normal));background:color-mix(in srgb, var(--dsw-alias-bg-module-platform) 94%, var(--dsw-alias-state-business-primary));box-shadow:inset 0 1px 0 color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);border-radius:10px;flex-direction:column;gap:12px;margin:0 10px 12px;padding:12px;display:flex}.AdyMkG_planHeader>span{justify-content:space-between;align-items:center;gap:8px;display:flex}.AdyMkG_planHeader>span>span{flex-direction:column;gap:2px;min-width:0;display:flex}.AdyMkG_planHeader strong{color:var(--dsw-alias-label-primary);font-size:12px}.AdyMkG_planHeader small{color:var(--dsw-alias-label-secondary);font-size:9px;font-weight:500;line-height:13px}.AdyMkG_planHeader em{background:var(--dsw-alias-bg-fill-business);color:var(--dsw-alias-label-on-fill);border-radius:999px;flex:none;padding:1px 7px;font-size:9px;font-style:normal;line-height:16px}.AdyMkG_planHeader p{color:var(--dsw-alias-label-secondary);margin:5px 0 0;font-size:10px;line-height:15px}.AdyMkG_planFlow{grid-template-columns:repeat(3,minmax(0,1fr));margin:0;padding:0;list-style:none;display:grid}.AdyMkG_planFlow li{min-width:0;color:var(--dsw-alias-label-tertiary);align-items:center;gap:5px;font-size:9px;font-weight:600;line-height:14px;display:flex;position:relative}.AdyMkG_planFlow li:not(:last-child):after{background:var(--dsw-alias-line-normal);content:\"\";flex:1;min-width:8px;height:1px;margin-right:5px}.AdyMkG_planFlow li>span{border:1px solid var(--dsw-alias-line-normal);border-radius:50%;flex:none;place-items:center;width:18px;height:18px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9px;display:grid}.AdyMkG_planFlow li[data-active]{color:var(--dsw-alias-state-business-primary)}.AdyMkG_planFlow li[data-active]>span{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent)}.AdyMkG_planSection{border:1px solid var(--dsw-alias-line-normal);background:var(--dsw-alias-bg-module-platform);border-radius:8px;overflow:hidden}.AdyMkG_planSectionToggle,.AdyMkG_planCardHeader{box-sizing:border-box;width:100%;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;background:0 0;border:0}.AdyMkG_planSectionToggle{justify-content:space-between;align-items:center;gap:8px;min-height:42px;padding:7px 9px;display:flex}.AdyMkG_planSectionToggle:hover,.AdyMkG_planCardHeader:hover{background:color-mix(in srgb, var(--dsw-alias-bg-fill-neutral) 46%, transparent)}.AdyMkG_planSectionToggle>span{align-items:baseline;gap:7px;min-width:0;display:flex}.AdyMkG_planSectionToggle strong{font-size:10.5px}.AdyMkG_planSectionToggle small{color:var(--dsw-alias-label-tertiary);font-size:9px}.AdyMkG_planList{border-top:1px solid var(--dsw-alias-line-normal);flex-direction:column;gap:0;display:flex}.AdyMkG_planEmpty{color:var(--dsw-alias-label-tertiary);text-align:center;margin:0;padding:12px;font-size:10px}.AdyMkG_planCard{background:0 0;border:0;border-radius:0;min-width:0;margin:0;padding:0;display:block;position:relative}.AdyMkG_planCard+.AdyMkG_planCard{border-top:1px solid var(--dsw-alias-line-normal)}.AdyMkG_planCard[data-open=true]{background:color-mix(in srgb, var(--dsw-alias-bg-base) 62%, transparent)}.AdyMkG_planCardHeader{grid-template-columns:minmax(80px,.9fr) minmax(72px,1.15fr) auto 12px;align-items:center;gap:7px;min-height:40px;padding:6px 9px;display:grid}.AdyMkG_planCardIdentity{flex-direction:column;gap:1px;min-width:0;display:flex}.AdyMkG_planCardIdentity strong,.AdyMkG_planTaskSummary{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:10px;font-weight:650;line-height:14px;overflow:hidden}.AdyMkG_planCardIdentity>span,.AdyMkG_planCardMeta{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:8.5px;line-height:12px;overflow:hidden}.AdyMkG_planTaskId{background:var(--dsw-alias-bg-fill-neutral);width:max-content;color:var(--dsw-alias-label-secondary);border-radius:4px;padding:1px 5px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:8.5px;font-weight:700;line-height:14px}.AdyMkG_planDirty{background:color-mix(in srgb, var(--dsw-alias-state-warning) 13%, transparent);color:var(--dsw-alias-state-warning);border-radius:999px;justify-self:end;padding:1px 5px;font-size:8px;font-style:normal;font-weight:650;line-height:14px}.AdyMkG_planChevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .18s cubic-bezier(.2,.7,.2,1)}.AdyMkG_planChevron[data-open=true]{transform:rotate(90deg)}.AdyMkG_planCardBody{flex-direction:column;gap:8px;padding:0 9px 9px;display:flex}.AdyMkG_planCardBody fieldset{border:0;flex-direction:column;gap:7px;min-width:0;margin:0;padding:0;display:flex}.AdyMkG_planCardBody label,.AdyMkG_planNewTask label{min-width:0;color:var(--dsw-alias-label-tertiary);flex-direction:column;flex:1;gap:4px;font-size:9px;display:flex}.AdyMkG_planCardBody label small{color:var(--dsw-alias-label-tertiary);font-size:8px;line-height:11px}.AdyMkG_planCard input,.AdyMkG_planCard textarea,.AdyMkG_planCard select,.AdyMkG_planNewTask input{box-sizing:border-box;border:1px solid var(--dsw-alias-line-normal);background:var(--dsw-alias-bg-base);width:100%;min-width:0;color:var(--dsw-alias-label-primary);font:inherit;border-radius:6px;outline:none;font-size:10.5px;line-height:16px;transition:border-color .16s,box-shadow .16s}.AdyMkG_planCard input,.AdyMkG_planCard select,.AdyMkG_planNewTask input{min-height:32px;padding:6px 8px}.AdyMkG_planCard textarea{resize:vertical;min-height:58px;padding:7px 8px}.AdyMkG_planCard input:focus-visible,.AdyMkG_planCard textarea:focus-visible,.AdyMkG_planCard select:focus-visible,.AdyMkG_planNewTask input:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 16%, transparent)}.AdyMkG_planGrid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px;display:grid}.AdyMkG_planModelPicker{grid-template-columns:minmax(0,1fr);gap:5px;display:grid}.AdyMkG_planModelMenu{width:100%;display:flex}.AdyMkG_planModelTrigger{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);width:100%;min-height:38px;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;border-radius:7px;justify-content:space-between;align-items:center;gap:8px;padding:7px 9px;transition:border-color .16s,background-color .16s,transform .12s;display:flex}.AdyMkG_planModelTrigger:hover:not(:disabled){border-color:var(--dsw-alias-border-l3);background:var(--dsw-alias-interactive-bg-hover)}.AdyMkG_planModelTrigger:active:not(:disabled){transform:translateY(1px)}.AdyMkG_planModelTrigger:focus-visible{border-color:var(--dsw-alias-state-business-primary);outline:2px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 16%, transparent);outline-offset:1px}.AdyMkG_planModelTrigger:disabled{cursor:wait;opacity:.64}.AdyMkG_planModelTriggerCopy{align-items:baseline;gap:6px;min-width:0;display:flex}.AdyMkG_planModelTriggerCopy strong,.AdyMkG_planModelTriggerCopy span{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.AdyMkG_planModelTriggerCopy strong{color:var(--dsw-alias-label-primary);font-size:10px;font-weight:650;line-height:15px}.AdyMkG_planModelTriggerCopy span{color:var(--dsw-alias-label-tertiary);font-size:9px;line-height:14px}.AdyMkG_planModelMenuRow{grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;width:100%;min-width:0;display:grid}.AdyMkG_planModelMenuRow>span:first-child{color:var(--dsw-alias-label-primary)}.AdyMkG_planModelMenuRow strong{color:var(--dsw-alias-label-tertiary);text-align:right;text-overflow:ellipsis;white-space:nowrap;font-weight:450;overflow:hidden}.AdyMkG_planModelMenuBack{align-items:center;gap:7px;display:inline-flex}.AdyMkG_planModelMenuBack svg{transform:rotate(180deg)}.AdyMkG_planModelEffortRow{flex-direction:column;align-items:flex-start;min-width:0;display:flex}.AdyMkG_planModelEffortRow small{width:100%;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:10px;line-height:14px;overflow:hidden}.AdyMkG_planModelHint{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:8.5px;line-height:12px;overflow:hidden}.AdyMkG_planModelNotice{background:color-mix(in srgb, var(--dsw-alias-state-warning) 9%, transparent);color:var(--dsw-alias-label-secondary);border-radius:6px;grid-column:1/-1;justify-content:space-between;align-items:center;gap:8px;padding:6px 7px;font-size:8.5px;line-height:12px;display:flex}.AdyMkG_planModelNotice button{color:var(--dsw-alias-state-business-primary);cursor:pointer;font:inherit;background:0 0;border:0;flex:none;padding:2px 6px;font-weight:650}.AdyMkG_planActions,.AdyMkG_planApproveRow,.AdyMkG_planNewTask,.AdyMkG_planConfirm,.AdyMkG_planApproveActions,.AdyMkG_planSecondaryActions{align-items:center;gap:7px;display:flex}.AdyMkG_planReviewActions{grid-template-columns:minmax(0,1fr);gap:6px;width:100%;display:grid}.AdyMkG_planSecondaryActions{grid-template-columns:minmax(0,1fr) auto;display:grid}.AdyMkG_planActions{justify-content:flex-end}.AdyMkG_planActions button,.AdyMkG_planNewTask button,.AdyMkG_planApproveRow button,.AdyMkG_planConfirm button{border:1px solid var(--dsw-alias-line-normal);background:var(--dsw-alias-bg-fill-neutral);min-height:30px;color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:6px;flex:none;padding:5px 10px;font-size:9.5px;font-weight:600;transition:background .16s,border-color .16s,transform .16s}.AdyMkG_planActions button:hover:not(:disabled),.AdyMkG_planNewTask button:hover:not(:disabled),.AdyMkG_planApproveRow button:hover:not(:disabled),.AdyMkG_planConfirm button:hover:not(:disabled){border-color:var(--dsw-alias-label-tertiary)}.AdyMkG_planActions button:active:not(:disabled),.AdyMkG_planNewTask button:active:not(:disabled),.AdyMkG_planApproveRow button:active:not(:disabled),.AdyMkG_planConfirm button:active:not(:disabled){transform:scale(.98)}.AdyMkG_planActions button[data-danger],.AdyMkG_planConfirm button[data-danger]{color:var(--dsw-alias-state-danger)}.AdyMkG_planFeedback{min-width:0;color:var(--dsw-alias-label-secondary);flex:1;align-items:center;gap:5px;font-size:9px;line-height:13px;animation:.18s ease-out AdyMkG_plan-feedback-in;display:inline-flex}.AdyMkG_planFeedback[data-tone=success]{color:var(--dsw-alias-state-success)}.AdyMkG_planFeedback[data-tone=error]{color:var(--dsw-alias-state-danger)}.AdyMkG_planFeedback>span{border:1px solid;border-radius:50%;flex:none;place-items:center;width:15px;height:15px;display:grid}.AdyMkG_planFeedback svg{width:11px;height:11px}@keyframes AdyMkG_plan-feedback-in{0%{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:translateY(0)}}.AdyMkG_planConfirm{border:1px solid color-mix(in srgb, var(--dsw-alias-state-danger) 30%, var(--dsw-alias-line-normal));background:color-mix(in srgb, var(--dsw-alias-state-danger) 7%, transparent);border-radius:7px;flex-wrap:wrap;justify-content:flex-end;padding:7px}.AdyMkG_planConfirm>span{min-width:140px;color:var(--dsw-alias-label-secondary);flex:1;font-size:9px;line-height:13px}.AdyMkG_planNewTask{align-items:flex-end}.AdyMkG_planNewTask label{gap:4px}.AdyMkG_planNewTask label>span{line-height:13px}.AdyMkG_planApproveRow{z-index:1;border:1px solid var(--dsw-alias-line-normal);background:color-mix(in srgb, var(--dsw-alias-bg-module-platform) 94%, transparent);min-height:50px;box-shadow:0 -5px 16px color-mix(in srgb, var(--dsw-alias-bg-base) 35%, transparent);backdrop-filter:blur(8px);border-radius:8px;flex-direction:column;justify-content:flex-end;align-items:stretch;margin:0 -4px -4px;padding:8px;position:sticky;bottom:0}.AdyMkG_planApproveRow[data-armed=true]{border-color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 45%, var(--dsw-alias-line-normal))}.AdyMkG_planApproveRow[data-discard=true]{border-color:color-mix(in srgb, var(--dsw-alias-state-danger) 45%, var(--dsw-alias-line-normal))}.AdyMkG_planApproveCopy{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}.AdyMkG_planApproveCopy strong{color:var(--dsw-alias-label-primary);font-size:9.5px;line-height:13px}.AdyMkG_planApproveCopy small{color:var(--dsw-alias-label-tertiary);font-size:8.5px;line-height:12px}.AdyMkG_planApproveRow button{background:var(--dsw-alias-state-business-primary);min-height:32px;color:var(--dsw-alias-label-on-fill);padding-inline:13px}.AdyMkG_planReviewActions>button[data-plan-approve]{width:100%}.AdyMkG_planApproveActions>button:first-child{background:var(--dsw-alias-bg-fill-neutral);color:var(--dsw-alias-label-primary)}.AdyMkG_planSecondaryActions>button,.AdyMkG_planApproveActions>button[data-danger]{border-color:var(--dsw-alias-line-normal);background:var(--dsw-alias-bg-fill-neutral);color:var(--dsw-alias-label-primary)}.AdyMkG_planSecondaryActions>button[data-danger],.AdyMkG_planApproveActions>button[data-danger]{color:var(--dsw-alias-state-danger)}.AdyMkG_planSectionToggle:focus-visible,.AdyMkG_planCardHeader:focus-visible,.AdyMkG_planActions button:focus-visible,.AdyMkG_planNewTask button:focus-visible,.AdyMkG_planApproveRow button:focus-visible,.AdyMkG_planConfirm button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.AdyMkG_planActions button:disabled,.AdyMkG_planNewTask button:disabled,.AdyMkG_planApproveRow button:disabled{cursor:default;opacity:.55}.AdyMkG_historicPill{background:var(--dsw-alias-bg-fill-neutral);color:var(--dsw-alias-label-tertiary);border-radius:4px;flex:none;margin-left:auto;padding:1px 7px;font-size:9.5px;font-weight:600;line-height:15px}.AdyMkG_members{flex-direction:column;gap:3px;display:flex}.AdyMkG_archiveLabel{color:var(--dsw-alias-label-tertiary);padding:5px 14px 0;font-size:9.5px;font-weight:600;line-height:14px;display:block}@media (prefers-reduced-motion:reduce){.AdyMkG_panel,.AdyMkG_badge,.AdyMkG_badgeDot,.AdyMkG_panelDot,.AdyMkG_workGlyph rect,.AdyMkG_stateArt,.AdyMkG_memberAvatar[data-unread=true]:after,.AdyMkG_planChevron,.AdyMkG_planFeedback,.AdyMkG_planActions button,.AdyMkG_planNewTask button,.AdyMkG_planApproveRow button,.AdyMkG_planConfirm button,.AdyMkG_planCard input,.AdyMkG_planCard textarea,.AdyMkG_planCard select,.AdyMkG_planNewTask input{transition:none;animation:none}}@media (width<=960px){html[data-agent-teams-panel-open] [data-phase=active]{padding-right:0}}@media (width<=640px){.AdyMkG_badge{top:56px;right:10px}.AdyMkG_teamStats span[data-stat=messages]{display:none}.AdyMkG_captainNode{grid-template-columns:48px minmax(0,1fr)}.AdyMkG_captainState{display:none}.AdyMkG_delegationTree{margin-left:12px;padding-left:15px}.AdyMkG_memberBranch{width:15px}.AdyMkG_assignmentLine{padding-left:53px}.AdyMkG_planFlow li{gap:4px;font-size:8px}.AdyMkG_planFlow li:not(:last-child):after{margin-right:3px}.AdyMkG_planCardHeader{grid-template-columns:auto minmax(0,1fr) auto}.AdyMkG_planCardHeader .AdyMkG_planCardMeta{display:none}.AdyMkG_planGrid,.AdyMkG_planModelPicker{grid-template-columns:minmax(0,1fr)}.AdyMkG_planNewTask,.AdyMkG_planApproveRow{flex-direction:column;align-items:stretch}.AdyMkG_planNewTask button,.AdyMkG_planApproveRow>button,.AdyMkG_planApproveActions,.AdyMkG_planReviewActions{width:100%}.AdyMkG_planApproveActions button,.AdyMkG_planReviewActions button,.AdyMkG_planSecondaryActions button{flex:1}}@container AdyMkG_agent-team (width<=360px){.AdyMkG_planEditor{margin-inline:0;padding-inline:10px}.AdyMkG_planHeader>span{align-items:flex-start}.AdyMkG_planFlow li{gap:3px;font-size:7.5px}.AdyMkG_planFlow li:not(:last-child):after{min-width:4px;margin-right:2px}.AdyMkG_planSecondaryActions,.AdyMkG_planApproveActions{grid-template-columns:minmax(0,1fr);width:100%;display:grid}.AdyMkG_planSecondaryActions button,.AdyMkG_planApproveActions button{width:100%}}";
		const tagId$1 = "@nanmicoder/dsh-agent-teams/ActivityPanel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@nanmicoder/dsh-agent-teams";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var ActivityPanel_module_css_default = {
			"agent-team": "AdyMkG_agent-team",
			"agentTeamsBreathe": "AdyMkG_agentTeamsBreathe",
			"agentTeamsDot": "AdyMkG_agentTeamsDot",
			"agentTeamsFloat": "AdyMkG_agentTeamsFloat",
			"agentTeamsPanelIn": "AdyMkG_agentTeamsPanelIn",
			"agentTeamsPulse": "AdyMkG_agentTeamsPulse",
			"agentTeamsThink": "AdyMkG_agentTeamsThink",
			"agentTeamsUnreadPulse": "AdyMkG_agentTeamsUnreadPulse",
			"archiveLabel": "AdyMkG_archiveLabel",
			"assignmentChip": "AdyMkG_assignmentChip",
			"assignmentLabel": "AdyMkG_assignmentLabel",
			"assignmentLine": "AdyMkG_assignmentLine",
			"assignmentTasks": "AdyMkG_assignmentTasks",
			"badge": "AdyMkG_badge",
			"badgeCount": "AdyMkG_badgeCount",
			"badgeDot": "AdyMkG_badgeDot",
			"captainAvatar": "AdyMkG_captainAvatar",
			"captainInfo": "AdyMkG_captainInfo",
			"captainLine": "AdyMkG_captainLine",
			"captainName": "AdyMkG_captainName",
			"captainNode": "AdyMkG_captainNode",
			"captainRole": "AdyMkG_captainRole",
			"captainState": "AdyMkG_captainState",
			"captainSummary": "AdyMkG_captainSummary",
			"chevron": "AdyMkG_chevron",
			"dagCanvas": "AdyMkG_dagCanvas",
			"dagEdges": "AdyMkG_dagEdges",
			"dagNode": "AdyMkG_dagNode",
			"dagNodeDot": "AdyMkG_dagNodeDot",
			"dagNodeHead": "AdyMkG_dagNodeHead",
			"dagNodeLabel": "AdyMkG_dagNodeLabel",
			"dagRunningState": "AdyMkG_dagRunningState",
			"dagViewport": "AdyMkG_dagViewport",
			"delegationSection": "AdyMkG_delegationSection",
			"delegationTree": "AdyMkG_delegationTree",
			"dependencySection": "AdyMkG_dependencySection",
			"emptyHint": "AdyMkG_emptyHint",
			"historicPill": "AdyMkG_historicPill",
			"iconButton": "AdyMkG_iconButton",
			"leadAvatar": "AdyMkG_leadAvatar",
			"memberArt": "AdyMkG_memberArt",
			"memberAvatar": "AdyMkG_memberAvatar",
			"memberBlock": "AdyMkG_memberBlock",
			"memberBranch": "AdyMkG_memberBranch",
			"memberCount": "AdyMkG_memberCount",
			"memberInfo": "AdyMkG_memberInfo",
			"memberInitial": "AdyMkG_memberInitial",
			"memberLine": "AdyMkG_memberLine",
			"memberModel": "AdyMkG_memberModel",
			"memberName": "AdyMkG_memberName",
			"memberRole": "AdyMkG_memberRole",
			"memberRow": "AdyMkG_memberRow",
			"memberState": "AdyMkG_memberState",
			"memberStatusLine": "AdyMkG_memberStatusLine",
			"members": "AdyMkG_members",
			"membersToggle": "AdyMkG_membersToggle",
			"panel": "AdyMkG_panel",
			"panelControls": "AdyMkG_panelControls",
			"panelDot": "AdyMkG_panelDot",
			"panelHead": "AdyMkG_panelHead",
			"panelTitle": "AdyMkG_panelTitle",
			"plan-feedback-in": "AdyMkG_plan-feedback-in",
			"planActions": "AdyMkG_planActions",
			"planApproveActions": "AdyMkG_planApproveActions",
			"planApproveCopy": "AdyMkG_planApproveCopy",
			"planApproveRow": "AdyMkG_planApproveRow",
			"planCard": "AdyMkG_planCard",
			"planCardBody": "AdyMkG_planCardBody",
			"planCardHeader": "AdyMkG_planCardHeader",
			"planCardIdentity": "AdyMkG_planCardIdentity",
			"planCardMeta": "AdyMkG_planCardMeta",
			"planChevron": "AdyMkG_planChevron",
			"planConfirm": "AdyMkG_planConfirm",
			"planDirty": "AdyMkG_planDirty",
			"planEditor": "AdyMkG_planEditor",
			"planEmpty": "AdyMkG_planEmpty",
			"planFeedback": "AdyMkG_planFeedback",
			"planFlow": "AdyMkG_planFlow",
			"planGrid": "AdyMkG_planGrid",
			"planHeader": "AdyMkG_planHeader",
			"planList": "AdyMkG_planList",
			"planModelEffortRow": "AdyMkG_planModelEffortRow",
			"planModelHint": "AdyMkG_planModelHint",
			"planModelMenu": "AdyMkG_planModelMenu",
			"planModelMenuBack": "AdyMkG_planModelMenuBack",
			"planModelMenuRow": "AdyMkG_planModelMenuRow",
			"planModelNotice": "AdyMkG_planModelNotice",
			"planModelPicker": "AdyMkG_planModelPicker",
			"planModelTrigger": "AdyMkG_planModelTrigger",
			"planModelTriggerCopy": "AdyMkG_planModelTriggerCopy",
			"planNewTask": "AdyMkG_planNewTask",
			"planReviewActions": "AdyMkG_planReviewActions",
			"planSecondaryActions": "AdyMkG_planSecondaryActions",
			"planSection": "AdyMkG_planSection",
			"planSectionToggle": "AdyMkG_planSectionToggle",
			"planTaskId": "AdyMkG_planTaskId",
			"planTaskSummary": "AdyMkG_planTaskSummary",
			"progressEmpty": "AdyMkG_progressEmpty",
			"progressLegend": "AdyMkG_progressLegend",
			"progressOverview": "AdyMkG_progressOverview",
			"progressSegments": "AdyMkG_progressSegments",
			"progressSummary": "AdyMkG_progressSummary",
			"progressSummaryDot": "AdyMkG_progressSummaryDot",
			"progressTitle": "AdyMkG_progressTitle",
			"resizeHandle": "AdyMkG_resizeHandle",
			"sectionHead": "AdyMkG_sectionHead",
			"sectionHint": "AdyMkG_sectionHint",
			"sectionTitle": "AdyMkG_sectionTitle",
			"sectionToggleTitle": "AdyMkG_sectionToggleTitle",
			"stageLabel": "AdyMkG_stageLabel",
			"stateArt": "AdyMkG_stateArt",
			"stopModalActions": "AdyMkG_stopModalActions",
			"stopModalError": "AdyMkG_stopModalError",
			"taskDetail": "AdyMkG_taskDetail",
			"taskDetailBadge": "AdyMkG_taskDetailBadge",
			"taskDetailHead": "AdyMkG_taskDetailHead",
			"taskDetailId": "AdyMkG_taskDetailId",
			"taskDetailLine": "AdyMkG_taskDetailLine",
			"taskDetailMeta": "AdyMkG_taskDetailMeta",
			"taskDetailModel": "AdyMkG_taskDetailModel",
			"taskDetailSubject": "AdyMkG_taskDetailSubject",
			"taskEmpty": "AdyMkG_taskEmpty",
			"taskId": "AdyMkG_taskId",
			"team": "AdyMkG_team",
			"teamHead": "AdyMkG_teamHead",
			"teamName": "AdyMkG_teamName",
			"teamStats": "AdyMkG_teamStats",
			"teamStopButton": "AdyMkG_teamStopButton",
			"teams": "AdyMkG_teams",
			"unreadPill": "AdyMkG_unreadPill",
			"workGlyph": "AdyMkG_workGlyph"
		};
		//#endregion
		//#region lib/client/StagingPlanEditor.js
		/**
		* Editable pre-run roster and DAG review for staged AgentTeams plans.
		*
		* This leaf owns only transient form/disclosure state. Durable truth remains
		* on the host and returns through the ordinary activity polling snapshot.
		* @module dsh-agent-teams/client/staging-plan
		*/
		const PLAN_URL = "/plugins/dsh-agent-teams/plan";
		const TASK_KIND_OPTIONS = [
			"work",
			"requirements",
			"implementation",
			"verification",
			"review",
			"repair",
			"integration"
		];
		function formatLineList(values) {
			return (values ?? []).join("\n");
		}
		function taskKindLabel(t, kind) {
			switch (kind) {
				case "work": return t("plan.task.kind.work");
				case "requirements": return t("plan.task.kind.requirements");
				case "implementation": return t("plan.task.kind.implementation");
				case "verification": return t("plan.task.kind.verification");
				case "review": return t("plan.task.kind.review");
				case "repair": return t("plan.task.kind.repair");
				case "integration": return t("plan.task.kind.integration");
			}
		}
		function useDismissSuccess(feedback, setFeedback) {
			(0, react.useEffect)(() => {
				if (feedback?.tone !== "success") return;
				const timeout = window.setTimeout(() => {
					setFeedback(void 0);
				}, 3500);
				return () => {
					window.clearTimeout(timeout);
				};
			}, [feedback, setFeedback]);
		}
		async function mutatePlan(payload) {
			const response = await fetch(PLAN_URL, {
				method: "POST",
				cache: "no-store",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload)
			});
			if (response.ok) return;
			let message = `HTTP ${response.status}`;
			try {
				const body = await response.json();
				if (typeof body.error === "string" && body.error.trim() !== "") message = body.error;
			} catch {}
			throw new Error(message);
		}
		function errorMessage$1(error) {
			return error instanceof Error ? error.message : String(error);
		}
		function DisclosureChevron({ open }) {
			return (0, react_jsx_runtime.jsx)("svg", {
				className: ActivityPanel_module_css_default.planChevron,
				"data-open": open,
				width: "12",
				height: "12",
				viewBox: "0 0 12 12",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.5",
				strokeLinecap: "round",
				"aria-hidden": true,
				children: (0, react_jsx_runtime.jsx)("path", { d: "M4 2.5 7.5 6 4 9.5" })
			});
		}
		function Feedback({ value }) {
			if (value === void 0) return null;
			return (0, react_jsx_runtime.jsxs)("span", {
				className: ActivityPanel_module_css_default.planFeedback,
				"data-tone": value.tone,
				role: value.tone === "error" ? "alert" : "status",
				"aria-live": value.tone === "error" ? "assertive" : "polite",
				children: [(0, react_jsx_runtime.jsx)("span", {
					"aria-hidden": true,
					children: value.tone === "success" ? (0, react_jsx_runtime.jsx)("svg", {
						viewBox: "0 0 12 12",
						fill: "none",
						stroke: "currentColor",
						strokeWidth: "1.8",
						children: (0, react_jsx_runtime.jsx)("path", { d: "m2.5 6.2 2.2 2.2 4.8-5" })
					}) : (0, react_jsx_runtime.jsx)("svg", {
						viewBox: "0 0 12 12",
						fill: "none",
						stroke: "currentColor",
						strokeWidth: "1.8",
						children: (0, react_jsx_runtime.jsx)("path", { d: "M6 2.3v4.1M6 8.8v.1" })
					})
				}), value.message]
			});
		}
		function routeKey(provider, model) {
			return JSON.stringify([provider, model]);
		}
		const MODEL_MENU_OPEN_MODELS = "open:models";
		const MODEL_MENU_OPEN_EFFORT = "open:effort";
		const MODEL_MENU_BACK = "navigate:back";
		const MODEL_MENU_RETRY = "action:retry";
		function modelMenuId(provider, model) {
			return `model:${routeKey(provider, model)}`;
		}
		function effortMenuId(effort) {
			return `effort:${effort}`;
		}
		/**
		* Thin staged-plan adapter over the official model directory. It deliberately
		* reads only catalog metadata: choosing a member route must not change the
		* captain session's composer model.
		*/
		function StagedModelPicker({ directory, provider, model, reasoningMode, reasoningEffort, busy, onChange, t }) {
			const state = (0, react.useSyncExternalStore)(directory.store.subscribe, directory.store.getSnapshot);
			const [open, setOpen] = (0, react.useState)(false);
			const [pane, setPane] = (0, react.useState)("root");
			const catalogRoutes = state.groups.flatMap((group) => group.models.map((candidate) => ({
				key: routeKey(group.id, candidate.id),
				provider: group.id,
				providerName: group.name,
				model: candidate
			})));
			const selectedKey = routeKey(provider, model);
			const selected = catalogRoutes.find((candidate) => candidate.key === selectedKey);
			const efforts = selected?.model.reasoning?.efforts ?? [];
			const currentMissing = provider !== "" && model !== "" && selected === void 0;
			const defaultEffort = selected?.model.reasoning?.defaultEffort;
			const effectiveEffort = reasoningMode === "explicit" ? reasoningEffort : void 0;
			const selectedEffort = efforts.find((effort) => effort.id === effectiveEffort);
			const modelLabel = selected?.model.name ?? (model === "" ? t("plan.model.choose") : model);
			const modeLabel = reasoningMode === "target-default" ? t("settings.profiles.reasoning.target-default.label") : reasoningMode === "route-aware" ? t("settings.profiles.reasoning.route-aware.label") : t("settings.profiles.reasoning.explicit.label");
			const effortLabel = reasoningMode === "explicit" ? selectedEffort?.name ?? reasoningEffort : modeLabel;
			const unavailable = state.status === "error" || state.failures.length > 0;
			const close = () => {
				setOpen(false);
				setPane("root");
			};
			const rootItems = [{
				id: MODEL_MENU_OPEN_MODELS,
				label: (0, react_jsx_runtime.jsxs)("span", {
					className: ActivityPanel_module_css_default.planModelMenuRow,
					children: [
						(0, react_jsx_runtime.jsx)("span", { children: t("plan.member.model") }),
						(0, react_jsx_runtime.jsx)("strong", { children: modelLabel }),
						(0, react_jsx_runtime.jsx)(DisclosureChevron, { open: false })
					]
				}),
				disabled: state.status === "loading" && catalogRoutes.length === 0
			}, {
				id: MODEL_MENU_OPEN_EFFORT,
				label: (0, react_jsx_runtime.jsxs)("span", {
					className: ActivityPanel_module_css_default.planModelMenuRow,
					children: [
						(0, react_jsx_runtime.jsx)("span", { children: t("plan.member.reasoning") }),
						(0, react_jsx_runtime.jsx)("strong", { children: effortLabel }),
						(0, react_jsx_runtime.jsx)(DisclosureChevron, { open: false })
					]
				}),
				disabled: reasoningMode !== "explicit" || efforts.length === 0
			}];
			const modelItems = [{
				id: MODEL_MENU_BACK,
				label: (0, react_jsx_runtime.jsxs)("span", {
					className: ActivityPanel_module_css_default.planModelMenuBack,
					children: [(0, react_jsx_runtime.jsx)(DisclosureChevron, { open: false }), t("plan.model.back")]
				})
			}, {
				type: "separator",
				id: "models:separator"
			}];
			if (catalogRoutes.length === 0) modelItems.push({
				id: "models:empty",
				label: state.status === "loading" ? t("plan.model.loading") : t("plan.model.empty"),
				disabled: true
			});
			else for (const group of state.groups) {
				modelItems.push({
					type: "label",
					id: `provider:${group.id}`,
					text: group.name
				});
				for (const candidate of group.models) modelItems.push({
					id: modelMenuId(group.id, candidate.id),
					label: candidate.name,
					disabled: reasoningMode === "explicit" && (candidate.reasoning?.efforts.length ?? 0) === 0
				});
			}
			const effortItems = [
				{
					id: MODEL_MENU_BACK,
					label: (0, react_jsx_runtime.jsxs)("span", {
						className: ActivityPanel_module_css_default.planModelMenuBack,
						children: [(0, react_jsx_runtime.jsx)(DisclosureChevron, { open: false }), t("plan.model.back")]
					})
				},
				{
					type: "separator",
					id: "effort:separator"
				},
				...efforts.map((effort) => ({
					id: effortMenuId(effort.id),
					label: (0, react_jsx_runtime.jsxs)("span", {
						className: ActivityPanel_module_css_default.planModelEffortRow,
						children: [(0, react_jsx_runtime.jsx)("span", { children: effort.name }), effort.description !== void 0 && (0, react_jsx_runtime.jsx)("small", { children: effort.description })]
					})
				}))
			];
			const items = pane === "models" ? modelItems : pane === "effort" ? effortItems : rootItems;
			const selectedId = pane === "models" ? modelMenuId(provider, model) : pane === "effort" ? effortMenuId(reasoningEffort) : void 0;
			const choose = (id) => {
				if (id === MODEL_MENU_OPEN_MODELS) {
					setPane("models");
					return;
				}
				if (id === MODEL_MENU_OPEN_EFFORT) {
					setPane("effort");
					return;
				}
				if (id === MODEL_MENU_BACK) {
					setPane("root");
					return;
				}
				if (id === MODEL_MENU_RETRY) {
					directory.load().catch(() => void 0);
					return;
				}
				const nextModel = catalogRoutes.find((candidate) => modelMenuId(candidate.provider, candidate.model.id) === id);
				if (nextModel !== void 0) {
					close();
					if (nextModel.provider === provider && nextModel.model.id === model) return;
					onChange({
						provider: nextModel.provider,
						model: nextModel.model.id,
						reasoningMode,
						reasoningEffort: reasoningMode === "explicit" ? nextModel.model.reasoning?.defaultEffort ?? nextModel.model.reasoning?.efforts[0]?.id ?? "" : ""
					});
					return;
				}
				const nextEffort = efforts.find((effort) => effortMenuId(effort.id) === id);
				if (nextEffort === void 0) return;
				close();
				if (nextEffort.id === reasoningEffort) return;
				onChange({
					provider,
					model,
					reasoningMode,
					reasoningEffort: nextEffort.id
				});
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				className: ActivityPanel_module_css_default.planModelPicker,
				"data-model-directory-status": state.status,
				children: [
					(0, react_jsx_runtime.jsxs)("label", { children: [t("settings.profiles.reasoning.title"), (0, react_jsx_runtime.jsxs)("select", {
						name: "reasoningMode",
						value: reasoningMode,
						disabled: busy,
						onChange: (event) => {
							const nextMode = event.currentTarget.value;
							if (nextMode === reasoningMode) return;
							const nextEffort = nextMode === "explicit" ? defaultEffort ?? efforts[0]?.id ?? "" : "";
							if (nextMode === "explicit" && nextEffort === "") return;
							onChange({
								provider,
								model,
								reasoningMode: nextMode,
								reasoningEffort: nextEffort
							});
						},
						children: [
							(0, react_jsx_runtime.jsx)("option", {
								value: "target-default",
								children: t("settings.profiles.reasoning.target-default.label")
							}),
							(0, react_jsx_runtime.jsx)("option", {
								value: "route-aware",
								children: t("settings.profiles.reasoning.route-aware.label")
							}),
							(0, react_jsx_runtime.jsx)("option", {
								value: "explicit",
								disabled: efforts.length === 0 && reasoningMode !== "explicit",
								children: t("settings.profiles.reasoning.explicit.label")
							})
						]
					})] }),
					(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
						open,
						portal: true,
						align: "end",
						compact: true,
						className: ActivityPanel_module_css_default.planModelMenu,
						items,
						footer: unavailable ? [{
							id: MODEL_MENU_RETRY,
							label: t("plan.model.retry")
						}] : void 0,
						selectedId,
						onSelect: choose,
						onClose: close,
						anchor: (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: ActivityPanel_module_css_default.planModelTrigger,
							"data-plan-model-trigger": true,
							"aria-label": t("plan.model.triggerAria", {
								model: modelLabel,
								effort: effortLabel
							}),
							"aria-haspopup": "menu",
							"aria-expanded": open,
							disabled: busy,
							onClick: () => {
								if (open) close();
								else {
									setPane("root");
									setOpen(true);
									directory.load().catch(() => void 0);
								}
							},
							children: [(0, react_jsx_runtime.jsxs)("span", {
								className: ActivityPanel_module_css_default.planModelTriggerCopy,
								children: [(0, react_jsx_runtime.jsx)("strong", { children: state.status === "loading" && catalogRoutes.length === 0 ? t("plan.model.loading") : modelLabel }), (0, react_jsx_runtime.jsx)("span", { children: effortLabel })]
							}), (0, react_jsx_runtime.jsx)(DisclosureChevron, { open })]
						})
					}),
					(0, react_jsx_runtime.jsx)("small", {
						className: ActivityPanel_module_css_default.planModelHint,
						children: currentMissing ? t("plan.model.currentUnavailable", {
							provider,
							model
						}) : selected?.model.description ?? t("plan.model.route", {
							provider,
							model
						})
					}),
					unavailable && (0, react_jsx_runtime.jsxs)("span", {
						className: ActivityPanel_module_css_default.planModelNotice,
						role: state.status === "error" ? "alert" : "status",
						children: [(0, react_jsx_runtime.jsx)("span", { children: state.error ?? t("plan.model.partialFailure", { count: state.failures.length }) }), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: busy || state.status === "loading",
							onClick: () => {
								directory.load().catch(() => void 0);
							},
							children: t("plan.model.retry")
						})]
					})
				]
			});
		}
		function StagedMemberEditor({ team, member, modelDirectory, onPendingChange, t }) {
			const bodyId = (0, react.useId)();
			const [open, setOpen] = (0, react.useState)(false);
			const [role, setRole] = (0, react.useState)(member.role);
			const [provider, setProvider] = (0, react.useState)(member.provider ?? "");
			const [model, setModel] = (0, react.useState)(member.model ?? "");
			const [reasoningMode, setReasoningMode] = (0, react.useState)(member.reasoningMode);
			const [reasoningEffort, setReasoningEffort] = (0, react.useState)(member.reasoningMode === "explicit" ? member.reasoningEffort ?? "" : "");
			const [executionPrompt, setExecutionPrompt] = (0, react.useState)(member.executionPrompt ?? "");
			const remoteSignature = JSON.stringify([
				member.role,
				member.provider ?? "",
				member.model ?? "",
				member.reasoningMode,
				member.reasoningMode === "explicit" ? member.reasoningEffort ?? "" : "",
				member.executionPrompt ?? ""
			]);
			const [savedSignature, setSavedSignature] = (0, react.useState)(remoteSignature);
			const [busy, setBusy] = (0, react.useState)(false);
			const [feedback, setFeedback] = (0, react.useState)();
			useDismissSuccess(feedback, setFeedback);
			const dirty = JSON.stringify([
				role,
				provider,
				model,
				reasoningMode,
				reasoningEffort,
				executionPrompt
			]) !== savedSignature;
			(0, react.useEffect)(() => {
				onPendingChange(`member:${member.name}`, dirty || busy);
				return () => {
					onPendingChange(`member:${member.name}`, false);
				};
			}, [
				busy,
				dirty,
				member.name,
				onPendingChange
			]);
			(0, react.useEffect)(() => {
				setRole(member.role);
				setProvider(member.provider ?? "");
				setModel(member.model ?? "");
				setReasoningMode(member.reasoningMode);
				setReasoningEffort(member.reasoningMode === "explicit" ? member.reasoningEffort ?? "" : "");
				setExecutionPrompt(member.executionPrompt ?? "");
				setSavedSignature(remoteSignature);
			}, [
				member.role,
				member.provider,
				member.model,
				member.reasoningMode,
				member.reasoningEffort,
				member.executionPrompt,
				remoteSignature
			]);
			const markEdited = () => {
				setFeedback(void 0);
			};
			const persist = async (selection = {
				provider,
				model,
				reasoningMode,
				reasoningEffort
			}) => {
				const nextSignature = JSON.stringify([
					role,
					selection.provider,
					selection.model,
					selection.reasoningMode,
					selection.reasoningEffort,
					executionPrompt
				]);
				setProvider(selection.provider);
				setModel(selection.model);
				setReasoningMode(selection.reasoningMode);
				setReasoningEffort(selection.reasoningEffort);
				setBusy(true);
				setFeedback(void 0);
				try {
					await mutatePlan({
						sessionId: team.captainSessionId,
						teamId: team.teamId,
						action: "update_member",
						memberName: member.name,
						role,
						provider: selection.provider,
						model: selection.model,
						reasoningMode: selection.reasoningMode,
						...selection.reasoningMode === "explicit" ? { reasoningEffort: selection.reasoningEffort } : {},
						executionPrompt
					});
					setSavedSignature(nextSignature);
					setFeedback({
						tone: "success",
						message: t("plan.saved")
					});
				} catch (error) {
					setFeedback({
						tone: "error",
						message: t("plan.failed", { message: errorMessage$1(error) })
					});
				} finally {
					setBusy(false);
				}
			};
			const save = async (event) => {
				event.preventDefault();
				await persist();
			};
			const route = `${provider}/${model}`.replace(/^\//u, "");
			return (0, react_jsx_runtime.jsxs)("article", {
				className: ActivityPanel_module_css_default.planCard,
				"data-plan-member": member.name,
				"data-open": open,
				children: [(0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: ActivityPanel_module_css_default.planCardHeader,
					"aria-expanded": open,
					"aria-controls": bodyId,
					onClick: () => {
						setOpen((current) => !current);
					},
					children: [
						(0, react_jsx_runtime.jsxs)("span", {
							className: ActivityPanel_module_css_default.planCardIdentity,
							children: [(0, react_jsx_runtime.jsx)("strong", { children: member.name }), (0, react_jsx_runtime.jsx)("span", { children: role || t("plan.member.roleFallback") })]
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: ActivityPanel_module_css_default.planCardMeta,
							title: route,
							children: route
						}),
						dirty && (0, react_jsx_runtime.jsx)("em", {
							className: ActivityPanel_module_css_default.planDirty,
							children: t("plan.unsaved")
						}),
						(0, react_jsx_runtime.jsx)(DisclosureChevron, { open })
					]
				}), open && (0, react_jsx_runtime.jsxs)("form", {
					id: bodyId,
					className: ActivityPanel_module_css_default.planCardBody,
					onSubmit: (event) => {
						save(event);
					},
					children: [(0, react_jsx_runtime.jsxs)("fieldset", {
						disabled: busy,
						children: [
							(0, react_jsx_runtime.jsxs)("label", { children: [t("plan.member.role"), (0, react_jsx_runtime.jsx)("input", {
								name: "role",
								value: role,
								onChange: (event) => {
									setRole(event.currentTarget.value);
									markEdited();
								}
							})] }),
							(0, react_jsx_runtime.jsx)(StagedModelPicker, {
								directory: modelDirectory,
								provider,
								model,
								reasoningMode,
								reasoningEffort,
								busy,
								onChange: (selection) => {
									persist(selection);
								},
								t
							}),
							(0, react_jsx_runtime.jsxs)("label", { children: [t("plan.member.prompt"), (0, react_jsx_runtime.jsx)("textarea", {
								name: "executionPrompt",
								value: executionPrompt,
								onChange: (event) => {
									setExecutionPrompt(event.currentTarget.value);
									markEdited();
								},
								rows: 3
							})] })
						]
					}), (0, react_jsx_runtime.jsxs)("span", {
						className: ActivityPanel_module_css_default.planActions,
						children: [(0, react_jsx_runtime.jsx)(Feedback, { value: feedback }), (0, react_jsx_runtime.jsx)("button", {
							type: "submit",
							disabled: busy || !dirty || provider.trim() === "" || model.trim() === "" || reasoningMode === "explicit" && reasoningEffort.trim() === "",
							children: busy ? t("plan.saving") : t("plan.save")
						})]
					})]
				})]
			});
		}
		function StagedTaskEditor({ team, task, onPendingChange, t }) {
			const bodyId = (0, react.useId)();
			const taskDependencies = task.dependencies.join(", ");
			const [open, setOpen] = (0, react.useState)(false);
			const [subject, setSubject] = (0, react.useState)(task.subject);
			const [description, setDescription] = (0, react.useState)(task.description ?? "");
			const [assignee, setAssignee] = (0, react.useState)(task.assignee);
			const [dependencies, setDependencies] = (0, react.useState)(taskDependencies);
			const [kind, setKind] = (0, react.useState)(task.kind ?? "work");
			const [round, setRound] = (0, react.useState)(task.round?.toString() ?? "");
			const [objective, setObjective] = (0, react.useState)(task.objective ?? "");
			const [inScope, setInScope] = (0, react.useState)(formatLineList(task.inScope));
			const [outOfScope, setOutOfScope] = (0, react.useState)(formatLineList(task.outOfScope));
			const [acceptance, setAcceptance] = (0, react.useState)(formatLineList(task.acceptance));
			const [verify, setVerify] = (0, react.useState)(formatLineList(task.verify));
			const [deliverables, setDeliverables] = (0, react.useState)(formatLineList(task.deliverables));
			const [nonGoals, setNonGoals] = (0, react.useState)(formatLineList(task.nonGoals));
			const [reviewedTaskId, setReviewedTaskId] = (0, react.useState)(task.reviewedTaskId ?? "");
			const [sourceTaskId, setSourceTaskId] = (0, react.useState)(task.sourceTaskId ?? "");
			const [sourceFindingIds, setSourceFindingIds] = (0, react.useState)(formatLineList(task.sourceFindingIds));
			const [coverageOf, setCoverageOf] = (0, react.useState)(formatLineList(task.coverageOf));
			const taskContractSignature = [
				task.kind ?? "work",
				task.round?.toString() ?? "",
				task.objective ?? "",
				formatLineList(task.inScope),
				formatLineList(task.outOfScope),
				formatLineList(task.acceptance),
				formatLineList(task.verify),
				formatLineList(task.deliverables),
				formatLineList(task.nonGoals),
				task.reviewedTaskId ?? "",
				task.sourceTaskId ?? "",
				formatLineList(task.sourceFindingIds),
				formatLineList(task.coverageOf)
			];
			const remoteSignature = JSON.stringify([
				task.subject,
				task.description ?? "",
				task.assignee,
				taskDependencies,
				...taskContractSignature
			]);
			const [savedSignature, setSavedSignature] = (0, react.useState)(remoteSignature);
			const [busy, setBusy] = (0, react.useState)(false);
			const [confirmingRemove, setConfirmingRemove] = (0, react.useState)(false);
			const [feedback, setFeedback] = (0, react.useState)();
			useDismissSuccess(feedback, setFeedback);
			const signature = JSON.stringify([
				subject,
				description,
				assignee,
				dependencies,
				kind,
				round,
				objective,
				inScope,
				outOfScope,
				acceptance,
				verify,
				deliverables,
				nonGoals,
				reviewedTaskId,
				sourceTaskId,
				sourceFindingIds,
				coverageOf
			]);
			const dirty = signature !== savedSignature;
			(0, react.useEffect)(() => {
				onPendingChange(`task:${task.id}`, dirty || busy);
				return () => {
					onPendingChange(`task:${task.id}`, false);
				};
			}, [
				busy,
				dirty,
				onPendingChange,
				task.id
			]);
			(0, react.useEffect)(() => {
				setSubject(task.subject);
				setDescription(task.description ?? "");
				setAssignee(task.assignee);
				setDependencies(taskDependencies);
				setKind(task.kind ?? "work");
				setRound(task.round?.toString() ?? "");
				setObjective(task.objective ?? "");
				setInScope(formatLineList(task.inScope));
				setOutOfScope(formatLineList(task.outOfScope));
				setAcceptance(formatLineList(task.acceptance));
				setVerify(formatLineList(task.verify));
				setDeliverables(formatLineList(task.deliverables));
				setNonGoals(formatLineList(task.nonGoals));
				setReviewedTaskId(task.reviewedTaskId ?? "");
				setSourceTaskId(task.sourceTaskId ?? "");
				setSourceFindingIds(formatLineList(task.sourceFindingIds));
				setCoverageOf(formatLineList(task.coverageOf));
				setSavedSignature(remoteSignature);
			}, [remoteSignature]);
			const markEdited = () => {
				setFeedback(void 0);
				setConfirmingRemove(false);
			};
			const save = async (event) => {
				event.preventDefault();
				setBusy(true);
				setFeedback(void 0);
				try {
					await mutatePlan(buildStagedTaskMutationPayload({
						sessionId: team.captainSessionId,
						teamId: team.teamId,
						taskId: task.id,
						subject,
						description,
						assignee,
						dependencies,
						kind,
						round,
						objective,
						inScope,
						outOfScope,
						acceptance,
						verify,
						deliverables,
						nonGoals,
						reviewedTaskId,
						sourceTaskId,
						sourceFindingIds,
						coverageOf
					}));
					setSavedSignature(signature);
					setFeedback({
						tone: "success",
						message: t("plan.saved")
					});
				} catch (error) {
					setFeedback({
						tone: "error",
						message: t("plan.failed", { message: errorMessage$1(error) })
					});
				} finally {
					setBusy(false);
				}
			};
			const remove = async () => {
				setBusy(true);
				setFeedback(void 0);
				try {
					await mutatePlan({
						sessionId: team.captainSessionId,
						teamId: team.teamId,
						action: "remove_task",
						taskId: task.id
					});
					setFeedback({
						tone: "success",
						message: t("plan.removed")
					});
				} catch (error) {
					setFeedback({
						tone: "error",
						message: t("plan.failed", { message: errorMessage$1(error) })
					});
					setBusy(false);
				}
			};
			const dependencySummary = task.dependencies.length === 0 ? t("plan.dependencies.none") : t("plan.dependencies.count", { count: task.dependencies.length });
			const roundValid = round.trim() === "" || /^[1-9]\d*$/u.test(round.trim()) && Number.isSafeInteger(Number(round));
			return (0, react_jsx_runtime.jsxs)("article", {
				className: ActivityPanel_module_css_default.planCard,
				"data-plan-task": task.id,
				"data-open": open,
				children: [(0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: ActivityPanel_module_css_default.planCardHeader,
					"aria-expanded": open,
					"aria-controls": bodyId,
					onClick: () => {
						setOpen((current) => !current);
					},
					children: [
						(0, react_jsx_runtime.jsx)("span", {
							className: ActivityPanel_module_css_default.planTaskId,
							children: task.id
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: ActivityPanel_module_css_default.planTaskSummary,
							title: subject,
							children: subject
						}),
						(0, react_jsx_runtime.jsxs)("span", {
							className: ActivityPanel_module_css_default.planCardMeta,
							children: [
								assignee || t("plan.task.unassigned"),
								" · ",
								dependencySummary
							]
						}),
						dirty && (0, react_jsx_runtime.jsx)("em", {
							className: ActivityPanel_module_css_default.planDirty,
							children: t("plan.unsaved")
						}),
						(0, react_jsx_runtime.jsx)(DisclosureChevron, { open })
					]
				}), open && (0, react_jsx_runtime.jsxs)("form", {
					id: bodyId,
					className: ActivityPanel_module_css_default.planCardBody,
					onSubmit: (event) => {
						save(event);
					},
					children: [
						(0, react_jsx_runtime.jsxs)("fieldset", {
							disabled: busy,
							children: [
								(0, react_jsx_runtime.jsxs)("label", { children: [t("plan.task.subject"), (0, react_jsx_runtime.jsx)("input", {
									name: "subject",
									required: true,
									value: subject,
									onChange: (event) => {
										setSubject(event.currentTarget.value);
										markEdited();
									}
								})] }),
								(0, react_jsx_runtime.jsxs)("label", { children: [t("plan.task.description"), (0, react_jsx_runtime.jsx)("textarea", {
									name: "description",
									value: description,
									onChange: (event) => {
										setDescription(event.currentTarget.value);
										markEdited();
									},
									rows: 3
								})] }),
								(0, react_jsx_runtime.jsxs)("span", {
									className: ActivityPanel_module_css_default.planGrid,
									children: [(0, react_jsx_runtime.jsxs)("label", { children: [t("plan.task.kind"), (0, react_jsx_runtime.jsx)("select", {
										name: "kind",
										value: kind,
										onChange: (event) => {
											setKind(event.currentTarget.value);
											markEdited();
										},
										children: TASK_KIND_OPTIONS.map((candidate) => (0, react_jsx_runtime.jsx)("option", {
											value: candidate,
											children: taskKindLabel(t, candidate)
										}, candidate))
									})] }), (0, react_jsx_runtime.jsxs)("label", { children: [t("plan.task.round"), (0, react_jsx_runtime.jsx)("input", {
										name: "round",
										type: "number",
										min: "1",
										step: "1",
										value: round,
										onChange: (event) => {
											setRound(event.currentTarget.value);
											markEdited();
										}
									})] })]
								}),
								(0, react_jsx_runtime.jsxs)("span", {
									className: ActivityPanel_module_css_default.planGrid,
									children: [(0, react_jsx_runtime.jsxs)("label", { children: [t("plan.task.assignee"), (0, react_jsx_runtime.jsxs)("select", {
										name: "assignee",
										value: assignee,
										onChange: (event) => {
											setAssignee(event.currentTarget.value);
											markEdited();
										},
										children: [(0, react_jsx_runtime.jsx)("option", {
											value: "",
											children: t("plan.task.unassigned")
										}), team.members.map((member) => (0, react_jsx_runtime.jsx)("option", {
											value: member.name,
											children: member.name
										}, member.name))]
									})] }), (0, react_jsx_runtime.jsxs)("label", { children: [
										t("plan.task.dependencies"),
										(0, react_jsx_runtime.jsx)("input", {
											name: "dependencies",
											value: dependencies,
											onChange: (event) => {
												setDependencies(event.currentTarget.value);
												markEdited();
											}
										}),
										(0, react_jsx_runtime.jsx)("small", { children: t("plan.task.dependenciesHint") })
									] })]
								}),
								kind !== "work" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									(0, react_jsx_runtime.jsxs)("label", { children: [t("plan.task.objective"), (0, react_jsx_runtime.jsx)("textarea", {
										name: "objective",
										value: objective,
										onChange: (event) => {
											setObjective(event.currentTarget.value);
											markEdited();
										},
										rows: 2
									})] }),
									(0, react_jsx_runtime.jsxs)("span", {
										className: ActivityPanel_module_css_default.planGrid,
										children: [(0, react_jsx_runtime.jsxs)("label", { children: [
											t("plan.task.inScope"),
											(0, react_jsx_runtime.jsx)("textarea", {
												name: "inScope",
												value: inScope,
												onChange: (event) => {
													setInScope(event.currentTarget.value);
													markEdited();
												},
												rows: 3
											}),
											(0, react_jsx_runtime.jsx)("small", { children: t("plan.task.listHint") })
										] }), (0, react_jsx_runtime.jsxs)("label", { children: [
											t("plan.task.outOfScope"),
											(0, react_jsx_runtime.jsx)("textarea", {
												name: "outOfScope",
												value: outOfScope,
												onChange: (event) => {
													setOutOfScope(event.currentTarget.value);
													markEdited();
												},
												rows: 3
											}),
											(0, react_jsx_runtime.jsx)("small", { children: t("plan.task.listHint") })
										] })]
									}),
									(0, react_jsx_runtime.jsxs)("span", {
										className: ActivityPanel_module_css_default.planGrid,
										children: [(0, react_jsx_runtime.jsxs)("label", { children: [
											t("plan.task.acceptance"),
											(0, react_jsx_runtime.jsx)("textarea", {
												name: "acceptance",
												value: acceptance,
												onChange: (event) => {
													setAcceptance(event.currentTarget.value);
													markEdited();
												},
												rows: 3
											}),
											(0, react_jsx_runtime.jsx)("small", { children: t("plan.task.listHint") })
										] }), (0, react_jsx_runtime.jsxs)("label", { children: [
											t("plan.task.verify"),
											(0, react_jsx_runtime.jsx)("textarea", {
												name: "verify",
												value: verify,
												onChange: (event) => {
													setVerify(event.currentTarget.value);
													markEdited();
												},
												rows: 3
											}),
											(0, react_jsx_runtime.jsx)("small", { children: t("plan.task.listHint") })
										] })]
									}),
									(0, react_jsx_runtime.jsxs)("span", {
										className: ActivityPanel_module_css_default.planGrid,
										children: [(0, react_jsx_runtime.jsxs)("label", { children: [
											t("plan.task.deliverables"),
											(0, react_jsx_runtime.jsx)("textarea", {
												name: "deliverables",
												value: deliverables,
												onChange: (event) => {
													setDeliverables(event.currentTarget.value);
													markEdited();
												},
												rows: 3
											}),
											(0, react_jsx_runtime.jsx)("small", { children: t("plan.task.listHint") })
										] }), (0, react_jsx_runtime.jsxs)("label", { children: [
											t("plan.task.nonGoals"),
											(0, react_jsx_runtime.jsx)("textarea", {
												name: "nonGoals",
												value: nonGoals,
												onChange: (event) => {
													setNonGoals(event.currentTarget.value);
													markEdited();
												},
												rows: 3
											}),
											(0, react_jsx_runtime.jsx)("small", { children: t("plan.task.listHint") })
										] })]
									}),
									(0, react_jsx_runtime.jsxs)("label", { children: [
										t("plan.task.coverageOf"),
										(0, react_jsx_runtime.jsx)("textarea", {
											name: "coverageOf",
											value: coverageOf,
											onChange: (event) => {
												setCoverageOf(event.currentTarget.value);
												markEdited();
											},
											rows: 2
										}),
										(0, react_jsx_runtime.jsx)("small", { children: t("plan.task.listHint") })
									] }),
									kind === "review" && (0, react_jsx_runtime.jsxs)("label", { children: [t("plan.task.reviewedTaskId"), (0, react_jsx_runtime.jsx)("input", {
										name: "reviewedTaskId",
										value: reviewedTaskId,
										onChange: (event) => {
											setReviewedTaskId(event.currentTarget.value);
											markEdited();
										}
									})] }),
									kind === "repair" && (0, react_jsx_runtime.jsxs)("span", {
										className: ActivityPanel_module_css_default.planGrid,
										children: [(0, react_jsx_runtime.jsxs)("label", { children: [t("plan.task.sourceTaskId"), (0, react_jsx_runtime.jsx)("input", {
											name: "sourceTaskId",
											value: sourceTaskId,
											onChange: (event) => {
												setSourceTaskId(event.currentTarget.value);
												markEdited();
											}
										})] }), (0, react_jsx_runtime.jsxs)("label", { children: [
											t("plan.task.sourceFindingIds"),
											(0, react_jsx_runtime.jsx)("textarea", {
												name: "sourceFindingIds",
												value: sourceFindingIds,
												onChange: (event) => {
													setSourceFindingIds(event.currentTarget.value);
													markEdited();
												},
												rows: 3
											}),
											(0, react_jsx_runtime.jsx)("small", { children: t("plan.task.listHint") })
										] })]
									})
								] })
							]
						}),
						confirmingRemove && (0, react_jsx_runtime.jsxs)("span", {
							className: ActivityPanel_module_css_default.planConfirm,
							role: "alert",
							children: [
								(0, react_jsx_runtime.jsx)("span", { children: t("plan.removeWarning", { task: task.id }) }),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => {
										setConfirmingRemove(false);
									},
									children: t("plan.cancel")
								}),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"data-danger": true,
									"data-confirming": true,
									onClick: () => {
										remove();
									},
									children: t("plan.removeConfirm")
								})
							]
						}),
						(0, react_jsx_runtime.jsxs)("span", {
							className: ActivityPanel_module_css_default.planActions,
							children: [
								(0, react_jsx_runtime.jsx)(Feedback, { value: feedback }),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"data-danger": true,
									onClick: () => {
										setConfirmingRemove(true);
										setFeedback(void 0);
									},
									disabled: busy || confirmingRemove,
									children: t("plan.remove")
								}),
								(0, react_jsx_runtime.jsx)("button", {
									type: "submit",
									disabled: busy || !dirty || subject.trim() === "" || !roundValid,
									children: busy ? t("plan.saving") : t("plan.save")
								})
							]
						})
					]
				})]
			});
		}
		function StagingPlanEditor({ team, modelDirectory, onContinuePlanning, onDiscarded, t }) {
			const membersId = (0, react.useId)();
			const tasksId = (0, react.useId)();
			const [membersOpen, setMembersOpen] = (0, react.useState)(true);
			const [tasksOpen, setTasksOpen] = (0, react.useState)(true);
			const [newTask, setNewTask] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [discardArmed, setDiscardArmed] = (0, react.useState)(false);
			const [pendingEditors, setPendingEditors] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [feedback, setFeedback] = (0, react.useState)();
			useDismissSuccess(feedback, setFeedback);
			const dependencyLinks = team.tasks.reduce((total, task) => total + task.dependencies.length, 0);
			const runnable = team.members.length > 0 && team.tasks.length > 0;
			const hasPendingEdits = pendingEditors.size > 0 || newTask.trim() !== "";
			const waitingForFeedback = team.planReviewState === "awaiting_feedback";
			(0, react.useEffect)(() => {
				modelDirectory.load().catch(() => void 0);
			}, [modelDirectory]);
			const onPendingChange = (0, react.useCallback)((key, pending) => {
				setPendingEditors((current) => {
					if (pending === current.has(key)) return current;
					const next = new Set(current);
					if (pending) next.add(key);
					else next.delete(key);
					return next;
				});
			}, []);
			const addTask = async (event) => {
				event.preventDefault();
				setBusy(true);
				setFeedback(void 0);
				try {
					await mutatePlan({
						sessionId: team.captainSessionId,
						teamId: team.teamId,
						action: "add_task",
						subject: newTask,
						dependencies: []
					});
					setNewTask("");
					setFeedback({
						tone: "success",
						message: t("plan.taskAdded")
					});
					setTasksOpen(true);
				} catch (error) {
					setFeedback({
						tone: "error",
						message: t("plan.failed", { message: errorMessage$1(error) })
					});
				} finally {
					setBusy(false);
				}
			};
			const approve = async () => {
				setBusy(true);
				setFeedback(void 0);
				try {
					await mutatePlan({
						sessionId: team.captainSessionId,
						teamId: team.teamId,
						action: "approve"
					});
				} catch (error) {
					setFeedback({
						tone: "error",
						message: t("plan.failed", { message: errorMessage$1(error) })
					});
					setBusy(false);
				}
			};
			const continueInChat = async () => {
				if (waitingForFeedback) {
					onContinuePlanning();
					return;
				}
				setBusy(true);
				setFeedback(void 0);
				try {
					await mutatePlan({
						sessionId: team.captainSessionId,
						teamId: team.teamId,
						action: "continue"
					});
					onContinuePlanning();
				} catch (error) {
					setFeedback({
						tone: "error",
						message: t("plan.failed", { message: errorMessage$1(error) })
					});
					setBusy(false);
				}
			};
			const discard = async () => {
				setBusy(true);
				setFeedback(void 0);
				try {
					await mutatePlan({
						sessionId: team.captainSessionId,
						teamId: team.teamId,
						action: "discard"
					});
					onDiscarded();
				} catch (error) {
					setFeedback({
						tone: "error",
						message: t("plan.failed", { message: errorMessage$1(error) })
					});
					setBusy(false);
					setDiscardArmed(false);
				}
			};
			return (0, react_jsx_runtime.jsxs)("section", {
				className: ActivityPanel_module_css_default.planEditor,
				"data-staging-editor": true,
				children: [
					(0, react_jsx_runtime.jsxs)("header", {
						className: ActivityPanel_module_css_default.planHeader,
						children: [(0, react_jsx_runtime.jsxs)("span", { children: [(0, react_jsx_runtime.jsxs)("span", { children: [(0, react_jsx_runtime.jsx)("strong", { children: t("plan.title") }), (0, react_jsx_runtime.jsx)("small", { children: t("plan.readySummary", {
							members: team.members.length,
							tasks: team.tasks.length,
							links: dependencyLinks
						}) })] }), (0, react_jsx_runtime.jsx)("em", { children: t("plan.badge") })] }), (0, react_jsx_runtime.jsx)("p", { children: t("plan.description") })]
					}),
					(0, react_jsx_runtime.jsxs)("ol", {
						className: ActivityPanel_module_css_default.planFlow,
						"aria-label": t("plan.flow.aria"),
						children: [
							(0, react_jsx_runtime.jsxs)("li", {
								"data-active": true,
								children: [(0, react_jsx_runtime.jsx)("span", { children: "1" }), t("plan.flow.review")]
							}),
							(0, react_jsx_runtime.jsxs)("li", { children: [(0, react_jsx_runtime.jsx)("span", { children: "2" }), t("plan.flow.spawn")] }),
							(0, react_jsx_runtime.jsxs)("li", { children: [(0, react_jsx_runtime.jsx)("span", { children: "3" }), t("plan.flow.run")] })
						]
					}),
					(0, react_jsx_runtime.jsxs)("section", {
						className: ActivityPanel_module_css_default.planSection,
						children: [(0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: ActivityPanel_module_css_default.planSectionToggle,
							"aria-expanded": membersOpen,
							"aria-controls": membersId,
							onClick: () => {
								setMembersOpen((current) => !current);
							},
							children: [(0, react_jsx_runtime.jsxs)("span", { children: [(0, react_jsx_runtime.jsx)("strong", { children: t("plan.members.title") }), (0, react_jsx_runtime.jsx)("small", { children: t("plan.members.count", { count: team.members.length }) })] }), (0, react_jsx_runtime.jsx)(DisclosureChevron, { open: membersOpen })]
						}), membersOpen && (0, react_jsx_runtime.jsx)("div", {
							id: membersId,
							className: ActivityPanel_module_css_default.planList,
							children: team.members.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
								className: ActivityPanel_module_css_default.planEmpty,
								children: t("plan.members.empty")
							}) : team.members.map((member) => (0, react_jsx_runtime.jsx)(StagedMemberEditor, {
								team,
								member,
								modelDirectory,
								onPendingChange,
								t
							}, member.name))
						})]
					}),
					(0, react_jsx_runtime.jsxs)("section", {
						className: ActivityPanel_module_css_default.planSection,
						children: [(0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: ActivityPanel_module_css_default.planSectionToggle,
							"aria-expanded": tasksOpen,
							"aria-controls": tasksId,
							onClick: () => {
								setTasksOpen((current) => !current);
							},
							children: [(0, react_jsx_runtime.jsxs)("span", { children: [(0, react_jsx_runtime.jsx)("strong", { children: t("plan.tasks.title") }), (0, react_jsx_runtime.jsx)("small", { children: t("plan.tasks.count", {
								count: team.tasks.length,
								links: dependencyLinks
							}) })] }), (0, react_jsx_runtime.jsx)(DisclosureChevron, { open: tasksOpen })]
						}), tasksOpen && (0, react_jsx_runtime.jsx)("div", {
							id: tasksId,
							className: ActivityPanel_module_css_default.planList,
							children: team.tasks.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
								className: ActivityPanel_module_css_default.planEmpty,
								children: t("plan.tasks.empty")
							}) : team.tasks.map((task) => (0, react_jsx_runtime.jsx)(StagedTaskEditor, {
								team,
								task,
								onPendingChange,
								t
							}, task.id))
						})]
					}),
					(0, react_jsx_runtime.jsxs)("form", {
						className: ActivityPanel_module_css_default.planNewTask,
						onSubmit: (event) => {
							addTask(event);
						},
						children: [(0, react_jsx_runtime.jsxs)("label", { children: [(0, react_jsx_runtime.jsx)("span", { children: t("plan.newTaskLabel") }), (0, react_jsx_runtime.jsx)("input", {
							name: "newTask",
							value: newTask,
							onChange: (event) => {
								setNewTask(event.currentTarget.value);
								setFeedback(void 0);
							},
							placeholder: t("plan.newTask"),
							disabled: busy
						})] }), (0, react_jsx_runtime.jsx)("button", {
							type: "submit",
							disabled: busy || newTask.trim() === "",
							children: busy ? t("plan.adding") : t("plan.addTask")
						})]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: ActivityPanel_module_css_default.planApproveRow,
						"data-armed": discardArmed || void 0,
						"data-discard": discardArmed || void 0,
						"data-review-state": waitingForFeedback ? "awaiting-feedback" : "awaiting-review",
						children: [
							(0, react_jsx_runtime.jsxs)("span", {
								className: ActivityPanel_module_css_default.planApproveCopy,
								children: [(0, react_jsx_runtime.jsx)("strong", { children: discardArmed ? t("plan.discardConfirmTitle") : waitingForFeedback ? t("plan.feedbackTitle") : t("plan.approveTitle") }), (0, react_jsx_runtime.jsx)("small", { children: discardArmed ? t("plan.discardWarning") : waitingForFeedback ? t("plan.feedbackHint") : hasPendingEdits ? t("plan.pendingEdits") : t("plan.approveHint", {
									members: team.members.length,
									tasks: team.tasks.length
								}) })]
							}),
							(0, react_jsx_runtime.jsx)(Feedback, { value: feedback }),
							discardArmed ? (0, react_jsx_runtime.jsxs)("span", {
								className: ActivityPanel_module_css_default.planApproveActions,
								children: [(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: busy,
									onClick: () => {
										setDiscardArmed(false);
									},
									children: t("plan.cancel")
								}), (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"data-plan-discard": true,
									"data-danger": true,
									"data-confirming": true,
									disabled: busy,
									onClick: () => {
										discard();
									},
									children: busy ? t("plan.discarding") : t("plan.discardConfirm")
								})]
							}) : (0, react_jsx_runtime.jsxs)("span", {
								className: ActivityPanel_module_css_default.planReviewActions,
								children: [(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"data-plan-approve": true,
									disabled: busy || !runnable || hasPendingEdits,
									onClick: () => {
										approve();
									},
									children: t("plan.approve")
								}), (0, react_jsx_runtime.jsxs)("span", {
									className: ActivityPanel_module_css_default.planSecondaryActions,
									children: [(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										"data-plan-continue": true,
										disabled: busy,
										onClick: () => {
											continueInChat();
										},
										children: t(waitingForFeedback ? "plan.returnToChat" : "plan.continue")
									}), (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										"data-plan-discard": true,
										"data-danger": true,
										disabled: busy,
										onClick: () => {
											setDiscardArmed(true);
											setFeedback(void 0);
										},
										children: t("plan.discard")
									})]
								})]
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region lib/client/panel-geometry.js
		/** Pure persisted geometry rules for the AgentTeams shell-overlay panel. */
		const PANEL_LAYOUT_STORAGE_KEY = "dsh-agent-teams:activity-panel:v1";
		const DEFAULT_PANEL_LAYOUT = Object.freeze({
			mode: "docked",
			x: 0,
			y: 64,
			width: 388,
			height: 640,
			heightMode: "auto"
		});
		function clamp(value, minimum, maximum) {
			return Math.min(Math.max(value, minimum), maximum);
		}
		function finite(value) {
			return typeof value === "number" && Number.isFinite(value);
		}
		/** Decode one versioned localStorage value, rejecting partial/corrupt state. */
		function parsePanelLayout(value) {
			if (value === null) return DEFAULT_PANEL_LAYOUT;
			try {
				const parsed = JSON.parse(value);
				if (typeof parsed !== "object" || parsed === null) return DEFAULT_PANEL_LAYOUT;
				const record = parsed;
				if (record.mode !== "docked" && record.mode !== "floating" || !finite(record.x) || !finite(record.y) || !finite(record.width) || !finite(record.height)) return DEFAULT_PANEL_LAYOUT;
				return {
					mode: record.mode,
					x: record.x,
					y: record.y,
					width: record.width,
					height: record.height,
					heightMode: record.mode === "floating" && record.heightMode === "manual" ? "manual" : "auto"
				};
			} catch {
				return DEFAULT_PANEL_LAYOUT;
			}
		}
		/** Whether the panel should become a simple inset overlay with no gestures. */
		function compactPanelForBounds(bounds) {
			return bounds.width <= 960;
		}
		/** Docked and compact panels always fit content; floating panels may be user-sized. */
		function panelUsesAutoHeight(layout, bounds) {
			return compactPanelForBounds(bounds) || layout.mode === "docked" || layout.heightMode === "auto";
		}
		/** CSS max-height ceiling that keeps an auto-height panel inside its shell. */
		function panelMaximumHeight(layout, bounds) {
			const bottomInset = compactPanelForBounds(bounds) || layout.mode === "floating" ? 12 : 48;
			return Math.max(1, bounds.height - layout.y - bottomInset);
		}
		/** Resolve persisted state into a visible rectangle inside the current shell. */
		function resolvePanelGeometry(layout, bounds) {
			const boundsWidth = Math.max(1, bounds.width);
			const boundsHeight = Math.max(1, bounds.height);
			if (compactPanelForBounds(bounds)) return {
				...layout,
				x: 12,
				y: 12,
				width: Math.max(1, boundsWidth - 24),
				height: Math.max(1, boundsHeight - 24)
			};
			const maximumWidth = Math.max(1, Math.min(640, boundsWidth - 24));
			const minimumWidth = Math.min(320, maximumWidth);
			const width = clamp(layout.width, minimumWidth, maximumWidth);
			const maximumHeight = Math.max(1, boundsHeight - 24);
			const minimumHeight = Math.min(360, maximumHeight);
			if (layout.mode === "docked") {
				const y = clamp(64, 12, Math.max(12, boundsHeight - minimumHeight - 12));
				const availableHeight = Math.max(1, boundsHeight - y - 48);
				const height = clamp(availableHeight, Math.min(minimumHeight, availableHeight), maximumHeight);
				const anchorRight = clamp(bounds.anchorRight, 0, boundsWidth);
				const maximumX = Math.max(12, boundsWidth - width - 12);
				return {
					mode: "docked",
					x: clamp(anchorRight - 18 - width, 12, maximumX),
					y,
					width,
					height,
					heightMode: layout.heightMode
				};
			}
			const height = clamp(layout.height, minimumHeight, maximumHeight);
			return {
				mode: "floating",
				x: clamp(layout.x, 12, Math.max(12, boundsWidth - width - 12)),
				y: clamp(layout.y, 12, Math.max(12, boundsHeight - height - 12)),
				width,
				height,
				heightMode: layout.heightMode
			};
		}
		/** Undock without a visual jump by adopting the panel's resolved rectangle. */
		function floatPanelLayout(geometry, bounds) {
			return resolvePanelGeometry({
				...geometry,
				mode: "floating"
			}, bounds);
		}
		/** Return to the right dock, preserving width and restoring content-fit height. */
		function dockPanelLayout(layout, bounds) {
			return resolvePanelGeometry({
				...layout,
				mode: "docked",
				heightMode: "auto"
			}, bounds);
		}
		/** Translate a floating panel and clamp it back into the visible shell. */
		function movePanelLayout(start, dx, dy, bounds) {
			return resolvePanelGeometry({
				...start,
				mode: "floating",
				x: start.x + dx,
				y: start.y + dy
			}, bounds);
		}
		/** Resize while keeping the edge opposite the active handle stationary. */
		function resizePanelLayout(start, edge, dx, dy, bounds) {
			if (start.mode === "docked") {
				if (edge !== "left") return resolvePanelGeometry(start, bounds);
				return resolvePanelGeometry({
					...start,
					width: start.width - dx
				}, bounds);
			}
			const resolved = resolvePanelGeometry(start, bounds);
			const minimumWidth = Math.min(320, resolved.x + resolved.width - 12);
			const minimumHeight = Math.min(360, bounds.height - resolved.y - 12);
			if (edge === "left") {
				const right = resolved.x + resolved.width;
				const maximumWidth = Math.max(1, Math.min(640, right - 12));
				const width = clamp(resolved.width - dx, Math.min(minimumWidth, maximumWidth), maximumWidth);
				return {
					...resolved,
					x: right - width,
					width
				};
			}
			const maximumHeight = Math.max(1, bounds.height - resolved.y - 12);
			const height = clamp(resolved.height + dy, Math.min(minimumHeight, maximumHeight), maximumHeight);
			if (edge === "bottom") return {
				...resolved,
				height,
				heightMode: "manual"
			};
			const maximumWidth = Math.max(1, Math.min(640, bounds.width - resolved.x - 12));
			const width = clamp(resolved.width + dx, Math.min(minimumWidth, maximumWidth), maximumWidth);
			return {
				...resolved,
				width,
				height,
				heightMode: "manual"
			};
		}
		//#endregion
		//#region lib/client/ActivityPanel.js
		/**
		* AgentTeams activity panel: the top-right floater monitoring every team.
		*
		* Modeled on the Claude Code desktop SessionActivityPanel: a shell-overlay
		* panel that docks at the conversation's top-right edge by default, can be
		* dragged into a floating window, resized, and folded into an activity badge.
		* On wide viewports the docked panel makes the conversation column yield
		* space; narrow viewports keep a simple inset overlay. It
		* polls the host `/plugins/dsh-agent-teams/state` route for
		* server-side snapshots (durable files + live subagent activity), with a
		* collapsed badge that auto-expands once when activity appears. Archived
		* teams stay available for the owning conversation after live work ends.
		*
		* The floater mounts in ui-layout's additive `shell.overlay`; it is not a
		* conversation node — the in-conversation panel was removed in favor of this
		* always-available monitor.
		* @module dsh-agent-teams/client/activity
		*/
		/** Grace before the panel collapses once no team remains. */
		const AUTOCLOSE_GRACE_MS = 2e3;
		/**
		* Page-settle window after mount: activity restored on page load only shows
		* the collapsed badge, so the panel never yanks the conversation column
		* right after load. New activity after this window auto-expands as usual.
		*/
		const AUTO_OPEN_SETTLE_MS = 4e3;
		/** Root marker shared with the panel CSS while the shell overlay is expanded. */
		const PANEL_OPEN_ATTRIBUTE = "data-agent-teams-panel-open";
		/** Shared width concession consumed by the conversation root CSS. */
		const PANEL_SHIFT_PROPERTY = "--agent-teams-panel-shift";
		const PANEL_CONVERSATION_GAP = 14;
		const MOVE_THRESHOLD = 4;
		const CAPTAIN_ASSIGNEE = "captain";
		function initialPanelLayout() {
			if (typeof window === "undefined") return DEFAULT_PANEL_LAYOUT;
			return parsePanelLayout(window.localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY));
		}
		function initialPanelBounds() {
			if (typeof window === "undefined") return {
				width: 1440,
				height: 900,
				anchorRight: 1440
			};
			return {
				width: window.innerWidth,
				height: window.innerHeight,
				anchorRight: window.innerWidth
			};
		}
		/** Initial-letter fallback for unmatched roles. */
		function memberInitial(name) {
			return name.trim().slice(0, 1).toUpperCase() || "?";
		}
		function stableHash(value) {
			let hash = 0;
			for (let index = 0; index < value.length; index += 1) hash = (hash << 5) - hash + value.charCodeAt(index) | 0;
			return Math.abs(hash);
		}
		const ACCENTS = [
			"var(--dsw-alias-state-business-primary)",
			"var(--dsw-alias-state-success)",
			"var(--dsw-alias-state-danger)",
			"var(--dsw-alias-state-warning)",
			"var(--dsw-alias-label-tertiary)"
		];
		function accentOf(id) {
			return ACCENTS[stableHash(id) % ACCENTS.length] ?? ACCENTS[0];
		}
		/** Badge text follows the raw task status (finer than the 4 visual states):
		* claimed/pending/failed/cancelled keep their own labels and colors. */
		const TASK_STATUS_LABEL = {
			pending: "task.status.pending",
			claimed: "task.status.claimed",
			in_progress: "task.status.inProgress",
			completed: "task.status.completed",
			failed: "task.status.failed",
			cancelled: "task.status.cancelled"
		};
		function taskStatusLabel(status, t) {
			const key = TASK_STATUS_LABEL[status];
			return key === void 0 ? status : t(key);
		}
		function formatTaskIds(ids, t) {
			return ids.join(t("format.listSeparator"));
		}
		function taskTitle(task, model) {
			const extras = [
				task.kind,
				task.round === void 0 ? void 0 : `r${task.round}`,
				task.verdict,
				model === "" ? void 0 : model
			].filter((item) => item !== void 0);
			return extras.length === 0 ? `${task.id} · ${task.subject}` : `${task.id} · ${task.subject} · ${extras.join(" · ")}`;
		}
		/** Badge/bar coloring key: visual state, widened for terminal statuses. */
		function taskTone(state, status) {
			if (status === "failed") return "failed";
			if (status === "cancelled") return "cancelled";
			return state;
		}
		function Chevron({ open }) {
			return (0, react_jsx_runtime.jsx)("svg", {
				className: ActivityPanel_module_css_default.chevron,
				"data-open": open,
				width: "9",
				height: "9",
				viewBox: "0 0 10 10",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.5",
				strokeLinecap: "round",
				"aria-hidden": true,
				children: (0, react_jsx_runtime.jsx)("path", { d: "M3.5 2l3 3-3 3" })
			});
		}
		function WorkGlyph({ active }) {
			return (0, react_jsx_runtime.jsx)("svg", {
				className: ActivityPanel_module_css_default.workGlyph,
				"data-active": active,
				width: "11",
				height: "11",
				viewBox: "0 0 11 11",
				fill: "currentColor",
				"aria-hidden": true,
				children: [
					[0, 0],
					[4.2, 0],
					[8.4, 0],
					[0, 4.2],
					[4.2, 4.2],
					[8.4, 4.2]
				].map(([x, y], index) => (0, react_jsx_runtime.jsx)("rect", {
					x,
					y,
					width: "2.6",
					height: "2.6",
					rx: ".6",
					style: { animationDelay: `${index * .15}s` }
				}, `${x}:${y}`))
			});
		}
		/** Collapsed badge: an always-visible corner pill while any team exists. */
		function CollapsedBadge({ count, busy, onClick, t }) {
			return (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: ActivityPanel_module_css_default.badge,
				"data-agent-teams-collapsed": true,
				"data-busy": busy,
				onClick,
				"aria-label": t("activity.badgeAria", { count }),
				children: [(0, react_jsx_runtime.jsx)("span", {
					className: ActivityPanel_module_css_default.badgeDot,
					"data-busy": busy,
					"aria-hidden": true
				}), (0, react_jsx_runtime.jsx)("span", {
					className: ActivityPanel_module_css_default.badgeCount,
					children: count
				})]
			});
		}
		function memberStateLabel(member, tasks, historic, t) {
			const owned = tasks.filter((task) => task.assignee === member.name);
			if (member.activity === "working") return t("member.state.working");
			if (owned.some((task) => task.status === "failed")) return t("member.state.failed");
			if (owned.some((task) => task.state === "blocked")) return t("member.state.waiting");
			if (owned.length > 0 && owned.every((task) => task.status === "completed")) return t("member.state.delivered");
			if (member.status === "removed") return t(historic ? "member.state.left" : "member.state.removed");
			if (owned.length > 0) return t("member.state.pending");
			return t("member.state.unassigned");
		}
		function memberStatusText(member, tasks, t) {
			const owned = tasks.filter((task) => task.assignee === member.name);
			const current = owned.find((task) => task.id === member.currentTask);
			const blocked = owned.find((task) => task.state === "blocked");
			if (member.activity === "working" && current !== void 0) {
				const model = taskModelLabel(current, [member]);
				return model === "" ? t("member.status.executing", { taskId: current.id }) : t("member.status.executingModel", {
					taskId: current.id,
					model
				});
			}
			if (member.activity === "working") return t("member.status.working");
			if (blocked !== void 0) {
				const dependency = tasks.find((task) => blocked.dependencies.includes(task.id) && task.state !== "completed");
				if (dependency !== void 0) return t("member.status.waitingOn", {
					taskId: dependency.id,
					assignee: dependency.assignee || t("task.assignee.unclaimed")
				});
				return t("member.status.waitingPrerequisite");
			}
			if (member.total === 0) return t("member.status.waitingAssignment");
			if (member.done === member.total) return t("member.status.delivered");
			return t(member.activity === "idle" ? "member.status.idle" : "member.status.unknown");
		}
		function compactTaskLabel(subject) {
			const withoutVerb = subject.replace(/^开发\s*/u, "").replace(/^\d+[-_.、\s]*/u, "");
			const head = withoutVerb.split(/[（(·：:]/u)[0]?.trim() ?? withoutVerb;
			return head.length > 18 ? `${head.slice(0, 17)}…` : head;
		}
		function taskSummary(team, t, discarded = false) {
			const completed = team.tasks.filter((task) => task.status === "completed");
			const cancelled = team.tasks.filter((task) => task.status === "cancelled");
			const running = team.tasks.filter((task) => task.state === "running");
			const blocked = team.tasks.filter((task) => task.state === "blocked");
			const ready = team.tasks.filter((task) => task.state === "open" && task.status !== "completed" && task.status !== "failed" && task.status !== "cancelled");
			const failed = team.tasks.filter((task) => task.status === "failed");
			if (discarded) return t("task.summary.discarded", { count: team.tasks.length });
			if (team.tasks.length === 0) return t("task.summary.waitingBreakdown");
			if (team.phase === "staged") return t("task.summary.staged", { count: team.tasks.length });
			if (completed.length === team.tasks.length) return t("task.summary.allDelivered", { count: completed.length });
			if (completed.length + cancelled.length + failed.length === team.tasks.length) return t("task.summary.ended", {
				completed: completed.length,
				cancelled: cancelled.length,
				failed: failed.length
			});
			if (failed.length > 0 && running.length === 0 && ready.length === 0 && blocked.length === 0) return t("task.summary.failedSettled", { count: failed.length });
			if (blocked.length > 0 && running.length > 0) return t("task.summary.blockedAndRunning", {
				tasks: formatTaskIds(blocked.slice(0, 3).map((task) => task.id), t),
				more: blocked.length > 3 ? t("task.summary.more", { count: blocked.length - 3 }) : ""
			});
			if (running.length > 0) return t("task.summary.running", { tasks: formatTaskIds(running.map((task) => task.id), t) });
			if (ready.length > 0) return t("task.summary.ready", { tasks: formatTaskIds(ready.map((task) => task.id), t) });
			if (blocked.length > 0) return t("task.summary.blocked", { tasks: formatTaskIds(blocked.map((task) => task.id), t) });
			return t("task.summary.waitingSchedule");
		}
		function ProgressOverview({ team, t, discarded = false }) {
			const running = discarded ? 0 : team.tasks.filter((task) => task.state === "running").length;
			const blocked = discarded ? 0 : team.tasks.filter((task) => task.state === "blocked").length;
			const completed = discarded ? 0 : team.tasks.filter((task) => task.status === "completed").length;
			const settled = !discarded && team.tasks.length > 0 && team.tasks.every((task) => task.status === "completed" || task.status === "failed" || task.status === "cancelled");
			const summaryTone = discarded ? "discarded" : blocked > 0 ? "warning" : settled ? "completed" : "running";
			return (0, react_jsx_runtime.jsxs)("section", {
				className: ActivityPanel_module_css_default.progressOverview,
				"aria-label": t("progress.aria"),
				"data-progress-summary": true,
				children: [
					(0, react_jsx_runtime.jsx)("span", {
						className: ActivityPanel_module_css_default.progressTitle,
						children: t("progress.title")
					}),
					team.tasks.length > 0 ? (0, react_jsx_runtime.jsx)("span", {
						className: ActivityPanel_module_css_default.progressSegments,
						"aria-hidden": true,
						children: team.tasks.map((task) => (0, react_jsx_runtime.jsx)("span", { "data-state": discarded ? "cancelled" : taskTone(task.state, task.status) }, task.id))
					}) : (0, react_jsx_runtime.jsx)("span", { className: ActivityPanel_module_css_default.progressEmpty }),
					(0, react_jsx_runtime.jsxs)("span", {
						className: ActivityPanel_module_css_default.progressLegend,
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								"data-state": "running",
								children: t("progress.running", { count: running })
							}),
							(0, react_jsx_runtime.jsx)("span", {
								"data-state": "blocked",
								children: t("progress.blocked", { count: blocked })
							}),
							(0, react_jsx_runtime.jsx)("span", {
								"data-state": "completed",
								children: t("progress.delivered", { count: completed })
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("span", {
						className: ActivityPanel_module_css_default.progressSummary,
						"data-state": summaryTone,
						children: [(0, react_jsx_runtime.jsx)("span", { className: ActivityPanel_module_css_default.progressSummaryDot }), (0, react_jsx_runtime.jsx)("span", { children: taskSummary(team, t, discarded) })]
					})
				]
			});
		}
		function DependencyMap({ tasks, members, t, discarded = false }) {
			const [open, setOpen] = (0, react.useState)(true);
			const [hoverTaskId, setHoverTaskId] = (0, react.useState)(null);
			const [keyboardTaskId, setKeyboardTaskId] = (0, react.useState)(null);
			const [pinnedTaskId, setPinnedTaskId] = (0, react.useState)(null);
			const hoverTimer = (0, react.useRef)(null);
			const focusedTaskId = dependencyFocusTaskId(pinnedTaskId, keyboardTaskId, hoverTaskId);
			const layout = (0, react.useMemo)(() => compactDagLayout(tasks), [tasks]);
			const parallel = (0, react.useMemo)(() => usesParallelTaskGrid(tasks), [tasks]);
			const related = (0, react.useMemo)(() => focusedTaskId === null ? null : relatedTaskIds(focusedTaskId, tasks), [focusedTaskId, tasks]);
			const scheduleHover = (id) => {
				if (hoverTimer.current !== null) {
					clearTimeout(hoverTimer.current);
					hoverTimer.current = null;
				}
				if (id === null) {
					setHoverTaskId(null);
					return;
				}
				hoverTimer.current = setTimeout(() => {
					hoverTimer.current = null;
					setHoverTaskId(id);
				}, 180);
			};
			(0, react.useEffect)(() => () => {
				if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
			}, []);
			(0, react.useEffect)(() => {
				const onKeyDown = (event) => {
					if (event.key === "Escape") setPinnedTaskId(null);
				};
				window.addEventListener("keydown", onKeyDown);
				return () => {
					window.removeEventListener("keydown", onKeyDown);
				};
			}, []);
			if (tasks.length === 0) return null;
			const fallbackTask = tasks.find((task) => task.state === "blocked") ?? tasks.find((task) => task.state === "running") ?? tasks[0];
			const detailTask = tasks.find((task) => task.id === focusedTaskId) ?? fallbackTask;
			const detailModel = taskModelLabel(detailTask, members);
			const waitingOn = detailTask.dependencies.filter((dependency) => tasks.find((task) => task.id === dependency)?.status !== "completed");
			const dependents = tasks.filter((task) => task.dependencies.includes(detailTask.id));
			return (0, react_jsx_runtime.jsxs)("section", {
				className: ActivityPanel_module_css_default.dependencySection,
				"aria-label": t("dependency.aria"),
				"data-dependency-map": true,
				children: [(0, react_jsx_runtime.jsxs)("header", {
					className: ActivityPanel_module_css_default.sectionHead,
					children: [(0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: ActivityPanel_module_css_default.sectionToggleTitle,
						onClick: () => {
							setOpen((current) => !current);
						},
						"aria-expanded": open,
						children: [
							(0, react_jsx_runtime.jsx)(Chevron, { open }),
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, {}),
							" ",
							t(parallel ? "dependency.parallel" : "dependency.title")
						]
					}), (0, react_jsx_runtime.jsx)("span", {
						className: ActivityPanel_module_css_default.sectionHint,
						children: pinnedTaskId === null ? t(parallel ? "dependency.hint.parallel" : "dependency.hint.chain") : t("dependency.hint.pinned", { taskId: pinnedTaskId })
					})]
				}), open && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("div", {
					className: ActivityPanel_module_css_default.dagViewport,
					children: (0, react_jsx_runtime.jsxs)("div", {
						className: ActivityPanel_module_css_default.dagCanvas,
						"data-layout": parallel ? "parallel" : "dependency",
						style: parallel ? void 0 : {
							width: layout.width,
							height: layout.height
						},
						children: [!parallel && (0, react_jsx_runtime.jsx)("svg", {
							className: ActivityPanel_module_css_default.dagEdges,
							width: layout.width,
							height: layout.height,
							"aria-hidden": true,
							children: layout.edges.map((edge) => {
								const active = related !== null && related.has(edge.from) && related.has(edge.to);
								return (0, react_jsx_runtime.jsx)("path", {
									d: edge.path,
									"data-active": active,
									"data-dimmed": related !== null && !active
								}, `${edge.from}:${edge.to}`);
							})
						}), layout.nodes.map(({ task, x, y }) => {
							const model = taskModelLabel(task, members);
							const shortModel = compactModelLabel(model);
							return (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: ActivityPanel_module_css_default.dagNode,
								style: parallel ? { height: 30 } : {
									left: x,
									top: y,
									width: 92,
									height: 30
								},
								"data-task-id": task.id,
								"data-state": discarded ? "cancelled" : taskTone(task.state, task.status),
								"data-task-model": model || void 0,
								"data-focused": related?.has(task.id) ?? false,
								"data-dimmed": related !== null && !related.has(task.id),
								"aria-pressed": pinnedTaskId === task.id,
								title: taskTitle(task, model),
								onClick: () => {
									setPinnedTaskId((current) => current === task.id ? null : task.id);
								},
								onMouseEnter: () => {
									scheduleHover(task.id);
								},
								onMouseLeave: () => {
									scheduleHover(null);
								},
								onFocus: () => {
									setKeyboardTaskId(task.id);
								},
								onBlur: () => {
									setKeyboardTaskId(null);
								},
								children: [
									(0, react_jsx_runtime.jsxs)("span", {
										className: ActivityPanel_module_css_default.dagNodeHead,
										children: [(0, react_jsx_runtime.jsx)("span", { className: ActivityPanel_module_css_default.dagNodeDot }), task.id]
									}),
									(0, react_jsx_runtime.jsx)("span", {
										className: ActivityPanel_module_css_default.dagNodeLabel,
										children: task.state === "running" && shortModel !== "" ? shortModel : compactTaskLabel(task.subject)
									}),
									task.state === "running" && (0, react_jsx_runtime.jsx)("span", {
										className: ActivityPanel_module_css_default.dagRunningState,
										"aria-label": t("task.runningAria"),
										children: (0, react_jsx_runtime.jsx)(WorkGlyph, { active: true })
									})
								]
							}, task.id);
						})]
					})
				}), (0, react_jsx_runtime.jsxs)("section", {
					className: ActivityPanel_module_css_default.taskDetail,
					"data-task-detail": detailTask.id,
					children: [
						(0, react_jsx_runtime.jsxs)("span", {
							className: ActivityPanel_module_css_default.taskDetailHead,
							children: [
								(0, react_jsx_runtime.jsx)("span", {
									className: ActivityPanel_module_css_default.taskDetailId,
									children: detailTask.id
								}),
								(0, react_jsx_runtime.jsx)("span", {
									className: ActivityPanel_module_css_default.taskDetailSubject,
									title: detailTask.subject,
									children: detailTask.subject.replace(/^开发\s*/u, "")
								}),
								(0, react_jsx_runtime.jsx)("span", {
									className: ActivityPanel_module_css_default.taskDetailBadge,
									"data-state": discarded ? "cancelled" : taskTone(detailTask.state, detailTask.status),
									children: discarded ? t("task.status.notRun") : taskStatusLabel(detailTask.status, t)
								})
							]
						}),
						(0, react_jsx_runtime.jsxs)("span", {
							className: ActivityPanel_module_css_default.taskDetailLine,
							children: [
								detailTask.assignee || t("task.assignee.unclaimed"),
								" · ",
								discarded ? t("task.detail.notRun") : detailTask.status === "completed" ? t("task.detail.completed") : detailTask.dependencies.length === 0 ? t("task.detail.noPrerequisite") : waitingOn.length === 0 ? t("task.detail.ready") : t("task.detail.waitingOn", { tasks: formatTaskIds(waitingOn, t) })
							]
						}),
						detailModel !== "" && (0, react_jsx_runtime.jsx)("span", {
							className: ActivityPanel_module_css_default.taskDetailModel,
							"data-task-model": detailModel,
							children: t("task.model", { model: detailModel })
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: ActivityPanel_module_css_default.taskDetailMeta,
							children: dependents.length === 0 ? t("task.detail.noDownstream") : t("task.detail.unlocks", { tasks: formatTaskIds(dependents.map((task) => task.id), t) })
						})
					]
				})] })]
			});
		}
		function TeamSection({ team, modelDirectory, onContinuePlanning, onDiscarded, onNavigate, t, historic = false }) {
			const [membersOpen, setMembersOpen] = (0, react.useState)(true);
			const [stopOpen, setStopOpen] = (0, react.useState)(false);
			const [stopping, setStopping] = (0, react.useState)(false);
			const [stopError, setStopError] = (0, react.useState)("");
			const discarded = historic && team.phase === "staged";
			const stopped = !historic && team.halted === true;
			const busyCount = team.members.filter((member) => member.activity === "working").length;
			const assignedCount = team.tasks.filter((task) => task.assignee !== "" && task.assignee !== CAPTAIN_ASSIGNEE).length;
			const captainOwned = team.tasks.filter((task) => task.assignee === CAPTAIN_ASSIGNEE && task.status !== "completed" && task.status !== "failed" && task.status !== "cancelled");
			const captainBusy = captainOwned.length > 0;
			const captainTaskIds = formatTaskIds(captainOwned.map((task) => task.id), t);
			const completedCount = team.tasks.filter((task) => task.status === "completed").length;
			const allCompleted = team.tasks.length > 0 && completedCount === team.tasks.length;
			const allSettled = team.tasks.length > 0 && team.tasks.every((task) => task.status === "completed" || task.status === "failed" || task.status === "cancelled");
			const unfinishedCount = team.tasks.filter((task) => task.status !== "completed" && task.status !== "failed" && task.status !== "cancelled").length;
			const canStop = !historic && team.phase === "running" && team.halted !== true && teamIsActive(team);
			const stopTeam = async () => {
				if (stopping) return;
				setStopping(true);
				setStopError("");
				try {
					const response = await fetch(ACTIVITY_HALT_URL, {
						method: "POST",
						cache: "no-store",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							sessionId: team.captainSessionId,
							teamId: team.teamId
						})
					});
					if (!response.ok) {
						let message = t("team.stopRequestFailed");
						try {
							const body = await response.json();
							if (typeof body.error === "string" && body.error.trim() !== "") message = body.error;
						} catch {}
						throw new Error(message);
					}
					setStopOpen(false);
				} catch (error) {
					setStopError(t("team.stopFailed", { message: error instanceof Error ? error.message : String(error) }));
				} finally {
					setStopping(false);
				}
			};
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)("section", {
				className: ActivityPanel_module_css_default.team,
				"data-team-id": team.teamId,
				children: [
					(0, react_jsx_runtime.jsxs)("header", {
						className: ActivityPanel_module_css_default.teamHead,
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								className: ActivityPanel_module_css_default.teamName,
								title: team.name,
								children: team.name
							}),
							historic && (0, react_jsx_runtime.jsx)("span", {
								className: ActivityPanel_module_css_default.historicPill,
								children: t(discarded ? "team.discarded" : "team.ended")
							}),
							stopped && (0, react_jsx_runtime.jsx)("span", {
								className: ActivityPanel_module_css_default.historicPill,
								children: t("team.stopped")
							}),
							(0, react_jsx_runtime.jsxs)("span", {
								className: ActivityPanel_module_css_default.teamStats,
								children: [
									(0, react_jsx_runtime.jsx)("span", {
										"data-stat": "members",
										children: t("team.stats.members", { count: team.members.length })
									}),
									(0, react_jsx_runtime.jsx)("span", {
										"data-stat": "tasks",
										children: t("team.stats.completed", {
											completed: completedCount,
											total: team.tasks.length
										})
									}),
									(0, react_jsx_runtime.jsx)("span", {
										"data-stat": "messages",
										children: t("team.stats.messages", { count: team.messageCount })
									})
								]
							}),
							canStop && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: ActivityPanel_module_css_default.teamStopButton,
								"aria-label": t("team.stop"),
								title: t("team.stop"),
								onClick: () => {
									setStopError("");
									setStopOpen(true);
								},
								children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconStopFill16, {})
							})
						]
					}),
					team.phase === "staged" && !historic && modelDirectory !== void 0 && onContinuePlanning !== void 0 && onDiscarded !== void 0 && (0, react_jsx_runtime.jsx)(StagingPlanEditor, {
						team,
						modelDirectory,
						onContinuePlanning,
						onDiscarded,
						t
					}),
					(0, react_jsx_runtime.jsxs)("section", {
						className: ActivityPanel_module_css_default.delegationSection,
						"aria-label": t("delegation.aria"),
						"data-delegation-map": true,
						children: [
							(0, react_jsx_runtime.jsxs)("div", {
								className: ActivityPanel_module_css_default.captainNode,
								children: [
									(0, react_jsx_runtime.jsx)("span", {
										className: ActivityPanel_module_css_default.captainAvatar,
										children: (0, react_jsx_runtime.jsx)("img", {
											className: ActivityPanel_module_css_default.leadAvatar,
											src: LEAD_ART,
											alt: "",
											"aria-hidden": true
										})
									}),
									(0, react_jsx_runtime.jsxs)("span", {
										className: ActivityPanel_module_css_default.captainInfo,
										children: [(0, react_jsx_runtime.jsxs)("span", {
											className: ActivityPanel_module_css_default.captainLine,
											children: [(0, react_jsx_runtime.jsx)("span", {
												className: ActivityPanel_module_css_default.captainName,
												children: t("captain.name")
											}), (0, react_jsx_runtime.jsx)("span", {
												className: ActivityPanel_module_css_default.captainRole,
												children: t("captain.role")
											})]
										}), (0, react_jsx_runtime.jsx)("span", {
											className: ActivityPanel_module_css_default.captainSummary,
											children: discarded ? t("captain.summary.discarded", {
												tasks: team.tasks.length,
												members: team.members.length
											}) : captainBusy ? t("captain.summary.withTakeover", {
												tasks: assignedCount,
												captainTasks: captainTaskIds
											}) : team.phase === "staged" ? t(team.planReviewState === "awaiting_feedback" ? "captain.summary.awaitingFeedback" : "captain.summary.staged", {
												tasks: team.tasks.length,
												members: team.members.length
											}) : t("captain.summary", {
												tasks: assignedCount,
												members: team.members.length
											})
										})]
									}),
									(0, react_jsx_runtime.jsxs)("span", {
										className: ActivityPanel_module_css_default.captainState,
										"data-busy": captainBusy || busyCount > 0,
										children: [(0, react_jsx_runtime.jsx)(WorkGlyph, { active: captainBusy || busyCount > 0 }), discarded ? t("captain.state.discarded") : captainBusy ? t("captain.state.takeover", { tasks: captainTaskIds }) : team.phase === "staged" ? t(team.planReviewState === "awaiting_feedback" ? "captain.state.awaitingFeedback" : "captain.state.staged") : busyCount > 0 ? t("captain.state.working", { count: busyCount }) : t(allCompleted ? "captain.state.collected" : allSettled ? "captain.state.settled" : "captain.state.waiting")]
									})
								]
							}),
							(0, react_jsx_runtime.jsx)(ProgressOverview, {
								team,
								t,
								discarded
							}),
							(0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: ActivityPanel_module_css_default.membersToggle,
								onClick: () => {
									setMembersOpen((current) => !current);
								},
								"aria-expanded": membersOpen,
								"data-members-toggle": true,
								children: [(0, react_jsx_runtime.jsxs)("span", { children: [(0, react_jsx_runtime.jsx)(Chevron, { open: membersOpen }), t("members.toggle", { count: team.members.length })] }), (0, react_jsx_runtime.jsx)("span", { children: t(membersOpen ? "members.collapse" : "members.expand") })]
							}),
							membersOpen && (0, react_jsx_runtime.jsxs)("div", {
								className: ActivityPanel_module_css_default.delegationTree,
								children: [team.members.length === 0 && (0, react_jsx_runtime.jsx)("span", {
									className: ActivityPanel_module_css_default.emptyHint,
									children: t("members.empty")
								}), team.members.map((member) => {
									const owned = team.tasks.filter((task) => task.assignee === member.name);
									const memberModel = memberRouteLabel(member);
									return (0, react_jsx_runtime.jsxs)("div", {
										className: ActivityPanel_module_css_default.memberBlock,
										"data-activity": member.activity,
										children: [
											(0, react_jsx_runtime.jsx)("span", {
												className: ActivityPanel_module_css_default.memberBranch,
												"aria-hidden": true,
												children: (0, react_jsx_runtime.jsx)("span", {})
											}),
											(0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												className: ActivityPanel_module_css_default.memberRow,
												"data-activity": member.activity,
												onClick: () => {
													if (member.id !== "") onNavigate(team.captainSessionId, member.id);
												},
												children: [
													(0, react_jsx_runtime.jsxs)("span", {
														className: ActivityPanel_module_css_default.memberAvatar,
														"data-unread": member.unread > 0,
														children: [memberArtUrl(member.name, member.role) !== null ? (0, react_jsx_runtime.jsx)("img", {
															className: ActivityPanel_module_css_default.memberArt,
															src: memberArtUrl(member.name, member.role) ?? "",
															alt: "",
															"aria-hidden": true
														}) : (0, react_jsx_runtime.jsx)("span", {
															className: ActivityPanel_module_css_default.memberInitial,
															style: { background: accentOf(member.id) },
															children: memberInitial(member.name)
														}), (0, react_jsx_runtime.jsx)("img", {
															className: ActivityPanel_module_css_default.stateArt,
															"data-activity": member.activity,
															src: ACTION_ART[member.activity],
															alt: "",
															"aria-hidden": true
														})]
													}),
													(0, react_jsx_runtime.jsxs)("span", {
														className: ActivityPanel_module_css_default.memberInfo,
														children: [
															(0, react_jsx_runtime.jsxs)("span", {
																className: ActivityPanel_module_css_default.memberLine,
																children: [
																	(0, react_jsx_runtime.jsx)("span", {
																		className: ActivityPanel_module_css_default.memberName,
																		children: member.name
																	}),
																	member.role !== "" && (0, react_jsx_runtime.jsx)("span", {
																		className: ActivityPanel_module_css_default.memberRole,
																		children: member.role
																	}),
																	(0, react_jsx_runtime.jsxs)("span", {
																		className: ActivityPanel_module_css_default.memberState,
																		"data-activity": member.activity,
																		children: [(0, react_jsx_runtime.jsx)(WorkGlyph, { active: member.activity === "working" }), discarded ? t("member.state.notCreated") : stopped ? t("member.state.stopped") : team.phase === "staged" ? t("member.state.staged") : memberStateLabel(member, team.tasks, historic, t)]
																	})
																]
															}),
															(0, react_jsx_runtime.jsx)("span", {
																className: ActivityPanel_module_css_default.memberStatusLine,
																children: discarded ? t("member.status.discarded") : stopped ? t("member.status.stopped") : team.phase === "staged" ? t("member.status.staged") : historic && owned.length > 0 && owned.every((task) => task.status === "completed" || task.status === "failed" || task.status === "cancelled") ? t("member.status.settled") : memberStatusText(member, team.tasks, t)
															}),
															memberModel !== "" && (0, react_jsx_runtime.jsx)("span", {
																className: ActivityPanel_module_css_default.memberModel,
																"data-member-model": memberModel,
																children: t("member.model", { model: memberModel })
															})
														]
													}),
													(0, react_jsx_runtime.jsxs)("span", {
														className: ActivityPanel_module_css_default.memberCount,
														children: [
															member.done,
															"/",
															member.total
														]
													})
												]
											}),
											(0, react_jsx_runtime.jsxs)("div", {
												className: ActivityPanel_module_css_default.assignmentLine,
												children: [(0, react_jsx_runtime.jsx)("span", {
													className: ActivityPanel_module_css_default.assignmentLabel,
													children: t(discarded ? "assignment.discarded" : team.phase === "staged" ? "assignment.staged" : "assignment.label")
												}), (0, react_jsx_runtime.jsx)("span", {
													className: ActivityPanel_module_css_default.assignmentTasks,
													children: owned.length === 0 ? (0, react_jsx_runtime.jsx)("span", {
														className: ActivityPanel_module_css_default.taskEmpty,
														children: t("assignment.empty")
													}) : owned.map((task) => {
														const model = taskModelLabel(task, team.members);
														const shortModel = compactModelLabel(model);
														return (0, react_jsx_runtime.jsx)("span", {
															className: ActivityPanel_module_css_default.assignmentChip,
															"data-state": discarded ? "cancelled" : taskTone(task.state, task.status),
															"data-task-model": model || void 0,
															title: taskTitle(task, model),
															children: task.state === "running" && shortModel !== "" ? `${task.id} · ${shortModel}` : task.id
														}, task.id);
													})
												})]
											})
										]
									}, member.id || member.name);
								})]
							})
						]
					}),
					(0, react_jsx_runtime.jsx)(DependencyMap, {
						tasks: team.tasks,
						members: team.members,
						t,
						discarded
					})
				]
			}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: stopOpen,
				onClose: () => {
					if (!stopping) setStopOpen(false);
				},
				title: t("team.stopTitle", { team: team.name }),
				closeLabel: t("plan.cancel"),
				description: t("team.stopDescription", {
					tasks: unfinishedCount,
					members: busyCount
				}),
				footer: (0, react_jsx_runtime.jsxs)("span", {
					className: ActivityPanel_module_css_default.stopModalActions,
					children: [(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: stopping,
						onClick: () => {
							setStopOpen(false);
						},
						children: t("team.stopCancel")
					}), (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						"data-danger": true,
						disabled: stopping,
						onClick: () => {
							stopTeam();
						},
						children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconStopFill16, {}), stopping ? t("team.stopping") : t("team.stopConfirm")]
					})]
				}),
				children: stopError !== "" && (0, react_jsx_runtime.jsxs)("p", {
					className: ActivityPanel_module_css_default.stopModalError,
					role: "alert",
					children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutline16, {}), stopError]
				})
			})] });
		}
		function ActivityPanel({ sessionsList, modelDirectories, openMember, t }) {
			const navigateToSession = (parentId, childId) => {
				setOpen(false);
				setWasActive(false);
				openMember(parentId, childId);
			};
			const [open, setOpen] = (0, react.useState)(false);
			const [openOwner, setOpenOwner] = (0, react.useState)();
			const [autoOpened, setAutoOpened] = (0, react.useState)(false);
			const [wasActive, setWasActive] = (0, react.useState)(false);
			const [layout, setLayout] = (0, react.useState)(initialPanelLayout);
			const [bounds, setBounds] = (0, react.useState)(initialPanelBounds);
			const [interaction, setInteraction] = (0, react.useState)(null);
			const panelRef = (0, react.useRef)(null);
			const boundsRef = (0, react.useRef)(bounds);
			const gestureRef = (0, react.useRef)(null);
			const frameRef = (0, react.useRef)(null);
			const pendingLayoutRef = (0, react.useRef)(null);
			const current = (0, react.useSyncExternalStore)(sessionsList.subscribe, sessionsList.getSnapshot).current;
			const autoOpenTrackerRef = (0, react.useRef)({
				sessionId: current,
				restoreComplete: false,
				liveTeamIds: /* @__PURE__ */ new Set()
			});
			const monitorTargets = (0, react.useSyncExternalStore)(subscribeActivityMonitorTargets, getActivityMonitorTargetsSnapshot);
			const returnToComposer = () => {
				setOpen(false);
				setOpenOwner(void 0);
				window.requestAnimationFrame(() => {
					document.querySelector("[data-composer-card] textarea")?.focus();
				});
			};
			const { teams, archivedTeams } = (0, react.useSyncExternalStore)(subscribeActivitySnapshots, getActivitySnapshotsSnapshot);
			const currentTargets = (0, react.useMemo)(() => current === void 0 ? [] : monitorTargets.filter((target) => target.sessionId === current), [current, monitorTargets]);
			const currentRef = (0, react.useRef)(current);
			(0, react.useEffect)(() => {
				currentRef.current = current;
			}, [current]);
			const mountedAtRef = (0, react.useRef)(performance.now());
			const expanded = activityPanelExpandedForSession(open, openOwner, current);
			const geometry = (0, react.useMemo)(() => resolvePanelGeometry(layout, bounds), [layout, bounds]);
			const compact = compactPanelForBounds(bounds);
			const commitLayout = (0, react.useCallback)((next) => {
				setLayout(next);
			}, []);
			(0, react.useEffect)(() => {
				window.localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
			}, [layout]);
			(0, react.useLayoutEffect)(() => {
				const overlay = document.querySelector("[data-shell-overlay]");
				if (overlay === null) return;
				const conversation = document.querySelector("[data-phase='active']");
				let frame = null;
				const measure = () => {
					frame = null;
					const overlayRect = overlay.getBoundingClientRect();
					const conversationRect = conversation?.getBoundingClientRect();
					const next = {
						width: overlayRect.width,
						height: overlayRect.height,
						anchorRight: conversationRect === void 0 ? overlayRect.width : Math.min(Math.max(conversationRect.right - overlayRect.left, 0), overlayRect.width)
					};
					const previous = boundsRef.current;
					if (previous.width === next.width && previous.height === next.height && previous.anchorRight === next.anchorRight) return;
					boundsRef.current = next;
					setBounds(next);
				};
				const scheduleMeasure = () => {
					frame ??= requestAnimationFrame(measure);
				};
				measure();
				const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);
				observer?.observe(overlay);
				if (conversation !== null) observer?.observe(conversation);
				window.addEventListener("resize", scheduleMeasure);
				return () => {
					if (frame !== null) cancelAnimationFrame(frame);
					observer?.disconnect();
					window.removeEventListener("resize", scheduleMeasure);
				};
			}, [current]);
			(0, react.useLayoutEffect)(() => {
				const tracker = autoOpenTrackerRef.current;
				if (tracker.sessionId !== current) {
					tracker.sessionId = current;
					tracker.restoreComplete = false;
					tracker.liveTeamIds = /* @__PURE__ */ new Set();
					setWasActive(false);
					setAutoOpened(false);
				}
				if (openOwner === void 0 || openOwner === current) return;
				setOpen(false);
				setOpenOwner(void 0);
			}, [current, openOwner]);
			(0, react.useLayoutEffect)(() => {
				const root = document.documentElement;
				if (expanded && geometry.mode === "docked" && !compact) {
					root.setAttribute(PANEL_OPEN_ATTRIBUTE, "");
					root.style.setProperty(PANEL_SHIFT_PROPERTY, `${geometry.width + PANEL_CONVERSATION_GAP + 18}px`);
				} else {
					root.removeAttribute(PANEL_OPEN_ATTRIBUTE);
					root.style.removeProperty(PANEL_SHIFT_PROPERTY);
				}
				return () => {
					root.removeAttribute(PANEL_OPEN_ATTRIBUTE);
					root.style.removeProperty(PANEL_SHIFT_PROPERTY);
				};
			}, [
				compact,
				expanded,
				geometry.mode,
				geometry.width
			]);
			(0, react.useEffect)(() => {
				if (current === void 0) return;
				const controller = startActivityPolling(currentTargets, { discoverySessionId: current });
				let active = true;
				const tracker = autoOpenTrackerRef.current;
				if (tracker.sessionId === current && !tracker.restoreComplete) controller.firstTick.then(() => {
					const latest = autoOpenTrackerRef.current;
					if (!active || latest.sessionId !== current || latest.restoreComplete) return;
					latest.liveTeamIds = new Set(getActivitySnapshotsSnapshot().teams.filter((team) => team.captainSessionId === current).map((team) => team.teamId));
					latest.restoreComplete = true;
				});
				return () => {
					active = false;
					controller.stop();
				};
			}, [current, currentTargets]);
			(0, react.useEffect)(() => {
				const onOpenPanel = () => {
					const activeSession = currentRef.current;
					if (activeSession === void 0) return;
					setOpenOwner(activeSession);
					setOpen(true);
				};
				window.addEventListener(OPEN_PANEL_EVENT, onOpenPanel);
				return () => {
					window.removeEventListener(OPEN_PANEL_EVENT, onOpenPanel);
				};
			}, []);
			const visibleTeams = (0, react.useMemo)(() => current === void 0 ? [] : teams.filter((team) => team.captainSessionId === current), [teams, current]);
			const visibleArchived = (0, react.useMemo)(() => current === void 0 ? [] : archivedTeams.filter((team) => team.captainSessionId === current && !teams.some((live) => live.captainSessionId === current && live.teamId === team.teamId)), [
				archivedTeams,
				current,
				teams
			]);
			const visibleCount = visibleTeams.length + visibleArchived.length;
			const visibleLiveTeamIds = (0, react.useMemo)(() => visibleTeams.map((team) => team.teamId).sort(), [visibleTeams]);
			(0, react.useEffect)(() => {
				const tracker = autoOpenTrackerRef.current;
				const settled = performance.now() - mountedAtRef.current >= AUTO_OPEN_SETTLE_MS;
				const shouldAutoExpand = tracker.sessionId === current && activityPanelShouldAutoExpand({
					alreadyAutoOpened: autoOpened,
					pageSettled: settled,
					restoreComplete: tracker.restoreComplete,
					previousLiveTeamIds: tracker.liveTeamIds,
					currentLiveTeamIds: visibleLiveTeamIds
				});
				if (tracker.sessionId === current && tracker.restoreComplete) tracker.liveTeamIds = new Set(visibleLiveTeamIds);
				if (visibleCount > 0) {
					setWasActive(true);
					if (shouldAutoExpand) {
						setOpenOwner(current);
						setOpen(true);
						setAutoOpened(true);
					}
					return;
				}
				if (!wasActive) return;
				const timer = setTimeout(() => {
					setOpen(false);
					setOpenOwner(void 0);
					setWasActive(false);
					setAutoOpened(false);
				}, AUTOCLOSE_GRACE_MS);
				return () => {
					clearTimeout(timer);
				};
			}, [
				visibleCount,
				visibleLiveTeamIds.join("\0"),
				autoOpened,
				wasActive,
				current
			]);
			const busy = (0, react.useMemo)(() => visibleTeams.some((team) => team.members.some((member) => member.activity === "working")), [visibleTeams]);
			const hasTeams = visibleCount > 0;
			const panelGeometryForGesture = (0, react.useCallback)(() => {
				const measuredHeight = panelRef.current?.getBoundingClientRect().height;
				if (measuredHeight === void 0 || measuredHeight <= 0) return geometry;
				return {
					...geometry,
					height: measuredHeight
				};
			}, [geometry]);
			const flushScheduledLayout = (0, react.useCallback)(() => {
				if (frameRef.current !== null) {
					cancelAnimationFrame(frameRef.current);
					frameRef.current = null;
				}
				const pending = pendingLayoutRef.current;
				pendingLayoutRef.current = null;
				if (pending !== null) commitLayout(pending);
			}, [commitLayout]);
			const scheduleLayout = (0, react.useCallback)((next) => {
				pendingLayoutRef.current = next;
				frameRef.current ??= requestAnimationFrame(() => {
					frameRef.current = null;
					const pending = pendingLayoutRef.current;
					pendingLayoutRef.current = null;
					if (pending !== null) commitLayout(pending);
				});
			}, [commitLayout]);
			(0, react.useEffect)(() => () => {
				if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
			}, []);
			const beginMove = (0, react.useCallback)((event) => {
				if (compact || event.button !== 0 || event.target.closest("button") !== null) return;
				event.preventDefault();
				event.currentTarget.setPointerCapture(event.pointerId);
				gestureRef.current = {
					kind: "move",
					pointerId: event.pointerId,
					originX: event.clientX,
					originY: event.clientY,
					start: panelGeometryForGesture(),
					activated: false
				};
			}, [compact, panelGeometryForGesture]);
			const beginResize = (0, react.useCallback)((edge, event) => {
				if (compact || event.button !== 0 || geometry.mode === "docked" && edge !== "left") return;
				event.preventDefault();
				event.stopPropagation();
				event.currentTarget.setPointerCapture(event.pointerId);
				gestureRef.current = {
					kind: "resize",
					edge,
					pointerId: event.pointerId,
					originX: event.clientX,
					originY: event.clientY,
					start: panelGeometryForGesture(),
					activated: true
				};
				setInteraction("resizing");
			}, [
				compact,
				geometry.mode,
				panelGeometryForGesture
			]);
			const updateGesture = (0, react.useCallback)((event) => {
				const gesture = gestureRef.current;
				if (gesture === null || gesture.pointerId !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
				const dx = event.clientX - gesture.originX;
				const dy = event.clientY - gesture.originY;
				const activeBounds = boundsRef.current;
				if (gesture.kind === "move") {
					if (!gesture.activated && Math.hypot(dx, dy) < MOVE_THRESHOLD) return;
					if (!gesture.activated) {
						gesture.activated = true;
						setInteraction("dragging");
					}
					scheduleLayout(movePanelLayout(floatPanelLayout(gesture.start, activeBounds), dx, dy, activeBounds));
					return;
				}
				scheduleLayout(resizePanelLayout(gesture.start, gesture.edge ?? "left", dx, dy, activeBounds));
			}, [scheduleLayout]);
			const endGesture = (0, react.useCallback)((event) => {
				const gesture = gestureRef.current;
				if (gesture === null || gesture.pointerId !== event.pointerId) return;
				updateGesture(event);
				flushScheduledLayout();
				if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
				gestureRef.current = null;
				setInteraction(null);
			}, [flushScheduledLayout, updateGesture]);
			const cancelGesture = (0, react.useCallback)((event) => {
				const gesture = gestureRef.current;
				if (gesture === null || gesture.pointerId !== event.pointerId) return;
				flushScheduledLayout();
				gestureRef.current = null;
				setInteraction(null);
			}, [flushScheduledLayout]);
			const toggleDock = (0, react.useCallback)(() => {
				const liveGeometry = panelGeometryForGesture();
				commitLayout(liveGeometry.mode === "docked" ? floatPanelLayout(liveGeometry, boundsRef.current) : dockPanelLayout(liveGeometry, boundsRef.current));
			}, [commitLayout, panelGeometryForGesture]);
			const autoHeight = panelUsesAutoHeight(geometry, bounds);
			const panelStyle = {
				width: geometry.width,
				height: autoHeight ? "auto" : geometry.height,
				maxHeight: panelMaximumHeight(geometry, bounds),
				transform: `translate3d(${geometry.x}px, ${geometry.y}px, 0)`
			};
			if (!hasTeams && !expanded) return null;
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [!expanded && (0, react_jsx_runtime.jsx)(CollapsedBadge, {
				count: visibleCount,
				busy,
				t,
				onClick: () => {
					if (current === void 0) return;
					setOpenOwner(current);
					setOpen(true);
				}
			}), expanded && (0, react_jsx_runtime.jsxs)("aside", {
				ref: panelRef,
				className: ActivityPanel_module_css_default.panel,
				style: panelStyle,
				"data-agent-teams-activity": true,
				"data-panel-mode": geometry.mode,
				"data-height-mode": autoHeight ? "auto" : "manual",
				"data-compact": compact || void 0,
				"data-dragging": interaction === "dragging" || void 0,
				"data-resizing": interaction === "resizing" || void 0,
				"aria-label": t("activity.panelAria"),
				children: [
					(0, react_jsx_runtime.jsxs)("header", {
						className: ActivityPanel_module_css_default.panelHead,
						onPointerDown: beginMove,
						onPointerMove: updateGesture,
						onPointerUp: endGesture,
						onPointerCancel: cancelGesture,
						"data-drag-handle": !compact || void 0,
						children: [(0, react_jsx_runtime.jsxs)("span", {
							className: ActivityPanel_module_css_default.panelTitle,
							children: [t("activity.title"), (0, react_jsx_runtime.jsx)("span", {
								className: ActivityPanel_module_css_default.panelDot,
								"data-busy": busy,
								"aria-hidden": true
							})]
						}), (0, react_jsx_runtime.jsxs)("span", {
							className: ActivityPanel_module_css_default.panelControls,
							children: [!compact && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: ActivityPanel_module_css_default.iconButton,
								"data-control": "dock",
								"data-mode": geometry.mode,
								onClick: toggleDock,
								"aria-label": t(geometry.mode === "docked" ? "activity.float" : "activity.dockRight"),
								title: t(geometry.mode === "docked" ? "activity.float" : "activity.dockRight"),
								children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPanelLeftOutline16, {})
							}), (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: ActivityPanel_module_css_default.iconButton,
								"data-control": "collapse",
								onClick: () => {
									setOpen(false);
									setOpenOwner(void 0);
								},
								"aria-label": t("activity.collapse"),
								title: t("activity.collapse"),
								children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {})
							})]
						})]
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: ActivityPanel_module_css_default.teams,
						children: visibleCount === 0 ? (0, react_jsx_runtime.jsx)("span", {
							className: ActivityPanel_module_css_default.emptyHint,
							children: t("activity.empty")
						}) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [visibleTeams.map((team) => (0, react_jsx_runtime.jsx)(TeamSection, {
							team,
							modelDirectory: team.phase === "staged" ? modelDirectories.directoryFor(team.captainSessionId) : void 0,
							onContinuePlanning: returnToComposer,
							onDiscarded: returnToComposer,
							onNavigate: navigateToSession,
							t
						}, team.teamId)), visibleArchived.map((team) => (0, react_jsx_runtime.jsxs)("div", {
							"data-team-id": team.teamId,
							"data-historic": true,
							className: ActivityPanel_module_css_default.archivedWrap,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: ActivityPanel_module_css_default.archiveLabel,
								children: t(team.phase === "staged" ? "archive.discardedLabel" : "archive.label")
							}), (0, react_jsx_runtime.jsx)(TeamSection, {
								team,
								onNavigate: navigateToSession,
								t,
								historic: true
							})]
						}, `${team.captainSessionId}:${team.teamId}`))] })
					}),
					!compact && (0, react_jsx_runtime.jsx)("div", {
						className: ActivityPanel_module_css_default.resizeHandle,
						"data-resize-edge": "left",
						onPointerDown: (event) => {
							beginResize("left", event);
						},
						onPointerMove: updateGesture,
						onPointerUp: endGesture,
						onPointerCancel: cancelGesture,
						"aria-hidden": true
					}),
					!compact && geometry.mode === "floating" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("div", {
						className: ActivityPanel_module_css_default.resizeHandle,
						"data-resize-edge": "bottom",
						onPointerDown: (event) => {
							beginResize("bottom", event);
						},
						onPointerMove: updateGesture,
						onPointerUp: endGesture,
						onPointerCancel: cancelGesture,
						"aria-hidden": true
					}), (0, react_jsx_runtime.jsx)("div", {
						className: ActivityPanel_module_css_default.resizeHandle,
						"data-resize-edge": "corner",
						onPointerDown: (event) => {
							beginResize("corner", event);
						},
						onPointerMove: updateGesture,
						onPointerUp: endGesture,
						onPointerCancel: cancelGesture,
						"aria-hidden": true
					})] })
				]
			})] });
		}
		//#endregion
		//#region lib/client/model-catalog.js
		async function loadModelCatalog(fetcher = fetch, timeoutMs = 1e4) {
			const abort = new AbortController();
			const timer = setTimeout(() => abort.abort(), timeoutMs);
			try {
				const response = await fetcher("/plugins/dsh-agent-teams/models", { signal: abort.signal });
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				const body = await response.json();
				const models = Array.isArray(body.models) ? body.models : [];
				return models.length === 0 ? {
					status: "empty",
					models,
					error: null
				} : {
					status: "ready",
					models,
					error: null
				};
			} catch (error) {
				return {
					status: "error",
					models: [],
					error: abort.signal.aborted ? `模型目录请求超过 ${timeoutMs}ms` : error instanceof Error ? error.message : String(error)
				};
			} finally {
				clearTimeout(timer);
			}
		}
		//#endregion
		//#region lib/client/profile-editor.js
		const MAX_PROFILES = 16;
		const MAX_MEMBERS = 8;
		const MAX_TASKS = 32;
		const MAX_PROFILE_NAME_LENGTH = 64;
		const PROFILE_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,63}$/u;
		const CAPTAIN_NAME = "captain";
		const PROFILE_KEYS = /* @__PURE__ */ new Set([
			"description",
			"protocol",
			"executionPrompt",
			"fallback",
			"members",
			"tasks",
			"taskPlanning",
			"reviewPolicy"
		]);
		const MEMBER_KEYS = /* @__PURE__ */ new Set([
			"name",
			"role",
			"provider",
			"model",
			"reasoning_mode",
			"reasoning_effort",
			"executionPrompt",
			"fallback"
		]);
		const TASK_KEYS = /* @__PURE__ */ new Set([
			"id",
			"subject",
			"description",
			"assignee",
			"dependencies"
		]);
		const FALLBACK_KEYS = /* @__PURE__ */ new Set(["provider", "model"]);
		const REVIEW_POLICY_KEYS = /* @__PURE__ */ new Set([
			"requirementsMinRounds",
			"requirementsMaxRounds",
			"codeMaxRounds",
			"maxRepairAttempts",
			"requiredReviewers"
		]);
		function createCommittedProfileNameMap(profiles) {
			return Object.fromEntries(Object.keys(profiles).map((name) => [name, name]));
		}
		function renameCommittedProfileName(committedProfileNames, previousName, nextName) {
			if (previousName === nextName) return { ...committedProfileNames };
			const next = { ...committedProfileNames };
			const committedName = next[previousName];
			delete next[previousName];
			delete next[nextName];
			if (committedName !== void 0) next[nextName] = committedName;
			return next;
		}
		function applyMemberReasoningMode(member, mode, selectedModel) {
			if (mode !== "explicit") {
				const next = {
					...member,
					reasoning_mode: mode
				};
				delete next.reasoning_effort;
				return next;
			}
			const effort = selectedModel?.efforts.find((candidate) => candidate.id === member.reasoning_effort) ?? selectedModel?.efforts.find((candidate) => candidate.id === selectedModel.defaultEffort) ?? selectedModel?.efforts[0];
			if (effort === void 0) return void 0;
			return {
				...member,
				reasoning_mode: mode,
				reasoning_effort: effort.id
			};
		}
		function hasUnvalidatedExplicitRoleDraft(nextProfiles, committedProfiles, catalog, catalogReady, committedProfileNames) {
			return Object.entries(nextProfiles).some(([profileName, profile]) => {
				const committedName = committedProfileNames[profileName];
				const committedProfile = committedName === void 0 ? void 0 : committedProfiles[committedName];
				return profile.members.some((member, index) => {
					if (member.reasoning_mode !== "explicit") return false;
					const committedMember = committedProfile?.members.find((candidate) => candidate.name === member.name) ?? committedProfile?.members[index];
					if (!(committedMember?.reasoning_mode !== "explicit" || committedMember.provider !== member.provider || committedMember.model !== member.model || committedMember.reasoning_effort !== member.reasoning_effort)) return false;
					if (member.provider === void 0 || member.model === void 0 || member.reasoning_effort === void 0) return true;
					if (!catalogReady) return true;
					const selectedModel = catalog.find((entry) => entry.provider === member.provider && entry.id === member.model);
					return selectedModel === void 0 || !selectedModel.efforts.some((effort) => effort.id === member.reasoning_effort);
				});
			});
		}
		function sameFallback(left, right) {
			return left?.provider === right?.provider && left?.model === right?.model;
		}
		function fallbackNeedsCatalogValidation(fallback, committedFallback, catalog, catalogReady) {
			if (sameFallback(fallback, committedFallback) || fallback === void 0) return false;
			if (fallback.provider === "" || fallback.model === "" || !catalogReady) return true;
			return !catalog.some((entry) => entry.provider === fallback.provider && entry.id === fallback.model);
		}
		function hasUnvalidatedFallbackDraft(nextProfiles, committedProfiles, catalog, catalogReady, committedProfileNames) {
			return Object.entries(nextProfiles).some(([profileName, profile]) => {
				const committedName = committedProfileNames[profileName];
				const committedProfile = committedName === void 0 ? void 0 : committedProfiles[committedName];
				if (fallbackNeedsCatalogValidation(profile.fallback, committedProfile?.fallback, catalog, catalogReady)) return true;
				return profile.members.some((member, index) => {
					const committedMember = committedProfile?.members.find((candidate) => candidate.name === member.name) ?? committedProfile?.members[index];
					return fallbackNeedsCatalogValidation(member.fallback, committedMember?.fallback, catalog, catalogReady);
				});
			});
		}
		function isRecord(value) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
			const prototype = Object.getPrototypeOf(value);
			return prototype === Object.prototype || prototype === null;
		}
		function cloneJson(value) {
			return JSON.parse(JSON.stringify(value));
		}
		function trimString(value) {
			return typeof value === "string" ? value.trim() : void 0;
		}
		function optionalString(value, path, errors) {
			if (value === void 0) return void 0;
			if (typeof value !== "string") {
				errors.push(`${path} must be a string`);
				return;
			}
			const normalized = value.trim();
			return normalized === "" ? void 0 : normalized;
		}
		function requiredString(value, path, errors) {
			const normalized = trimString(value);
			if (normalized === void 0 || normalized === "") {
				errors.push(`${path} must not be empty`);
				return;
			}
			return normalized;
		}
		function normalizeReasoningMode(value) {
			if (value === "target-default" || value === "route-aware" || value === "explicit") return value;
		}
		function normalizeOptionalEditorString(value) {
			const normalized = trimString(value);
			return normalized === "" ? void 0 : normalized;
		}
		function assertKnownKeys(value, allowed, path, errors) {
			for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${path}.${key} is not supported`);
		}
		function normalizeName(value) {
			const name = trimString(value);
			if (name === void 0 || name === "" || name.length > MAX_PROFILE_NAME_LENGTH) return void 0;
			if (!PROFILE_NAME_PATTERN.test(name) || name.toLowerCase() === CAPTAIN_NAME) return void 0;
			return name;
		}
		function normalizeMemberForEditor(value) {
			if (!isRecord(value)) return void 0;
			const name = trimString(value.name);
			if (name === void 0 || name === "") return void 0;
			const reasoning_mode = normalizeReasoningMode(value.reasoning_mode);
			if (reasoning_mode === void 0) return void 0;
			const provider = normalizeOptionalEditorString(value.provider);
			const model = normalizeOptionalEditorString(value.model);
			const reasoning_effort = normalizeOptionalEditorString(value.reasoning_effort);
			if (provider === void 0 !== (model === void 0)) return void 0;
			if (reasoning_mode === "explicit" && (provider === void 0 || model === void 0 || reasoning_effort === void 0)) return;
			if (reasoning_mode !== "explicit" && reasoning_effort !== void 0) return void 0;
			const member = {
				name,
				reasoning_mode
			};
			for (const key of ["role", "executionPrompt"]) {
				const normalized = trimString(value[key]);
				if (normalized !== void 0 && normalized !== "") member[key] = normalized;
			}
			if (provider !== void 0) member.provider = provider;
			if (model !== void 0) member.model = model;
			if (reasoning_effort !== void 0) member.reasoning_effort = reasoning_effort;
			const fallback = normalizeFallbackForEditor(value.fallback);
			if (fallback !== void 0) member.fallback = fallback;
			return member;
		}
		function normalizeFallbackForEditor(value) {
			if (!isRecord(value)) return void 0;
			const provider = trimString(value.provider);
			const model = trimString(value.model);
			if (provider === void 0 || provider === "" || model === void 0 || model === "") return void 0;
			return {
				provider,
				model
			};
		}
		function normalizeTaskForEditor(value) {
			if (!isRecord(value)) return void 0;
			const id = trimString(value.id);
			const subject = trimString(value.subject);
			if (id === void 0 || id === "" || subject === void 0 || subject === "") return void 0;
			const task = {
				id,
				subject
			};
			for (const key of ["description", "assignee"]) {
				const normalized = trimString(value[key]);
				if (normalized !== void 0 && normalized !== "") task[key] = normalized;
			}
			if (Array.isArray(value.dependencies)) {
				const dependencies = value.dependencies.map((dependency) => trimString(dependency)).filter((dependency) => dependency !== void 0 && dependency !== "");
				if (dependencies.length > 0) task.dependencies = dependencies;
			}
			return task;
		}
		function normalizeProfileForEditor(value) {
			if (!isRecord(value) || !Array.isArray(value.members)) return void 0;
			const members = value.members.map(normalizeMemberForEditor).filter((member) => member !== void 0);
			if (members.length === 0) return void 0;
			const profile = { members };
			for (const key of [
				"description",
				"protocol",
				"executionPrompt"
			]) {
				const normalized = trimString(value[key]);
				if (normalized !== void 0 && normalized !== "") profile[key] = normalized;
			}
			if (value.taskPlanning === "captain" || value.taskPlanning === "seed") profile.taskPlanning = value.taskPlanning;
			const fallback = normalizeFallbackForEditor(value.fallback);
			if (fallback !== void 0) profile.fallback = fallback;
			if (Array.isArray(value.tasks)) {
				const tasks = value.tasks.map(normalizeTaskForEditor).filter((task) => task !== void 0);
				if (tasks.length > 0) profile.tasks = tasks;
			}
			if (isRecord(value.reviewPolicy)) {
				const policy = {};
				for (const key of [
					"requirementsMinRounds",
					"requirementsMaxRounds",
					"codeMaxRounds",
					"maxRepairAttempts"
				]) if (Number.isSafeInteger(value.reviewPolicy[key]) && Number(value.reviewPolicy[key]) > 0) policy[key] = Number(value.reviewPolicy[key]);
				if (Array.isArray(value.reviewPolicy.requiredReviewers)) {
					const reviewers = value.reviewPolicy.requiredReviewers.map((reviewer) => trimString(reviewer)).filter((reviewer) => reviewer !== void 0 && reviewer !== "");
					if (reviewers.length > 0) policy.requiredReviewers = reviewers;
				}
				if (Object.keys(policy).length > 0) profile.reviewPolicy = policy;
			}
			return profile;
		}
		function normalizeMapForEditor(value) {
			if (!isRecord(value)) return {};
			const result = {};
			for (const [rawName, rawProfile] of Object.entries(value)) {
				const name = normalizeName(rawName);
				const profile = normalizeProfileForEditor(rawProfile);
				if (name !== void 0 && profile !== void 0) result[name] = profile;
			}
			return result;
		}
		/** Normalize the host response into an isolated browser-editable snapshot. */
		function normalizeProfileSnapshot(value) {
			if (!isRecord(value) || value.schemaVersion !== 2) throw new Error("AgentTeams profile snapshot schemaVersion must be 2");
			if (!isRecord(value.profiles) || !Array.isArray(value.builtInNames) || !isRecord(value.builtInProfiles) || typeof value.unsupportedPersistedVersion !== "boolean") throw new Error("AgentTeams profile snapshot must be a complete V2 document");
			const unsupportedPersistedVersion = value.unsupportedPersistedVersion === true;
			const source = value;
			const suppliedBuiltIns = normalizeMapForEditor(source.builtInProfiles);
			const profiles = unsupportedPersistedVersion ? {} : normalizeMapForEditor(source.profiles);
			const requestedNames = Array.isArray(source.builtInNames) ? source.builtInNames.map(normalizeName).filter((name) => name !== void 0) : [];
			const builtInNames = [...new Set(requestedNames.filter((name) => suppliedBuiltIns[name] !== void 0 || !unsupportedPersistedVersion && profiles[name] !== void 0))];
			const builtInProfiles = {};
			for (const name of builtInNames) {
				const profile = suppliedBuiltIns[name] ?? profiles[name];
				if (profile !== void 0) builtInProfiles[name] = cloneJson(profile);
			}
			return {
				schemaVersion: 2,
				profiles: cloneJson(profiles),
				builtInNames,
				builtInProfiles,
				unsupportedPersistedVersion
			};
		}
		/** Create the minimum valid captain-planned profile used by the editor. */
		function createEmptyTeamProfile(_name) {
			return {
				taskPlanning: "captain",
				members: [{
					name: "member",
					reasoning_mode: "target-default"
				}]
			};
		}
		/** Clone an editable profile map before applying a UI update. */
		function cloneProfileMap(value) {
			return cloneJson(value);
		}
		function normalizeFallbackForSave(value, path, errors) {
			if (value === void 0) return void 0;
			if (!isRecord(value)) {
				errors.push(`${path} must be an object`);
				return;
			}
			assertKnownKeys(value, FALLBACK_KEYS, path, errors);
			const provider = requiredString(value.provider, `${path}.provider`, errors);
			const model = requiredString(value.model, `${path}.model`, errors);
			if (provider === void 0 || model === void 0) return void 0;
			return {
				provider,
				model
			};
		}
		function normalizeMemberForSave(value, path, errors) {
			if (!isRecord(value)) {
				errors.push(`${path} must be an object`);
				return;
			}
			assertKnownKeys(value, MEMBER_KEYS, path, errors);
			const name = requiredString(value.name, `${path}.name`, errors);
			if (name === void 0) return void 0;
			if (name.toLowerCase() === CAPTAIN_NAME) errors.push(`${path}.name is reserved for the captain`);
			const rawReasoningMode = requiredString(value.reasoning_mode, `${path}.reasoning_mode`, errors);
			if (rawReasoningMode === void 0) return void 0;
			const reasoning_mode = normalizeReasoningMode(rawReasoningMode);
			if (reasoning_mode === void 0) {
				errors.push(`${path}.reasoning_mode is invalid`);
				return;
			}
			const provider = optionalString(value.provider, `${path}.provider`, errors);
			const model = optionalString(value.model, `${path}.model`, errors);
			const reasoning_effort = optionalString(value.reasoning_effort, `${path}.reasoning_effort`, errors);
			if (provider === void 0 !== (model === void 0)) errors.push(`${path}.provider and ${path}.model must be set together`);
			if (reasoning_mode === "explicit" && (provider === void 0 || model === void 0 || reasoning_effort === void 0)) errors.push(`${path} explicit policy requires provider, model, and reasoning_effort`);
			if (reasoning_mode !== "explicit" && reasoning_effort !== void 0) errors.push(`${path}.reasoning_effort is valid only for explicit policy`);
			const member = {
				name,
				reasoning_mode
			};
			for (const key of ["role", "executionPrompt"]) {
				const normalized = optionalString(value[key], `${path}.${key}`, errors);
				if (normalized !== void 0) member[key] = normalized;
			}
			if (provider !== void 0) member.provider = provider;
			if (model !== void 0) member.model = model;
			if (reasoning_effort !== void 0) member.reasoning_effort = reasoning_effort;
			const fallback = normalizeFallbackForSave(value.fallback, `${path}.fallback`, errors);
			if (fallback !== void 0) member.fallback = fallback;
			return member;
		}
		function normalizeTaskForSave(value, path, errors) {
			if (!isRecord(value)) {
				errors.push(`${path} must be an object`);
				return;
			}
			assertKnownKeys(value, TASK_KEYS, path, errors);
			const id = requiredString(value.id, `${path}.id`, errors);
			const subject = requiredString(value.subject, `${path}.subject`, errors);
			if (id === void 0 || subject === void 0) return void 0;
			const task = {
				id,
				subject
			};
			for (const key of ["description", "assignee"]) {
				const normalized = optionalString(value[key], `${path}.${key}`, errors);
				if (normalized !== void 0) task[key] = normalized;
			}
			if (value.dependencies !== void 0) if (!Array.isArray(value.dependencies)) errors.push(`${path}.dependencies must be an array`);
			else {
				const dependencies = [];
				for (const [index, dependency] of value.dependencies.entries()) {
					const normalized = requiredString(dependency, `${path}.dependencies[${index}]`, errors);
					if (normalized !== void 0 && !dependencies.includes(normalized)) dependencies.push(normalized);
				}
				if (dependencies.length > 0) task.dependencies = dependencies;
			}
			return task;
		}
		function normalizeReviewPolicyForSave(value, path, errors) {
			if (value === void 0) return void 0;
			if (!isRecord(value)) {
				errors.push(`${path} must be an object`);
				return;
			}
			assertKnownKeys(value, REVIEW_POLICY_KEYS, path, errors);
			const policy = {};
			for (const key of [
				"requirementsMinRounds",
				"requirementsMaxRounds",
				"codeMaxRounds",
				"maxRepairAttempts"
			]) {
				if (value[key] === void 0 || value[key] === "") continue;
				if (!Number.isSafeInteger(value[key]) || Number(value[key]) < 1) errors.push(`${path}.${key} must be a positive integer`);
				else policy[key] = Number(value[key]);
			}
			if (policy.requirementsMinRounds !== void 0 && policy.requirementsMaxRounds !== void 0 && policy.requirementsMinRounds > policy.requirementsMaxRounds) errors.push(`${path}.requirementsMinRounds must be <= requirementsMaxRounds`);
			if (value.requiredReviewers !== void 0) if (!Array.isArray(value.requiredReviewers)) errors.push(`${path}.requiredReviewers must be an array`);
			else {
				const reviewers = [];
				for (const [index, reviewer] of value.requiredReviewers.entries()) {
					const normalized = requiredString(reviewer, `${path}.requiredReviewers[${index}]`, errors);
					if (normalized !== void 0) reviewers.push(normalized);
				}
				if (reviewers.length > 0) policy.requiredReviewers = reviewers;
			}
			return Object.keys(policy).length === 0 ? void 0 : policy;
		}
		function normalizeProfileForSave(value, path, errors) {
			if (!isRecord(value)) {
				errors.push(`${path} must be an object`);
				return;
			}
			assertKnownKeys(value, PROFILE_KEYS, path, errors);
			if (!Array.isArray(value.members) || value.members.length < 1 || value.members.length > MAX_MEMBERS) errors.push(`${path}.members must contain 1-${MAX_MEMBERS} members`);
			const members = Array.isArray(value.members) ? value.members.map((member, index) => normalizeMemberForSave(member, `${path}.members[${index}]`, errors)).filter((member) => member !== void 0) : [];
			const memberKeys = /* @__PURE__ */ new Set();
			for (const member of members) {
				const key = member.name.normalize("NFC").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-");
				if (memberKeys.has(key)) errors.push(`${path}.members contains duplicate names`);
				memberKeys.add(key);
			}
			const profile = { members };
			for (const key of [
				"description",
				"protocol",
				"executionPrompt"
			]) {
				const normalized = optionalString(value[key], `${path}.${key}`, errors);
				if (normalized !== void 0) profile[key] = normalized;
			}
			if (value.taskPlanning !== void 0) if (value.taskPlanning !== "captain" && value.taskPlanning !== "seed") errors.push(`${path}.taskPlanning must be captain or seed`);
			else profile.taskPlanning = value.taskPlanning;
			const fallback = normalizeFallbackForSave(value.fallback, `${path}.fallback`, errors);
			if (fallback !== void 0) profile.fallback = fallback;
			if (value.tasks !== void 0) if (!Array.isArray(value.tasks) || value.tasks.length > MAX_TASKS) errors.push(`${path}.tasks must contain 0-${MAX_TASKS} tasks`);
			else {
				const tasks = value.tasks.map((task, index) => normalizeTaskForSave(task, `${path}.tasks[${index}]`, errors)).filter((task) => task !== void 0);
				const taskIds = /* @__PURE__ */ new Set();
				for (const task of tasks) {
					if (taskIds.has(task.id)) errors.push(`${path}.tasks contains duplicate ids`);
					taskIds.add(task.id);
				}
				if (profile.taskPlanning !== "captain") {
					const memberNames = new Set(members.map((member) => member.name));
					for (const task of tasks) {
						if (task.assignee === void 0 || task.assignee === "") errors.push(`${path}.tasks.${task.id}.assignee must not be empty for seed planning`);
						else if (!memberNames.has(task.assignee)) errors.push(`${path}.tasks.${task.id}.assignee must match a member name`);
						for (const dependency of task.dependencies ?? []) {
							if (dependency === task.id) errors.push(`${path}.tasks.${task.id} cannot depend on itself`);
							if (!taskIds.has(dependency) && !tasks.some((candidate) => candidate.id === dependency)) errors.push(`${path}.tasks.${task.id} depends on unknown task "${dependency}"`);
						}
					}
				}
				if (tasks.length > 0) profile.tasks = tasks;
			}
			const reviewPolicy = normalizeReviewPolicyForSave(value.reviewPolicy, `${path}.reviewPolicy`, errors);
			if (reviewPolicy !== void 0) profile.reviewPolicy = reviewPolicy;
			return profile;
		}
		/** Validate and normalize the map before handing it to the host IPC boundary. */
		function prepareProfileMapForSave(value, fallbackValidation) {
			if (!isRecord(value)) return {
				ok: false,
				error: "AgentTeams profiles must be an object map"
			};
			const names = Object.keys(value);
			if (names.length > MAX_PROFILES) return {
				ok: false,
				error: `too many AgentTeams profiles (${names.length}); the limit is ${MAX_PROFILES}`
			};
			const errors = [];
			const profiles = {};
			const seenNames = /* @__PURE__ */ new Set();
			for (const rawName of names) {
				const name = normalizeName(rawName);
				if (name === void 0) {
					errors.push(`invalid AgentTeams profile name "${rawName}"`);
					continue;
				}
				if (seenNames.has(name)) {
					errors.push(`duplicate AgentTeams profile name "${name}"`);
					continue;
				}
				seenNames.add(name);
				const profile = normalizeProfileForSave(value[rawName], `profiles.${name}`, errors);
				if (profile !== void 0) profiles[name] = profile;
			}
			if (errors.length > 0) return {
				ok: false,
				error: errors.join("; ")
			};
			const validation = fallbackValidation ?? {
				catalog: [],
				catalogReady: false,
				committedProfiles: {},
				committedProfileNames: {}
			};
			if (hasUnvalidatedFallbackDraft(profiles, validation.committedProfiles, validation.catalog, validation.catalogReady, validation.committedProfileNames)) return {
				ok: false,
				error: "new or changed AgentTeams fallback routes must match the ready shared model catalog"
			};
			return {
				ok: true,
				profiles
			};
		}
		//#endregion
		//#region lib/client/desktop-bridge.js
		/** Return the narrow host bridge used only by the embedded profile editor. */
		function getAgentTeamsDesktopBridge() {
			if (typeof window === "undefined") return void 0;
			const bridge = window.dshDesktop;
			if (bridge === void 0 || typeof bridge.getAgentTeamsProfiles !== "function" || typeof bridge.setAgentTeamsProfiles !== "function") return;
			return bridge;
		}
		//#endregion
		//#region \0dsh-css:src/client/AgentTeamsSettingsSection.module.css.mjs
		const css = ".-XkeNW_root{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;padding:4px 0 24px;display:flex}.-XkeNW_header,.-XkeNW_section{flex-direction:column;display:flex}.-XkeNW_header{gap:4px}.-XkeNW_pageTitle,.-XkeNW_sectionTitle,.-XkeNW_intro,.-XkeNW_help,.-XkeNW_settingsStatus,.-XkeNW_catalogStatus{margin:0}.-XkeNW_pageTitle{font-size:20px;font-weight:500;line-height:28px}.-XkeNW_intro,.-XkeNW_help{color:var(--dsw-alias-label-secondary);font-size:14px;line-height:22px}.-XkeNW_settingsStatus,.-XkeNW_catalogStatus{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.-XkeNW_section{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);border-radius:12px;gap:10px;padding:16px}.-XkeNW_sectionTitle{font-size:16px;font-weight:500;line-height:24px}.-XkeNW_choices{border:0;gap:8px;margin:0;padding:0;display:grid}.-XkeNW_choice{border:1px solid var(--dsw-alias-border-l2);cursor:pointer;border-radius:8px;align-items:flex-start;gap:10px;padding:10px 12px;display:flex}.-XkeNW_choice:hover{background:var(--dsw-alias-interactive-bg-hover)}.-XkeNW_choice:focus-within{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.-XkeNW_choice input{accent-color:var(--dsw-alias-brand-primary);flex:none;margin:4px 0 0}.-XkeNW_choice span,.-XkeNW_field{flex-direction:column;display:flex}.-XkeNW_choice span{gap:2px}.-XkeNW_choice strong,.-XkeNW_field>span{font-size:14px;font-weight:500;line-height:22px}.-XkeNW_choice small{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}.-XkeNW_choices:disabled .-XkeNW_choice,.-XkeNW_choiceDisabled,.-XkeNW_field select:disabled{cursor:default;opacity:.5}.-XkeNW_choiceDisabled:hover{background:0 0}.-XkeNW_fields{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;display:grid}.-XkeNW_field{color:var(--dsw-alias-label-secondary);gap:6px}.-XkeNW_field select{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:100%;min-height:36px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;padding:6px 10px}.-XkeNW_field select:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.-XkeNW_catalogError,.-XkeNW_writeError{color:var(--dsw-alias-state-error-primary);justify-content:space-between;align-items:center;gap:10px;font-size:12px;line-height:18px;display:flex}.-XkeNW_profileSection{gap:14px}.-XkeNW_profileSectionHeader,.-XkeNW_profileRowHeader,.-XkeNW_profileSaveBar,.-XkeNW_profileIdentity,.-XkeNW_profileIdentityActions{justify-content:space-between;align-items:center;gap:10px;display:flex}.-XkeNW_profileSectionHeader{align-items:flex-start}.-XkeNW_profileMarker,.-XkeNW_profileBadge{border:1px solid var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);letter-spacing:.08em;border-radius:999px;flex:none;padding:2px 7px;font-size:10px;font-weight:600;line-height:16px}.-XkeNW_profileBadge{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);letter-spacing:normal}.-XkeNW_profileToolbar{grid-template-columns:minmax(180px,.8fr) minmax(0,1.2fr);align-items:start;gap:12px;display:grid}.-XkeNW_profileList,.-XkeNW_profileActions,.-XkeNW_profileForm,.-XkeNW_profileSubsection,.-XkeNW_profileDetails,.-XkeNW_profileFallback{flex-direction:column;gap:8px;display:flex}.-XkeNW_profileList{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:8px;max-height:220px;padding:4px;overflow:auto}.-XkeNW_profileListItem{min-height:34px;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer;background:0 0;border:1px solid #0000;border-radius:6px;justify-content:space-between;align-items:center;gap:8px;padding:6px 9px;display:flex}.-XkeNW_profileListItem:hover{background:var(--dsw-alias-interactive-bg-hover)}.-XkeNW_profileListItem:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.-XkeNW_profileListItemSelected{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-interactive-bg-hover)}.-XkeNW_profileListItem:disabled{cursor:default;opacity:.5}.-XkeNW_profileListItem:disabled:hover{background:0 0}.-XkeNW_profileListItem small{color:var(--dsw-alias-label-tertiary);flex:none;font-size:11px}.-XkeNW_profileActions{flex-flow:wrap;justify-content:flex-end}.-XkeNW_profileIdentity{align-items:flex-end}.-XkeNW_profileIdentity>.-XkeNW_field{flex:1}.-XkeNW_profileIdentityActions{flex-wrap:wrap;justify-content:flex-end}.-XkeNW_profileInput,.-XkeNW_profileSelect,.-XkeNW_profileTextarea{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:100%;min-height:36px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;padding:6px 10px}.-XkeNW_profileTextarea{resize:vertical;min-height:72px}.-XkeNW_profileInput:focus-visible,.-XkeNW_profileSelect:focus-visible,.-XkeNW_profileTextarea:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.-XkeNW_profileInput:disabled,.-XkeNW_profileSelect:disabled,.-XkeNW_profileTextarea:disabled{cursor:default;opacity:.5}.-XkeNW_profileWideField{grid-column:1/-1}.-XkeNW_profileFieldset{border:0;gap:8px;margin:0;padding:0;display:grid}.-XkeNW_profileLegend,.-XkeNW_profileSubsectionTitle{color:var(--dsw-alias-label-primary);margin:0;font-size:14px;font-weight:500;line-height:22px}.-XkeNW_profileSubsection{padding-top:4px}.-XkeNW_profileSubsection+.-XkeNW_profileSubsection,.-XkeNW_profileSubsection+.-XkeNW_profileDetails,.-XkeNW_profileDetails+.-XkeNW_profileSubsection,.-XkeNW_profileDetails+.-XkeNW_profileDetails{border-top:1px solid var(--dsw-alias-border-l2);padding-top:12px}.-XkeNW_profileMember,.-XkeNW_profileTask{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:8px;flex-direction:column;gap:10px;padding:12px;display:flex}.-XkeNW_profileMember .-XkeNW_fields,.-XkeNW_profileTask .-XkeNW_fields{gap:10px}.-XkeNW_profileReasoning{border:0;flex-direction:column;gap:8px;min-width:0;margin:0;padding:0;display:flex}.-XkeNW_profileReasoningChoices{gap:6px;display:grid}.-XkeNW_profileRowHeader{align-items:flex-start}.-XkeNW_profileDetails{gap:10px}.-XkeNW_profileDetails summary{color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;line-height:20px}.-XkeNW_profileDetails summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.-XkeNW_profileFallback{grid-template-columns:repeat(2,minmax(0,1fr));padding-top:4px;display:grid}.-XkeNW_profileHint,.-XkeNW_profileDirty,.-XkeNW_profileSaved,.-XkeNW_profileError{margin:0;font-size:12px;line-height:18px}.-XkeNW_profileHint,.-XkeNW_profileDirty{color:var(--dsw-alias-label-tertiary)}.-XkeNW_profileSaved{color:var(--dsw-alias-state-success-primary)}.-XkeNW_profileWarning{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-secondary));margin:0;font-size:12px;line-height:18px}.-XkeNW_profileError{color:var(--dsw-alias-state-error-primary)}.-XkeNW_profileSaveBar{justify-content:flex-end;padding-top:4px}.-XkeNW_visuallyHidden{clip:rect(0 0 0 0);white-space:nowrap;border:0;width:1px;height:1px;margin:-1px;padding:0;position:absolute;overflow:hidden}@media (width<=560px){.-XkeNW_fields,.-XkeNW_profileToolbar,.-XkeNW_profileFallback{grid-template-columns:1fr}.-XkeNW_section{padding:14px}.-XkeNW_profileSectionHeader,.-XkeNW_profileIdentity{flex-direction:column;align-items:stretch}.-XkeNW_profileIdentityActions,.-XkeNW_profileActions{justify-content:flex-start}}";
		const tagId = "@nanmicoder/dsh-agent-teams/AgentTeamsSettingsSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@nanmicoder/dsh-agent-teams";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var AgentTeamsSettingsSection_module_css_default = {
			"catalogError": "-XkeNW_catalogError",
			"catalogStatus": "-XkeNW_catalogStatus",
			"choice": "-XkeNW_choice",
			"choiceDisabled": "-XkeNW_choiceDisabled",
			"choices": "-XkeNW_choices",
			"field": "-XkeNW_field",
			"fields": "-XkeNW_fields",
			"header": "-XkeNW_header",
			"help": "-XkeNW_help",
			"intro": "-XkeNW_intro",
			"pageTitle": "-XkeNW_pageTitle",
			"profileActions": "-XkeNW_profileActions",
			"profileBadge": "-XkeNW_profileBadge",
			"profileDetails": "-XkeNW_profileDetails",
			"profileDirty": "-XkeNW_profileDirty",
			"profileError": "-XkeNW_profileError",
			"profileFallback": "-XkeNW_profileFallback",
			"profileFieldset": "-XkeNW_profileFieldset",
			"profileForm": "-XkeNW_profileForm",
			"profileHint": "-XkeNW_profileHint",
			"profileIdentity": "-XkeNW_profileIdentity",
			"profileIdentityActions": "-XkeNW_profileIdentityActions",
			"profileInput": "-XkeNW_profileInput",
			"profileLegend": "-XkeNW_profileLegend",
			"profileList": "-XkeNW_profileList",
			"profileListItem": "-XkeNW_profileListItem",
			"profileListItemSelected": "-XkeNW_profileListItemSelected",
			"profileMarker": "-XkeNW_profileMarker",
			"profileMember": "-XkeNW_profileMember",
			"profileReasoning": "-XkeNW_profileReasoning",
			"profileReasoningChoices": "-XkeNW_profileReasoningChoices",
			"profileRowHeader": "-XkeNW_profileRowHeader",
			"profileSaveBar": "-XkeNW_profileSaveBar",
			"profileSaved": "-XkeNW_profileSaved",
			"profileSection": "-XkeNW_profileSection",
			"profileSectionHeader": "-XkeNW_profileSectionHeader",
			"profileSelect": "-XkeNW_profileSelect",
			"profileSubsection": "-XkeNW_profileSubsection",
			"profileSubsectionTitle": "-XkeNW_profileSubsectionTitle",
			"profileTask": "-XkeNW_profileTask",
			"profileTextarea": "-XkeNW_profileTextarea",
			"profileToolbar": "-XkeNW_profileToolbar",
			"profileWarning": "-XkeNW_profileWarning",
			"profileWideField": "-XkeNW_profileWideField",
			"root": "-XkeNW_root",
			"section": "-XkeNW_section",
			"sectionTitle": "-XkeNW_sectionTitle",
			"settingsStatus": "-XkeNW_settingsStatus",
			"visuallyHidden": "-XkeNW_visuallyHidden",
			"writeError": "-XkeNW_writeError"
		};
		//#endregion
		//#region lib/client/TeamProfilesEditor.js
		function uniqueName(existing, base) {
			const occupied = new Set(existing);
			if (!occupied.has(base)) return base;
			for (let index = 2; index < 1e3; index += 1) {
				const candidate = `${base}-${index}`;
				if (!occupied.has(candidate)) return candidate;
			}
			return `${base}-${Date.now()}`;
		}
		function updateProfileMap(profiles, name, update) {
			const current = profiles[name];
			if (current === void 0) return profiles;
			const next = cloneProfileMap(profiles);
			next[name] = update(next[name] ?? current);
			return next;
		}
		function setMemberField(member, field, value) {
			const next = { ...member };
			if (value === "") delete next[field];
			else next[field] = value;
			return next;
		}
		function setMemberProvider(member, provider, catalog) {
			if (provider === "") return {
				...member,
				provider: void 0,
				model: void 0
			};
			const models = catalog.filter((entry) => entry.provider === provider);
			const currentModel = member.provider === provider && models.some((entry) => entry.id === member.model) ? member.model : models[0]?.id;
			return {
				...member,
				provider,
				...currentModel === void 0 ? { model: void 0 } : { model: currentModel }
			};
		}
		function setMemberModel(member, provider, model) {
			if (provider === "" || model === "") return {
				...member,
				provider: void 0,
				model: void 0
			};
			return {
				...member,
				provider,
				model
			};
		}
		function setFallbackProvider(current, provider, catalog) {
			if (provider === "") return void 0;
			const models = catalog.filter((entry) => entry.provider === provider);
			const model = current?.provider === provider && models.some((entry) => entry.id === current.model) ? current.model : models[0]?.id;
			return model === void 0 ? void 0 : {
				provider,
				model
			};
		}
		function setFallbackModel(current, model) {
			const provider = current?.provider ?? "";
			return provider === "" || model === "" ? void 0 : {
				provider,
				model
			};
		}
		function formatDependencies(task) {
			return task.dependencies?.join(", ") ?? "";
		}
		function parseDependencies(value) {
			const dependencies = value.split(",").map((dependency) => dependency.trim()).filter((dependency) => dependency !== "");
			return dependencies.length === 0 ? void 0 : [...new Set(dependencies)];
		}
		function FallbackFields({ catalog, catalogReady, disabled, fallback, onChange, t }) {
			const providers = (0, react.useMemo)(() => [...new Set(catalog.map((model) => model.provider))], [catalog]);
			const provider = fallback?.provider ?? "";
			const model = fallback?.model ?? "";
			const providerModels = catalog.filter((entry) => entry.provider === provider);
			const selectedModel = providerModels.find((entry) => entry.id === model);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: AgentTeamsSettingsSection_module_css_default.profileFallback,
				children: [(0, react_jsx_runtime.jsxs)("label", {
					className: AgentTeamsSettingsSection_module_css_default.field,
					children: [(0, react_jsx_runtime.jsx)("span", { children: t("settings.profiles.fallbackProvider") }), (0, react_jsx_runtime.jsxs)("select", {
						className: AgentTeamsSettingsSection_module_css_default.profileSelect,
						value: provider,
						disabled: disabled || !catalogReady,
						onChange: (event) => onChange(setFallbackProvider(fallback, event.currentTarget.value, catalog)),
						children: [
							(0, react_jsx_runtime.jsx)("option", {
								value: "",
								children: t("settings.profiles.noFallback")
							}),
							provider !== "" && !providers.includes(provider) && (0, react_jsx_runtime.jsx)("option", {
								value: provider,
								children: t("settings.profiles.unavailable", { value: provider })
							}),
							providers.map((entry) => (0, react_jsx_runtime.jsx)("option", {
								value: entry,
								children: entry
							}, entry))
						]
					})]
				}), (0, react_jsx_runtime.jsxs)("label", {
					className: AgentTeamsSettingsSection_module_css_default.field,
					children: [(0, react_jsx_runtime.jsx)("span", { children: t("settings.profiles.fallbackModel") }), (0, react_jsx_runtime.jsxs)("select", {
						className: AgentTeamsSettingsSection_module_css_default.profileSelect,
						value: model,
						disabled: disabled || !catalogReady || provider === "",
						onChange: (event) => onChange(setFallbackModel(fallback, event.currentTarget.value)),
						children: [
							(0, react_jsx_runtime.jsx)("option", {
								value: "",
								children: provider === "" ? t("settings.profiles.noFallback") : t("settings.profiles.chooseModel")
							}),
							model !== "" && selectedModel === void 0 && (0, react_jsx_runtime.jsx)("option", {
								value: model,
								children: t("settings.profiles.unavailable", { value: model })
							}),
							providerModels.map((entry) => (0, react_jsx_runtime.jsx)("option", {
								value: entry.id,
								children: entry.name || entry.id
							}, entry.id))
						]
					})]
				})]
			});
		}
		function MemberEditor({ catalog, catalogReady, disabled, index, member, onChange, onRemove, t }) {
			const providers = (0, react.useMemo)(() => [...new Set(catalog.map((model) => model.provider))], [catalog]);
			const provider = member.provider ?? "";
			const model = member.model ?? "";
			const providerModels = catalog.filter((entry) => entry.provider === provider);
			const selectedModel = providerModels.find((entry) => entry.id === model);
			const update = (field, value) => {
				onChange(setMemberField(member, field, value));
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				className: AgentTeamsSettingsSection_module_css_default.profileMember,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: AgentTeamsSettingsSection_module_css_default.profileRowHeader,
						children: [(0, react_jsx_runtime.jsx)("strong", { children: t("settings.profiles.member", { index: index + 1 }) }), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							type: "button",
							variant: "outline",
							size: "sm",
							disabled,
							onClick: onRemove,
							children: t("settings.profiles.remove")
						})]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: AgentTeamsSettingsSection_module_css_default.fields,
						children: [
							(0, react_jsx_runtime.jsxs)("label", {
								className: AgentTeamsSettingsSection_module_css_default.field,
								children: [(0, react_jsx_runtime.jsx)("span", { children: t("settings.profiles.memberName") }), (0, react_jsx_runtime.jsx)("input", {
									className: AgentTeamsSettingsSection_module_css_default.profileInput,
									value: member.name,
									disabled,
									onChange: (event) => onChange({
										...member,
										name: event.currentTarget.value
									})
								})]
							}),
							(0, react_jsx_runtime.jsxs)("label", {
								className: AgentTeamsSettingsSection_module_css_default.field,
								children: [(0, react_jsx_runtime.jsx)("span", { children: t("settings.profiles.memberRole") }), (0, react_jsx_runtime.jsx)("input", {
									className: AgentTeamsSettingsSection_module_css_default.profileInput,
									value: member.role ?? "",
									disabled,
									onChange: (event) => update("role", event.currentTarget.value)
								})]
							}),
							(0, react_jsx_runtime.jsxs)("label", {
								className: AgentTeamsSettingsSection_module_css_default.field,
								children: [(0, react_jsx_runtime.jsx)("span", { children: t("settings.profiles.memberProvider") }), (0, react_jsx_runtime.jsxs)("select", {
									className: AgentTeamsSettingsSection_module_css_default.profileSelect,
									value: provider,
									disabled: disabled || !catalogReady,
									onChange: (event) => onChange(setMemberProvider(member, event.currentTarget.value, catalog)),
									children: [
										(0, react_jsx_runtime.jsx)("option", {
											value: "",
											children: t("settings.profiles.followCaptain")
										}),
										provider !== "" && !providers.includes(provider) && (0, react_jsx_runtime.jsx)("option", {
											value: provider,
											children: t("settings.profiles.unavailable", { value: provider })
										}),
										providers.map((entry) => (0, react_jsx_runtime.jsx)("option", {
											value: entry,
											children: entry
										}, entry))
									]
								})]
							}),
							(0, react_jsx_runtime.jsxs)("label", {
								className: AgentTeamsSettingsSection_module_css_default.field,
								children: [(0, react_jsx_runtime.jsx)("span", { children: t("settings.profiles.memberModel") }), (0, react_jsx_runtime.jsxs)("select", {
									className: AgentTeamsSettingsSection_module_css_default.profileSelect,
									value: model,
									disabled: disabled || !catalogReady || provider === "",
									onChange: (event) => onChange(setMemberModel(member, provider, event.currentTarget.value)),
									children: [
										(0, react_jsx_runtime.jsx)("option", {
											value: "",
											children: provider === "" ? t("settings.profiles.followCaptain") : t("settings.profiles.chooseModel")
										}),
										model !== "" && selectedModel === void 0 && (0, react_jsx_runtime.jsx)("option", {
											value: model,
											children: t("settings.profiles.unavailable", { value: model })
										}),
										providerModels.map((entry) => (0, react_jsx_runtime.jsx)("option", {
											value: entry.id,
											children: entry.name || entry.id
										}, entry.id))
									]
								})]
							}),
							(0, react_jsx_runtime.jsxs)("fieldset", {
								className: AgentTeamsSettingsSection_module_css_default.profileReasoning,
								disabled,
								children: [
									(0, react_jsx_runtime.jsx)("legend", {
										className: AgentTeamsSettingsSection_module_css_default.profileLegend,
										children: t("settings.profiles.reasoning.title")
									}),
									(0, react_jsx_runtime.jsx)("div", {
										className: AgentTeamsSettingsSection_module_css_default.profileReasoningChoices,
										children: [
											"target-default",
											"route-aware",
											"explicit"
										].map((mode) => (0, react_jsx_runtime.jsxs)("label", {
											className: `${AgentTeamsSettingsSection_module_css_default.choice} ${mode === "explicit" && (!catalogReady || (selectedModel?.efforts.length ?? 0) === 0) ? AgentTeamsSettingsSection_module_css_default.choiceDisabled : ""}`,
											children: [(0, react_jsx_runtime.jsx)("input", {
												type: "radio",
												name: `agent-teams-profile-member-${index}-reasoning-mode`,
												value: mode,
												checked: member.reasoning_mode === mode,
												disabled: mode === "explicit" && (!catalogReady || (selectedModel?.efforts.length ?? 0) === 0),
												onChange: () => {
													const next = applyMemberReasoningMode(member, mode, selectedModel);
													if (next !== void 0) onChange(next);
												}
											}), (0, react_jsx_runtime.jsx)("span", { children: t(`settings.profiles.reasoning.${mode}.label`) })]
										}, mode))
									}),
									member.reasoning_mode === "explicit" && (0, react_jsx_runtime.jsxs)("label", {
										className: AgentTeamsSettingsSection_module_css_default.field,
										children: [(0, react_jsx_runtime.jsx)("span", { children: t("settings.profiles.reasoning.effort") }), (0, react_jsx_runtime.jsx)("select", {
											className: AgentTeamsSettingsSection_module_css_default.profileSelect,
											value: member.reasoning_effort ?? "",
											disabled: disabled || !catalogReady || (selectedModel?.efforts.length ?? 0) === 0,
											onChange: (event) => update("reasoning_effort", event.currentTarget.value),
											children: selectedModel?.efforts.length ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [member.reasoning_effort !== void 0 && !selectedModel.efforts.some((effort) => effort.id === member.reasoning_effort) && (0, react_jsx_runtime.jsx)("option", {
												value: member.reasoning_effort,
												children: t("settings.profiles.unavailable", { value: member.reasoning_effort })
											}), selectedModel.efforts.map((effort) => (0, react_jsx_runtime.jsx)("option", {
												value: effort.id,
												children: effort.name
											}, effort.id))] }) : (0, react_jsx_runtime.jsx)("option", {
												value: "",
												children: t("settings.profiles.reasoning.noEfforts")
											})
										})]
									})
								]
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("label", {
						className: AgentTeamsSettingsSection_module_css_default.field,
						children: [(0, react_jsx_runtime.jsx)("span", { children: t("settings.profiles.memberPrompt") }), (0, react_jsx_runtime.jsx)("textarea", {
							className: AgentTeamsSettingsSection_module_css_default.profileTextarea,
							value: member.executionPrompt ?? "",
							disabled,
							rows: 3,
							onChange: (event) => update("executionPrompt", event.currentTarget.value)
						})]
					}),
					(0, react_jsx_runtime.jsxs)("details", {
						className: AgentTeamsSettingsSection_module_css_default.profileDetails,
						children: [(0, react_jsx_runtime.jsx)("summary", { children: t("settings.profiles.memberFallback") }), (0, react_jsx_runtime.jsx)(FallbackFields, {
							catalog,
							catalogReady,
							disabled,
							fallback: member.fallback,
							onChange: (fallback) => onChange({
								...member,
								...fallback === void 0 ? { fallback: void 0 } : { fallback }
							}),
							t
						})]
					})
				]
			});
		}
		function TaskEditor({ disabled, members, onChange, onRemove, task, t }) {
			return (0, react_jsx_runtime.jsxs)("div", {
				className: AgentTeamsSettingsSection_module_css_default.profileTask,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: AgentTeamsSettingsSection_module_css_default.profileRowHeader,
						children: [(0, react_jsx_runtime.jsx)("strong", { children: task.id || t("settings.profiles.newTask") }), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							type: "button",
							variant: "outline",
							size: "sm",
							disabled,
							onClick: onRemove,
							children: t("settings.profiles.remove")
						})]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: AgentTeamsSettingsSection_module_css_default.fields,
						children: [(0, react_jsx_runtime.jsxs)("label", {
							className: AgentTeamsSettingsSection_module_css_default.field,
							children: [(0, react_jsx_runtime.jsx)("span", { children: t("settings.profiles.taskId") }), (0, react_jsx_runtime.jsx)("input", {
								className: AgentTeamsSettingsSection_module_css_default.profileInput,
								value: task.id,
								disabled,
								onChange: (event) => onChange({
									...task,
									id: event.currentTarget.value
								})
							})]
						}), (0, react_jsx_runtime.jsxs)("label", {
							className: AgentTeamsSettingsSection_module_css_default.field,
							children: [(0, react_jsx_runtime.jsx)("span", { children: t("settings.profiles.taskAssignee") }), (0, react_jsx_runtime.jsxs)("select", {
								className: AgentTeamsSettingsSection_module_css_default.profileSelect,
								value: task.assignee ?? "",
								disabled,
								onChange: (event) => onChange({
									...task,
									assignee: event.currentTarget.value || void 0
								}),
								children: [(0, react_jsx_runtime.jsx)("option", {
									value: "",
									children: t("settings.profiles.chooseAssignee")
								}), members.map((member) => (0, react_jsx_runtime.jsx)("option", {
									value: member.name,
									children: member.name
								}, member.name))]
							})]
						})]
					}),
					(0, react_jsx_runtime.jsxs)("label", {
						className: AgentTeamsSettingsSection_module_css_default.field,
						children: [(0, react_jsx_runtime.jsx)("span", { children: t("settings.profiles.taskSubject") }), (0, react_jsx_runtime.jsx)("input", {
							className: AgentTeamsSettingsSection_module_css_default.profileInput,
							value: task.subject,
							disabled,
							onChange: (event) => onChange({
								...task,
								subject: event.currentTarget.value
							})
						})]
					}),
					(0, react_jsx_runtime.jsxs)("label", {
						className: AgentTeamsSettingsSection_module_css_default.field,
						children: [(0, react_jsx_runtime.jsx)("span", { children: t("settings.profiles.taskDescription") }), (0, react_jsx_runtime.jsx)("textarea", {
							className: AgentTeamsSettingsSection_module_css_default.profileTextarea,
							value: task.description ?? "",
							disabled,
							rows: 2,
							onChange: (event) => onChange({
								...task,
								description: event.currentTarget.value
							})
						})]
					}),
					(0, react_jsx_runtime.jsxs)("label", {
						className: AgentTeamsSettingsSection_module_css_default.field,
						children: [(0, react_jsx_runtime.jsx)("span", { children: t("settings.profiles.taskDependencies") }), (0, react_jsx_runtime.jsx)("input", {
							className: AgentTeamsSettingsSection_module_css_default.profileInput,
							value: formatDependencies(task),
							disabled,
							placeholder: t("settings.profiles.commaSeparated"),
							onChange: (event) => onChange({
								...task,
								dependencies: parseDependencies(event.currentTarget.value)
							})
						})]
					})
				]
			});
		}
		function ProfileForm({ catalog, catalogReady, disabled, onChange, profile, t }) {
			const members = profile.members;
			const tasks = profile.tasks ?? [];
			const updateMember = (index, next) => {
				onChange({
					...profile,
					members: members.map((member, memberIndex) => memberIndex === index ? next : member)
				});
			};
			const removeMember = (index) => {
				onChange({
					...profile,
					members: members.filter((_member, memberIndex) => memberIndex !== index)
				});
			};
			const addMember = () => {
				const name = uniqueName(members.map((member) => member.name), "member");
				onChange({
					...profile,
					members: [...members, {
						name,
						reasoning_mode: "target-default"
					}]
				});
			};
			const updateTask = (index, next) => {
				onChange({
					...profile,
					tasks: tasks.map((task, taskIndex) => taskIndex === index ? next : task)
				});
			};
			const removeTask = (index) => {
				const next = tasks.filter((_task, taskIndex) => taskIndex !== index);
				onChange({
					...profile,
					...next.length === 0 ? { tasks: void 0 } : { tasks: next }
				});
			};
			const addTask = () => {
				const id = uniqueName(tasks.map((task) => task.id), "task");
				onChange({
					...profile,
					taskPlanning: "seed",
					tasks: [...tasks, {
						id,
						subject: "",
						assignee: members[0]?.name
					}]
				});
			};
			const setOptionalText = (field, value) => {
				onChange({
					...profile,
					[field]: value
				});
			};
			const setPolicyField = (field, value) => {
				const policy = { ...profile.reviewPolicy ?? {} };
				if (value.trim() === "") delete policy[field];
				else policy[field] = Number(value);
				onChange({
					...profile,
					...Object.keys(policy).length === 0 ? { reviewPolicy: void 0 } : { reviewPolicy: policy }
				});
			};
			const requiredReviewers = profile.reviewPolicy?.requiredReviewers?.join(", ") ?? "";
			return (0, react_jsx_runtime.jsxs)("div", {
				className: AgentTeamsSettingsSection_module_css_default.profileForm,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: AgentTeamsSettingsSection_module_css_default.fields,
						children: [
							(0, react_jsx_runtime.jsxs)("label", {
								className: `${AgentTeamsSettingsSection_module_css_default.field} ${AgentTeamsSettingsSection_module_css_default.profileWideField}`,
								children: [(0, react_jsx_runtime.jsx)("span", { children: t("settings.profiles.description") }), (0, react_jsx_runtime.jsx)("input", {
									className: AgentTeamsSettingsSection_module_css_default.profileInput,
									value: profile.description ?? "",
									disabled,
									onChange: (event) => setOptionalText("description", event.currentTarget.value)
								})]
							}),
							(0, react_jsx_runtime.jsxs)("label", {
								className: `${AgentTeamsSettingsSection_module_css_default.field} ${AgentTeamsSettingsSection_module_css_default.profileWideField}`,
								children: [(0, react_jsx_runtime.jsx)("span", { children: t("settings.profiles.protocol") }), (0, react_jsx_runtime.jsx)("textarea", {
									className: AgentTeamsSettingsSection_module_css_default.profileTextarea,
									value: profile.protocol ?? "",
									disabled,
									rows: 3,
									onChange: (event) => setOptionalText("protocol", event.currentTarget.value)
								})]
							}),
							(0, react_jsx_runtime.jsxs)("label", {
								className: `${AgentTeamsSettingsSection_module_css_default.field} ${AgentTeamsSettingsSection_module_css_default.profileWideField}`,
								children: [(0, react_jsx_runtime.jsx)("span", { children: t("settings.profiles.executionPrompt") }), (0, react_jsx_runtime.jsx)("textarea", {
									className: AgentTeamsSettingsSection_module_css_default.profileTextarea,
									value: profile.executionPrompt ?? "",
									disabled,
									rows: 4,
									onChange: (event) => setOptionalText("executionPrompt", event.currentTarget.value)
								})]
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("fieldset", {
						className: AgentTeamsSettingsSection_module_css_default.profileFieldset,
						disabled,
						children: [
							(0, react_jsx_runtime.jsx)("legend", {
								className: AgentTeamsSettingsSection_module_css_default.profileLegend,
								children: t("settings.profiles.taskPlanning")
							}),
							(0, react_jsx_runtime.jsxs)("label", {
								className: AgentTeamsSettingsSection_module_css_default.choice,
								children: [(0, react_jsx_runtime.jsx)("input", {
									type: "radio",
									name: "agent-teams-profile-task-planning",
									value: "captain",
									checked: (profile.taskPlanning ?? "seed") === "captain",
									onChange: () => onChange({
										...profile,
										taskPlanning: "captain"
									})
								}), (0, react_jsx_runtime.jsxs)("span", { children: [(0, react_jsx_runtime.jsx)("strong", { children: t("settings.profiles.captain") }), (0, react_jsx_runtime.jsx)("small", { children: t("settings.profiles.captainHelp") })] })]
							}),
							(0, react_jsx_runtime.jsxs)("label", {
								className: AgentTeamsSettingsSection_module_css_default.choice,
								children: [(0, react_jsx_runtime.jsx)("input", {
									type: "radio",
									name: "agent-teams-profile-task-planning",
									value: "seed",
									checked: (profile.taskPlanning ?? "seed") === "seed",
									onChange: () => onChange({
										...profile,
										taskPlanning: "seed"
									})
								}), (0, react_jsx_runtime.jsxs)("span", { children: [(0, react_jsx_runtime.jsx)("strong", { children: t("settings.profiles.seed") }), (0, react_jsx_runtime.jsx)("small", { children: t("settings.profiles.seedHelp") })] })]
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: AgentTeamsSettingsSection_module_css_default.profileSubsection,
						children: [(0, react_jsx_runtime.jsxs)("div", {
							className: AgentTeamsSettingsSection_module_css_default.profileRowHeader,
							children: [(0, react_jsx_runtime.jsx)("h4", {
								className: AgentTeamsSettingsSection_module_css_default.profileSubsectionTitle,
								children: t("settings.profiles.members")
							}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								type: "button",
								variant: "outline",
								size: "sm",
								disabled: disabled || members.length >= 8,
								onClick: addMember,
								children: t("settings.profiles.addMember")
							})]
						}), members.map((member, index) => (0, react_jsx_runtime.jsx)(MemberEditor, {
							catalog,
							catalogReady,
							disabled,
							index,
							member,
							onChange: (next) => updateMember(index, next),
							onRemove: () => removeMember(index),
							t
						}, `${index}-${member.name}`))]
					}),
					(0, react_jsx_runtime.jsxs)("details", {
						className: AgentTeamsSettingsSection_module_css_default.profileDetails,
						children: [(0, react_jsx_runtime.jsx)("summary", { children: t("settings.profiles.profileFallback") }), (0, react_jsx_runtime.jsx)(FallbackFields, {
							catalog,
							catalogReady,
							disabled,
							fallback: profile.fallback,
							onChange: (fallback) => onChange({
								...profile,
								...fallback === void 0 ? { fallback: void 0 } : { fallback }
							}),
							t
						})]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: AgentTeamsSettingsSection_module_css_default.profileSubsection,
						children: [(0, react_jsx_runtime.jsxs)("div", {
							className: AgentTeamsSettingsSection_module_css_default.profileRowHeader,
							children: [(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("h4", {
								className: AgentTeamsSettingsSection_module_css_default.profileSubsectionTitle,
								children: t("settings.profiles.tasks")
							}), (profile.taskPlanning ?? "seed") === "captain" && (0, react_jsx_runtime.jsx)("p", {
								className: AgentTeamsSettingsSection_module_css_default.profileHint,
								children: t("settings.profiles.captainTasksHint")
							})] }), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								type: "button",
								variant: "outline",
								size: "sm",
								disabled: disabled || tasks.length >= 32,
								onClick: addTask,
								children: t("settings.profiles.addTask")
							})]
						}), (profile.taskPlanning ?? "seed") === "seed" && tasks.map((task, index) => (0, react_jsx_runtime.jsx)(TaskEditor, {
							disabled,
							members,
							onChange: (next) => updateTask(index, next),
							onRemove: () => removeTask(index),
							task,
							t
						}, `${index}-${task.id}`))]
					}),
					(0, react_jsx_runtime.jsxs)("details", {
						className: AgentTeamsSettingsSection_module_css_default.profileDetails,
						children: [(0, react_jsx_runtime.jsx)("summary", { children: t("settings.profiles.reviewPolicy") }), (0, react_jsx_runtime.jsxs)("div", {
							className: AgentTeamsSettingsSection_module_css_default.fields,
							children: [[
								["requirementsMinRounds", "settings.profiles.requirementsMinRounds"],
								["requirementsMaxRounds", "settings.profiles.requirementsMaxRounds"],
								["codeMaxRounds", "settings.profiles.codeMaxRounds"],
								["maxRepairAttempts", "settings.profiles.maxRepairAttempts"]
							].map(([field, label]) => (0, react_jsx_runtime.jsxs)("label", {
								className: AgentTeamsSettingsSection_module_css_default.field,
								children: [(0, react_jsx_runtime.jsx)("span", { children: t(label) }), (0, react_jsx_runtime.jsx)("input", {
									className: AgentTeamsSettingsSection_module_css_default.profileInput,
									type: "number",
									min: 1,
									value: profile.reviewPolicy?.[field] ?? "",
									disabled,
									onChange: (event) => setPolicyField(field, event.currentTarget.value)
								})]
							}, field)), (0, react_jsx_runtime.jsxs)("label", {
								className: `${AgentTeamsSettingsSection_module_css_default.field} ${AgentTeamsSettingsSection_module_css_default.profileWideField}`,
								children: [(0, react_jsx_runtime.jsx)("span", { children: t("settings.profiles.requiredReviewers") }), (0, react_jsx_runtime.jsx)("input", {
									className: AgentTeamsSettingsSection_module_css_default.profileInput,
									value: requiredReviewers,
									disabled,
									placeholder: t("settings.profiles.commaSeparated"),
									onChange: (event) => onChange({
										...profile,
										reviewPolicy: {
											...profile.reviewPolicy ?? {},
											requiredReviewers: event.currentTarget.value.split(",").map((reviewer) => reviewer.trim()).filter(Boolean)
										}
									})
								})]
							})]
						})]
					})
				]
			});
		}
		function TeamProfilesEditor({ catalog, onRetryCatalog, t, writable }) {
			const bridge = (0, react.useMemo)(() => getAgentTeamsDesktopBridge(), []);
			const [snapshot, setSnapshot] = (0, react.useState)(null);
			const [profiles, setProfiles] = (0, react.useState)({});
			const [committedProfiles, setCommittedProfiles] = (0, react.useState)({});
			const [committedProfileNames, setCommittedProfileNames] = (0, react.useState)({});
			const [selectedName, setSelectedName] = (0, react.useState)("");
			const [nameDraft, setNameDraft] = (0, react.useState)("");
			const [loading, setLoading] = (0, react.useState)(true);
			const [saving, setSaving] = (0, react.useState)(false);
			const [message, setMessage] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const loadProfiles = (0, react.useCallback)(() => {
				if (bridge?.getAgentTeamsProfiles === void 0) {
					setLoading(false);
					setError(t("settings.profiles.bridgeUnavailable"));
					return;
				}
				setLoading(true);
				setError(null);
				let active = true;
				bridge.getAgentTeamsProfiles().then((next) => {
					if (!active) return;
					const normalized = normalizeProfileSnapshot(next);
					setSnapshot(normalized);
					setProfiles(normalized.profiles);
					setCommittedProfiles(cloneProfileMap(normalized.profiles));
					setCommittedProfileNames(createCommittedProfileNameMap(normalized.profiles));
					setSelectedName(Object.keys(normalized.profiles)[0] ?? "");
					setMessage(null);
					setLoading(false);
				}).catch((reason) => {
					if (!active) return;
					setLoading(false);
					setError(reason instanceof Error ? reason.message : String(reason));
				});
				return () => {
					active = false;
				};
			}, [bridge, t]);
			(0, react.useEffect)(() => loadProfiles(), [loadProfiles]);
			(0, react.useEffect)(() => {
				setNameDraft(selectedName);
			}, [selectedName]);
			(0, react.useEffect)(() => {
				if (selectedName !== "" && profiles[selectedName] !== void 0) return;
				setSelectedName(Object.keys(profiles)[0] ?? "");
			}, [profiles, selectedName]);
			const selectedProfile = selectedName === "" ? void 0 : profiles[selectedName];
			const builtInNames = snapshot?.builtInNames ?? [];
			const builtInProfiles = snapshot?.builtInProfiles ?? {};
			const selectedIsBuiltIn = selectedName !== "" && builtInNames.includes(selectedName);
			const dirty = JSON.stringify(profiles) !== JSON.stringify(committedProfiles);
			const controlsDisabled = !writable || loading || saving;
			const catalogReady = catalog.status === "ready";
			const explicitRouteBlocked = hasUnvalidatedExplicitRoleDraft(profiles, committedProfiles, catalog.models, catalogReady, committedProfileNames);
			const fallbackRouteBlocked = hasUnvalidatedFallbackDraft(profiles, committedProfiles, catalog.models, catalogReady, committedProfileNames);
			const updateSelectedProfile = (next) => {
				setProfiles((current) => updateProfileMap(current, selectedName, () => next));
				setMessage(null);
				setError(null);
			};
			const addProfile = () => {
				const name = uniqueName(Object.keys(profiles), "custom-profile");
				const next = cloneProfileMap(profiles);
				next[name] = createEmptyTeamProfile(name);
				setProfiles(next);
				setSelectedName(name);
				setMessage(null);
				setError(null);
			};
			const copyProfile = () => {
				if (selectedProfile === void 0) return;
				const name = uniqueName(Object.keys(profiles), `${selectedName}-copy`);
				const next = cloneProfileMap(profiles);
				next[name] = cloneProfileMap({ [name]: selectedProfile })[name] ?? createEmptyTeamProfile(name);
				setProfiles(next);
				setSelectedName(name);
				setMessage(null);
				setError(null);
			};
			const removeProfile = () => {
				if (selectedProfile === void 0 || selectedIsBuiltIn) return;
				const next = cloneProfileMap(profiles);
				delete next[selectedName];
				const nextName = Object.keys(next)[0] ?? "";
				setProfiles(next);
				setCommittedProfileNames((current) => {
					const nextNames = { ...current };
					delete nextNames[selectedName];
					return nextNames;
				});
				setSelectedName(nextName);
				setMessage(null);
				setError(null);
			};
			const restoreProfile = () => {
				const original = builtInProfiles[selectedName];
				if (!selectedIsBuiltIn || original === void 0) return;
				setProfiles((current) => updateProfileMap(current, selectedName, () => cloneProfileMap({ [selectedName]: original })[selectedName] ?? original));
				setMessage(null);
				setError(null);
			};
			const renamedProfiles = () => {
				if (selectedProfile === void 0 || selectedIsBuiltIn) return {
					profiles,
					committedProfileNames,
					selectedName
				};
				const nextName = nameDraft.trim();
				if (nextName === selectedName) return {
					profiles,
					committedProfileNames,
					selectedName
				};
				if (nextName === "" || nextName.toLowerCase() === "captain" || !/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,63}$/u.test(nextName)) {
					setError(t("settings.profiles.invalidName"));
					return;
				}
				if (profiles[nextName] !== void 0) {
					setError(t("settings.profiles.duplicateName"));
					return;
				}
				const next = cloneProfileMap(profiles);
				const profile = next[selectedName];
				if (profile === void 0) return void 0;
				delete next[selectedName];
				next[nextName] = profile;
				return {
					profiles: next,
					committedProfileNames: renameCommittedProfileName(committedProfileNames, selectedName, nextName),
					selectedName: nextName
				};
			};
			const renameProfile = () => {
				const renamed = renamedProfiles();
				if (renamed === void 0) return false;
				if (renamed.profiles === profiles) return true;
				setProfiles(renamed.profiles);
				setCommittedProfileNames(renamed.committedProfileNames);
				setSelectedName(renamed.selectedName);
				setNameDraft(renamed.selectedName);
				setMessage(null);
				setError(null);
				return true;
			};
			const saveProfiles = async () => {
				if (bridge?.setAgentTeamsProfiles === void 0 || saving) return;
				const renamed = renamedProfiles();
				if (renamed === void 0) return;
				const nextProfiles = renamed.profiles;
				if (nextProfiles !== profiles) {
					setProfiles(nextProfiles);
					setCommittedProfileNames(renamed.committedProfileNames);
				}
				setError(null);
				if (hasUnvalidatedExplicitRoleDraft(nextProfiles, committedProfiles, catalog.models, catalogReady, renamed.committedProfileNames)) {
					setError(t("settings.profiles.explicitCatalogRequired"));
					return;
				}
				const prepared = prepareProfileMapForSave(nextProfiles, {
					catalog: catalog.models,
					catalogReady,
					committedProfiles,
					committedProfileNames: renamed.committedProfileNames
				});
				if (!prepared.ok) {
					setError(prepared.error);
					return;
				}
				setSaving(true);
				setMessage(null);
				try {
					const next = normalizeProfileSnapshot(await bridge.setAgentTeamsProfiles({
						schemaVersion: 2,
						profiles: prepared.profiles
					}));
					setSnapshot(next);
					setProfiles(next.profiles);
					setCommittedProfiles(cloneProfileMap(next.profiles));
					setCommittedProfileNames(createCommittedProfileNameMap(next.profiles));
					setSelectedName((current) => next.profiles[current] === void 0 ? Object.keys(next.profiles)[0] ?? "" : current);
					setMessage(t("settings.profiles.saved"));
				} catch (reason) {
					setError(reason instanceof Error ? reason.message : String(reason));
				} finally {
					setSaving(false);
				}
			};
			return (0, react_jsx_runtime.jsxs)("section", {
				className: `${AgentTeamsSettingsSection_module_css_default.section} ${AgentTeamsSettingsSection_module_css_default.profileSection}`,
				"aria-labelledby": "agent-teams-profiles-title",
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: AgentTeamsSettingsSection_module_css_default.profileSectionHeader,
						children: [(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("h3", {
							id: "agent-teams-profiles-title",
							className: AgentTeamsSettingsSection_module_css_default.sectionTitle,
							children: t("settings.profiles.title")
						}), (0, react_jsx_runtime.jsx)("p", {
							className: AgentTeamsSettingsSection_module_css_default.help,
							children: t("settings.profiles.help")
						})] }), (0, react_jsx_runtime.jsx)("span", {
							className: AgentTeamsSettingsSection_module_css_default.profileMarker,
							children: "PROFILE"
						})]
					}),
					loading && (0, react_jsx_runtime.jsx)("p", {
						className: AgentTeamsSettingsSection_module_css_default.catalogStatus,
						role: "status",
						children: t("settings.profiles.loading")
					}),
					catalog.status === "loading" && (0, react_jsx_runtime.jsx)("p", {
						className: AgentTeamsSettingsSection_module_css_default.catalogStatus,
						role: "status",
						"aria-live": "polite",
						children: t("settings.catalog.loading")
					}),
					catalog.status === "empty" && (0, react_jsx_runtime.jsx)("p", {
						className: AgentTeamsSettingsSection_module_css_default.catalogStatus,
						role: "status",
						children: t("settings.catalog.empty")
					}),
					catalog.status === "error" && (0, react_jsx_runtime.jsxs)("div", {
						className: AgentTeamsSettingsSection_module_css_default.catalogError,
						role: "alert",
						children: [(0, react_jsx_runtime.jsx)("span", { children: t("settings.catalog.error", { message: catalog.error }) }), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							type: "button",
							variant: "outline",
							size: "sm",
							onClick: onRetryCatalog,
							children: t("settings.catalog.retry")
						})]
					}),
					snapshot?.unsupportedPersistedVersion === true && (0, react_jsx_runtime.jsx)("p", {
						className: AgentTeamsSettingsSection_module_css_default.profileWarning,
						role: "status",
						children: t("settings.profiles.unsupportedPersistedVersion")
					}),
					error !== null && (0, react_jsx_runtime.jsx)("p", {
						className: AgentTeamsSettingsSection_module_css_default.profileError,
						role: "alert",
						children: t("settings.profiles.error", { message: error })
					}),
					message !== null && (0, react_jsx_runtime.jsxs)("p", {
						className: AgentTeamsSettingsSection_module_css_default.profileSaved,
						role: "status",
						children: [
							message,
							" ",
							t("settings.profiles.restart")
						]
					}),
					explicitRouteBlocked && (0, react_jsx_runtime.jsx)("p", {
						className: AgentTeamsSettingsSection_module_css_default.profileWarning,
						role: "status",
						children: t("settings.profiles.explicitCatalogRequired")
					}),
					fallbackRouteBlocked && (0, react_jsx_runtime.jsx)("p", {
						className: AgentTeamsSettingsSection_module_css_default.profileWarning,
						role: "status",
						children: t("settings.profiles.fallbackCatalogRequired")
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: AgentTeamsSettingsSection_module_css_default.profileToolbar,
						children: [(0, react_jsx_runtime.jsx)("div", {
							className: AgentTeamsSettingsSection_module_css_default.profileList,
							role: "listbox",
							"aria-label": t("settings.profiles.listAria"),
							children: Object.keys(profiles).map((name) => (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								role: "option",
								"aria-selected": name === selectedName,
								disabled: controlsDisabled || nameDraft !== selectedName && name !== selectedName,
								className: `${AgentTeamsSettingsSection_module_css_default.profileListItem} ${name === selectedName ? AgentTeamsSettingsSection_module_css_default.profileListItemSelected : ""}`,
								onClick: () => {
									setSelectedName(name);
									setMessage(null);
									setError(null);
								},
								children: [(0, react_jsx_runtime.jsx)("span", { children: name }), (0, react_jsx_runtime.jsx)("small", { children: builtInNames.includes(name) ? t("settings.profiles.builtIn") : t("settings.profiles.custom") })]
							}, name))
						}), (0, react_jsx_runtime.jsxs)("div", {
							className: AgentTeamsSettingsSection_module_css_default.profileActions,
							children: [
								(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									type: "button",
									variant: "outline",
									size: "sm",
									disabled: controlsDisabled,
									onClick: addProfile,
									children: t("settings.profiles.new")
								}),
								(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									type: "button",
									variant: "outline",
									size: "sm",
									disabled: controlsDisabled || selectedProfile === void 0,
									onClick: copyProfile,
									children: t("settings.profiles.copy")
								}),
								(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									type: "button",
									variant: "outline",
									size: "sm",
									disabled: controlsDisabled || selectedProfile === void 0 || selectedIsBuiltIn,
									onClick: removeProfile,
									children: t("settings.profiles.delete")
								})
							]
						})]
					}),
					selectedProfile !== void 0 && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						(0, react_jsx_runtime.jsxs)("div", {
							className: AgentTeamsSettingsSection_module_css_default.profileIdentity,
							children: [(0, react_jsx_runtime.jsxs)("label", {
								className: AgentTeamsSettingsSection_module_css_default.field,
								children: [(0, react_jsx_runtime.jsx)("span", { children: t("settings.profiles.name") }), (0, react_jsx_runtime.jsx)("input", {
									className: AgentTeamsSettingsSection_module_css_default.profileInput,
									value: nameDraft,
									disabled: controlsDisabled || selectedIsBuiltIn,
									onChange: (event) => setNameDraft(event.currentTarget.value)
								})]
							}), (0, react_jsx_runtime.jsxs)("div", {
								className: AgentTeamsSettingsSection_module_css_default.profileIdentityActions,
								children: [
									(0, react_jsx_runtime.jsx)("span", {
										className: AgentTeamsSettingsSection_module_css_default.profileBadge,
										children: selectedIsBuiltIn ? t("settings.profiles.builtIn") : t("settings.profiles.custom")
									}),
									!selectedIsBuiltIn && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										type: "button",
										variant: "outline",
										size: "sm",
										disabled: controlsDisabled,
										onClick: renameProfile,
										children: t("settings.profiles.rename")
									}),
									selectedIsBuiltIn && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										type: "button",
										variant: "outline",
										size: "sm",
										disabled: controlsDisabled || !dirty,
										onClick: restoreProfile,
										children: t("settings.profiles.restore")
									})
								]
							})]
						}),
						(0, react_jsx_runtime.jsx)(ProfileForm, {
							catalog: catalog.models,
							catalogReady,
							disabled: controlsDisabled,
							onChange: updateSelectedProfile,
							profile: selectedProfile,
							t
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: AgentTeamsSettingsSection_module_css_default.profileSaveBar,
							children: [dirty && (0, react_jsx_runtime.jsx)("span", {
								className: AgentTeamsSettingsSection_module_css_default.profileDirty,
								children: t("settings.profiles.unsaved")
							}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								type: "button",
								variant: "outline",
								size: "sm",
								disabled: controlsDisabled || !dirty || explicitRouteBlocked || fallbackRouteBlocked,
								onClick: () => {
									saveProfiles();
								},
								children: saving ? t("settings.profiles.saving") : t("settings.profiles.save")
							})]
						})
					] }),
					selectedProfile === void 0 && !loading && (0, react_jsx_runtime.jsx)("p", {
						className: AgentTeamsSettingsSection_module_css_default.profileHint,
						children: t("settings.profiles.empty")
					})
				]
			});
		}
		//#endregion
		//#region lib/client/settings-write.js
		const SETTINGS_NAMESPACE = "agent-teams";
		var BoundedCallError = class extends Error {
			constructor(label, timeoutMs) {
				super(`${label} timed out after ${timeoutMs}ms`);
				this.name = "BoundedCallError";
			}
		};
		function errorMessage(error) {
			return error instanceof Error ? error.message : String(error);
		}
		function bounded(promise, label, timeoutMs) {
			return new Promise((resolve, reject) => {
				let open = true;
				const timer = setTimeout(() => {
					if (!open) return;
					open = false;
					reject(new BoundedCallError(label, timeoutMs));
				}, timeoutMs);
				promise.then((value) => {
					if (!open) return;
					open = false;
					clearTimeout(timer);
					resolve(value);
				}, (error) => {
					if (!open) return;
					open = false;
					clearTimeout(timer);
					reject(error);
				});
			});
		}
		function laterRevision(left, right) {
			if (left === void 0) return right;
			if (right === void 0) return left;
			return Math.max(left, right);
		}
		var SerializedAgentTeamsSettingsWriter = class {
			options;
			tail = Promise.resolve();
			revision;
			uncertain = false;
			generation = 0;
			timeoutMs;
			constructor(options) {
				this.options = options;
				this.revision = options.scope.getSnapshot().revision;
				this.timeoutMs = options.timeoutMs ?? 1e4;
			}
			write(ops) {
				const run = this.tail.then(() => this.perform([...ops]));
				this.tail = run.then(() => void 0, () => void 0);
				return run;
			}
			async perform(ops) {
				if (this.uncertain) {
					const recoveryError = await this.recover();
					if (recoveryError !== null) return {
						status: "error",
						error: `settings recovery failed: ${recoveryError}`
					};
				}
				this.revision = laterRevision(this.revision, this.options.scope.getSnapshot().revision);
				if (this.revision === void 0) {
					this.uncertain = true;
					return {
						status: "error",
						error: "settings revision is not ready"
					};
				}
				const expectedRevision = this.revision;
				const generation = ++this.generation;
				let response;
				try {
					response = await bounded(this.options.api.settings.mutate(SETTINGS_NAMESPACE, [...ops], expectedRevision), "settings mutation", this.timeoutMs);
				} catch (error) {
					if (generation === this.generation) this.generation += 1;
					return this.failAndRecover(errorMessage(error));
				}
				if (!response.ok) {
					if (generation === this.generation) this.generation += 1;
					return this.failAndRecover(response.error.message);
				}
				const next = response.value;
				const knownRevision = laterRevision(expectedRevision, laterRevision(this.revision, this.options.scope.getSnapshot().revision)) ?? expectedRevision;
				if (generation !== this.generation || next.ns !== SETTINGS_NAMESPACE || next.revision < knownRevision) return this.failAndRecover("settings mutation returned a stale or mismatched view");
				this.revision = next.revision;
				this.uncertain = false;
				this.options.describe.acceptView(next);
				return {
					status: "ready",
					error: null
				};
			}
			async failAndRecover(writeError) {
				this.uncertain = true;
				const recoveryError = await this.recover();
				return {
					status: "error",
					error: recoveryError === null ? writeError : `${writeError}; recovery failed: ${recoveryError}`
				};
			}
			async recover() {
				++this.generation;
				let response;
				try {
					response = await bounded(this.options.api.settings.describe(), "settings recovery", this.timeoutMs);
				} catch (error) {
					return errorMessage(error);
				}
				if (!response.ok) return response.error.message;
				const recovered = response.value.namespaces.find((entry) => entry.ns === SETTINGS_NAMESPACE);
				if (recovered === void 0) return "agent-teams namespace is unavailable";
				const heldRevision = laterRevision(this.revision, this.options.scope.getSnapshot().revision);
				if (heldRevision === void 0 || recovered.revision >= heldRevision) {
					this.options.describe.acceptView(recovered);
					this.revision = recovered.revision;
				} else this.revision = heldRevision;
				this.uncertain = false;
				return null;
			}
		};
		function createAgentTeamsSettingsWriter(options) {
			return new SerializedAgentTeamsSettingsWriter(options);
		}
		function set(field, value) {
			return {
				op: "set",
				path: [field],
				value
			};
		}
		function planDelegationModeChange(mode) {
			return {
				ok: true,
				ops: [set("delegationMode", mode)]
			};
		}
		async function runAgentTeamsSettingsAction(writer, ops, publish) {
			const retryOps = [...ops];
			publish({
				status: "busy",
				ops: retryOps,
				error: null
			});
			let result;
			try {
				result = await writer.write(ops);
			} catch (error) {
				result = {
					status: "error",
					error: errorMessage(error)
				};
			} finally {
				if (result === void 0) result = {
					status: "error",
					error: "settings write did not settle"
				};
				publish(result.status === "ready" ? {
					status: "idle",
					ops: null,
					error: null
				} : {
					status: "error",
					ops: retryOps,
					error: result.error
				});
			}
			return result;
		}
		//#endregion
		//#region lib/client/AgentTeamsSettingsSection.js
		const DEFAULT_SETTINGS = { delegationMode: "teams" };
		function AgentTeamsSettingsSection({ settings, writer, t }) {
			const subscribe = (0, react.useCallback)((listener) => settings.subscribe(listener), [settings]);
			const getSnapshot = (0, react.useCallback)(() => settings.getSnapshot(), [settings]);
			const snapshot = (0, react.useSyncExternalStore)(subscribe, getSnapshot, getSnapshot);
			const value = snapshot.value ?? DEFAULT_SETTINGS;
			const [catalogAttempt, setCatalogAttempt] = (0, react.useState)(0);
			const [catalog, setCatalog] = (0, react.useState)({
				status: "loading",
				models: [],
				error: null
			});
			const [writeView, setWriteView] = (0, react.useState)({
				status: "idle",
				ops: null,
				error: null
			});
			(0, react.useEffect)(() => {
				let active = true;
				setCatalog({
					status: "loading",
					models: [],
					error: null
				});
				loadModelCatalog().then((next) => {
					if (active) setCatalog(next);
				});
				return () => {
					active = false;
				};
			}, [catalogAttempt]);
			const writable = snapshot.status === "ready" && snapshot.writable;
			const controlsDisabled = !writable || writeView.status === "busy";
			const runWrite = (0, react.useCallback)(async (ops) => {
				await runAgentTeamsSettingsAction(writer, ops, setWriteView);
			}, [writer]);
			const runPlan = (0, react.useCallback)(async (plan) => {
				await runWrite(plan.ops);
			}, [runWrite]);
			const setDelegationMode = async (mode) => {
				await runPlan(planDelegationModeChange(mode));
			};
			const statusCopy = snapshot.status === "loading" ? t("settings.state.loading") : snapshot.status === "unavailable" ? t("settings.state.unavailable") : !snapshot.writable ? t("settings.state.readOnly") : null;
			const visibleWriteError = writeView.status === "error" && writeView.error === "settings revision is not ready" ? t("settings.write.noRevision") : writeView.status === "error" ? writeView.error : null;
			return (0, react_jsx_runtime.jsxs)("div", {
				className: AgentTeamsSettingsSection_module_css_default.root,
				"aria-busy": snapshot.status === "loading" || catalog.status === "loading" || writeView.status === "busy",
				children: [
					(0, react_jsx_runtime.jsxs)("header", {
						className: AgentTeamsSettingsSection_module_css_default.header,
						children: [
							(0, react_jsx_runtime.jsx)("h2", {
								className: AgentTeamsSettingsSection_module_css_default.pageTitle,
								children: t("settings.title")
							}),
							(0, react_jsx_runtime.jsx)("p", {
								className: AgentTeamsSettingsSection_module_css_default.intro,
								children: t("settings.intro")
							}),
							statusCopy !== null && (0, react_jsx_runtime.jsx)("p", {
								className: AgentTeamsSettingsSection_module_css_default.settingsStatus,
								role: "status",
								"aria-live": "polite",
								children: statusCopy
							}),
							writeView.status === "busy" && (0, react_jsx_runtime.jsx)("p", {
								className: AgentTeamsSettingsSection_module_css_default.settingsStatus,
								role: "status",
								"aria-live": "polite",
								children: t("settings.write.saving")
							}),
							writeView.status === "error" && (0, react_jsx_runtime.jsxs)("div", {
								className: AgentTeamsSettingsSection_module_css_default.writeError,
								role: "alert",
								children: [(0, react_jsx_runtime.jsx)("span", { children: t("settings.write.error", { message: visibleWriteError ?? writeView.error }) }), writeView.ops !== null && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									type: "button",
									variant: "outline",
									size: "sm",
									disabled: !writable,
									onClick: async () => {
										if (writeView.ops !== null) await runWrite(writeView.ops);
									},
									children: t("settings.write.retry")
								})]
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("section", {
						className: AgentTeamsSettingsSection_module_css_default.section,
						"aria-labelledby": "agent-teams-delegation-title",
						children: [
							(0, react_jsx_runtime.jsx)("h3", {
								id: "agent-teams-delegation-title",
								className: AgentTeamsSettingsSection_module_css_default.sectionTitle,
								children: t("settings.delegation.title")
							}),
							(0, react_jsx_runtime.jsx)("p", {
								className: AgentTeamsSettingsSection_module_css_default.help,
								children: t("settings.delegation.help")
							}),
							(0, react_jsx_runtime.jsxs)("fieldset", {
								className: AgentTeamsSettingsSection_module_css_default.choices,
								disabled: controlsDisabled,
								children: [(0, react_jsx_runtime.jsx)("legend", {
									className: AgentTeamsSettingsSection_module_css_default.visuallyHidden,
									children: t("settings.delegation.title")
								}), ["teams", "native"].map((mode) => (0, react_jsx_runtime.jsxs)("label", {
									className: AgentTeamsSettingsSection_module_css_default.choice,
									children: [(0, react_jsx_runtime.jsx)("input", {
										type: "radio",
										name: "agent-teams-delegation-mode",
										value: mode,
										checked: value.delegationMode === mode,
										onChange: async () => {
											await setDelegationMode(mode);
										}
									}), (0, react_jsx_runtime.jsxs)("span", { children: [(0, react_jsx_runtime.jsx)("strong", { children: t(`settings.delegation.${mode}.label`) }), (0, react_jsx_runtime.jsx)("small", { children: t(`settings.delegation.${mode}.description`) })] })]
								}, mode))]
							})
						]
					}),
					(0, react_jsx_runtime.jsx)(TeamProfilesEditor, {
						catalog,
						onRetryCatalog: () => setCatalogAttempt((attempt) => attempt + 1),
						t,
						writable
					})
				]
			});
		}
		//#endregion
		//#region lib/client/agent-teams-card-definition.js
		/**
		* AgentTeams conversation card: a lightweight in-conversation summary shown
		* when a team is created — the captain's name, the member roster with whale
		* avatars, and an entry point that re-activates the top-right activity
		* panel (useful after the floater was closed, or when re-opening an old
		* session for review).
		*
		* The fold anchors to the Harness's durable `tool/call` + `tool/result`
		* records for `agent_teams_create`. Those are first-party session events, so
		* the card survives restarts without writing an out-of-repo event type.
		* @module dsh-agent-teams/client/card
		*/
		/** Parse the only create-call fields the historic card owns. */
		function parseAgentTeamsCreateArgs(value) {
			try {
				const parsed = JSON.parse(value);
				if (typeof parsed !== "object" || parsed === null || !("name" in parsed) || typeof parsed.name !== "string") return;
				const name = parsed.name.trim();
				if (name === "") return void 0;
				const cleaned = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
				return {
					teamId: cleaned === "" ? "team" : cleaned,
					name
				};
			} catch {
				return;
			}
		}
		/** Durable first-party tool events folded into one keyed Chat node. */
		const agentTeamsCardDefinition = {
			kind: "agent-teams",
			target: "chat",
			match: (event) => {
				if (event.type === "tool/call" && event.data.name === "agent_teams_create") return parseAgentTeamsCreateArgs(event.data.arguments) === void 0 ? null : {
					id: String(event.data.callId),
					role: "start"
				};
				if (event.type === "tool/result" && event.data.message.source.kind === "tool") return {
					id: String(event.data.message.source.callId),
					role: "update"
				};
				return null;
			},
			start: (_context, match) => {
				if (match.event.type !== "tool/call") throw new Error("agent-teams card start requires agent_teams_create tool/call");
				const parsed = parseAgentTeamsCreateArgs(match.event.data.arguments);
				if (parsed === void 0) throw new Error("agent-teams card start requires valid create arguments");
				return {
					...parsed,
					accepted: false
				};
			},
			update: (context, match) => {
				if (match.event.type !== "tool/result") return context.state;
				if (match.event.data.error !== void 0 || match.event.data.message.content.some((block) => block.type === "tool-result" && block.isError === true)) return context.state;
				return {
					...context.state,
					accepted: true
				};
			},
			buildViewNode: (context) => {
				if (context.start === void 0) return null;
				const state = context.state;
				if (!state.accepted) return null;
				return {
					key: context.key,
					kind: "agent-teams",
					id: context.id,
					target: "chat",
					anchorSeq: context.start.event.seq,
					location: context.start.location,
					visibility: "visible",
					data: {
						teamId: state.teamId,
						captainSessionId: "",
						teamName: state.name,
						members: []
					}
				};
			}
		};
		//#endregion
		//#region lib/client/locales.js
		/** `agentTeams` namespace dictionaries for every plugin-owned Web surface. */
		/** Dictionary namespace owned by the AgentTeams client plugin. */
		const AGENT_TEAMS_LOCALE_NAMESPACE = "agentTeams";
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"card.memberCount": "{count} 名成员",
			"action.openActivityPanel": "打开活动面板",
			"activity.panelButton": "活动面板",
			"activity.badgeAria": "AgentTeams 活动与历史，{count} 条团队记录",
			"activity.panelAria": "AgentTeams 活动面板",
			"activity.title": "AgentTeams 活动",
			"activity.float": "切换为浮动面板",
			"activity.dockRight": "停靠到右侧",
			"activity.collapse": "收起活动面板",
			"activity.empty": "暂无团队活动",
			"team.stop": "停止团队",
			"team.stopped": "已停止",
			"team.stopTitle": "确认停止“{team}”？",
			"team.stopDescription": "将取消 {tasks} 项未完成任务，并停止 {members} 名正在工作的成员。已完成的结果会保留。",
			"team.stopCancel": "继续运行",
			"team.stopConfirm": "确认停止",
			"team.stopping": "正在停止…",
			"team.stopFailed": "停止失败：{message}",
			"team.stopRequestFailed": "服务器未能停止团队，请重试",
			"team.discarded": "已放弃",
			"format.listSeparator": "、",
			"task.status.pending": "待领取",
			"task.status.claimed": "已认领",
			"task.status.inProgress": "进行中",
			"task.status.completed": "已完成",
			"task.status.failed": "失败",
			"task.status.cancelled": "已取消",
			"task.status.notRun": "未执行",
			"member.state.working": "工作中",
			"member.state.failed": "有失败",
			"member.state.waiting": "等待",
			"member.state.delivered": "已交付",
			"member.state.left": "已离队",
			"member.state.removed": "已移除",
			"member.state.pending": "待执行",
			"member.state.unassigned": "待派工",
			"member.state.staged": "待创建",
			"member.state.notCreated": "未创建",
			"member.state.stopped": "已停止",
			"member.status.executing": "正在执行 {taskId}",
			"member.status.executingModel": "正在执行 {taskId} · {model}",
			"member.status.working": "正在处理已派任务",
			"member.status.waitingOn": "等待 {taskId} · {assignee}",
			"member.status.waitingPrerequisite": "等待前置任务",
			"member.status.waitingAssignment": "等待队长派工",
			"member.status.delivered": "任务已交付",
			"member.status.idle": "待继续执行",
			"member.status.unknown": "状态未知",
			"member.status.staged": "确认后创建并启动",
			"member.status.settled": "任务均已终结",
			"member.status.discarded": "计划已放弃，未创建",
			"member.status.stopped": "团队已停止，需显式恢复",
			"task.assignee.unclaimed": "待认领",
			"task.summary.waitingBreakdown": "等待队长拆解任务",
			"task.summary.staged": "{count} 项计划等待确认",
			"task.summary.discarded": "{count} 项计划已放弃，均未执行",
			"task.summary.allDelivered": "全部 {count} 项任务已交付",
			"task.summary.ended": "终态：{completed} 已交付 · {cancelled} 已取消 · {failed} 失败",
			"task.summary.blockedAndRunning": "{tasks}{more} 等待前置，其余已开工",
			"task.summary.more": " 等 {count} 项",
			"task.summary.running": "{tasks} 正在执行",
			"task.summary.ready": "{tasks} 已就绪待开工",
			"task.summary.blocked": "{tasks} 等待前置",
			"task.summary.failedSettled": "{count} 项已失败，自动循环已停止",
			"task.summary.waitingSchedule": "等待下一轮调度",
			"progress.aria": "团队总进度",
			"progress.title": "总进度",
			"progress.running": "■ 进行中 {count}",
			"progress.blocked": "■ 等待依赖 {count}",
			"progress.delivered": "■ 已交付 {count}",
			"dependency.aria": "任务依赖链",
			"dependency.parallel": "并行任务",
			"dependency.title": "任务依赖",
			"dependency.hint.parallel": "无前后依赖 · 点击查看详情",
			"dependency.hint.chain": "悬停高亮依赖链 · 点击固定",
			"dependency.hint.pinned": "{taskId} 已固定 · Esc 取消",
			"task.runningAria": "运行中",
			"task.model": "{model}",
			"member.model": "{model}",
			"task.detail.completed": "已完成并交付",
			"task.detail.noPrerequisite": "无前置，可立即开工",
			"task.detail.ready": "前置已就绪，可开工",
			"task.detail.waitingOn": "等待 {tasks}",
			"task.detail.notRun": "计划已放弃，任务未执行",
			"task.detail.noDownstream": "无下游任务",
			"task.detail.unlocks": "完成后解锁 {tasks}",
			"team.ended": "已结束",
			"plan.badge": "待确认",
			"plan.title": "执行前计划审查",
			"plan.description": "成员尚未创建、任务尚未调度。可直接调整计划，也可返回对话告诉队长哪里需要修改。",
			"plan.member.role": "角色",
			"plan.member.provider": "Provider",
			"plan.member.model": "模型",
			"plan.member.reasoning": "推理等级",
			"plan.member.reasoningHint": "留空使用默认值；可用 low、medium、high、xhigh 等",
			"plan.model.choose": "选择模型",
			"plan.model.currentUnavailable": "{provider}/{model}（当前目录不可用）",
			"plan.model.route": "路由：{provider}/{model}",
			"plan.model.defaultReasoning": "默认推理等级",
			"plan.model.providerDefault": "Provider 默认值",
			"plan.model.modelDefault": "模型默认值（{effort}）",
			"plan.model.triggerAria": "选择成员模型，当前 {model}，推理等级 {effort}",
			"plan.model.back": "返回",
			"plan.model.loading": "正在加载模型…",
			"plan.model.empty": "暂无可用模型",
			"plan.model.partialFailure": "{count} 个 Provider 的模型目录加载失败",
			"plan.model.retry": "重试",
			"plan.member.prompt": "角色提示词",
			"plan.member.roleFallback": "未设置角色",
			"plan.task.subject": "任务名称",
			"plan.task.description": "任务说明",
			"plan.task.assignee": "负责人",
			"plan.task.dependencies": "依赖任务 ID（逗号分隔）",
			"plan.task.dependenciesHint": "例如 task-1, task-2；不得形成循环依赖",
			"plan.task.kind": "任务类型",
			"plan.task.kind.work": "普通工作",
			"plan.task.kind.requirements": "需求审查",
			"plan.task.kind.implementation": "实现",
			"plan.task.kind.verification": "验证",
			"plan.task.kind.review": "审核",
			"plan.task.kind.repair": "修复",
			"plan.task.kind.integration": "集成",
			"plan.task.round": "审查轮次",
			"plan.task.objective": "任务目标",
			"plan.task.inScope": "范围内路径",
			"plan.task.outOfScope": "范围外路径",
			"plan.task.acceptance": "验收标准",
			"plan.task.verify": "验证命令",
			"plan.task.deliverables": "交付物",
			"plan.task.nonGoals": "非目标",
			"plan.task.reviewedTaskId": "被审核任务 ID",
			"plan.task.sourceTaskId": "来源任务 ID",
			"plan.task.sourceFindingIds": "来源问题 ID",
			"plan.task.coverageOf": "覆盖项",
			"plan.task.listHint": "每行一项；留空会清除此字段",
			"plan.task.unassigned": "共享任务池",
			"plan.unsaved": "未保存",
			"plan.save": "保存",
			"plan.saving": "保存中…",
			"plan.remove": "删除",
			"plan.removed": "任务已删除",
			"plan.removeConfirm": "确认删除",
			"plan.removeWarning": "删除 {task} 后将重新计算依赖关系。",
			"plan.cancel": "取消",
			"plan.addTask": "添加任务",
			"plan.adding": "添加中…",
			"plan.taskAdded": "任务已添加",
			"plan.newTask": "新任务名称",
			"plan.newTaskLabel": "新增计划任务",
			"plan.readySummary": "{members} 名成员 · {tasks} 项任务 · {links} 条依赖",
			"plan.flow.aria": "团队启动流程",
			"plan.flow.review": "审查计划",
			"plan.flow.spawn": "创建成员",
			"plan.flow.run": "开始执行",
			"plan.members.title": "成员与模型路由",
			"plan.members.count": "{count} 名成员",
			"plan.members.empty": "尚未规划成员",
			"plan.tasks.title": "任务与依赖",
			"plan.tasks.count": "{count} 项任务 · {links} 条依赖",
			"plan.tasks.empty": "尚未规划任务",
			"plan.dependencies.none": "无依赖",
			"plan.dependencies.count": "{count} 条依赖",
			"plan.approve": "确认并启动团队",
			"plan.approving": "正在创建成员…",
			"plan.approveTitle": "计划检查完毕？",
			"plan.approveHint": "确认后将创建 {members} 名成员并调度 {tasks} 项任务。",
			"plan.approveConfirmTitle": "确认启动此团队",
			"plan.approveWarning": "启动后不能再在此处编辑成员和依赖。",
			"plan.approveConfirm": "确认启动",
			"plan.continue": "返回对话修改",
			"plan.returnToChat": "回到对话",
			"plan.feedbackTitle": "正在等你说明修改方向",
			"plan.feedbackHint": "队长会在对话中追问；收到你的回复后，只修改这份草案并再次等待确认。",
			"plan.discard": "放弃本次计划",
			"plan.discardConfirmTitle": "放弃本次计划？",
			"plan.discardWarning": "该计划会结束并归档；尚未创建任何成员，也不会执行任务。",
			"plan.discardConfirm": "确认放弃",
			"plan.discarding": "正在放弃…",
			"plan.pendingEdits": "请先保存当前修改，再启动团队。",
			"plan.saved": "计划已保存",
			"plan.failed": "操作失败：{message}",
			"team.stats.members": "{count} 名成员",
			"team.stats.completed": "{completed}/{total} 完成",
			"team.stats.messages": "{count} 条消息",
			"delegation.aria": "队长派工关系",
			"captain.name": "队长",
			"captain.role": "拆解 · 派发 · 汇总",
			"captain.summary": "已派发 {tasks} 项任务给 {members} 名成员",
			"captain.summary.staged": "已规划 {tasks} 项任务与 {members} 名成员，等待确认",
			"captain.summary.awaitingFeedback": "草案已保留，等待你在对话中说明修改方向",
			"captain.summary.discarded": "计划已放弃：{members} 名成员未创建，{tasks} 项任务未执行",
			"captain.summary.withTakeover": "已派发 {tasks} 项给成员 · 队长接管 {captainTasks}",
			"captain.state.working": "{count} 人执行中",
			"captain.state.takeover": "正在执行 {tasks}",
			"captain.state.collected": "已收齐",
			"captain.state.waiting": "等待回报",
			"captain.state.staged": "待确认",
			"captain.state.awaitingFeedback": "待反馈",
			"captain.state.discarded": "已放弃",
			"captain.state.settled": "已终结",
			"members.toggle": "{count} 名成员",
			"members.collapse": "收起",
			"members.expand": "展开",
			"members.empty": "暂无成员，等待队长组建团队",
			"assignment.label": "队长派发",
			"assignment.staged": "计划任务",
			"assignment.discarded": "未执行的计划",
			"assignment.empty": "暂无任务",
			"archive.label": "已结束 · 历史归档",
			"archive.discardedLabel": "计划已放弃 · 历史归档",
			"settings.title": "子智能体",
			"settings.intro": "设置团队委派方式以及以后创建的成员使用的模型路由。",
			"settings.state.loading": "正在加载子智能体设置…",
			"settings.state.unavailable": "当前客户端无法访问子智能体设置。",
			"settings.state.readOnly": "当前连接为只读；可以查看但不能更改设置。",
			"settings.write.saving": "正在保存设置…",
			"settings.write.error": "设置保存失败：{message}",
			"settings.write.retry": "重试保存",
			"settings.write.noRevision": "设置修订版本尚未就绪",
			"settings.delegation.title": "委派模式",
			"settings.delegation.help": "更改会对新会话生效，不会改变已打开会话的委派方式。",
			"settings.delegation.teams.label": "Team 模式",
			"settings.delegation.teams.description": "使用 AgentTeams 组建持久成员并协调任务。",
			"settings.delegation.native.label": "Native 兼容模式",
			"settings.delegation.native.description": "使用 Harness 原生子智能体委派。",
			"settings.catalog.loading": "正在加载模型目录…",
			"settings.catalog.empty": "暂无可用模型。可以保持“跟随队长”。",
			"settings.catalog.error": "模型目录加载失败：{message}",
			"settings.catalog.retry": "重试",
			"settings.profiles.title": "Profile 配置",
			"settings.profiles.help": "按上游 profile 结构编辑成员、路由、任务与审查策略。保存后重启 Harness，配置才会用于新团队。",
			"settings.profiles.loading": "正在加载 profile…",
			"settings.profiles.unsupportedPersistedVersion": "旧 Profile 不导入，保存后创建 V2。",
			"settings.profiles.bridgeUnavailable": "当前客户端无法访问 profile 配置。",
			"settings.profiles.error": "Profile 保存失败：{message}",
			"settings.profiles.saved": "Profile 已保存。",
			"settings.profiles.restart": "重启后用于新团队。",
			"settings.profiles.listAria": "AgentTeams profile 列表",
			"settings.profiles.new": "新建",
			"settings.profiles.copy": "复制",
			"settings.profiles.delete": "删除",
			"settings.profiles.builtIn": "内置",
			"settings.profiles.custom": "自定义",
			"settings.profiles.name": "Profile 名称",
			"settings.profiles.rename": "应用名称",
			"settings.profiles.invalidName": "名称必须以字母或数字开头，只能包含字母、数字、点、下划线和短横线，且不能使用 captain。",
			"settings.profiles.duplicateName": "该 profile 名称已经存在。",
			"settings.profiles.restore": "恢复内置",
			"settings.profiles.unsaved": "有未保存更改",
			"settings.profiles.save": "保存 Profile",
			"settings.profiles.saving": "正在保存 Profile…",
			"settings.profiles.empty": "暂无 profile。",
			"settings.profiles.description": "描述",
			"settings.profiles.protocol": "协作协议",
			"settings.profiles.executionPrompt": "执行提示",
			"settings.profiles.taskPlanning": "任务规划方式",
			"settings.profiles.captain": "队长规划",
			"settings.profiles.captainHelp": "由队长根据当前目标动态拆解任务（推荐）。",
			"settings.profiles.seed": "固定任务模板",
			"settings.profiles.seedHelp": "使用下方预先配置的任务、负责人和依赖图。",
			"settings.profiles.captainTasksHint": "当前为队长规划；任务模板仅在切换到固定任务模板后编辑。",
			"settings.profiles.members": "成员",
			"settings.profiles.member": "成员 {index}",
			"settings.profiles.memberName": "成员名称",
			"settings.profiles.memberRole": "角色",
			"settings.profiles.memberProvider": "Provider",
			"settings.profiles.memberModel": "模型",
			"settings.profiles.followCaptain": "跟随队长",
			"settings.profiles.chooseModel": "选择模型",
			"settings.profiles.defaultValue": "默认值",
			"settings.profiles.reasoning.title": "推理策略",
			"settings.profiles.reasoning.target-default.label": "目标模型默认",
			"settings.profiles.reasoning.route-aware.label": "路由感知",
			"settings.profiles.reasoning.explicit.label": "明确指定",
			"settings.profiles.reasoning.effort": "思考强度",
			"settings.profiles.reasoning.noEfforts": "当前模型没有可选思考强度",
			"settings.profiles.explicitCatalogRequired": "请等待共享模型目录可用，并为明确指定的角色选择完整 Provider、模型和思考强度。",
			"settings.profiles.fallbackCatalogRequired": "请等待共享模型目录可用，并为新增或修改的备用路由选择目录中的完整 Provider 和模型。",
			"settings.profiles.memberPrompt": "成员执行提示",
			"settings.profiles.memberFallback": "成员备用路由",
			"settings.profiles.profileFallback": "Profile 备用路由",
			"settings.profiles.fallbackProvider": "备用 Provider",
			"settings.profiles.fallbackModel": "备用模型",
			"settings.profiles.noFallback": "不设置备用路由",
			"settings.profiles.unavailable": "{value}（当前目录不可用）",
			"settings.profiles.addMember": "添加成员",
			"settings.profiles.remove": "移除",
			"settings.profiles.tasks": "任务模板",
			"settings.profiles.newTask": "新任务",
			"settings.profiles.taskId": "任务 ID",
			"settings.profiles.taskSubject": "任务主题",
			"settings.profiles.taskDescription": "任务描述",
			"settings.profiles.taskAssignee": "负责人",
			"settings.profiles.chooseAssignee": "选择负责人",
			"settings.profiles.taskDependencies": "依赖任务 ID",
			"settings.profiles.commaSeparated": "用逗号分隔",
			"settings.profiles.addTask": "添加任务",
			"settings.profiles.reviewPolicy": "审查策略",
			"settings.profiles.requirementsMinRounds": "需求最少轮次",
			"settings.profiles.requirementsMaxRounds": "需求最多轮次",
			"settings.profiles.codeMaxRounds": "代码最多轮次",
			"settings.profiles.maxRepairAttempts": "最多修复次数",
			"settings.profiles.requiredReviewers": "必需审查者"
		};
		/** English dictionary, checked complete against the Chinese source key set. */
		const en = {
			"card.memberCount": "{count} members",
			"action.openActivityPanel": "Open activity panel",
			"activity.panelButton": "Activity panel",
			"activity.badgeAria": "AgentTeams activity and history, {count} team records",
			"activity.panelAria": "AgentTeams activity panel",
			"activity.title": "AgentTeams activity",
			"activity.float": "Switch to floating panel",
			"activity.dockRight": "Dock to the right",
			"activity.collapse": "Collapse activity panel",
			"activity.empty": "No team activity",
			"team.stop": "Stop team",
			"team.stopped": "Stopped",
			"team.stopTitle": "Stop “{team}”?",
			"team.stopDescription": "This cancels {tasks} unfinished tasks and stops {members} working members. Completed results are kept.",
			"team.stopCancel": "Keep running",
			"team.stopConfirm": "Stop team",
			"team.stopping": "Stopping…",
			"team.stopFailed": "Could not stop team: {message}",
			"team.stopRequestFailed": "The server could not stop this team. Try again.",
			"team.discarded": "Discarded",
			"format.listSeparator": ", ",
			"task.status.pending": "Unclaimed",
			"task.status.claimed": "Claimed",
			"task.status.inProgress": "In progress",
			"task.status.completed": "Completed",
			"task.status.failed": "Failed",
			"task.status.cancelled": "Cancelled",
			"task.status.notRun": "Not run",
			"member.state.working": "Working",
			"member.state.failed": "Has failures",
			"member.state.waiting": "Waiting",
			"member.state.delivered": "Delivered",
			"member.state.left": "Left team",
			"member.state.removed": "Removed",
			"member.state.pending": "Pending",
			"member.state.unassigned": "Awaiting assignment",
			"member.state.staged": "Not spawned",
			"member.state.notCreated": "Not created",
			"member.state.stopped": "Stopped",
			"member.status.executing": "Working on {taskId}",
			"member.status.executingModel": "Working on {taskId} · {model}",
			"member.status.working": "Working on assigned tasks",
			"member.status.waitingOn": "Waiting for {taskId} · {assignee}",
			"member.status.waitingPrerequisite": "Waiting for prerequisites",
			"member.status.waitingAssignment": "Waiting for the captain to assign work",
			"member.status.delivered": "Tasks delivered",
			"member.status.idle": "Ready to continue",
			"member.status.unknown": "Status unknown",
			"member.status.staged": "Will be spawned after approval",
			"member.status.settled": "All assigned work is settled",
			"member.status.discarded": "Plan discarded; member was not created",
			"member.status.stopped": "Team stopped; explicit resume required",
			"task.assignee.unclaimed": "Unclaimed",
			"task.summary.waitingBreakdown": "Waiting for the captain to break down the work",
			"task.summary.staged": "{count} planned tasks awaiting approval",
			"task.summary.discarded": "{count} planned tasks discarded; none ran",
			"task.summary.allDelivered": "All {count} tasks delivered",
			"task.summary.ended": "Final: {completed} delivered · {cancelled} cancelled · {failed} failed",
			"task.summary.blockedAndRunning": "{tasks}{more} waiting on prerequisites; other work has started",
			"task.summary.more": " and {count} more",
			"task.summary.running": "{tasks} in progress",
			"task.summary.ready": "{tasks} ready to start",
			"task.summary.blocked": "{tasks} waiting on prerequisites",
			"task.summary.failedSettled": "{count} failed; the automatic loop has stopped",
			"task.summary.waitingSchedule": "Waiting for the next scheduling round",
			"progress.aria": "Overall team progress",
			"progress.title": "Overall progress",
			"progress.running": "■ In progress {count}",
			"progress.blocked": "■ Waiting {count}",
			"progress.delivered": "■ Delivered {count}",
			"dependency.aria": "Task dependency chain",
			"dependency.parallel": "Parallel tasks",
			"dependency.title": "Task dependencies",
			"dependency.hint.parallel": "No dependencies · Click for details",
			"dependency.hint.chain": "Hover to highlight dependencies · Click to pin",
			"dependency.hint.pinned": "{taskId} pinned · Esc to clear",
			"task.runningAria": "Running",
			"task.model": "{model}",
			"member.model": "{model}",
			"task.detail.completed": "Completed and delivered",
			"task.detail.noPrerequisite": "No prerequisites; ready to start",
			"task.detail.ready": "Prerequisites ready; can start",
			"task.detail.waitingOn": "Waiting for {tasks}",
			"task.detail.notRun": "Plan discarded; task was not run",
			"task.detail.noDownstream": "No downstream tasks",
			"task.detail.unlocks": "Unlocks {tasks} when complete",
			"team.ended": "Ended",
			"plan.badge": "Awaiting approval",
			"plan.title": "Pre-run plan review",
			"plan.description": "Members have not been spawned and tasks have not been scheduled. Edit the draft here, or return to chat and tell the Captain what should change.",
			"plan.member.role": "Role",
			"plan.member.provider": "Provider",
			"plan.member.model": "Model",
			"plan.member.reasoning": "Reasoning effort",
			"plan.member.reasoningHint": "Leave blank for default; accepts low, medium, high, xhigh, and more",
			"plan.model.choose": "Choose a model",
			"plan.model.currentUnavailable": "{provider}/{model} (not in the current catalog)",
			"plan.model.route": "Route: {provider}/{model}",
			"plan.model.defaultReasoning": "Default reasoning effort",
			"plan.model.providerDefault": "Provider default",
			"plan.model.modelDefault": "Model default ({effort})",
			"plan.model.triggerAria": "Choose member model, currently {model}, reasoning effort {effort}",
			"plan.model.back": "Back",
			"plan.model.loading": "Loading models…",
			"plan.model.empty": "No models available",
			"plan.model.partialFailure": "{count} provider catalogs could not be loaded",
			"plan.model.retry": "Retry",
			"plan.member.prompt": "Role prompt",
			"plan.member.roleFallback": "Role not set",
			"plan.task.subject": "Task subject",
			"plan.task.description": "Task description",
			"plan.task.assignee": "Assignee",
			"plan.task.dependencies": "Dependency task IDs (comma-separated)",
			"plan.task.dependenciesHint": "For example task-1, task-2; cycles are rejected",
			"plan.task.kind": "Task kind",
			"plan.task.kind.work": "Work",
			"plan.task.kind.requirements": "Requirements",
			"plan.task.kind.implementation": "Implementation",
			"plan.task.kind.verification": "Verification",
			"plan.task.kind.review": "Review",
			"plan.task.kind.repair": "Repair",
			"plan.task.kind.integration": "Integration",
			"plan.task.round": "Review round",
			"plan.task.objective": "Objective",
			"plan.task.inScope": "In-scope paths",
			"plan.task.outOfScope": "Out-of-scope paths",
			"plan.task.acceptance": "Acceptance criteria",
			"plan.task.verify": "Verification commands",
			"plan.task.deliverables": "Deliverables",
			"plan.task.nonGoals": "Non-goals",
			"plan.task.reviewedTaskId": "Reviewed task ID",
			"plan.task.sourceTaskId": "Source task ID",
			"plan.task.sourceFindingIds": "Source finding IDs",
			"plan.task.coverageOf": "Coverage items",
			"plan.task.listHint": "One item per line; leave blank to clear this field",
			"plan.task.unassigned": "Shared task pool",
			"plan.unsaved": "Unsaved",
			"plan.save": "Save",
			"plan.saving": "Saving…",
			"plan.remove": "Remove",
			"plan.removed": "Task removed",
			"plan.removeConfirm": "Confirm remove",
			"plan.removeWarning": "Removing {task} will recalculate downstream dependencies.",
			"plan.cancel": "Cancel",
			"plan.addTask": "Add task",
			"plan.adding": "Adding…",
			"plan.taskAdded": "Task added",
			"plan.newTask": "New task subject",
			"plan.newTaskLabel": "Add a planned task",
			"plan.readySummary": "{members} members · {tasks} tasks · {links} dependencies",
			"plan.flow.aria": "Team launch flow",
			"plan.flow.review": "Review plan",
			"plan.flow.spawn": "Create members",
			"plan.flow.run": "Start work",
			"plan.members.title": "Members & model routes",
			"plan.members.count": "{count} members",
			"plan.members.empty": "No members planned yet",
			"plan.tasks.title": "Tasks & dependencies",
			"plan.tasks.count": "{count} tasks · {links} dependencies",
			"plan.tasks.empty": "No tasks planned yet",
			"plan.dependencies.none": "No dependencies",
			"plan.dependencies.count": "{count} dependencies",
			"plan.approve": "Approve & Run",
			"plan.approving": "Creating members…",
			"plan.approveTitle": "Plan ready?",
			"plan.approveHint": "Approval creates {members} members and schedules {tasks} tasks.",
			"plan.approveConfirmTitle": "Confirm team launch",
			"plan.approveWarning": "Member routes and dependencies cannot be edited here after launch.",
			"plan.approveConfirm": "Confirm launch",
			"plan.continue": "Return to chat & revise",
			"plan.returnToChat": "Return to chat",
			"plan.feedbackTitle": "Waiting for your revision direction",
			"plan.feedbackHint": "The Captain will ask in chat. After your reply, it will revise this draft and wait for approval again.",
			"plan.discard": "Discard this plan",
			"plan.discardConfirmTitle": "Discard this plan?",
			"plan.discardWarning": "The plan will end and be archived. No members have been spawned and no tasks will run.",
			"plan.discardConfirm": "Discard plan",
			"plan.discarding": "Discarding…",
			"plan.pendingEdits": "Save the current edits before launching the team.",
			"plan.saved": "Plan saved",
			"plan.failed": "Operation failed: {message}",
			"team.stats.members": "{count} members",
			"team.stats.completed": "{completed}/{total} completed",
			"team.stats.messages": "{count} messages",
			"delegation.aria": "Captain delegation map",
			"captain.name": "Captain",
			"captain.role": "Break down · Delegate · Synthesize",
			"captain.summary": "Assigned {tasks} tasks to {members} members",
			"captain.summary.staged": "Planned {tasks} tasks and {members} members; awaiting approval",
			"captain.summary.awaitingFeedback": "Draft preserved; waiting for your revision direction in chat",
			"captain.summary.discarded": "Plan discarded: {members} members were not created and {tasks} tasks did not run",
			"captain.summary.withTakeover": "Assigned {tasks} to members · Captain owns {captainTasks}",
			"captain.state.working": "{count} active",
			"captain.state.takeover": "Working on {tasks}",
			"captain.state.collected": "All reports received",
			"captain.state.waiting": "Waiting for reports",
			"captain.state.staged": "Awaiting approval",
			"captain.state.awaitingFeedback": "Awaiting feedback",
			"captain.state.discarded": "Discarded",
			"captain.state.settled": "Settled",
			"members.toggle": "Members {count}",
			"members.collapse": "Collapse",
			"members.expand": "Expand",
			"members.empty": "No members yet; waiting for the captain to assemble the team",
			"assignment.label": "Captain assigned",
			"assignment.staged": "Planned task",
			"assignment.discarded": "Plan not run",
			"assignment.empty": "No tasks",
			"archive.label": "Ended · Archived history",
			"archive.discardedLabel": "Plan discarded · Archived history",
			"settings.title": "Subagents",
			"settings.intro": "Configure team delegation and the model route used by members created in the future.",
			"settings.state.loading": "Loading subagent settings…",
			"settings.state.unavailable": "Subagent settings are unavailable in this client.",
			"settings.state.readOnly": "This connection is read-only. You can view these settings but cannot change them.",
			"settings.write.saving": "Saving settings…",
			"settings.write.error": "Could not save settings: {message}",
			"settings.write.retry": "Retry save",
			"settings.write.noRevision": "The settings revision is not ready yet",
			"settings.delegation.title": "Delegation mode",
			"settings.delegation.help": "Changes apply to new sessions and do not alter delegation in sessions that are already open.",
			"settings.delegation.teams.label": "Team mode",
			"settings.delegation.teams.description": "Use AgentTeams to assemble durable members and coordinate their tasks.",
			"settings.delegation.native.label": "Native compatibility mode",
			"settings.delegation.native.description": "Use Harness native subagent delegation.",
			"settings.catalog.loading": "Loading the model catalog…",
			"settings.catalog.empty": "No models are available. You can keep Follow captain selected.",
			"settings.catalog.error": "Could not load the model catalog: {message}",
			"settings.catalog.retry": "Retry",
			"settings.profiles.title": "Profile configuration",
			"settings.profiles.help": "Edit members, routes, tasks, and review policy using the upstream profile shape. Restart Harness after saving before new teams use it.",
			"settings.profiles.loading": "Loading profiles…",
			"settings.profiles.unsupportedPersistedVersion": "Old Profiles are not imported; saving creates a new V2 document.",
			"settings.profiles.bridgeUnavailable": "Profile configuration is unavailable in this client.",
			"settings.profiles.error": "Could not save profiles: {message}",
			"settings.profiles.saved": "Profiles saved.",
			"settings.profiles.restart": "Restart to use them for new teams.",
			"settings.profiles.listAria": "AgentTeams profile list",
			"settings.profiles.new": "New",
			"settings.profiles.copy": "Copy",
			"settings.profiles.delete": "Delete",
			"settings.profiles.builtIn": "Built-in",
			"settings.profiles.custom": "Custom",
			"settings.profiles.name": "Profile name",
			"settings.profiles.rename": "Apply name",
			"settings.profiles.invalidName": "Use a name starting with a letter or number and containing only letters, numbers, dots, underscores, or hyphens; captain is reserved.",
			"settings.profiles.duplicateName": "That profile name already exists.",
			"settings.profiles.restore": "Restore built-in",
			"settings.profiles.unsaved": "Unsaved changes",
			"settings.profiles.save": "Save profile",
			"settings.profiles.saving": "Saving profile…",
			"settings.profiles.empty": "No profiles are available.",
			"settings.profiles.description": "Description",
			"settings.profiles.protocol": "Collaboration protocol",
			"settings.profiles.executionPrompt": "Execution prompt",
			"settings.profiles.taskPlanning": "Task planning",
			"settings.profiles.captain": "Captain planning",
			"settings.profiles.captainHelp": "The captain derives tasks from the current goal (recommended).",
			"settings.profiles.seed": "Fixed task template",
			"settings.profiles.seedHelp": "Use the preconfigured tasks, assignees, and dependency graph below.",
			"settings.profiles.captainTasksHint": "Captain planning is active; switch to a fixed task template to edit seed tasks.",
			"settings.profiles.members": "Members",
			"settings.profiles.member": "Member {index}",
			"settings.profiles.memberName": "Member name",
			"settings.profiles.memberRole": "Role",
			"settings.profiles.memberProvider": "Provider",
			"settings.profiles.memberModel": "Model",
			"settings.profiles.followCaptain": "Follow captain",
			"settings.profiles.chooseModel": "Choose a model",
			"settings.profiles.defaultValue": "Default value",
			"settings.profiles.reasoning.title": "Reasoning policy",
			"settings.profiles.reasoning.target-default.label": "Target default",
			"settings.profiles.reasoning.route-aware.label": "Route-aware",
			"settings.profiles.reasoning.explicit.label": "Explicit",
			"settings.profiles.reasoning.effort": "Reasoning effort",
			"settings.profiles.reasoning.noEfforts": "The current model exposes no selectable reasoning efforts",
			"settings.profiles.explicitCatalogRequired": "Wait for the shared model catalog, then choose a complete provider, model, and reasoning effort for every explicit role.",
			"settings.profiles.fallbackCatalogRequired": "Wait for the shared model catalog, then choose a complete catalog Provider and model for every new or changed fallback route.",
			"settings.profiles.memberPrompt": "Member execution prompt",
			"settings.profiles.memberFallback": "Member fallback route",
			"settings.profiles.profileFallback": "Profile fallback route",
			"settings.profiles.fallbackProvider": "Fallback provider",
			"settings.profiles.fallbackModel": "Fallback model",
			"settings.profiles.noFallback": "No fallback route",
			"settings.profiles.unavailable": "{value} (currently unavailable)",
			"settings.profiles.addMember": "Add member",
			"settings.profiles.remove": "Remove",
			"settings.profiles.tasks": "Task template",
			"settings.profiles.newTask": "New task",
			"settings.profiles.taskId": "Task ID",
			"settings.profiles.taskSubject": "Task subject",
			"settings.profiles.taskDescription": "Task description",
			"settings.profiles.taskAssignee": "Assignee",
			"settings.profiles.chooseAssignee": "Choose an assignee",
			"settings.profiles.taskDependencies": "Dependency task IDs",
			"settings.profiles.commaSeparated": "Comma-separated",
			"settings.profiles.addTask": "Add task",
			"settings.profiles.reviewPolicy": "Review policy",
			"settings.profiles.requirementsMinRounds": "Minimum requirements rounds",
			"settings.profiles.requirementsMaxRounds": "Maximum requirements rounds",
			"settings.profiles.codeMaxRounds": "Maximum code rounds",
			"settings.profiles.maxRepairAttempts": "Maximum repair attempts",
			"settings.profiles.requiredReviewers": "Required reviewers"
		};
		//#endregion
		//#region lib/client/session-navigation.js
		/** Addressed navigation into durable AgentTeams member transcripts. */
		/**
		* Open one member's persisted transcript.
		*
		* Harness rc.8 intentionally removed cold subagents from the ordinary session
		* list. They must first be rediscovered in their parent's catalog, then opened
		* with the exact parent/child/mode address. There is intentionally no
		* ordinary-session fallback: opening a different session can silently detach
		* the user from the requested member transcript.
		*/
		async function openAgentTeamMember(sessions, parentSessionId, childSessionId) {
			if (sessions.openSubagent === void 0 || sessions.refreshSubagents === void 0) return void 0;
			await sessions.refreshSubagents(parentSessionId);
			const retained = sessions.subagentAddress?.(childSessionId);
			if (retained?.mode === "one-shot") return void 0;
			const address = retained?.parentSessionId === parentSessionId ? retained : {
				parentSessionId,
				childSessionId,
				mode: "continuable"
			};
			if (address.mode !== "continuable") return void 0;
			sessions.openSubagent(address);
			return "subagent";
		}
		//#endregion
		//#region lib/client/index.js
		/** Required services: conversation nodes, slots, sessions navigation, and locale. */
		const inject = [
			"uiConversation",
			"slots",
			"sessions",
			"locale",
			"modelDirectories",
			"settingsScope",
			"remote",
			"remote.settings"
		];
		/** The replayed user message is the canonical transcript entry. */
		function HiddenAgentTeamsCommand() {
			return null;
		}
		/**
		* Register the activity monitor in the shell's additive overlay and the
		* in-conversation team card. The card's activity button re-opens a folded
		* monitor via a window event.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(AGENT_TEAMS_LOCALE_NAMESPACE, {
				zh,
				en
			}), "agent-teams: dictionaries");
			const settings = ctx.settingsScope.bind({ namespace: "agent-teams" });
			const settingsDescribe = ctx.settingsScope.describe();
			const writer = createAgentTeamsSettingsWriter({
				api: { settings: ctx.remote.settings },
				scope: settings,
				describe: settingsDescribe
			});
			const t = ctx.locale.bind(AGENT_TEAMS_LOCALE_NAMESPACE);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "agent-teams",
				order: 30,
				locale: AGENT_TEAMS_LOCALE_NAMESPACE,
				label: () => t("settings.title"),
				inject: () => ({
					settings,
					writer
				})
			}, AgentTeamsSettingsSection));
			const openMember = (parentId, childId) => {
				openAgentTeamMember(ctx.sessions, parentId, childId).catch((error) => {
					console.warn(`agent-teams: failed to open member transcript ${childId}: ${String(error)}`);
				});
			};
			const Panel = ({ t }) => (0, react_jsx_runtime.jsx)(ActivityPanel, {
				sessionsList: ctx.sessions.list,
				modelDirectories: ctx.modelDirectories,
				openMember,
				t
			});
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "agent-teams-activity",
				order: 80,
				label: "AgentTeams activity",
				locale: AGENT_TEAMS_LOCALE_NAMESPACE
			}, Panel));
			ctx.slots.inject("conversation.chat.commandview", () => ctx.slots.register({
				name: "conversation.chat.commandview",
				key: "agent-teams"
			}, HiddenAgentTeamsCommand));
			ctx.uiConversation.events.register(agentTeamsCardDefinition);
			ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
				name: "conversation.chat.node",
				key: "agent-teams",
				locale: AGENT_TEAMS_LOCALE_NAMESPACE,
				inject: () => ({ openMember })
			}, AgentTeamsCard));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
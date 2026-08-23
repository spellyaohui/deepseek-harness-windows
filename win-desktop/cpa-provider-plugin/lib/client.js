window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-cpa-provider",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region lib/address.js
		/** Normalize one CPA endpoint to the OpenAI-compatible `/v1` API root. */
		function normalizeCpaBaseURL(raw) {
			const input = raw.trim();
			if (input === "") throw new Error("CPA API address is required");
			let url;
			try {
				url = new URL(input);
			} catch {
				throw new Error("CPA API address must be a valid URL");
			}
			if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("CPA API address must use http or https");
			if (url.username !== "" || url.password !== "") throw new Error("CPA API address must not contain embedded credentials");
			if (url.search !== "") throw new Error("CPA API address must not contain a query string");
			if (url.hash !== "") throw new Error("CPA API address must not contain a fragment");
			const trimmedPath = url.pathname.replace(/\/+$/, "");
			url.pathname = /\/v1$/i.test(trimmedPath) ? trimmedPath : `${trimmedPath}/v1`;
			return url.toString().replace(/\/$/, "");
		}
		//#endregion
		//#region lib/reasoning.js
		const FULL_REASONING_EFFORTS = Object.freeze({
			off: "none",
			minimal: "minimal",
			low: "low",
			medium: "medium",
			high: "high",
			xhigh: "xhigh",
			max: "max"
		});
		const GPT_5_6_REASONING_EFFORTS = Object.freeze({
			off: "none",
			low: "low",
			medium: "medium",
			high: "high",
			xhigh: "xhigh",
			max: "max"
		});
		const GPT_5_6_FAMILY = /(?:^|[\/:_.-])gpt-5\.6(?:$|[\/:_.-])/i;
		/** Return the ordered Harness-id to CPA-wire effort map for one exact model id. */
		function reasoningEffortsForModel(modelId) {
			return GPT_5_6_FAMILY.test(modelId) ? GPT_5_6_REASONING_EFFORTS : FULL_REASONING_EFFORTS;
		}
		//#endregion
		//#region lib/profile.js
		/** Merge a fresh listing with configured rows the endpoint temporarily omitted. */
		function mergeCpaCandidates(configured, discovered) {
			const merged = /* @__PURE__ */ new Map();
			for (const candidate of discovered) {
				const id = candidate.id.trim();
				if (id !== "" && !merged.has(id)) merged.set(id, {
					...candidate,
					id
				});
			}
			for (const candidate of configured) {
				const id = candidate.id.trim();
				if (id !== "" && !merged.has(id)) merged.set(id, {
					...candidate,
					id
				});
			}
			return [...merged.values()];
		}
		/** Convert selected discovery candidates to the exact pi-ai model profile. */
		function buildCpaModels(candidates) {
			const seen = /* @__PURE__ */ new Set();
			const models = [];
			for (const candidate of candidates) {
				if (candidate.selected === false) continue;
				const id = candidate.id.trim();
				if (id === "" || seen.has(id)) continue;
				seen.add(id);
				const name = candidate.name?.trim() || id;
				models.push({
					id,
					name,
					...candidate.contextWindow === void 0 ? {} : { contextWindow: candidate.contextWindow },
					...candidate.maxTokens === void 0 ? {} : { maxTokens: candidate.maxTokens },
					reasoningEfforts: reasoningEffortsForModel(id)
				});
			}
			if (models.length === 0) throw new Error("Select at least one model");
			return models;
		}
		/** Assemble the stable redacted CPA provider route. */
		function buildCpaProfile(draft) {
			return {
				displayName: "CPA / CLIProxyAPI",
				apiKeyEnv: "CPA_API_KEY",
				api: "openai-responses",
				baseURL: normalizeCpaBaseURL(draft.baseURL),
				models: buildCpaModels(draft.models)
			};
		}
		//#endregion
		//#region lib/client/controller.js
		const SETTINGS_NAMESPACE = "llm-pi-ai";
		const PROVIDER = "cpa";
		const CREDENTIAL_REF = "CPA_API_KEY";
		function messageOf(error) {
			return error instanceof Error ? error.message : String(error);
		}
		async function within(promise, timeoutMs, setTimeoutFn, clearTimeoutFn) {
			let timer;
			try {
				return await Promise.race([promise, new Promise((_resolve, reject) => {
					timer = setTimeoutFn(() => {
						reject(/* @__PURE__ */ new Error(`CPA model discovery timed out after ${timeoutMs}ms`));
					}, timeoutMs);
				})]);
			} finally {
				if (timer !== void 0) clearTimeoutFn(timer);
			}
		}
		/** Create one card-scoped controller. A credential retry retains profile commit state. */
		function createCpaController(api, options = {}) {
			const timeoutMs = options.timeoutMs ?? 1e4;
			const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
			const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
			let profileCommitted = false;
			return {
				async discover(draft) {
					const baseURL = normalizeCpaBaseURL(draft.baseURL);
					const apiKey = draft.token.trim();
					const response = await within(api.llm.discoverModels({
						settingsNs: SETTINGS_NAMESPACE,
						provider: PROVIDER,
						api: "openai-responses",
						baseURL,
						...apiKey === "" ? {} : { apiKey }
					}), timeoutMs, setTimeoutFn, clearTimeoutFn);
					if (!response.result.ok) throw new Error(response.result.error.message);
					const seen = /* @__PURE__ */ new Set();
					const models = [];
					for (const candidate of response.result.value.models) {
						const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
						if (id === "" || seen.has(id)) continue;
						seen.add(id);
						models.push({
							id,
							name: typeof candidate.name === "string" && candidate.name.trim() !== "" ? candidate.name.trim() : id,
							...candidate.contextWindow === void 0 ? {} : { contextWindow: candidate.contextWindow },
							...candidate.maxTokens === void 0 ? {} : { maxTokens: candidate.maxTokens },
							selected: true
						});
					}
					if (models.length === 0) throw new Error("CPA returned no usable models");
					return models;
				},
				async save(draft, expectedRevision, onStage = () => {}) {
					if (!profileCommitted) {
						onStage("profile");
						try {
							const response = await api.settings.mutate({
								ns: SETTINGS_NAMESPACE,
								expectedRevision,
								ops: [{
									op: "set",
									path: ["providers", PROVIDER],
									value: buildCpaProfile(draft)
								}]
							});
							if (!response.result.ok) return {
								ok: false,
								stage: "profile",
								message: response.result.error.message
							};
							profileCommitted = true;
						} catch (error) {
							return {
								ok: false,
								stage: "profile",
								message: messageOf(error)
							};
						}
					}
					const value = draft.token.trim();
					if (value !== "") {
						onStage("credential");
						try {
							const response = await api.credentials.set({
								ref: CREDENTIAL_REF,
								value
							});
							if (!response.result.ok) return {
								ok: false,
								stage: "credential",
								message: response.result.error.message
							};
						} catch (error) {
							return {
								ok: false,
								stage: "credential",
								message: messageOf(error)
							};
						}
					}
					profileCommitted = false;
					return { ok: true };
				}
			};
		}
		//#endregion
		//#region lib/client/view-model.js
		function recordOf(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
		}
		function numberOf(value) {
			return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : void 0;
		}
		function readModels(value) {
			if (!Array.isArray(value)) return [];
			const models = [];
			for (const candidate of value) {
				const row = recordOf(candidate);
				const id = typeof row?.["id"] === "string" ? row["id"].trim() : "";
				if (id === "") continue;
				const name = typeof row?.["name"] === "string" && row["name"].trim() !== "" ? row["name"].trim() : id;
				const contextWindow = numberOf(row?.["contextWindow"]);
				const maxTokens = numberOf(row?.["maxTokens"]);
				models.push({
					id,
					name,
					...contextWindow === void 0 ? {} : { contextWindow },
					...maxTokens === void 0 ? {} : { maxTokens },
					selected: true
				});
			}
			return models;
		}
		/** Project the redacted shared Models snapshot into CPA card state. */
		function cpaSettingsView(state) {
			const namespace = state.namespaces.get("llm-pi-ai");
			const profile = recordOf(recordOf(recordOf(namespace?.value)?.["providers"])?.["cpa"]);
			const row = state.rows.find((candidate) => candidate.entry.provider === "cpa");
			return {
				status: state.status,
				writable: state.writable,
				revision: namespace?.revision,
				baseURL: typeof profile?.["baseURL"] === "string" ? profile["baseURL"] : "",
				models: readModels(profile?.["models"]),
				credentialConfigured: row?.credential?.configured === true
			};
		}
		//#endregion
		//#region \0dsh-css:src/client/CpaProviderCard.module.css.mjs
		const css = ".VTWtTW_card{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);border-radius:12px;flex-direction:column;gap:12px;margin-top:12px;padding:14px;display:flex}.VTWtTW_header,.VTWtTW_modelHeader,.VTWtTW_footer{align-items:center;gap:12px;display:flex}.VTWtTW_header>:first-child,.VTWtTW_validation{flex:1;min-width:0}.VTWtTW_title{margin:0;font-size:14px;font-weight:500;line-height:22px}.VTWtTW_intro,.VTWtTW_help,.VTWtTW_empty,.VTWtTW_notice,.VTWtTW_status,.VTWtTW_validation{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:18px}.VTWtTW_notice,.VTWtTW_validation{color:var(--dsw-alias-state-warn-label)}.VTWtTW_status{color:var(--dsw-alias-state-success-primary)}.VTWtTW_error{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;line-height:18px}.VTWtTW_credential{color:var(--dsw-alias-label-secondary);flex:none;align-items:center;gap:6px;font-size:12px;display:inline-flex}.VTWtTW_dotReady,.VTWtTW_dotMissing{border-radius:50%;width:8px;height:8px}.VTWtTW_dotReady{background:var(--dsw-alias-state-success-primary)}.VTWtTW_dotMissing{background:var(--dsw-alias-state-error-primary)}.VTWtTW_fields{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;display:grid}.VTWtTW_field{min-width:0;color:var(--dsw-alias-label-secondary);flex-direction:column;gap:6px;font-size:12px;line-height:18px;display:flex}.VTWtTW_input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:100%;height:36px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;outline:none;padding:0 12px}.VTWtTW_input:focus-visible{border-color:var(--dsw-alias-interactive-border-focus);box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}.VTWtTW_modelHeader{justify-content:space-between}.VTWtTW_modelHeader>span{font-size:13px;font-weight:500}.VTWtTW_actions{align-items:center;gap:8px;display:inline-flex}.VTWtTW_linkButton{color:var(--dsw-alias-label-tertiary);font:inherit;cursor:pointer;background:0 0;border:0;padding:0;font-size:12px}.VTWtTW_linkButton:disabled,.VTWtTW_primaryButton:disabled{opacity:.4;cursor:default}.VTWtTW_linkButton:focus-visible,.VTWtTW_primaryButton:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3);outline:none}.VTWtTW_models{flex-direction:column;gap:4px;max-height:220px;margin:0;padding:0;list-style:none;display:flex;overflow:auto}.VTWtTW_model{border-radius:6px;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;min-height:32px;padding:0 8px;font-size:13px;display:grid}.VTWtTW_model:hover{background:var(--dsw-alias-interactive-bg-hover)}.VTWtTW_model code{color:var(--dsw-alias-label-tertiary);font-size:11px}.VTWtTW_primaryButton{box-sizing:border-box;background:var(--dsw-alias-button-primary-fill);height:36px;color:var(--dsw-alias-label-primary-foreground);font:inherit;cursor:pointer;border:0;border-radius:18px;padding:0 14px}.VTWtTW_primaryButton:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}.VTWtTW_footer{justify-content:flex-end}@media (width<=640px){.VTWtTW_header,.VTWtTW_modelHeader,.VTWtTW_footer{flex-direction:column;align-items:stretch}.VTWtTW_fields{grid-template-columns:minmax(0,1fr)}.VTWtTW_credential{align-self:flex-start}.VTWtTW_actions{flex-wrap:wrap}.VTWtTW_primaryButton{width:100%}.VTWtTW_model{grid-template-columns:auto minmax(0,1fr)}.VTWtTW_model code{grid-column:2}}";
		const tagId = "@deepseek-ai/dsh-cpa-provider/CpaProviderCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-cpa-provider";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var CpaProviderCard_module_css_default = {
			"actions": "VTWtTW_actions",
			"card": "VTWtTW_card",
			"credential": "VTWtTW_credential",
			"dotMissing": "VTWtTW_dotMissing",
			"dotReady": "VTWtTW_dotReady",
			"empty": "VTWtTW_empty",
			"error": "VTWtTW_error",
			"field": "VTWtTW_field",
			"fields": "VTWtTW_fields",
			"footer": "VTWtTW_footer",
			"header": "VTWtTW_header",
			"help": "VTWtTW_help",
			"input": "VTWtTW_input",
			"intro": "VTWtTW_intro",
			"linkButton": "VTWtTW_linkButton",
			"model": "VTWtTW_model",
			"modelHeader": "VTWtTW_modelHeader",
			"models": "VTWtTW_models",
			"notice": "VTWtTW_notice",
			"primaryButton": "VTWtTW_primaryButton",
			"status": "VTWtTW_status",
			"title": "VTWtTW_title",
			"validation": "VTWtTW_validation"
		};
		//#endregion
		//#region lib/client/CpaProviderCard.js
		function CpaProviderCard(props) {
			const { api, controller, useSnapshot, cpaT, cardName } = props;
			const view = cpaSettingsView(useSnapshot((state) => state));
			const cpa = (0, react.useMemo)(() => createCpaController(api), [api]);
			const initialized = (0, react.useRef)(false);
			const [baseURL, setBaseURL] = (0, react.useState)("");
			const [token, setToken] = (0, react.useState)("");
			const [models, setModels] = (0, react.useState)([]);
			const [operation, setOperation] = (0, react.useState)({ kind: "idle" });
			const [profileLocked, setProfileLocked] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (initialized.current || view.status !== "ready") return;
				initialized.current = true;
				setBaseURL(view.baseURL);
				setModels(view.models);
			}, [view]);
			const busy = operation.kind === "discovering" || operation.kind === "saving-profile" || operation.kind === "saving-credential";
			const selectedCount = models.filter((model) => model.selected !== false).length;
			const tokenAvailable = token.trim() !== "" || view.credentialConfigured;
			const editable = view.writable && !busy;
			const canDiscover = editable && !profileLocked && baseURL.trim() !== "" && tokenAvailable;
			const canApply = editable && baseURL.trim() !== "" && tokenAvailable && selectedCount > 0;
			const discover = async () => {
				setOperation({ kind: "discovering" });
				try {
					const found = await cpa.discover({
						baseURL,
						token
					});
					setModels((current) => mergeCpaCandidates(current, found));
					setOperation({ kind: "idle" });
				} catch (error) {
					setOperation({
						kind: "error",
						stage: "discovery",
						message: error instanceof Error ? error.message : String(error)
					});
				}
			};
			const save = async () => {
				if (view.revision === void 0) return;
				const result = await cpa.save({
					baseURL,
					token,
					models
				}, view.revision, (stage) => {
					setOperation({ kind: stage === "profile" ? "saving-profile" : "saving-credential" });
				});
				if (!result.ok) {
					if (result.stage === "credential") setProfileLocked(true);
					setOperation({
						kind: "error",
						stage: result.stage,
						message: result.message
					});
					return;
				}
				setProfileLocked(false);
				setToken("");
				setOperation({ kind: "saved" });
				await controller.load();
			};
			const toggleModel = (id) => {
				setModels((current) => current.map((model) => model.id === id ? {
					...model,
					selected: model.selected === false
				} : model));
			};
			if (view.status === "idle" || view.status === "loading") return (0, react_jsx_runtime.jsx)("section", {
				className: CpaProviderCard_module_css_default["card"],
				children: (0, react_jsx_runtime.jsx)("p", {
					role: "status",
					children: cpaT("loading")
				})
			});
			if (view.status === "error" || view.revision === void 0) return (0, react_jsx_runtime.jsx)("section", {
				className: CpaProviderCard_module_css_default["card"],
				children: (0, react_jsx_runtime.jsx)("p", {
					role: "alert",
					children: cpaT("unavailable")
				})
			});
			const validation = baseURL.trim() === "" ? cpaT("addressRequired") : !tokenAvailable ? cpaT("tokenRequired") : selectedCount === 0 ? cpaT("modelRequired") : void 0;
			const operationText = operation.kind === "discovering" ? cpaT("fetchingModels") : operation.kind === "saving-profile" ? cpaT("savingProfile") : operation.kind === "saving-credential" ? cpaT("savingCredential") : operation.kind === "saved" ? cpaT("saved") : void 0;
			return (0, react_jsx_runtime.jsxs)("section", {
				className: CpaProviderCard_module_css_default["card"],
				"aria-busy": busy,
				"aria-labelledby": "cpa-provider-title",
				children: [
					(0, react_jsx_runtime.jsxs)("header", {
						className: CpaProviderCard_module_css_default["header"],
						children: [(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("h3", {
							id: "cpa-provider-title",
							className: CpaProviderCard_module_css_default["title"],
							children: cardName
						}), (0, react_jsx_runtime.jsx)("p", {
							className: CpaProviderCard_module_css_default["intro"],
							children: cpaT("intro")
						})] }), (0, react_jsx_runtime.jsxs)("span", {
							className: CpaProviderCard_module_css_default["credential"],
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: view.credentialConfigured ? CpaProviderCard_module_css_default["dotReady"] : CpaProviderCard_module_css_default["dotMissing"],
								"aria-hidden": "true"
							}), cpaT(view.credentialConfigured ? "credentialConfigured" : "credentialMissing")]
						})]
					}),
					!view.writable ? (0, react_jsx_runtime.jsx)("p", {
						className: CpaProviderCard_module_css_default["notice"],
						children: cpaT("readOnly")
					}) : null,
					(0, react_jsx_runtime.jsxs)("div", {
						className: CpaProviderCard_module_css_default["fields"],
						children: [(0, react_jsx_runtime.jsxs)("label", {
							className: CpaProviderCard_module_css_default["field"],
							htmlFor: "cpa-base-url",
							children: [(0, react_jsx_runtime.jsx)("span", { children: cpaT("apiAddress") }), (0, react_jsx_runtime.jsx)("input", {
								id: "cpa-base-url",
								className: CpaProviderCard_module_css_default["input"],
								value: baseURL,
								placeholder: cpaT("apiPlaceholder"),
								disabled: !editable || profileLocked,
								onChange: (event) => {
									setBaseURL(event.currentTarget.value);
								}
							})]
						}), (0, react_jsx_runtime.jsxs)("label", {
							className: CpaProviderCard_module_css_default["field"],
							htmlFor: "cpa-token",
							children: [(0, react_jsx_runtime.jsx)("span", { children: cpaT("token") }), (0, react_jsx_runtime.jsx)("input", {
								id: "cpa-token",
								className: CpaProviderCard_module_css_default["input"],
								type: "password",
								autoComplete: "off",
								value: token,
								placeholder: cpaT("tokenPlaceholder"),
								disabled: !editable,
								onChange: (event) => {
									setToken(event.currentTarget.value);
								}
							})]
						})]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: CpaProviderCard_module_css_default["modelHeader"],
						children: [(0, react_jsx_runtime.jsx)("span", { children: cpaT("models") }), (0, react_jsx_runtime.jsxs)("div", {
							className: CpaProviderCard_module_css_default["actions"],
							children: [
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: CpaProviderCard_module_css_default["linkButton"],
									disabled: !canDiscover,
									onClick: () => {
										discover();
									},
									children: operation.kind === "discovering" ? cpaT("fetchingModels") : cpaT("fetchModels")
								}),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: CpaProviderCard_module_css_default["linkButton"],
									disabled: !editable || profileLocked || models.length === 0,
									onClick: () => {
										setModels((current) => current.map((model) => ({
											...model,
											selected: true
										})));
									},
									children: cpaT("selectAll")
								}),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: CpaProviderCard_module_css_default["linkButton"],
									disabled: !editable || profileLocked || models.length === 0,
									onClick: () => {
										setModels((current) => current.map((model) => ({
											...model,
											selected: false
										})));
									},
									children: cpaT("clearAll")
								})
							]
						})]
					}),
					models.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
						className: CpaProviderCard_module_css_default["empty"],
						children: cpaT("emptyModels")
					}) : (0, react_jsx_runtime.jsx)("ul", {
						className: CpaProviderCard_module_css_default["models"],
						children: models.map((model) => (0, react_jsx_runtime.jsx)("li", { children: (0, react_jsx_runtime.jsxs)("label", {
							className: CpaProviderCard_module_css_default["model"],
							children: [
								(0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: model.selected !== false,
									disabled: !editable || profileLocked,
									onChange: () => {
										toggleModel(model.id);
									}
								}),
								(0, react_jsx_runtime.jsx)("span", { children: model.name || model.id }),
								(0, react_jsx_runtime.jsx)("code", { children: model.id })
							]
						}) }, model.id))
					}),
					(0, react_jsx_runtime.jsx)("p", {
						className: CpaProviderCard_module_css_default["help"],
						children: cpaT("reasoningHelp")
					}),
					operation.kind === "error" ? (0, react_jsx_runtime.jsx)("p", {
						className: CpaProviderCard_module_css_default["error"],
						role: "alert",
						children: operation.message
					}) : null,
					operationText === void 0 ? null : (0, react_jsx_runtime.jsx)("p", {
						className: CpaProviderCard_module_css_default["status"],
						role: "status",
						"aria-live": "polite",
						children: operationText
					}),
					(0, react_jsx_runtime.jsxs)("footer", {
						className: CpaProviderCard_module_css_default["footer"],
						children: [validation === void 0 ? null : (0, react_jsx_runtime.jsx)("span", {
							className: CpaProviderCard_module_css_default["validation"],
							children: validation
						}), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: CpaProviderCard_module_css_default["primaryButton"],
							disabled: !canApply,
							onClick: () => {
								save();
							},
							children: operation.kind === "error" ? cpaT("retry") : cpaT("apply")
						})]
					})
				]
			});
		}
		//#endregion
		//#region lib/client/locales.js
		const zh = {
			title: "CPA / CLIProxyAPI",
			intro: "连接 CLIProxyAPI，使用 OpenAI Responses 协议，并把模型共享给主会话和子智能体。",
			apiAddress: "API 地址",
			apiPlaceholder: "http://127.0.0.1:8317 或 .../v1",
			token: "Token",
			tokenPlaceholder: "已配置时留空可保留现有 Token",
			credentialConfigured: "Token 已配置",
			credentialMissing: "尚未配置 Token",
			fetchModels: "获取模型",
			fetchingModels: "正在获取模型…",
			models: "模型",
			selectAll: "全选",
			clearAll: "清空",
			emptyModels: "输入地址和 Token 后获取模型。",
			apply: "应用",
			savingProfile: "正在保存 CPA 设置…",
			savingCredential: "正在保存 Token…",
			saved: "CPA 设置已保存。",
			retry: "重试",
			readOnly: "当前连接为只读，无法修改 CPA 设置。",
			loading: "正在读取 CPA 设置…",
			unavailable: "Harness 模型设置服务不可用。",
			addressRequired: "请输入 API 地址。",
			tokenRequired: "首次配置需要输入 Token。",
			modelRequired: "至少选择一个模型。",
			reasoningHelp: "思考强度使用英文 R 档位；GPT-5.6 显示 none、low、medium、high、xhigh、max。"
		};
		const en = {
			title: "CPA / CLIProxyAPI",
			intro: "Connect CLIProxyAPI over OpenAI Responses and share its models with main sessions and subagents.",
			apiAddress: "API address",
			apiPlaceholder: "http://127.0.0.1:8317 or .../v1",
			token: "Token",
			tokenPlaceholder: "Leave blank to keep the configured Token",
			credentialConfigured: "Token configured",
			credentialMissing: "Token not configured",
			fetchModels: "Fetch models",
			fetchingModels: "Fetching models…",
			models: "Models",
			selectAll: "Select all",
			clearAll: "Clear all",
			emptyModels: "Enter an address and Token, then fetch models.",
			apply: "Apply",
			savingProfile: "Saving CPA settings…",
			savingCredential: "Saving Token…",
			saved: "CPA settings saved.",
			retry: "Retry",
			readOnly: "This connection is read-only; CPA settings cannot be changed.",
			loading: "Loading CPA settings…",
			unavailable: "Harness model settings are unavailable.",
			addressRequired: "Enter the API address.",
			tokenRequired: "A Token is required for initial setup.",
			modelRequired: "Select at least one model.",
			reasoningHelp: "Reasoning uses English R levels; GPT-5.6 offers none, low, medium, high, xhigh, and max."
		};
		//#endregion
		//#region lib/client/index.js
		const NS = "settings.cpa";
		const CARD_NAME = "CPA / CLIProxyAPI";
		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "cpa-provider: locale");
			const cpaT = ctx.locale.bind(NS);
			ctx.slots.inject("settings.models.card", () => ctx.slots.register({
				name: "settings.models.card",
				id: "cpa",
				order: -100,
				inject: () => ({
					cpaT,
					cardName: CARD_NAME
				})
			}, CpaProviderCard));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
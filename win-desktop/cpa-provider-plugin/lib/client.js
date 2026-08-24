window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-cpa-provider",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
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
		const CPA_INPUT_MODALITIES = ["text", "image"];
		/**
		* Normalize a CPA profile edited through Harness's native provider editor.
		* Provider-specific facts stay here so the generic Models fork remains
		* provider-neutral. Unknown fields and raw capacity numbers are preserved.
		*/
		function normalizeCpaProviderProfile(value) {
			const baseURL = value["baseURL"];
			if (typeof baseURL !== "string") throw new Error("CPA API address is required");
			const rawModels = value["models"];
			if (!Array.isArray(rawModels)) throw new Error("Select at least one model");
			const models = rawModels.map((rawModel) => {
				if (typeof rawModel !== "object" || rawModel === null || Array.isArray(rawModel)) return rawModel;
				const model = rawModel;
				const id = typeof model["id"] === "string" ? model["id"].trim() : "";
				if (id === "") return model;
				const input = Array.isArray(model["input"]) && model["input"].length > 0 ? model["input"] : [...CPA_INPUT_MODALITIES];
				return {
					...model,
					id,
					input,
					reasoningEfforts: reasoningEffortsForModel(id)
				};
			});
			return {
				...value,
				displayName: "CPA / CLIProxyAPI",
				apiKeyEnv: "CPA_API_KEY",
				api: "openai-responses",
				baseURL: normalizeCpaBaseURL(baseURL),
				defaultInput: [...CPA_INPUT_MODALITIES],
				models
			};
		}
		//#endregion
		//#region lib/client/index.js
		function apply(ctx) {
			ctx.on("settings.models/normalize-provider-profile", (payload, next) => {
				if (payload.provider !== "cpa") return next();
				try {
					payload.value = normalizeCpaProviderProfile(payload.value);
					return next();
				} catch (error) {
					payload.failure = error instanceof Error ? error.message : String(error);
					return payload;
				}
			});
		}
		//#endregion
		exports.apply = apply;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "cpa-provider";
/** CPA delegates all model traffic to the existing llm-pi-ai adapter. */
export declare function apply(ctx: Context): void;

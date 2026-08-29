export type ModelInputDraft = Readonly<Record<string, unknown>>;
export type ImageInputChoice = 'auto' | 'image' | 'text-only';
export type ImageInputState = ImageInputChoice | 'invalid';
export declare function readImageInputChoice(model: ModelInputDraft): ImageInputState;
export declare function applyImageInputChoice(model: ModelInputDraft, choice: ImageInputChoice): Record<string, unknown>;
export declare function applyImageInputChoiceToAll(models: readonly ModelInputDraft[], choice: ImageInputChoice): Record<string, unknown>[];

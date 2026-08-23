export type CpaReasoningKey = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type CpaReasoningWire = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type CpaReasoningEfforts = Readonly<Partial<Record<CpaReasoningKey, CpaReasoningWire>>>;

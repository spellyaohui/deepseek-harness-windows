type UnknownRecord = Record<string, unknown>;
export interface SettingsDescriptorLike {
    ns: string;
    revision: number;
    user?: unknown;
}
export interface CpaProfileMigration {
    expectedRevision: number;
    ops: readonly [
        {
            op: 'set';
            path: readonly ['providers', 'cpa'];
            value: UnknownRecord;
        }
    ];
}
/** Build the one path-scoped write needed to upgrade a legacy persisted CPA profile. */
export declare function cpaProfileMigration(descriptor: SettingsDescriptorLike): CpaProfileMigration | undefined;
export {};

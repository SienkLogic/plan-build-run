export function getConfigDefaults(): Record<string, unknown>;

export function mergeDefaults(incoming: Record<string, unknown>): Record<string, unknown>;

export function readConfig(projectDir: string): Promise<Record<string, unknown> | null>;

export function validateConfig(config: Record<string, unknown>): void;

export function writeConfig(projectDir: string, config: object): Promise<void>;

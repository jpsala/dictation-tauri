interface AosFsStats {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
  mtimeMs: number;
}

interface AosFsDirent {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function lstatSync(path: string): AosFsStats;
  export function readdirSync(path: string): string[];
  export function readdirSync(path: string, options: { withFileTypes: true }): AosFsDirent[];
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function realpathSync(path: string): string;
  export function statSync(path: string): AosFsStats;
}

declare module "node:path" {
  export function isAbsolute(path: string): boolean;
  export function join(...paths: string[]): string;
  export function relative(from: string, to: string): string;
  export function resolve(...paths: string[]): string;
}

declare module "node:url" {
  export function pathToFileURL(path: string): { href: string };
}

declare const process: {
  cwd(): string;
  env: Record<string, string | undefined>;
  platform: string;
  exit(code?: number): never;
  exitCode?: number;
};

declare module "@earendil-works/pi-coding-agent" {
  export interface ExtensionUIContext {
    select(title: string, options: string[]): Promise<string | undefined>;
    notify(message: string, type?: "info" | "warning" | "error"): void;
    setEditorText(text: string): void;
  }

  export interface ExtensionCommandContext {
    ui: ExtensionUIContext;
    hasUI: boolean;
    cwd: string;
  }

  export interface ExtensionAPI {
    registerCommand(
      name: string,
      options: {
        description?: string;
        handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
      },
    ): void;
  }
}

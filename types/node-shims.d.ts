interface NodeFsStats {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
  mtimeMs: number;
}

interface NodeFsDirent {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function lstatSync(path: string): NodeFsStats;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined;
  export function readdirSync(path: string): string[];
  export function readdirSync(path: string, options: { withFileTypes: true }): NodeFsDirent[];
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function realpathSync(path: string): string;
  export function statSync(path: string): NodeFsStats;
  export function writeFileSync(path: string, data: string, encoding: "utf8"): void;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function isAbsolute(path: string): boolean;
  export function join(...paths: string[]): string;
  export function relative(from: string, to: string): string;
  export function resolve(...paths: string[]): string;
}

declare const process: {
  cwd(): string;
  env: Record<string, string | undefined>;
  platform: string;
  exit(code?: number): never;
  exitCode?: number;
};

declare module "@oh-my-pi/pi-coding-agent" {
  export interface ExtensionUIContext {
    notify(message: string, type?: "info" | "warning" | "error"): void;
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

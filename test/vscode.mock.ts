/**
 * Minimal vscode API mock for unit tests.
 * Only stubs the parts used by game logic.
 */

export const window = {
  showInformationMessage: (_msg: string): Thenable<string | undefined> =>
    Promise.resolve(undefined),
  showWarningMessage: (_msg: string): Thenable<string | undefined> =>
    Promise.resolve(undefined),
  showQuickPick: (_items: unknown[], _opts?: unknown): Thenable<unknown> =>
    Promise.resolve(undefined),
  showInputBox: (_opts?: unknown): Thenable<string | undefined> =>
    Promise.resolve(undefined),
};

export const workspace = {
  getConfiguration: (_section?: string) => ({
    get: <T>(_key: string, defaultValue: T): T => defaultValue,
  }),
};

export const ExtensionMode = { Production: 1, Development: 2, Test: 3 } as const;

export class Uri {
  static file(p: string) {
    return { fsPath: p, scheme: 'file', toString: () => p };
  }
}

export class RelativePattern {
  constructor(public base: unknown, public pattern: string) {}
}

export const extensions = {
  getExtension: (_id: string) => undefined,
};

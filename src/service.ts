import { AhubClient, AhubClientError, type ChangeData, type Envelope, type Tool } from '@agenteca/cli/client';

export interface ServiceConfig {
  ahubPath: string;
  tools: Tool[];
  cwd: string | undefined;
  env?: NodeJS.ProcessEnv;
  /** Arguments préfixes (tests : `node` + chemin du binaire). */
  binArgs?: string[];
}

/** Erreur à montrer telle quelle à l'utilisateur. */
export class UserError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly plan?: ChangeData,
  ) {
    super(message);
  }
}

export type ChangeKind = 'add' | 'update' | 'remove';

/** Passerelle vers la CLI : aucune logique d'installation ici. */
export class AhubService {
  constructor(private readonly config: () => ServiceConfig) {}

  private client(): AhubClient {
    const c = this.config();
    if (!c.cwd) throw new UserError('Ouvrez un dossier de projet pour utiliser Agenteca.', 'NO_WORKSPACE');
    return new AhubClient({
      bin: c.ahubPath || 'ahub',
      cwd: c.cwd,
      ...(c.env ? { env: c.env } : {}),
      ...(c.binArgs ? { binArgs: c.binArgs } : {}),
    });
  }

  private async unwrap<T>(run: (client: AhubClient) => Promise<Envelope<T>>): Promise<Envelope<T>> {
    try {
      return await run(this.client());
    } catch (e) {
      if (e instanceof AhubClientError)
        throw new UserError(`${e.message}. Réglage : « agenteca.ahubPath ».`, 'AHUB_UNAVAILABLE');
      throw e;
    }
  }

  private data<T>(env: Envelope<T>): T {
    if (!env.ok || env.data === null)
      throw new UserError(env.error?.message ?? 'Erreur inconnue', env.error?.code ?? 'INTERNAL');
    return env.data;
  }

  async version(): Promise<string> {
    return this.data(await this.unwrap((c) => c.version())).version;
  }
  async installed() {
    return this.data(await this.unwrap((c) => c.list())).packages;
  }
  async outdated() {
    return this.data(await this.unwrap((c) => c.outdated())).packages;
  }
  async search(query: string) {
    return this.data(await this.unwrap((c) => c.search(query)));
  }
  async info(pkg: string) {
    return this.data(await this.unwrap((c) => c.info(pkg, { files: true })));
  }

  private options(tools: Tool[] | undefined, overwrite: string[]) {
    const selected = tools ?? this.config().tools;
    return {
      ...(selected.length > 0 ? { tools: selected } : {}),
      ...(overwrite.length > 0 ? { overwrite } : {}),
    };
  }

  /** Calcule le plan. Rien n'est écrit. */
  async plan(
    kind: ChangeKind,
    packages: string[],
    tools?: Tool[],
    overwrite: string[] = [],
  ): Promise<ChangeData> {
    const env = await this.unwrap((c) => c.plan(kind, packages, this.options(tools, overwrite)));
    return this.data(env);
  }

  /** Applique le plan exact que l'utilisateur vient d'approuver. */
  async apply(
    kind: ChangeKind,
    packages: string[],
    planHash: string,
    tools?: Tool[],
    overwrite: string[] = [],
  ): Promise<ChangeData> {
    const env = await this.unwrap((c) => c.apply(kind, packages, planHash, this.options(tools, overwrite)));
    if (!env.ok)
      throw new UserError(
        env.error?.message ?? 'Erreur inconnue',
        env.error?.code ?? 'INTERNAL',
        env.data ?? undefined,
      );
    return env.data!;
  }
}

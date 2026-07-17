/// <reference path="../bun-runtime.d.ts" />

import type {
  MigrationDatabase,
  MigrationTransaction,
} from "./migrations";

class BunSqlMigrationTransaction implements MigrationTransaction {
  constructor(private readonly sql: Bun.SQL) {}

  async execute(query: string, parameters: readonly unknown[] = []): Promise<void> {
    await this.sql.unsafe(query, [...parameters]);
  }
}

export class BunSqlMigrationDatabase implements MigrationDatabase {
  readonly sql: Bun.SQL;

  constructor(databaseUrl: string) {
    this.sql = new Bun.SQL(databaseUrl);
  }

  async execute(query: string, parameters: readonly unknown[] = []): Promise<void> {
    await this.sql.unsafe(query, [...parameters]);
  }

  async query<T>(query: string, parameters: readonly unknown[] = []): Promise<T[]> {
    return await this.sql.unsafe(query, [...parameters]) as T[];
  }

  async transaction<T>(operation: (transaction: MigrationTransaction) => Promise<T>): Promise<T> {
    return await this.sql.begin(async (sql) => operation(new BunSqlMigrationTransaction(sql)));
  }

  async close(): Promise<void> {
    await this.sql.close();
  }
}

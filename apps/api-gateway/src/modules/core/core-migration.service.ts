import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readdir, readFile } from 'fs/promises';
import { resolve } from 'path';
import { Pool, PoolClient } from 'pg';

@Injectable()
export class CoreMigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CoreMigrationService.name);

  constructor(private readonly config: ConfigService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
      return;
    }
    const appEnv = this.config.get<string>('APP_ENV', process.env.APP_ENV ?? '');
    const autoMigrate = this.config.get<string>('CORE_AUTO_MIGRATE', process.env.CORE_AUTO_MIGRATE ?? 'false')?.toLowerCase() === 'true';
    if (appEnv !== 'development' || !autoMigrate) return;
    const databaseUrl = this.config.get<string>('DATABASE_URL');
    if (!databaseUrl) {
      this.logger.warn('DATABASE_URL is not set, skipping automatic migrations.');
      return;
    }
    await this.runMigrations(databaseUrl);
  }

  async runMigrations(databaseUrl: string): Promise<string[]> {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const appliedList: string[] = [];
    let client: PoolClient | undefined;

    try {
      client = await pool.connect();
      await client.query('SELECT pg_advisory_lock(821018016)');
      // Create migration tracking table
      await client.query(`
        CREATE TABLE IF NOT EXISTS core_migrations_log (
          id SERIAL PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      const migrationsDir = resolve(__dirname, '..', '..', '..', 'migrations');
      const files = await readdir(migrationsDir).catch(() => {
        throw new Error(`Core migrations directory is missing: ${migrationsDir}`);
      });
      const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort();
      if (sqlFiles.length === 0) throw new Error(`No Core migration files found in ${migrationsDir}`);

      for (const file of sqlFiles) {
        const check = await client.query('SELECT name FROM core_migrations_log WHERE name = $1', [file]);
        if (check.rows.length === 0) {
          const content = await readFile(resolve(migrationsDir, file), 'utf8');
          // SQL files own their transaction boundary; do not nest BEGIN/COMMIT.
          await client.query(content);
          await client.query('INSERT INTO core_migrations_log (name) VALUES ($1)', [file]);
          this.logger.log(`Successfully applied migration: ${file}`);
          appliedList.push(file);
        }
      }
      return appliedList;
    } finally {
      if (client) {
        await client.query('SELECT pg_advisory_unlock(821018016)').catch(() => undefined);
        client.release();
      }
      await pool.end();
    }
  }
}

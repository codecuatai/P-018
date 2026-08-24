import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
} as const;

async function main(): Promise<void> {
  const email = requiredEnv('LOCAL_ADMIN_EMAIL').trim().toLowerCase();
  const password = requiredEnv('LOCAL_ADMIN_PASSWORD');
  const fullName = (process.env.LOCAL_ADMIN_NAME?.trim() || 'X-One Local Admin').slice(0, 200);
  const databaseUrl = requiredEnv('DATABASE_URL');

  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('LOCAL_ADMIN_EMAIL must be a valid email.');
  if (password.length < 8 || password.length > 128) throw new Error('LOCAL_ADMIN_PASSWORD must contain 8-128 characters.');

  const now = new Date().toISOString();
  const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = await client.query<{ id: string }>(
      `INSERT INTO users (id,email,email_normalized,full_name,role,status,created_at,updated_at)
       VALUES ($1,$2,$2,$3,'admin','active',$4,$4)
       ON CONFLICT (email_normalized) DO UPDATE
       SET full_name=EXCLUDED.full_name, role='admin', status='active', updated_at=EXCLUDED.updated_at
       RETURNING id`,
      [randomUUID(), email, fullName, now],
    );
    const userId = user.rows[0]?.id;
    if (!userId) throw new Error('Could not provision the local admin account.');
    await client.query(
      `INSERT INTO user_credentials (user_id,password_hash,password_changed_at,created_at,updated_at)
       VALUES ($1,$2,$3,$3,$3)
       ON CONFLICT (user_id) DO UPDATE
       SET password_hash=EXCLUDED.password_hash, password_changed_at=EXCLUDED.password_changed_at, updated_at=EXCLUDED.updated_at`,
      [userId, passwordHash, now],
    );
    await client.query('COMMIT');
    process.stdout.write(`Local admin provisioned: ${email}\n`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`${name} is required.`);
  return value;
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Local admin provisioning failed.'}\n`);
  process.exitCode = 1;
});

const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function runMigrations() {
    const client = await pool.connect();
    try {
        console.log('[Migration] Checking database connection...');
        await client.query('SELECT 1');

        console.log('[Migration] Ensuring schema_migrations tracking table exists...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        const migrationsDir = path.join(__dirname, 'migrations');
        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.sql'))
            .sort();

        const { rows } = await client.query('SELECT name FROM schema_migrations');
        const appliedMigrations = new Set(rows.map(r => r.name));

        let appliedCount = 0;
        for (const file of files) {
            if (appliedMigrations.has(file)) {
                console.log(`[Migration] ✓ Skipping already applied: ${file}`);
                continue;
            }

            console.log(`[Migration] ⚙ Executing: ${file}...`);
            const filePath = path.join(migrationsDir, file);
            const sql = fs.readFileSync(filePath, 'utf-8');

            await client.query('BEGIN');
            try {
                await client.query(sql);
                await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
                await client.query('COMMIT');
                console.log(`[Migration] ✓ Applied successfully: ${file}`);
                appliedCount++;
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`[Migration] ✗ Failed executing ${file}:`, err.message);
                throw err;
            }
        }

        console.log(`[Migration] Complete. ${appliedCount} new migration(s) applied.`);
    } finally {
        client.release();
    }
}

if (require.main === module) {
    runMigrations()
        .then(() => {
            console.log('[Migration] Finished successfully.');
            process.exit(0);
        })
        .catch((err) => {
            console.error('[Migration Error]:', err);
            process.exit(1);
        });
}

module.exports = { runMigrations };

import { Client } from 'pg';

async function main() {
  const defaultConnectionString = 'postgresql://postgres:postgres@localhost:5432/postgres';
  console.log('Connecting to PostgreSQL Default db...');
  const client = new Client({ connectionString: defaultConnectionString });
  await client.connect();
  
  try {
    console.log('Dropping travelmate database if exists...');
    // We must terminate active connections first so we can drop it
    await client.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = 'travelmate'
        AND pid <> pg_backend_pid();
    `);
    
    await client.query('DROP DATABASE IF EXISTS travelmate;');
    console.log('travelmate database dropped successfully.');
  } catch (err: any) {
    console.error('Error clean dropping database:', err.message);
  } finally {
    await client.end();
  }
}

main();

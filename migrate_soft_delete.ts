import { dbClient } from './src/logic/libs/database.js';

async function executeMigration() {
  const operations = [
    `ALTER TABLE customer ADD COLUMN is_deleted INTEGER DEFAULT 0;`,
    `ALTER TABLE suplier ADD COLUMN is_deleted INTEGER DEFAULT 0;`,
    `ALTER TABLE akun ADD COLUMN is_deleted INTEGER DEFAULT 0;`
  ];

  for (const sql of operations) {
    try {
      console.log(`Executing: ${sql}`);
      await dbClient.query(sql);
      console.log(`Success`);
    } catch (error: any) {
      if (error.message && error.message.includes('duplicate column name')) {
        console.log(`Column already exists. Skipping.`);
      } else {
        console.error(`Failed: ${error}`);
      }
    }
  }
}

executeMigration();

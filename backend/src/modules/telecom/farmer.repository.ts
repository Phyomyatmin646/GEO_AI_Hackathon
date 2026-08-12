import type { Pool } from 'pg';
import type { FarmerRegistrationInput } from './farmer.schema.js';

export class FarmerRepository {
  constructor(private readonly pool: Pool) {}

  async registerFarmer(input: FarmerRegistrationInput): Promise<any> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Insert Farmer
      const farmerResult = await client.query(
        `INSERT INTO farmers (
          username, phone_number, email, 
          region, township, village, grid_id, 
          preferred_language, 
          sms_consent, email_consent, ivr_consent
        ) VALUES (
          $1, $2, $3, 
          $4, $5, $6, $7, 
          $8, 
          $9, $10, $11
        )
        ON CONFLICT (phone_number) DO NOTHING
        RETURNING id`,
        [
          input.username,
          input.phone_number,
          input.email ?? null,
          input.location.region,
          input.location.township ?? null,
          input.location.village ?? null,
          input.location.grid_id,
          input.preferred_language,
          input.communication.sms,
          input.communication.email,
          input.communication.ivr,
        ]
      );

      if (farmerResult.rowCount === 0) {
        throw new Error('DUPLICATE_PHONE');
      }

      const farmerId = farmerResult.rows[0].id;

      // 2. Insert Main Crops
      if (input.main_crops && input.main_crops.length > 0) {
        for (const cropKey of input.main_crops) {
          await client.query(
            `INSERT INTO farmer_crops (farmer_id, crop_model_key) VALUES ($1, $2)`,
            [farmerId, cropKey]
          );
        }
      }

      // 3. Insert Communication Preferences
      await client.query(
        `INSERT INTO farmer_communication_preferences (
          farmer_id, sms_enabled, email_enabled, ussd_enabled, ivr_enabled, preferred_language
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          farmerId,
          input.communication.sms,
          input.communication.email,
          true, // ussd_enabled is default true
          input.communication.ivr,
          input.preferred_language,
        ]
      );

      await client.query('COMMIT');
      return { id: farmerId, ...input };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getFarmers(filters: { region?: string; grid_id?: string; crop?: string }) {
    let query = 'SELECT f.* FROM farmers f';
    const values: any[] = [];
    const conditions: string[] = [];

    if (filters.crop) {
      query += ' JOIN farmer_crops fc ON f.id = fc.farmer_id';
      conditions.push(`fc.crop_model_key = $${values.length + 1}`);
      values.push(filters.crop);
    }

    if (filters.region) {
      conditions.push(`f.region = $${values.length + 1}`);
      values.push(filters.region);
    }

    if (filters.grid_id) {
      conditions.push(`f.grid_id = $${values.length + 1}`);
      values.push(filters.grid_id);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  async updateFarmerPreferences(id: string, updates: {
    sms_enabled?: boolean;
    email_enabled?: boolean;
    ivr_enabled?: boolean;
    preferred_language?: string;
  }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      const sets: string[] = [];
      const values: any[] = [id];
      let i = 2;

      if (updates.sms_enabled !== undefined) {
        sets.push(`sms_enabled = $${i++}`);
        values.push(updates.sms_enabled);
        
        await client.query(
          `UPDATE farmers SET sms_consent = $1, updated_at = NOW() WHERE id = $2`,
          [updates.sms_enabled, id]
        );
      }
      
      if (updates.email_enabled !== undefined) {
        sets.push(`email_enabled = $${i++}`);
        values.push(updates.email_enabled);
        
        await client.query(
          `UPDATE farmers SET email_consent = $1, updated_at = NOW() WHERE id = $2`,
          [updates.email_enabled, id]
        );
      }
      
      if (updates.ivr_enabled !== undefined) {
        sets.push(`ivr_enabled = $${i++}`);
        values.push(updates.ivr_enabled);
        
        await client.query(
          `UPDATE farmers SET ivr_consent = $1, updated_at = NOW() WHERE id = $2`,
          [updates.ivr_enabled, id]
        );
      }
      
      if (updates.preferred_language !== undefined) {
        sets.push(`preferred_language = $${i++}`);
        values.push(updates.preferred_language);
        
        await client.query(
          `UPDATE farmers SET preferred_language = $1, updated_at = NOW() WHERE id = $2`,
          [updates.preferred_language, id]
        );
      }

      if (sets.length > 0) {
        sets.push(`updated_at = NOW()`);
        const query = `UPDATE farmer_communication_preferences SET ${sets.join(', ')} WHERE farmer_id = $1 RETURNING *`;
        const result = await client.query(query, values);
        
        if (result.rowCount === 0) {
          throw new Error('NOT_FOUND');
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

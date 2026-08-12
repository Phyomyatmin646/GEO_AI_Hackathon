import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../errors.js';
import { FarmerRegistrationRequestSchema } from './farmer.schema.js';
import { FarmerRepository } from './farmer.repository.js';
import type { Pool } from 'pg';

export type FarmerRoutesOptions = {
  pool: Pool;
  prefix?: string;
};

const farmerRoutes: FastifyPluginAsync<FarmerRoutesOptions> = async (server, options) => {
  const repository = new FarmerRepository(options.pool);

  server.post('/register', async (request, reply) => {
    const parseResult = FarmerRegistrationRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new AppError(400, 'INVALID_REQUEST', 'Invalid farmer registration data', parseResult.error.issues as any);
    }

    try {
      const registeredFarmer = await repository.registerFarmer(parseResult.data);
      return reply.status(201).send({ data: registeredFarmer });
    } catch (error: any) {
      if (error.message === 'DUPLICATE_PHONE') {
        throw new AppError(409, 'CONFLICT', 'This phone number is already registered.');
      }
      throw error;
    }
  });

  server.get('/', async (request, reply) => {
    const query = request.query as { region?: string; grid_id?: string; crop?: string };
    const farmers = await repository.getFarmers(query);
    return reply.status(200).send({ data: farmers });
  });

  server.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const body = request.body as any;
    try {
      await repository.updateFarmerPreferences(id, body);
      return reply.status(200).send({ message: 'Farmer preferences updated successfully' });
    } catch (error: any) {
      if (error.message === 'NOT_FOUND') {
        throw new AppError(404, 'NOT_FOUND', 'Farmer not found');
      }
      throw error;
    }
  });
};

export default farmerRoutes;

import type { FastifyInstance } from 'fastify';

import {
  UserRegistrationConflictError,
  type AppStore,
} from '../db/store.js';
import { AppError, RequestValidationError } from '../errors.js';
import {
  RegisteredUserSchema,
  UserRegistrationRequestSchema,
} from '../schemas/users.js';

export default async function userRoutes(
  fastify: FastifyInstance,
  options: {
    store?: AppStore;
    rateLimit: { max: number; timeWindow: number };
  },
) {
  fastify.post(
    '/register',
    { config: { rateLimit: options.rateLimit } },
    async (request, reply) => {
      if (!options.store) {
        throw new AppError(
          503,
          'USER_REGISTRATION_UNAVAILABLE',
          'User registration is temporarily unavailable.',
        );
      }
      const parsed = UserRegistrationRequestSchema.safeParse(request.body);
      if (!parsed.success) throw new RequestValidationError(parsed.error.issues);

      try {
        const user = RegisteredUserSchema.parse(
          await options.store.registerUser(parsed.data),
        );
        return reply.status(201).send({ user });
      } catch (error) {
        if (error instanceof UserRegistrationConflictError) {
          throw new AppError(
            409,
            'USER_ALREADY_EXISTS',
            'A user with those registration details already exists.',
          );
        }
        throw error;
      }
    },
  );
}

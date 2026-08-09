import { z } from 'zod';

const UsernameSchema = z
  .string()
  .trim()
  .transform((value) => value.normalize('NFC'))
  .pipe(
    z
      .string()
      .refine((value) => [...value].length >= 3, 'username must contain at least 3 characters')
      .refine((value) => [...value].length <= 50, 'username must contain at most 50 characters')
      .regex(
        /^[\p{L}\p{M}\p{N}_.-]+$/u,
        'username may contain only letters, numbers, underscores, periods, and hyphens',
      ),
  );

const PhoneSchema = z
  .string()
  .trim()
  .min(7)
  .max(32)
  .transform((value) => value.replace(/[\s-]/g, ''))
  .refine(
    (value) => !value.startsWith('00') && !value.startsWith('+950'),
    'phone must not include an international access prefix or a Myanmar trunk zero after +95',
  )
  .transform((value) => (value.startsWith('0') ? `+95${value.slice(1)}` : value))
  .pipe(
    z
      .string()
      .regex(
        /^\+[1-9]\d{6,14}$/,
        'phone must be a valid international number or a Myanmar local number beginning with 0',
      ),
  );

const LocationSchema = z
  .string()
  .trim()
  .transform((value) => value.normalize('NFC'))
  .pipe(
    z
      .string()
      .refine((value) => [...value].length >= 2, 'location must contain at least 2 characters')
      .refine((value) => [...value].length <= 160, 'location must contain at most 160 characters')
      .regex(/^[^\p{Cc}\p{Cf}]+$/u, 'location contains control or format characters'),
  );

const EmailSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .string()
    .trim()
    .transform((value) => value.toLowerCase())
    .pipe(z.email().max(254))
    .optional(),
);

export const UserRegistrationRequestSchema = z
  .object({
    username: UsernameSchema,
    phone: PhoneSchema,
    location: LocationSchema,
    email: EmailSchema,
  })
  .strict();

export const RegisteredUserSchema = z
  .object({
    id: z.uuid(),
    username: z
      .string()
      .refine((value) => [...value].length >= 3)
      .refine((value) => [...value].length <= 50),
    phone: z
      .string()
      .regex(/^\+[1-9]\d{6,14}$/)
      .refine((value) => !value.startsWith('+950')),
    location: z
      .string()
      .refine((value) => [...value].length >= 2)
      .refine((value) => [...value].length <= 160),
    email: z.email().max(254).nullable(),
    created_at: z.iso.datetime({ offset: true }),
  })
  .strict();

export type UserRegistrationInput = z.infer<typeof UserRegistrationRequestSchema>;
export type RegisteredUser = z.infer<typeof RegisteredUserSchema>;

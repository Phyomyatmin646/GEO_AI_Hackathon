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
        /^[\p{L}\p{M}\p{N}_.\-\s]+$/u,
        'username may contain only letters, numbers, underscores, periods, hyphens, and spaces',
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

const EmailSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .string()
    .trim()
    .transform((value) => value.toLowerCase())
    .pipe(z.email().max(254))
    .nullable()
    .optional(),
);

export const FarmerRegistrationRequestSchema = z
  .object({
    username: UsernameSchema,
    phone_number: PhoneSchema,
    email: EmailSchema,
    location: z.object({
      region: z.string().trim().min(2),
      township: z.string().trim().min(2).optional(),
      village: z.string().trim().min(2).optional(),
      grid_id: z.string().trim().min(2),
    }),
    main_crops: z.array(z.string()).min(1),
    preferred_language: z.string().default('my'),
    communication: z.object({
      sms: z.boolean().default(true),
      email: z.boolean().default(false),
      ivr: z.boolean().default(false),
    }),
    consent: z.boolean().refine((val) => val === true, {
      message: 'Consent is required',
    }),
  })
  .strict();

export type FarmerRegistrationInput = z.infer<typeof FarmerRegistrationRequestSchema>;

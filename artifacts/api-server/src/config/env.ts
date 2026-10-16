import { z } from 'zod';

const environmentSchema = z
  .object({
    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => /^postgres(ql)?:\/\//.test(value)),
    SESSION_SECRET: z.string().min(32),
    PIN_PEPPER: z.string().min(32),
    PIN_PEPPER_VERSION: z.coerce.number().int().min(1).default(1),
    PIN_PEPPER_PREVIOUS: z.string().min(32).optional(),
    PIN_PEPPER_PREVIOUS_VERSION: z.coerce.number().int().min(1).optional(),
    PORT: z.coerce.number().int().min(1).max(65535),
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    APP_BASE_URL: z.string().url().optional(),
    REPLIT_DEV_DOMAIN: z
      .string()
      .max(253)
      .regex(/^[a-z\d.-]+$/i)
      .optional(),
    MAX_ACTIVE_GAMES: z.coerce.number().int().min(1).optional(),
  })
  .superRefine((environment, context) => {
    const hasPreviousPepper = environment.PIN_PEPPER_PREVIOUS !== undefined;
    const hasPreviousVersion =
      environment.PIN_PEPPER_PREVIOUS_VERSION !== undefined;
    if (hasPreviousPepper !== hasPreviousVersion) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [
          hasPreviousPepper
            ? 'PIN_PEPPER_PREVIOUS_VERSION'
            : 'PIN_PEPPER_PREVIOUS',
        ],
        message: 'Previous PIN pepper and version must be configured together',
      });
    }
    if (
      environment.PIN_PEPPER_PREVIOUS_VERSION !== undefined &&
      environment.PIN_PEPPER_PREVIOUS_VERSION >= environment.PIN_PEPPER_VERSION
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PIN_PEPPER_PREVIOUS_VERSION'],
        message: 'Previous PIN pepper version must be lower than current',
      });
    }
    if (environment.NODE_ENV === 'production' && !environment.APP_BASE_URL) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['APP_BASE_URL'],
        message: 'Required in production',
      });
    }
    if (
      environment.NODE_ENV === 'production' &&
      !environment.MAX_ACTIVE_GAMES
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MAX_ACTIVE_GAMES'],
        message: 'Required in production',
      });
    }
  });

export function parseEnvironment(input: Record<string, unknown>) {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    const keys = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];
    // Deliberately never include input values or raw validation errors.
    throw new Error(
      `Missing or invalid environment variables: ${keys.join(', ')}`,
    );
  }
  return result.data;
}

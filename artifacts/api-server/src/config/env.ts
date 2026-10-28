import { z } from 'zod';
import { resolveDeploymentMode } from '@workspace/security/deployment';

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
    PRE_LAUNCH_NOINDEX: z.enum(['true', 'false']).optional(),
    COMING_SOON_MODE: z.enum(['true', 'false']).optional(),
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
    // Game clear-down (D117): dry-run until the owner approves deleting;
    // 'off' is the kill switch.
    OATHSTONE_CLEARDOWN_MODE: z
      .enum(['off', 'dry-run', 'delete'])
      .default('dry-run'),
  })
  .superRefine((environment, context) => {
    if (
      environment.PRE_LAUNCH_NOINDEX === 'false' &&
      environment.COMING_SOON_MODE !== 'true'
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COMING_SOON_MODE'],
        message: 'Required when crawling is permitted',
      });
    }
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
  })
  .transform((environment) => {
    const mode = resolveDeploymentMode(environment);
    return {
      ...environment,
      PRE_LAUNCH_NOINDEX: mode.preLaunchNoindex,
      COMING_SOON_MODE: mode.comingSoonMode,
    };
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

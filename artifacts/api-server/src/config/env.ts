import { z } from 'zod';

const environmentSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => /^postgres(ql)?:\/\//.test(value)),
  SESSION_SECRET: z.string().min(32),
  PORT: z.coerce.number().int().min(1).max(65535),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
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

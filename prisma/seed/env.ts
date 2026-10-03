import { z } from "zod";

export const seedEnvSchema = z.object({
  SEED_ADMIN_USERNAME: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, "letters, numbers, dot, dash and underscore only")
    .transform((value) => value.toLowerCase()),
  SEED_ADMIN_PASSWORD: z.string().min(12, "must be at least 12 characters"),
  SEED_ADMIN_EMAIL: z.email().transform((value) => value.toLowerCase()),
  SEED_ADMIN_DISPLAY_NAME: z.string().trim().min(1).default("Administrator"),
});

export type SeedEnv = z.infer<typeof seedEnvSchema>;

/** Parses seed settings; error messages name the variable but never echo values. */
export function parseSeedEnv(env: Record<string, string | undefined>): SeedEnv {
  const result = seedEnvSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(`Invalid seed environment:\n  ${problems.join("\n  ")}`);
  }
  return result.data;
}

import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  // Empty or unset = mock mode: the Places client serves fixture data.
  GOOGLE_PLACES_API_KEY: z.string().optional().default(""),
  // Empty or unset disables the postal channel.
  LOB_API_KEY: z.string().optional().default(""),
  // 32-byte base64; required to store mailbox passwords.
  ENCRYPTION_KEY: z.string().optional().default(""),
  UNSUBSCRIBE_JWT_SECRET: z.string().optional().default(""),
  APP_BASE_URL: z.string().optional().default("http://localhost:3000"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment: ${parsed.error.message}`);
}

export const env = parsed.data;

export const isPlacesMockMode = env.GOOGLE_PLACES_API_KEY === "";
export const isPostalEnabled = env.LOB_API_KEY !== "";

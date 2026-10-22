import { z } from "zod";

const baseEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  ADMIN_PASSWORD: z.string().min(4, "ADMIN_PASSWORD must be at least 4 characters"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  USE_REAL_AWS: z.enum(["true", "false"]).default("false"),
});

const awsEnvSchema = z.object({
  AWS_REGION: z.string().min(1),
  AWS_AUTO_SCALING_GROUP_NAME: z.string().min(1),
  AWS_ALB_TARGET_GROUP_ARN: z.string().min(1),
  AWS_ALB_SECONDARY_TARGET_GROUP_ARN: z.string().min(1),
  AWS_ALB_LISTENER_RULE_ARN: z.string().min(1),
  AWS_CLOUDWATCH_NAMESPACE: z.string().min(1),
  // Public ALB DNS name (host[:port], no scheme) scraped for live gateway metrics.
  AWS_ALB_DNS: z.string().min(1),
  // SSM parameter the cache-TTL action writes and the gateway instances poll.
  AWS_CACHE_TTL_PARAM: z.string().min(1).default("/optimizer/cacheTtlSec"),
});

export type AwsEnv = z.infer<typeof awsEnvSchema>;

export function getServerEnv() {
  const parsed = baseEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const variables = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Configuration error: check ${variables} in .env`);
  }
  return parsed.data;
}

export function getAwsEnv(enabled = getServerEnv().USE_REAL_AWS === "true") {
  if (!enabled) return null;
  if (getServerEnv().USE_REAL_AWS !== "true") {
    throw new Error("Real AWS mode requires USE_REAL_AWS=true in the server environment.");
  }
  const parsed = awsEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const variables = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Real AWS mode requires: ${variables}`);
  }
  return parsed.data;
}

export function safeActionError(error: unknown) {
  if (error instanceof Error) {
    if (error.message.startsWith("Configuration error") || error.message.startsWith("Real AWS mode")) {
      return error.message;
    }
    if (error.message.includes("connect") || error.message.includes("ECONNREFUSED")) {
      return "Storage is unavailable. Start MySQL and Redis, then try again.";
    }
  }
  return "The operation could not be completed. Check the local services and try again.";
}

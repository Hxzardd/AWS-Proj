import { getAwsEnv } from "../lib/config";
import { readRealControlState } from "../lib/aws/controlState";
import { observeLiveGateway } from "../lib/aws/observe";

// Read-only pre-demo validation: confirms every AWS_* value, the controller
// IAM permissions (ASG/ALB/SSM Describe+Get), and a healthy gateway fleet
// (GET /fleet). Mutates nothing. Run with: npm run aws:check
async function main() {
  const aws = getAwsEnv(true);
  if (!aws) throw new Error("Real AWS mode is not enabled (set USE_REAL_AWS=true).");
  console.log(`Region: ${aws.AWS_REGION}`);
  console.log(`ASG:    ${aws.AWS_AUTO_SCALING_GROUP_NAME}`);
  console.log(`ALB:    ${aws.AWS_ALB_DNS}`);

  const control = await readRealControlState(aws);
  console.log("Real control state:", control);

  const observation = await observeLiveGateway(aws, control.instances);
  console.log("Live fleet observation:", observation);

  console.log("\nOK: credentials, ARNs, and the gateway fleet are reachable.");
}

main().catch((error) => {
  console.error("\naws:check FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});

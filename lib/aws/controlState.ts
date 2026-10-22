import type { AwsEnv } from "@/lib/config";
import type { ControlState } from "@/lib/simulation/generator";

/**
 * Reads the current infrastructure policy straight from AWS so the agent acts
 * against reality rather than a drifting local counter: desired capacity from
 * the Auto Scaling group, the primary routing weight from the ALB listener rule,
 * and the cache TTL from SSM Parameter Store. Cooldown is left to the ASG
 * (SetDesiredCapacity uses HonorCooldown), so it is reported as zero here.
 */
export async function readRealControlState(aws: AwsEnv): Promise<ControlState> {
  const { AutoScalingClient, DescribeAutoScalingGroupsCommand } = await import(
    "@aws-sdk/client-auto-scaling"
  );
  const asg = new AutoScalingClient({ region: aws.AWS_REGION });
  const groups = await asg.send(
    new DescribeAutoScalingGroupsCommand({
      AutoScalingGroupNames: [aws.AWS_AUTO_SCALING_GROUP_NAME],
    }),
  );
  const instances =
    groups.AutoScalingGroups?.[0]?.DesiredCapacity ??
    Number(process.env.MIN_INSTANCES ?? 1);

  const { ElasticLoadBalancingV2Client, DescribeRulesCommand } = await import(
    "@aws-sdk/client-elastic-load-balancing-v2"
  );
  const elb = new ElasticLoadBalancingV2Client({ region: aws.AWS_REGION });
  const rules = await elb.send(
    new DescribeRulesCommand({ RuleArns: [aws.AWS_ALB_LISTENER_RULE_ARN] }),
  );
  const forward = rules.Rules?.[0]?.Actions?.find(
    (action) => action.Type === "forward",
  )?.ForwardConfig;
  const primaryWeight = forward?.TargetGroups?.find(
    (group) => group.TargetGroupArn === aws.AWS_ALB_TARGET_GROUP_ARN,
  )?.Weight;

  const { SSMClient, GetParameterCommand } = await import("@aws-sdk/client-ssm");
  const ssm = new SSMClient({ region: aws.AWS_REGION });
  let cacheTtlSec = 60;
  try {
    const parameter = await ssm.send(
      new GetParameterCommand({ Name: aws.AWS_CACHE_TTL_PARAM }),
    );
    cacheTtlSec = Number(parameter.Parameter?.Value ?? 60);
  } catch {
    // Parameter may not exist before the first cache action; keep the default.
  }

  return {
    instances,
    primaryRoutePct: primaryWeight ?? 70,
    cacheTtlSec: Number.isFinite(cacheTtlSec) ? cacheTtlSec : 60,
    scaleCooldownSteps: 0,
    lastAction: "NO_OP",
  };
}

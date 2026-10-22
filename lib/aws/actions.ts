import type { Observation, RlAction } from "@/lib/rl/types";
import type { ControlState } from "@/lib/simulation/generator";
import { getAwsEnv } from "@/lib/config";
import { calculateReward } from "@/lib/rl/reward";

export type InfrastructureResult = {
  provider: "simulator" | "aws";
  operation: string;
  completed: boolean;
};

export async function executeInfrastructureAction(input: {
  action: RlAction;
  control: ControlState;
  metrics: Observation;
  useRealAws?: boolean;
  reward?: number;
}): Promise<InfrastructureResult> {
  const aws = getAwsEnv(input.useRealAws);
  if (!aws) {
    return {
      provider: "simulator",
      operation: `Simulated ${input.action}`,
      completed: true,
    };
  }

  if (input.action === "SCALE_UP" || input.action === "SCALE_DOWN") {
    const { AutoScalingClient, SetDesiredCapacityCommand } = await import(
      "@aws-sdk/client-auto-scaling"
    );
    const client = new AutoScalingClient({ region: aws.AWS_REGION });
    await client.send(
      new SetDesiredCapacityCommand({
        AutoScalingGroupName: aws.AWS_AUTO_SCALING_GROUP_NAME,
        DesiredCapacity: input.control.instances,
        HonorCooldown: true,
      }),
    );
  }

  if (input.action === "CACHE_TTL_UP" || input.action === "CACHE_TTL_DOWN") {
    const { SSMClient, PutParameterCommand } = await import("@aws-sdk/client-ssm");
    const ssm = new SSMClient({ region: aws.AWS_REGION });
    await ssm.send(
      new PutParameterCommand({
        Name: aws.AWS_CACHE_TTL_PARAM,
        Value: String(input.control.cacheTtlSec),
        Type: "String",
        Overwrite: true,
      }),
    );
  }

  if (input.action === "REROUTE_SHIFT") {
    const { ElasticLoadBalancingV2Client, ModifyRuleCommand } = await import(
      "@aws-sdk/client-elastic-load-balancing-v2"
    );
    const client = new ElasticLoadBalancingV2Client({ region: aws.AWS_REGION });
    await client.send(
      new ModifyRuleCommand({
        RuleArn: aws.AWS_ALB_LISTENER_RULE_ARN,
        Actions: [
          {
            Type: "forward",
            ForwardConfig: {
              TargetGroups: [
                {
                  TargetGroupArn: aws.AWS_ALB_TARGET_GROUP_ARN,
                  Weight: input.control.primaryRoutePct,
                },
                {
                  TargetGroupArn: aws.AWS_ALB_SECONDARY_TARGET_GROUP_ARN,
                  Weight: 100 - input.control.primaryRoutePct,
                },
              ],
            },
          },
        ],
      }),
    );
  }

  const { CloudWatchClient, PutMetricDataCommand } = await import(
    "@aws-sdk/client-cloudwatch"
  );
  const cloudWatch = new CloudWatchClient({ region: aws.AWS_REGION });
  await cloudWatch.send(
    new PutMetricDataCommand({
      Namespace: aws.AWS_CLOUDWATCH_NAMESPACE,
      MetricData: [
        { MetricName: "OptimizerLatency", Unit: "Milliseconds", Value: input.metrics.p95LatencyMs },
        { MetricName: "OptimizerReward", Unit: "None", Value: input.reward ?? calculateReward(input.metrics) },
      ],
    }),
  );

  return {
    provider: "aws",
    operation: `Executed ${input.action} and published CloudWatch metrics`,
    completed: true,
  };
}

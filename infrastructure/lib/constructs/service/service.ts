import { IVpc } from '@aws-cdk/aws-ec2';
import { Repository } from '@aws-cdk/aws-ecr';
import { Cluster, ContainerImage, Secret } from '@aws-cdk/aws-ecs';
import {
  ApplicationLoadBalancedFargateService,
  ApplicationLoadBalancedFargateServiceProps,
} from '@aws-cdk/aws-ecs-patterns';
import { IHostedZone } from '@aws-cdk/aws-route53';
import { Construct, Duration, RemovalPolicy, Tag } from '@aws-cdk/core';
import * as path from 'path';
import { ServicePipeline, ServicePipelineProps } from './service-pipeline';

type EnvironmentMap = { [key: string]: any };
type SecretsMap = { [key: string]: Secret };
export interface ServiceProps extends ServicePipelineProps {
  cluster?: Cluster;
  domainName?: string;
  environment?: EnvironmentMap;
  hostedZone: IHostedZone;
  routePath: string;
  secrets?: SecretsMap;
  vpc: IVpc;
}

export class Service extends ServicePipeline {
  private domainName: string;
  private environment?: EnvironmentMap;
  private hostedZone: IHostedZone;
  private routePath: string;
  private scope: Construct;
  private secrets?: SecretsMap;
  private vpc: IVpc;

  private static CLUSTER: Cluster | undefined;

  constructor(scope: Construct, id: string, props: ServiceProps) {
    const {
      cluster,
      domainName,
      environment,
      environmentName,
      hostedZone,
      name,
      routePath,
      secrets,
      sourcePath,
      vpc,
    } = props;

    super(scope, id, { name, environmentName, sourcePath });

    this.domainName = `${this.name}.${domainName}`;
    this.environment = environment;
    this.hostedZone = hostedZone;
    this.routePath = routePath;
    this.scope = scope;
    this.secrets = secrets;
    this.vpc = vpc;

    Service.CLUSTER = cluster;

    this.buildFargateService();
    this.configureServiceAutoscaling({
      maxCapacity: 4,
      minCapacity: 1,
      cpuTargetUtilizationPercent: 50,
      ramTargetUtilizationPercent: 50,
    });

    Tag.add(this, 'name', name);
    Tag.add(this, 'environmentName', environmentName);
    Tag.add(this, 'description', `ECS service for ${name} running in ${environmentName}`);
  }

  private buildTaskImageOptions(environment?: EnvironmentMap, secrets?: SecretsMap) {
    const taskImageOptions: any = {
      containerName: this.name,
      containerPort: 3000,
      image: ContainerImage.fromAsset(path.join(__dirname, '../../../..', this.sourcePath), {
        repositoryName: this.name
      }),
    };
    if (environment) {
      taskImageOptions.environment = environment;
    }
    if (secrets) {
      taskImageOptions.secrets = secrets;
    }
    return taskImageOptions;
  }

  private buildServiceParams(): ApplicationLoadBalancedFargateServiceProps {
    const taskImageOptions = this.buildTaskImageOptions(this.environment, this.secrets);

    let fargateParams: ApplicationLoadBalancedFargateServiceProps = {
      cpu: 512,
      cluster: this.getCluster(),
      desiredCount: 1,
      memoryLimitMiB: 1024,
      serviceName: this.name,
      taskImageOptions,
    };

    if (this.domainName && this.hostedZone) {
      const domainName = this.domainName;
      const domainZone = this.hostedZone;
      fargateParams = { ...fargateParams, domainName, domainZone } as ApplicationLoadBalancedFargateServiceProps;
    }
    return fargateParams;
  }

  private buildFargateService() {
    const fargateParams = this.buildServiceParams();
    this.fargateService = new ApplicationLoadBalancedFargateService(this, this.name, fargateParams);
    this.fargateService.targetGroup.configureHealthCheck({
      path: this.routePath,
    });
  }

  private configureServiceAutoscaling({
    maxCapacity = 4,
    minCapacity = 1,
    cpuTargetUtilizationPercent = 50,
    ramTargetUtilizationPercent = 50,
  }) {
    const scalableTarget = this.fargateService.service.autoScaleTaskCount({
      maxCapacity,
      minCapacity,
    });

    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: cpuTargetUtilizationPercent,
    });

    scalableTarget.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: ramTargetUtilizationPercent,
    });
  }

  private getCluster() {
    if (!Service.CLUSTER) {
      const clusterName = `${this.name}-cluster`;
      Service.CLUSTER = new Cluster(this, clusterName, {
        clusterName,
        containerInsights: true,
        defaultCloudMapNamespace: {
          name: this.name,
        },
        vpc: this.vpc,
      });
    } else {
      console.log('using existing cluster');
    }
    return Service.CLUSTER;
  }
}

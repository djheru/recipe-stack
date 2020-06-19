import { IVpc } from '@aws-cdk/aws-ec2';
import { Repository } from '@aws-cdk/aws-ecr';
import { Cluster, ContainerImage, Secret } from '@aws-cdk/aws-ecs';
import {
  ApplicationLoadBalancedFargateService,
  ApplicationLoadBalancedFargateServiceProps,
} from '@aws-cdk/aws-ecs-patterns';
import { Role } from '@aws-cdk/aws-iam';
import { IHostedZone } from '@aws-cdk/aws-route53';
import { Construct, Duration } from '@aws-cdk/core';
import { ServicePipeline, ServicePipelineProps } from './servicePipeline';

type EnvironmentMap = { [key: string]: any };
type SecretsMap = { [key: string]: Secret };
export interface ServiceProps extends ServicePipelineProps {
  routePath: string;
  domainName?: string;
  environment?: EnvironmentMap;
  hostedZone: IHostedZone;
  secrets?: SecretsMap;
  vpc: IVpc;
  cluster?: Cluster;
}

export class Service extends ServicePipeline {
  public routePath: string;
  public vpc: IVpc;
  public pipelineRole: Role;
  public repository: Repository;
  public fargateService: ApplicationLoadBalancedFargateService;
  public domainName: string;
  public hostedZone: IHostedZone;
  public environment?: EnvironmentMap;
  public secrets?: SecretsMap;
  public static CLUSTER: Cluster | undefined;

  constructor(scope: Construct, id: string, props: ServiceProps) {
    const {
      name,
      cluster,
      domainName,
      environmentName,
      environment,
      hostedZone,
      secrets,
      sourcePath,
      vpc,
      routePath,
    } = props;

    super(scope, id, { name, environmentName, sourcePath });

    this.environment = environment;
    this.secrets = secrets;
    this.vpc = vpc;
    this.domainName = `${this.name}.${domainName}`;
    this.hostedZone = hostedZone;
    this.routePath = routePath;
    Service.CLUSTER = cluster;

    this.buildContainerRepository();
    this.buildFargateService();
    this.configureServiceAutoscaling();
  }

  private buildContainerRepository() {
    const repositoryName = `${this.name}-ecr-repository`;
    this.repository = new Repository(this, repositoryName, {
      repositoryName: this.name,
    });
    this.repository.addLifecycleRule({ tagPrefixList: ['prod'], maxImageCount: 999 });
    this.repository.addLifecycleRule({ maxImageAge: Duration.days(90) });
  }

  private buildTaskImageOptions(environment?: EnvironmentMap, secrets?: SecretsMap) {
    const taskImageOptions: any = {
      image: ContainerImage.fromEcrRepository(this.repository, 'latest'),
      containerName: this.name,
      containerPort: 3000,
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
      serviceName: this.name,
      memoryLimitMiB: 1024,
      desiredCount: 1,
      cpu: 512,
      cluster: this.getCluster(),
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

  private configureServiceAutoscaling(
    minCapacity = 1,
    maxCapacity = 4,
    cpuTargetUtilizationPercent: number = 50,
    ramTargetUtilizationPercent: number = 50,
  ) {
    const scalableTarget = this.fargateService.service.autoScaleTaskCount({
      minCapacity,
      maxCapacity,
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
        vpc: this.vpc,
        containerInsights: true,
        defaultCloudMapNamespace: {
          name: this.name,
        },
      });
    } else {
      console.log('using existing cluster');
    }
    return Service.CLUSTER;
  }
}

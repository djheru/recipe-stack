import { BuildSpec, LinuxBuildImage, PipelineProject } from '@aws-cdk/aws-codebuild';
import { Artifact } from '@aws-cdk/aws-codepipeline';
import { CodeBuildAction, EcsDeployAction } from '@aws-cdk/aws-codepipeline-actions';
import { Repository } from '@aws-cdk/aws-ecr';
import { ApplicationLoadBalancedFargateService } from '@aws-cdk/aws-ecs-patterns';
import { ManagedPolicy, Role, ServicePrincipal } from '@aws-cdk/aws-iam';
import { Construct } from '@aws-cdk/core';
import { Environment } from '..';
import { buildServiceBuildSpec } from '../../utils/buildspec';
import { GetPipelineActionsProps, Pipelineable } from '../pipeline-manager';

const { CDK_DEFAULT_ACCOUNT: account, CDK_DEFAULT_REGION: region } = process.env;

export interface ServicePipelineProps {
  environmentName: Environment;
  name: string;
  sourcePath: string;
}

export class ServicePipeline extends Construct implements Pipelineable {
  public environmentName: Environment;
  public fargateService: ApplicationLoadBalancedFargateService;
  public name: string;
  public pipelineRole: Role;
  public repository: Repository;
  public repositoryUri: string;
  public sourcePath: string;

  public readonly pipelineable: boolean = true;

  constructor(scope: Construct, id: string, props: ServicePipelineProps) {
    super(scope, id);

    const { environmentName, name, sourcePath } = props;

    this.environmentName = environmentName;
    this.name = name;
    this.repositoryUri = `${account}.dkr.ecr.${region}.amazonaws.com/${this.name}`;
    this.sourcePath = sourcePath;
  }

  protected getPipelineRole() {
    if (this.pipelineRole) {
      return this.pipelineRole;
    }
    const roleName = `${this.name}-code-build-role`;
    this.pipelineRole = new Role(this, roleName, {
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryPowerUser'),
        ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'),
      ],
      roleName,
    });
    return this.pipelineRole;
  }

  public getBuildActions({ inputArtifact, outputArtifact }: GetPipelineActionsProps) {
    const role = this.getPipelineRole();
    const buildProjectName = `${this.name}-build-project`;
    const buildProjectBuildSpec = buildServiceBuildSpec({
      name: this.name,
      sourcePath: this.sourcePath,
      imageName: this.repositoryUri,
    });
    const buildProject = new PipelineProject(this, buildProjectName, {
      buildSpec: BuildSpec.fromObject(buildProjectBuildSpec),
      environment: {
        buildImage: LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:3.0'),
        privileged: true,
      },
      projectName: buildProjectName,
      role,
    });
    const buildActionName = `${this.name}-codebuild-build-action`;
    const buildAction = new CodeBuildAction({
      actionName: buildActionName,
      input: inputArtifact,
      outputs: [outputArtifact as Artifact],
      project: buildProject,
      runOrder: 2,
    });
    return [buildAction];
  }

  public getDeployActions({ inputArtifact }: GetPipelineActionsProps) {
    const deployActionName = `${this.name}-deploy-action`;
    const deployAction = new EcsDeployAction({
      actionName: deployActionName,
      input: inputArtifact,
      runOrder: 3,
      service: this.fargateService.service,
    });
    return [deployAction];
  }
}

import { BuildSpec, LinuxBuildImage, PipelineProject } from '@aws-cdk/aws-codebuild';
import { Artifact } from '@aws-cdk/aws-codepipeline';
import { CodeBuildAction, EcsDeployAction } from '@aws-cdk/aws-codepipeline-actions';
import { Repository } from '@aws-cdk/aws-ecr';
import { ApplicationLoadBalancedFargateService } from '@aws-cdk/aws-ecs-patterns';
import { ManagedPolicy, Role, ServicePrincipal } from '@aws-cdk/aws-iam';
import { Construct } from '@aws-cdk/core';
import { Environment } from '../pillar-stack';
import { buildServiceBuildSpec } from '../utils/buildSpec';
import { GetPipelineActionsProps, Pipelineable } from './pipelineManager';

export interface ServicePipelineProps {
  name: string;
  environmentName: Environment;
  sourcePath: string;
}

export class ServicePipeline extends Construct implements Pipelineable {
  public name: string;
  public environmentName: Environment;
  public sourcePath: string;
  public pipelineRole: Role;
  public repository: Repository;
  public fargateService: ApplicationLoadBalancedFargateService;

  constructor(scope: Construct, id: string, props: ServicePipelineProps) {
    super(scope, id);

    const { name, environmentName, sourcePath } = props;

    this.name = name;
    this.environmentName = environmentName;
    this.sourcePath = sourcePath;
  }

  protected getPipelineRole() {
    if (this.pipelineRole) {
      return this.pipelineRole;
    }
    const roleName = `${this.name}-code-build-role`;
    this.pipelineRole = new Role(this, roleName, {
      roleName,
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
        ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryPowerUser'),
        ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'),
      ],
    });
    return this.pipelineRole;
  }

  public getBuildActions({ inputArtifact, outputArtifact }: GetPipelineActionsProps) {
    const role = this.getPipelineRole();
    const buildProjectName = `${this.name}-build-project`;
    const buildProjectBuildSpec = buildServiceBuildSpec({
      name: this.name,
      sourcePath: this.sourcePath,
      imageName: this.repository.repositoryUri,
    });
    const buildProject = new PipelineProject(this, buildProjectName, {
      projectName: buildProjectName,
      role,
      buildSpec: BuildSpec.fromObject(buildProjectBuildSpec),
      environment: {
        buildImage: LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:3.0'),
        privileged: true,
      },
    });
    const buildActionName = `${this.name}-codebuild-build-action`;
    const buildAction = new CodeBuildAction({
      actionName: buildActionName,
      project: buildProject,
      input: inputArtifact,
      outputs: [outputArtifact as Artifact],
      runOrder: 2,
    });
    return [buildAction];
  }

  public getDeployActions({ inputArtifact }: GetPipelineActionsProps) {
    const deployActionName = `${this.name}-deploy-action`;
    const deployAction = new EcsDeployAction({
      actionName: deployActionName,
      service: this.fargateService.service,
      input: inputArtifact,
      runOrder: 3,
    });
    return [deployAction];
  }
}

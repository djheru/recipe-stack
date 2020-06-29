import { CloudFrontWebDistribution } from '@aws-cdk/aws-cloudfront';
import { BuildSpec, PipelineProject } from '@aws-cdk/aws-codebuild';
import { Artifact } from '@aws-cdk/aws-codepipeline';
import { CodeBuildAction } from '@aws-cdk/aws-codepipeline-actions';
import { ManagedPolicy, Role, ServicePrincipal } from '@aws-cdk/aws-iam';
import { CfnOutput, Construct } from '@aws-cdk/core';
import { existsSync } from 'fs';
import { Environment } from '..';
import { buildWebsiteBuildSpec, deployWebsiteBuildSpec } from '../../utils/buildspec';
import { GetPipelineActionsProps, Pipelineable } from '../pipeline-manager';

export interface WebsitePipelineProps {
  environmentName: Environment;
  name: string;
  sourcePath: string;
}

export class WebsitePipeline extends Construct implements Pipelineable {
  public bucketName: string;
  public distribution: CloudFrontWebDistribution;
  public environmentName: Environment;
  public name: string;
  public pipelineRole: Role;
  public sourcePath: string;

  public readonly pipelineable: boolean = true;

  constructor(scope: Construct, id: string, props: WebsitePipelineProps) {
    super(scope, id);
    const { name, environmentName, sourcePath } = props;

    this.environmentName = environmentName;
    this.name = name;
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
        ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
        ManagedPolicy.fromAwsManagedPolicyName('CloudFrontFullAccess'),
        ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'),
      ],
      roleName,
    });
    return this.pipelineRole;
  }

  public getBuildActions({ inputArtifact, outputArtifact }: GetPipelineActionsProps) {
    const role = this.getPipelineRole();
    const buildProjectName = `${this.name}-build-project`;
    const buildProjectBuildSpec = buildWebsiteBuildSpec({
      name: this.name,
      sourcePath: this.sourcePath,
    });
    const buildProject = new PipelineProject(this, buildProjectName, {
      buildSpec: BuildSpec.fromObject(buildProjectBuildSpec),
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
    const role = this.getPipelineRole();
    const deployProjectName = `${this.name}-deploy-project`;
    const deployProjectBuildSpec = deployWebsiteBuildSpec({
      bucketName: this.bucketName,
      distributionId: this.distribution.distributionId,
      name: this.name,
    });
    const deployProject = new PipelineProject(this, deployProjectName, {
      buildSpec: BuildSpec.fromObject(deployProjectBuildSpec),
      projectName: deployProjectName,
      role,
    });

    const deployActionName = `${this.name}-deploy-action`;
    const deployAction = new CodeBuildAction({
      actionName: deployActionName,
      input: inputArtifact,
      project: deployProject,
      runOrder: 3,
    });
    return [deployAction];
  }

  protected exportValue(params: { exportName: string; value: string; description: string }) {
    const { exportName, value, description } = params;
    new CfnOutput(this, exportName, {
      description,
      exportName,
      value,
    });
  }

  static checkWebsitePathExists(path: string) {
    try {
      return existsSync(path);
    } catch (e) {
      console.log('Website path does not exist, skipping initial deployment', path);
      return false;
    }
  }
}

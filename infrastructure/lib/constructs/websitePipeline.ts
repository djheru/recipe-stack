import { Artifact } from '@aws-cdk/aws-codepipeline';
import { BuildSpec, PipelineProject } from '@aws-cdk/aws-codebuild';
import { Role, ManagedPolicy, ServicePrincipal } from '@aws-cdk/aws-iam';
import { CodeBuildAction } from '@aws-cdk/aws-codepipeline-actions';
import { existsSync } from 'fs';
import { CfnOutput, Construct } from '@aws-cdk/core';
import { CloudFrontWebDistribution } from '@aws-cdk/aws-cloudfront';
import { Environment } from '../pillar-stack';
import { buildWebsiteBuildSpec, deployWebsiteBuildSpec } from '../utils/buildSpec.js';
import { GetPipelineActionsProps, Pipelineable } from './pipelineManager';

export interface WebsitePipelineProps {
  name: string;
  environmentName: Environment;
  sourcePath: string;
}

export class WebsitePipeline extends Construct implements Pipelineable {
  public name: string;
  public environmentName: Environment;
  public sourcePath: string;
  public bucketName: string;
  public distribution: CloudFrontWebDistribution;
  public pipelineRole: Role;

  constructor(scope: Construct, id: string, props: WebsitePipelineProps) {
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
        ManagedPolicy.fromAwsManagedPolicyName('CloudFrontFullAccess'),
        ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'),
      ],
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
      projectName: buildProjectName,
      role,
      buildSpec: BuildSpec.fromObject(buildProjectBuildSpec),
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
    const role = this.getPipelineRole();
    const deployProjectName = `${this.name}-deploy-project`;
    const deployProjectBuildSpec = deployWebsiteBuildSpec({
      name: this.name,
      bucketName: this.bucketName,
      distributionId: this.distribution.distributionId,
    });
    const deployProject = new PipelineProject(this, deployProjectName, {
      projectName: deployProjectName,
      role,
      buildSpec: BuildSpec.fromObject(deployProjectBuildSpec),
    });

    const deployActionName = `${this.name}-deploy-action`;
    const deployAction = new CodeBuildAction({
      actionName: deployActionName,
      project: deployProject,
      input: inputArtifact,
      runOrder: 3,
    });
    return [deployAction];
  }

  protected exportValue(params: { exportName: string; value: string; description: string }) {
    const { exportName, value, description } = params;
    new CfnOutput(this, exportName, {
      value,
      description,
      exportName,
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

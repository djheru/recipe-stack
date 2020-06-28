import { BuildSpec, LinuxBuildImage, PipelineProject } from '@aws-cdk/aws-codebuild';
import { Repository } from '@aws-cdk/aws-codecommit';
import { Artifact, IAction, IStage, Pipeline } from '@aws-cdk/aws-codepipeline';
import { CodeBuildAction, CodeCommitSourceAction } from '@aws-cdk/aws-codepipeline-actions';
import { ManagedPolicy, Role, ServicePrincipal } from '@aws-cdk/aws-iam';
import { Construct, Tag } from '@aws-cdk/core';
import { Environment } from '..';
import { buildInfrastructureBuildSpec } from '../../utils/buildspec';

export type GetPipelineActionsProps = {
  inputArtifact: Artifact;
  outputArtifact?: Artifact;
};

export interface Pipelineable {
  pipelineable: boolean;
  getBuildActions(buildArtifacts: GetPipelineActionsProps): IAction[];
  getDeployActions(deployArtifacts: GetPipelineActionsProps): IAction[];
}

export interface PipelineManagerProps {
  name: string;
  environmentName: Environment;
  gitRepository: Repository;
}

export class PipelineManager extends Construct {
  private name: string;
  private environmentName: Environment;
  private gitRepository: Repository;
  private pipeline: Pipeline;
  private sourceOutput: Artifact;

  private sourceStage: IStage;
  private infrastructureStage: IStage;
  private buildStage: IStage;
  private deployStage: IStage;

  private buildActions: Set<IAction> = new Set();
  private deployActions: Set<IAction> = new Set();

  constructor(scope: Construct, id: string, props: PipelineManagerProps) {
    super(scope, id);
    const { name, environmentName, gitRepository } = props;

    this.name = name;
    this.environmentName = environmentName;
    this.gitRepository = gitRepository;
    this.sourceOutput = new Artifact();

    Tag.add(this, 'name', name);
    Tag.add(this, 'environmentName', environmentName);
    Tag.add(this, 'description', `Pipeline for ${name} running in ${environmentName}`);
  }

  private buildPipeline() {
    const pipelineName = `${this.name}-pipeline`;
    this.pipeline = new Pipeline(this, pipelineName, {
      pipelineName,
      restartExecutionOnUpdate: true,
    });
  }

  private buildSourceStage() {
    const sourceActionName = `${this.name}-codecommit-source-action`;
    const sourceAction = new CodeCommitSourceAction({
      actionName: sourceActionName,
      repository: this.gitRepository,
      branch: this.environmentName,
      output: this.sourceOutput,
      runOrder: 1,
    });
    this.sourceStage = this.pipeline.addStage({
      stageName: `source-${this.environmentName}`,
      actions: [sourceAction],
    });
  }

  private buildInfrastructureStage() {
    const infrastructureProjectName = `${this.name}-infrastructure-project`;
    const infrastructureProjectBuildSpec = buildInfrastructureBuildSpec({
      name: this.name,
      sourcePath: 'infrastructure',
    });
    const infrastructureRoleName = `${this.name}-infrastructure-code-build-role`;
    const role = new Role(this, infrastructureRoleName, {
      roleName: infrastructureRoleName,
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
    });
    const infrastructureBuildProject = new PipelineProject(this, infrastructureProjectName, {
      projectName: infrastructureProjectName,
      role,
      buildSpec: BuildSpec.fromObject(infrastructureProjectBuildSpec),
      environment: {
        buildImage: LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:3.0'),
        privileged: true,
      },
    });
    const infrastructureBuildActionName = `${this.name}-infrastructure-build-action`;
    const infrastructureBuildAction = new CodeBuildAction({
      actionName: infrastructureBuildActionName,
      project: infrastructureBuildProject,
      input: this.sourceOutput,
      runOrder: 1,
    });
    this.infrastructureStage = this.pipeline.addStage({
      stageName: `infrastructure-${this.environmentName}`,
      actions: [infrastructureBuildAction],
      placement: {
        justAfter: this.sourceStage,
      },
    });
  }

  private buildBuildStage() {
    const actions = Array.from(this.buildActions);
    this.buildStage = this.pipeline.addStage({
      stageName: `build-${this.environmentName}`,
      actions,
      placement: {
        justAfter: this.infrastructureStage,
      },
    });
  }

  private buildDeployStage() {
    const actions = Array.from(this.deployActions);
    this.deployStage = this.pipeline.addStage({
      stageName: `deploy-${this.environmentName}`,
      actions,
      placement: {
        justAfter: this.buildStage,
      },
    });
  }

  private composePipeline() {
    this.buildPipeline();
    this.buildSourceStage();
    this.buildInfrastructureStage();
    this.buildBuildStage();
    this.buildDeployStage();
  }

  public registerConstructs(constructs: Pipelineable[]) {
    constructs.forEach((construct) => {
      const buildOutput = new Artifact();
      const deployOutput = new Artifact();
      construct
        .getBuildActions({
          inputArtifact: this.sourceOutput,
          outputArtifact: buildOutput,
        })
        .forEach((action) => this.buildActions.add(action));
      construct
        .getDeployActions({
          inputArtifact: buildOutput,
          outputArtifact: deployOutput,
        })
        .forEach((action) => this.deployActions.add(action));
    });
    this.composePipeline();
  }
}

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
  environmentName: Environment;
  gitRepository: Repository;
  name: string;
}

export class PipelineManager extends Construct {
  private buildActions: Set<IAction> = new Set();
  private buildStage: IStage;
  private deployActions: Set<IAction> = new Set();
  private deployStage: IStage;
  private environmentName: Environment;
  private gitRepository: Repository;
  private infrastructureStage: IStage;
  private name: string;
  private pipeline: Pipeline;
  private sourceOutput: Artifact;
  private sourceStage: IStage;

  constructor(scope: Construct, id: string, props: PipelineManagerProps) {
    super(scope, id);
    const { environmentName, gitRepository, name } = props;

    this.environmentName = environmentName;
    this.gitRepository = gitRepository;
    this.name = name;
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
      branch: this.environmentName,
      output: this.sourceOutput,
      repository: this.gitRepository,
      runOrder: 1,
    });
    this.sourceStage = this.pipeline.addStage({
      actions: [sourceAction],
      stageName: `source-${this.environmentName}`,
    });
  }

  private buildBuildStage() {
    const actions = Array.from(this.buildActions);
    this.buildStage = this.pipeline.addStage({
      actions,
      placement: {
        justAfter: this.sourceStage,
      },
      stageName: `build-application-${this.environmentName}`,
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
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
      roleName: infrastructureRoleName,
    });
    const infrastructureBuildProject = new PipelineProject(this, infrastructureProjectName, {
      buildSpec: BuildSpec.fromObject(infrastructureProjectBuildSpec),
      environment: {
        buildImage: LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:3.0'),
        privileged: true,
      },
      projectName: infrastructureProjectName,
      role,
    });
    const infrastructureBuildActionName = `${this.name}-infrastructure-build-action`;
    const infrastructureBuildAction = new CodeBuildAction({
      actionName: infrastructureBuildActionName,
      input: this.sourceOutput,
      project: infrastructureBuildProject,
      runOrder: 1,
    });
    this.infrastructureStage = this.pipeline.addStage({
      actions: [infrastructureBuildAction],
      placement: {
        justAfter: this.buildStage,
      },
      stageName: `update-infrastructure-${this.environmentName}`,
    });
  }

  private buildDeployStage() {
    const actions = Array.from(this.deployActions);
    this.deployStage = this.pipeline.addStage({
      actions,
      placement: {
        justAfter: this.infrastructureStage,
      },
      stageName: `deploy-application-${this.environmentName}`,
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

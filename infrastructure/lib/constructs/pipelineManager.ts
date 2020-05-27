import { Repository } from '@aws-cdk/aws-codecommit';
import { Artifact, IAction, IStage, Pipeline } from '@aws-cdk/aws-codepipeline';
import { CodeCommitSourceAction } from '@aws-cdk/aws-codepipeline-actions';
import { Role } from '@aws-cdk/aws-iam';
import { Construct } from '@aws-cdk/core';
import { Environment } from '../pillar-stack';

export type GetPipelineActionsProps = {
  inputArtifact: Artifact;
  outputArtifact?: Artifact;
};

export interface Pipelineable {
  getBuildActions(buildArtifacts: GetPipelineActionsProps): IAction[];
  getDeployActions(deployArtifacts: GetPipelineActionsProps): IAction[];
}

export interface PipelineManagerProps {
  name: string;
  environmentName: Environment;
  gitRepository: Repository;
}

export class PipelineManager extends Construct {
  public name: string;
  public environmentName: Environment;
  public gitRepository: Repository;

  public role: Role;
  public pipeline: Pipeline;

  public sourceOutput: Artifact;

  public sourceStage: IStage;
  public buildStage: IStage;
  public deployStage: IStage;

  private buildActions: Set<IAction> = new Set();
  private deployActions: Set<IAction> = new Set();

  constructor(scope: Construct, id: string, props: PipelineManagerProps) {
    super(scope, id);
    const { name, environmentName, gitRepository } = props;

    this.name = name;
    this.environmentName = environmentName;
    this.gitRepository = gitRepository;
    this.sourceOutput = new Artifact();
  }

  private buildPipeline() {
    const pipelineName = `${this.name}-pipeline`;
    this.pipeline = new Pipeline(this, pipelineName, {
      pipelineName,
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

  private buildBuildStage() {
    const actions = Array.from(this.buildActions);
    this.buildStage = this.pipeline.addStage({
      stageName: `build-${this.environmentName}`,
      actions,
      placement: {
        justAfter: this.sourceStage,
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

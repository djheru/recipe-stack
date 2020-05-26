import { Construct } from '@aws-cdk/core';
import { Artifact, IAction, IStage, Pipeline } from '@aws-cdk/aws-codepipeline';
import { Role, ManagedPolicy, ServicePrincipal } from '@aws-cdk/aws-iam';
import { CodeCommitSourceAction } from '@aws-cdk/aws-codepipeline-actions';
import { Repository } from '@aws-cdk/aws-codecommit';
import { Environment } from '../pillar-stack';

export interface Pipelineable {
  getBuildActions({
    buildInputArtifact,
    buildOutputArtifact,
  }: {
    buildInputArtifact: Artifact;
    buildOutputArtifact: Artifact;
  }): IAction[];
  getDeployActions({
    deployInputArtifact,
    deployOutputArtifact,
  }: {
    deployInputArtifact: Artifact;
    deployOutputArtifact?: Artifact;
  }): IAction[];
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

  public sourceStage: IStage;
  public sourceOutput: Artifact;

  public buildStage: IStage;
  public buildOutput: Artifact;

  public deployStage: IStage;
  public deployOutput: Artifact;

  private buildActions: Set<IAction> = new Set();
  private deployActions: Set<IAction> = new Set();

  constructor(scope: Construct, id: string, props: PipelineManagerProps) {
    super(scope, id);
    const { name, environmentName, gitRepository } = props;

    this.name = name;
    this.environmentName = environmentName;
    this.gitRepository = gitRepository;
    this.sourceOutput = new Artifact();
    this.buildOutput = new Artifact();
    this.deployOutput = new Artifact();
  }

  public compose() {
    this.buildPipeline();
    this.buildSourceStage();
    this.buildBuildStage();
    this.buildDeployStage();
  }

  public registerConstruct(construct: Pipelineable) {
    construct
      .getBuildActions({
        buildInputArtifact: this.sourceOutput,
        buildOutputArtifact: this.buildOutput,
      })
      .forEach((action) => this.buildActions.add(action));
    construct
      .getDeployActions({
        deployInputArtifact: this.buildOutput,
        deployOutputArtifact: this.deployOutput,
      })
      .forEach((action) => this.deployActions.add(action));
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
}

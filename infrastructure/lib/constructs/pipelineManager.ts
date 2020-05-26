import { Construct } from '@aws-cdk/core';
import { IAction, Pipeline } from '@aws-cdk/aws-codepipeline';
import { CodeBuildAction, CodeCommitSourceAction } from '@aws-cdk/aws-codepipeline-actions';
import { Environment } from '../pillar-stack';

export interface Pipelineable {
  getBuildActions(): IAction[];
  getDeployActions(): IAction[];
}

export interface PipelineManagerProps {
  name: string;
  environmentName: Environment;
}

export class PipelineManager extends Construct {
  public name: string;
  public environmentName: Environment;

  private buildActions: Set<IAction> = new Set();
  private deployActions: Set<IAction> = new Set();

  private pipeline: Pipeline;

  constructor(scope: Construct, id: string, props: PipelineManagerProps) {
    super(scope, id);
  }

  public registerConstruct(construct: Pipelineable) {
    construct.getBuildActions().forEach((action) => this.buildActions.add(action));
    construct.getDeployActions().forEach((action) => this.deployActions.add(action));
  }

  private buildPipeline() {}
}

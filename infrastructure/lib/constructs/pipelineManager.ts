import { Construct } from '@aws-cdk/core';
import { IAction } from '@aws-cdk/aws-codepipeline';
import { Environment } from '../pillar-stack';

export interface Pipelineable {
  getBuildActions(): IAction[];
  getTestActions(): IAction[];
  getDeployActions(): IAction[];
}

export interface PipelineManagerProps {
  name: string;
  environmentName: Environment;
}

export class PipelineManager extends Construct {
  public name: string;
  public environmentName: Environment;
  private testActions: Set<IAction> = new Set();
  private buildActions: Set<IAction> = new Set();
  private deployActions: Set<IAction> = new Set();

  constructor(scope: Construct, id: string, props: PipelineManagerProps) {
    super(scope, id);
  }

  public registerConstruct(construct: Pipelineable) {
    construct.getBuildActions().forEach((action) => this.buildActions.add(action));
    construct.getTestActions().forEach((action) => this.testActions.add(action));
    construct.getDeployActions().forEach((action) => this.deployActions.add(action));
  }
}

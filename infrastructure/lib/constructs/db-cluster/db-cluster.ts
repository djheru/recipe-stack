import {
  IConnectable,
  InstanceClass,
  InstanceProps,
  InstanceSize,
  InstanceType,
  Port,
  SubnetType,
  Vpc,
} from '@aws-cdk/aws-ec2';
import {
  BackupProps,
  DatabaseCluster,
  DatabaseClusterEngine,
  DatabaseSecret,
  IParameterGroup,
  Login,
  ParameterGroup,
} from '@aws-cdk/aws-rds';
import { CfnOutput, Construct, Duration, RemovalPolicy, Tag } from '@aws-cdk/core';
import { Environment } from '..';

export interface DbClusterProps {
  allowedConnections?: IConnectable[];
  backup?: BackupProps;
  clusterIdentifier?: string;
  defaultDatabaseName?: string;
  engine?: DatabaseClusterEngine;
  engineVersion?: string;
  environmentName: Environment;
  instanceIdentifierBase?: string;
  instanceProps?: InstanceProps;
  instances?: number;
  masterUser?: Login;
  name: string;
  parameterGroup?: IParameterGroup;
  port?: number;
  removalPolicy?: RemovalPolicy;
  storageEncrypted?: boolean;
  vpc: Vpc;
}

export class DbCluster extends Construct {
  public instance: DatabaseCluster;
  public dbSecret: DatabaseSecret;
  public secretArn: string;

  private connections: IConnectable[];
  private port: number;

  constructor(scope: Construct, id: string, props: DbClusterProps) {
    super(scope, id);
    const { name, environmentName, vpc, ...restProps } = props;

    const clusterName = `pillar-${name}-${environmentName}-db`.toLowerCase();
    const dbName = clusterName.replace(/-/g, '_');
    const clusterId = `${clusterName}-cluster`;
    const parameterGroup = ParameterGroup.fromParameterGroupName(this, 'ParameterGroup', 'default.aurora-postgresql10');

    const secretName = `${clusterName}-secret`;
    this.dbSecret = new DatabaseSecret(this, secretName, {
      username: `${dbName}_admin`,
    });
    this.secretArn = this.dbSecret.secretArn;

    this.exportValue({
      description: `DB Secret ARN for ${secretName}`,
      exportName: `${secretName}-arn`,
      value: this.secretArn,
    });

    const defaultProps = {
      allowedConnections: [],
      backup: { retention: Duration.days(31), preferredWindow: '1:00-2:00' },
      clusterIdentifier: clusterId,
      defaultDatabaseName: dbName,
      engine: DatabaseClusterEngine.AURORA_POSTGRESQL,
      engineVersion: '10.11',
      instanceIdentifierBase: clusterName,
      instanceProps: {
        instanceType: InstanceType.of(InstanceClass.BURSTABLE3, InstanceSize.MEDIUM),
        vpcSubnets: {
          subnetType: SubnetType.PRIVATE,
        },
        vpc,
      },
      instances: 2,
      masterUser: {
        username: this.dbSecret.secretValueFromJson('username').toString(),
        password: this.dbSecret.secretValueFromJson('password'),
      },
      parameterGroup,
      port: 5432,
      removalPolicy: RemovalPolicy.RETAIN,
      storageEncrypted: true,
    };

    const params = { ...defaultProps, ...restProps };

    this.connections = params.allowedConnections;
    this.instance = new DatabaseCluster(this, clusterId, params);
    this.port = params.port;

    this.allowConnections();

    Tag.add(this, 'name', name);
    Tag.add(this, 'environmentName', environmentName);
    Tag.add(this, 'description', `RDS cluster for ${name} running in ${environmentName}`);
  }

  private exportValue(params: { description: string; exportName: string; value: string }) {
    const { exportName, description, value } = params;
    new CfnOutput(this, exportName, {
      description,
      exportName,
      value,
    });
  }

  private allowConnections() {
    this.connections.forEach((connection) => {
      this.instance.connections.allowFrom(connection, Port.tcp(this.port));
    });
  }
}

import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as Pillar from '../lib/pillar-stack';

test('Empty Stack', () => {
  const app = new cdk.App();
  // WHEN
  const stack = new Pillar.PillarStack(app, 'MyTestStack', { environmentName: 'dev' });
  // THEN
  expectCDK(stack).to(
    matchTemplate(
      {
        Resources: {},
      },
      MatchStyle.EXACT,
    ),
  );
});

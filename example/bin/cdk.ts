#!/usr/bin/env node
import 'source-map-support/register';
import {ExampleStack} from '../src/exampleStack';
import {CDKApplication} from 'opinionated-cdk-pipeline';

new CDKApplication({
    stacks: {
        create: (scope, projectName, envName) => {
            new ExampleStack(scope, 'ExampleStack', {stackName: `${projectName}-${envName}-ExampleStack`});
        },
    },
    repository: {
        host: 'bitbucket',
        name: 'merapar/opinionated-cdk-pipeline',
    },
    packageManager: 'pnpm',
    commands: {
        preInstall: [
            'npm install',
            'npm run build',
            'cd example',
        ],
    },
    cdkOutputDirectory: 'example/cdk.out',
    pipeline: [
        {
            environment: 'test',
            post: [
                'echo "do integration tests here"',
            ],
        },
    ],
    codePipeline: {
        useChangeSets: false,
        selfMutation: false,
    },
    slackNotifications: {
        workspaceId: 'T0D4SS2Q1',
        channelId: 'C04S33E0G8Y',
    },
});

#!/usr/bin/env node
import 'source-map-support/register';
import {ExampleStack} from '../src/exampleStack';
import {CDKApplication} from 'opinionated-cdk-pipeline';

// eslint-disable-next-line @typescript-eslint/no-unsafe-call
new CDKApplication({
    stacks: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        create: (scope, projectName, envName) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            new ExampleStack(scope, 'ExampleStack', {stackName: `${projectName}-${envName}-ExampleStack`});
        },
    },
    repository: {
        host: 'gitlab',
        name: '',
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
        selfMutation: false,
    },
});

# Opinionated CDK CI Pipeline

[![NPM](https://img.shields.io/npm/v/opinionated-ci-pipeline?color=blue)](https://www.npmjs.com/package/opinionated-ci-pipeline)
[![PyPI](https://img.shields.io/pypi/v/opinionated-ci-pipeline?color=blue)](https://pypi.org/project/opinionated-ci-pipeline/)

CI/CD utilizing [CDK Pipelines](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.pipelines-readme.html).

See the [announcement blog post](https://articles.merapar.com/finally-the-cdk-ci-pipeline-that-serverless-deserves) for examples and architecture diagrams.

Features:

- pipeline deploying application from the default branch
  to multiple environments on multiple accounts,
- feature branch deployments to ephemeral environments,
- development environments deployments from the local CLI,
- build status notifications to repository commits,
- build failures notifications to SNS.

Currently supported source repositories are GitHub and Bitbucket.

## Table of contents

- [Table of contents](#table-of-contents)
- [Usage](#usage)
    - [1. Install](#1-install)
    - [2. Set context parameters](#2-set-context-parameters)
    - [3. Create `CDKApplication`](#3-create-cdkapplication)
    - [4. Create repository access token](#4-create-repository-access-token)
        - [GitHub](#github)
        - [Bitbucket](#bitbucket)
    - [5. Bootstrap the CDK](#5-bootstrap-the-cdk)
    - [6. Deploy the CI Stack](#6-deploy-the-ci-stack)
    - [Deploy development environment](#deploy-development-environment)
- [Parameters](#parameters)
- [Notifications and alarms](#notifications-and-alarms)
- [How to](#how-to)
    - [Run unit tests during build](#run-unit-tests-during-build)
    - [Enable Docker](#enable-docker)
- [Library development](#library-development)

## Usage

To set up, you need to complete the following steps:

1. Install the library in your project.
2. Specify context parameters.
3. Create `CDKApplication` with build process configuration.
4. Create repository access token.
5. Bootstrap the CDK on the AWS account(s).
6. Deploy the CI.

At the end, you will have CI pipeline in place,
and be able to deploy your own custom environment from the CLI as well.

### 1. Install

For Node.js:

```bash
npm install -D opinionated-ci-pipeline
```

For Python:

```bash
pip install opinionated-ci-pipeline
```

### 2. Set context parameters

Add project name and environments config in the `cdk.json` as `context` parameters.
Each environment must have `account` and `region` provided.

```json
{
  "app": "...",
  "context": {
    "projectName": "myproject",
    "environments": {
      "default": {
        "account": "111111111111",
        "region": "us-east-1"
      },
      "prod": {
        "account": "222222222222",
        "region": "us-east-1"
      }
    }
  }
}
```

The project name will be used as a prefix for the deployed CI Stack name.

Environment names should match environments provided later
in the `CDKApplication` configuration.

The optional `default` environment configuration is used as a fallback.

The CI pipeline itself is deployed to the `ci` environment,
with a fallback to the `default` environment as well.

### 3. Create `CDKApplication`

In the CDK entrypoint script referenced by the `cdk.json` `app` field,
replace the content with an instance of `CDKApplication`:

```ts
#!/usr/bin/env node
import 'source-map-support/register';
import {ExampleStack} from '../lib/exampleStack';
import {CDKApplication} from 'opinionated-ci-pipeline';

new CDKApplication({
    stacks: {
        create: (scope, projectName, envName) => {
            new ExampleStack(scope, 'ExampleStack', {stackName: `${projectName}-${envName}-ExampleStack`});
        },
    },
    repository: {
        host: 'github',
        name: 'organization/repository',
    },
    packageManager: 'npm',
    pipeline: [
        {
            environment: 'test',
            post: [
                'echo "do integration tests here"',
            ],
        },
        {
            environment: 'prod',
        },
    ],
});
```

This configures the application with one Stack
and a pipeline deploying to an environment `test`,
running integration tests, and deploying to environment `prod`.

The `test` and `prod` environments will be deployed
from the branch `main` (by default).
All other branches will be deployed to separate environments.
Those feature-branch environments will be destroyed after the branch is removed.

To allow deployment of multiple environments,
the Stack(s) name must include the environment name.

### 4. Create repository access token

An access to the source repository is required
to fetch code and send build status notifications.

Once access token is created, save it in SSM Parameter Store
as a `SecureString` under the path `/{projectName}/ci/repositoryAccessToken`.

See instructions below on how to create the token
for each supported repository host.

#### GitHub

Create [a fine-grained personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token#creating-a-fine-grained-personal-access-token)
with read-only access for `Contents`
read and write access for `Commit statuses` and `Webhooks`.

#### Bitbucket

In Bitbucket, go to your repository.
Open Settings → Access tokens.
There, create a new Repository Access Token
with `repository:write` and `webhook` scopes.

### 5. Bootstrap the CDK

[Bootstrap the CDK](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html)
on the account holding the CI pipeline
and all other accounts the pipeline will be deploying to.

When bootstrapping other accounts, add the `--trust` parameter
with the account ID of the account holding the pipeline.

### 6. Deploy the CI Stack

Run:

```bash
cdk deploy -c ci=true
```

### Deploy development environment

Run:

```bash
cdk deploy -c env=MYENV --all
```

to deploy arbitrary environments.

## Parameters

<table>
    <tr>
        <th>Name</th>
        <th>Type</th>
        <th>Description</th>
    </tr>
    <tr>
        <td>stacks</td>
        <td>object</td>
        <td>
An object with a create() method to create Stacks for the application.
<br/>
The same Stacks will be deployed with main pipeline, feature-branch builds, and local deployments.
        </td>
    </tr>
    <tr>
        <td>packageManager</td>
        <td>npm | pnpm</td>
        <td>
Package manager used in the repository.
<br/>

If provided, the `install` command will be set to install dependencies using given package manager.

</td>
    </tr>
    <tr>
        <td>commands</td>
        <td>object</td>
        <td>

Commands executed to build and deploy the application.
<br/>
The following commands are set by default:

- `install`
- `synthPipeline`
- `deployEnvironment`
- `destroyEnvironment`

If you override the `install` command,
either install the `aws-cdk@2` globally
or modify the other 3 commands to use the local `cdk` binary.
<br/>
Commands executed on particular builds:

- main pipeline:
    - `preInstall`
    - `install`
    - `buildAndTest`
    - `synthPipeline`
- feature branch environment deployment:
    - `preInstall`
    - `install`
    - `buildAndTest`
    - `deployEnvironment`
- feature branch environment destruction:
    - `preInstall`
    - `install`
    - `destroyEnvironment`
      </td>
      </tr>
      <tr>
          <td>cdkOutputDirectory</td>
          <td>string</td>
          <td>

The location where CDK outputs synthetized files.
Corresponds to the CDK Pipelines `ShellStepProps#primaryOutputDirectory`.
</td>
      </tr>
      <tr>
          <td>pipeline</td>
          <td>object[]</td>
          <td>
CodePipeline deployment pipeline for the main repository branch.
<br/>
Can contain environments to deploy
and waves that deploy multiple environments in parallel.
<br/>
Each environment and wave can have pre and post commands
that will be executed before and after the environment or wave deployment.
            </td>
      </tr>
      <tr>
          <td>codeBuild</td>
          <td>object</td>
          <td>
Override CodeBuild properties, used for the main pipeline
as well as feature branch ephemeral environments deploys and destroys.
</td>
      </tr>
      <tr>
          <td>codePipeline</td>
          <td>object</td>
          <td>Override CodePipeline properties.</td>
      </tr>
      <tr>
          <td>slackNotifications</td>
          <td>object</td>
          <td>
Configuration for Slack notifications.
Requires configuring AWS Chatbot client manually first.
</td>
      </tr>
</table>

## Notifications and alarms

Stack creates SNS Topics with notifications for
main pipeline failures and feature branch build failures.
Their ARNs are saved in SSM Parameters and outputed by the stack:

- main pipeline failures:
    - SSM: `/{projectName}/ci/pipelineFailuresTopicArn`
    - Stack exported output: `{projectName}-ci-pipelineFailuresTopicArn`
- feature branch build failures:
    - SSM: `/{projectName}/ci/featureBranchBuildFailuresTopicArn`
    - Stack exported output: `{projectName}-ci-featureBranchBuildFailuresTopicArn`

If you setup Slack notifications,
you can configure those failure notifications to be sent to Slack.

Moreover, if you setup Slack notifications,
an additional SNS Topic will be created
to which you can send CloudWatch Alarms.
It's ARN is provided:

- SSM: `/{projectName}/ci/slackAlarmsTopicArn`
- Stack exported output: `{projectName}-ci-slackAlarmsTopicArn`

## How to

### Run unit tests during build

Set commands in the `commands.buildAndTest`:

```ts
{
    commands: {
        buildAndTest: [
            'npm run lint',
            'npm run test',
        ]
    }
}
```

### Enable Docker

Set `codeBuild.buildEnvironment.privileged` to `true`:

```ts
{
    codeBuild: {
        buildEnvironment: {
            privileged: true
        }
    }
}
```

## Library development

Project uses [jsii](https://aws.github.io/jsii/)
to generate packages for different languages.

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

Change `example/bin/cdk.ts` `repository` to point to your repository.

Then, install and deploy the CI for the example application:

```bash
cd example
pnpm install
pnpm cdk deploy -c ci=true
```

One-line command to re-deploy after changes (run from the `example` directory):

```bash
(cd .. && npm run build && cd example && cdk deploy -m direct -c ci=true) 
```

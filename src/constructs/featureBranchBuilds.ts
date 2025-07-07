import {Aws, Stack} from 'aws-cdk-lib';
import {BuildSpec, Project, Source} from 'aws-cdk-lib/aws-codebuild';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import {Construct} from 'constructs';
import {CustomNodejsFunction} from './customNodejsFunction';
import * as path from 'path';
import {NotificationsTopic} from './notificationsTopic';
import {ApplicationProps, ResolvedApplicationProps} from '../applicationProps';
import {PolicyStatement} from 'aws-cdk-lib/aws-iam';
import {Code} from 'aws-cdk-lib/aws-lambda';
import {Topic} from 'aws-cdk-lib/aws-sns';
import {getProjectName} from '../util/context';
import {IStringParameter} from 'aws-cdk-lib/aws-ssm';
import * as s3 from 'aws-cdk-lib/aws-s3';
import {checkoutCommands} from '../util/checkout';

export interface FeatureBranchBuildsProps extends Pick<ResolvedApplicationProps,
    'repository' | 'commands' | 'codeBuild'
> {
    sourceBucket: s3.IBucket;
    repositoryTokenParam: IStringParameter;
}

export class FeatureBranchBuilds extends Construct {

    readonly failuresTopic: Topic;

    constructor(scope: Construct, id: string, props: FeatureBranchBuildsProps) {
        super(scope, id);

        const deployProject = this.createDeployProject(
            props.sourceBucket, props.codeBuild, props.commands,
        );
        this.createDeployNotifications(deployProject, props.repository, props.repositoryTokenParam);

        this.failuresTopic = this.createBuildFailuresTopic(deployProject);

        this.createDestroyProject(
            props.sourceBucket, props.codeBuild, props.commands,
        );
    }

    private createDeployProject(
        sourceBucket: s3.IBucket,
        codeBuild: FeatureBranchBuildsProps['codeBuild'],
        commands: FeatureBranchBuildsProps['commands'],
    ): Project {
        const deployProject = new Project(this, 'DeployProject', {
            projectName: `${Stack.of(this).stackName}-featureBranch-deploy`,
            source: Source.s3({
                bucket: sourceBucket,
                path: 'repository-file-placeholder-to-override.zip',
            }),
            ...codeBuild,
            environment: codeBuild.buildEnvironment,
            buildSpec: BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        commands: [
                            ...checkoutCommands,
                            'git checkout ${BRANCH_NAME}',
                            'ENV_NAME=$(echo ${BRANCH_NAME} | awk \'{ gsub("/", "-", $0); print tolower($0); }\')',
                            ...(commands.preInstall || []),
                            ...(commands.install || []),
                        ],
                    },
                    build: {
                        commands: [
                            ...(commands.buildAndTest || []),
                            ...(commands.preDeployEnvironment || []),
                            ...commands.deployEnvironment,
                            ...(commands.postDeployEnvironment || []),
                        ],
                    },
                },
            }),
        });

        codeBuild.rolePolicy?.forEach(policy => deployProject.addToRolePolicy(policy));
        sourceBucket.grantRead(deployProject);
        this.grantAssumeCDKRoles(deployProject);

        return deployProject;
    }

    private createDeployNotifications(deployProject: Project, repository: ApplicationProps['repository'], repoTokenParam: IStringParameter) {
        const deployStatusFunction = new CustomNodejsFunction(this, 'DeployStatus', {
            code: Code.fromAsset(path.join(__dirname, '..', 'lambda', 'featureBranchDeployStatus')),
            environment: {
                REPOSITORY_HOST: repository.host,
                REPOSITORY_NAME: repository.name,
                REPOSITORY_TOKEN_PARAM_NAME: repoTokenParam.parameterName,
            },
        });
        repoTokenParam.grantRead(deployStatusFunction);

        deployProject.onStateChange('OnDeployStateChange', {
            target: new targets.LambdaFunction(deployStatusFunction),
        });
    }

    private createBuildFailuresTopic(deployProject: Project): Topic {
        const failuresTopic = new NotificationsTopic(this, 'FeatureBranchBuildFailuresTopic', {
            projectName: getProjectName(this),
            notificationName: 'featureBranchBuildFailures',
        });

        deployProject.notifyOnBuildFailed('NotifyOnFeatureBuildFailure', failuresTopic.topic, {
            notificationRuleName: `${Stack.of(this).stackName}-featureBuildFailure`, // ensure unique name
        });

        return failuresTopic.topic;
    }

    private createDestroyProject(
        sourceBucket: s3.IBucket,
        codeBuild: FeatureBranchBuildsProps['codeBuild'],
        commands: FeatureBranchBuildsProps['commands'],
    ): Project {
        const destroyProject = new Project(this, 'DestroyProject', {
            projectName: `${Stack.of(this).stackName}-featureBranch-destroy`,
            source: Source.s3({
                bucket: sourceBucket,
                path: 'repository-file-placeholder-to-override.zip',
            }),
            ...codeBuild,
            environment: codeBuild.buildEnvironment,
            buildSpec: BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        commands: [
                            ...checkoutCommands,
                            'ENV_NAME=$(echo ${BRANCH_NAME} | awk \'{ gsub("/", "-", $0); print tolower($0); }\')',
                            ...(commands.preInstall || []),
                            ...(commands.install || []),
                        ],
                    },
                    build: {
                        commands: [
                            ...(commands.preDestroyEnvironment || []),
                            ...commands.destroyEnvironment,
                            ...(commands.postDestroyEnvironment || []),
                            'aws s3 rm s3://${CODEBUILD_SOURCE_REPO_URL}',
                        ],
                    },
                },
            }),
        });

        codeBuild.rolePolicy?.forEach(policy => destroyProject.addToRolePolicy(policy));
        sourceBucket.grantRead(destroyProject);
        sourceBucket.grantDelete(destroyProject);
        this.grantAssumeCDKRoles(destroyProject);

        return destroyProject;
    }

    private grantAssumeCDKRoles(project: Project) {
        const qualifier = Stack.of(this).synthesizer.bootstrapQualifier || 'hnb659fds';
        project.addToRolePolicy(new PolicyStatement({
            actions: ['sts:AssumeRole'],
            resources: [
                `arn:aws:iam::${Aws.ACCOUNT_ID}:role/cdk-${qualifier}-deploy-role-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
                `arn:aws:iam::${Aws.ACCOUNT_ID}:role/cdk-${qualifier}-file-publishing-role-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
                `arn:aws:iam::${Aws.ACCOUNT_ID}:role/cdk-${qualifier}-image-publishing-role-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
                `arn:aws:iam::${Aws.ACCOUNT_ID}:role/cdk-${qualifier}-lookup-role-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
            ],
        }));
    }
}

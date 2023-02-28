import {Aws, Stack} from 'aws-cdk-lib';
import {BuildSpec, Project, Source} from 'aws-cdk-lib/aws-codebuild';
import {Repository} from 'aws-cdk-lib/aws-codecommit';
import {ApiDestination, EventField, OnEventOptions, Rule, RuleTargetInput} from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import {CodeBuildProject} from 'aws-cdk-lib/aws-events-targets';
import {Construct} from 'constructs';
import {CustomNodejsFunction} from './customNodejsFunction';
import * as path from 'path';
import {NotificationsTopic} from './notificationsTopic';
import {assertUnreachable} from '../util/types';
import {ResolvedApplicationProps} from '../applicationProps';
import {PolicyStatement} from 'aws-cdk-lib/aws-iam';
import {Code} from 'aws-cdk-lib/aws-lambda';
import {Topic} from 'aws-cdk-lib/aws-sns';

export interface FeatureBranchBuildsProps extends Pick<ResolvedApplicationProps,
    'projectName' | 'repository' | 'commands' | 'codeBuild'
> {
    codeCommitRepository: Repository;
    repositoryApiDestination: ApiDestination;
}

export class FeatureBranchBuilds extends Construct {

    readonly failuresTopic: Topic;

    constructor(scope: Construct, id: string, props: FeatureBranchBuildsProps) {
        super(scope, id);

        const source = Source.codeCommit({repository: props.codeCommitRepository});

        const deployProject = this.createDeployProject(
            source, props.codeBuild, props.commands, props.codeCommitRepository, props.repository.defaultBranch,
        );
        this.createDeployNotifications(deployProject, props.repository.host, props.repositoryApiDestination);

        this.failuresTopic = this.createBuildFailuresTopic(deployProject, props.projectName);

        this.createDestroyProject(
            source, props.codeBuild, props.commands, props.codeCommitRepository, props.repository.defaultBranch,
        );
    }

    private createDeployProject(
        source: Source,
        codeBuild: FeatureBranchBuildsProps['codeBuild'],
        commands: FeatureBranchBuildsProps['commands'],
        repository: Repository,
        defaultBranch: string,
    ): Project {
        const deployProject = new Project(this, 'DeployProject', {
            projectName: `${Stack.of(this).stackName}-featureBranch-deploy`,
            source,
            timeout: codeBuild.timeout,
            environment: codeBuild.buildEnvironment,
            buildSpec: BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        commands: [
                            'ENV_NAME=$(echo ${BRANCH_NAME} | awk \'{print tolower($0)}\')',
                            ...(commands.preInstall || []),
                            ...(commands.install || []),
                        ],
                    },
                    build: {
                        commands: [
                            ...(commands.buildAndTest || []),
                            ...commands.deployEnvironment,
                        ],
                    },
                },
            }),
        });

        this.grantAssumeCDKRoles(deployProject);

        repository.onCommit('OnBranchCommit', this.createProjectTriggerOptions(deployProject, defaultBranch, true));

        return deployProject;
    }

    private createDeployNotifications(deployProject: Project, repositoryType: FeatureBranchBuildsProps['repository']['host'], repositoryApiDestination: ApiDestination) {
        const deployStatusEventSourceName = `${Stack.of(this).stackName}.featureBranchDeployStatus`;

        const deployStatusFunction = new CustomNodejsFunction(this, 'DeployStatus', {
            code: Code.fromAsset(path.join(__dirname, '..', 'lambda', 'featureBranchDeployStatus')),
            environment: {
                'REPOSITORY_TYPE': repositoryType,
                'EVENT_SOURCE_NAME': deployStatusEventSourceName,
            },
        });

        deployStatusFunction.addToRolePolicy(new PolicyStatement({
            actions: ['events:PutEvents'],
            resources: [`arn:aws:events:${Aws.REGION}:${Aws.ACCOUNT_ID}:event-bus/default`],
            conditions: {
                StringEquals: {
                    'events:source': deployStatusEventSourceName,
                },
            },
        }));

        deployProject.onStateChange('OnDeployStateChange', {
            target: new targets.LambdaFunction(deployStatusFunction),
        });

        new Rule(this, 'SendDeployStatusToRepositoryRule', {
            eventPattern: {
                source: [deployStatusEventSourceName],
                detailType: ['CodeBuild Build State Change'],
            },
            targets: [
                new targets.ApiDestination(repositoryApiDestination, {
                    pathParameterValues: ['$.detail.commit-sha'],
                    event: this.createStatusEvent(repositoryType),
                }),
            ],
        });
    }

    private createStatusEvent(repositoryType: FeatureBranchBuildsProps['repository']['host']): RuleTargetInput {
        switch (repositoryType) {
        case 'github':
            return RuleTargetInput.fromObject({
                'state': EventField.fromPath('$.detail.state'),
                'target_url': `https://${EventField.fromPath('$.region')}.console.aws.amazon.com/codesuite/codebuild/projects/${EventField.fromPath('$.detail.project-name')}/build/${EventField.fromPath('$.detail.build-id')}`,
                'context': EventField.fromPath('$.detail.project-name'),
            });
        case 'bitbucket':
            return RuleTargetInput.fromObject({
                'key': 'AWS-PIPELINE-BUILD',
                'state': EventField.fromPath('$.detail.state'),
                'name': EventField.fromPath('$.detail.project-name'),
                'description': 'Feature branch deployment on AWS CodeBuild',
                'url': `https://${EventField.fromPath('$.region')}.console.aws.amazon.com/codesuite/codebuild/projects/${EventField.fromPath('$.detail.project-name')}/build/${EventField.fromPath('$.detail.build-id')}`,
            });
        default:
            return assertUnreachable(repositoryType);
        }
    }

    private createBuildFailuresTopic(deployProject: Project, projectName: string): Topic {
        const failuresTopic = new NotificationsTopic(this, 'FeatureBranchBuildFailuresTopic', {
            projectName: projectName,
            notificationName: 'featureBranchBuildFailures',
        });

        // for better visibility, use EventBridge Rules instead of CodeStar Notifications that are generated with project.notifyOnBuildFailed()
        deployProject.onBuildFailed('OnFeatureBuildFailure', {
            target: new targets.SnsTopic(failuresTopic.topic),
        });

        return failuresTopic.topic;
    }

    private createDestroyProject(
        source: Source,
        codeBuild: FeatureBranchBuildsProps['codeBuild'],
        commands: FeatureBranchBuildsProps['commands'],
        repository: Repository,
        defaultBranch: string,
    ): Project {
        const destroyProject = new Project(this, 'DestroyProject', {
            projectName: `${Stack.of(this).stackName}-featureBranch-destroy`,
            source,
            timeout: codeBuild.timeout,
            environment: codeBuild.buildEnvironment,
            buildSpec: BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        commands: [
                            'ENV_NAME=$(echo ${BRANCH_NAME} | awk \'{print tolower($0)}\')',
                            ...(commands.preInstall || []),
                            ...(commands.install || []),
                        ],
                    },
                    build: {
                        commands: [
                            ...commands.destroyEnvironment,
                        ],
                    },
                },
            }),
        });

        this.grantAssumeCDKRoles(destroyProject);

        repository.onReferenceDeleted('OnBranchRemoval', this.createProjectTriggerOptions(destroyProject, defaultBranch));

        return destroyProject;
    }

    private createProjectTriggerOptions(targetProject: Project, defaultBranch: string, withSourceVersion = false): OnEventOptions {
        return {
            eventPattern: {
                detail: {
                    referenceType: ['branch'],
                    referenceName: [
                        {'anything-but': [defaultBranch]},
                    ],
                    referenceFullName: [
                        {'anything-but': {prefix: 'refs/remotes/'}},
                    ],
                },
            },
            target: new CodeBuildProject(targetProject, {
                event: RuleTargetInput.fromObject({
                    sourceVersion: withSourceVersion ? EventField.fromPath('$.detail.commitId') : undefined,
                    environmentVariablesOverride: [
                        {
                            name: 'BRANCH_NAME',
                            value: EventField.fromPath('$.detail.referenceName'),
                            type: 'PLAINTEXT',
                        },
                    ],
                }),
            }),
        };
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

import {Aws, Stack} from 'aws-cdk-lib';
import {BuildSpec, Project, Source} from 'aws-cdk-lib/aws-codebuild';
import {Repository} from 'aws-cdk-lib/aws-codecommit';
import {EventField, OnEventOptions, RuleTargetInput} from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import {CodeBuildProject} from 'aws-cdk-lib/aws-events-targets';
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

export interface FeatureBranchBuildsProps extends Pick<ResolvedApplicationProps,
    'repository' | 'commands' | 'codeBuild'
> {
    codeCommitRepository: Repository;
    repositoryTokenParam: IStringParameter;
}

export class FeatureBranchBuilds extends Construct {

    readonly failuresTopic: Topic;

    constructor(scope: Construct, id: string, props: FeatureBranchBuildsProps) {
        super(scope, id);

        const source = Source.codeCommit({repository: props.codeCommitRepository});

        const deployProject = this.createDeployProject(
            source, props.codeBuild, props.commands, props.codeCommitRepository, props.repository.defaultBranch, props.repository.featureBranchPrefixes
        );
        this.createDeployNotifications(deployProject, props.repository, props.repositoryTokenParam);

        this.failuresTopic = this.createBuildFailuresTopic(deployProject);

        this.createDestroyProject(
            source, props.codeBuild, props.commands, props.codeCommitRepository, props.repository.defaultBranch, props.repository.featureBranchPrefixes
        );
    }

    private createDeployProject(
        source: Source,
        codeBuild: FeatureBranchBuildsProps['codeBuild'],
        commands: FeatureBranchBuildsProps['commands'],
        repository: Repository,
        defaultBranch: string,
        featureBranchPrefixes?: string[],
    ): Project {
        const deployProject = new Project(this, 'DeployProject', {
            projectName: `${Stack.of(this).stackName}-featureBranch-deploy`,
            source,
            timeout: codeBuild.timeout,
            environment: codeBuild.buildEnvironment,
            vpc: codeBuild.vpc,
            securityGroups: codeBuild.securityGroups,
            subnetSelection: codeBuild.subnetSelection,
            cache: codeBuild.cache,
            buildSpec: BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        commands: [
                            'ENV_NAME=$(echo ${BRANCH_NAME} | awk \'{ gsub("/", "-", $0); print tolower($0); }\')',
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

        codeBuild.rolePolicy?.forEach(policy => deployProject.addToRolePolicy(policy));
        this.grantAssumeCDKRoles(deployProject);

        repository.onCommit('OnBranchCommit', this.createProjectTriggerOptions(deployProject, defaultBranch, featureBranchPrefixes, true));

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
        source: Source,
        codeBuild: FeatureBranchBuildsProps['codeBuild'],
        commands: FeatureBranchBuildsProps['commands'],
        repository: Repository,
        defaultBranch: string,
        featureBranchPrefixes?: string[],
    ): Project {
        const destroyProject = new Project(this, 'DestroyProject', {
            projectName: `${Stack.of(this).stackName}-featureBranch-destroy`,
            source,
            timeout: codeBuild.timeout,
            environment: codeBuild.buildEnvironment,
            vpc: codeBuild.vpc,
            securityGroups: codeBuild.securityGroups,
            subnetSelection: codeBuild.subnetSelection,
            cache: codeBuild.cache,
            buildSpec: BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        commands: [
                            'ENV_NAME=$(echo ${BRANCH_NAME} | awk \'{ gsub("/", "-", $0); print tolower($0); }\')',
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

        codeBuild.rolePolicy?.forEach(policy => destroyProject.addToRolePolicy(policy));
        this.grantAssumeCDKRoles(destroyProject);

        repository.onReferenceDeleted('OnBranchRemoval', this.createProjectTriggerOptions(destroyProject, defaultBranch, featureBranchPrefixes));

        return destroyProject;
    }

    private createProjectTriggerOptions(targetProject: Project, defaultBranch: string, featureBranchPrefixes?: string[], withSourceVersion = false): OnEventOptions {
        const referenceName = featureBranchPrefixes != null ? [{'prefix': featureBranchPrefixes }] : [{'anything-but': [defaultBranch]}];
        return {
            eventPattern: {
                detail: {
                    referenceType: ['branch'],
                    referenceName,
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

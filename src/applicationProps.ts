import {ComputeType, LinuxBuildImage} from 'aws-cdk-lib/aws-codebuild';
import {IRole} from 'aws-cdk-lib/aws-iam';
import {CodeBuildOptions, DockerCredential} from 'aws-cdk-lib/pipelines';
import {Construct} from 'constructs';
import {CIStackProps} from './ciStack';
import {PartialDeep} from 'type-fest';
import {Duration} from 'aws-cdk-lib/core';

export interface ApplicationProps {

    /**
     * An object with a create() method to create Stacks for the application.
     *
     * The same Stacks will be deployed with main pipeline, feature-branch builds, and local deployments.
     */
    readonly stacks: IStacksCreation;

    readonly repository: RepositoryProps;

    /**
     * Package manager used in the repository.
     * If provided, the install commands will be set to install dependencies using given package manager.
     */
    readonly packageManager?: 'npm' | 'pnpm';

    /**
     * Commands executed to build and deploy the application.
     */
    readonly commands?: BuildCommands;

    /**
     * The location where CDK outputs synthetized files.
     * Corresponds to the CDK Pipelines ShellStepProps#primaryOutputDirectory.
     * @default cdk.out
     */
    readonly cdkOutputDirectory?: string;

    /**
     * CodePipeline deployment pipeline for the main repository branch.
     *
     * Can contain environments to deploy
     * and waves that deploy multiple environments in parallel.
     *
     * Each environment and wave can have pre and post commands
     * that will be executed before and after the environment or wave deployment.
     */
    readonly pipeline: (WaveDeployment | EnvironmentDeployment)[];

    /**
     * Override CodeBuild properties, used for the main pipeline Build step
     * as well as feature branch ephemeral environments deploys and destroys.
     *
     * @default 1 hour timeout, compute type MEDIUM with Linux build image Standard 7.0
     */
    readonly codeBuild?: CodeBuildOptions;

    /**
     * Override CodePipeline properties.
     *
     * @default Don't use change sets
     */
    readonly codePipeline?: CodePipelineOverrides;

    /**
     * Configuration for Slack notifications.
     * Requires configuring AWS Chatbot client manually first.
     */
    readonly slackNotifications?: SlackNotifications;
}

/**
 * To provide a method as parameter, jsii requires creating a behavioral interface, prefixed with "I".
 * Mixing structural and behavioral interfaces is not always possible, hence we extract stacks creation
 * to a separate object described by this behavioral interface.
 */
export interface IStacksCreation {
    /**
     * Create Stacks for the application.
     *
     * Use provided scope as stacks' parent (first constructor argument).
     *
     * Stacks must include provided environment name in their names
     * to distinguish them when deploying multiple environments
     * (like feature-branch environments) to the same account.
     */
    create(scope: Construct, projectName: string, envName: string): void;
}

export interface RepositoryProps {
    /**
     * Repository hosting.
     */
    readonly host: 'github' | 'bitbucket';

    /** Like "my-comapny/my-repo". */
    readonly name: string;

    /**
     * Branch to deploy the environments from in the main pipeline.
     * @default main
     */
    readonly defaultBranch?: string;

    /**
     * Configure the prefix branch names that should be automatically deployed as feature branches
     * @default deploy all branches
     */
    readonly featureBranchPrefixes?: string[];
}

export interface BuildCommands {
    /**
     * Executed at the beginning of the Build step and feature branch deployment and destruction.
     */
    readonly preInstall?: string[];
    /**
     * Executed after `preInstall` in the Build step and feature branch deployment and destruction.
     * By default, installs `aws-cdk@2` globally and `npm` or `pnpm` dependencies if `packageManager` is set.
     */
    readonly install?: string[];
    /**
     * Executed after `install` in the Build step and feature branch deployment.
     */
    readonly buildAndTest?: string[];
    /**
     * Executed after the Build step. By default, synths the CDK app.
     */
    readonly synthPipeline?: string[];
    /**
     * Executed after `buildAndTest` in the feature branch deployment.
     */
    readonly preDeployEnvironment?: string[];
    /**
     * Executed after `preDeployEnvironment` in the feature branch deployment.
     * By default, deploys all CDK app stacks to the environment.
     */
    readonly deployEnvironment?: string[];
    /**
     * Executed after `deployEnvironment` in the feature branch deployment.
     */
    readonly postDeployEnvironment?: string[];
    /**
     * Executed after `install` in the feature branch destruction.
     */
    readonly preDestroyEnvironment?: string[];
    /**
     * Executed after `preDestroyEnvironment` in the feature branch destruction.
     */
    readonly destroyEnvironment?: string[];
    /**
     * Executed after `destroyEnvironment` in the feature branch destruction.
     */
    readonly postDestroyEnvironment?: string[];
}

export interface WaveDeployment {
    /**
     * Wave name.
     */
    readonly wave: string;

    /**
     * List of environments to deploy in parallel.
     */
    readonly environments: EnvironmentDeployment[];

    /**
     * Commands to execute before the wave deployment.
     */
    readonly pre?: string[];

    /**
     * Commands to execute after the wave deployment.
     */
    readonly post?: string[];

    /**
     * Commands to execute before each environment deployment.
     *
     * If environment configuration also contains commands to execute pre-deployment,
     * they will be executed after the commands defined here.
     */
    readonly preEachEnvironment?: string[];

    /**
     * Commands to execute after environment deployment.
     *
     * If environment configuration also contains commands to execute post-deployment,
     * they will be executed before the commands defined here.
     */
    readonly postEachEnvironment?: string[];
}

export interface EnvironmentDeployment {
    /**
     * Environment name.
     *
     * Environment will be deployed to AWS account and region
     * defined in cdk.json file `context/environments` properties,
     * falling back to the `default` environment settings if given environment configuration is not found.
     */
    readonly environment: string;

    /**
     * Flag indicating whether environment deployment requires manual approval.
     */
    readonly manualApproval?: boolean;

    /**
     * Commands to execute before the environment deployment.
     */
    readonly pre?: string[];

    /**
     * Commands to execute after the environment deployment.
     */
    readonly post?: string[];
}

/**
 * Since jsii does not support Partial or Omit,
 * we have to define all properties from CodePipelineProps that may be overriden manually.
 */
export interface CodePipelineOverrides {
    readonly pipelineName?: string;
    readonly selfMutation?: boolean;
    readonly dockerEnabledForSelfMutation?: boolean;
    readonly dockerEnabledForSynth?: boolean;
    readonly codeBuildDefaults?: CodeBuildOptions;
    readonly synthCodeBuildDefaults?: CodeBuildOptions;
    readonly assetPublishingCodeBuildDefaults?: CodeBuildOptions;
    readonly selfMutationCodeBuildDefaults?: CodeBuildOptions;
    readonly publishAssetsInParallel?: boolean;
    readonly dockerCredentials?: DockerCredential[];
    readonly reuseCrossRegionSupportStacks?: boolean;
    readonly role?: IRole;
    readonly useChangeSets?: boolean;
    readonly enableKeyRotation?: boolean;
}

export interface SlackChannelConfig {
    readonly workspaceId: string;
    readonly channelId: string;
}

export interface SlackNotifications {
    /**
     * Slack notifications configuration for main pipeline failures.
     * @default Slack notifications are not being sent
     */
    readonly mainPipelineFailures?: SlackChannelConfig;
    /**
     * Slack notifications configuration for feature branch deployment failures.
     * @default Slack notifications are not being sent
     */
    readonly featureBranchFailures?: SlackChannelConfig;
}

export const defaultProps = {
    repository: {
        defaultBranch: 'main',
    },
    commands: {
        install: ['npm install --location=global aws-cdk@2'],
        synthPipeline: ['cdk synth -c ci=true'],
        deployEnvironment: ['cdk deploy -c env=${ENV_NAME} --all'],
        destroyEnvironment: ['yes | cdk destroy -c env=${ENV_NAME} --all'],
    },
    codePipeline: {
        useChangeSets: false,
    },
    codeBuild: {
        timeout: Duration.hours(1),
        buildEnvironment: {
            computeType: ComputeType.MEDIUM,
            buildImage: LinuxBuildImage.STANDARD_7_0,
        },
    },
} satisfies PartialDeep<CIStackProps>;

export type ResolvedApplicationProps = ApplicationProps & typeof defaultProps;

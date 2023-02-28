import {CodePipelineCloudWatchPipelineHandler} from 'aws-lambda/trigger/codepipeline-cloudwatch-pipeline';
import {Logger} from '@aws-lambda-powertools/logger';
import {CodePipelineClient, GetPipelineExecutionCommand} from '@aws-sdk/client-codepipeline';
import {EventBridgeClient, PutEventsCommand} from '@aws-sdk/client-eventbridge';

const REPOSITORY_TYPE = process.env.REPOSITORY_TYPE || '';
const EVENT_SOURCE_NAME = process.env.EVENT_SOURCE_NAME || '';

const logger = new Logger();

const codePipeline = new CodePipelineClient({});
const eventBridge = new EventBridgeClient({});

export const handler: CodePipelineCloudWatchPipelineHandler = async (event) => {
    logger.info('Event', {event});

    const {pipeline: pipelineName, 'execution-id': pipelineExecutionId} = event.detail;
    const state = transformStateName(REPOSITORY_TYPE, event.detail.state);

    if (!state) {
        logger.warn('Ignoring unsupported state change');
        return;
    }

    const execution = await codePipeline.send(new GetPipelineExecutionCommand({
        pipelineName,
        pipelineExecutionId,
    }));

    const commitSha = execution.pipelineExecution?.artifactRevisions?.[0].revisionId;
    if (!commitSha) {
        logger.warn('Commit hash not found', {execution});
    }

    await eventBridge.send(new PutEventsCommand({
        Entries: [{
            Source: EVENT_SOURCE_NAME,
            DetailType: event['detail-type'],
            Detail: JSON.stringify({
                'pipeline-name': pipelineName,
                'execution-id': pipelineExecutionId,
                'state': state,
                'commit-sha': commitSha,
            }),
        }],
    }));
};

const transformStateName = (repositoryType: string, state: string): string | null => {
    switch (repositoryType.toLowerCase()) {
    case 'github':
        return transformStateNameForGitHub(state);
    case 'bitbucket':
        return transformStateNameForBitbucket(state);
    default:
        return null;
    }
};

const transformStateNameForGitHub = (state: string): string | null => {
    switch (state) {
    case 'STARTED':
        return 'pending';
    case 'SUCCEEDED':
        return 'success';
    case 'FAILED':
        return 'failure';
    case 'STOPPED':
        return 'error';
    default:
        return null;
    }
};

const transformStateNameForBitbucket = (state: string): string | null => {
    switch (state) {
    case 'STARTED':
        return 'INPROGRESS';
    case 'SUCCEEDED':
        return 'SUCCESSFUL';
    case 'FAILED':
        return state;
    case 'STOPPED':
        return state;
    default:
        return null;
    }
};

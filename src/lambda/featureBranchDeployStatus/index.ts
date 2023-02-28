import {Logger} from '@aws-lambda-powertools/logger';
import {EventBridgeClient, PutEventsCommand} from '@aws-sdk/client-eventbridge';
import {CodeBuildCloudWatchStateHandler} from 'aws-lambda';

const REPOSITORY_TYPE = process.env.REPOSITORY_TYPE || '';
const EVENT_SOURCE_NAME = process.env.EVENT_SOURCE_NAME || '';

const logger = new Logger();

const eventBridge = new EventBridgeClient({});

export const handler: CodeBuildCloudWatchStateHandler = async (event) => {
    logger.info('Event', {event});

    const {'project-name': projectName, 'build-id': buildArn} = event.detail;
    const buildId = buildArn.split('/')[1];
    const commitSha = event.detail['additional-information']['source-version'];

    const state = transformStateName(REPOSITORY_TYPE, event.detail['build-status']);

    if (!state) {
        logger.warn('Ignoring unsupported state change');
        return;
    }

    await eventBridge.send(new PutEventsCommand({
        Entries: [{
            Source: EVENT_SOURCE_NAME,
            DetailType: event['detail-type'],
            Detail: JSON.stringify({
                'project-name': projectName,
                'build-id': buildId,
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
    case 'IN_PROGRESS':
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
    case 'IN_PROGRESS':
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

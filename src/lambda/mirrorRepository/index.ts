import {Logger} from '@aws-lambda-powertools/logger';
import {CodeBuildClient, StartBuildCommand} from '@aws-sdk/client-codebuild';

const CODEBUILD_PROJECT_NAME = process.env.CODEBUILD_PROJECT_NAME || '';

const logger = new Logger();

const codebuild = new CodeBuildClient({});

// eslint-disable-next-line @typescript-eslint/require-await
export const handler = async (event: unknown) => {
    logger.info('Event', {event});

    await codebuild.send(new StartBuildCommand({
        projectName: CODEBUILD_PROJECT_NAME,
    }));
};

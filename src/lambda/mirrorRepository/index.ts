import {Logger} from '@aws-lambda-powertools/logger';
import {CodeBuildClient, StartBuildCommand} from '@aws-sdk/client-codebuild';
import {APIGatewayProxyHandlerV2} from 'aws-lambda/trigger/api-gateway-proxy';

const CODEBUILD_PROJECT_NAME = process.env.CODEBUILD_PROJECT_NAME || '';
const SECRET = process.env.SECRET || '';

const logger = new Logger();

const codebuild = new CodeBuildClient({});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
    logger.info('Event', {event});

    if (event.queryStringParameters?.secret !== SECRET) {
        logger.warn('Invalid secret');
        return {
            statusCode: 401,
            body: 'Invalid secret',
        };
    }

    await codebuild.send(new StartBuildCommand({
        projectName: CODEBUILD_PROJECT_NAME,
    }));

    return {
        statusCode: 202,
    };
};

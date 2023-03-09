import {Logger} from '@aws-lambda-powertools/logger';
import {CloudFormationCustomResourceEvent} from 'aws-lambda/trigger/cloudformation-custom-resource';
import {createWebhook} from './createWebhook';
import {deleteWebhook} from './deleteWebhook';
import {getSSMParameter} from '../shared/ssm';

const logger = new Logger();

export const handler = async (event: CloudFormationCustomResourceEvent): Promise<Result> => {
    logger.info('Event', {event});

    const properties = event.ResourceProperties as Properties;

    const repositoryToken = await getSSMParameter(properties.RepositoryTokenParamName);

    switch (event.RequestType) {
    case 'Create':
        return await onCreate(properties, repositoryToken);
    case 'Update':
        return await onUpdate(event.PhysicalResourceId, properties, repositoryToken);
    case 'Delete':
        return await onDelete(event.PhysicalResourceId, properties, repositoryToken);
    default:
        throw new Error('Unsupported request type');
    }
};

const onCreate = async (properties: Properties, repositoryToken: string): Promise<Result> => {
    logger.info('Creating webhook');

    const webhookId = await createWebhook(properties.RepositoryHost, repositoryToken, properties.RepositoryName, properties.WebhookUrl, `${properties.StackName} Mirror to AWS CodeCommit`);
    logger.info('Webhook created', {webhookId});

    return {
        PhysicalResourceId: webhookId,
    };
};

const onUpdate = async (webhookId: string, properties: Properties, repositoryToken: string): Promise<Result> => {
    logger.info('Updating webhook', {webhookId});

    try {
        await onDelete(webhookId, properties, repositoryToken);
    } catch (e) {
        logger.warn('Failed to delete webhook', {error: e});
    }

    return await onCreate(properties, repositoryToken);
};

const onDelete = async (webhookId: string, properties: Properties, repositoryToken: string): Promise<Result> => {
    logger.info('Deleting webhook', {webhookId});

    await deleteWebhook(properties.RepositoryHost, repositoryToken, properties.RepositoryName, webhookId);

    return {
        PhysicalResourceId: webhookId,
    };
};

interface Properties {
    ServiceToken: string;
    StackName: string;
    RepositoryHost: string;
    RepositoryName: string;
    RepositoryTokenParamName: string;
    WebhookUrl: string;
}

interface Result {
    PhysicalResourceId: string;
}

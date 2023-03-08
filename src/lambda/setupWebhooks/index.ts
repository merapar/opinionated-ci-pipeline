import {Logger} from '@aws-lambda-powertools/logger';
import {CloudFormationCustomResourceEvent} from 'aws-lambda/trigger/cloudformation-custom-resource';
import {GetParameterCommand, SSMClient} from '@aws-sdk/client-ssm';

const logger = new Logger();

const ssm = new SSMClient({});

export const handler = async (event: CloudFormationCustomResourceEvent): Promise<Result> => {
    logger.info('Event', {event});

    const properties = event.ResourceProperties as Properties;

    const repositoryToken = (await ssm.send(new GetParameterCommand({
        Name: properties.RepositoryTokenParamName,
        WithDecryption: true,
    }))).Parameter?.Value;
    if (!repositoryToken) {
        throw new Error(`Unable to retrieve SSM parameter "${properties.RepositoryTokenParamName}"`);
    }

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

    if (properties.RepositoryHost === 'bitbucket') {
        const response = await fetch(`https://api.bitbucket.org/2.0/repositories/${properties.RepositoryName}/hooks`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${repositoryToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                description: `${properties.StackName} Mirror to AWS CodeCommit`,
                url: properties.WebhookUrl,
                active: true,
                events: ['repo:push'],
            }),
        });
        if (response.status == 201) {
            const webhookId = ((await response.json()) as Record<string, string>).uuid;
            logger.info('Webhook created', {webhookId});
            return {
                PhysicalResourceId: webhookId,
            };
        }
        throw new Error(`Unable to create webhook. Status: ${response.status}, response: ${await response.text()}`);
    } else {
        throw new Error(`Unsupported repository host: ${properties.RepositoryHost}`);
    }
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

    if (properties.RepositoryHost === 'bitbucket') {
        const response = await fetch(`https://api.bitbucket.org/2.0/repositories/${properties.RepositoryName}/hooks/${webhookId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${repositoryToken}`,
                'Content-Type': 'application/json',
            },
        });
        if (response.status == 204) {
            logger.info('Webhook deleted', {webhookId});
            return {
                PhysicalResourceId: webhookId,
            };
        }
        if (response.status == 404) {
            logger.info('Webhook not found', {webhookId});
            return {
                PhysicalResourceId: webhookId,
            };
        }
        throw new Error(`Unable to delete webhook. Status: ${response.status}, response: ${await response.text()}`);
    } else {
        throw new Error(`Unsupported repository host: ${properties.RepositoryHost}`);
    }
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

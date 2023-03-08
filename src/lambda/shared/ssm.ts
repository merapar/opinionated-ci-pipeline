import {GetParameterCommand, SSMClient} from '@aws-sdk/client-ssm';

const ssm = new SSMClient({});

export const getSSMParameter = async (name: string) => {
    const repositoryToken = (await ssm.send(new GetParameterCommand({
        Name: name,
        WithDecryption: true,
    }))).Parameter?.Value;

    if (!repositoryToken) {
        throw new Error(`Unable to retrieve SSM parameter "${name}"`);
    }

    return repositoryToken;
};

import {Environment} from 'aws-cdk-lib';
import {Construct} from 'constructs';

export const getProjectName = (scope: Construct): string => {
    const projectName = scope.node.tryGetContext('projectName') as string | undefined;
    if (!projectName) {
        throw new Error('Context parameter "projectName" not found');
    }
    return projectName;
};

export const getEnvironmentConfig = (scope: Construct, name: string): Environment => {
    const environments = scope.node.tryGetContext('environments') as Record<string, Environment> | undefined;
    if (!environments) {
        throw new Error('Context parameter "environments" not found');
    }

    if (name in environments) {
        return environments[name];
    } else {
        return environments['default'];
    }
};

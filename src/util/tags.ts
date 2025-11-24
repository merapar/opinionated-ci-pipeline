import * as cdk from 'aws-cdk-lib';

type Tags = { [key: string]: string};
export const applyRequiredTagsToStack = (stack: cdk.Stack, tags: Tags): void => {

    for (const [key, value] of Object.entries(tags)) {
        if (value) {
            cdk.Tags.of(stack).add(key, value);
        }
    }
};

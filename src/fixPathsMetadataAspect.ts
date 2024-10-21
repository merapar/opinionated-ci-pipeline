import {CfnResource, IAspect, Stack} from 'aws-cdk-lib';
import {IConstruct} from 'constructs';

export class FixPathsMetadataAspect implements IAspect {
    public visit(node: IConstruct): void {
        if (node instanceof CfnResource && typeof node.getMetadata('aws:cdk:path') === 'string') {
            const stackId = Stack.of(node).node.id;
            const parts = (node.getMetadata('aws:cdk:path') as string).split('/');
            if (parts.indexOf(stackId) !== -1) {
                node.addMetadata('aws:cdk:path', parts.slice(parts.indexOf(stackId)).join('/'));
            }
        }
    }
}

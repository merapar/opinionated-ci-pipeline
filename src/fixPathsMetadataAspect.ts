import {CfnResource, IAspect, Stack} from 'aws-cdk-lib';
import {IConstruct} from 'constructs';

export class FixPathsMetadataAspect implements IAspect {
    public visit(node: IConstruct): void {
        const possibleL1 = node.node.defaultChild ? node.node.defaultChild : node;
        if (possibleL1 instanceof CfnResource && node.node.path) {
            const stackId = Stack.of(node).node.id;
            const parts = node.node.path.split('/');
            if (parts.indexOf(stackId) !== -1) {
                possibleL1.addMetadata('aws:cdk:path', parts.slice(parts.indexOf(stackId)).join('/'));
            }
        }
    }
}

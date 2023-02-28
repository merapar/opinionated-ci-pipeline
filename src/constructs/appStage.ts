import {Stage, StageProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {IStacksCreation} from '../applicationProps';

export interface AppStageProps extends StageProps {
    envName: string;
    stacks: IStacksCreation;
}

export class AppStage extends Stage {
    constructor(scope: Construct, id: string, props: AppStageProps) {
        super(scope, id, props);

        this.node.setContext('env', props.envName);

        props.stacks.create(this, props.envName);
    }
}

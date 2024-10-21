import {Aspects, Stage, StageProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {IStacksCreation} from '../applicationProps';
import {getProjectName} from '../util/context';
import {FixPathsMetadataAspect} from '../fixPathsMetadataAspect';

export interface AppStageProps extends StageProps {
    envName: string;
    stacks: IStacksCreation;
    fixPathsMetadata?: boolean;
}

export class AppStage extends Stage {
    constructor(scope: Construct, id: string, props: AppStageProps) {
        super(scope, id, props);

        this.node.setContext('env', props.envName);

        props.stacks.create(this, getProjectName(this), props.envName);

        if (props.fixPathsMetadata) {
            Aspects.of(this).add(new FixPathsMetadataAspect());
        }
    }
}

import {App, AppProps} from 'aws-cdk-lib';
import {CIStack} from './ciStack';
import {getEnvironmentConfig, getProjectName} from './util/context';
import {ApplicationProps} from './applicationProps';

export interface CDKApplicationProps extends AppProps, ApplicationProps {
}

export class CDKApplication extends App {
    constructor(props: CDKApplicationProps) {
        super(props);

        const ci = this.node.tryGetContext('ci') as string | undefined;
        const env = this.node.tryGetContext('env') as string | undefined;

        const projectName = getProjectName(this);

        if (ci && ci.toLowerCase() === 'true') {
            const environment = getEnvironmentConfig(this, 'ci');
            new CIStack(this, 'CI', {
                stackName: `${projectName}-ci`,
                env: environment,
                ...props,
            });
        } else if (env) {
            props.stacks.create(this, projectName, env);
        } else {
            throw new Error('Either "env" or "ci" context value must be provided');
        }
    }
}

import {App, AppProps} from 'aws-cdk-lib';
import {CIStack} from './ciStack';
import {getEnvironmentConfig} from './util/environment';
import {ApplicationProps} from './applicationProps';

export interface CDKApplicationProps extends AppProps, ApplicationProps {
}

export class CDKApplication extends App {
    constructor(props: CDKApplicationProps) {
        super(props);

        const ci = this.node.tryGetContext('ci') as string | undefined;
        const env = this.node.tryGetContext('env') as string | undefined;

        if (ci && ci.toLowerCase() === 'true') {
            const environment = getEnvironmentConfig(this, 'ci');
            new CIStack(this, 'CI', {
                env: environment,
                ...props,
            });
        } else if (env) {
            props.stacks.create(this, env);
        } else {
            throw new Error('Either "env" or "ci" context value must be provided');
        }
    }
}

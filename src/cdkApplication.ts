import {App, AppProps, Aspects} from 'aws-cdk-lib';
import {CIStack} from './ciStack';
import {getEnvironmentConfig, getProjectName} from './util/context';
import {ApplicationProps, defaultProps, ResolvedApplicationProps} from './applicationProps';
import {cloneDeep, defaultsDeep, merge} from 'lodash';
import {FixPathsMetadataAspect} from './fixPathsMetadataAspect';

export interface CDKApplicationProps extends AppProps, ApplicationProps {
}

export class CDKApplication extends App {
    constructor(props: CDKApplicationProps) {
        super(props);

        const ci = this.node.tryGetContext('ci') as string | undefined;
        const env = this.node.tryGetContext('env') as string | undefined;

        const projectName = getProjectName(this);

        const resolvedProps = this.resolveProps(props);

        if (ci && ci.toLowerCase() === 'true') {
            const environment = getEnvironmentConfig(this, 'ci');
            const stackId = resolvedProps.prefixStackIdWithProjectName ? `${projectName}CI` : 'CI';
            new CIStack(this, stackId, {
                stackName: `${projectName}-ci`,
                env: environment,
                ...resolvedProps,
            });
        } else if (env) {
            props.stacks.create(this, projectName, env);
        } else {
            throw new Error('Either "env" or "ci" context value must be provided');
        }

        if (resolvedProps.fixPathsMetadata) {
            Aspects.of(this).add(new FixPathsMetadataAspect());
        }
    }

    private resolveProps(props: ApplicationProps): ResolvedApplicationProps {
        if (props.packageManager) {
            merge(defaultProps, {commands: defaultCommands[props.packageManager]});
        }

        return defaultsDeep(cloneDeep(props), defaultProps) as ResolvedApplicationProps;
    }
}

const defaultCommands: { [key in NonNullable<ApplicationProps['packageManager']>]: Exclude<ApplicationProps['commands'], undefined> } = {
    npm: {
        install: [
            'npm install --location=global aws-cdk@2',
            'npm ci',
        ],
    },
    pnpm: {
        install: [
            'npm install --location=global aws-cdk@2 pnpm',
            'pnpm install --frozen-lockfile',
        ],
    },
};

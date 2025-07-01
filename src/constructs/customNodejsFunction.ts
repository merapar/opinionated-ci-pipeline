import {Stack} from 'aws-cdk-lib';
import {Function as LambdaFunction, FunctionProps, ILayerVersion, LayerVersion, Runtime} from 'aws-cdk-lib/aws-lambda';
import {RetentionDays} from 'aws-cdk-lib/aws-logs';
import {Construct} from 'constructs';

export interface CustomNodejsFunctionProps extends Partial<Omit<FunctionProps, 'code'>>, Pick<FunctionProps, 'code'> {
}

export class CustomNodejsFunction extends LambdaFunction {

    private static powertoolsLayer: ILayerVersion | null;

    constructor(scope: Construct, id: string, props: CustomNodejsFunctionProps) {
        super(scope, id, {
            runtime: new Runtime('nodejs22.x'), // define manually to not bump the required CDK version
            handler: 'index.handler',
            logRetention: RetentionDays.ONE_MONTH,
            ...props,
        });

        if (!CustomNodejsFunction.powertoolsLayer) {
            CustomNodejsFunction.powertoolsLayer = LayerVersion.fromLayerVersionArn(this, 'PowertoolsLayer',
                `arn:aws:lambda:${Stack.of(this).region}:094274105915:layer:AWSLambdaPowertoolsTypeScript:7`,
            );
        }

        this.addLayers(CustomNodejsFunction.powertoolsLayer);

        this.addEnvironment('POWERTOOLS_SERVICE_NAME', Stack.of(this).stackName);
    }
}

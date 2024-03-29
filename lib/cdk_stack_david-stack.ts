import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as api from 'aws-cdk-lib/aws-apigateway'; 
import * as lambda from 'aws-cdk-lib/aws-lambda'; 
import * as dynamoDB from 'aws-cdk-lib/aws-dynamodb';
import path = require('path'); import { table } from 'console'; 
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as s3 from 'aws-cdk-lib/aws-s3'; 



export class CdkStackDavidStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

  /////////////////DynamoDB definition////////////////////////////////

  const dynamoDB_table = new dynamoDB.Table(this, "myDynamoDb_table", 
    {partitionKey: { name: 'pk', type: dynamoDB.AttributeType.STRING }, 
    sortKey:{name:"sk", type:dynamoDB.AttributeType.STRING},
    removalPolicy:cdk.RemovalPolicy.DESTROY
    });

  ////////////Test codePipeline////////////

  const buckeTest = new s3.Bucket(this, 'MyBucketTest', {
    removalPolicy: cdk.RemovalPolicy.DESTROY, 
  });

  /////////////////Lambda definition////////////////////////////////

  const lambda_function = new lambda.Function(this, "myLambda_function", 
    { handler: 'index.handler', 
    runtime: lambda.Runtime.PYTHON_3_12, 
    code: lambda.Code.fromAsset(path.join(__dirname, 'src')),
    environment: {DYNAMODB: dynamoDB_table.tableName}
    });

  /////////////////////Iam Policy definition Lambda////////////////////////

  lambda_function.addToRolePolicy(
    new iam.PolicyStatement({
      actions: [
        "dynamodb:*"
      ],
      resources: [dynamoDB_table.tableArn]
    })
  );

  ///////////////////////Cognito UserPool definition////////////////////////

  const cognito_userPool = new cognito.UserPool(this, 'myCognito_userPool', {
    userPoolName: 'CdkStack18DavidStack_cognito_userPool_fromCdk',
    signInCaseSensitive: false,
    signInAliases: { email: true}, 
    selfSignUpEnabled: true,
    autoVerify: {
      email: true
    },
    standardAttributes: {
      email: {
        required: true,
        mutable: false
      }
    },
    userVerification: {
      emailSubject: 'You need to verify your email',
      emailBody: 'Thanks for signing up Your verification code is {####}',
      emailStyle: cognito.VerificationEmailStyle.CODE,
    },
    keepOriginal:{
      email: true
    },
    accountRecovery: cognito.AccountRecovery.EMAIL_ONLY
  });

  ////////////////////////Client App definition/////////////////////////////

  const client = cognito_userPool.addClient('myAppClient_cdkStack18David', {
    oAuth: {
      flows: {
        authorizationCodeGrant: true,
        implicitCodeGrant: true
      },
      scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.PHONE, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE, cognito.OAuthScope.COGNITO_ADMIN],
      callbackUrls: ['https://example.com/callback'],
      logoutUrls: ['https://example.com/signout'],
    },
    authSessionValidity: cdk.Duration.minutes(15),
    idTokenValidity: cdk.Duration.minutes(60),
    refreshTokenValidity: cdk.Duration.days(30),
    accessTokenValidity: cdk.Duration.minutes(30)
  });

  /////////////////////Cognito Domain definition////////////////////////////

  const domain = cognito_userPool.addDomain('myDomain', {
    cognitoDomain: {
      domainPrefix: 'cdkstackdavidcogdom'
    }
  });

  //////////////////////Cognito IdentityPool definition//////////////////////

  const cognito_IdentityPool = new cognito.CfnIdentityPool(this, 'MyCognito_IdentityPool', {
    allowUnauthenticatedIdentities: false,
    cognitoIdentityProviders: [{
      clientId: client.userPoolClientId,
      providerName: cognito_userPool.userPoolProviderName,
    }]
  });

  /////////////////IAM Role for IdentityPool definition//////////////////////
  
  const unauthenticatedRole_RestApi = new iam.Role(this, 'myUnauthenticatedRole_RestApi',{
    assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
      "StringEquals": { "cognito-identity.amazonaws.com:aud": cognito_IdentityPool.ref },
      "ForAnyValue:StringLike": { "cognito-identity.amazonaws.com:amr": "unauthenticated" },
    })
  });

  const authenticatedRole_RestApi = new iam.Role(this, 'myAuthenticatedRole_RestApi',{
    assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
      "StringEquals": { "cognito-identity.amazonaws.com:aud": cognito_IdentityPool.ref },
      "ForAnyValue:StringLike": { "cognito-identity.amazonaws.com:amr": "authenticated" },
    })
  });

  unauthenticatedRole_RestApi.addToPolicy(new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ["cognito-sync:*"],
    resources: ["*"]
  }));

  authenticatedRole_RestApi.addToPolicy(new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
        actions: [
            "cognito-sync:*",
            "cognito-identity:*"
        ],
        resources: ["*"],
  }));

  const defaultPolicy = new cognito.CfnIdentityPoolRoleAttachment(this, "myDefaultPolicy", {
    identityPoolId: cognito_IdentityPool.ref,
    roles: {
      'unauthenticated': unauthenticatedRole_RestApi.roleArn,
      'authenticated': authenticatedRole_RestApi.roleArn
    }
  });

  ////////////////////////Api Authorizer definition/////////////////////////

  const authenticator = new api.CognitoUserPoolsAuthorizer(this, 'myAuthenticator', {
    cognitoUserPools: [cognito_userPool]
  });

  ////////////////////Api definition////////////////////////////////
  
  const apiGateway = new api.RestApi(this, 'myRestApi');
  const itemsResource = apiGateway.root.addResource('scan');
  const integration = new api.LambdaIntegration(lambda_function);
  itemsResource.addMethod('GET', integration, {  
    authorizer: authenticator,
    authorizationType: api.AuthorizationType.COGNITO,
    authorizationScopes: ["email"]
  });
  
}
}


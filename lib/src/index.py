import boto3
import os
import json

def handler(event, context):
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(os.environ['DYNAMODB'])
    response = table.scan()
    
    return {
        'body': json.dumps(response['Items'])
    } 
const expectedObject = 
{
    'swagger': '2.0',
    'servers': [
        {url: 'http://localhost'}
    ],
    'info': {
        'title': 'steplix-apidoc-swagger',
        'description': 'Convert api doc json to swagger json, including aws api-gateway attributes',
        'version': '0.4.5',
    },
    'paths': {
        '/user/id': {
            'get': {
                'tags': [
                    'User'
                ],
                'consumes': [
                    'application/json'
                ],
                'produces': [
                    'application/json'
                ],
                'parameters': [
                    {
                        'name': 'id',
                        'in': 'path',
                        'required': true,
                        'type': 'number',
                        'description': 'Users unique ID.'
                    }
                ],
                'responses': {
                    '200': {
                        'description': 'successful operation',
                        'schema': {
                            'type': 'String',
                            'items': {
                                '$ref': '#/definitions/GetUser'
                            }
                        }
                    }
                },
                'x-amazon-apigateway-integration': {
                    'uri': 'http://localhost/user/id',
                    'passthroughBehavior': 'when_no_match',
                    'httpMethod': 'GET',
                    'type': 'http',
                    'connectionType': 'VPC_LINK',
                    'connectionId': "${stageVariables.idVpcLink}",
                    'responses': {
                        'default': {
                            'statusCode': '200'
                        }
                    },
                    'requestParameters': {
                        'integration.request.path.id': 'method.request.path.id'
                    }
                }
            }
        }
    },
    'definitions': {
        'GetUser': {
            'properties': {
                'id': {
                    'type': 'number',
                    'description': 'Users unique ID.'
                },
                'firstname': {
                    'type': 'string',
                    'description': 'Firstname of the User.'
                },
                'lastname': {
                    'type': 'string',
                    'description': 'Lastname of the User.'
                }
            },
            'required': [
                'id',
                'firstname',
                'lastname'
            ]
        }
    }
};

module.exports = expectedObject;
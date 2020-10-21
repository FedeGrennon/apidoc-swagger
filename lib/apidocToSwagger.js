var _ = require('lodash');
var pathToRegexp = require('path-to-regexp');

var swagger = {
    swagger	: '2.0',
    info	: {},
    servers	: [{url: 'http://localhost'}],
    paths	: {},
    definitions: {}
};

const authHeaderGroupRegExp = /Authorizer/i;
const requestTokenHeader = 'Authorization';

function toSwagger(apidocJson, projectJson) {
    if (projectJson.sampleUrl) swagger.servers[0].url = projectJson.sampleUrl;
    if (projectJson.securityDefinitions) swagger.securityDefinitions = projectJson.securityDefinitions;
    swagger.info = addInfo(projectJson);
    swagger.paths = extractPaths(apidocJson);
    return swagger;
}

var tagsRegex = /(<([^>]+)>)/ig;
// Removes <p> </p> tags from text
function removeTags(text) {
    return text ? text.replace(tagsRegex, '') : text;
}

function addInfo(projectJson) {
    var info = {};
    info['title'] = projectJson.title || projectJson.name;
    info['version'] = projectJson.version;
    info['description'] = projectJson.description;
    return info;
}

/**
 * Extracts paths provided in json format
 * post, patch, put request parameters are extracted in body
 * get and delete are extracted to path parameters
 * @param apidocJson
 * @returns {{}}
 */
function extractPaths(apidocJson){
    var apiPaths = groupByUrl(apidocJson);
    var paths = {};
    for (var i = 0; i < apiPaths.length; i++) {
        var verbs = apiPaths[i].verbs;
        var url = verbs[0].url;
        var pattern = pathToRegexp(url, null);
        var matches = pattern.exec(url);

        // Surrounds URL parameters with curly brackets -> :email with {email}
        var pathKeys = [];
        for (var j = 1; j < matches.length; j++) {
            var key = matches[j].substr(1);
            url = url.replace(matches[j], '{'+ key +'}');
            pathKeys.push(key);
        }

        for(var verb of verbs) {
            var type = verb.type;

            var obj = paths[url] = paths[url] || {};

            if (type == 'post' || type == 'patch' || type == 'put') {
                _.extend(obj, createPostPushPutOutput(verb, swagger.definitions, pathKeys, url));
            }
            else {
                _.extend(obj, createGetDeleteOutput(verb, swagger.definitions, url));
            }
        }
    }
    return paths;
}

function createPostPushPutOutput(verbs, definitions, pathKeys, path) {
    var pathItemObject = {};
    var verbDefinitionResult = createVerbDefinitions(verbs,definitions);

    var params = [];
    var pathParams = createPathParameters(verbs, pathKeys);
    pathParams = _.filter(pathParams, function(param) {
        var hasKey = pathKeys.indexOf(param.name) !== -1;
        return !(param.in === 'path' && !hasKey);
    });
    var headerParams = createHeaderParameters(verbs);
    params = params.concat([...pathParams, ...headerParams]);
    var required = verbs.parameter && verbs.parameter.fields && 
					verbs.parameter.fields.Parameter && verbs.parameter.fields.Parameter.length > 0;

    params.push({
        'in': 'body',
        'name': 'body',
        'description': removeTags(verbs.description),
        'required': required,
        'schema': {
            '$ref': '#/definitions/' + verbDefinitionResult.topLevelParametersRef
        }
    });
	
    pathItemObject[verbs.type] = {
        tags: [verbs.group],
        summary: removeTags(verbs.description),
        consumes: [
            'application/json'
        ],
        produces: [
            'application/json'
        ],
        parameters: params
    };
    
    //set authorizer
    const headerAuthorizerParam = _.find(headerParams, { in: 'header', name: requestTokenHeader });
    if (swagger.securityDefinitions && headerAuthorizerParam) {
        let authorizer = _.keys(swagger.securityDefinitions)[0];
        if (authHeaderGroupRegExp.test(headerAuthorizerParam.group)) {
            authorizer = headerAuthorizerParam.group;
        } 
        pathItemObject[verbs.type].security = [{
            [authorizer]: []
        }]
    }

    if (verbDefinitionResult.topLevelSuccessRef) {
        var statusCode = _.hasIn(verbs.success.fields, '201') ? '201' : '200';
        pathItemObject[verbs.type].responses = {
            [statusCode]: {
                'description': 'successful operation',
                'schema': {
                    'type': verbDefinitionResult.topLevelSuccessRefType,
                    'items': {
                        '$ref': '#/definitions/' + verbDefinitionResult.topLevelSuccessRef
                    }
                }
            }
        };
    }

    pathItemObject[verbs.type]['x-amazon-apigateway-integration'] = {
        'uri': `${swagger.servers[0].url}${path}`,
        'passthroughBehavior': 'when_no_match',
        'httpMethod': verbs.type.toUpperCase(),
        'type': 'http',
        'connectionType': 'VPC_LINK',
        'connectionId': "${stageVariables.idVpcLink}",
        'responses': {
            'default': {
                'statusCode': statusCode
            }
        },
        'requestParameters': createAwsParameters(pathItemObject[verbs.type].parameters)
    };
	
    return pathItemObject;
}

function createVerbDefinitions(verbs, definitions) {
    var result = {
        topLevelParametersRef : null,
        topLevelSuccessRef : null,
        topLevelSuccessRefType : null
    };
    var defaultObjectName = verbs.name;

    var fieldArrayResult = {};
    if (verbs && verbs.parameter && verbs.parameter.fields) {
        fieldArrayResult = createFieldArrayDefinitions(verbs.parameter.fields.Parameter, definitions, verbs.name, defaultObjectName);		
        result.topLevelParametersRef = fieldArrayResult.topLevelRef;
    }

    if (verbs && verbs.success && verbs.success.fields) {
        fieldArrayResult = createFieldArrayDefinitions(verbs.success.fields[Object.keys(verbs.success.fields)[0]], definitions, verbs.name, defaultObjectName);		
        result.topLevelSuccessRef = fieldArrayResult.topLevelRef;
        result.topLevelSuccessRefType = fieldArrayResult.topLevelRefType;
    }

    return result;
}

function createFieldArrayDefinitions(fieldArray, definitions, topLevelRef, defaultObjectName) {
    var result = {
        topLevelRef : topLevelRef,
        topLevelRefType : null
    };

    if (!fieldArray) {
        return result;
    }

    for (var i = 0; i < fieldArray.length; i++) {
        var parameter = fieldArray[i];

        var nestedName = createNestedName(parameter.field);
        var objectName = nestedName.objectName;
        if (!objectName) {
            objectName = defaultObjectName;
        }
        var type = parameter.type || 'String';
        if (i == 0) {
            result.topLevelRefType = type;
            if(parameter.type == 'Object') {
                objectName = nestedName.propertyName;
                nestedName.propertyName = null;
            }
            else if (parameter.type == 'Array') {
                objectName = nestedName.propertyName;
                nestedName.propertyName = null;				
                result.topLevelRefType = 'array';
            }
            result.topLevelRef = objectName;
        }

        definitions[objectName] = definitions[objectName] ||
			{ properties : {}, required : [] };

        if (nestedName.propertyName) {
            var prop = { type: (parameter.type || '').toLowerCase(), description: removeTags(parameter.description) };
            // if(parameter.type == "Object") {
            // 	prop.$ref = "#/definitions/" + parameter.field;
            // }

            var typeIndex = type.indexOf('[]');
            if(typeIndex !== -1 && typeIndex === (type.length - 2)) {
                prop.type = 'array';
                prop.items = {
                    type: type.slice(0, type.length-2)
                };
            }

            definitions[objectName]['properties'][nestedName.propertyName] = prop;
            if (!parameter.optional) {
                var arr = definitions[objectName]['required'];
                if(arr.indexOf(nestedName.propertyName) === -1) {
                    arr.push(nestedName.propertyName);
                }
            }

        }
    }

    return result;
}

function createNestedName(field) {
    var propertyName = field;
    var objectName;
    var propertyNames = field.split('.');
    if(propertyNames && propertyNames.length > 1) {
        propertyName = propertyNames[propertyNames.length-1];
        propertyNames.pop();
        objectName = propertyNames.join('.');
    }

    return {
        propertyName: propertyName,
        objectName: objectName
    };
}


/**
 * Generate get, delete method output
 * @param verbs
 * @returns {{}}
 */
function createGetDeleteOutput(verbs,definitions, path) {
    var pathItemObject = {};
    verbs.type = verbs.type === 'del' ? 'delete' : verbs.type;

    var verbDefinitionResult = createVerbDefinitions(verbs,definitions);
    var pathParams = createPathParameters(verbs);
    var headerParams = createHeaderParameters(verbs);
    pathItemObject[verbs.type] = {
        tags: [verbs.group],
        summary: removeTags(verbs.description),
        consumes: [
            'application/json'
        ],
        produces: [
            'application/json'
        ],
        parameters: [...pathParams, ...headerParams]
    };
    if (verbDefinitionResult.topLevelSuccessRef) {
        var statusCode = _.hasIn(verbs.success.fields, '204') ? '204' : '200';
        pathItemObject[verbs.type].responses = {
            [statusCode]: {
                'description': 'successful operation',
                'schema': {
                    'type': verbDefinitionResult.topLevelSuccessRefType,
                    'items': {
                        '$ref': '#/definitions/' + verbDefinitionResult.topLevelSuccessRef
                    }
                }
            }
        };
    }

    //set authorizer
    const headerAuthorizerParam = _.find(headerParams, { in: 'header', name: requestTokenHeader });
    if (swagger.securityDefinitions && headerAuthorizerParam) {
        if (authHeaderGroupRegExp.test(headerAuthorizerParam.group)) {
            pathItemObject[verbs.type].security = [{
                [headerAuthorizerParam.group]: []
            }]
        } 
    }

    pathItemObject[verbs.type]['x-amazon-apigateway-integration'] = {
        'uri': `${swagger.servers[0].url}${path}`,
        'passthroughBehavior': 'when_no_match',
        'httpMethod': verbs.type.toUpperCase(),
        'type': 'http',
        'connectionType': 'VPC_LINK',
        'connectionId': "${stageVariables.idVpcLink}",
        'responses': {
            'default': {
                'statusCode': statusCode
            }
        },
        'requestParameters': createAwsParameters(pathItemObject[verbs.type].parameters)
    };

    return pathItemObject;
}

/**
 * Iterate through all method parameters and create array of parameter objects which are stored as path parameters
 * @param verbs
 * @returns {Array}
 */
function createPathParameters(verbs) {
    var pathItemObject = [];
    if (verbs.parameter && verbs.parameter.fields.Parameter) {
        for (var i = 0; i < verbs.parameter.fields.Parameter.length; i++) {
            var param = verbs.parameter.fields.Parameter[i];
            pathItemObject.push({
                name: param.field,
                in: param.type === 'file' ? 'formData' : 'path',
                required: !param.optional,
                type: param.type.toLowerCase(),
                description: removeTags(param.description)
            });

        }
    }

    if (verbs.parameter && verbs.parameter.fields.Path) {
        for (var y = 0; y < verbs.parameter.fields.Path.length; y++) {
            var path = verbs.parameter.fields.Path[y];
            pathItemObject.push({
                name: path.field,
                in: path.type === 'file' ? 'formData' : 'path',
                required: !path.optional,
                type: path.type.toLowerCase(),
                description: removeTags(path.description)
            });

        }
    }

    if (verbs.parameter && verbs.parameter.fields.Query) {
        for (const param of verbs.parameter.fields.Query) {
            pathItemObject.push({
                name: param.field,
                in: param.type === 'file' ? 'formData' : 'query',
                required: !param.optional,
                type: param.type.toLowerCase(),
                description: removeTags(param.description)
            });

        }
    }
    return pathItemObject;
}

/**
 * Iterate through all method headers and create array of header objects which are stored as header parameters
 * @param verbs
 * @returns {Array}
 */
function createHeaderParameters(verbs) {
    var haderItemObject = [];
    if (verbs.header && verbs.header.fields) {
        _.each(verbs.header.fields, (headers, key) => {
            for (const header of headers) {
                haderItemObject.push({
                    name: header.field,
                    in: 'header',
                    required: !header.optional,
                    type: header.type.toLowerCase(),
                    description: removeTags(header.description),
                    group: key
                });
            }
        })
    }
    return haderItemObject;
}

/**
 * Iterate through all method parameters and create array of parameter objects which are stored as path requestParameters
 * @param parameters
 * @returns {Array}
 */
function createAwsParameters(parameters) {
    var pathItemObject = {};
    if (parameters.length) {
        for (var i = 0; i < parameters.length; i++) {
            var param = parameters[i];
            var type = 'path';
            switch (param.in) {
                case 'query':
                    type = 'querystring';
                    break;
                case 'formData':
                    continue;
                case 'body':
                    continue;
                case 'header':
                    type = 'header';
                    break;
                default:
                    break;
            }
            _.assign(pathItemObject, {[`integration.request.${type}.${param.name}`]: `method.request.${type}.${param.name}`});
        }
    }
    return pathItemObject;
}

function groupByUrl(apidocJson) {
    return _.chain(apidocJson)
        .groupBy('url')
        .toPairs()
        .map(function (element) {
            return _.zipObject(['url', 'verbs'], element);
        })
        .value();
}

module.exports = {
    toSwagger: toSwagger
};
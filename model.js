var io = require('./io');
var templates = require('./templates');
var ObjectId = require('modm').ObjectId;

function createRequest (method, link) {

    var data = link.data || {};

    // template id is mandatory
    if (!data.t) {
        return;
    }

    var request = {
        role: link.session.crudRole,
        options: {},
        templateId: data.t,
        method: method,
        // TODO remove this when updates on linked fields are possible
        noJoins: data.noJoins
    };
    
    // query
    request.query = data.q || {};
    request.query._tp = data.t;
    
    // update
    if (data.d && data.d.constructor.name === 'Object') {

        // set type
        if (method === 'insert') {
            data.d._tp = data.t;
        }

        request.data = data.d;
    }

    // options
    if (data.o && data.o.constructor.name === 'Object') {
        request.options = data.o;
    }

    return request;
}

function recursiveConvert(paths, obj, keyPath, convertAllStrings) {

    // if array of objects
    if (obj.constructor.name === 'Array') {
        for (var i in obj) {
            // ignore nulls
            if (obj[i] === null) {
                continue;
            }

            if (typeof obj[i] === 'object') {
                recursiveConvert(paths, obj[i], keyPath, convertAllStrings);
            } else if (paths[keyPath] && paths[keyPath].type === 'objectid'){
                obj[i] = ObjectId(obj[i]);
            }
        }
        return;
    }

    // if object
    if (typeof obj === 'object') {
        for (var key in obj) {
            // ignore nulls
            // $exists also does not need convertion of values
            if (obj[i] === null || key === '$exists') {
                continue;
            }

            var newKeyPath = keyPath + (key[0] === '$' ? '' : (keyPath ? '.' : '') + key);
            var parentSaysId = paths[newKeyPath] && paths[newKeyPath].type === 'objectid';

            if (typeof obj[key] === 'object') {
                recursiveConvert(paths, obj[key], newKeyPath, parentSaysId);
            } else if (parentSaysId) {
                obj[key] = ObjectId(obj[key]);
            }
        }
    }
}

// create request objects for merge data
function createJoints (request, callback) {
    
    // check if schema paths are available
    if (!request || !request.template || !request.template.schema || !request.template.schema.paths) {
        return callback('No schema paths available.');
    }
    
    var schema = request.template.linkedFields;
    var linkedTemplatesToLoad = {};
    var returnFields;
    
    // return fields
    if (request.options.fields) {
        returnFields = request.options.fields;
        request.options.fields = {};
    }
    
    // handle fields who contain a link
    for (var field in schema) {
        
        // get templates that must be loaded and save the cropped
        // schema paths to validate field in linked schema
        if (!linkedTemplatesToLoad[schema[field].link]) {
            linkedTemplatesToLoad[schema[field].link] = {
                fields: {},
                query: {},
                merge: field
            };
        }
        
        // check if a return field points to a linked document
        if (returnFields) {
            for (var returnField in returnFields) {
                if (returnField.indexOf(field) === 0) {
                    if (returnFields[returnField]) {
                        
                        // collect field on linked template
                        linkedTemplatesToLoad[schema[field].link].fields[returnField.substr(field.length + 1)] = 1;
                        
                        // lined field is needed to merge the data
                        request.options.fields[field] = 1;
                    }
                // get fields of local template
                } else {
                    request.options.fields[returnField] = returnFields[returnField];
                }
            }
        }
        
        // get query for linked template
        for (var queryField in request.query) {
            if (queryField !== field && queryField.indexOf(field) === 0) {
                linkedTemplatesToLoad[schema[field].link].query[queryField.substr(field.length + 1)] = request.query[queryField];
                
                // remove link queries from request query
                delete request.query[queryField];
            }
        }
    }
    
    // convert linked tempaltes object to an array
    var linkedTemplatesToLoad_array = [];
    for (var template in linkedTemplatesToLoad) {
        linkedTemplatesToLoad_array.push(template);
    }
    
    // get linked templates
    templates.getMergeTemplates(linkedTemplatesToLoad_array, request.role, function (err, fetchedTemplates) {
        
        if (err) {
            return callback(err);
        }
        
        // create request for linked template
        var mergeRequests = {};
        var length = 0;
        for (var fetchedTemplate in fetchedTemplates) {
            
            // create merge request
            mergeRequests[fetchedTemplate] = {
                role: request.role,
                options: {
                    fields: linkedTemplatesToLoad[fetchedTemplate].fields
                },
                template: fetchedTemplates[fetchedTemplate],
                query: linkedTemplatesToLoad[fetchedTemplate].query,
                merge: linkedTemplatesToLoad[fetchedTemplate].merge
            };
            
            // make sure _id gets always returned
            if (returnFields) {
                request.options.fields._id = 1;
            }
            
            // take limit from request
            if (request.options.limit) {
                mergeRequests[fetchedTemplate].options.limit = request.options.limit;
            }
            
            ++length;
        }
        
        callback(null, mergeRequests, length);
    });
}

function doDbReqeust (link, request) {
    
    try {
        recursiveConvert(request.template.schema.paths, request.query, '');
    } catch (err) {
        return link.send(400, 'Incorrect ObjectId format');
    }
    
    // TODO This is a hack until we can merge the templates
    if (request.template && request.template.addToTemplates && request.data && request.data._tp) {
        var copy = request.template.addToTemplates.slice();
        copy.push(request.data._tp);
        request.data._tp = copy;
    }
    
    // emit a server event
    if (request.template.on && request.template.on[request.method]) {
        for (var event in request.template.on[request.method]) {
            var copy = request.template.on[request.method][event].slice();
            copy.splice(0, 0, event, request);
            M.emit.apply(M, copy);
        }
    }

    // do input/output
    io[request.method](link, request);
}

module.exports = function (method, link) {

    if (!io[method]) {
        return link.send(501, 'Method not implemented');
    }

    // check parameters
    var request = createRequest(method, link);
    
    if (!request) {
        return link.send(400, 'Bad request.');
    }
    
    // get template and check access (cache)
    templates.getTemplate(request, function (err, request) {

        if (err) {
            return link.send(err.statusCode || 500, err.message);
        }
        
        // check role access when reading templates with item access control
        if (request.template.itemAccess) {
            request.query['roles.' + request.role + '.access'] = {$regex: templates.getAccessKey(method)};
            
            // add role access to item
            if (method === 'insert') {
                request.data.roles = {};
                request.data.roles[request.role] = {access: request.template.itemAccess};
            }
            
            // prevent update method form overwrite his own rights
            if (method === 'update') {
                if (request.data.$set && typeof request.data.$set['roles.' + request.role + '.access'] !== 'undefined') {
                    request.data.$set['roles.' + request.role + '.access'] = request.template.itemAccess;
                }
            }
        }
        
        // make joins only on find requests and when template has linked fields
        if (method === 'find' && request.template.linkedFields && !request.noJoins) {
            createJoints(request, function (err, joints, length) {
                
                if (err) {
                    return link.send(err.statusCode || 500, err.message);
                }
                
                // add joints to request
                if (joints) {
                    request.joints = joints;
                    request.jointsLength = length;
                }
                
                doDbReqeust(link, request);
            });
        } else {
            doDbReqeust(link, request);
        }
    });
};

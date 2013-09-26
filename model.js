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

    // fields
    if (data.f && data.f.constructor.name === 'Object') {
        request.options.fields = data.f;
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
    
    // TODO remove this when updates on linked fields are possible
    if (request.noJoins) {
        return callback();
    }
    
    // check callback
    if (typeof callback !== 'function') {
        throw new Error('getMergeRequests: callback is mandatory');
    }
    
    // check if schema paths are available
    if (!request || !request.template || !request.template.schema || !request.template.schema.paths) {
        return callback('No schema paths available.');
    }
    
    var schema = request.template.schema.paths;
    var returnFields = request.options && request.options.fields ? request.options.fields : null;
    var linkedFieldsToLoad = {};
    var linkedTemplatesToLoad = {};
    var linksExists = false;
    
    // check if a return field points to a linked document
    for (var field in schema) {
        if (!schema[field].link) {
            continue;
        }
        
        if (returnFields) {
            for (var returnField in returnFields) {
                if (returnFields[returnField] && returnField.indexOf(field) === 0) {
                    
                    // collect fields who contain a link
                    linkedFieldsToLoad[field] = schema[field].link;
                    linksExists = true;
                    
                    // get templates that must be loaded and save the cropped
                    // schema paths to validate field in linked schema
                    if (!linkedTemplatesToLoad[schema[field].link]) {
                        linkedTemplatesToLoad[schema[field].link] = {
                            fields: {},
                            merge: {}
                        };
                    }
                    
                    linkedTemplatesToLoad[schema[field].link].fields[returnField.substr(field.length + 1)] = 1;
                    linkedTemplatesToLoad[schema[field].link].merge[field] = 1;
                    
                    returnFields[field] = 1;
                    returnFields[returnField] = null;
                }
            }
        } else {
            
            // collect fields who contain a link
            linkedFieldsToLoad[field] = schema[field].link;
            linksExists = true;
            
            if (!linkedTemplatesToLoad[schema[field].link]) {
                linkedTemplatesToLoad[schema[field].link] = {
                    fields: {},
                    merge: {}
                };
            }
            
            // get templates that must be loaded
            linkedTemplatesToLoad[schema[field].link].fields = {};
            linkedTemplatesToLoad[schema[field].link].merge[field] = 1;
        }
    }
    
    // remove fields that point to linked documents
    if (returnFields) {
        var rtrnFlds = {};
        for (var returnField in returnFields) {
            if (returnField === '_id' || returnFields[returnField]) {
                rtrnFlds[returnField] = returnFields[returnField];
            }
        }
        
        request.options.fields = rtrnFlds;
    }
    
    // get linked schema
    if (linksExists) {
        
        // convert linked tempaltes object to an array
        var linkedTemplatesToLoad_array = [];
        for (var template in linkedTemplatesToLoad) {
            linkedTemplatesToLoad_array.push(template);
        }
        
        // get templates
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
                    query: {},
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
    } else {
        callback();
    }
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
    
    // get template (cache)
    templates.getTemplate(request, function (err, request) {

        if (err) {
            return link.send(err.statusCode || 500, err.message);
        }
        
        // check role access when reading templates
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
        
        createJoints(request, function (err, joints, length) {
            
            if (err) {
                return link.send(err.statusCode || 500, err.message);
            }
            
            // add joints to request
            if (joints) {
                request.joints = joints;
                request.jointsLength = length;
            }
            
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
            if (request.template.on && request.template.on[method]) {
                for (var event in request.template.on[method]) {
                    var copy = request.template.on[method][event].slice();
                    copy.splice(0, 0, event, request);
                    M.emit.apply(M, copy);
                }
            }
    
            // do input/output
            io[method](link, request);
        });
    });
};

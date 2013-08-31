var io = require('./io');
var templates = require('./templates');
var ObjectId = require('modm').ObjectId;

var TTID = ObjectId('000000000000000000000000');
var RTID = ObjectId('000000000000000000000001');
var LTID = ObjectId('000000000000000000000002');


function createRequest (method, link) {

    var data = link.data || {};

    // template id is mandatory
    if (!data.t) {
        return;
    }

    var request = {
        role: link.session.crudRole,
        options: {},
        templateId: data.t
    };
    
    // query
    request.query = data.q || {};
    request.query._tp = data.t;
    
    // check access for template items when querying templates
    // TODO make the objectid strings configurable
    if (data.t === TTID.toString()) {
        request.query._ln = {
            $elemMatch: {
                _tp: RTID,
                _id: request.role,
                access: { $gt: 0 }
            }
        };
    }
    
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

var CORE_KEY_REGEXP = new RegExp(/^(_ln\.)?(_id|_tp)$/);

function recursiveConvert(obj, all) {

    // if array of objects (array )
    if (obj.constructor.name === 'Array') {
        for (var i in obj) {
            recursiveConvert(obj[i], all);
        }
        return;
    }

    // if object
    if (typeof obj === 'object' && obj.constructor.name.toLowerCase() !== 'objectid') {
        for (var key in obj) {
            if (obj[key] === null || obj[key] === undefined) {
                continue;
            }

            // are we talking business here?
            var isMatch = CORE_KEY_REGEXP.test(key) || all;

            if (typeof obj[key] === 'string' && isMatch) {
                obj[key] = ObjectId(obj[key]);
                continue;
            }

            // treat array here in order not to loose the reference
            if (obj[key].constructor.name === 'Array') {
                if (typeof obj[key][0] === 'object') {
                    recursiveConvert(obj[key], isMatch);
                } else if (isMatch) {
                    for (var i in obj[key]) {
                        obj[key][i] = ObjectId(obj[key][i]);
                    }
                }
                continue;
            }

            if (typeof obj[key] === 'object') {
                recursiveConvert(obj[key], isMatch);
            }
        }
    }
}

// create request objects for merge data
function createJoints (request, callback) {
    
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
    var linkedFieldsToLoad = {length: 0};
    var linkedTemplatesToLoad = {};
    
    // check if a return field points to a linked document
    for (var field in schema) {
        if (!schema[field].link) {
            continue;
        }
        
        if (returnFields) {
            for (var returnField in returnFields) {
                if (returnFields[returnField] && returnField.indexOf(field) === 0) {
                    
                    //console.log('found a link in field "'+ field + '" ("' + returnField + '") and points to template "' + schema[field].link + '"');
                    
                    // collect fields who contain a link
                    linkedFieldsToLoad[field] = schema[field].link;
                    ++linkedFieldsToLoad.length;
                    
                    // get templates that must be loaded and save the cropped
                    // schema paths to validate field in linked schema
                    if (!linkedTemplatesToLoad[schema[field].link]) {
                        linkedTemplatesToLoad[schema[field].link] = {};
                    }
                    
                    linkedTemplatesToLoad[schema[field].link][returnField.substr(field.length + 1)] = 1;
                    
                    returnFields[field] = 1;
                    returnFields[returnField] = undefined;
                }
            }
        } else {
            
            // collect fields who contain a link
            linkedFieldsToLoad[field] = schema[field].link;
            ++linkedFieldsToLoad.length;
            
            // get templates that must be loaded
            linkedTemplatesToLoad[schema[field].link] = {};
        }
    }
    
    // get linked schema
    if (linkedFieldsToLoad.length > 0) {
        
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
            for (var fetchedTemplate in fetchedTemplates) {
                
                // create merge request
                mergeRequests[fetchedTemplate] = {
                    role: request.role,
                    options: {
                        fields: linkedTemplatesToLoad[fetchedTemplate]
                    },
                    template: fetchedTemplates[fetchedTemplate],
                    query: {
                        _id: {$in: []}
                    }
                };
                
                // take limit from request
                if (request.options.limit) {
                    mergeRequests[fetchedTemplate].options.limit = request.options.limit;
                }
            }
            
            callback(null, mergeRequests);
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
        
        createJoints(request, function (err, joints) {
            
            if (err) {
                return link.send(err.statusCode || 500, err.message);
            }
            
            // add joints to request
            if (joints) {
                request.joints = joints;
            }
            
            try {
                recursiveConvert(request.query);
            } catch (err) {
                return link.send(400, 'Incorrect ObjectId format');
            }
    
            // we must add additional query filters if we request templates
            // (this protects core templates from non super-admin users)
            if (request.query._tp.toString() === TTID.toString()) {
                request.query._id = {
                    $nin: [TTID, RTID, LTID]
                };
            }
    
            // do input/output
            io[method](link, request);
        });
    });
};

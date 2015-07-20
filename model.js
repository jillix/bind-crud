var io = require('./io');
var templates = require('./templates');
var ObjectId = require('modm').ObjectId;

var moment;
try {
    moment = require('moment');
} catch (err) {
    console.error('The moment NPM module not found in your mono installation. Crud operations involving date might not operate correctly.')
}

function recursiveConvert(paths, obj, keyPath, convertAllStrings) {

    if (typeof obj === 'undefined') {
        return;
    }

    // if array of objects
    if (obj.constructor.name === 'Array') {
        for (var i in obj) {
            // ignore nulls
            if (obj[i] === null) {
                continue;
            }

            if (typeof obj[i] === 'object') {
                recursiveConvert(paths, obj[i], keyPath, convertAllStrings);
            } else if (paths[keyPath]) {
                switch (paths[keyPath].type) {
                    case 'objectid':
                        obj[i] = ObjectId(obj[i]);
                        break;
                    case 'date':
                        if (obj[i].match(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{0,3})?)?(Z(\d)*)$/) || !moment) {
                            obj[i] = new Date(obj[i]);
                        } else {
                            obj[i] = moment(obj[i], paths[keyPath].parse || undefined).toDate();
                        }
                        break;
                }
            }
        }
        return;
    }

    // if object
    if (typeof obj === 'object') {
        for (var key in obj) {
            // ignore nulls
            // $exists also does not need convertion of values
            if (obj[key] === null || key === '$exists') {
                continue;
            }

            var newKeyPath = keyPath + (key[0] === '$' ? '' : (keyPath ? '.' : '') + key);
            var parentSaysId = paths[newKeyPath] && paths[newKeyPath].type === 'objectid';

            if (typeof obj[key] === 'object') {
                recursiveConvert(paths, obj[key], newKeyPath, parentSaysId);
            } else if (parentSaysId) {
                obj[key] = ObjectId(obj[key]);
            } else if (typeof obj[key] === 'string' && paths[newKeyPath] && paths[newKeyPath].type === 'date') {
                if (obj[key].match(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{0,3})?)?(Z(\d)*)$/) || !moment) {
                    obj[key] = new Date(obj[key]);
                } else {
                    obj[key] = moment(obj[key], paths[newKeyPath].parse || undefined).toDate();
                }
            }
        }
    }
}

// create request objects for merge data
function createJoints (request, callback) {

    // check if schema paths are available
    if (!request || !request.template || !request.template.schema || !request.template.schema) {
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
                query: {}
              , options: {
                    sort: []
                }
              , merge: field
            };
        }

        // check if a return field points to a linked document
        if (returnFields) {
            for (var returnField in returnFields) {
                if (returnField.indexOf(field) === 0) {
                    if (returnFields[returnField]) {

                        if (!linkedTemplatesToLoad[schema[field].link].fields) {
                            linkedTemplatesToLoad[schema[field].link].fields = {};
                        }

                        // collect field on linked template
                        linkedTemplatesToLoad[schema[field].link].fields[returnField.substr(field.length + 1)] = 1;

                        // linked field is needed to merge the data
                        request.options.fields[field] = 1;
                    }
                // get fields of local template
                } else {
                    request.options.fields[returnField] = returnFields[returnField];
                }
            }
        }

        if (!linkedTemplatesToLoad[schema[field].link].fields) {
            linkedTemplatesToLoad[schema[field].link].fields = {_tp: 0};
        }

        // get query for linked template
        for (var queryField in request.query) {
            if (queryField !== field && queryField.indexOf(field) === 0) {
                linkedTemplatesToLoad[schema[field].link].query[queryField.substr(field.length + 1)] = request.query[queryField];

                // remove link queries from request query
                delete request.query[queryField];
            }
        }

        // get sort value
        var requestSort = request.options.sort;

        // get sort for linked template
        if (requestSort && requestSort.constructor === Array) {
            // "sort": [
            //     [
            //         "client.email",
            //         1
            //     ]
            // ],
            for (var i = 0; i < requestSort.length; ++i) {

                // get the sort array
                var cSort = requestSort[i];

                // make sure that it's an array that contains the two fields
                if (!cSort || cSort.constructor !== Array || !cSort[0] || !cSort[1]) {
                    continue;
                }

                // get its values
                var sortField = cSort[0]
                  , sortValue = cSort[1]
                  ;

                // we have to sort a linked field
                if (sortField !== field && sortField.indexOf(field) === 0) {

                    // push the new sort field
                    linkedTemplatesToLoad[schema[field].link].options.sort.push([
                        // commenting this out to handle sorting in io.js
                        sortField // .substr(field.length + 1)
                      , sortValue
                    ]);

                    // remove current sort from sort fields
                    requestSort.splice (i, 1);
                }
            }
        }
    }

    // convert linked tempaltes object to an array
    var linkedTemplatesToLoad_array = Object.keys(linkedTemplatesToLoad)

    // get linked templates
    templates.getMergeTemplates(linkedTemplatesToLoad_array, request.role, function (err, fetchedTemplates) {

        if (err) {
            return callback(err);
        }

        // create request for linked template
        var mergeRequests = {};
        for (var i = 0, l = fetchedTemplates.length; i < l; ++i) {

            // get the current fetched template
            var cFetchedTemplate = fetchedTemplates[i];

            // create merge request
            mergeRequests[cFetchedTemplate._id] = {
                role: request.role
              , options: {
                    fields: linkedTemplatesToLoad[cFetchedTemplate._id].fields
                  , sort:   linkedTemplatesToLoad[cFetchedTemplate._id].options.sort
                }
              , template: cFetchedTemplate
              , query: linkedTemplatesToLoad[cFetchedTemplate._id].query
              , merge: linkedTemplatesToLoad[cFetchedTemplate._id].merge
            };

            // make sure _id is always returned
            if (returnFields) {
                request.options.fields._id = 1;
            }

            // take limit from request
            if (request.options.limit) {
                mergeRequests[cFetchedTemplate._id].options.limit = request.options.limit;
            }
        }

        callback(null, mergeRequests, fetchedTemplates.length);
    });
}

function doDbRequest (request, callback) {

    // TODO This is a hack until we can merge the templates
    if (request.template && request.template.addToTemplates && request.data && request.data._tp) {
        var copy = request.template.addToTemplates.slice();
        copy.push(request.data._tp);
        request.data._tp = copy;
    }

    function runRequest(err, request) {

        if (err) {
            return callback(err);
        }

        // do input/output
        io[request.method](request, function (err, data) {

            // After {event}.
            // e.g.: after: {
            //  app: {
            //    create: "someEvent",
            //    read: "anotherEvent"
            //  }
            // }
            //
            // after: { appId: "catchAll" }
            request.template.after = Object(request.template.after);
            var typeOfAfter = typeof request.template.after[M.config.app.id];
            if (typeOfAfter === "string") {
                M.emit('crud:' + request.template.after[M.config.app.id], request, err, data, callback);
            } else if (typeOfAfter === "object" && typeof request.template.after[M.config.app.id][request.method] === "string") {
                M.emit('crud:' +  request.template.after[M.config.app.id][request.method], request, err, data, callback);
            } else {
                callback(err, data);
            }

            // emit a server event
            if (request.template.on && request.template.on[request.method]) {
                for (var event in request.template.on[request.method]) {
                    var args = request.template.on[request.method][event].slice();
                    args.splice(0, 0, event, request);
                    request.result = data;
                    M.emit.apply(M, args);
                }
            }
        });
    }

    // Before {event}.
    // e.g.: before: {
    //   appId: {
    //    create: "someEvent",
    //    read: "anotherEvent"
    //   }
    // }
    //
    // before: { appId: "catchAll" }
    request.template.before = Object(request.template.before);
    var typeOfBefore = typeof request.template.before[M.config.app.id];
    if (typeOfBefore === "string") {
        M.emit('crud:' + request.template.before[M.config.app.id], request, runRequest);
    } else if (typeOfBefore === "object" && typeof request.template.before[M.config.app.id][request.method] === "string") {
        M.emit('crud:' +  request.template.before[M.config.app.id][request.method], request, runRequest);
    } else {
        runRequest(null, request);
    }
}

function createError(code, message) {
    var error = new Error(message);
    error.statusCode = code;
    return error;
}

function model (request, callback) {

    if (!request) {
        return callback(createError(400, 'Bad request'));
    }

    if (!io[request.method]) {
        return callback(createError(501, 'Method not implemented'));
    }

    // get template and check access (cache)
    templates.getTemplate(request, function (err, request) {

        if (err) {
            return callback(err);
        }

        try {
            if (request.method !== 'create') {
                recursiveConvert(request.template.schema, request.query, '');
            }
        } catch (err) {
            return callback(createError(500, err.toString()));
        }

        // special handler for template requests
        if (request.method === 'read' && request.templateId == templates.CORE_TEMPLATE_IDS.templates) {
            templates.getTemplates(request, callback);
            return;
        }

        // check role access when reading templates with item access control
        if (request.template.itemAccess) {
            request.query['roles.' + request.role + '.access'] = { $regex: templates.getAccessKey(request.method) };

            // add role access to item
            if (request.method === 'create') {
                request.data.roles = {};
                request.data.roles[request.role] = { access: request.template.itemAccess };
            }

            // prevent update method form overwrite its own rights
            if (request.method === 'update') {
                if (request.data.$set && typeof request.data.$set['roles.' + request.role + '.access'] !== 'undefined') {
                    request.data.$set['roles.' + request.role + '.access'] = request.template.itemAccess;
                }
            }
        }

        // make joins only on find requests and when template has linked fields
        if (request.method === 'read' && request.template.linkedFields && !(request.template.options || {}).noJoins && !request.noJoins) {

            createJoints(request, function (err, joints, length) {

                if (err) {
                    return callback(err);
                }

                // add joints to request
                if (joints) {
                    request.joints = joints;
                    request.jointsLength = length;
                }

                // hide _tp
                if (!request.options.fields || Object.keys(request.options.fields).length === 0) {
                    request.options.fields = {_tp: 0};
                }

                doDbRequest(request, callback);
            });
        } else {
            // hide _tp
            if (!request.options.fields || Object.keys(request.options.fields).length === 0) {
                request.options.fields = {_tp: 0};
            }

            doDbRequest(request, callback);
        }
    });
}

module.exports = function (request, callback) {
    model(request, function (err, data) {
        if (err && err.message === "Templates not found.") {
            var templatesNotFoundEvent = "crud:templatesNotFound";
            if (M._events[templatesNotFoundEvent]) {
                return M.emit(templatesNotFoundEvent, request, err, data, callback);
            }
        }

        callback(err, data);
    });
};

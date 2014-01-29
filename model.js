var io = require('./io');
var templates = require('./templates');
var ObjectId = require('modm').ObjectId;

/*
 *  e.g. findValue({
 *      a: {
 *          b: {
 *              c: 10
 *          }
 *      }
 *  }, "a.b.c") === 10 // true
 *
 * */
function findValue (parent, dotNot) {

    if (!dotNot) return undefined;
    if (!parent) return undefined;

    var splits = dotNot.split(".");
    var value;

    for (var i = 0; i < splits.length; i++) {
        value = parent[splits[i]];
        if (value === undefined) return undefined;
        if (typeof value === "object") parent = value;
    }

    return value;
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
                        obj[i] = new Date(obj[i]);
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
                obj[key] = new Date(obj[key]);
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
                query: {},
                merge: field
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
        for (var i = 0, l = fetchedTemplates.length; i < l; ++i) {

            // create merge request
            mergeRequests[fetchedTemplates[i]._id] = {
                role: request.role,
                options: {
                    fields: linkedTemplatesToLoad[fetchedTemplates[i]._id].fields
                },
                template: fetchedTemplates[i],
                query: linkedTemplatesToLoad[fetchedTemplates[i]._id].query,
                merge: linkedTemplatesToLoad[fetchedTemplates[i]._id].merge
            };

            // make sure _id is always returned
            if (returnFields) {
                request.options.fields._id = 1;
            }

            // take limit from request
            if (request.options.limit) {
                mergeRequests[fetchedTemplates[i]._id].options.limit = request.options.limit;
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

    // do input/output
    io[request.method](request, function (err, data, readCount) {

        // it's an array
        if (data instanceof Array && request.options.sort) {

            // TODO multiple sort
            // > request.options.sort
            //   [ [ [ 'coupon', 'name' ], 1 ],
            //     [ 'number', 1 ] ]
            //
            //   sortField becomes: 'number'
            //
            var sortField = JSON.parse(JSON.stringify(request.options.sort))
              , order;

            sortField = sortField[sortField.length - 1];
            if (sortField) {

                order = sortField[1];
                sortField = sortField[0];

                // prepare sort field
                if (sortField instanceof Array) {
                    sortField = sortField.join("."); // e.g. ['coupon', 'name'] --> "coupon.name"
                }

                // finally sort the data
                data.sort(function (a, b) {

                    // find the sort field in items
                    fieldA = findValue(a, sortField);
                    fieldB = findValue(b, sortField);

                    // string
                    if (typeof fieldA === "string") {
                        if (order > 0) {
                            return fieldA.localeCompare(fieldB);
                        } else {
                            return fieldB.localeCompare(fieldA);
                        }
                    // number
                    } else if (typeof fieldA === "number") {
                        if (order > 0) {
                            return fieldA - fieldB;
                        } else {
                            return fieldB - fieldA;
                        }
                    // TODO Other data types?
                    } else if (!fieldA) {
                        if (order > 0) {
                            return false;
                        } else {
                            return true;
                        }
                    } else {
                        console.warn("[Warning!] Unhandled sort data type: ", typeof fieldA, JSON.stringify(fieldA, null, 4));
                        return true;
                    }
                });
            }
        }

        callback (err, data, readCount);
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

function createError(code, message) {
    var error = new Error(message);
    error.statusCode = code;
    return error;
}

module.exports = function (request, callback) {

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
        if (request.method === 'read' && request.template.linkedFields && !request.noJoins) {
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
};


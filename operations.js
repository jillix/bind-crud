var model = require('./model');
var ObjectId = require('mongodb').ObjectID;

var METHODS = [
    'create',
    'read',
    'update',
    'delete'
];

for (var i in METHODS) {
    (function(method) {
        // operations
        exports[method] = function (link) {
            model(createRequest(method, link), createResponseHandler(method, link));
        };

        // listeners
        var serverEvent = 'crud.' + method;
        M.on(serverEvent, function (request, callback) {

            request.method = method;
            request.options = request.options || {};
            request.templateId = typeof request.templateId === 'string' ? ObjectId(request.templateId) : request.templateId;

            if (!callback) {
                callback = function(err) {
                    if (err) {
                        console.error('Error executing server operation: ' + serverEvent);
                        console.error('******************')
                        console.error(err);
                        console.error('------------------')
                        console.error(request);
                        console.error('******************')
                    }
                };
            }
            model(request, function(err, data, count) {
                if (request.noCursor && data && typeof data.toArray === 'function') {
                    data.toArray(function(err, data) {
                        callback(err, data, count);
                    });
                    return;
                }
                callback(err, data, count);
            });
        });
    })(METHODS[i]);
}

// init operation
exports.init = function (link) { link.send(200); }

// private functions
function createRequest (method, link) {

    var data = link.data || {};

    // template id is mandatory
    if (!data.t) {
        return null;
    }

    // Get role or set the public role
    var role = link.session.crudRole;
    if (link.session._rid === M.config.app.publicRole && !link.session._uid) {
        link.session.crudRole = role = ObjectId('000000000000000000000001');
    }

    var request = {
        role: role,
        options: {},
        templateId: typeof data.t === 'string' ? ObjectId(data.t) : data.t,
        method: method,
        session: link.session,
        // TODO remove this when updates on linked fields are possible
        noJoins: data.noJoins
    };

    // query
    request.query = data.q || {};
    request.query._tp = data.t;

    // update
    if (data.d && data.d.constructor.name === 'Object') {

        // set type
        if (method === 'create') {
            data.d._tp = data.t;
        }

        request.data = data.d;
    }

    // options
    if (data.o && data.o.constructor.name === 'Object') {
        request.options = data.o;
    } else {
        request.options = {};
    }

    return request;
}

function createResponseHandler (method, link) {
    return function(err, results, readCount) {

        if (err) {
            return link.send(err.statusCode || 500, err.message || err.toString() || err);
        }

        link.res.headers['content-type'] = 'application/json; charset=utf-8';

        // TODO How can this be fixed using a better way?
        var constructorNameOfResults = results.constructor.name;
        if (results && constructorNameOfResults === 'Object' && typeof results.toArray === 'function') {
            constructorNameOfResults = 'Cursor';
        }

         // if we have an array or a cursor, set X-Mono-CRUD-Count response header
        if (['Cursor', 'Array'].indexOf(constructorNameOfResults) !== -1) {
            link.res.headers['X-Mono-CRUD-Count'] = (readCount || 0).toString();
        }


        if (method === 'read' && constructorNameOfResults === 'Cursor') {

            // stream result
            var stream = results.stream();

            link.stream.start(200);

            stream.on('end', function() {
                link.stream.end();
            });
            stream.on('error', function(err) {
                link.stream.error(500, err.toString());
            });
            stream.on('data', function(data) {
                link.stream.data(data);
            });

        } else {
            link.send(200, results);
        }
    };
}

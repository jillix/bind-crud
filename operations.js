var model = require('./model');

var METHODS = [
    'create',
    'read',
    'update',
    'delete'
];

for (var i in METHODS) {
    // operations
    (function(method) {
        exports[method] = function (link) {
            model(createRequest(method, link), createResponseHandler(method, link));
        };

        // listeners
        var serverEvent = 'crud.' + method;
        M.on(serverEvent, function (request, callback) {
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
            model(request, callback);
        });
    })(METHODS[i]);
}

// private functions
function createRequest (method, link) {
    var data = link.data || {};

    // template id is mandatory
    if (!data.t) {
        return null;
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
        if (method === 'create') {
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

function createResponseHandler (method, link) {
    return function(err, results, readCount) {
        if (err) {
            return link.send(err.statusCode || 500, err.message || err);
        }

        link.res.headers['content-type'] = 'application/json; charset=utf-8';
        if (method === 'read' && results.constructor.name === 'Cursor') {

            link.res.headers['X-Mono-CRUD-Count'] = readCount.toString();

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


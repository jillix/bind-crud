var io = require('./io');
var types = require('./types');

function createRequest (link) {
    
    var data = link.data || {};
    
    // type is mandatory
    if (!data.t) {
        return;
    }
    
    var request = {
        role: link.session._rid,
        options: {},
        typeName: data.t
    };

    // query
    request.query = data.q || {};
    request.query._tp = data.t;
    
    // update
    if (data.d && data.d.constructor.name === 'Object') {
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

module.exports = function (method, link) {
    
    if (!io[method]) {
        return link.send(501, 'Method not implemented');
    }
    
    // check parameters
    var request = createRequest(link);

    if (!request) {
        return link.send(400, 'Bad request.');
    }
    
    // get type (cache)
    types.getType(request, function (err, request) {
        
        if (err) {
            return link.send(err.statusCode || 500, err.message);
        }
        
        // do input/output
        io[method](link, request);
    });
};


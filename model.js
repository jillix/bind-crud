var io = require('./io');
var templates = require('./templates');
var ObjectId = require('modm').ObjectId;

function createRequest (method, link) {
    
    var data = link.data || {};
    
    // template id is mandatory
    if (!data.t) {
        return;
    }
    
    // convert templateid to object id
    try {
        data.t = ObjectId(data.t);
    } catch (err) {
        return;
    }
    
    var request = {
        role: link.session._rid,
        options: {},
        templateId: data.t
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

function convertToObjectId (request) {
    try {
        // convert _id to MongoDB's ObjectId
        if (request.query._id) {
            request.query._id = request.template.model.driver.ObjectID(request.query._id);
        }
        
        // convert _ln._id to MongoDB's ObjectId
        if (request.query['_ln._id']) {
            request.query['_ln._id'] = request.template.model.driver.ObjectID(request.query['_ln._id']);
        }
        
        return request;
    } catch (err) {
        return;
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
        
        request = convertToObjectId(request);
        
        if (!request) {
            return link.send(400, 'Incorrect ObjectId format');
        }
        
        // do input/output
        io[method](link, request);
    });
};

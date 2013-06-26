var io = require('./io');
var modm = require('modm');

// TODO let the user define this configs
var config = {
    dbName: 'dms',
    templateTypeName: 'template',
    templateColName: 'items'
};

var model = modm(config.dbName, {
    server: {pooSize: 3},
    db: {w: 1}
});

var templateSchema = new modm.Schema({
    _tp: {type: String, required: true},
    id: {type: String, required: true},
    _ln: [{
        _tp: {type: String},
        id: {type: String}
    }],
    db: {type: String, required: true},
    collection: {type: String, required: true},
    roles: {type: Object, required: true},
    schema: {type: Object, required: true}
});

// type cache
var types = {
    // the template type must be in the cache, otherwise 
    // it's impossible to create the first template type
    template: {
        db: config.dbName,
        collection: config.templateColName,
        roles: {3: 1}, // 0 = no access, 1 = read, 2 = write
        schema: templateSchema,
        model: model,
        collection: model(config.templateColName, templateSchema)
    }
};

function createRequest (link) {
    
    var data = link.data || {};
    var request = {
        role: link.session._rid,
        options: {},
        typeName: data.q && data.q._tp ? data.q._tp : data.d && data.d._tp ? data.d._tp : null
    };
    
    // type is mandatory
    if (typeof request.typeName !== 'string') {
        return;
    }

    // query
    request.query = data.q || {};
    
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

function getType (request, callback) {

    if (!types[request.typeName]) {

        io.find(null, {
            query: {
                _tp: config.templateTypeName,
                id: request.typeName
            },
            options: {limit: 1, fields: {_id: 0}},
            type: types.template
        }, function (err, type) {
            
            if (err) {
                return callback(err);
            }
            
            if (!type) {
                var err = new Error('No type found.');
                err.statusCode = 404;
                return callback(err);
            }
            
            type.model = model;
            type.schema = new modm.Schema(type.schema);
            type.collection = model(type.collection, type.schema);
            request.type = types[request.typeName] = type;
            callback(null, request);
        });
        
        return;
    }
    
    request.type = types[request.typeName];
    callback(null, request);
}

function checkAccess (request, access) {
    
    if (request.type.roles[request.role] < access) {
        return false;
    }
    
    return true;
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
    getType(request, function (err, request) {
        
        if (err) {
            return link.send(err.statusCode || 500, err.toString());
        }
        
        // check access
        if (!checkAccess(request, 1)) {
            return link.send(403, 'Forbidden.');
        }
        
        // do input/output
        io[method](link, request);
    });
};


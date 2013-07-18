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
var typeCache = {
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

function fetchTypeFromDb (types, role, fields, callback) {
    
    // build query
    var dbReq = {
        query: {
            _tp: config.templateTypeName,
            id: types.length > 1 ? {$in: []} : '',
            roles: {}
        },
        options: {limit: 1, fields: fields || {}},
        type: typeCache.template
    };
    
    // check if role has write access
    dbReq.query.roles[role] = {$gt: 0};
    
    if (types.length > 1) {
        for (var i = 0, l = types.length; i < l; ++i) {
            if (typeof types[i] !== 'string' || types[i].length < 1) {
                var err = new Error('invalid type.');
                err.statusCode = 400;
                return callback(err);
            }
            
            dbReq.query.id.$in.push(types[i]);
        }
    } else {
        dbReq.query.id = types[0];
    }
    
    io.find(null, dbReq, callback);
}

function getType (request, callback) {

    if (!typeCache[request.typeName]) {
        return fetchTypeFromDb([request.typeName], request.role, {_id: 0}, function (err, type) {
                
            if (err) {
                err.statusCode = err.statusCode || 500;
                return callback(err);
            }
            
            if (!type) {
                var err = new Error('Type not found.');
                err.statusCode = 404;
                return callback(err);
            }
            
            type.model = model;
            type.schema = new modm.Schema(type.schema);
            type.collection = model(type.collection, type.schema);
            
            // cache type
            request.type = types[request.typeName] = type;
            callback(null, request);
        });
    }
    
    request.type = typeCache[request.typeName];
    callback(null, request);
}

function getTypes (link) {
    
    var types = link.path;
    var cachedTypes = [];
    var queryTypes = [];
    
    // check types
    if (!types || types.length < 1) {
        return link.send(400, 'No types given.');
    }
    
    // check cahed types
    for (var i = 0, l = types.length; i < l; ++i) {
        if (typeCache[types[i]]) {
            cachedTypes.push(typeCache[types[i]].schema.paths);
        } else {
            queryTypes.push(typeCache[types[i]]);
        }
    }
    
    if (queryTypes.length > 0) {
        return fetchTypeFromDb(queryTypes, link.session._rid, {_id: 0, 'schema.paths': 1}, function (err, cursor) {
            
            if (err) {
                return link.send(err.statusCode || 500, err.message);
            }
            
            if (!cursor) {
                return link.send(404, 'Types not found.');
            }
            
            cursor.toArray(function (err, types) {
                
                if (err) {
                    return link.send(500, err.message);
                }
                
                if (!types) {
                    return link.send(404, 'Types not found.');
                }
                
                for (var i = 0, l = types.length; i < l; ++i) {
                    cachedTypes.push(types[i].schema.paths);
                }
                
                link.send(200, cachedTypes);
            });
        });
    }
    
    link.send(200, cachedTypes);
}

exports.getType = getType;
exports.getTypes = getTypes;

var io = require('./io');
var modm = require('modm');

// TODO let the user define this configs
var config = {
    dbName: 'dms', // TODO handle with datasources
    templateId: '_template', // TODO handle with datasources
    templateColName: 'd_templates', // TODO handle with datasources
    templateSchema: {
        _tp: {type: String, required: true},
        _id: {type: String, required: true},
        _ln: [{
            _tp: {type: String},
            _id: {type: String}
        }],
        db: {type: String, required: true},
        collection: {type: String, required: true},
        roles: {type: Object, required: true},
        schema: {type: Object, required: true}
    }
};

var templateSchema = new modm.Schema(config.templateSchema);

// template cache
var templateCache = {
    // template's template must be in the cache, otherwise 
    // it's impossible to create the first template item
    template: {
        db: config.dbName,
        collection: config.templateColName,
        roles: {3: 1}, // 0 = no access, 1 = read, 2 = write
        schema: templateSchema,
        model: modm(config.dbName, {
            server: {pooSize: 3},
            db: {w: 1}
        })
    }
};
// init collection
templateCache.template.collection = templateCache.template.model(config.templateColName, templateSchema);

//TODO check access
function checkAccess (template, role, access) {
    /*if (template.roles[role] < access) {
        return false;
    }*/
    return true;
}

function initAndCache (template) {
    if (typeof template.db !== 'string') {
        return;
    };
    
    template.model = modm(template.db, {
        server: {pooSize: 3},
        db: {w: 1}
    });
    
    // add mandatory field _tp
    template.schema._tp = {
        type: String,
        required: true
    };
    
    // add mandatory field _id
    template.schema._id = {
        type: 'objectid',
        required: true
    };
    
    // add mandatory field _ln
    if (!template.schema._ln) {
        template.schema._ln = [{}];
    }
    
    // add mandatory field _ln._tp
    template.schema._ln[0]._tp = String;
    
    // add mandatory field _ln._id
    template.schema._ln[0]._id = 'objectid';
    
    template.schema = new modm.Schema(template.schema);
    template.collection = template.model(template.collection, template.schema);
    return templateCache[template._id] = template;
}

// TODO check access
function fetchTemplatesFromDb (templates, role, fields, callback) {
    
    // build query
    var dbReq = {
        query: {
            _id: templates.length > 1 ? {$in: []} : '',
            _tp: config.templateId
            //_ln: [{_tp: 'role'}]
        },
        options: {limit: templates.length, fields: fields || {}},
        template: templateCache.template
    };
    
    // check if role has write access
    //dbReq.query._ln[0]._id = {$gt: 0};
    
    if (templates.length > 1) {
        for (var i = 0, l = templates.length; i < l; ++i) {
            if (typeof templates[i] !== 'string' || templates[i].length < 1) {
                var err = new Error('Invalid templates.');
                err.statusCode = 400;
                return callback(err);
            }
            
            dbReq.query._id.$in.push(templates[i]);
        }
    } else {
        dbReq.query._id = templates[0];
    }
    
    io.find(null, dbReq, function (err, cursor) {
        
        if (err) {
            err.statusCode = 500;
            return callback(err);
        }
        
        if (!cursor) {
            var err = new Error('Templates not found.');
            err.statusCode = 404;
            return callback(err);
        }
        
        cursor.toArray(function (err, templates) {
                
            if (err) {
                err.statusCode = 500;
                return callback(err);
            }
            
            if (!templates || templates.length === 0) {
                var err = new Error('Templates not found.');
                err.statusCode = 404;
                return callback(err);
            }
            
            callback(null, templates);
        });
    });
}

function getTemplate (request, callback) {

    if (!templateCache[request.templateId]) {
        return fetchTemplatesFromDb([request.templateId], request.role, {}, function (err, template) {
            
            if (err) {
                err.statusCode = err.statusCode || 500;
                return callback(err);
            }
            
            request.template = initAndCache(template[0]);
            
            if (!request.template) {
                err = new Error('Bad template object.');
                err.statusCode = 500;
                return callback(err);
            }
            
            callback(null, request);
        });
    }
    
    // check access
    if (!checkAccess(templateCache[request.templateId], request.role, 1)) {
        var err = new Error('Templates not found.');
        err.statusCode = 404;
        return callback(err);
    }
    
    request.template = templateCache[request.templateId];
    callback(null, request);
}

function getTemplates (link) {
    
    var templates = link.data;
    var cachedTemplates = {};
    var queryTemplates = [];
    var addedTemplates = {};
    
    // check templates
    if (!templates || templates.length < 1) {
        return link.send(400, 'No templates given.');
    }
    
    // check cached templates
    for (var i = 0, l = templates.length; i < l; ++i) {
        // add to result if role has access
        if (templateCache[templates[i]] && checkAccess(templateCache[templates[i]], link.session._rid, 1)) {
            cachedTemplates[templates[i]] = templateCache[templates[i]].schema.paths;
        } else if (!addedTemplates[templates[i]]) {
            addedTemplates[templates[i]] = true;
            queryTemplates.push(templates[i]);
        }
    }
    
    if (queryTemplates.length > 0) {
        return fetchTemplatesFromDb(queryTemplates, link.session._rid, {}, function (err, templates) {
            
            if (err) {
                return link.send(err.statusCode || 500, err.message);
            }
            
            for (var i = 0, l = templates.length; i < l; ++i) {
                cachedTemplates[templates[i]._id] = initAndCache(templates[i]);
                if (cachedTemplates[templates[i]._id]) {
                    cachedTemplates[templates[i]._id] = cachedTemplates[templates[i]._id].schema.paths
                }
            }
            
            link.send(200, cachedTemplates);
        });
    }
    
    link.send(200, cachedTemplates);
}

exports.getTemplate = getTemplate;
exports.getTemplates = getTemplates;

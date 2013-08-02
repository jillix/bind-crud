var io = require('./io');
var modm = require('modm');

// TODO let the user define this configs
var config = {
    dbName: 'dms', // TODO handle with datasources
    templateId: '_template', // TODO handle with datasources
    templateColName: 'd_templates', // TODO handle with datasources
    templateSchema: {
        _tp: {type: String, required: true},
        _ln: [{
            _tp: {type: String},
            _id: {type: Object}
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

function getCachedTemplates (templates, role) {
    
    if (!templates || templates.length === 0) {
        return;
    }
    
    var resultTemplates = {};
    var queryTemplates = [];
    var addedTemplates = {};
    
    if (templates && templates.length > 0) {
        // check cached templates
        for (var i = 0, l = templates.length; i < l; ++i) {
            // add to result if role has access
            if (templateCache[templates[i]] && checkAccess(templateCache[templates[i]], role, 1)) {
                resultTemplates[templates[i]] = templateCache[templates[i]];
            } else if (!addedTemplates[templates[i]]) {
                addedTemplates[templates[i]] = true;
                queryTemplates.push(templates[i]);
            }
        }
    }
    
    return {
        query: queryTemplates,
        cached: resultTemplates
    }
}

// TODO check access
function fetchTemplatesFromDb (templates, role, fields, callback) {
    
    var tpls = getCachedTemplates(templates, role);
    var resultTemplates = {};
    
    // build query
    var dbReq = {
        query: {
            _tp: config.templateId
            //_ln: [{_tp: 'role'}]
        },
        options: {fields: fields || {}},
        template: templateCache.template
    };
    
    if (tpls) {
        var templates = tpls.query;
        resultTemplates = tpls.cached;
        
        // check if role has write access
        //dbReq.query._ln[0]._id = {$gt: 0};
        
        if (templates.length > 1) {
            
            dbReq.query._id ={$in: []};
            dbReq.options.limit = templates.length;
            
            for (var i = 0, l = templates.length; i < l; ++i) {
                if (typeof templates[i] !== 'string' || templates[i].length < 1) {
                    var err = new Error('Invalid templates.');
                    err.statusCode = 400;
                    return callback(err);
                }
                
                dbReq.query._id.$in.push(templates[i]);
            }
        } else if (templates.length > 0) {
            
            dbReq.options.limit = 1;
            dbReq.query._id = templates[0];
        }
    }
    
    if (!tpls || tpls.query.length > 0) {
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
                
                for (var i = 0, l = templates.length; i < l; ++i) {
                    var temp = initAndCache(templates[i]);
                    if (temp) {
                        resultTemplates[templates[i]._id] = temp;
                    }
                }
                
                callback(null, resultTemplates);
            });
        });
    } else {
        callback(null, tpls.cached);
    }
}

function getTemplate (request, callback) {

    fetchTemplatesFromDb([request.templateId], request.role, {}, function (err, template) {
        
        if (err) {
            err.statusCode = err.statusCode || 500;
            return callback(err);
        }
        
        request.template = template[request.templateId];
        
        if (!request.template) {
            err = new Error('Bad template object.');
            err.statusCode = 500;
            return callback(err);
        }
        
        callback(null, request);
    });
}

function getTemplates (link) {
    
    var templates = link.data;
    
    fetchTemplatesFromDb(templates, link.session._rid, {}, function (err, templates) {
        
        if (err) {
            return link.send(err.statusCode || 500, err.message);
        }
        
        var result = {};
        for (var template in templates) {
            result[template] = {
                id: templates[template]._id,
                name: templates[template].name,
                schema: templates[template].schema.paths
            };
        }
        
        link.send(200, result);
    });
}

exports.getTemplate = getTemplate;
exports.getTemplates = getTemplates;

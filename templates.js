var io = require('./io');
var modm = require('modm');

// TODO let the user define this configs
var config = {
    dbName: 'dms', // TODO handle with datasources
    templateId: modm.ObjectId('000000000000000000000000'), // TODO handle with datasources
    roleTemplateId: modm.ObjectId('000000000000000000000002'),
    templateColName: 'd_templates', // TODO handle with datasources
    templateSchema: {
        _id: {type: 'objectid'},
        _tp: {type: 'objectid', required: true},
        db: {type: 'string', required: true},
        collection: {type: 'string', required: true},
        name: {type: 'string', required: true},
        schema: {type: 'object', required: true}
    }
};

var templateSchema = new modm.Schema(config.templateSchema);

// template cache
var templateCache = {
    // template's template must be in the cache, otherwise 
    // it's impossible to create the first template item
    '000000000000000000000000': {
        _id: modm.ObjectId('000000000000000000000000'),
        label: 'Templates',
        db: config.dbName,
        collection: config.templateColName,
        schema: templateSchema,
        model: modm(config.dbName, {
            server: {pooSize: 3},
            db: {w: 1}
        })
    }
};
// init collection
templateCache[config.templateId].collection = templateCache[config.templateId].model(config.templateColName, templateSchema);

function ObjectId (id) {
    try {
        return modm.ObjectId(id);
    } catch (err) {
        return null;
    }
}

// check access
function checkAccess (template, role, access) {
    
    // grant access for templates without roles
    if (!template.roles) {
        return true;
    }
    
    if (template.roles[role] < access) {
        return false;
    }
    
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
        type: 'objectid',
        required: true
    };
    
    // add mandatory field _id
    template.schema._id = {
        type: 'objectid',
        required: true
    };
    
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

function fetchTemplatesFromDb (templates, role, fields, callback) {
    
    var tpls = getCachedTemplates(templates, role);
    var resultTemplates = {};
    
    // build query
    var dbReq = {
        query: {_tp: config.templateId},
        options: {fields: fields || {}},
        template: templateCache[config.templateId]
    };
    
    if (tpls) {
        var templates = tpls.query;
        resultTemplates = tpls.cached;
        
        // check if role has access
        dbReq.query['roles.' + role] = {$gt: 0};
        
        if (templates.length > 1) {
            
            dbReq.query._id = {$in: []};
            dbReq.options.limit = templates.length;
            
            for (var i = 0, l = templates.length; i < l; ++i) {
                templates[i] = ObjectId(templates[i]);
                if (!templates[i]) {
                    var err = new Error('Invalid templates.');
                    err.statusCode = 400;
                    return callback(err);
                }
                
                dbReq.query._id.$in.push(templates[i]);
            }
        } else if (templates.length > 0) {
            
            if (templates[0] = ObjectId(templates[0])) {
                dbReq.options.limit = 1;
                dbReq.query._id = templates[0];
            } else {
                var err = new Error('Invalid templates.');
                err.statusCode = 400;
                return callback(err);
            }
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

function getMergeTemplates (templates, role, callback) {

    fetchTemplatesFromDb(templates, role, {}, function (err, templates) {

        if (err) {
            return callback(err);
        }
        
        callback(null, templates);
    });
}

// TODO add more core templates here when necessary
var CORE_TMPL_RE = new RegExp('00000000000000000000000(0|1|2)');

function getTemplates (templates, role, callback) {
    
    var myRoleString = role ? role.toString() : '';

    fetchTemplatesFromDb(templates, role, {}, function (err, templates) {

        if (err) {
            return callback(err);
        }
        
        var result = {};
        for (var id in templates) {
            // if this is a core template
            if (CORE_TMPL_RE.test(id) && templates[id].roles) {
                // do not return templates for users that cannot modify them
                // (only super-admins will have at least access 2)
                if (templates[id].roles[myRoleString] < 2) {
                    continue;
                }
            }
            
            result[id] = {
                id: templates[id]._id,
                //name: templates[id].name,
                schema: templates[id].schema.paths
            };

            // let the UI template information go through
            var uiElems = ['label', 'html', 'filters', 'sort', 'links'];
            for (var i in uiElems) {
                if (templates[id][uiElems[i]]) {
                    result[id][uiElems[i]] = templates[id][uiElems[i]];
                }
            }
        }
        
        callback(null, result);
    });
}

M.on('crud_getTemplate', getTemplate);

exports.getTemplate = getTemplate;
exports.getTemplates = getTemplates;
exports.getMergeTemplates = getMergeTemplates;

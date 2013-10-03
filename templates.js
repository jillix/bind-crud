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
        _li: {type: 'array'},
        db: {type: 'string', required: true},
        collection: {type: 'string', required: true},
        name: {type: 'string', required: true},
        roles: {type: 'object', required: true},
        schema: {type: 'object', required: true},
        label: {type: 'string'},
        links: {type: 'array'},
        options: {type: 'object'}
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
        itemAccess: 'crud',
        roles: {
            '*': {
                access: 'r'
            }
        },
        model: modm(config.dbName, {
            server: {pooSize: 3},
            db: {w: 1}
        })
    }
    
    // TODO move all core tempaltes to crud module.. how to add roles??
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

function getAccessKey (method) {
    switch (method) {
        case 'find':
            return 'r';
        case 'update':
            return 'u';
        case 'insert':
            return 'c';
        case 'remove':
            return 'd';
    }
}

// check access
function checkAccess (template, role, method) {
    
    // grant access for templates without roles or for the role wildcard
    if (!template.roles || (template.roles['*'] && typeof template.roles['*'].access === 'string' && template.roles['*'].access.indexOf(getAccessKey(method)) > -1)) {
        return true;
    }
    
    // check if role has read rights
    if (template.roles[role] && typeof template.roles[role].access === 'string' && template.roles[role].access.indexOf(getAccessKey(method)) > -1) {
        return true;
    }
    
    return false;
}

function initAndCache (template) {
    
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
    
    // add mandatory field _li
    template.schema._li = [{
        type: 'objectid'
    }];
    
    template.schema = new modm.Schema(template.schema);
    template.collection = template.model(template.collection, template.schema);
    
    // collect all links for faster access
    for (var field in template.schema.paths) {
        if (template.schema.paths[field].link) {
            if (!template.linkedFields) {
                template.linkedFields = {};
            }
            
            template.linkedFields[field] = template.schema.paths[field];
        }
    }
    
    return templateCache[template._id] = template;
}

function getCachedTemplates (templates, role, method) {
    
    if (!templates || templates.length === 0) {
        return;
    }
    
    var resultTemplates = {};
    var queryTemplates = [];
    var addedTemplates = {};
    
    if (templates && templates.length > 0) {
        for (var i = 0, l = templates.length; i < l; ++i) {
            // check if template is in cache
            if (templateCache[templates[i]]) {
                // check role access
                if (checkAccess(templateCache[templates[i]], role, method)) {
                    resultTemplates[templates[i]] = templateCache[templates[i]];
                }
            // add template to query
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

function fetchTemplatesFromDb (templates, role, fields, method, callback) {
    
    var tpls = getCachedTemplates(templates, role, method);
    
    // return if no templates must be fetched from db
    if (tpls.query.length === 0) {
        return callback(null, tpls.cached);
    }
    
    // build query
    var dbReq = {
        query: {
            _id: {$in: []},
            _tp: config.templateId
        },
        options: {
            fields: fields || {},
            limit: tpls.query.length
        },
        template: templateCache[config.templateId]
    };
    
    // check acces on template item
    dbReq.query['roles.' + role + '.access'] = {$regex: getAccessKey(method)};
    
    // add templates to query
    for (var i = 0, l = tpls.query.length; i < l; ++i) {
        tpls.query[i] = ObjectId(tpls.query[i]);
        if (!tpls.query[i]) {
            var err = new Error('Invalid templates.');
            err.statusCode = 400;
            return callback(err);
        }
        
        dbReq.query._id.$in.push(tpls.query[i]);
    }
    
    // fetch requested templates from db
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
            
            // merge with cached templates
            for (var i = 0, l = templates.length; i < l; ++i) {
                
                // init and cache templates
                tpls.cached[templates[i]._id] = initAndCache(templates[i]);
            }
            
            callback(null, tpls.cached);
        });
    });
}

// called from the model.js to check template access
function getTemplate (request, callback) {

    fetchTemplatesFromDb([request.templateId], request.role, {}, request.method, function (err, template) {
        
        if (err) {
            err.statusCode = err.statusCode || 500;
            return callback(err);
        }
        
        request.template = template[request.templateId];
        
        if (!request.template) {
            err = new Error('Templates not found.');
            err.statusCode = 404;
            return callback(err);
        }
        
        callback(null, request);
    });
}

// get templates for joins
function getMergeTemplates (templates, role, callback) {

    fetchTemplatesFromDb(templates, role, {}, 'find', function (err, templates) {

        if (err) {
            return callback(err);
        }
        
        callback(null, templates);
    });
}

// called from the getTempaltes operation
function getTemplates (templates, role, callback) {
    
    var myRoleString = role ? role.toString() : '';
    
    fetchTemplatesFromDb(templates, role, {}, 'find', function (err, templates) {

        if (err) {
            return callback(err);
        }
        
        var result = {};
        for (var id in templates) {
            
            result[id] = {
                id: templates[id]._id,
                schema: templates[id].schema.paths
            };

            // let the UI template information go through
            var uiElems = ['label', 'html', 'filters', 'sort'];
            for (var i in uiElems) {
                if ((templates[id].options || {})[uiElems[i]]) {
                    result[id].options = result[id].options || {};
                    result[id].options[uiElems[i]] = templates[id].options[uiElems[i]];
                }
            }
            result[id].links = templates[id].links;
        }
        
        callback(null, result);
    });
}

M.on('crud_getTemplate', getTemplate);

exports.getTemplate = getTemplate;
exports.getTemplates = getTemplates;
exports.getMergeTemplates = getMergeTemplates;
exports.getAccessKey = getAccessKey;

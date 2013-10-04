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
        _li: [{type: 'objectid'}],
        _crud: {
            db: {type: 'string', required: true},
            collection: {type: 'string', required: true},
            roles: {type: 'object', required: true},
            itemAccess: {type: 'string'}
        },
        name: {type: 'string', required: true},
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
        _crud: {
            db: config.dbName,
            collection: config.templateColName,
            roles: {
                '*': {
                    access: 'r'
                }
            },
            itemAccess: 'crud',
            model: modm(config.dbName, {
                server: {pooSize: 3},
                db: {w: 1}
            })
        },
        label: 'Templates',
        schema: templateSchema
        
    }
    
    // TODO move all core tempaltes to crud module.. how to add roles??
};
// init collection
templateCache[config.templateId]._crud.collection = templateCache[config.templateId]._crud.model(config.templateColName, templateSchema);

var privateFields = {
    _crud: 1,
    _id: 0,
    _tp: 1,
    _li: 1,
    linkedFields: 1
};

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
    
    if (!template._crud) {
        return false;
    }
    
    // grant access for templates without roles or for the role wildcard
    if (!template._crud.roles || (template._crud.roles['*'] && typeof template._crud.roles['*'].access === 'string' && template._crud.roles['*'].access.indexOf(getAccessKey(method)) > -1)) {
        return true;
    }
    
    // check if role has read rights
    if (template._crud.roles[role] && typeof template._crud.roles[role].access === 'string' && template._crud.roles[role].access.indexOf(getAccessKey(method)) > -1) {
        return true;
    }
    
    return false;
}

function initAndCache (template) {
    
    template._crud.model = modm(template._crud.db, {
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
    template._crud.collection = template._crud.model(template._crud.collection, template.schema);
    
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
        return {
            query: [],
            cached: []
        };
    }
    
    var resultTemplates = [];
    var queryTemplates = [];
    var addedTemplates = {};
    
    if (templates && templates.length > 0) {
        for (var i = 0, l = templates.length; i < l; ++i) {
            // check if template is in cache
            if (templateCache[templates[i]]) {
                // check role access
                if (checkAccess(templateCache[templates[i]], role, method)) {
                    resultTemplates.push(templateCache[templates[i]]);
                }
            // add template to query
            } else if (!addedTemplates[templates[i]]) {
                addedTemplates[templates[i]] = true;
                queryTemplates.push(modm.ObjectId(templates[i]));
            }
        }
    }
    
    return {
        query: queryTemplates,
        cached: resultTemplates
    };
}

function fetchTemplates (request, callback) {
    
    if (!request.query) {
        return callback('No templates to fetch.');
    }
    
    // build query
    var dbReq = {
        query: {},
        options: {},
        template: templateCache[config.templateId]
    };
    var cached = {};
    
    // [] => check cache then fetch
    if (request.query.constructor.name === 'Array') {
        cached = getCachedTemplates(request.query, request.role, request.method);
        
        // return if no templates must be fetched from db
        if (cached.query.length === 0) {
            return callback(null, cached.cached);
        }
        
        dbReq.query._id = {$in: cached.query};
        dbReq.options.limit = cached.query.length;
        
    // {} => fetch then check cache
    } else if (request.query.constructor.name === 'Object') {
        cached.cached = [];
        
        dbReq.query = request.query;
        dbReq.options = request.options;
        dbReq.options.fields = {};
    }
    
    // check acces on template item
    dbReq.query._tp = config.templateId;
    dbReq.query['_crud.roles.' + request.role + '.access'] = {$regex: getAccessKey(request.method)};
    
    // fetch requested templates from db
    //console.log(dbReq.query, dbReq.options);
    io.find(null, dbReq, function (err, cursor) {

        if (err) {
            err.statusCode = 500;
            return callback(err);
        }
        
        if (!cursor) {
            err = new Error('Templates not found.');
            err.statusCode = 404;
            return callback(err);
        }
        
        cursor.toArray(function (err, templates) {
            
            if (err) {
                err.statusCode = 500;
                return callback(err);
            }
            
            if (!templates || templates.length === 0) {
                err = new Error('Templates not found.');
                err.statusCode = 404;
                return callback(err);
            }
            
            // merge with cached templates
            for (var i = 0, l = templates.length; i < l; ++i) {
                // init and cache templates
                cached.cached.push(templateCache[templates[i]._id] || initAndCache(templates[i]));
            }
            
            callback(null, cached.cached);
        });
    });
}

// called from the model.js to check template access
function getTemplate (request, callback) {
    
    var templateRequest = {
        query: [request.templateId],
        options: request.options,
        role: request.role,
        method: request.method
    };
    
    fetchTemplates(templateRequest, function (err, template) {
        
        if (err) {
            err.statusCode = err.statusCode || 500;
            return callback(err);
        }
        
        request.template = template[0];
        
        if (!request.template) {
            err = new Error('Templates not found.');
            err.statusCode = 404;
            return callback(err);
        }
        
        callback(null, request);
    });
}

// get templates for joins
function getMergeTemplates (request, role, callback) {
    
    request = {
        query: request.length ? request : [],
        role: role,
        method: 'find'
    };
    
    fetchTemplates(request, function (err, templates) {

        if (err) {
            return callback(err);
        }
        
        callback(null, templates);
    });
}

// called from the getTempaltes operation
function getTemplates (request, callback) {
    
    // cache return fields
    var fields = request.options.fields;
    
    //var myRoleString = request.role ? requesresult[id][field] = templates[id][field];t.role.toString() : '';
    fetchTemplates(request, function (err, templates) {

        if (err) {
            return callback(err);
        }
        
        var result = [];
        for (var i = 0, l = templates.length; i < l; ++i) {
            
            result[i] = {};
            
            for (var field in templates[i]) {
                
                if (!privateFields[field]) {
                    if (fields) {
                        if (fields[field]) {
                            result[i][field] = templates[i][field];
                        }
                    } else {
                        result[i][field] = templates[i][field];
                    }
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
exports.getAccessKey = getAccessKey;
exports.templateId = config.templateId;

var io = require('./io');
var modm = require('modm');


// ******************************
// Constants
// ******************************

var CORE_TEMPLATE_IDS = {
    templates: '000000000000000000000000'
};

var PRIVATE_FIELDS = {
    _tp: 1,
    _li: 1,
    db: 1,
    collection: 1,
    roles: 1,
    itemAccess: 1,
    linkedFields: 1
};

var ROLE_CONFIGURABLE_FIELDS = {
    options: 1,
    links: 1,
    schema: 1
};


// TODO let the user define this configs
var config = {
    dbName: 'dms', // TODO handle with datasources
    roleTemplateId: modm.ObjectId('000000000000000000000002'),
    templateColName: 'd_templates', // TODO handle with datasources
    templateSchema: {
        _id: {type: 'objectid'},
        _tp: {type: 'objectid', required: true},
        _li: [{type: 'objectid'}],
        db: {type: 'string', required: true},
        collection: {type: 'string', required: true},
        roles: {type: 'object', required: true},
        itemAccess: {type: 'string'},
        name: {type: 'string', required: true},
        schema: {type: 'object', required: true},
        links: {type: 'array'},
        options: {type: 'object'}
    }
};

// ******************************
// Templates
// ******************************

var templateSchema = new modm.Schema(config.templateSchema);

// template cache
var templateCache = {};

// template's template must be in the cache, otherwise
// it's impossible to create the first template item
templateCache[CORE_TEMPLATE_IDS.templates] = {
    _id: modm.ObjectId(CORE_TEMPLATE_IDS.templates),
    _modm: {
        db: modm(config.dbName, {
            server: {pooSize: 3},
            db: {w: 1}
        })
    },
    db: config.dbName,
    collection: config.templateColName,
    roles: {
        '*': {
            access: 'r'
        }
    },
    itemAccess: 'crud',
    label: 'Templates',
    schema: templateSchema.paths
};

// TODO move all core templates to crud module.. how to add roles??

// init collection
templateCache[CORE_TEMPLATE_IDS.templates]._modm.collection = templateCache[CORE_TEMPLATE_IDS.templates]._modm.db(config.templateColName, templateSchema);


// ******************************
// Exports
// ******************************

M.on('crud.getTemplate', getTemplate);

exports.getTemplate = getTemplate;
exports.getTemplates = getTemplates;
exports.getMergeTemplates = getMergeTemplates;
exports.getAccessKey = getAccessKey;
exports.CORE_TEMPLATE_IDS = CORE_TEMPLATE_IDS;


// ******************************
// Public functions
// ******************************

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
       
       
       
        if (!template || !template.length) {
            err = new Error('Templates not found.');
            err.statusCode = 404;
            return callback(err);
        }

        if (template[0].roles)
        request.template = template[0];

        callback(null, request);
    });
}

// get templates for joins
function getMergeTemplates (request, role, callback) {

    request = {
        query: request.length ? request : [],
        role: role,
        method: 'read'
    };

    fetchTemplates(request, function (err, templates) {

        if (err) {
            return callback(err);
        }

        callback(null, templates);
    });
}

// special function when requesting template items
function getTemplates (request, callback) {

    fetchTemplates(request, function (err, templates) {

        if (err) {
            return callback(err);
        }

        var result = [];
        for (var i = 0, l = templates.length, admin; i < l; ++i) {

            result[i] = {};

            // return full template if user has admin rigths
            admin = false;
            if (templates[i].roles[request.role] && templates[i].roles[request.role].access.match(/c|u|d/)) {
                admin = true;
            }

            // delete private fields from result templates
            for (var field in templates[i]) {
                if ((admin || !PRIVATE_FIELDS[field]) && field !== '_modm') {
                    result[i][field] = templates[i][field];
                }
            }

            // we must overwrite the template with the role configuration
            if (templates[i].roles[request.role] && templates[i].roles[request.role].config) {
                mergeRoleTemplateConfig(result[i], templates[i].roles[request.role].config);
            }
        }

        callback(null, result);
    });
}

// the access key for a crud operation is the first letter of the method
function getAccessKey (method) {
    return typeof method === 'string' ? method[0] : undefined;
}


// ******************************
// Private functions
// ******************************

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
    
    // save modm instance on template
    template._modm = {
        model: modm(template.db, {
            server: {pooSize: 3},
            db: {w: 1}
        })
    };
    
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
    
    template._modm.schema = new modm.Schema(template.schema);
    template._modm.collection = template._modm.model(template.collection, template._modm.schema);
    
    template.schema = template._modm.schema.paths;
    
    // collect all links for faster access
    for (var field in template.schema) {
        if (template.schema[field].link) {
            if (!template.linkedFields) {
                template.linkedFields = {};
            }
            
            template.linkedFields[field] = template.schema[field];
        }
    }
    
    templateCache[template._id] = template;
    return templateCache[template._id];
}

function getCachedTemplates (templates, role, method) {

    var result = {
        query: [],
        cached: []
    }

    var addedTemplates = {};

    for (var i in templates) {
        // check if template is in cache
        if (templateCache[templates[i]]) {
            // check role access
            if (checkAccess(templateCache[templates[i]], role, method)) {
                // if this role has a special template configuration
                if (templateCache[templates[i]].roles[role] && templateCache[templates[i]].roles[role].config) {

                    // we must build new template objects in order not to affect
                    // the cache with the role configurations
                    var partialClone = {};

                    // built the partial template clone
                    for (var key in templateCache[templates[i]]) {
                        // the non configurable template properties are copied as reference
                        if (!ROLE_CONFIGURABLE_FIELDS[key]) {
                            partialClone[key] = templateCache[templates[i]][key];
                        }
                        // the configurable template properties must be cloned
                        else {
                            partialClone[key] = cloneJSON(templateCache[templates[i]][key]);
                        }
                    }

                    // noe we can safely merge the role config without affcting the cache
                    mergeRoleTemplateConfig(partialClone, templateCache[templates[i]].roles[role].config);
                    result.cached.push(partialClone);
                }
                // otherwise we are safe to pass the cached template reference
                else {
                    result.cached.push(templateCache[templates[i]]);
                }
            }
        }
        // add template to query
        else if (!addedTemplates[templates[i]]) {
            addedTemplates[templates[i]] = true;
        }
    }

    return result;
}

function fetchTemplates (request, callback) {

    if (!request.query) {
        return callback('No templates to fetch.');
    }

    // build query
    var dbReq = {
        query: {},
        options: {},
        template: templateCache[CORE_TEMPLATE_IDS.templates]
    };
    var oldCached = {};

    // [] => check cache then fetch
    if (request.query.constructor.name === 'Array') {
        oldCached = getCachedTemplates(request.query, request.role, request.method);

        // return if no templates must be fetched from db
        if (oldCached.query.length === 0) {
            return callback(null, oldCached.cached);
        }
        
        dbReq.query._id = {$in: oldCached.query};
        dbReq.options.limit = oldCached.query.length;
    }
    // {} => fetch then check cache
    // TODO handle $in queries with cache
    else if (request.query.constructor.name === 'Object') {
        oldCached.cached = [];
        
        dbReq.query = request.query;
        dbReq.options = request.options;
        dbReq.options.fields = {};
    }
    
    // check access on template item
    dbReq.query._tp = modm.ObjectId(CORE_TEMPLATE_IDS.templates);
    dbReq.query['roles.' + request.role + '.access'] = {$regex: getAccessKey(request.method)};

    // fetch requested templates from db
    io.read(dbReq, function (err, cursor) {
        
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

            // cache the new templates
            var newTemplates = [];
            for (var i = 0, l = templates.length; i < l; ++i) {
                initAndCache(templates[i])
                newTemplates.push(templates[i]._id);
            }

            var newCached = getCachedTemplates(newTemplates, request.role, request.method);
            // merge with initially cached templates
            oldCached.cached = oldCached.cached.concat(newCached.cached);
            
            callback(null, oldCached.cached);
        });
    });
}

// merges a role template configuration into a template but only the allowed fields
function mergeRoleTemplateConfig (template, roleConfig) {
    // TODO this currently only handles top level fields in schema
    //      because the others are flatten
    for (var key in ROLE_CONFIGURABLE_FIELDS) {
        mergeRoleTemplateConfigRecursive(template[key], roleConfig[key]);
    }
}

// TODO add support for:
// - Arrays (currently being overwritten)
// - key removal (currently you must explicitly specify a value)
// - object overwriting (currently the recursion goes to the leaf values)
function mergeRoleTemplateConfigRecursive (template, roleConfig) {
    for (var key in roleConfig) {
        if (typeof roleConfig[key] === 'object' && roleConfig[key].constructor.name !== 'Array') {
            template[key] = template[key] || {};
            mergeRoleTemplateConfigRecursive(template[key], roleConfig[key]);
        } else {
            template[key] = roleConfig[key];
        }
    }
}

function cloneJSON(obj) {
    // basic type deep copy
    if (obj === null || obj === undefined || typeof obj !== 'object')  {
        return obj
    }
    // array deep copy
    if (obj instanceof Array) {
        var cloneA = [];
        for (var i = 0; i < obj.length; ++i) {
            cloneA[i] = cloneJSON(obj[i]);
        }
        return cloneA;
    }
    // object deep copy
    var cloneO = {};
    for (var i in obj) {
        if (!obj.hasOwnProperty(i)) return;

        cloneO[i] = cloneJSON(obj[i]);
    }
    return cloneO;
}


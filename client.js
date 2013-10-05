M.wrap('github/jillix/crud/dev/client.js', function (require, module, exports) {
    
var methods = ['find','remove','update','insert'];
var templateId = '000000000000000000000000';

// cache templates
var templateCache = {};

// merge linked templates
function mergeTemplates (templates) {
    var self = this;
    
    for (var template in templates) {
        for (var link in templates[template].linked) {
            
            if (templateCache[templates[template].linked[link].link]) {
                
                // merge linked schema
                for (var field in templateCache[templates[template].linked[link].link].schema) {
                    if (field[0] !== '_') {
                        templates[template].schema[link + '.' + field] = templateCache[templates[template].linked[link].link].schema[field];
                    }
                }
                
                // hide link field
                templates[template].schema[link].hidden = true;
                templates[template].schema[link].noSearch = true;
            }
            
            // merge linked schema config
            if (templates[template].schema[link].fields) {
                for (var linkedField in templates[template].schema[link].fields) {
                    for (var option in templates[template].schema[link].fields[linkedField]) {
                        templates[template].schema[link + '.' + linkedField][option] = templates[template].schema[link].fields[linkedField][option];
                    }
                }
            }
        }
    }
}

// TODO callback buffering
function templateHandler (templates, callback, ignoreLinks) {
    var self = this;
    
    // check callback
    if (typeof callback !== 'function') {
        return;
    }
    
    // collect templates from linked schema fields
    var linkedTemplates = [];
    
    for (var i = 0, l = templates.length, _id; i < l; ++i) {
        
        _id = templates[i]._id;
        
        if (!templateCache[_id]) {
            
            // save template in cache
            templateCache[_id] = templates[i];
            
            if (!ignoreLinks) {
                templates[i].linked = {};
                for (var field in templates[i].schema) {
                    
                    // collect linked templates
                    if (templates[i].schema[field].link) {
                        templates[i].linked[field] = templates[i].schema[field];
                        linkedTemplates.push(templates[i].schema[field].link);
                    }
                }
            }
        }
    }
    
    // fetch linked templates
    if (linkedTemplates.length > 0) {
        fetchTemplates.call(self, linkedTemplates, function (err) {
            
            if (err) {
                return callback(err);
            }
            
            mergeTemplates(templates);
            
            callback(null, templates);
        
        // ignore fetching linked templates on linked templates (only 1 level)
        }, true);
    } else {
        callback(null, templates);
    }
}

function getTemplatesArray (query) {
    
    // fetch a single tempalte
    if (typeof query._id === 'string') {
        return [query._id];
    }
    
    // fetch multiple templates
    if (query._id.$in) {
        return query._id.$in;
    }
    
    return query;
}

function fetchTemplates (data, callback, ignoreLinks) {
    var self = this;
    
    // TODO handle caching
    if (data instanceof Array) {
        data = {
            t: templateId,
            q: {_id: {$in: data}}
        };
    }
    
    self.link('find', {data: data}, function (err, templates) {
        
        if (err) {
            return callback(err);
        }
        
        templateHandler.call(self, templates, callback, ignoreLinks);
    });
}

var miidCache = {};

function methodHandler (self, method) {
    return function (data, callback) {
        if (typeof data === 'function' || !data) {
            return;
        }
        
        // handle template requests
        if (method === 'find' && (data instanceof Array || data.t === templateId)) {
            return fetchTemplates.call(self, data, callback);
        }
        
        self.link(method, {data: data}, callback);
    };
}

function listenHandler (self) {
    return function (listenMiids) {
        setupListen.call(self, listenMiids);
    };
}

function setupListen (listen) {
    var self = this;
    
    // listen to crud events
    if (listen instanceof Array) {
        for (var i = 0, l = listen.length; i < l; ++i) {
            
            // skip if crud already listen
            if (miidCache[listen[i]]) {
                continue;
            }
            
            miidCache[listen[i]] = 1;
            
            for (var ii = 0, ll = methods.length; ii < ll; ++ii) {
                self.on(methods[ii], listen[i], methodHandler(self, methods[ii]));
            }
            
            self.on('listenTo', listen[i], listenHandler(self));
        }
    }
}

function init (config) {
    var self = this;
    
    // listen to crud events
    setupListen.call(self, config.listen);

    self.emit('ready');
}

module.exports = init;


return module; });

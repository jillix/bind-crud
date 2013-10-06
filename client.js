M.wrap('github/jillix/crud/test/client.js', function (require, module, exports) {

var Flow = require('github/adioo/flow');
var templateId = '000000000000000000000000';
var templateCache = {};

// merge linked templates
function mergeTemplates (templates, callback) {
    var self = this;
    
    for (var i = 0, l = templates.length, template; i < l; ++i) {
        for (var link in templates[i].linked) {
            
            template = templates[i].linked[link].link;
            
            if (templateCache[template]) {
                
                // merge linked schema
                for (var field in templateCache[template].schema) {
                    if (field[0] !== '_') {
                        templates[i].schema[link + '.' + field] = templateCache[template].schema[field];
                    }
                }
                
                // hide link field
                templates[i].schema[link].hidden = true;
                templates[i].schema[link].noSearch = true;
                
                // merge linked schema config
                if (templates[i].schema[link].fields) {
                    for (var linkedField in templates[i].schema[link].fields) {
                        for (var option in templates[i].schema[link].fields[linkedField]) {
                            templates[i].schema[link + '.' + linkedField][option] = templates[i].schema[link].fields[linkedField][option];
                        }
                    }
                }
            } else {
                return callback(new Error('Template ' + template + ' not in cache.'));
            }
        }
    }
    
    callback(null, templates);
}

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
            
            mergeTemplates(templates, callback);
        
        // ignore fetching linked templates on linked templates (only 1 level)
        }, true);
    } else {
        callback(null, templates);
    }
}

// TODO handle caching
// TODO callback buffering
function fetchTemplates (data, callback, ignoreLinks) {
    var self = this;
    
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

var publicMethods = {
    _find: function (data, callback) {
        var self =  this;
        
        // handle template requests
        if (data instanceof Array || data.t === templateId) {
            return fetchTemplates.call(self, data, callback);
        }
        
        self.link('find', {data: data}, callback);
    },
    _remove: function (data, callback) {
        var self = this;
        self.link('remove', {data: data}, callback);
    },
    _update: function (data, callback) {
        var self = this;
        self.link('update', {data: data}, callback);
    },
    _insert: function (data, callback) {
        var self = this;
        self.link('insert', {data: data}, callback);
    }
};

function init (config) {
    var self = this;
    
    Flow(self, publicMethods, null, config.flow);

    self.emit('ready');
}

module.exports = init;

return module; });

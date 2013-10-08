M.wrap('github/jillix/crud/dev/client.js', function (require, module, exports) {

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
                return callback(new Error(self.miid + '|crud: Template ' + template + ' not in cache.'));
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
    
    self.link('read', {data: data}, function (err, templates) {
        
        if (err) {
            return callback(err);
        }
        
        templateHandler.call(self, templates, callback, ignoreLinks);
    });
}

function setTemplateHandler (template, noRefresh) {
    var self = this;
    
    // save current template
    self.template = templates[0];
    
    if (!noRefresh) {
        self.emit('refresh');
    }
    
    self.emit('templateSet', self.template);
}

function setTemplate (template, noRefresh) {
    var self = this;
    
    // check cache
    if (templateCache[template]) {
        return setTemplateHandler.call(self, [templateCache[template]], noRefresh);
    }
    
    // fetch template
    self.emit('read', [template], function (err, templates) {
        
        if (err || !templates || !templates[0]) {
            return self.emit('crudError', err || new Error(self.miid + '|crud: Template not found.'));
        }
        
        setTemplateHandler.call(self, templates, noRefresh);
    });
}

function handler (method, data, callback) {
    var self = this;
    
    // check query data
    if (!data) {
        return self.emit('crudError', err || new Error(self.miid + '|crud: No data for query.'));
    }
    
    // check if a template id is available
    if (!data.t && (!self.template || !self.template._id)) {
        return callback(err || new Error(self.miid + '|crud: No template id for query.'));
    }
    
    // get template id for request
    data.t = data.t || self.template._id;
    
    // do request
    self.link(method, {data: data}, callback);
}

exports.handler = handler;
exports.fetchTemplates = fetchTemplates;
exports.setTemplate = setTemplate;
exports.templateId = templateId;

return module; });

var templateId = '000000000000000000000000';
var templateCache = {};

// merge linked templates
function mergeTemplates (templates, callback) {
    var self = this;
    
    for (var i = 0, l = templates.length, template; i < l; ++i) {
        for (var link in templates[i].linked) {
            
            template = templates[i].linked[link].link;
            
            if (templateCache[template]) {
                
                // hide link field
                templates[i].schema[link].hidden = true;
                templates[i].schema[link].noSearch = true;

                // compute the field policies which defaults to:
                // - overwrite fields (only the specified)
                // - merge field (merge field propertis)
                var mergeFields = templates[i].schema[link].mergeFields = templates[i].schema[link].mergeFields || false;
                var overwriteField = templates[i].schema[link].overwriteField = templates[i].schema[link].overwriteField || false;

                // TODO Since fields containing dots cannot be stored in mongo, we save them with comma instead.
                //      Here we change back from comma to dot.
                if (templates[i].schema[link].fields) {
                    for (var linkedField in templates[i].schema[link].fields) {
                        if (linkedField.indexOf(',') > -1) {
                            templates[i].schema[link].fields[linkedField.replace(/,/g, '.')] = templates[i].schema[link].fields[linkedField];
                            delete templates[i].schema[link].fields[linkedField];
                        }
                    }
                }

                // MERGE fields
                if (mergeFields) {

                    // copy linked schema
                    for (var field in templateCache[template].schema) {
                        if (field[0] !== '_') {
                            templates[i].schema[link + '.' + field] = JSON.parse(JSON.stringify(templateCache[template].schema[field]));
                        }
                    }

                    if (templates[i].schema[link].fields) {

                        for (var linkedField in templates[i].schema[link].fields) {
                            // OVERWRITE field
                            if (overwriteField) {
                                templates[i].schema[link + '.' + linkedField] = templates[i].schema[link].fields[linkedField];
                            }
                            // MERGE field
                            else {
                                for (var option in templates[i].schema[link].fields[linkedField]) {
                                    templates[i].schema[link + '.' + linkedField][option] = templates[i].schema[link].fields[linkedField][option];
                                }
                            }
                        }
                    }
                }
                // OVERWRITE fields
                else {
                    if (templates[i].schema[link].fields) {
                        // OVERWRITE field
                        if (overwriteField) {
                            for (var linkedField in templates[i].schema[link].fields) {
                                // do not accept fields that do not exist in the original linked schema
                                if (!templateCache[template].schema[linkedField]) {
                                    continue;
                                }
                                // just copy the oricinal field schema
                                templates[i].schema[link + '.' + linkedField] = templateCache[template].schema[field];
                            }
                        }
                        // MERGE field
                        else {
                            for (var linkedField in templates[i].schema[link].fields) {
                                // do not accept fields that do not exist in the original linked schema
                                if (!templateCache[template].schema[linkedField]) {
                                    continue;
                                }

                                // get the original schema only for the wanted fields
                                templates[i].schema[link + '.' + linkedField] = templateCache[template].schema[linkedField];

                                // merge/extend the field with the link schema options
                                for (var option in templates[i].schema[link].fields[linkedField]) {
                                    templates[i].schema[link + '.' + linkedField][option] = templates[i].schema[link].fields[linkedField][option];
                                }
                            }
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

// TODO callback buffering
function fetchTemplates (data, callback, ignoreLinks) {
    var self = this;
    
    if (!data) {
        return callback(new Error(self.miid + '|crud: Crud object is needed to fetch tempaltes'));
    }
    
    if (data instanceof Array) {
        data = {
            t: templateId,
            q: {
                _id: {
                    $in: data
                }
            }
        };
    }

    // handle cached templates
    if (data.q && data.q._id && data.q._id.$in) {
        var cached = [];
        var query = [];
        for (var i = 0, l = data.q._id.$in.length; i < l; ++i) {
            if (templateCache[data.q._id.$in[i]]) {
                cached[i] = templateCache[data.q._id.$in[i]];
            } else {
                cached[i] = data.q._id.$in[i];
                query.push(data.q._id.$in[i]);
            }
        }
        
        if (query.length === 0) {
            return templateHandler.call(self, cached, callback, ignoreLinks);
        } else {
            data.q._id.$in = query;
        }
    }
    
    self.link('read', {data: data}, function (err, templates) {
        
        if (err || data.noMerge) {
            return callback(err, templates);
        }
        
        // add fetched templates to cached
        if (data.q && data.q._id && data.q._id.$in) {
            for (var i = 0, l = templates.length; i < l; ++i) {
                for (var ii = 0, ll = cached.length; ii < ll; ++ii) {
                    if (typeof cached[ii] === 'string' && cached[ii] === templates[i]._id) {
                        cached[ii] = templates[i];
                    }
                }
            }
            
            templates = cached;
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
        return self.emit('crudError', new Error(self.miid + '|crud: No data for query.'));
    }
    
    // check if a template id is available
    if (!data.t && (!self.template || !self.template._id)) {
        return callback(new Error(self.miid + '|crud: No template id for query.'));
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
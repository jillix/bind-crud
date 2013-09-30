M.wrap('github/jillix/crud/dev/client.js', function (require, module, exports) {
    
var methods = ['find','remove','update','insert'];

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
    
    return templates;
}

// TODO callback buffering
function templateHandler (templates, callback) {
    var self = this;
    
    // check callback
    if (typeof callback !== 'function') {
        return;
    }
    
    // collect cached templates and templates to load.
    var resultTemplates = {};
    var templatesToFetch = [];
    for (var i = 0, l = templates.length; i < l; ++i) {
        if (templateCache[templates[i]]) {
            resultTemplates[templates[i]] = templateCache[templates[i]];
        } else {
            templatesToFetch.push(templates[i]);
        }
    }
    
    // fetch templates from server
    if (templates.length === 0 || templatesToFetch.length > 0) {
        self.link('getTemplates', {data: templatesToFetch}, function (err, templates) {

            if (err) {
                return callback(err);
            }
            
            var linkedTemplates = [];
            
            // merge fetched templates into result templates
            for (var template in templates) {
                
                resultTemplates[template] = templateCache[template] = templates[template];
                
                for (var field in templates[template].schema) {
                    
                    // collect linked templates
                    if (templates[template].schema[field].link) {
                        linkedTemplates.push(templates[template].schema[field].link);
                    }
                }
            }
            
            // fetch linked templates
            if (linkedTemplates.length > 0) {
                templateHandler.call(self, linkedTemplates, function (err) {
                    
                    if (err) {
                        return callback(err);
                    }
                    
                    mergeTemplates(templates);
                    
                    callback(null, resultTemplates);
                });
            } else {
                callback(null, resultTemplates);
            }
        });
        
    // return cached templates
    } else {
        callback(null, resultTemplates);
    }
};

var miidCache = {};

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
                self.on(methods[ii], listen[i], (function (method) {    
                    return function (data, callback) {
                        if (typeof data === 'function') {
                            callback = data;
                            data = null;
                        }
                        self.link(method, {data: data}, callback);
                    };
                })(methods[ii]));
            }
            
            self.on('getTemplates', listen[i], function (templates, callback) {
                templateHandler.call(self, templates, callback);
            });
            
            self.on('listenTo', listen[i], function (listenMiids) {
                setupListen.call(self, listenMiids);
            });
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

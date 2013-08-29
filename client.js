M.wrap('github/jillix/bind-crud/dev/client.js', function (require, module, exports) {
var methods = ['find','remove','update','insert'];

// cache templates
var templateCache = {};

// TODO callback buffering
function templateHandler (templates, callback) {
    var self = this;
    
    // check callback
    if (typeof callback !== 'function') {
        return;
    }
    
    var resultTemplates = {};
    var templatesToFetch = [];
    for (var i = 0, l = templates.length; i < l; ++i) {
        if (templateCache[templates[i]]) {
            resultTemplates[templates[i]] = templateCache[templates[i]];
        } else {
            templatesToFetch.push(templates[i]);
        }
    }
    
    if (templates.length === 0 || templatesToFetch.length > 0) {
        self.link('getTemplates', {data: templatesToFetch}, function (err, templates) {

            if (err) {
                return callback(err);
            }
            
            // merge fetched templates into result templates
            for (var template in templates) {
               templateCache[template] = resultTemplates[template] = templates[template];
            }
            
            callback(null, resultTemplates);
        });
    } else {
        callback(null, resultTemplates);
    }
};

function init (config) {
    var self = this;
    
    // listen to crud events
    if (config.listen instanceof Array) {
        for (var i = 0, l = config.listen.length; i < l; ++i) {
            for (var ii = 0, ll = methods.length; ii < ll; ++ii) {
                self.on(methods[ii], config.listen[i], (function (method) {    
                    return function (data, callback) {
                        if (typeof data === 'function') {
                            callback = data;
                            data = null;
                        }
                        self.link(method, {data: data}, callback);
                    };
                })(methods[ii]));
            }
            
            self.on('getTemplates', config.listen[i], function (templates, callback) {
                templateHandler.call(self, templates, callback);
            });
        }
    }
    
    self.emit('ready');
}

module.exports = init;


return module; });

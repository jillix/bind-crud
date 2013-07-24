M.wrap('github/jillix/bind-crud/dev/client.js', function (require, module, exports) {
var methods = ['find','remove','update','insert', 'getTemplates'];

function init (config) {
    var self = this;
    
    // listen to crud events
    if (config.listen instanceof Array) {
        for (var i = 0, l = config.listen.length; i < l; ++i) {
            for (var ii = 0, ll = methods.length; ii < ll; ++ii) {
                self.on(methods[ii], config.listen[i], (function (method) {    
                    return function (data, callback) {
                        if (typeof data === 'object') {
                            self.link(method, {data: data}, callback);
                        }
                    };
                })(methods[ii]));
            }
        }
    }
    
    self.emit('ready');
}

module.exports = init;


return module; });
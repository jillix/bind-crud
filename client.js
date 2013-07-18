M.wrap('github/jillix/bind-crud/dev/client.js', function (require, module, exports) {
var methods = ['find','remove','update','insert', 'getTypes'];

function init (config) {
    
    var self = this;
    
    // add events
    if (config.listen instanceof Array) {
        for (var i = 0, l = config.listen.length; i < l; ++i) {
            for (var ii = 0, ll = methods.length; ii < ll; ++ii) {
                self.on(methods[ii], config.listen[i], (function (method) {    
                    
                    // listen to getTypes event
                    if (method === 'getTypes') {
                        return function (type, callback) {
                            if (typeof type !== 'string' && type.length > 0) {
                                return callback('Invalid type.');
                            }
                            
                            self.link(method + '/' + type);
                        };
                    }
                    
                    // listen to crud events
                    return function (query, callback) {
                        if (query && !(query instanceof Array) && typeof query === 'object') {
                            self.link(method, {data: query}, callback);
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
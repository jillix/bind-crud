var methods = ['find','remove','update','insert'];

function init (config) {
    
    var self = this;
    
    methods = config.methods || methods;
    
    // add events
    for (var i = 0, l = methods.length; i < l; ++i) {
        self.on(methods[i], (function (method) {
            return function (query, callback) {
                if (query && !(query instanceof Array) && typeof query === 'object') {
                    self.link(method, {data: query}, callback);
                }
            }
        })(methods[i]));
    }
}

module.exports = init;


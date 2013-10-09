M.wrap('github/jillix/crud/dev/crud.js', function (require, module, exports) {

var Flow = require('github/adioo/flow');
var client = require('./client');

var methods = {
    read: function (data, callback) {
        var self =  this;
        
        // handle template requests
        if (data instanceof Array || data.t === client.templateId) {
            return client.fetchTemplates.call(self, data, callback);
        }
        
        client.handler.call(self, 'read', data, callback);
    },
    'delete': function (data, callback) {
        client.handler.call(this, 'delete', data, callback);
    },
    update: function (data, callback) {
        client.handler.call(this, 'update', data, callback);
    },
    create: function (data, callback) {
        client.handler.call(this, 'create', data, callback);
    },
    
    setTemplate: client.setTemplate,
    getTemplate: function () {
        var self = this;
        return self.template;
    },
    // TODO remove this when crud-links uses crud as library
    addFlow: function (config) {
        var self = this;
        
        Flow(self, null, config);
    }
};

function init (eventFlow) {
    var self = this;
    
    Flow(self, methods, eventFlow);

    self.emit('ready');
}

module.exports = init;

return module; });

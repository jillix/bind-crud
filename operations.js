var model = require('./model');
var templates = require('./templates');

exports.find = function (link) {
    model('find', link);
};

exports.remove = function (link) {
    model('remove', link);
};

exports.update = function (link) {
    model('update', link);
};

exports.insert = function (link) {
    model('insert', link);
};

exports.getTemplates = function (link) {
    templates.getTemplates(link.data, link.session.crudRole, function (err, templates) {
        
        if (err) {
            return link.send(err.statusCode || 500, err.message);
        }
        
        link.send(200, templates);
    });
}

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

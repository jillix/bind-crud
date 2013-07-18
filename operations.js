var model = require('./model');
var types = require('./types');

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

exports.getTypes = function (link) {
    types.getTypes(link);
}
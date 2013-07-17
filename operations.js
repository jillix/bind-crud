var model = require('./model');

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

exports.getType = function (link) {
    link.send(501, 'Not (yet) implemented');
}
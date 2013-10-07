var model = require('./model');

// operations
exports.read = function (link) {
    model('read', link);
};

exports.delete = function (link) {
    model('delete', link);
};

exports.update = function (link) {
    model('update', link);
};

exports.create = function (link) {
    model('create', link);
};

// listeners
M.on('crud_read', function (link) {
    model('create', link);
});

M.on('crud_delete', function (link) {
    model('delete', link);
});

M.on('crud_update', function (link) {
    model('update', link);
});

M.on('crud_create', function (link) {
    model('create', link);
});

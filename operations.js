var model = require('./model');

// operations
exports.create = function (link) {
    model('create', link);
};

exports.read = function (link) {
    model('read', link);
};

exports['delete'] = function (link) {
    model('delete', link);
};

exports.update = function (link) {
    model('update', link);
};

// listeners
M.on('crud_create', function (link) {
    model('create', link);
});

M.on('crud_read', function (link) {
    model('read', link);
});

M.on('crud_update', function (link) {
    model('update', link);
});

M.on('crud_delete', function (link) {
    model('delete', link);
});


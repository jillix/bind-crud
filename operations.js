var model = require('./model');
var templates = require('./templates');

exports.find = function (link) {
    if (link.data.t === "_list") {
        link.send(200, [
            {
                    "_id" : "51f13029f77a09097eac5f19",
                    "name" : "Folder A",
                    "type" : "folder",
                    "_ln" : [
                            {
                                    "_tp" : "_template",
                                    "_id" : "user"
                            }
                    ]
            },
            {
                    "_id" : "51f13031f77a09097eac5f1a",
                    "name" : "Folder B",
                    "type" : "folder",
                    "_ln" : [
                            {
                                    "_tp" : "_template",
                                    "_id" : "user"
                            }
                    ]
            },
            {
                    "_id" : "51f13037f77a09097eac5f1b",
                    "name" : "Folder C",
                    "type" : "folder",
                    "_ln" : [
                            {
                                    "_tp" : "_template",
                                    "_id" : "user"
                            }
                    ]
            },
            {
                    "_id" : "51f13087f77a09097eac5f1c",
                    "name" : "Filtered 1",
                    "type" : "filtered",
                    "_ln" : [
                            {
                                    "_tp" : "_template",
                                    "_id" : "user"
                            },
                            {
                                    "_tp" : "_list",
                                    "_id" : "51f13031f77a09097eac5f1a"
                            }
                    ]
            }
        ]);
        return;
    }
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
    templates.getTemplates(link);
}
